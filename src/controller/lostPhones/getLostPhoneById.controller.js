import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { isValidNumericId } from "../../utils/validators.js";
import { CACHE_KEYS, CACHE_TTL } from "../../config/cache.js";
import { getCache, setCache } from "../../services/cache.service.js";

// @Desc استرجاع تفاصيل بلاغ هاتف مفقود محدد مع صوره
// @Route GET /api/lost-phones/:id
// @Access Public / Privileged (مع تطبيق قواعد الرؤية)
export const getLostPhoneById = AsyncHandler(async (req, res, next) => {
    const reportId = Number(req.params.id);

    // 1. التحقق من صحة المعرف الرقمي
    if (!isValidNumericId(reportId)) {
        return next(new ApiError("معرف البلاغ غير صالح", 400));
    }

    const isAdmin = req.user?.role === "admin";
    const cacheKey = CACHE_KEYS.LOST_PHONE(reportId);

    // 2. التحقق من الكاش للطلبات العامة
    if (!isAdmin) {
        const cachedReport = await getCache(cacheKey);
        if (cachedReport) {
            return sendSuccess(res, {
                statusCode: 200,
                message: "تم جلب تفاصيل البلاغ بنجاح",
                results: cachedReport,
            });
        }
    }

    // 3. الاستعلام من قاعدة البيانات مع جلب الصور المرتبطة
    const { data: report, error } = await supabase
        .from("lost_phones")
        .select("*, phone_images(*)")
        .eq("id", reportId)
        .maybeSingle();

    if (error) {
        return next(new ApiError("فشل في استعلام تفاصيل البلاغ", 500));
    }

    if (!report) {
        return next(new ApiError("بلاغ الهاتف غير موجود", 404));
    }

    // 4. تطبيق قواعد الرؤية والخصوصية
    const isCreator = req.user && req.user.id === report.created_by;
    const now = new Date();

    if (!isAdmin && !isCreator) {
        // حظر البلاغات المخفية
        if (report.status === "hidden") {
            return next(new ApiError("بلاغ الهاتف غير موجود", 404));
        }

        // حظر البلاغات المنتهية فترة رؤيتها
        if (report.status === "lost" && report.visible_until && new Date(report.visible_until) < now) {
            return next(new ApiError("بلاغ الهاتف غير موجود", 404));
        }

        // حظر بلاغات found التي تجاوزت 24 ساعة
        if (report.status === "found" && report.found_at) {
            const foundExpiry = new Date(new Date(report.found_at).getTime() + 24 * 60 * 60 * 1000);
            if (foundExpiry < now) {
                return next(new ApiError("بلاغ الهاتف غير موجود", 404));
            }
        }
    }

    // 5. حفظ في الكاش للبلاغات العامة النشطة
    if (!isAdmin && report.status === "lost") {
        await setCache(cacheKey, report, CACHE_TTL.LOST_PHONES);
    }

    // 6. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب تفاصيل البلاغ بنجاح",
        results: report,
    });
});

export default getLostPhoneById;
