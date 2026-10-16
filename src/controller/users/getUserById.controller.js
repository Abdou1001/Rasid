import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { isValidUUID } from "../../utils/validators.js";

// @Desc جلب بيانات مستخدم محدد بالمعرف (متاح للمسؤول وصاحب الحساب فقط)
// @Route GET /api/users/:id
// @Access Private (Admin or Account Owner)
export const getUserById = AsyncHandler(async (req, res, next) => {
    const targetUserId = req.params.id;

    // 1. التحقق من صحة المعرف بصيغة UUID
    if (!isValidUUID(targetUserId)) {
        return next(new ApiError("معرف المستخدم غير صالح", 400));
    }

    // 2. التحقق من الصلاحيات: مسموح للمسؤول (Admin) أو لصاحب الحساب نفسه (Owner)
    const isAdmin = req.user?.role === "admin";
    const isOwner = req.user?.id === targetUserId;

    if (!isAdmin && !isOwner) {
        return next(new ApiError("غير مصرح لك بالوصول إلى بيانات هذا الحساب", 403));
    }

    // 3. الاستعلام السريع من قاعدة البيانات مع استبعاد كلمة المرور
    const { data: user, error } = await supabase
        .from("users")
        .select("id, shop_name, owner_name, area, address, phone, role, status, created_at, updated_at")
        .eq("id", targetUserId)
        .maybeSingle();

    if (error) {
        return next(new ApiError("فشل في استعلام بيانات المستخدم", 500));
    }

    if (!user) {
        return next(new ApiError("المستخدم غير موجود", 404));
    }

    // 4. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: "تم جلب بيانات المستخدم بنجاح",
        results: user,
    });
});

export default getUserById;
