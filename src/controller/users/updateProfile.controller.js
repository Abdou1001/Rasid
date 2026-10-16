import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { normalizePhone } from "../../utils/phone.js";
import { sanitizeUser } from "../../utils/token.js";
import { CACHE_KEYS } from "../../config/cache.js";
import { deleteCache, deleteByPattern } from "../../services/cache.service.js";

// @Desc تعديل البيانات الشخصية للمستخدم الحالي (صاحب المحل)
// @Route PATCH /api/users/profile
// @Access Private (Authenticated active user)
export const updateProfile = AsyncHandler(async (req, res, next) => {
    const userId = req.user.id;
    const { shop_name, owner_name, area, address, phone } = req.body;

    // 1. استعلام بيانات المستخدم الحالي للتحقق من وجوده وحالته
    const { data: existingUser, error: fetchError } = await supabase
        .from("users")
        .select("id, shop_name, owner_name, area, address, phone, status, role")
        .eq("id", userId)
        .maybeSingle();

    if (fetchError) {
        return next(new ApiError("فشل في استعلام بيانات المستخدم", 500));
    }

    if (!existingUser) {
        return next(new ApiError("المستخدم غير موجود", 404));
    }

    if (!existingUser.status) {
        return next(new ApiError("تم تجميد هذا الحساب، يرجى التواصل مع الإدارة", 403));
    }

    // 2. إذا تم تقديم رقم هاتف جديد، التحقق من عدم استخدامه في حساب آخر
    let normalizedPhone;
    if (phone) {
        normalizedPhone = normalizePhone(phone);
        if (normalizedPhone !== existingUser.phone) {
            const { data: phoneOwner, error: phoneCheckError } = await supabase
                .from("users")
                .select("id")
                .eq("phone", normalizedPhone)
                .neq("id", userId)
                .maybeSingle();

            if (phoneCheckError) {
                return next(new ApiError("فشل في التحقق من رقم الهاتف", 500));
            }

            if (phoneOwner) {
                return next(new ApiError("رقم الهاتف مستخدم بالفعل من قبل حساب آخر", 409));
            }
        }
    }

    // 3. إعداد بيانات التحديث (تعديل الحقول المسموح بها فقط وحماية الحقول الإدارية)
    const now = new Date().toISOString();
    const updatePayload = {
        ...(shop_name !== undefined && { shop_name: shop_name.trim() }),
        ...(owner_name !== undefined && { owner_name: owner_name.trim() }),
        ...(area !== undefined && { area: area ? area.trim() : null }),
        ...(address !== undefined && { address: address ? address.trim() : null }),
        ...(normalizedPhone !== undefined && { phone: normalizedPhone }),
        updated_at: now,
    };

    // 4. تنفيذ التحديث في قاعدة البيانات
    const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(updatePayload)
        .eq("id", userId)
        .select()
        .single();

    if (updateError || !updatedUser) {
        return next(new ApiError("فشل في تحديث بيانات الملف الشخصي", 500));
    }

    // 5. إبطال الكاش الخاص بالمستخدم وقوائم المستخدمين
    await deleteCache(CACHE_KEYS.USER(userId));
    await deleteByPattern("users:*");

    // 6. تسجيل العملية في سجل العمليات والتدقيق (audit_logs)
    try {
        let clientIp = req.ip || req.socket?.remoteAddress || null;
        if (clientIp === "::1" || clientIp === "127.0.0.1") clientIp = "127.0.0.1";

        await supabase.from("audit_logs").insert({
            user_id: userId,
            action: "UPDATE_PROFILE",
            entity_type: "users",
            entity_id: userId,
            old_data: existingUser,
            new_data: sanitizeUser(updatedUser),
            ip_address: clientIp,
            user_agent: req.get("user-agent") || null,
        });
    } catch (auditErr) {
        console.error("⚠️ فشل تسجيل العملية في audit_logs:", auditErr.message);
    }

    // 7. إرجاع الرد القياسي بعد تجريد كلمة المرور
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم تحديث البيانات الشخصية بنجاح",
        results: sanitizeUser(updatedUser),
    });
});

export default updateProfile;
