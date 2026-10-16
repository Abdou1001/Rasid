import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { getPagination, buildPagination } from "../../utils/pagination.js";
import { CACHE_KEYS, CACHE_TTL } from "../../config/cache.js";
import { getCache, setCache } from "../../services/cache.service.js";

// @Desc استرجاع كافة بلاغات الهواتف المفقودة المنشأة بواسطة المستخدم الحالي فقط مع الصور
// @Route GET /api/lost-phones/my-reports
// @Access Private (Authenticated User)
export const getMyLostPhones = AsyncHandler(async (req, res, next) => {
    const userId = req.user.id;
    const {
        page = 1,
        limit = 10,
        keyword,
        search,
        status,
        created_from,
        created_to,
    } = req.query;

    const searchTerm = (keyword || search || "").trim();
    const { from, to, page: parsedPage, limit: parsedLimit } = getPagination(page, limit);

    // 1. مفتاح الكاش مخصص للمستخدم الحالي وفلاتره لضمان عدم تداخل البيانات
    const cacheQueryKey = `p${parsedPage}_l${parsedLimit}_kw${searchTerm}_st${status || ""}_cf${created_from || ""}_ct${created_to || ""}`;
    const cacheKey = CACHE_KEYS.MY_LOST_PHONES
        ? CACHE_KEYS.MY_LOST_PHONES(userId, cacheQueryKey)
        : `lost_phones:my:${userId}:${cacheQueryKey}`;

    const cachedData = await getCache(cacheKey);
    if (cachedData) {
        return sendSuccess(res, {
            statusCode: 200,
            message: "تم جلب بلاغاتي بنجاح",
            results: cachedData.reports,
            pagination: cachedData.pagination,
        });
    }

    // 2. بناء استعلام Supabase: بلاغات المستخدم الحالي فقط، واستبعاد البلاغات المحذوفة منطقياً
    let query = supabase
        .from("lost_phones")
        .select("*, phone_images(*)", { count: "exact" })
        .eq("created_by", userId)
        .eq("is_deleted", false);

    // 3. فلترة الحالة إذا تم تحديدها (يسمح للمالك برؤية بلاغاته بكل الحالات: lost, found, hidden ما لم يحدد فلتر معين)
    if (status && status !== "all") {
        query = query.eq("status", status);
    }

    // 4. تطبيق البحث بالكلمات المفتاحية عبر مواصفات الجهاز فقط
    if (searchTerm) {
        query = query.or(
            `brand.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,serial_number.ilike.%${searchTerm}%,imei.ilike.%${searchTerm}%,imei2.ilike.%${searchTerm}%,color.ilike.%${searchTerm}%,storage.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`
        );
    }

    if (created_from) {
        query = query.gte("created_at", created_from);
    }

    if (created_to) {
        query = query.lte("created_at", created_to);
    }

    // 5. الترتيب والترقيم
    const { data: reports, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

    if (error) {
        return next(new ApiError("فشل في استعلام بلاغات المستخدم", 500));
    }

    const pagination = buildPagination(count || 0, parsedPage, parsedLimit);

    // 6. حفظ النتائج في الكاش
    await setCache(cacheKey, { reports: reports || [], pagination }, CACHE_TTL.LOST_PHONES);

    // 7. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب بلاغاتي بنجاح",
        results: reports || [],
        pagination,
    });
});

export default getMyLostPhones;
