import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { CACHE_KEYS, CACHE_TTL } from "../../config/cache.js";
import { getCache, setCache } from "../../services/cache.service.js";

// @Desc جلب الإحصائيات العامة الشاملة للوحة تحكم المسؤول (Dashboard Overview)
// @Route GET /api/dashboard/statistics
// @Access Private (Admin only)
export const getDashboardStatistics = AsyncHandler(async (req, res, next) => {
    // 1. التحقق من الكاش
    const cachedStats = await getCache(CACHE_KEYS.DASHBOARD_STATS);

    if (cachedStats) {
        return sendSuccess(res, {
            statusCode: 200,
            message: "تم جلب إحصائيات لوحة التحكم بنجاح",
            results: cachedStats,
        });
    }

    const now = new Date().toISOString();

    // 2. تنفيذ استعلامات العد بالتوازي
    const [
        { count: totalPhones, error: errTotalPhones },
        { count: lostPhones, error: errLostPhones },
        { count: foundPhones, error: errFoundPhones },
        { count: totalUsers, error: errTotalUsers },
    ] = await Promise.all([
        // إجمالي البلاغات
        supabase
            .from("lost_phones")
            .select("id", { count: "exact", head: true }),

        // البلاغات المفقودة التي ما زالت ظاهرة
        supabase
            .from("lost_phones")
            .select("id", { count: "exact", head: true })
            .eq("status", "lost")
            .or(`visible_until.gte.${now},visible_until.is.null`),

        // جميع البلاغات التي تم العثور على هواتفها
        supabase
            .from("lost_phones")
            .select("id", { count: "exact", head: true })
            .eq("status", "found"),

        // إجمالي الحسابات
        supabase
            .from("users")
            .select("id", { count: "exact", head: true }),
    ]);

    // 3. التحقق من الأخطاء
    if (errTotalPhones || errLostPhones || errFoundPhones || errTotalUsers) {
        return next(
            new ApiError(
                "فشل في استعلام إحصائيات لوحة التحكم من قاعدة البيانات",
                500
            )
        );
    }

    const statistics = {
        totalPhones: totalPhones ?? 0,
        lostPhones: lostPhones ?? 0,
        foundPhones: foundPhones ?? 0,
        totalUsers: totalUsers ?? 0,
    };

    // 4. تخزين النتائج مؤقتًا
    await setCache(
        CACHE_KEYS.DASHBOARD_STATS,
        statistics,
        CACHE_TTL.DASHBOARD_STATS
    );

    // 5. إرجاع النتائج
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب إحصائيات لوحة التحكم بنجاح",
        results: statistics,
    });
});

export default getDashboardStatistics;
