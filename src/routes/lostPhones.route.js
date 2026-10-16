import express from "express";
import { protect, allowedTo, optionalAuth } from "../middlewares/auth.middleware.js";
import { validate, validateQuery } from "../middlewares/validation.middleware.js";
import { uploadMultipleImages } from "../middlewares/upload.middleware.js";

// Validation Schemas
import { createLostPhoneSchema } from "../validations/lostPhones/createLostPhone.js";
import { getLostPhonesSchema } from "../validations/lostPhones/getLostPhones.js";
import { getLostPhonesDashboardSchema } from "../validations/lostPhones/getLostPhonesDashboard.js";
import { getMyLostPhonesSchema } from "../validations/lostPhones/getMyLostPhones.js";
import { updateLostPhoneSchema } from "../validations/lostPhones/updateLostPhone.js";
import { updateLostPhoneStatusSchema } from "../validations/lostPhones/updateLostPhoneStatus.js";

// Controllers
import { createLostPhone } from "../controller/lostPhones/createLostPhone.controller.js";
import { getLostPhones } from "../controller/lostPhones/getLostPhones.controller.js";
import { getLostPhonesDashboard } from "../controller/lostPhones/getLostPhonesDashboard.controller.js";
import { getMyLostPhones } from "../controller/lostPhones/getMyLostPhones.controller.js";
import { getLostPhoneById } from "../controller/lostPhones/getLostPhoneById.controller.js";
import { updateLostPhone } from "../controller/lostPhones/updateLostPhone.controller.js";
import { updateLostPhoneStatus } from "../controller/lostPhones/updateLostPhoneStatus.controller.js";
import { deleteLostPhone } from "../controller/lostPhones/deleteLostPhone.controller.js";

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

// 2. استرجاع بلاغات المستخدم المسجّل دخوله فقط (Private - My Reports)
// يُعرّف قبل المسارات المتغيرة (/:id)
router.get(
    "/my-reports",
    protect,
    validateQuery(getMyLostPhonesSchema),
    getMyLostPhones
);

// 3. تعديل حالة البلاغ (lost, found, hidden) مع ضوابط الصلاحيات (Admin / Owner)
// يُعرّف قبل المسار العام (/:id)
router.patch(
    "/:id/status",
    protect,
    validate(updateLostPhoneStatusSchema),
    updateLostPhoneStatus
);

// 4. استعراض وبحث بلاغات الهواتف المفقودة للتطبيق العادي (Public / Privileged)
router.get("/", optionalAuth, validateQuery(getLostPhonesSchema), getLostPhones);

// 5. إنشاء بلاغ هاتف مفقود جديد مع صور اختيارية (Private)
// Multer يعمل أولاً لتفكيك الحقول النصية والملفات قبل التحقق بواسطة Zod
router.post(
    "/",
    protect,
    uploadMultipleImages("images", 5),
    validate(createLostPhoneSchema),
    createLostPhone
);

// 6. استرجاع تفاصيل بلاغ محدد بالمعرف مع صوره (Public / Privileged)
router.get("/:id", optionalAuth, getLostPhoneById);

// 7. تعديل بيانات وصور البلاغ (Private - المالك أو المسؤول)
// يدعم كلاً من application/json و multipart/form-data مع إمكانية رفع صور جديدة وحذف صور محددة
router.patch(
    "/:id",
    protect,
    uploadMultipleImages("images", 5),
    (req, res, next) => {
        // في حال رفع صور فقط دون حقول نصية في body، يُمرر الطلب للكونترولر لمعالجتها
        if (req.files && req.files.length > 0 && Object.keys(req.body || {}).length === 0) {
            return next();
        }
        return validate(updateLostPhoneSchema)(req, res, next);
    },
    updateLostPhone
);

// 8. الحذف المنطقي للبلاغ (Soft Delete - Private - المالك أو المسؤول)
router.delete("/:id", protect, deleteLostPhone);

export default router;
