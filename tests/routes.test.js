import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { redis } from "../src/config/redis.js";

let server;
let baseUrl;

before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

after(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    try {
        redis.disconnect();
    } catch {}
});

describe("Express App Route Mounting & Global Error Handling", () => {
    test("GET /api/health responds with 200", async () => {
        const res = await fetch(`${baseUrl}/api/health`);
        const json = await res.json();
        assert.equal(res.status, 200);
        assert.equal(json.status, "success");
    });

    test("GET non-existent route responds with 404 ApiError structure", async () => {
        const res = await fetch(`${baseUrl}/api/non-existent-route`);
        const json = await res.json();
        assert.equal(res.status, 404);
        assert.equal(json.status, "fail");
        assert.ok(json.message.includes("المسار المطلوب غير موجود"));
    });

    test("POST /api/auth/login validates required fields with Zod 400", async () => {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: "123" }),
        });
        const json = await res.json();
        assert.equal(res.status, 400);
        assert.equal(json.status, "fail");
        assert.ok(Array.isArray(json.errors));
    });

    test("POST /api/auth/admin-login validates invalid body with 400", async () => {
        const res = await fetch(`${baseUrl}/api/auth/admin-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        const json = await res.json();
        assert.equal(res.status, 400);
        assert.equal(json.status, "fail");
    });

    test("GET /api/auth/me rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/auth/me`);
        const json = await res.json();
        assert.equal(res.status, 401);
        assert.equal(json.status, "fail");
        assert.ok(json.message.includes("تسجيل الدخول"));
    });

    test("PATCH /api/auth/change-password rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/auth/change-password`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                current_password: "old",
                new_password: "newPassword123",
                confirm_password: "newPassword123",
            }),
        });
        const json = await res.json();
        assert.equal(res.status, 401);
    });

    test("POST /api/users rejects unauthenticated account creation with 401", async () => {
        const res = await fetch(`${baseUrl}/api/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shop_name: "محل السلام",
                owner_name: "سالم",
                phone: "771122334",
                password: "password123",
            }),
        });
        const json = await res.json();
        assert.equal(res.status, 401);
    });

    test("POST /api/auth/logout succeeds and returns standard response", async () => {
        const res = await fetch(`${baseUrl}/api/auth/logout`, {
            method: "POST",
        });
        const json = await res.json();
        assert.equal(res.status, 200);
        assert.equal(json.status, "success");
    });
});
