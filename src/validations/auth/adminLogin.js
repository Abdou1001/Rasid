import { z } from "zod";
import { isValidYemeniPhone } from "../../utils/phone.js";

export const adminLoginSchema = z.object({
    phone: z
        .string({ required_error: "رقم الهاتف مطلوب" })
        .trim()
        .min(1, "رقم الهاتف مطلوب")
        .refine(isValidYemeniPhone, {
            message: "رقم الهاتف غير صالح. يرجى إدخال رقم هاتف يمني صحيح (مثال: 7XXXXXXXX أو 9677XXXXXXXX)",
        }),
    password: z
        .string({ required_error: "كلمة المرور مطلوبة" })
        .min(1, "كلمة المرور مطلوبة"),
});

export default adminLoginSchema;
