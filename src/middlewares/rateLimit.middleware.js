import rateLimit from "express-rate-limit";

// @Desc Limit authentication requests
export const authRateLimit = rateLimit({
    // 10 minutes
    windowMs: 10 * 60 * 1000,

    // Maximum requests
    max: 5,

    message: {
        status: "fail",
        message:
            "تم تجاوز عدد المحاولات المسموح بها، يرجى المحاولة مرة أخرى بعد 10 دقيقة.",
    },

    standardHeaders: true,
    legacyHeaders: false,
});

export const otpRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000,

    max: 3,

    message: {
        status: "fail",
        message:
            "تم طلب رمز تحقق عدة مرات، يرجى الانتظار 5 دقائق قبل إعادة المحاولة.",
    },

    standardHeaders: true,
    legacyHeaders: false,
});

// For APIs
export const apiRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,

    max: 200,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        status: "fail",
        message: "طلبات كثيرة جدًا، يرجى المحاولة لاحقًا.",
    },
});