import { ZodError } from "zod";
import ApiError from "../utils/ApiError.js";
import { env } from "../config/env.js";

// وسيط معالجة المسارات غير الموجودة (404)
export const notFound = (req, res, next) => {
    next(new ApiError(`المسار المطلوب غير موجود: ${req.method} ${req.originalUrl}`, 404));
};

// المعالج العام للأخطاء في التطبيق
export const globalError = (err, req, res, next) => {
    // 1. تنسيق أخطاء التحقق من المدخلات (Zod)
    if (err instanceof ZodError) {
        const errors = err.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
        }));
        return res.status(400).json({
            status: "fail",
            message: "خطأ في التحقق من صحة البيانات المدخلة",
            errors,
        });
    }

    // 2. تنسيق أخطاء رموز التوثيق (JWT)
    if (err.name === "JsonWebTokenError") {
        return res.status(401).json({
            status: "fail",
            message: "رمز المصادقة غير صالح. يرجى تسجيل الدخول مجدداً.",
        });
    }
    if (err.name === "TokenExpiredError") {
        return res.status(401).json({
            status: "fail",
            message: "انتهت صلاحية رمز المصادقة. يرجى تسجيل الدخول مجدداً.",
        });
    }

    // 3. تنسيق أخطاء رفع الملفات (MulterError)
    if (err.name === "MulterError") {
        let message = "خطأ في معالجة الملفات المرفوعة";
        if (err.code === "LIMIT_FILE_SIZE") message = "حجم الصورة يتجاوز الحد الأقصى المسموح (5 ميجابايت)";
        if (err.code === "LIMIT_FILE_COUNT") message = "عدد الصور المرفوعة يتجاوز الحد الأقصى المسموح";
        if (err.code === "LIMIT_UNEXPECTED_FILE") message = "حقل رفع الصور غير متوقع أو تجاوز الحد المسموح به";
        return res.status(400).json({
            status: "fail",
            message,
            code: err.code,
        });
    }

    // 4. تنسيق الأخطاء التشغيلية المخصصة (ApiError)
    if (err instanceof ApiError || err.isOperational) {
        const statusCode = err.statusCode || 500;
        const response = {
            status: err.status || (String(statusCode).startsWith("4") ? "fail" : "error"),
            message: err.message,
        };
        if (env.NODE_ENV !== "production" && err.stack) {
            response.stack = err.stack;
        }
        return res.status(statusCode).json(response);
    }

    // 4. معالجة الأخطاء غير المتوقعة للخادم (500)
    const statusCode = err.statusCode || 500;
    const isProd = env.NODE_ENV === "production";

    console.error("💥 خطأ غير متوقع في الخادم:", err);

    return res.status(statusCode).json({
        status: "error",
        message: isProd ? "حدث خطأ داخلي في الخادم. يرجى المحاولة لاحقاً." : err.message,
        ...(isProd ? {} : { stack: err.stack }),
    });
};

export default {
    notFound,
    globalError,
};
