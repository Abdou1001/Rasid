import jwt from "jsonwebtoken";
import AsyncHandler from "express-async-handler";
import { supabase } from "../config/supabase.js";
import { env } from "../config/env.js";
import ApiError from "../utils/ApiError.js";

/**
 * استخراج رمز التوثيق (JWT) من ملفات تعريف الارتباط أو الترويسة
 */
const extractToken = (req) => {
    if (req.cookies && req.cookies.token) {
        return req.cookies.token;
    }
    if (req.headers?.authorization && req.headers.authorization.startsWith("Bearer ")) {
        return req.headers.authorization.split(" ")[1];
    }
    return null;
};

// ============================================================
// وسيط حماية المسارات والتحقق من جلسة المستخدم
// @Route Middleware
// @Access Private
// ============================================================
export const protect = AsyncHandler(async (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        return next(new ApiError("يرجى تسجيل الدخول للوصول إلى هذا المورد", 401));
    }

    // التحقق من صحة وصلاحية رمز JWT
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const userId = decoded.id || decoded.user_id;

    if (!userId) {
        return next(new ApiError("رمز المصادقة غير صالح", 401));
    }

    // جلب بيانات المستخدم من قاعدة البيانات للتحقق من وجود الحساب وحالته
    const { data: user, error } = await supabase
        .from("users")
        .select("id, shop_name, owner_name, area, address, phone, role, status, created_at, updated_at")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        return next(new ApiError("فشل في التحقق من بيانات المستخدم", 500));
    }

    if (!user) {
        return next(new ApiError("المستخدم غير موجود أو تم حذف الحساب", 401));
    }

    // التحقق من حالة الحساب: status = false تعني حساب مجمد
    if (!user.status) {
        return next(new ApiError("تم تجميد هذا الحساب، يرجى التواصل مع الإدارة", 403));
    }

    // إرفاق بيانات المستخدم في الطلب
    req.user = user;
    req.isAdmin = user.role === "admin";

    next();
});

// ============================================================
// وسيط التحقق الاختياري
// يسمح بالمرور للزائر، وفي حال وجود رمز صالح يرفق بيانات المستخدم
// @Route Middleware
// @Access Public / Optional Auth
// ============================================================
export const optionalAuth = AsyncHandler(async (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        req.user = null;
        req.isAdmin = false;
        return next();
    }

    try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        const userId = decoded.id || decoded.user_id;

        if (!userId) {
            req.user = null;
            req.isAdmin = false;
            return next();
        }

        const { data: user, error } = await supabase
            .from("users")
            .select("id, shop_name, owner_name, area, address, phone, role, status, created_at, updated_at")
            .eq("id", userId)
            .maybeSingle();

        if (error || !user || !user.status) {
            req.user = null;
            req.isAdmin = false;
            return next();
        }

        req.user = user;
        req.isAdmin = user.role === "admin";
    } catch {
        // في حال عدم صلاحية الرمز، لا يتم تعطيل الطلب العام
        req.user = null;
        req.isAdmin = false;
    }

    next();
});

// الاسم البديل للحفاظ على التوافق
export const optionalProtect = optionalAuth;

// ============================================================
// وسيط التحقق من صلاحيات وأدوار المستخدم
// @Route Middleware
// @Access Private
// ============================================================
export const allowedTo = (...roles) =>
    AsyncHandler(async (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return next(new ApiError("ليس لديك صلاحية للوصول إلى هذا المورد", 403));
        }

        next();
    });

export default {
    protect,
    optionalAuth,
    optionalProtect,
    allowedTo,
};
