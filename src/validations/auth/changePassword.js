import { z } from "zod";

export const changePasswordSchema = z
    .object({
        current_password: z
            .string({ required_error: "كلمة المرور الحالية مطلوبة" })
            .min(1, "كلمة المرور الحالية مطلوبة"),
        new_password: z
            .string({ required_error: "كلمة المرور الجديدة مطلوبة" })
            .min(6, "يجب ألا تقل كلمة المرور الجديدة عن 6 أحرف")
            .max(100, "يجب ألا تتجاوز كلمة المرور 100 حرف"),
        confirm_password: z
            .string({ required_error: "تأكيد كلمة المرور مطلوب" })
            .min(1, "تأكيد كلمة المرور مطلوب"),
    })
    .refine((data) => data.new_password === data.confirm_password, {
        message: "كلمة المرور الجديدة وتأكيد كلمة المرور غير متطابقين",
        path: ["confirm_password"],
    })
    .refine((data) => data.current_password !== data.new_password, {
        message: "يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية",
        path: ["new_password"],
    });

export default changePasswordSchema;
