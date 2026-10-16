import express from "express";
import { protect, allowedTo } from "../middlewares/auth.middleware.js";
import { validate, validateQuery } from "../middlewares/validation.middleware.js";

// Validation Schemas
import { createUserSchema } from "../validations/users/createUser.js";
import { updateProfileSchema } from "../validations/users/updateProfile.js";
import { adminChangePasswordSchema } from "../validations/users/adminChangePassword.js";
import { updateUserStatusSchema } from "../validations/users/updateUserStatus.js";
import { getUsersSchema } from "../validations/users/getUsers.js";

// Controllers
import { createUser } from "../controller/users/createUser.controller.js";
import { updateProfile } from "../controller/users/updateProfile.controller.js";
import { adminChangePassword } from "../controller/users/adminChangePassword.controller.js";
import { updateUserStatus } from "../controller/users/updateUserStatus.controller.js";
import { getUsers } from "../controller/users/getUsers.controller.js";
import { getUserById } from "../controller/users/getUserById.controller.js";

const router = express.Router();

// 1. جلب قائمة المستخدمين والمتاجر مع الترقيم والفلترة والبحث (Private - Admin only)
router.get("/", protect, allowedTo("admin"), validateQuery(getUsersSchema), getUsers);

// 2. إنشاء حساب متجر جديد بواسطة المسؤول (Private - Admin only)
router.post("/", protect, allowedTo("admin"), validate(createUserSchema), createUser);

// 3. تعديل البيانات الشخصية للمستخدم الحالي (Private - Owner)
// يُعرّف قبل المسارات المتغيرة (/:id)
router.patch("/profile", protect, validate(updateProfileSchema), updateProfile);

// 4. جلب بيانات مستخدم محدد بالمعرف (Private - Admin or Account Owner)
router.get("/:id", protect, getUserById);

// 5. تغيير كلمة المرور لأي مستخدم بواسطة المسؤول (Private - Admin only)
router.patch("/:id/password", protect, allowedTo("admin"), validate(adminChangePasswordSchema), adminChangePassword);

// 6. إيقاف أو تفعيل حساب أي مستخدم بواسطة المسؤول (Private - Admin only)
router.patch("/:id/status", protect, allowedTo("admin"), validate(updateUserStatusSchema), updateUserStatus);

export default router;
