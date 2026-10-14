import { z } from "zod";

export const updateLostPhoneStatusSchema = z.object({
    status: z.enum(["lost", "found", "hidden"], {
        required_error: "حالة البلاغ (status) مطلوبة",
        invalid_type_error: "حالة البلاغ يجب أن تكون: lost أو found أو hidden",
    }),
    reason: z.string().trim().max(500, "سبب تغيير الحالة لا يمكن أن يتجاوز 500 حرف").optional(),
});

export default updateLostPhoneStatusSchema;
