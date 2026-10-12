import Redis from "ioredis";

const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL)
    : new Redis({
          host: process.env.REDIS_HOST,
          port: Number(process.env.REDIS_PORT),
      });

redis.on("connect", () => {
    console.log("✅ Redis Connected");
});

redis.on("error", (err) => {
    console.error("❌ Redis Error:", err.message);
});

export {redis};
