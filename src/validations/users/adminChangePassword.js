import { z } from "zod";

export const adminChangePasswordSchema = z
    .object({
        password: z
            .string({ required_error: "كلمة المرور الجديدة مطلوبة" })
            .min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف")
            .max(100, "كلمة المرور يجب ألا تتجاوز 100 حرف"),
        password_confirm: z
            .string({ required_error: "تأكيد كلمة المرور مطلوب" })
            .min(6, "تأكيد كلمة المرور يجب ألا يقل عن 6 أحرف"),
    })
    .refine((data) => data.password === data.password_confirm, {
        message: "كلمة المرور وتأكيد كلمة المرور غير متطابقين",
        path: ["password_confirm"],
    });

export default adminChangePasswordSchema;
