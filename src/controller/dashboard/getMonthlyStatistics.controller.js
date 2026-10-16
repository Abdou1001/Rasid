import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { CACHE_KEYS, CACHE_TTL } from "../../config/cache.js";
import { getCache, setCache } from "../../services/cache.service.js";

// @Desc جلب الإحصائيات الشهرية للرسم البياني للوحة تحكم المسؤول
// @Route GET /api/dashboard/monthly-statistics
// @Access Private (Admin only)
export const getMonthlyStatistics = AsyncHandler(async (req, res, next) => {
    const month = Number(req.query.month);
    const year = Number(req.query.year);

    // 1. التحقق من صحة الشهر والسنة
    if (
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12 ||
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 2999
    ) {
        return next(new ApiError("الشهر أو السنة غير صالحين", 400));
    }

    // 2. التحقق من الكاش
    const cacheKey = CACHE_KEYS.DASHBOARD_MONTHLY(year, month);
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
        return sendSuccess(res, {
            statusCode: 200,
            message: "تم جلب الإحصائيات الشهرية بنجاح",
            results: cachedData,
        });
    }

    // 3. حساب حدود الشهر بتوقيت اليمن Asia/Aden (توقيت UTC+03:00 الثابت)
    const formattedMonth = String(month).padStart(2, "0");
    const monthStart = `${year}-${formattedMonth}-01T00:00:00+03:00`;

    let nextMonthStart;
    if (month === 12) {
        nextMonthStart = `${year + 1}-01-01T00:00:00+03:00`;
    } else {
        const nextMonthFormatted = String(month + 1).padStart(2, "0");
        nextMonthStart = `${year}-${nextMonthFormatted}-01T00:00:00+03:00`;
    }

    // 4. تنفيذ استعلامات العد بالتوازي
    const [
        { count: phonesAdded, error: errPhones },
        { count: usersAdded, error: errUsers },
    ] = await Promise.all([
        supabase
            .from("lost_phones")
            .select("id", { count: "exact", head: true })
            .gte("created_at", monthStart)
            .lt("created_at", nextMonthStart),

        supabase
            .from("users")
            .select("id", { count: "exact", head: true })
            .gte("created_at", monthStart)
            .lt("created_at", nextMonthStart),
    ]);

    // 5. التحقق من الأخطاء
    if (errPhones || errUsers) {
        console.error("Monthly statistics query error:", {
            phones: errPhones,
            users: errUsers,
        });

        return next(
            new ApiError(
                "فشل في استعلام الإحصائيات الشهرية من قاعدة البيانات",
                500
            )
        );
    }

    const monthlyStats = {
        month,
        year,
        phonesAdded: phonesAdded ?? 0,
        usersAdded: usersAdded ?? 0,
    };

    // 6. تخزين النتائج مؤقتًا
    await setCache(
        cacheKey,
        monthlyStats,
        CACHE_TTL.DASHBOARD_MONTHLY
    );

    // 7. إرجاع النتائج
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب الإحصائيات الشهرية بنجاح",
        results: monthlyStats,
    });
});

export default getMonthlyStatistics;
