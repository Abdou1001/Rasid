import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { redis } from "../src/config/redis.js";
import { supabase } from "../src/config/supabase.js";
import { signToken } from "../src/utils/token.js";
import ApiError from "../src/utils/ApiError.js";
import { CACHE_KEYS } from "../src/config/cache.js";
import * as cacheService from "../src/services/cache.service.js";

// Validation Schema
import { getMonthlyStatisticsSchema } from "../src/validations/dashboard/getMonthlyStatistics.js";

// Controllers
import { getDashboardStatistics } from "../src/controller/dashboard/getDashboardStatistics.controller.js";
import { getMonthlyStatistics } from "../src/controller/dashboard/getMonthlyStatistics.controller.js";

let server;
let baseUrl;
const originalFrom = supabase.from;

// Helper to create mock req/res
const createMockReqRes = (overrides = {}) => {
    const req = {
        body: {},
        cookies: {},
        headers: {},
        params: {},
        query: {},
        ip: "127.0.0.1",
        get: (h) => (h.toLowerCase() === "user-agent" ? "MockAgent/1.0" : undefined),
        ...overrides,
    };

    const res = {
        statusCode: 200,
        headers: {},
        jsonData: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.jsonData = data;
            return this;
        },
    };

    let nextCalledWith = null;
    const next = (err) => {
        nextCalledWith = err || null;
    };

    return { req, res, next, getNext: () => nextCalledWith };
};

// Builder for Mock Supabase
const createMockSupabaseBuilder = (result = { count: 0, error: null }) => {
    const builder = {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        gte: () => builder,
        lt: () => builder,
        then: (resolve) => resolve({ count: result.count ?? 0, error: result.error ?? null }),
    };
    return builder;
};

before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            baseUrl = `http://127.0.0.1:${addr.port}`;
            resolve();
        });
    });
});

after(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    if (redis.status === "ready" || redis.status === "connecting") {
        await redis.quit().catch(() => {});
    }
});

describe("1. Dashboard Validation Schemas", () => {
    test("getMonthlyStatisticsSchema accepts valid month and 4-digit year", async () => {
        const valid = await getMonthlyStatisticsSchema.parseAsync({
            month: "10",
            year: "2026",
        });
        assert.equal(valid.month, 10);
        assert.equal(valid.year, 2026);
    });

    test("getMonthlyStatisticsSchema rejects missing month or year", async () => {
        await assert.rejects(async () => {
            await getMonthlyStatisticsSchema.parseAsync({ year: 2026 });
        });
        await assert.rejects(async () => {
            await getMonthlyStatisticsSchema.parseAsync({ month: 5 });
        });
    });

    test("getMonthlyStatisticsSchema rejects month out of range (0 or 13)", async () => {
        await assert.rejects(async () => {
            await getMonthlyStatisticsSchema.parseAsync({ month: 0, year: 2026 });
        });
        await assert.rejects(async () => {
            await getMonthlyStatisticsSchema.parseAsync({ month: 13, year: 2026 });
        });
    });

    test("getMonthlyStatisticsSchema rejects invalid year format", async () => {
        await assert.rejects(async () => {
            await getMonthlyStatisticsSchema.parseAsync({ month: 10, year: 99 });
        });
    });
});

describe("2. Dashboard Overview Statistics Unit Logic", () => {
    test("getDashboardStatistics returns all 4 required counts correctly", async () => {
        let callCount = 0;
        supabase.from = (table) => {
            callCount++;
            if (table === "lost_phones" && callCount === 1) return createMockSupabaseBuilder({ count: 50 }); // totalPhones
            if (table === "lost_phones" && callCount === 2) return createMockSupabaseBuilder({ count: 30 }); // lostPhones
            if (table === "lost_phones" && callCount === 3) return createMockSupabaseBuilder({ count: 15 }); // foundPhones
            if (table === "users") return createMockSupabaseBuilder({ count: 12 }); // totalUsers
            return createMockSupabaseBuilder({ count: 0 });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-1", role: "admin" },
        });

        await getDashboardStatistics(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.jsonData.results, {
            totalPhones: 50,
            lostPhones: 30,
            foundPhones: 15,
            totalUsers: 12,
        });
    });

    test("getDashboardStatistics returns 500 when database count query fails", async () => {
        supabase.from = () => createMockSupabaseBuilder({ error: { message: "DB Error" } });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-1", role: "admin" },
        });

        await getDashboardStatistics(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 500);
    });

    supabase.from = originalFrom;
});

describe("3. Monthly Statistics Unit Logic & Timezone Handling", () => {
    test("getMonthlyStatistics calculates correct Asia/Aden boundaries and returns counts", async () => {
        const gteCalls = [];
        const ltCalls = [];

        supabase.from = (table) => {
            const builder = {
                select: () => builder,
                gte: (col, val) => {
                    gteCalls.push({ table, col, val });
                    return builder;
                },
                lt: (col, val) => {
                    ltCalls.push({ table, col, val });
                    return builder;
                },
                then: (resolve) => {
                    if (table === "lost_phones") resolve({ count: 42, error: null });
                    else resolve({ count: 8, error: null });
                },
            };
            return builder;
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-1", role: "admin" },
            query: { month: "10", year: "2026" },
        });

        await getMonthlyStatistics(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.jsonData.results, {
            month: 10,
            year: 2026,
            phonesAdded: 42,
            usersAdded: 8,
        });

        // Verify Asia/Aden boundaries
        // Month start must be 2026-10-01T00:00:00+03:00
        assert.ok(gteCalls.every((c) => c.val === "2026-10-01T00:00:00+03:00"));
        // Next month start must be 2026-11-01T00:00:00+03:00
        assert.ok(ltCalls.every((c) => c.val === "2026-11-01T00:00:00+03:00"));
    });

    test("getMonthlyStatistics handles December year boundary transition correctly", async () => {
        const ltCalls = [];

        supabase.from = () => {
            const builder = {
                select: () => builder,
                gte: () => builder,
                lt: (col, val) => {
                    ltCalls.push(val);
                    return builder;
                },
                then: (resolve) => resolve({ count: 5, error: null }),
            };
            return builder;
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-1", role: "admin" },
            query: { month: "12", year: "2026" },
        });

        await getMonthlyStatistics(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        // December 2026 next month boundary must roll over to 2027-01-01T00:00:00+03:00
        assert.ok(ltCalls.includes("2027-01-01T00:00:00+03:00"));
    });

    test("October 2026 and September 2026 use distinct independent cache keys", () => {
        const octKey = CACHE_KEYS.DASHBOARD_MONTHLY(2026, 10);
        const sepKey = CACHE_KEYS.DASHBOARD_MONTHLY(2026, 9);
        assert.notEqual(octKey, sepKey);
        assert.equal(octKey, "dashboard:monthly:2026:10");
        assert.equal(sepKey, "dashboard:monthly:2026:9");
    });

    supabase.from = originalFrom;
});

describe("4. Dashboard HTTP Route Integration & Access Control", () => {
    const adminToken = signToken({ id: "admin-id-1", role: "admin" });
    const userToken = signToken({ id: "shop-id-1", role: "user" });

    before(() => {
        supabase.from = (table) => {
            if (table === "users") {
                return {
                    select: () => ({
                        eq: (col, val) => ({
                            maybeSingle: async () => {
                                if (val === "admin-id-1") {
                                    return {
                                        data: { id: "admin-id-1", role: "admin", status: true },
                                        error: null,
                                    };
                                }
                                return {
                                    data: { id: "shop-id-1", role: "user", status: true },
                                    error: null,
                                };
                            },
                        }),
                        gte: () => ({ lt: () => ({ then: (r) => r({ count: 4, error: null }) }) }),
                        then: (r) => r({ count: 12, error: null }),
                    }),
                };
            }
            // lost_phones
            return {
                select: () => ({
                    eq: () => ({
                        or: () => ({ then: (r) => r({ count: 10, error: null }) }),
                        then: (r) => r({ count: 8, error: null }),
                    }),
                    gte: () => ({
                        lt: () => ({ then: (r) => r({ count: 20, error: null }) }),
                    }),
                    then: (r) => r({ count: 35, error: null }),
                }),
            };
        };
    });

    after(() => {
        supabase.from = originalFrom;
    });

    test("GET /api/dashboard/statistics rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/statistics`);
        assert.equal(res.status, 401);
    });

    test("GET /api/dashboard/statistics rejects regular shop user with 403", async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/statistics`, {
            headers: {
                Cookie: `token=${userToken}`,
            },
        });
        assert.equal(res.status, 403);
    });

    test("GET /api/dashboard/statistics succeeds for admin with 200", async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/statistics`, {
            headers: {
                Cookie: `token=${adminToken}`,
            },
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "success");
        assert.ok(data.results.totalPhones !== undefined);
        assert.ok(data.results.totalUsers !== undefined);
    });

    test("GET /api/dashboard/monthly-statistics rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/monthly-statistics?month=10&year=2026`);
        assert.equal(res.status, 401);
    });

    test("GET /api/dashboard/monthly-statistics rejects regular shop user with 403", async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/monthly-statistics?month=10&year=2026`, {
            headers: {
                Cookie: `token=${userToken}`,
            },
        });
        assert.equal(res.status, 403);
    });

    test("GET /api/dashboard/monthly-statistics validates query parameters and rejects invalid month with 400", async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/monthly-statistics?month=13&year=2026`, {
            headers: {
                Cookie: `token=${adminToken}`,
            },
        });
        assert.equal(res.status, 400);
    });

    test("GET /api/dashboard/monthly-statistics succeeds for admin with valid month and year", async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/monthly-statistics?month=10&year=2026`, {
            headers: {
                Cookie: `token=${adminToken}`,
            },
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "success");
        assert.equal(data.results.month, 10);
        assert.equal(data.results.year, 2026);
        assert.equal(typeof data.results.phonesAdded, "number");
        assert.equal(typeof data.results.usersAdded, "number");
    });
});
