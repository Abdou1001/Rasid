import bcrypt from "bcryptjs";
import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { CACHE_KEYS } from "../../config/cache.js";
import { deleteCache } from "../../services/cache.service.js";
import { getClearCookieOptions } from "../../utils/token.js";

// @Desc تغيير كلمة المرور للمستخدم الحالي
// @Route PATCH /api/auth/change-password
// @Access Private
export const changePassword = AsyncHandler(async (req, res, next) => {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    // 1. جلب كلمة المرور المشفرة وحالة الحساب الحالية من قاعدة البيانات
    const { data: user, error } = await supabase
        .from("users")
        .select("id, password_hash, status, role")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        return next(new ApiError("فشل في استعلام بيانات المستخدم", 500));
    }

    if (!user) {
        return next(new ApiError("المستخدم غير موجود", 404));
    }

    // 2. التحقق من حالة الحساب
    if (!user.status) {
        return next(new ApiError("تم تجميد هذا الحساب، يرجى التواصل مع الإدارة", 403));
    }

    // 3. التحقق من صحة كلمة المرور الحالية
    const isCurrentPasswordCorrect = await bcrypt.compare(current_password, user.password_hash);
    if (!isCurrentPasswordCorrect) {
        return next(new ApiError("كلمة المرور الحالية غير صحيحة", 400));
    }

    // 4. تشفير كلمة المرور الجديدة باستخدام bcrypt
    const newPasswordHash = await bcrypt.hash(new_password, 12);

    // 5. تحديث كلمة المرور في قاعدة البيانات
    const { error: updateError } = await supabase
        .from("users")
        .update({
            password_hash: newPasswordHash,
        })
        .eq("id", userId);

    if (updateError) {
        return next(new ApiError("فشل في تحديث كلمة المرور", 500));
    }

    // 6. إبطال الكاش الخاص بالمستخدم
    await deleteCache(CACHE_KEYS.USER(userId));

    // 7. تسجيل الخروج ومسح ملف تعريف الارتباط لإلزام المستخدم بتسجيل الدخول بكلمة المرور الجديدة
    res.clearCookie("token", getClearCookieOptions());

    // 8. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم تغيير كلمة المرور بنجاح، يرجى تسجيل الدخول مجدداً",
    });
});

export default changePassword;
