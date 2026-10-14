import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { getPagination, buildPagination } from "../../utils/pagination.js";
import { normalizePhone } from "../../utils/phone.js";
import { CACHE_KEYS, CACHE_TTL } from "../../config/cache.js";
import { getCache, setCache } from "../../services/cache.service.js";

// @Desc جلب قائمة أقسام الشرطة النشطة مع الفرز والبحث والترقيم
// @Route GET /api/police-stations
// @Access Public
export const getPoliceStations = AsyncHandler(async (req, res, next) => {
    const { page = 1, limit = 10, search, area, phone } = req.query;
    const { from, to, page: parsedPage, limit: parsedLimit } = getPagination(page, limit);

    // 1. مفتاح التخزين المؤقت (Cache-aside)
    const cacheQueryKey = `p${parsedPage}_l${parsedLimit}_s${search || ""}_a${area || ""}_ph${phone || ""}`;
    const cacheKey = CACHE_KEYS.POLICE_STATIONS_LIST(cacheQueryKey);

    // 2. التحقق من الكاش للمستخدمين غير المسجلين (قراءة عامة)
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
        return sendSuccess(res, {
            statusCode: 200,
            message: "تم جلب أقسام الشرطة بنجاح",
            results: cachedData.stations,
            pagination: cachedData.pagination,
        });
    }

    // 3. بناء استعلام Supabase مع حساب العدد الإجمالي
    let query = supabase
        .from("police_stations")
        .select("*", { count: "exact" })
        .eq("is_active", true);

    if (search) {
        query = query.ilike("station_name", `%${search.trim()}%`);
    }

    if (area) {
        query = query.ilike("area", `%${area.trim()}%`);
    }

    if (phone) {
        const cleanedPhone = normalizePhone(phone) || phone.trim();
        query = query.ilike("phone_number", `%${cleanedPhone}%`);
    }

    const { data: stations, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

    if (error) {
        return next(new ApiError("فشل في استعلام أقسام الشرطة", 500));
    }

    const pagination = buildPagination(count || 0, parsedPage, parsedLimit);

    // 4. حفظ النتيجة في الكاش
    await setCache(cacheKey, { stations: stations || [], pagination }, CACHE_TTL.POLICE_STATIONS);

    // 5. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب أقسام الشرطة بنجاح",
        results: stations || [],
        pagination,
    });
});

export default getPoliceStations;
