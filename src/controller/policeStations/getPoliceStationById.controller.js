import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { isValidNumericId } from "../../utils/validators.js";
import { CACHE_KEYS, CACHE_TTL } from "../../config/cache.js";
import { getCache, setCache } from "../../services/cache.service.js";

// @Desc جلب تفاصيل قسم شرطة محدد بالمعرف
// @Route GET /api/police-stations/:id
// @Access Public
export const getPoliceStationById = AsyncHandler(async (req, res, next) => {
    const stationId = Number(req.params.id);

    // 1. التحقق من صحة المعرف الرقمي
    if (!isValidNumericId(stationId)) {
        return next(new ApiError("معرف قسم الشرطة غير صالح", 400));
    }

    const cacheKey = CACHE_KEYS.POLICE_STATION(stationId);

    // 2. التحقق من الكاش
    const cachedStation = await getCache(cacheKey);
    if (cachedStation) {
        if (!cachedStation.is_active) {
            return next(new ApiError("قسم الشرطة غير موجود", 404));
        }
        return sendSuccess(res, {
            statusCode: 200,
            message: "تم جلب بيانات قسم الشرطة بنجاح",
            results: cachedStation,
        });
    }

    // 3. الاستعلام من قاعدة البيانات
    const { data: station, error } = await supabase
        .from("police_stations")
        .select("*")
        .eq("id", stationId)
        .maybeSingle();

    if (error) {
        return next(new ApiError("فشل في استعلام قسم الشرطة", 500));
    }

    // 4. التحقق من الوجود وحالة التفعيل (الاستبعاد في حال كان غير نشط)
    if (!station || !station.is_active) {
        return next(new ApiError("قسم الشرطة غير موجود", 404));
    }

    // 5. حفظ في الكاش
    await setCache(cacheKey, station, CACHE_TTL.POLICE_STATIONS);

    // 6. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب بيانات قسم الشرطة بنجاح",
        results: station,
    });
});

export default getPoliceStationById;
