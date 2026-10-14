import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { getPagination, buildPagination } from "../../utils/pagination.js";
import { normalizePhone } from "../../utils/phone.js";

// @Desc جلب قائمة كافة أقسام الشرطة (النشطة والملغاة) لإدارة لوحة تحكم المسؤول (Dashboard)
// @Route GET /api/police-stations/dashboard
// @Access Private (Admin only)
export const getPoliceStationsDashboard = AsyncHandler(async (req, res, next) => {
    const { page = 1, limit = 10, search, area, phone, is_active } = req.query;
    const { from, to, page: parsedPage, limit: parsedLimit } = getPagination(page, limit);

    // بناء استعلام Supabase دون تقييد الحالة الافتراضية
    let query = supabase
        .from("police_stations")
        .select("*", { count: "exact" });

    // فلترة الحالة إذا تم تحديدها
    if (is_active === "true") {
        query = query.eq("is_active", true);
    } else if (is_active === "false") {
        query = query.eq("is_active", false);
    }

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
        return next(new ApiError("فشل في استعلام أقسام الشرطة للوحة التحكم", 500));
    }

    const pagination = buildPagination(count || 0, parsedPage, parsedLimit);

    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب أقسام الشرطة للوحة التحكم بنجاح",
        results: stations || [],
        pagination,
    });
});

export default getPoliceStationsDashboard;
