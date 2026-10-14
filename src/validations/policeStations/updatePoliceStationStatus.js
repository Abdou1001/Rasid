import { z } from "zod";

export const updatePoliceStationStatusSchema = z.object({
    is_active: z.boolean({
        required_error: "حالة التفعيل (is_active) مطلوبة ويجب أن تكون قيمة منطقية (true/false)",
        invalid_type_error: "حالة التفعيل يجب أن تكون قيمة منطقية (true/false)",
    }),
});

export default updatePoliceStationStatusSchema;
