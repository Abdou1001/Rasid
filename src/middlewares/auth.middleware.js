import {supabase} from "../config/supabase.js";
import AsyncHandler from "express-async-handler";
import ApiError from "../utils/ApiError.js";
import jwt from "jsonwebtoken";

// ============================================================
// Protect routes and check if user logged in
// @Route Middleware
// @Access Private
// ============================================================
export const protect = AsyncHandler(async (req, res, next) => {
    // Check if token exists
    let token;

    if (req.cookies.token) token = req.cookies.token;

    // If token not exist
    if (!token) return next(new ApiError("يرجى تسجيل الدخول", 401));

    // Verify token
    const decoded = jwt.verify(token, process.env.SECRET_KEY_JWT);

    // Check if user exists
    const {data: user, error} = await supabase
        .from("user")
        .select("*")
        .eq("user_id", decoded.user_id)
        .single();

    // If user not found
    if (error || !user) return next(new ApiError("المستخدم غير موجود", 401));

    // Check if user changed password after token was created
    if (user.password_changed_at) {
        const passChangeTimestamp = parseInt(
            new Date(user.password_changed_at).getTime() / 1000,
            10,
        );

        if (passChangeTimestamp > decoded.iat) {
            return next(
                new ApiError("غيرت كلمة المرور مؤخرا، سجل دخول مره اخرى", 401),
            );
        }
    }

    // Save user in request
    req.user = user;

    next();
});

// ============================================================
// Optional Protect
// يسمح للزائر بالدخول، وإذا كان مسجلًا يتحقق من حسابه
// @Route Middleware
// @Access Public / Optional Auth
// ============================================================
export const optionalProtect = AsyncHandler(async (req, res, next) => {
    // Check if token exists
    const token = req.cookies?.token;

    // No token = guest
    if (!token) {
        req.user = null;
        return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.SECRET_KEY_JWT);

    // Check if user exists
    const {data: user, error} = await supabase
        .from("user")
        .select("*")
        .eq("user_id", decoded.user_id)
        .single();

    // Token exists but user doesn't
    if (error || !user) {
        return next(new ApiError("المستخدم غير موجود", 401));
    }

    // Check if user changed password after token was created
    if (user.password_changed_at) {
        const passChangeTimestamp = parseInt(
            new Date(user.password_changed_at).getTime() / 1000,
            10,
        );

        if (passChangeTimestamp > decoded.iat) {
            return next(
                new ApiError("غيرت كلمة المرور مؤخرا، سجل دخول مره اخرى", 401),
            );
        }
    }

    // Save user in request
    req.user = user;

    next();
});

// ============================================================
// Authorization middleware
// @Route Middleware
// @Access Private
// ============================================================
export const allowedTo = (...roles) =>
    AsyncHandler(async (req, res, next) => {
        // Check if user role allowed
        if (!roles.includes(req.user.role))
            return next(new ApiError("ليس لديك صلاحية للوصول", 403));

        next();
    });
