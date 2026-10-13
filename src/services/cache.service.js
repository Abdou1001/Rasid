import { redis } from "../config/redis.js";

/**
 * خدمة التخزين المؤقت (Redis Cache Service)
 * تدعم الانهيار الصامت (Silent Degradation) بحيث لا يؤدي انقطاع Redis إلى تعطل وظائف النظام الأساسية
 */

export const getCache = async (key) => {
    try {
        if (!redis) return null;
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.error(`⚠️ تعذر قراءة الكاش للمفتاح [${key}]:`, err.message);
        return null;
    }
};

export const setCache = async (key, data, ttl) => {
    try {
        if (!redis) return false;
        const value = JSON.stringify(data);
        if (ttl) {
            await redis.set(key, value, "EX", ttl);
        } else {
            await redis.set(key, value);
        }
        return true;
    } catch (err) {
        console.error(`⚠️ تعذر كتابة الكاش للمفتاح [${key}]:`, err.message);
        return false;
    }
};

export const deleteCache = async (key) => {
    try {
        if (!redis) return false;
        await redis.del(key);
        return true;
    } catch (err) {
        console.error(`⚠️ تعذر حذف الكاش للمفتاح [${key}]:`, err.message);
        return false;
    }
};

export const deleteByPattern = async (pattern) => {
    try {
        if (!redis) return false;
        const keys = await redis.keys(pattern);
        if (keys && keys.length > 0) {
            await redis.del(...keys);
        }
        return true;
    } catch (err) {
        console.error(`⚠️ تعذر مسح الكاش بالنمط [${pattern}]:`, err.message);
        return false;
    }
};

export default {
    getCache,
    setCache,
    deleteCache,
    deleteByPattern,
};
