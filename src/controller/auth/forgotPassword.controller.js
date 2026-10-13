import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import { sendSuccess } from "../../utils/response.js";
import { normalizePhone } from "../../utils/phone.js";

// @Desc تقديم طلب استعادة كلمة المرور للمراجعة من قبل مسؤول النظام
// @Route POST /api/auth/forgot-password
// @Access Public
export const forgotPassword = AsyncHandler(async (req, res) => {
    const { phone } = req.body;
    const normalizedPhone = normalizePhone(phone);

    // 1. البحث عن المستخدم برقم الهاتف دون الكشف عن وجوده للعميل
    const { data: user } = await supabase
        .from("users")
        .select("id, phone, status")
        .eq("phone", normalizedPhone)
        .maybeSingle();

    // 2. تسجيل الطلب في جدول سجل العمليات (audit_logs) في حال وجود الحساب
    // ملاحظة معمارية: جدول audit_logs يستخدم entity_id من نوع BIGINT بينما users.id من نوع UUID،
    // لذلك يتم ربط الطلب عبر حقل user_id (UUID) وتعيين entity_id كـ null.
    // جدول audit_logs لا يحتوي على حقول دورة حياة الطلبات (مثل حالة الموافقة/الرفض وتاريخ الإجراء)،
    // لذا يتم تسجيل الطلب لأغراض التوثيق والتدقيق الإداري دون اختراع جداول غير مصرح بها.
    if (user) {
        try {
            // استخراج عنوان IP بأمان بصيغة تناسب حقل INET في PostgreSQL
            let clientIp = req.ip || req.socket?.remoteAddress || null;
            if (clientIp === "::1" || clientIp === "127.0.0.1") {
                clientIp = "127.0.0.1";
            }

            await supabase.from("audit_logs").insert({
                user_id: user.id,
                action: "PASSWORD_RESET_REQUEST",
                entity_type: "users",
                entity_id: null,
                new_data: {
                    phone_suffix: normalizedPhone.slice(-4),
                    request_type: "admin_manual_review",
                    account_active: user.status,
                },
                ip_address: clientIp,
                user_agent: req.get("user-agent") || null,
            });
        } catch (auditError) {
            console.error("⚠️ فشل تسجيل طلب استعادة كلمة المرور في audit_logs:", auditError.message);
        }
    }

    // 3. إرجاع رد موحد بغض النظر عما إذا كان الحساب مسجلاً أم لا، لمنع هجمات الاستكشاف (Account Enumeration)
    return sendSuccess(res, {
        statusCode: 200,
        message:
            "إذا كان رقم الهاتف مسجلاً في النظام، فقد تم إرسال طلب إعادة تعيين كلمة المرور إلى إدارة النظام للمراجعة.",
    });
});

export default forgotPassword;
