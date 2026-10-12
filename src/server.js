import app from "./app.js";
import { env } from "./config/env.js";

const PORT = env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`🚀 خادم نظام إدارة الهواتف المفقودة يعمل في وضع ${env.NODE_ENV} على المنفذ ${PORT}`);
});

// التعامل مع الوعود المرفوضة غير المعالجة
process.on("unhandledRejection", (err) => {
    console.error("💥 خطأ غير معالج (Unhandled Rejection)! يتم إيقاف الخادم بأمان...");
    console.error(err);
    server.close(() => {
        process.exit(1);
    });
});

// التعامل مع الاستثناءات غير الملتقطة
process.on("uncaughtException", (err) => {
    console.error("💥 استثناء غير ملتقط (Uncaught Exception)! يتم إيقاف الخادم فوراً...");
    console.error(err);
    process.exit(1);
});

// الإيقاف الآمن للخادم عند استقبال إشارات الإنهاء
const handleShutdown = (signal) => {
    console.log(`\n🛑 تم استقبال إشارة ${signal}. يتم إغلاق خادم HTTP...`);
    server.close(() => {
        console.log("تم إغلاق خادم HTTP بنجاح.");
        process.exit(0);
    });
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

export default server;
