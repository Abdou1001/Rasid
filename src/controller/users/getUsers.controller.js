import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { getPagination, buildPagination } from "../../utils/pagination.js";

// @Desc جلب قائمة المستخدمين والمتاجر مع الترقيم والبحث والفلترة (خاص بالمسؤول)
// @Route GET /api/users
// @Access Private (Admin only)
export const getUsers = AsyncHandler(async (req, res, next) => {
    const {
        page = 1,
        limit = 10,
        keyword,
        search,
        role,
        status,
        created_from,
        created_to,
    } = req.query;

    const searchTerm = (keyword || search || "").trim();
    const { from, to, page: parsedPage, limit: parsedLimit } = getPagination(page, limit);

    // 1. بناء استعلام Supabase مع استبعاد حقول الأمان الحساسة مثل كلمة المرور
    let query = supabase
        .from("users")
        .select("id, shop_name, owner_name, area, address, phone, role, status, created_at, updated_at", {
            count: "exact",
        });

    // 2. تطبيق فلتر الدور (Role)
    if (role) {
        query = query.eq("role", role);
    }

    // 3. تطبيق فلتر حالة الحساب (نشط / موقف)
    if (status !== undefined && status !== "") {
        const isStatusActive = status === true || status === "true";
        query = query.eq("status", isStatusActive);
    }

    // 4. تطبيق البحث النصي السريع عبر الاسم، اسم المتجر، الهاتف، والمنطقة
    if (searchTerm) {
        query = query.or(
            `shop_name.ilike.%${searchTerm}%,owner_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,area.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%`
        );
    }

    // 5. تطبيق فلترة التاريخ
    if (created_from) {
        query = query.gte("created_at", created_from);
    }

    if (created_to) {
        query = query.lte("created_at", created_to);
    }

    // 6. الترتيب الزمني والترقيم
    const { data: users, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

    if (error) {
        return next(new ApiError("فشل في استعلام قائمة المستخدمين", 500));
    }

    const pagination = buildPagination(count || 0, parsedPage, parsedLimit);

    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب قائمة المستخدمين بنجاح",
        results: users || [],
        pagination,
    });
});

export default getUsers;
