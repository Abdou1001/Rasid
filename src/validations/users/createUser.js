import { z } from "zod";
import { isValidYemeniPhone } from "../../utils/phone.js";

export const createUserSchema = z.object({
    shop_name: z
        .string({ required_error: "اسم المحل مطلوب" })
        .trim()
        .min(2, "اسم المحل يجب ألا يقل عن حرفين")
        .max(150, "اسم المحل يجب ألا يتجاوز 150 حرفاً"),
    owner_name: z
        .string({ required_error: "اسم مالك المحل مطلوب" })
        .trim()
        .min(2, "اسم مالك المحل يجب ألا يقل عن حرفين")
        .max(150, "اسم مالك المحل يجب ألا يتجاوز 150 حرفاً"),
    area: z
        .string()
        .trim()
        .max(100, "المنطقة يجب ألا تتجاوز 100 حرف")
        .optional()
        .nullable(),
    address: z
        .string()
        .trim()
        .max(500, "العنوان يجب ألا يتجاوز 500 حرف")
        .optional()
        .nullable(),
    phone: z
        .string({ required_error: "رقم الهاتف مطلوب" })
        .trim()
        .min(1, "رقم الهاتف مطلوب")
        .refine(isValidYemeniPhone, {
            message: "رقم الهاتف غير صالح. يرجى إدخال رقم هاتف يمني صحيح (مثال: 7XXXXXXXX أو 9677XXXXXXXX)",
        }),
    password: z
        .string({ required_error: "كلمة المرور مطلوبة" })
        .min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف")
        .max(100, "كلمة المرور يجب ألا تتجاوز 100 حرف"),
});

export default createUserSchema;
