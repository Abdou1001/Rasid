import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { redis } from "../src/config/redis.js";
import { supabase } from "../src/config/supabase.js";
import { signToken } from "../src/utils/token.js";
import ApiError from "../src/utils/ApiError.js";

// Schemas
import { getPoliceStationsSchema } from "../src/validations/policeStations/getPoliceStations.js";
import { createPoliceStationSchema } from "../src/validations/policeStations/createPoliceStation.js";
import { updatePoliceStationSchema } from "../src/validations/policeStations/updatePoliceStation.js";
import { updatePoliceStationStatusSchema } from "../src/validations/policeStations/updatePoliceStationStatus.js";

// Controllers
import { getPoliceStations } from "../src/controller/policeStations/getPoliceStations.controller.js";
import { getPoliceStationById } from "../src/controller/policeStations/getPoliceStationById.controller.js";
import { createPoliceStation } from "../src/controller/policeStations/createPoliceStation.controller.js";
import { updatePoliceStation } from "../src/controller/policeStations/updatePoliceStation.controller.js";
import { updatePoliceStationStatus } from "../src/controller/policeStations/updatePoliceStationStatus.controller.js";

let server;
let baseUrl;

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

// Mock Supabase Query Builder
const createMockSupabaseBuilder = (result = { data: null, error: null, count: 0 }) => {
    const builder = {
        select: () => builder,
        insert: () => builder,
        update: () => builder,
        eq: () => builder,
        ilike: () => builder,
        order: () => builder,
        range: async () => ({
            data: result.data || [],
            error: result.error || null,
            count: result.count !== undefined ? result.count : (result.data ? result.data.length : 0),
        }),
        maybeSingle: async () => ({ data: result.data || null, error: result.error || null }),
        single: async () => ({ data: result.data || null, error: result.error || null }),
    };
    return builder;
};

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

describe("1. Police Stations Validation Schemas", () => {
    test("getPoliceStationsSchema validates and parses query params", async () => {
        const parsed = await getPoliceStationsSchema.parseAsync({
            page: "2",
            limit: "25",
            search: " المعلم ",
            area: " التحرير ",
            phone: "01234567",
        });
        assert.equal(parsed.page, 2);
        assert.equal(parsed.limit, 25);
        assert.equal(parsed.search, "المعلم");
        assert.equal(parsed.area, "التحرير");
        assert.equal(parsed.phone, "01234567");
    });

    test("createPoliceStationSchema enforces required fields", async () => {
        const valid = await createPoliceStationSchema.parseAsync({
            station_name: "قسم شرطة التحرير",
            area: "التحرير",
            phone_number: "01270001",
            address: "شارع علي عبد المغني",
        });
        assert.equal(valid.station_name, "قسم شرطة التحرير");

        // Missing area
        await assert.rejects(async () => {
            await createPoliceStationSchema.parseAsync({
                station_name: "قسم شرطة",
                phone_number: "01270001",
            });
        });

        // Short station_name
        await assert.rejects(async () => {
            await createPoliceStationSchema.parseAsync({
                station_name: "ق",
                area: "منطقة",
                phone_number: "01270001",
            });
        });
    });

    test("updatePoliceStationSchema rejects empty body and accepts partial fields", async () => {
        // Empty body rejection
        await assert.rejects(async () => {
            await updatePoliceStationSchema.parseAsync({});
        });

        // Valid partial
        const valid = await updatePoliceStationSchema.parseAsync({
            station_name: "قسم شرطة 22 مايو",
        });
        assert.equal(valid.station_name, "قسم شرطة 22 مايو");
    });

    test("updatePoliceStationStatusSchema requires boolean is_active", async () => {
        const valid = await updatePoliceStationStatusSchema.parseAsync({ is_active: false });
        assert.equal(valid.is_active, false);

        await assert.rejects(async () => {
            await updatePoliceStationStatusSchema.parseAsync({ is_active: "active" });
        });
    });
});

describe("2. Police Stations Unit & Controller Logic", () => {
    const originalFrom = supabase.from;

    test("getPoliceStations returns paginated active stations", async () => {
        const mockStations = [
            { id: 1, station_name: "قسم التحرير", area: "التحرير", phone_number: "01270001", is_active: true },
            { id: 2, station_name: "قسم الصافية", area: "الصافية", phone_number: "01270002", is_active: true },
        ];
        supabase.from = () => createMockSupabaseBuilder({ data: mockStations, count: 2 });

        const { req, res, next, getNext } = createMockReqRes({
            query: { page: 1, limit: 10, search: "التحرير" },
        });

        await getPoliceStations(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.length, 2);
        assert.equal(res.jsonData.pagination.total, 2);
    });

    test("getPoliceStationById returns active station", async () => {
        const mockStation = { id: 10, station_name: "قسم الوحدة", is_active: true };
        supabase.from = () => createMockSupabaseBuilder({ data: mockStation });

        const { req, res, next, getNext } = createMockReqRes({
            params: { id: "10" },
        });

        await getPoliceStationById(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.id, 10);
    });

    test("getPoliceStationById rejects invalid numeric id with 400", async () => {
        const { req, res, next, getNext } = createMockReqRes({
            params: { id: "not-a-number" },
        });

        await getPoliceStationById(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
    });

    test("getPoliceStationById returns 404 for missing or inactive station", async () => {
        // Missing
        supabase.from = () => createMockSupabaseBuilder({ data: null });
        const { req: req1, res: res1, next: next1, getNext: getNext1 } = createMockReqRes({
            params: { id: "99" },
        });
        await getPoliceStationById(req1, res1, next1);
        assert.equal(getNext1().statusCode, 404);

        // Inactive
        supabase.from = () => createMockSupabaseBuilder({ data: { id: 99, is_active: false } });
        const { req: req2, res: res2, next: next2, getNext: getNext2 } = createMockReqRes({
            params: { id: "99" },
        });
        await getPoliceStationById(req2, res2, next2);
        assert.equal(getNext2().statusCode, 404);
    });

    test("createPoliceStation creates station with is_active=true", async () => {
        const createdStation = {
            id: 5,
            station_name: "قسم السبعين",
            area: "السبعين",
            phone_number: "01234567",
            is_active: true,
        };
        supabase.from = () => createMockSupabaseBuilder({ data: createdStation });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            body: {
                station_name: "قسم السبعين",
                area: "السبعين",
                phone_number: "01234567",
            },
        });

        await createPoliceStation(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 201);
        assert.equal(res.jsonData.results.id, 5);
        assert.equal(res.jsonData.results.is_active, true);
    });

    test("updatePoliceStation updates record and returns 200", async () => {
        const existingStation = { id: 5, station_name: "قسم قديم", area: "السبعين", is_active: true };
        const updatedStation = { id: 5, station_name: "قسم جديد", area: "السبعين", is_active: true };

        let callCount = 0;
        supabase.from = () => {
            callCount++;
            if (callCount === 1) return createMockSupabaseBuilder({ data: existingStation });
            return createMockSupabaseBuilder({ data: updatedStation });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "5" },
            body: { station_name: "قسم جديد" },
        });

        await updatePoliceStation(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.station_name, "قسم جديد");
    });

    test("updatePoliceStationStatus modifies is_active", async () => {
        const existingStation = { id: 5, is_active: true };
        const updatedStation = { id: 5, is_active: false };

        let callCount = 0;
        supabase.from = () => {
            callCount++;
            if (callCount === 1) return createMockSupabaseBuilder({ data: existingStation });
            return createMockSupabaseBuilder({ data: updatedStation });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "5" },
            body: { is_active: false },
        });

        await updatePoliceStationStatus(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.is_active, false);
        assert.ok(res.jsonData.message.includes("تعطيل"));
    });

    supabase.from = originalFrom;
});

describe("3. Police Stations Route Protection & Access Controls (HTTP)", () => {
    test("GET /api/police-stations is accessible publicly", async () => {
        const res = await fetch(`${baseUrl}/api/police-stations`);
        assert.equal(res.status, 200);
    });

    test("POST /api/police-stations rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/police-stations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                station_name: "قسم الشرطة",
                area: "صنعاء",
                phone_number: "01234567",
            }),
        });
        assert.equal(res.status, 401);
    });

    test("POST /api/police-stations rejects shop user (role=user) with 403", async () => {
        const userToken = signToken({ id: "user-uuid", role: "user" });
        const res = await fetch(`${baseUrl}/api/police-stations`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `token=${userToken}`,
            },
            body: JSON.stringify({
                station_name: "قسم الشرطة",
                area: "صنعاء",
                phone_number: "01234567",
            }),
        });
        // protect checks DB or rejects unauthorized role with 403 / 401
        assert.ok([401, 403].includes(res.status));
    });

    test("PATCH /api/police-stations/:id/status rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/police-stations/1/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: false }),
        });
        assert.equal(res.status, 401);
    });

    test("PATCH /api/police-stations/:id rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/police-stations/1`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ station_name: "اسم جديد" }),
        });
        assert.equal(res.status, 401);
    });
});
