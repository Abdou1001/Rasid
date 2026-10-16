import { z } from "zod";

const stringOrNumber = (maxLen, msg) =>
    z
        .union([z.string(), z.number()])
        .transform((val) => (val === "" || val === null || val === undefined ? null : String(val).trim()))
        .pipe(
            z
                .string()
                .max(maxLen, msg)
                .nullable()
        )
        .optional()
        .nullable();

const deleteImageIdsHelper = z
    .union([
        z.array(z.union([z.number(), z.string()])),
        z.string(),
        z.number(),
    ])
    .optional()
    .nullable()
    .transform((val) => {
        if (val === undefined || val === null || val === "") return undefined;
        let items = [];
        if (Array.isArray(val)) {
            items = val;
        } else if (typeof val === "number") {
            items = [val];
        } else if (typeof val === "string") {
            const trimmed = val.trim();
            if (!trimmed) return undefined;
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) items = parsed;
                    else items = [trimmed];
                } catch (_) {
                    items = [trimmed];
                }
            } else {
                items = trimmed.split(",");
            }
        }
        const parsedIds = items
            .map((item) => Number(String(item).trim()))
            .filter((num) => !isNaN(num) && Number.isInteger(num) && num > 0);
        return parsedIds.length > 0 ? parsedIds : undefined;
    });

export const updateLostPhoneSchema = z
    .object({
        brand: z
            .string()
            .trim()
            .min(2, "الماركة يجب ألا تقل عن حرفين")
            .max(100, "الماركة يجب ألا تتجاوز 100 حرف")
            .optional(),
        model: z
            .string()
            .trim()
            .min(1, "الموديل لا يمكن أن يكون فارغاً")
            .max(150, "الموديل يجب ألا يتجاوز 150 حرفاً")
            .optional(),
        serial_number: stringOrNumber(150, "الرقم التسلسلي يجب ألا يتجاوز 150 حرفاً"),
        imei: stringOrNumber(50, "رقم IMEI يجب ألا يتجاوز 50 حرفاً"),
        imei2: stringOrNumber(50, "رقم IMEI2 يجب ألا يتجاوز 50 حرفاً"),
        color: z
            .string()
            .trim()
            .max(50, "اللون يجب ألا يتجاوز 50 حرفاً")
            .optional()
            .nullable()
            .transform((val) => (val === "" ? null : val)),
        storage: stringOrNumber(50, "السعة التخزينية يجب ألا تتجاوز 50 حرفاً"),
        description: z
            .string()
            .trim()
            .optional()
            .nullable()
            .transform((val) => (val === "" ? null : val)),
        contact: stringOrNumber(30, "رقم التواصل يجب ألا يتجاوز 30 حرفاً"),
        contact2: stringOrNumber(30, "رقم التواصل الثاني يجب ألا يتجاوز 30 حرفاً"),
        status: z.enum(["lost", "found", "hidden"]).optional(),
        reason: z.string().trim().max(500).optional(),
        delete_image_ids: deleteImageIdsHelper,
        replace_images: z
            .union([z.boolean(), z.string()])
            .optional()
            .nullable()
            .transform((val) => {
                if (val === undefined || val === null || val === "") return undefined;
                return val === true || val === "true" || val === "1";
            }),
    })
    .refine((data) => Object.values(data).some((val) => val !== undefined), {
        message: "يجب تقديم حقل واحد على الأقل للتحديث",
    });

export default updateLostPhoneSchema;
