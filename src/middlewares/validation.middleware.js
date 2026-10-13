import AsyncHandler from "express-async-handler";

/**
 * وسيط التحقق من صحة مدخلات الطلب باستخدام Zod
 * يقوم بتمرير الأخطاء تلقائياً إلى معالج الأخطاء العام
 */
export const validate = (schema) =>
    AsyncHandler(async (req, res, next) => {
        req.body = await schema.parseAsync(req.body);
        next();
    });

export default validate;
