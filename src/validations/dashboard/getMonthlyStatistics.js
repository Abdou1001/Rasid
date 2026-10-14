import { z } from "zod";

export const getMonthlyStatisticsSchema = z.object({
    month: z.coerce
        .number({
            required_error: "الشهر (month) مطلوب",
            invalid_type_error: "الشهر يجب أن يكون رقماً صحيحاً",
        })
        .int("الشهر يجب أن يكون رقماً صحيحاً")
        .min(1, "الشهر يجب أن يكون بين 1 و 12")
        .max(12, "الشهر يجب أن يكون بين 1 و 12"),
    year: z.coerce
        .number({
            required_error: "السنة (year) مطلوبة",
            invalid_type_error: "السنة يجب أن تكون رقماً صحيحاً",
        })
        .int("السنة يجب أن تكون رقماً صحيحاً")
        .min(1000, "السنة يجب أن تتكون من 4 أرقام صحيحة")
        .max(9999, "السنة يجب أن تتكون من 4 أرقام صحيحة"),
});

export default getMonthlyStatisticsSchema;
