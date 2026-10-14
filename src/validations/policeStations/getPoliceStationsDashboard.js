import { z } from "zod";

export const getPoliceStationsDashboardSchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    limit: z.coerce.number().int().positive().max(100).default(10).optional(),
    search: z.string().trim().optional(),
    area: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    is_active: z.enum(["true", "false", "all"]).optional(),
});

export default getPoliceStationsDashboardSchema;
