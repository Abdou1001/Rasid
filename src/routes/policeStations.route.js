import express from "express";
import { protect, allowedTo } from "../middlewares/auth.middleware.js";
import { validate, validateQuery } from "../middlewares/validation.middleware.js";

// Validation Schemas
import { getPoliceStationsSchema } from "../validations/policeStations/getPoliceStations.js";
import { createPoliceStationSchema } from "../validations/policeStations/createPoliceStation.js";
import { updatePoliceStationSchema } from "../validations/policeStations/updatePoliceStation.js";
import { updatePoliceStationStatusSchema } from "../validations/policeStations/updatePoliceStationStatus.js";

// Controllers
import { getPoliceStations } from "../controller/policeStations/getPoliceStations.controller.js";
import { getPoliceStationById } from "../controller/policeStations/getPoliceStationById.controller.js";
import { createPoliceStation } from "../controller/policeStations/createPoliceStation.controller.js";
import { updatePoliceStation } from "../controller/policeStations/updatePoliceStation.controller.js";
import { updatePoliceStationStatus } from "../controller/policeStations/updatePoliceStationStatus.controller.js";

const router = express.Router();

// 1. استعراض أقسام الشرطة النشطة مع الفلترة والترقيم (Public)
router.get("/", validateQuery(getPoliceStationsSchema), getPoliceStations);

// 2. إنشاء قسم شرطة جديد (Admin only)
router.post(
    "/",
    protect,
    allowedTo("admin"),
    validate(createPoliceStationSchema),
    createPoliceStation
);

// 3. تفعيل أو تعطيل قسم شرطة (Admin only) - يُعرّف قبل المعرّف العام لتفادي التعارض
router.patch(
    "/:id/status",
    protect,
    allowedTo("admin"),
    validate(updatePoliceStationStatusSchema),
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
