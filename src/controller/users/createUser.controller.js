import bcrypt from "bcryptjs";
import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { normalizePhone } from "../../utils/phone.js";
import { deleteByPattern } from "../../services/cache.service.js";
import { sanitizeUser } from "../../utils/token.js";

// @Desc إنشاء حساب متجر جديد بواسطة مسؤول النظام (Admin)
// @Route POST /api/users
// @Access Private (Admin only)
export const createUser = AsyncHandler(async (req, res, next) => {
    const { shop_name, owner_name, area, address, phone, password } = req.body;
    const normalizedPhone = normalizePhone(phone);

    // 1. التحقق من عدم تكرار رقم الهاتف
    const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id")
        .eq("phone", normalizedPhone)
        .maybeSingle();

    if (checkError) {
        return next(new ApiError("فشل في التحقق من رقم الهاتف", 500));
    }

    if (existingUser) {
        return next(new ApiError("رقم الهاتف مسجل بالفعل لمتجر آخر", 409));
    }

    // 2. تشفير كلمة المرور الأولية بواسطة bcrypt
    const password_hash = await bcrypt.hash(password, 12);

    // 3. إضافة الحساب مع فرض role='user' و status=true تلقائياً
    const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
            shop_name: shop_name.trim(),
            owner_name: owner_name.trim(),
            area: area ? area.trim() : null,
            address: address ? address.trim() : null,
            phone: normalizedPhone,
            password_hash,
            role: "user", // فرض دور المستخدم العادي (محل تجاري)
            status: true, // تفعيل الحساب افتراضياً
        })
        .select("id, shop_name, owner_name, area, address, phone, role, status, created_at, updated_at")
        .single();

    if (insertError) {
        if (insertError.code === "23505") {
            return next(new ApiError("رقم الهاتف مسجل بالفعل", 409));
        }
        return next(new ApiError("فشل في إنشاء حساب المتجر في قاعدة البيانات", 500));
    }

    // 4. إبطال الكاش الخاص بقوائم المستخدمين وإحصائيات لوحة التحكم
    await deleteByPattern("users:*");
    await deleteByPattern("dashboard:*");

    // 5. إرجاع الرد القياسي بالحساب المنشأ بدون كلمة المرور المشفرة
    return sendSuccess(res, {
        statusCode: 201,
        message: "تم إنشاء حساب المتجر بنجاح",
        results: {
            user: sanitizeUser(newUser),
        },
    });
});

export default createUser;
