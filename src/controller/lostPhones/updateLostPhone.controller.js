import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { isValidNumericId } from "../../utils/validators.js";
import { CACHE_KEYS } from "../../config/cache.js";
import { deleteCache, deleteByPattern } from "../../services/cache.service.js";

// @Desc تعديل بيانات بلاغ هاتف مفقود مع التحقق من الملكية
// @Route PATCH /api/lost-phones/:id
// @Access Private (Owner or Admin)
export const updateLostPhone = AsyncHandler(async (req, res, next) => {
    const reportId = Number(req.params.id);

    // 1. التحقق من صحة المعرف الرقمي
    if (!isValidNumericId(reportId)) {
        return next(new ApiError("معرف البلاغ غير صالح", 400));
    }

    // 2. التحقق من وجود البلاغ في قاعدة البيانات
    const { data: existingReport, error: checkError } = await supabase
        .from("lost_phones")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();

    if (checkError) {
        return next(new ApiError("فشل في استعلام بلاغ الهاتف", 500));
    }

    if (!existingReport) {
        return next(new ApiError("بلاغ الهاتف غير موجود", 404));
    }

    // 3. التحقق من ملكية البلاغ: المحل التجاري يعدل بلاغاته فقط، والمسؤول يعدل أي بلاغ
    const isAdmin = req.user.role === "admin";
    const isOwner = req.user.id === existingReport.created_by;

    if (!isAdmin && !isOwner) {
        return next(new ApiError("ليس لديك صلاحية لتعديل هذا البلاغ", 403));
    }

    // 4. استخراج الحقول القابلة للتعديل فقط وحماية الحقول الداخلية والحالات
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

    const updatePayload = {
        ...(brand !== undefined && { brand: brand.trim() }),
        ...(model !== undefined && { model: model.trim() }),
        ...(serial_number !== undefined && { serial_number: serial_number || null }),
        ...(imei !== undefined && { imei: imei || null }),
        ...(imei2 !== undefined && { imei2: imei2 || null }),
        ...(color !== undefined && { color: color || null }),
        ...(storage !== undefined && { storage: storage || null }),
        ...(description !== undefined && { description: description || null }),
        ...(contact !== undefined && { contact: contact || null }),
        ...(contact2 !== undefined && { contact2: contact2 || null }),
        updated_at: new Date().toISOString(),
    };

    // 5. تنفيذ التحديث في قاعدة البيانات
    const { data: updatedReport, error: updateError } = await supabase
        .from("lost_phones")
        .update(updatePayload)
        .eq("id", reportId)
        .select("*, phone_images(*)")
        .single();

    if (updateError || !updatedReport) {
        return next(new ApiError("فشل في تحديث بيانات البلاغ", 500));
    }

    // 6. إبطال الكاش المرتبط بالبلاغ والقوائم
    await deleteCache(CACHE_KEYS.LOST_PHONE(reportId));
    await deleteByPattern("lost_phones:*");

    // 7. تسجيل العملية في سجل العمليات والتدقيق (audit_logs)
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

    // 8. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم تحديث بيانات بلاغ الهاتف بنجاح",
        results: updatedReport,
    });
});

export default updateLostPhone;
