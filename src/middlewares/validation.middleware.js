import AsyncHandler from "express-async-handler";

/**
 * وسيط التحقق من صحة مدخلات الطلب (Body) باستخدام Zod
 * يقوم بتمرير الأخطاء تلقائياً إلى معالج الأخطاء العام
 */
export const validate = (schema) =>
    AsyncHandler(async (req, res, next) => {
        req.body = await schema.parseAsync(req.body);
        next();
    });

/**
 * وسيط التحقق من صحة معاملات الاستعلام (Query Parameters) باستخدام Zod
 * يراعي أن req.query في Express 5 يحتوي على getter فقط عبر استخدام Object.assign
 */
export const validateQuery = (schema) =>
    AsyncHandler(async (req, res, next) => {
        const parsed = await schema.parseAsync(req.query);
        Object.assign(req.query, parsed);
        next();
    });

export default {
    validate,
    validateQuery,
};
