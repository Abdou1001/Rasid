import { z } from "zod";

export const createLostPhoneSchema = z.object({
    brand: z
        .string({ required_error: "الماركة (brand) مطلوبة" })
        .trim()
        .min(2, "الماركة يجب ألا تقل عن حرفين")
        .max(100, "الماركة يجب ألا تتجاوز 100 حرف"),
    model: z
        .string({ required_error: "الموديل (model) مطلوب" })
        .trim()
        .min(1, "الموديل لا يمكن أن يكون فارغاً")
        .max(150, "الموديل يجب ألا يتجاوز 150 حرفاً"),
    serial_number: z
        .string()
        .trim()
        .max(150, "الرقم التسلسلي يجب ألا يتجاوز 150 حرفاً")
        .optional()
        .nullable()
        .transform((val) => (val === "" ? null : val)),
    imei: z
        .string()
        .trim()
        .max(50, "رقم IMEI يجب ألا يتجاوز 50 حرفاً")
        .optional()
        .nullable()
        .transform((val) => (val === "" ? null : val)),
    imei2: z
        .string()
        .trim()
        .max(50, "رقم IMEI2 يجب ألا يتجاوز 50 حرفاً")
        .optional()
        .nullable()
        .transform((val) => (val === "" ? null : val)),
    color: z
        .string()
        .trim()
        .max(50, "اللون يجب ألا يتجاوز 50 حرفاً")
        .optional()
        .nullable()
        .transform((val) => (val === "" ? null : val)),
    storage: z
        .string()
        .trim()
        .max(50, "السعة التخزينية يجب ألا تتجاوز 50 حرفاً")
        .optional()
        .nullable()
        .transform((val) => (val === "" ? null : val)),
    description: z
        .string()
        .trim()
        .optional()
        .nullable()
        .transform((val) => (val === "" ? null : val)),
    contact: z
        .string()
        .trim()
        .max(30, "رقم التواصل يجب ألا يتجاوز 30 حرفاً")
        .optional()
        .nullable()
        .transform((val) => (val === "" ? null : val)),
    contact2: z
        .string()
        .trim()
        .max(30, "رقم التواصل الثاني يجب ألا يتجاوز 30 حرفاً")
        .optional()
        .nullable()
        .transform((val) => (val === "" ? null : val)),
});

export default createLostPhoneSchema;
