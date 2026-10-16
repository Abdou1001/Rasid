import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { isValidUUID } from "../../utils/validators.js";
import { CACHE_KEYS } from "../../config/cache.js";
import { deleteCache, deleteByPattern } from "../../services/cache.service.js";

// @Desc إيقاف أو تفعيل حساب أي مستخدم بواسطة المسؤول (Admin Suspend/Activate User)
// @Route PATCH /api/users/:id/status
// @Access Private (Admin only)
export const updateUserStatus = AsyncHandler(async (req, res, next) => {
    const targetUserId = req.params.id;
    const { status, reason } = req.body;

    // 1. التحقق من صحة المعرف بصيغة UUID
    if (!isValidUUID(targetUserId)) {
        return next(new ApiError("معرف المستخدم غير صالح", 400));
    }

    // 2. منع المسؤول من إيقاف أو تجميد حسابه الخاص لتفادي قفل النظام
    if (req.user.id === targetUserId) {
        return next(new ApiError("لا يمكن للمسؤول إيقاف أو تعديل حالة حسابه الخاص", 400));
    }

    // 3. التحقق من وجود المستخدم في قاعدة البيانات
    const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id, status, role, shop_name, owner_name")
        .eq("id", targetUserId)
        .maybeSingle();

    if (checkError) {
        return next(new ApiError("فشل في استعلام بيانات المستخدم", 500));
    }

    if (!existingUser) {
        return next(new ApiError("المستخدم غير موجود", 404));
    }

    // 4. تحديد الحالة الجديدة (إما القيمة المحددة صراحة أو تبديل الحالة الحالية Toggle)
    const newStatus = typeof status === "boolean" ? status : !existingUser.status;

    if (newStatus === existingUser.status) {
        return next(
            new ApiError(
                `الحساب بالفعل في حالة ${newStatus ? "نشط (مفعل)" : "معلق (موقف)"}`,
                400
            )
        );
    }

    const now = new Date().toISOString();

    // 5. تحديث حالة الحساب في قاعدة البيانات
    const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({
            status: newStatus,
            updated_at: now,
        })
        .eq("id", targetUserId)
        .select("id, status, role, shop_name, owner_name, updated_at")
        .single();

    if (updateError || !updatedUser) {
        return next(new ApiError("فشل في تحديث حالة المستخدم", 500));
    }

    // 6. إبطال الكاش الخاص بالمستخدم وقوائم المستخدمين وإحصائيات لوحة التحكم
    await deleteCache(CACHE_KEYS.USER(targetUserId));
    await deleteByPattern("users:*");
    await deleteByPattern("dashboard:*");

    // 7. تسجيل العملية في سجل العمليات والتدقيق (audit_logs)
    try {
        let clientIp = req.ip || req.socket?.remoteAddress || null;
        if (clientIp === "::1" || clientIp === "127.0.0.1") clientIp = "127.0.0.1";

        const actionName = newStatus ? "ACTIVATE_USER" : "SUSPEND_USER";
        await supabase.from("audit_logs").insert({
            user_id: req.user.id,
            action: actionName,
            entity_type: "users",
            entity_id: targetUserId,
            old_data: { status: existingUser.status, reason },
            new_data: { status: newStatus },
            ip_address: clientIp,
            user_agent: req.get("user-agent") || null,
        });
    } catch (auditErr) {
        console.error("⚠️ فشل تسجيل العملية في audit_logs:", auditErr.message);
    }

    // 8. إرجاع الرد القياسي
    const message = newStatus
        ? "تم تفعيل حساب المستخدم بنجاح"
        : "تم إيقاف (تجميد) حساب المستخدم بنجاح";

    return sendSuccess(res, {
        statusCode: 200,
        message,
        results: updatedUser,
    });
});

export default updateUserStatus;
