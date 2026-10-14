import AsyncHandler from "express-async-handler";
import { supabase } from "../../config/supabase.js";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { isValidNumericId } from "../../utils/validators.js";
import { CACHE_KEYS } from "../../config/cache.js";
import { deleteCache, deleteByPattern } from "../../services/cache.service.js";

// @Desc تفعيل أو تعطيل قسم شرطة بواسطة المسؤول
// @Route PATCH /api/police-stations/:id/status
// @Access Private (Admin only)
export const updatePoliceStationStatus = AsyncHandler(async (req, res, next) => {
    const stationId = Number(req.params.id);

    // 1. التحقق من صحة المعرف الرقمي
    if (!isValidNumericId(stationId)) {
        return next(new ApiError("معرف قسم الشرطة غير صالح", 400));
    }

    const { is_active } = req.body;

    // 2. التحقق من وجود السجل في قاعدة البيانات
    const { data: existingStation, error: checkError } = await supabase
        .from("police_stations")
        .select("*")
        .eq("id", stationId)
        .maybeSingle();

    if (checkError) {
        return next(new ApiError("فشل في استعلام قسم الشرطة", 500));
    }

    if (!existingStation) {
        return next(new ApiError("قسم الشرطة غير موجود", 404));
    }

    // 3. تحديث حالة التفعيل وحقل updated_at دون حذف السجل
    const { data: updatedStation, error: updateError } = await supabase
        .from("police_stations")
        .update({
            is_active,
            updated_at: new Date().toISOString(),
        })
        .eq("id", stationId)
        .select()
        .single();

    if (updateError || !updatedStation) {
        return next(new ApiError("فشل في تحديث حالة قسم الشرطة", 500));
    }

    // 4. إبطال الكاش الخاص بالقسم وقوائم الأقسام
    await deleteCache(CACHE_KEYS.POLICE_STATION(stationId));
    await deleteByPattern("police_stations:*");

    // 5. تسجيل العملية في سجل العمليات audit_logs
    try {
        let clientIp = req.ip || req.socket?.remoteAddress || null;
        if (clientIp === "::1" || clientIp === "127.0.0.1") clientIp = "127.0.0.1";

        await supabase.from("audit_logs").insert({
            user_id: req.user.id,
            action: is_active ? "ACTIVATE_POLICE_STATION" : "DEACTIVATE_POLICE_STATION",
            entity_type: "police_stations",
            entity_id: stationId,
            old_data: { is_active: existingStation.is_active },
            new_data: { is_active: updatedStation.is_active },
            ip_address: clientIp,
            user_agent: req.get("user-agent") || null,
        });
    } catch (auditError) {
        console.error("⚠️ فشل تسجيل العملية في audit_logs:", auditError.message);
    }

    // 6. إرجاع الرد القياسي
    return sendSuccess(res, {
        statusCode: 200,
        message: is_active
            ? "تم تفعيل قسم الشرطة بنجاح"
            : "تم تعطيل قسم الشرطة بنجاح",
        results: updatedStation,
    });
});

export default updatePoliceStationStatus;
