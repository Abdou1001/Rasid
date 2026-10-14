import app from "./app.js";
import { env } from "./config/env.js";

const PORT = env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(
        `🚀 Lost Phone Reporting System server is running in ${env.NODE_ENV} mode on port ${PORT}`
    );
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
    console.error(
        "💥 Unhandled Rejection! Shutting down the server gracefully..."
    );
    console.error(err);

    server.close(() => {
        process.exit(1);
    });
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
    console.error(
        "💥 Uncaught Exception! Shutting down the server immediately..."
    );
    console.error(err);

    process.exit(1);
});

// Gracefully shut down the server when receiving termination signals
const handleShutdown = (signal) => {
    console.log(
        `\n🛑 Received ${signal}. Closing HTTP server...`
    );

    server.close(() => {
        console.log("HTTP server closed successfully.");
        process.exit(0);
    });
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

export default server;