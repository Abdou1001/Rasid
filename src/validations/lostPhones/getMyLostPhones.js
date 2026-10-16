import { z } from "zod";

export const getMyLostPhonesSchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    limit: z.coerce.number().int().positive().max(100).default(10).optional(),
    keyword: z.string().trim().optional(),
    search: z.string().trim().optional(),
    status: z.enum(["lost", "found", "hidden", "all"]).optional(),
    created_from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    created_to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export default getMyLostPhonesSchema;
