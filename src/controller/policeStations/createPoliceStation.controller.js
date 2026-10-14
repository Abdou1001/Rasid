import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { normalizePhone } from "../../utils/phone.js";
import { deleteByPattern } from "../../services/cache.service.js";

// @Desc إنشاء قسم شرطة جديد بواسطة المسؤول
// @Route POST /api/police-stations
// @Access Private (Admin only)
export const createPoliceStation = AsyncHandler(async (req, res, next) => {
    const { station_name, area, phone_number, address, notes } = req.body;

    // توحيد رقم الهاتف إن كان رقماً يمنياً أو الاحتفاظ به بصيغته المنظفة
    const cleanedPhone = normalizePhone(phone_number) || phone_number.trim();

    // 1. إدراج السجل في قاعدة البيانات وفرض is_active=true وتجاهل المعرفات والتواريخ الخارجية
    const { data: newStation, error } = await supabase
        .from("police_stations")
        .insert({
            station_name: station_name.trim(),
            area: area.trim(),
            phone_number: cleanedPhone,
            address: address ? address.trim() : null,
            notes: notes ? notes.trim() : null,
            is_active: true,
        })
        .select()
        .single();

    if (error || !newStation) {
        return next(new ApiError("فشل في إنشاء قسم الشرطة", 500));
    }

    // 2. إبطال الكاش المرتبط بقوائم أقسام الشرطة
    await deleteByPattern("police_stations:*");

    // 3. تسجيل الإجراء في سجل العمليات والتدقيق (audit_logs)
    try {
        let clientIp = req.ip || req.socket?.remoteAddress || null;
        if (clientIp === "::1" || clientIp === "127.0.0.1") clientIp = "127.0.0.1";

        await supabase.from("audit_logs").insert({
            user_id: req.user.id,
            action: "CREATE_POLICE_STATION",
            entity_type: "police_stations",
            entity_id: newStation.id,
            new_data: {
                station_name: newStation.station_name,
                area: newStation.area,
                phone_number: newStation.phone_number,
                is_active: newStation.is_active,
            },
            ip_address: clientIp,
            user_agent: req.get("user-agent") || null,
        });
    } catch (auditError) {
        console.error("⚠️ فشل تسجيل العملية في audit_logs:", auditError.message);
    }

    // 4. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 201,
        message: "تم إنشاء قسم الشرطة بنجاح",
        results: newStation,
    });
});

export default createPoliceStation;
