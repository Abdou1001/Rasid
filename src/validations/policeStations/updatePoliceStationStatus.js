import { z } from "zod";

export const updatePoliceStationStatusSchema = z.object({
    is_active: z.boolean().optional(),
}).optional();

export default updatePoliceStationStatusSchema;
