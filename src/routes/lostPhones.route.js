import express from "express";
import { protect, allowedTo, optionalAuth } from "../middlewares/auth.middleware.js";
import { validate, validateQuery } from "../middlewares/validation.middleware.js";
import { uploadMultipleImages } from "../middlewares/upload.middleware.js";

// Validation Schemas
import { createLostPhoneSchema } from "../validations/lostPhones/createLostPhone.js";
import { getLostPhonesSchema } from "../validations/lostPhones/getLostPhones.js";
import { getLostPhonesDashboardSchema } from "../validations/lostPhones/getLostPhonesDashboard.js";
import { updateLostPhoneSchema } from "../validations/lostPhones/updateLostPhone.js";
import { updateLostPhoneStatusSchema } from "../validations/lostPhones/updateLostPhoneStatus.js";

// Controllers
import { createLostPhone } from "../controller/lostPhones/createLostPhone.controller.js";
import { getLostPhones } from "../controller/lostPhones/getLostPhones.controller.js";
import { getLostPhonesDashboard } from "../controller/lostPhones/getLostPhonesDashboard.controller.js";
import { getLostPhoneById } from "../controller/lostPhones/getLostPhoneById.controller.js";
import { updateLostPhone } from "../controller/lostPhones/updateLostPhone.controller.js";
import { updateLostPhoneStatus } from "../controller/lostPhones/updateLostPhoneStatus.controller.js";

const router = express.Router();

// 1. استعراض كافة البلاغات (المخفية والظاهرة والمنتهية) لإدارة لوحة تحكم المسؤول (Dashboard - Admin only)
// يُعرّف قبل المسارات المتغيرة (/:id)
router.get(
    "/dashboard",
    protect,
    allowedTo("admin"),
    validateQuery(getLostPhonesDashboardSchema),
    getLostPhonesDashboard
);

// 2. تعديل حالة البلاغ (lost, found, hidden) مع ضوابط الصلاحيات (Admin / Owner)
// يُعرّف قبل المسار العام (/:id)
router.patch(
    "/:id/status",
    protect,
    validate(updateLostPhoneStatusSchema),
    updateLostPhoneStatus
);

// 3. استعراض وبحث بلاغات الهواتف المفقودة للتطبيق العادي (Public / Privileged)
router.get("/", optionalAuth, validateQuery(getLostPhonesSchema), getLostPhones);

// 4. إنشاء بلاغ هاتف مفقود جديد مع صور اختيارية (Private)
// Multer يعمل أولاً لتفكيك الحقول النصية والملفات قبل التحقق بواسطة Zod
router.post(
    "/",
    protect,
    uploadMultipleImages("images", 5),
    validate(createLostPhoneSchema),
    createLostPhone
);

// 5. استرجاع تفاصيل بلاغ محدد بالمعرف مع صوره (Public / Privileged)
router.get("/:id", optionalAuth, getLostPhoneById);

// 6. تعديل بيانات البلاغ (Private - المالك أو المسؤول)
router.patch(
    "/:id",
    protect,
    validate(updateLostPhoneSchema),
    updateLostPhone
);

export default router;
