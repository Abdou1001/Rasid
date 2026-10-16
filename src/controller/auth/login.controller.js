import bcrypt from "bcryptjs";
import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { normalizePhone } from "../../utils/phone.js";
import { signToken, getCookieOptions, sanitizeUser } from "../../utils/token.js";

// @Desc تسجيل دخول أصحاب المحلات التجارية
// @Route POST /api/auth/login
// @Access Public
export const login = AsyncHandler(async (req, res, next) => {
    const { phone, password } = req.body;
    const normalizedPhone = normalizePhone(phone);

    // 1. الاستعلام عن المستخدم برقم الهاتف الموحد
    const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("phone", normalizedPhone)
        .maybeSingle();

    if (error) {
        return next(new ApiError("فشل في استعلام قاعدة البيانات", 500));
    }

    // 2. التحقق من وجود المستخدم
    if (!user) {
        return next(new ApiError("رقم الهاتف أو كلمة المرور غير صحيحة", 401));
    }

    // 3. التحقق من صحة كلمة المرور باستخدام bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
        return next(new ApiError("رقم الهاتف أو كلمة المرور غير صحيحة", 401));
    }

    // 4. التحقق من الدور: منع حسابات المسؤولين من تسجيل الدخول عبر بوابة المتاجر
    if (user.role === "admin") {
        return next(new ApiError("غير مصرح لحسابات المسؤول بالدخول عبر بوابة المتاجر", 403));
    }

    // 5. التحقق من حالة الحساب: رفض الحسابات المجمدة
    if (!user.status) {
        return next(new ApiError("تم تجميد هذا الحساب، يرجى التواصل مع الإدارة", 403));
    }

    // 6. إنشاء رمز JWT وإرساله عبر ملف تعريف ارتباط آمن (HTTP-only Cookie)
    const token = signToken({
        id: user.id,
        user_id: user.id,
        role: user.role,
    });

    res.cookie("token", token, getCookieOptions());

    // 7. إرجاع الرد القياسي بدون كلمة المرور المشفرة وبدون الرمز في جسم الرد
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم تسجيل الدخول بنجاح",
        results: {
            user: sanitizeUser(user),
        },
    });
});

export default login;
