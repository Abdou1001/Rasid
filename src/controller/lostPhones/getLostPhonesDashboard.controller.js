import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { getPagination, buildPagination } from "../../utils/pagination.js";

// @Desc استعراض كافة بلاغات الهواتف (المخفية، الظاهرة، المنتهية، والموجودة) للوحة تحكم المسؤول
// @Route GET /api/lost-phones/dashboard
// @Access Private (Admin only)
export const getLostPhonesDashboard = AsyncHandler(async (req, res, next) => {
    const {
        page = 1,
        limit = 10,
        keyword,
        search,
        status,
        is_expired,
        created_from,
        created_to,
    } = req.query;

    const searchTerm = (keyword || search || "").trim();
    const { from, to, page: parsedPage, limit: parsedLimit } = getPagination(page, limit);

    // 1. بناء استعلام Supabase الشامل مع جلب الصور المرتبطة والعدد الكلي دون قيود خصوصية
    let query = supabase
        .from("lost_phones")
        .select("*, phone_images(*)", { count: "exact" });

    // 2. فلترة الحالة إذا تم تحديدها
    if (status && status !== "all") {
        query = query.eq("status", status);
    }

    // 3. فلترة البلاغات المنتهية أو السارية (بناءً على visible_until)
    const now = new Date().toISOString();
    if (is_expired === "true") {
        query = query.lt("visible_until", now);
    } else if (is_expired === "false") {
        query = query.or(`visible_until.gte.${now},visible_until.is.null`);
    }

    // 4. تطبيق البحث بالكلمة المفتاحية عبر مواصفات الجهاز فقط (باستثناء أرقام الاتصال)
    if (searchTerm) {
        query = query.or(
            `brand.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,serial_number.ilike.%${searchTerm}%,imei.ilike.%${searchTerm}%,imei2.ilike.%${searchTerm}%,color.ilike.%${searchTerm}%,storage.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`
        );
    }

    // 5. فلترة التاريخ
    if (created_from) {
        query = query.gte("created_at", created_from);
    }

    if (created_to) {
        query = query.lte("created_at", created_to);
    }

    // 6. الترتيب والترقيم
    const { data: reports, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

    if (error) {
        return next(new ApiError("فشل في استعلام بلاغات الهواتف للوحة التحكم", 500));
    }

    const pagination = buildPagination(count || 0, parsedPage, parsedLimit);

    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب بلاغات الهواتف للوحة التحكم بنجاح",
        results: reports || [],
        pagination,
    });
});

export default getLostPhonesDashboard;
