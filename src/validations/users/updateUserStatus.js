import { z } from "zod";

export const updateUserStatusSchema = z.object({
    status: z.boolean().optional(),
    reason: z.string().trim().max(500).optional(),
});

export default updateUserStatusSchema;
