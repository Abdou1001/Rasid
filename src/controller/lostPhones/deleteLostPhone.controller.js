import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { isValidNumericId } from "../../utils/validators.js";
import { CACHE_KEYS } from "../../config/cache.js";
import { deleteCache, deleteByPattern } from "../../services/cache.service.js";

// @Desc الحذف المنطقي لبلاغ هاتف مفقود (Soft Delete)
// @Route DELETE /api/lost-phones/:id
// @Access Private (Owner or Admin)
export const deleteLostPhone = AsyncHandler(async (req, res, next) => {
    const reportId = Number(req.params.id);

    // 1. التحقق من صحة المعرف الرقمي
    if (!isValidNumericId(reportId)) {
        return next(new ApiError("معرف البلاغ غير صالح", 400));
    }

    // 2. التحقق من وجود البلاغ في قاعدة البيانات
    const { data: existingReport, error: checkError } = await supabase
        .from("lost_phones")
        .select("is_deleted,id,created_by")
        .eq("id", reportId)
        .maybeSingle();

    if (checkError) {
        return next(new ApiError("فشل في استعلام بلاغ الهاتف", 500));
    }

    if (!existingReport) {
        return next(new ApiError("بلاغ الهاتف غير موجود", 404));
    }

    // 3. التحقق مما إذا كان البلاغ محذوفاً بالفعل مسبقاً
    if (existingReport.is_deleted === true) {
        return next(new ApiError("بلاغ الهاتف محذوف مسبقاً", 400));
    }

    // 4. التحقق من الصلاحيات: صاحب البلاغ أو المسؤول فقط
    const isAdmin = req.user?.role === "admin";
    const isOwner =
        req.user &&
        existingReport.created_by &&
        String(req.user.id).toLowerCase() === String(existingReport.created_by).toLowerCase();

    if (!isAdmin && !isOwner) {
        return next(new ApiError("ليس لديك صلاحية لحذف هذا البلاغ", 403));
    }

    const now = new Date().toISOString();

    // 5. تنفيذ الحذف المنطقي بتحديث is_deleted = true مع تحديث updated_at دون حذف فيزيائي للصور أو السجل
    const { data: updatedReport, error: updateError } = await supabase
        .from("lost_phones")
        .update({
            is_deleted: true,
            updated_at: now,
        })
        .eq("id", reportId)
        .select()
        .single();

    if (updateError || !updatedReport) {
        return next(new ApiError("فشل في حذف بلاغ الهاتف", 500));
    }

    // 6. تسجيل العملية في سجل التدقيق (audit_logs)
    try {
        let clientIp = req.ip || req.socket?.remoteAddress || null;
        if (clientIp === "::1" || clientIp === "127.0.0.1") clientIp = "127.0.0.1";

        await supabase.from("audit_logs").insert({
            user_id: req.user.id,
            action: "DELETE_LOST_PHONE",
            entity_type: "lost_phones",
            entity_id: reportId,
            old_data: existingReport,
            new_data: updatedReport,
            ip_address: clientIp,
            user_agent: req.get("user-agent") || null,
        });
    } catch (auditErr) {
        console.error("⚠️ فشل تسجيل العملية في audit_logs:", auditErr.message);
    }

    // 7. إبطال الكاش الخاص بالبلاغ والقوائم وإحصائيات لوحة التحكم
    await deleteCache(CACHE_KEYS.LOST_PHONE(reportId));
    await deleteByPattern("lost_phones:*");
    await deleteByPattern("dashboard:*");

    // 8. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم حذف بلاغ الهاتف بنجاح",
        results: {
            id: reportId,
            is_deleted: true,
        },
    });
});

export default deleteLostPhone;
