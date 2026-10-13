import express from "express";
import { protect, allowedTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createUserSchema } from "../validations/users/createUser.js";
import { createUser } from "../controller/users/createUser.controller.js";

const router = express.Router();

// إنشاء حساب متجر جديد بواسطة المسؤول
router.post("/", protect, allowedTo("admin"), validate(createUserSchema), createUser);

export default router;
