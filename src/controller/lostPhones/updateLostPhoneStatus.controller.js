import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { isValidNumericId } from "../../utils/validators.js";
import { CACHE_KEYS } from "../../config/cache.js";
import { deleteCache, deleteByPattern } from "../../services/cache.service.js";

// @Desc تغيير حالة بلاغ الهاتف المفقود (lost, found, hidden) مع تسجيل التواريخ ومستخدم التغيير
// @Route PATCH /api/lost-phones/:id/status
// @Access Private (Admin / Report Owner with rules)
export const updateLostPhoneStatus = AsyncHandler(async (req, res, next) => {
    const phoneId = Number(req.params.id);

    // 1. التحقق من صحة المعرف الرقمي
    if (!isValidNumericId(phoneId)) {
        return next(new ApiError("معرف البلاغ غير صالح", 400));
    }

    const { status, reason } = req.body;

    // 2. التحقق من وجود السجل في قاعدة البيانات بجلب الحقول الأساسية فقط للسرعة والكفاءة
    const { data: existingReport, error: checkError } = await supabase
        .from("lost_phones")
        .select("id, status, is_deleted, created_by")
        .eq("id", phoneId)
        .maybeSingle();

    if (checkError) {
        return next(new ApiError("فشل في استعلام بلاغ الهاتف", 500));
    }

    if (!existingReport) {
        return next(new ApiError("بلاغ الهاتف غير موجود", 404));
    }

    // التحقق من الحذف المنطقي: لا يمكن تغيير حالة بلاغ محذوف
    if (existingReport.is_deleted === true) {
        return next(new ApiError("بلاغ الهاتف غير موجود أو تم حذفه", 404));
    }

    // 3. التحقق من الصلاحيات وقواعد الانتقال بين الحالات
    const isAdmin = req.user.role === "admin";
    const isOwner = req.user.id === existingReport.created_by;

    // فقط المسؤول ومالك البلاغ من يحق لهما إجراء تغييرات
    if (!isAdmin && !isOwner) {
        return next(new ApiError("ليس لديك صلاحية لتعديل حالة هذا البلاغ", 403));
    }

    // البلاغ بالفعل في نفس الحالة
    if (status === existingReport.status) {
        return next(new ApiError(`البلاغ بالفعل في حالة: ${status}`, 400));
    }

    // قاعدة الإخفاء (hidden): فقط المسؤول من يمكنه إخفاء البلاغ
    if (status === "hidden" && !isAdmin) {
        return next(new ApiError("فقط المسؤول (Admin) يملك صلاحية إخفاء البلاغ", 403));
    }

    // قاعدة الإرجاع إلى مفقود (lost): المسؤول يمكنه دائماً، والمالك فقط إذا كان في حالة found
    if (status === "lost" && !isAdmin && existingReport.status !== "found") {
        return next(
            new ApiError(
                "لا يمكن للمستخدم إعادة البلاغ إلى مفقود إلا إذا كان في حالة تم العثور عليه (found)",
                403
            )
        );
    }

    // 4. إعداد بيانات التحديث وحقول التتبع (found_at, found_by, hidden_at, hidden_by)
    const now = new Date().toISOString();
    const updatePayload = {
        status,
        updated_at: now,
    };

    if (status === "found") {
        updatePayload.found_at = now;
        updatePayload.found_by = req.user.id;
        updatePayload.hidden_at = null;
        updatePayload.hidden_by = null;
    } else if (status === "hidden") {
        updatePayload.hidden_at = now;
        updatePayload.hidden_by = req.user.id;
    } else if (status === "lost") {
        updatePayload.found_at = null;
        updatePayload.found_by = null;
        updatePayload.hidden_at = null;
        updatePayload.hidden_by = null;
    }

    // 5. تحديث السجل في جدول lost_phones (باستخدام select مباشر دون دمج العلاقات لتفادي قيود PostgREST)
    const { data: updatedReport, error: updateError } = await supabase
        .from("lost_phones")
        .update(updatePayload)
        .eq("id", phoneId)
        .select()
        .single();

    if (updateError || !updatedReport) {
        console.error("⚠️ فشل في تحديث حالة بلاغ الهاتف:", updateError);
        return next(new ApiError("فشل في تحديث حالة بلاغ الهاتف", 500));
    }

    // جلب صور الهاتف المرتبطة
    const { data: images } = await supabase
        .from("phone_images")
        .select("*")
        .eq("phone_id", phoneId);

    // 6. تسجيل العملية في جدول تاريخ الحالات (report_status_history)
    try {
        await supabase.from("report_status_history").insert({
            phone_id: phoneId,
            old_status: existingReport.status,
            new_status: status,
            changed_by: req.user.id,
            reason: reason || `تغيير الحالة من ${existingReport.status} إلى ${status}`,
        });
    } catch (historyErr) {
        console.error("⚠️ فشل في تسجيل تاريخ تغيير الحالة:", historyErr.message);
    }

    // 7. تسجيل العملية في سجل التدقيق audit_logs
    try {
        let clientIp = req.ip || req.socket?.remoteAddress || null;
        if (clientIp === "::1" || clientIp === "127.0.0.1") clientIp = "127.0.0.1";

        await supabase.from("audit_logs").insert({
            user_id: req.user.id,
            action: `CHANGE_STATUS_TO_${status.toUpperCase()}`,
            entity_type: "lost_phones",
            entity_id: phoneId,
            old_data: { status: existingReport.status },
            new_data: { status },
            ip_address: clientIp,
            user_agent: req.get("user-agent") || null,
        });
    } catch (auditErr) {
        console.error("⚠️ فشل في تسجيل audit log لتغيير حالة الهاتف:", auditErr.message);
    }

    // 8. إبطال الكاش الخاص بالبلاغ وقوائم البحث وإحصائيات لوحة التحكم
    await deleteCache(CACHE_KEYS.LOST_PHONE(phoneId));
    await deleteByPattern("lost_phones:*");
    await deleteByPattern("dashboard:*");

    // 9. إرجاع الرد القياسي
    const statusMessages = {
        lost: "تمت إعادة حالة البلاغ إلى مفقود بنجاح",
        found: "تم تحديث حالة البلاغ إلى تم العثور عليه بنجاح",
        hidden: "تم إخفاء البلاغ بنجاح",
    };

    return sendSuccess(res, {
        statusCode: 200,
        message: statusMessages[status] || "تم تحديث حالة البلاغ بنجاح",
        results: {
            ...updatedReport,
            phone_images: images || [],
        },
    });
});

export default updateLostPhoneStatus;
