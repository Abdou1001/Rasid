import express from "express";
import { protect, allowedTo } from "../middlewares/auth.middleware.js";
import { validate, validateQuery } from "../middlewares/validation.middleware.js";

// Validation Schemas
import { getPoliceStationsSchema } from "../validations/policeStations/getPoliceStations.js";
import { getPoliceStationsDashboardSchema } from "../validations/policeStations/getPoliceStationsDashboard.js";
import { createPoliceStationSchema } from "../validations/policeStations/createPoliceStation.js";
import { updatePoliceStationSchema } from "../validations/policeStations/updatePoliceStation.js";

// Controllers
import { getPoliceStations } from "../controller/policeStations/getPoliceStations.controller.js";
import { getPoliceStationsDashboard } from "../controller/policeStations/getPoliceStationsDashboard.controller.js";
import { getPoliceStationById } from "../controller/policeStations/getPoliceStationById.controller.js";
import { createPoliceStation } from "../controller/policeStations/createPoliceStation.controller.js";
import { updatePoliceStation } from "../controller/policeStations/updatePoliceStation.controller.js";
import { updatePoliceStationStatus } from "../controller/policeStations/updatePoliceStationStatus.controller.js";

const router = express.Router();

// 1. استعراض كافة أقسام الشرطة لإدارة لوحة تحكم المسؤول (Dashboard - Admin only)
// يُعرّف أولاً قبل المسارات المتغيرة
router.get(
    "/dashboard",
    protect,
    allowedTo("admin"),
    validateQuery(getPoliceStationsDashboardSchema),
    getPoliceStationsDashboard
);

// 2. استعراض أقسام الشرطة النشطة فقط مع الفلترة والترقيم للتطبيق العادي (Public)
router.get("/", validateQuery(getPoliceStationsSchema), getPoliceStations);

// 3. إنشاء قسم شرطة جديد (Admin only)
router.post(
    "/",
    protect,
    allowedTo("admin"),
    validate(createPoliceStationSchema),
    createPoliceStation
);

// 4. تفعيل أو تعطيل قسم شرطة تلقائياً (Toggle Status - Admin only)
router.patch(
    "/:id/status",
    protect,
    allowedTo("admin"),
    updatePoliceStationStatus
);

// 4. جلب تفاصيل قسم شرطة محدد نشط (Public)
router.get("/:id", getPoliceStationById);

// 5. تعديل بيانات قسم الشرطة (Admin only)
router.patch(
    "/:id",
    protect,
    allowedTo("admin"),
    validate(updatePoliceStationSchema),
    updatePoliceStation
);

export default router;
