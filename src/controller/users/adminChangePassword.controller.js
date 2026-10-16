import bcrypt from "bcryptjs";
import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { isValidUUID } from "../../utils/validators.js";
import { CACHE_KEYS } from "../../config/cache.js";
import { deleteCache } from "../../services/cache.service.js";

// @Desc تغيير أو إعادة تعيين كلمة المرور لأي مستخدم بواسطة المسؤول (Admin)
// @Route PATCH /api/users/:id/password
// @Access Private (Admin only)
export const adminChangePassword = AsyncHandler(async (req, res, next) => {
    const targetUserId = req.params.id;
    const { password } = req.body;

    // 1. التحقق من صحة المعرف بصيغة UUID
    if (!isValidUUID(targetUserId)) {
        return next(new ApiError("معرف المستخدم غير صالح", 400));
    }

    // 2. التحقق من وجود المستخدم المستهدف في قاعدة البيانات
    const { data: targetUser, error: checkError } = await supabase
        .from("users")
        .select("id, role, shop_name, owner_name")
        .eq("id", targetUserId)
        .maybeSingle();

    if (checkError) {
        return next(new ApiError("فشل في استعلام بيانات المستخدم", 500));
    }

    if (!targetUser) {
        return next(new ApiError("المستخدم غير موجود", 404));
    }

    // 3. تشفير كلمة المرور الجديدة باستخدام bcrypt
    const newPasswordHash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    // 4. تحديث كلمة المرور في قاعدة البيانات
    const { error: updateError } = await supabase
        .from("users")
        .update({
            password_hash: newPasswordHash,
            updated_at: now,
        })
        .eq("id", targetUserId);

    if (updateError) {
        return next(new ApiError("فشل في تحديث كلمة المرور", 500));
    }

    // 5. إبطال الكاش الخاص بالمستخدم المستهدف
    await deleteCache(CACHE_KEYS.USER(targetUserId));

    // 6. تسجيل العملية في سجل العمليات والتدقيق (audit_logs)
    try {
        let clientIp = req.ip || req.socket?.remoteAddress || null;
        if (clientIp === "::1" || clientIp === "127.0.0.1") clientIp = "127.0.0.1";

        await supabase.from("audit_logs").insert({
            user_id: req.user.id,
            action: "ADMIN_CHANGE_PASSWORD",
            entity_type: "users",
            entity_id: targetUserId,
            old_data: { target_user: targetUser.shop_name || targetUser.owner_name },
            new_data: { status: "PASSWORD_CHANGED_BY_ADMIN" },
            ip_address: clientIp,
            user_agent: req.get("user-agent") || null,
        });
    } catch (auditErr) {
        console.error("⚠️ فشل تسجيل العملية في audit_logs:", auditErr.message);
    }

    // 7. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم تغيير كلمة المرور للمستخدم بنجاح بواسطة المسؤول",
        results: {
            user_id: targetUserId,
        },
    });
});

export default adminChangePassword;
