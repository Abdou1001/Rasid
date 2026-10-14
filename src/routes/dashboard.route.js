import express from "express";
import { protect, allowedTo } from "../middlewares/auth.middleware.js";
import { validateQuery } from "../middlewares/validation.middleware.js";

// Validation Schemas
import { getMonthlyStatisticsSchema } from "../validations/dashboard/getMonthlyStatistics.js";

// Controllers
import { getDashboardStatistics } from "../controller/dashboard/getDashboardStatistics.controller.js";
import { getMonthlyStatistics } from "../controller/dashboard/getMonthlyStatistics.controller.js";

const router = express.Router();

// 1. استعراض إحصائيات لوحة التحكم الشاملة (Overview - Admin only)
router.get(
    "/statistics",
    protect,
    allowedTo("admin"),
    getDashboardStatistics
);

// 2. استعراض إحصائيات الرسم البياني الشهري (Monthly Chart - Admin only)
router.get(
    "/monthly-statistics",
    protect,
    allowedTo("admin"),
    validateQuery(getMonthlyStatisticsSchema),
    getMonthlyStatistics
);

export default router;
