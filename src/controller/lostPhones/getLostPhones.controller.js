import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { getPagination, buildPagination } from "../../utils/pagination.js";
import { CACHE_KEYS, CACHE_TTL } from "../../config/cache.js";
import { getCache, setCache } from "../../services/cache.service.js";

// @Desc استعراض وبحث بلاغات الهواتف المفقودة مع الصور والترقيم
// @Route GET /api/lost-phones
// @Access Public (مع مراعاة قواعد الخصوصية وظهور البلاغات) / Privileged (Admin)
export const getLostPhones = AsyncHandler(async (req, res, next) => {
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
    const isAdmin = req.user?.role === "admin";

    // 1. مفتاح الكاش للطلبات العامة غير الإدارية
    const cacheQueryKey = `p${parsedPage}_l${parsedLimit}_kw${searchTerm}_st${status || ""}_cf${created_from || ""}_ct${created_to || ""}`;
    const cacheKey = CACHE_KEYS.LOST_PHONES_LIST(cacheQueryKey);

    if (!isAdmin) {
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return sendSuccess(res, {
                statusCode: 200,
                message: "تم جلب بلاغات الهواتف المفقودة بنجاح",
                results: cachedData.reports,
                pagination: cachedData.pagination,
            });
        }
    }

    // 2. بناء استعلام Supabase مع جلب الصور المرتبطة وبيانات ناشر البلاغ والعدد الإجمالي واستبعاد المحذوفة منطقياً
    let query = supabase
        .from("lost_phones")
        .select("*, phone_images(*), user:users!created_by(owner_name, shop_name, phone, area, address)", { count: "exact" })
        .eq("is_deleted", false);

    // 3. تطبيق قواعد الرؤية والخصوصية
    const now = new Date().toISOString();
    const foundCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    if (!isAdmin) {
        // المستخدمون العاديون والزوار: حظر البلاغات المخفية تماماً
        // إظهار بلاغات lost السارية وإظهار found خلال 24 ساعة فقط
        if (status === "lost") {
            query = query
                .eq("status", "lost")
                .or(`visible_until.gte.${now},visible_until.is.null`);
        } else if (status === "found") {
            query = query
                .eq("status", "found")
                .gte("found_at", foundCutoff);
        } else {
            // البلاغات الافتراضية المسموح برؤيتها
            query = query.or(
                `and(status.eq.lost,or(visible_until.gte.${now},visible_until.is.null)),and(status.eq.found,found_at.gte.${foundCutoff})`
            );
        }
    } else {
        // المسؤول: يمكنه فلترة أي حالة بما فيها hidden و found القديمة
        if (status) {
            query = query.eq("status", status);
        }
    }

    // 4. تطبيق فلاتر البحث بالكلمة المفتاحية (Keyword) عبر تفاصيل ومواصفات الجهاز فقط (باستثناء أرقام الاتصال contact و contact2)
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
        return next(new ApiError("فشل في استعلام بلاغات الهواتف المفقودة", 500));
    }

    const pagination = buildPagination(count || 0, parsedPage, parsedLimit);

    // 6. حفظ النتيجة في الكاش للطلبات العامة
    if (!isAdmin) {
        await setCache(cacheKey, { reports: reports || [], pagination }, CACHE_TTL.LOST_PHONES);
    }

    // 7. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب بلاغات الهواتف المفقودة بنجاح",
        results: reports || [],
        pagination,
    });
});

export default getLostPhones;
