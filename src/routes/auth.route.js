import express from "express";
import { protect, allowedTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authRateLimit } from "../middlewares/rateLimit.middleware.js";

// Validation schemas
import { loginSchema } from "../validations/auth/login.js";
import { adminLoginSchema } from "../validations/auth/adminLogin.js";
import { changePasswordSchema } from "../validations/auth/changePassword.js";
import { forgotPasswordSchema } from "../validations/auth/forgotPassword.js";
import { createUserSchema } from "../validations/users/createUser.js";

// Controllers
import { login } from "../controller/auth/login.controller.js";
import { adminLogin } from "../controller/auth/adminLogin.controller.js";
import { logout } from "../controller/auth/logout.controller.js";
import { getMe } from "../controller/auth/getMe.controller.js";
import { changePassword } from "../controller/auth/changePassword.controller.js";
import { forgotPassword } from "../controller/auth/forgotPassword.controller.js";
import { createUser } from "../controller/users/createUser.controller.js";

const router = express.Router();

// 1. تسجيل دخول أصحاب المحلات التجارية
router.post("/login", authRateLimit, validate(loginSchema), login);

// 2. تسجيل دخول المسؤولين
router.post("/admin-login", authRateLimit, validate(adminLoginSchema), adminLogin);

// 3. تسجيل الخروج
router.post("/logout", logout);

// 4. استرجاع بيانات المستخدم الحالي
router.get("/me", protect, getMe);

// 5. تغيير كلمة المرور
router.patch("/change-password", protect, validate(changePasswordSchema), changePassword);

// 6. طلب استعادة كلمة المرور للمراجعة الإدارية
router.post("/forgot-password", authRateLimit, validate(forgotPasswordSchema), forgotPassword);

// 7. إنشاء حساب متجر بواسطة المسؤول عبر مسار auth (اختياري بجانب /api/users)
router.post("/create-shop", protect, allowedTo("admin"), validate(createUserSchema), createUser);

export default router;
