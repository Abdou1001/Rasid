import { z } from "zod";

export const updatePoliceStationSchema = z
    .object({
        station_name: z
            .string()
            .trim()
            .min(2, "اسم قسم الشرطة يجب ألا يقل عن حرفين")
            .max(150, "اسم قسم الشرطة يجب ألا يتجاوز 150 حرفاً")
            .optional(),
        area: z
            .string()
            .trim()
            .min(2, "المنطقة يجب ألا تقل عن حرفين")
            .max(100, "المنطقة يجب ألا تتجاوز 100 حرف")
            .optional(),
        phone_number: z
            .string()
            .trim()
            .min(3, "رقم الهاتف يجب ألا يقل عن 3 أرقام")
            .max(30, "رقم الهاتف يجب ألا يتجاوز 30 حرفاً")
            .optional(),
        address: z
            .string()
            .trim()
            .max(500, "العنوان يجب ألا يتجاوز 500 حرف")
            .optional()
            .nullable(),
        notes: z
            .string()
            .trim()
            .max(1000, "الملاحظات يجب ألا تتجاوز 1000 حرف")
            .optional()
            .nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "يجب تقديم حقل واحد على الأقل للتحديث",
    });

export default updatePoliceStationSchema;
