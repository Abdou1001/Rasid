import { env } from "./env.js";

/**
 * أسماء حاويات التخزين (Storage Buckets) في Supabase
 */
export const STORAGE_BUCKETS = {
    PHONE_IMAGES: env.STORAGE_BUCKET_NAME || "phone-images",
};

export default STORAGE_BUCKETS;
