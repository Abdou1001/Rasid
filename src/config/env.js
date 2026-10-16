import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
    PORT: z.coerce.number().default(5000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    SUPABASE_URL: z.string().url("يجب أن يكون SUPABASE_URL رابطاً صالحاً"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "متغير SUPABASE_SERVICE_ROLE_KEY إلزامي ولا يمكن أن يكون فارغاً"),
    JWT_SECRET: z.string().min(1, "متغير JWT_SECRET إلزامي ولا يمكن أن يكون فارغاً"),
    JWT_EXPIRES_IN: z.string().default("7d"),
    FRONTEND_URL: z.string().default("http://localhost:3000"),
    REDIS_URL: z.string().optional(),
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.coerce.number().optional(),
    STORAGE_BUCKET_NAME: z.string().default("phone-images"),
});

const parseEnv = () => {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        console.error("❌ خطأ في التحقق من متغيرات البيئة:");
        result.error.issues.forEach((issue) => {
            console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
        });
        process.exit(1);
    }
    return result.data;
};

export const env = parseEnv();
export default env;
