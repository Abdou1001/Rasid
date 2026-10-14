import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import authRouter from "./routes/auth.route.js";
import usersRouter from "./routes/users.route.js";
import policeStationsRouter from "./routes/policeStations.route.js";
import { apiRateLimit } from "./middlewares/rateLimit.middleware.js";
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

// 5. تحديد المعدل العام لواجهات برمجة التطبيقات
app.use("/api", apiRateLimit);

// 6. مسارات التطبيق
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/police-stations", policeStationsRouter);

// 7. وسيط معالجة المسارات غير الموجودة (404) والمعالج العام للأخطاء
app.use(notFound);
app.use(globalError);

export default app;
