import { z } from "zod";

export const getUsersSchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    limit: z.coerce.number().int().positive().max(100).default(10).optional(),
    keyword: z.string().trim().optional(),
    search: z.string().trim().optional(),
    role: z.enum(["admin", "user"]).optional(),
    status: z
        .enum(["true", "false"])
        .or(z.boolean())
        .optional(),
    created_from: z
        .string()
        .datetime({ offset: true })
        .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
        .optional(),
    created_to: z
        .string()
        .datetime({ offset: true })
        .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
        .optional(),
});

export default getUsersSchema;
