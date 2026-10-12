import express from "express";
import { sendSuccess } from "../utils/response.js";

const router = express.Router();

// @Desc مسار الفحص الحيوي لحالة الخادم
// @Route GET /api/health
// @Access Public
router.get("/", (req, res) => {
    return sendSuccess(res, {
        statusCode: 200,
        message: "نظام إدارة الهواتف المفقودة يعمل بنجاح وبحالة ممتازة",
        results: {
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        },
    });
});

export default router;
