import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { isValidNumericId } from "../../utils/validators.js";
import { CACHE_KEYS } from "../../config/cache.js";
import { deleteCache, deleteByPattern } from "../../services/cache.service.js";
import { STORAGE_BUCKETS } from "../../config/storage.js";
import { uploadImage, deleteImage, rollbackUploadedImages } from "../../services/storage.service.js";
import { processImage } from "../../utils/imageUploader.js";

/**
 * دالة مساعدة لاستخراج المسار الداخلي للصورة في Storage من رابطها العام
 */
const extractStoragePath = (imageUrl, bucketName) => {
    if (!imageUrl) return null;
    const bucketPrefix = `/${bucketName}/`;
    if (imageUrl.includes(bucketPrefix)) {
        return imageUrl.split(bucketPrefix)[1];
    }
    if (imageUrl.includes("phones/")) {
        return imageUrl.substring(imageUrl.indexOf("phones/"));
    }
    return null;
};

// @Desc تعديل بيانات بلاغ هاتف مفقود مع إضافة/حذف صور والتحقق من الملكية
// @Route PATCH /api/lost-phones/:id
// @Access Private (Owner or Admin)
export const updateLostPhone = AsyncHandler(async (req, res, next) => {
    const reportId = Number(req.params.id);

    // 1. التحقق من صحة المعرف الرقمي
    if (!isValidNumericId(reportId)) {
        return next(new ApiError("معرف البلاغ غير صالح", 400));
    }

    // 2. التحقق من وجود البلاغ في قاعدة البيانات بجلب الحقول الأساسية فقط للسرعة والكفاءة
    const { data: existingReport, error: checkError } = await supabase
        .from("lost_phones")
        .select("id, status, is_deleted, created_by")
        .eq("id", reportId)
        .maybeSingle();

    if (checkError) {
        return next(new ApiError("فشل في استعلام بلاغ الهاتف", 500));
    }

    if (!existingReport) {
        return next(new ApiError("بلاغ الهاتف غير موجود", 404));
    }

    // التحقق من الحذف المنطقي: لا يمكن تعديل بلاغ محذوف
    if (existingReport.is_deleted === true) {
        return next(new ApiError("بلاغ الهاتف غير موجود أو تم حذفه", 404));
    }

    // 3. التحقق من ملكية البلاغ: المحل التجاري يعدل بلاغاته فقط، والمسؤول يعدل أي بلاغ
    const isAdmin = req.user?.role === "admin";
    const isOwner =
        req.user &&
        existingReport.created_by &&
        String(req.user.id).toLowerCase() === String(existingReport.created_by).toLowerCase();

    if (!isAdmin && !isOwner) {
        return next(new ApiError("ليس لديك صلاحية لتعديل هذا البلاغ", 403));
    }

    // 4. استخراج الحقول النصية ومعرفات الصور المراد حذفها
    const {
        brand,
        model,
        serial_number,
        imei,
        imei2,
        color,
        storage,
        description,
        contact,
        contact2,
        status,
        reason,
        delete_image_ids,
        replace_images,
    } = req.body;

    const files = req.files || [];

    // 5. جلب معرفات وروابط وحالة غلاف الصور الحالية فقط للتحقق من الملكية وحدود العدد
    const { data: currentImages, error: fetchImagesError } = await supabase
        .from("phone_images")
        .select("id, image_url, is_primary")
        .eq("phone_id", reportId);

    if (fetchImagesError) {
        return next(new ApiError("فشل في استعلام صور البلاغ الحالية", 500));
    }

    const currentImagesList = Array.isArray(currentImages) ? currentImages : [];
    const currentImageMap = new Map(currentImagesList.map((img) => [img.id, img]));

    // إذا طُلب استبدال الصور كاملة (replace_images)، تُحذف كافة الصور القديمة تلقائياً
    let deleteIds = Array.isArray(delete_image_ids) ? [...delete_image_ids] : [];
    if (replace_images === true || replace_images === "true" || replace_images === "1") {
        deleteIds = currentImagesList.map((img) => img.id);
    }

    // التحقق من أن جميع الصور المطلوب حذفها تنتمي للبلاغ الحالي
    for (const imgId of deleteIds) {
        if (!currentImageMap.has(imgId)) {
            return next(new ApiError(`الصورة رقم ${imgId} غير موجودة أو لا تنتمي لهذا البلاغ`, 400));
        }
    }

    // التحقق من الحد الأقصى للصور (5 صور كحد أقصى للبلاغ)
    const remainingCount = currentImagesList.length - deleteIds.length;
    const totalAfterUpdate = remainingCount + files.length;
    if (totalAfterUpdate > 5) {
        return next(new ApiError("لا يمكن أن يتجاوز إجمالي عدد صور البلاغ 5 صور", 400));
    }

    const now = new Date().toISOString();
    let statusMetadata = {};

    // معالجة تغيير الحالة إذا تم إرسالها ضمن التحديث
    if (status && status !== existingReport.status) {
        if (status === "hidden" && !isAdmin) {
            return next(new ApiError("فقط المسؤول (Admin) يملك صلاحية إخفاء البلاغ", 403));
        }

        if (status === "lost" && !isAdmin && existingReport.status !== "found") {
            return next(
                new ApiError(
                    "لا يمكن للمستخدم إعادة البلاغ إلى مفقود إلا إذا كان في حالة تم العثور عليه (found)",
                    403
                )
            );
        }

        if (status === "found") {
            statusMetadata = {
                status,
                found_at: now,
                found_by: req.user.id,
                hidden_at: null,
                hidden_by: null,
            };
        } else if (status === "hidden") {
            statusMetadata = {
                status,
                hidden_at: now,
                hidden_by: req.user.id,
            };
        } else if (status === "lost") {
            statusMetadata = {
                status,
                found_at: null,
                found_by: null,
                hidden_at: null,
                hidden_by: null,
            };
        }
    }

    // 6. تحديث الحقول النصية للبلاغ في جدول lost_phones
    const updatePayload = {
        ...(brand !== undefined && { brand: String(brand).trim() }),
        ...(model !== undefined && { model: String(model).trim() }),
        ...(serial_number !== undefined && {
            serial_number: serial_number ? String(serial_number).trim() : null,
        }),
        ...(imei !== undefined && { imei: imei ? String(imei).trim() : null }),
        ...(imei2 !== undefined && { imei2: imei2 ? String(imei2).trim() : null }),
        ...(color !== undefined && { color: color ? String(color).trim() : null }),
        ...(storage !== undefined && { storage: storage ? String(storage).trim() : null }),
        ...(description !== undefined && {
            description: description ? String(description).trim() : null,
        }),
        ...(contact !== undefined && { contact: contact ? String(contact).trim() : null }),
        ...(contact2 !== undefined && { contact2: contact2 ? String(contact2).trim() : null }),
        ...statusMetadata,
        updated_at: now,
    };

    const { data: updatedReport, error: updateError } = await supabase
        .from("lost_phones")
        .update(updatePayload)
        .eq("id", reportId)
        .select()
        .single();

    if (updateError || !updatedReport) {
        return next(new ApiError("فشل في تحديث بيانات البلاغ", 500));
    }

    // 7. حذف الصور المحددة في delete_image_ids من قاعدة البيانات ومن Storage
    if (deleteIds.length > 0) {
        const imagesToDelete = deleteIds.map((id) => currentImageMap.get(id)).filter(Boolean);

        const { error: deleteDbError } = await supabase
            .from("phone_images")
            .delete()
            .in("id", deleteIds);

        if (deleteDbError) {
            return next(new ApiError("فشل في حذف سجلات الصور القديمة من قاعدة البيانات", 500));
        }

        // حذف الملفات من التخزين (Storage cleanup)
        for (const img of imagesToDelete) {
            const filePath = extractStoragePath(img.image_url, STORAGE_BUCKETS.PHONE_IMAGES);
            if (filePath) {
                await deleteImage(STORAGE_BUCKETS.PHONE_IMAGES, filePath);
            }
        }
    }

    // 8. رفع وحفظ الصور الجديدة مع آلية التعويض والتراجع (Compensating Cleanup / Rollback)
    const uploadedFilePaths = [];
    if (files.length > 0) {
        const remainingImagesAfterDelete = currentImagesList.filter((img) => !deleteIds.includes(img.id));
        const hasExistingPrimary = remainingImagesAfterDelete.some((img) => img.is_primary);

        try {
            const newImageRecords = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const { fileName, buffer: processedBuffer } = await processImage(file.buffer);
                const storagePath = `phones/${reportId}/${fileName}`;

                const uploaded = await uploadImage(
                    STORAGE_BUCKETS.PHONE_IMAGES,
                    storagePath,
                    processedBuffer,
                    "image/webp"
                );

                uploadedFilePaths.push(storagePath);

                const isPrimary = !hasExistingPrimary && i === 0;
                newImageRecords.push({
                    phone_id: reportId,
                    image_url: uploaded.publicUrl,
                    is_primary: isPrimary,
                });
            }

            const { error: insertImgError } = await supabase
                .from("phone_images")
                .insert(newImageRecords);

            if (insertImgError) {
                throw new Error(`فشل في حفظ بيانات الصور الجديدة: ${insertImgError.message}`);
            }
        } catch (imgErr) {
            // تراجع عن الملفات المرفوعة في التخزين عند حدوث أي خطأ
            if (uploadedFilePaths.length > 0) {
                await rollbackUploadedImages(STORAGE_BUCKETS.PHONE_IMAGES, uploadedFilePaths);
            }
            return next(new ApiError(imgErr.message || "فشل في رفع ومعالجة الصور الجديدة", 500));
        }
    }

    // 9. ضمان وجود صورة رئيسية (is_primary) واحدة على الأقل إذا كانت هناك صور للبلاغ
    const { data: finalImages } = await supabase
        .from("phone_images")
        .select("*")
        .eq("phone_id", reportId)
        .order("id", { ascending: true });

    const finalImagesList = Array.isArray(finalImages) ? finalImages : [];
    if (finalImagesList.length > 0 && !finalImagesList.some((img) => img.is_primary)) {
        await supabase
            .from("phone_images")
            .update({ is_primary: true })
            .eq("id", finalImagesList[0].id);
        finalImagesList[0].is_primary = true;
    }

    // 10. تسجيل تاريخ تغيير الحالة إذا تم تغييرها
    if (status && status !== existingReport.status) {
        try {
            await supabase.from("report_status_history").insert({
                phone_id: reportId,
                old_status: existingReport.status,
                new_status: status,
                changed_by: req.user.id,
                reason: reason || `تعديل الحالة من خلال تحديث البلاغ`,
            });
        } catch (historyErr) {
            console.error("⚠️ فشل في تسجيل تاريخ تغيير الحالة:", historyErr.message);
        }
    }

    // 11. إبطال الكاش المرتبط بالبلاغ والقوائم وإحصائيات الداشبورد
    await deleteCache(CACHE_KEYS.LOST_PHONE(reportId));
    await deleteByPattern("lost_phones:*");
    await deleteByPattern("dashboard:*");

    // 12. تسجيل العملية في سجل العمليات والتدقيق (audit_logs)
    try {
        let clientIp = req.ip || req.socket?.remoteAddress || null;
        if (clientIp === "::1" || clientIp === "127.0.0.1") clientIp = "127.0.0.1";

        await supabase.from("audit_logs").insert({
            user_id: req.user.id,
            action: "UPDATE_LOST_PHONE",
            entity_type: "lost_phones",
            entity_id: reportId,
            old_data: existingReport,
            new_data: updatedReport,
            ip_address: clientIp,
            user_agent: req.get("user-agent") || null,
        });
    } catch (auditError) {
        console.error("⚠️ فشل تسجيل العملية في audit_logs:", auditError.message);
    }

    // 13. إرجاع الرد القياسي شاملاً الصور النهائية
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم تحديث بيانات بلاغ الهاتف بنجاح",
        results: {
            ...updatedReport,
            phone_images: finalImagesList,
        },
    });
});

export default updateLostPhone;
