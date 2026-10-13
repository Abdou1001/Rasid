import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * إنشاء رمز JWT للمستخدم
 */
export const signToken = (payload) => {
    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN || "7d",
    });
};

/**
 * إعدادات ملف تعريف الارتباط الآمن (HTTP-only Cookie)
 */
export const getCookieOptions = () => {
    const isProd = env.NODE_ENV === "production";
    return {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 أيام بالميلي ثانية
    };
};

/**
 * خيارات مسح ملف تعريف الارتباط عند تسجيل الخروج
 */
export const getClearCookieOptions = () => {
    const isProd = env.NODE_ENV === "production";
    return {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
    };
};

/**
 * استخراج الحقول الآمنة للمستخدم وحذف كلمة المرور المشفرة
 */
export const sanitizeUser = (user) => {
    if (!user) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
};

export default {
    signToken,
    getCookieOptions,
    getClearCookieOptions,
    sanitizeUser,
};
