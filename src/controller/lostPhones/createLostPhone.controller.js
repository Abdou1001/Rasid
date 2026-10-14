import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { STORAGE_BUCKETS } from "../../config/storage.js";
import { uploadImage, rollbackUploadedImages } from "../../services/storage.service.js";
import { processImage } from "../../utils/imageUploader.js";
import { deleteByPattern } from "../../services/cache.service.js";

// @Desc إنشاء بلاغ هاتف مفقود جديد (مع صور اختيارية معالجة عبر Sharp)
// @Route POST /api/lost-phones
// @Access Private (Authenticated active users)
export const createLostPhone = AsyncHandler(async (req, res, next) => {
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
    } = req.body;

    const files = req.files || [];
    const uploadedFilePaths = [];
    let createdReportId = null;

    // 1. حساب تاريخ انتهاء الرؤية الافتراضي (12 شهراً = 365 يوماً)
    const visibleUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    try {
        // 3. إنشاء سجل البلاغ الأساسي في قاعدة البيانات
        const { data: newReport, error: reportError } = await supabase
            .from("lost_phones")
            .insert({
                brand: brand.trim(),
                model: model.trim(),
                serial_number: serial_number || null,
                imei: imei || null,
                imei2: imei2 || null,
                color: color || null,
                storage: storage || null,
                description: description || null,
                status: "lost",
                created_by: req.user.id,
                visible_until: visibleUntil,
                contact: contact || null,
                contact2: contact2 || null,
            })
            .select()
            .single();

        if (reportError || !newReport) {
            return next(new ApiError("فشل في إنشاء بلاغ الهاتف المفقود", 500));
        }

        createdReportId = newReport.id;

        // 4. تسجيل الحالة الأولية في سجل تاريخ الحالات (report_status_history)
        await supabase.from("report_status_history").insert({
            phone_id: createdReportId,
            old_status: null,
            new_status: "lost",
            changed_by: req.user.id,
            reason: "إنشاء بلاغ هاتف مفقود جديد",
        });

        // 5. معالجة وضغط الصور باستخدام أداة processImage (Sharp) ورفعها إلى التخزين
        const uploadedImages = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // معالجة وضغط الصورة إلى صيغة WebP بأبعاد وجودة محسنة عبر أداة imageUploader
            const { fileName, buffer: processedBuffer } = await processImage(file.buffer);
            const storagePath = `phones/${createdReportId}/${fileName}`;

            const uploaded = await uploadImage(
                STORAGE_BUCKETS.PHONE_IMAGES,
                storagePath,
                processedBuffer,
                "image/webp"
            );

            uploadedFilePaths.push(storagePath);
            uploadedImages.push({
                phone_id: createdReportId,
                image_url: uploaded.publicUrl,
                is_primary: i === 0, // الصورة الأولى هي الرئيسية
            });
        }

        // 6. ربط الصور بالبلاغ في جدول phone_images
        let insertedImages = [];
        if (uploadedImages.length > 0) {
            const { data: imagesData, error: imagesError } = await supabase
                .from("phone_images")
                .insert(uploadedImages)
                .select();

            if (imagesError || !imagesData) {
                throw new Error("فشل في تسجيل بيانات الصور في قاعدة البيانات");
            }
            insertedImages = imagesData;
        }

        // 7. إبطال الكاش الخاص بقوائم البلاغات وإحصائيات لوحة التحكم
        await deleteByPattern("lost_phones:*");
        await deleteByPattern("dashboard:*");

        // 8. إرجاع الرد القياسي
        return sendSuccess(res, {
            statusCode: 201,
            message: "تم إنشاء بلاغ الهاتف المفقود بنجاح",
            results: {
                ...newReport,
                images: insertedImages,
            },
        });
    } catch (err) {
        // إجراءات التعويض والتراجع (Compensating Cleanup / Rollback)
        console.error("⚠️ خطأ أثناء إنشاء البلاغ، جاري تنفيذ التراجع:", err.message);

        // مسح الملفات المرفوعة من التخزين
        if (uploadedFilePaths.length > 0) {
            await rollbackUploadedImages(STORAGE_BUCKETS.PHONE_IMAGES, uploadedFilePaths);
        }

        // مسح سجل البلاغ المنشأ لمنع ترك بيانات يتيمة (Orphan Records)
        if (createdReportId) {
            await supabase.from("lost_phones").delete().eq("id", createdReportId);
        }

        return next(new ApiError(err.message || "حدث خطأ أثناء معالجة البلاغ والصور", 500));
    }
});

export default createLostPhone;
