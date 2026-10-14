import { z } from "zod";

export const createPoliceStationSchema = z.object({
    station_name: z
        .string({ required_error: "اسم قسم الشرطة مطلوب" })
        .trim()
        .min(2, "اسم قسم الشرطة يجب ألا يقل عن حرفين")
        .max(150, "اسم قسم الشرطة يجب ألا يتجاوز 150 حرفاً"),
    area: z
        .string({ required_error: "المنطقة مطلوبة" })
        .trim()
        .min(2, "المنطقة يجب ألا تقل عن حرفين")
        .max(100, "المنطقة يجب ألا تتجاوز 100 حرف"),
    phone_number: z
        .string({ required_error: "رقم هاتف القسم مطلوب" })
        .trim()
        .min(3, "رقم الهاتف يجب ألا يقل عن 3 أرقام")
        .max(30, "رقم الهاتف يجب ألا يتجاوز 30 حرفاً"),
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
});

export default createPoliceStationSchema;
