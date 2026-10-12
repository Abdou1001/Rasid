import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import healthRouter from "./routes/health.route.js";
import { notFound, globalError } from "./middlewares/error.middleware.js";

const app = express();

// 1. ترويسات الأمان HTTP بواسطة Helmet
app.use(helmet());

// 2. إعداد سياسة مشاركة الموارد (CORS) لدعم لوحة التحكم وتطبيقات الجوال
const allowedOrigins = env.FRONTEND_URL.split(",").map((origin) => origin.trim());
app.use(
    cors({
        origin: (origin, callback) => {
            // السماح للطلبات التي لا تحتوي على origin (مثل تطبيقات الجوال و Postman)
            if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
                return callback(null, true);
            }
            return callback(new Error("غير مصرح بالوصول عبر سياسة CORS"));
        },
        credentials: true,
    })
);

// 3. معالجة جسم الطلب و ملفات الكوكيز
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 4. ضغط الردود عبر Gzip
app.use(compression());

// 5. مسارات الفحص الحيوي لحالة النظام
app.use("/api/health", healthRouter);
app.use("/health", healthRouter);

// 6. وسيط معالجة المسارات غير الموجودة (404) والمعالج العام للأخطاء
app.use(notFound);
app.use(globalError);

export default app;
