import { z } from "zod";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidUUID = (value) => {
    return typeof value === "string" && UUID_REGEX.test(value);
};

export const isValidNumericId = (value) => {
    const num = Number(value);
    return Number.isInteger(num) && num > 0;
};

export const uuidSchema = z
    .string({ required_error: "معرف UUID مطلوب" })
    .regex(UUID_REGEX, "صيغة معرف UUID غير صالحة");

export const numericIdSchema = z.coerce
    .number({ required_error: "المعرف الرقمي مطلوب" })
    .int("يجب أن يكون المعرف عدداً صحيحاً")
    .positive("يجب أن يكون المعرف عدداً صحيحاً موجباً");

export default {
    UUID_REGEX,
    isValidUUID,
    isValidNumericId,
    uuidSchema,
    numericIdSchema,
};
