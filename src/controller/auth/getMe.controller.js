import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { sanitizeUser } from "../../utils/token.js";

// @Desc جلب بيانات المستخدم الحالي المسجل دخوله
// @Route GET /api/auth/me
// @Access Private
export const getMe = AsyncHandler(async (req, res, next) => {
    // التحقق المباشر من قاعدة البيانات للتأكد من حداثة البيانات وحالة الحساب
    const { data: user, error } = await supabase
        .from("users")
        .select("id, shop_name, owner_name, area, address, phone, role, status, created_at, updated_at")
        .eq("id", req.user.id)
        .maybeSingle();

    if (error) {
        return next(new ApiError("فشل في استعلام بيانات المستخدم", 500));
    }

    if (!user) {
        return next(new ApiError("المستخدم غير موجود", 404));
    }

    if (!user.status) {
        return next(new ApiError("تم تجميد هذا الحساب، يرجى التواصل مع الإدارة", 403));
    }

    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب بيانات المستخدم بنجاح",
        results: {
            user: sanitizeUser(user),
        },
    });
});

export default getMe;
