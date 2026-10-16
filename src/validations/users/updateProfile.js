import { z } from "zod";
import { isValidYemeniPhone } from "../../utils/phone.js";

export const updateProfileSchema = z
    .object({
        shop_name: z
            .string()
            .trim()
            .min(2, "اسم المحل يجب ألا يقل عن حرفين")
            .max(150, "اسم المحل يجب ألا يتجاوز 150 حرفاً")
            .optional(),
        owner_name: z
            .string()
            .trim()
            .min(2, "اسم مالك المحل يجب ألا يقل عن حرفين")
            .max(150, "اسم مالك المحل يجب ألا يتجاوز 150 حرفاً")
            .optional(),
        area: z
            .string()
            .trim()
            .max(100, "المنطقة يجب ألا تتجاوز 100 حرف")
            .optional()
            .nullable()
            .transform((val) => (val === "" ? null : val)),
        address: z
            .string()
            .trim()
            .max(500, "العنوان يجب ألا يتجاوز 500 حرف")
            .optional()
            .nullable()
            .transform((val) => (val === "" ? null : val)),
        phone: z
            .string()
            .trim()
            .refine(isValidYemeniPhone, {
                message: "رقم الهاتف غير صالح. يرجى إدخال رقم هاتف يمني صحيح (مثال: 7XXXXXXXX أو 9677XXXXXXXX)",
            })
            .optional(),
    })
    .refine((data) => Object.values(data).some((val) => val !== undefined), {
        message: "يجب تقديم حقل واحد على الأقل للتحديث",
    });

export default updateProfileSchema;
