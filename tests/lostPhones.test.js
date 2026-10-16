import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { redis } from "../src/config/redis.js";
import { supabase } from "../src/config/supabase.js";
import { signToken } from "../src/utils/token.js";
import ApiError from "../src/utils/ApiError.js";

// Schemas
import { createLostPhoneSchema } from "../src/validations/lostPhones/createLostPhone.js";
import { getLostPhonesSchema } from "../src/validations/lostPhones/getLostPhones.js";
import { getLostPhonesDashboardSchema } from "../src/validations/lostPhones/getLostPhonesDashboard.js";
import { getMyLostPhonesSchema } from "../src/validations/lostPhones/getMyLostPhones.js";
import { updateLostPhoneSchema } from "../src/validations/lostPhones/updateLostPhone.js";
import { updateLostPhoneStatusSchema } from "../src/validations/lostPhones/updateLostPhoneStatus.js";

// Controllers
import { createLostPhone } from "../src/controller/lostPhones/createLostPhone.controller.js";
import { getLostPhones } from "../src/controller/lostPhones/getLostPhones.controller.js";
import { getLostPhonesDashboard } from "../src/controller/lostPhones/getLostPhonesDashboard.controller.js";
import { getMyLostPhones } from "../src/controller/lostPhones/getMyLostPhones.controller.js";
import { getLostPhoneById } from "../src/controller/lostPhones/getLostPhoneById.controller.js";
import { updateLostPhone } from "../src/controller/lostPhones/updateLostPhone.controller.js";
import { updateLostPhoneStatus } from "../src/controller/lostPhones/updateLostPhoneStatus.controller.js";
import { deleteLostPhone } from "../src/controller/lostPhones/deleteLostPhone.controller.js";

let server;
let baseUrl;

// Sample Valid JPEG Buffer (Magic bytes: FF D8 FF E0 ...)
const createValidJpegBuffer = () => {
    return Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
    );
};

// Sample Fake/Corrupted Buffer
const createInvalidBuffer = () => {
    return Buffer.from([0x00, 0x01, 0x02, 0x03]);
};

// Helper for Mock req/res
const createMockReqRes = (overrides = {}) => {
    const req = {
        body: {},
        cookies: {},
        headers: {},
        params: {},
        query: {},
        files: [],
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
const createMockSupabaseBuilder = (result = { data: null, error: null, count: 0 }) => {
    const builder = {
        select: () => builder,
        insert: () => builder,
        update: () => builder,
        delete: () => builder,
        eq: () => builder,
        in: () => builder,
        or: () => builder,
        ilike: () => builder,
        gte: () => builder,
        lte: () => builder,
        lt: () => builder,
        order: () => builder,
        range: async () => ({
            data: result.data || [],
            error: result.error || null,
            count: result.count !== undefined ? result.count : (result.data ? result.data.length : 0),
        }),
        maybeSingle: async () => ({ data: result.data || null, error: result.error || null }),
        single: async () => ({ data: result.data || null, error: result.error || null }),
        then: (resolve) => resolve({ data: result.data || [], error: result.error || null }),
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

describe("1. Lost Phones Validation Schemas", () => {
    test("createLostPhoneSchema requires brand and model", async () => {
        const valid = await createLostPhoneSchema.parseAsync({
            brand: "Samsung",
            model: "Galaxy S24",
            imei: "123456789012345",
        });
        assert.equal(valid.brand, "Samsung");
        assert.equal(valid.model, "Galaxy S24");

        // Missing brand
        await assert.rejects(async () => {
            await createLostPhoneSchema.parseAsync({ model: "iPhone 15" });
        });

        // Missing model
        await assert.rejects(async () => {
            await createLostPhoneSchema.parseAsync({ brand: "Apple" });
        });
    });

    test("getLostPhonesSchema parses query and filters", async () => {
        const parsed = await getLostPhonesSchema.parseAsync({
            page: "2",
            limit: "15",
            search: "Galaxy",
            status: "lost",
        });
        assert.equal(parsed.page, 2);
        assert.equal(parsed.limit, 15);
        assert.equal(parsed.search, "Galaxy");
        assert.equal(parsed.status, "lost");
    });

    test("updateLostPhoneSchema rejects empty body and accepts partial fields", async () => {
        await assert.rejects(async () => {
            await updateLostPhoneSchema.parseAsync({});
        });

        const valid = await updateLostPhoneSchema.parseAsync({
            color: "أزرق",
            storage: "256GB",
        });
        assert.equal(valid.color, "أزرق");
    });

    test("updateLostPhoneStatusSchema validates allowed statuses and rejects invalid ones", async () => {
        const valid = await updateLostPhoneStatusSchema.parseAsync({ status: "found", reason: "وجدته" });
        assert.equal(valid.status, "found");

        await assert.rejects(async () => {
            await updateLostPhoneStatusSchema.parseAsync({ status: "deleted" });
        });
    });

    test("getLostPhonesDashboardSchema validates dashboard query filters", async () => {
        const valid = await getLostPhonesDashboardSchema.parseAsync({
            status: "hidden",
            is_expired: "true",
            keyword: "iphone",
        });
        assert.equal(valid.status, "hidden");
        assert.equal(valid.is_expired, "true");
        assert.equal(valid.keyword, "iphone");
    });
});

describe("2. Lost Phones Creation & Image Rollback Logic", () => {
    const originalFrom = supabase.from;
    const originalStorage = supabase.storage;

    test("createLostPhone succeeds without images and sets status=lost and 12-month visible_until", async () => {
        const mockCreatedReport = {
            id: 101,
            brand: "Apple",
            model: "iPhone 14",
            status: "lost",
            created_by: "user-shop-1",
            visible_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        };

        supabase.from = () => createMockSupabaseBuilder({ data: mockCreatedReport });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "user-shop-1", role: "user" },
            body: { brand: "Apple", model: "iPhone 14" },
            files: [],
        });

        await createLostPhone(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 201);
        assert.equal(res.jsonData.results.id, 101);
        assert.equal(res.jsonData.results.status, "lost");
        assert.equal(res.jsonData.results.created_by, "user-shop-1");
        assert.deepEqual(res.jsonData.results.images, []);
    });

    test("createLostPhone succeeds with valid images and designates primary image", async () => {
        const mockCreatedReport = {
            id: 102,
            brand: "Xiaomi",
            model: "Redmi Note 13",
            status: "lost",
            created_by: "user-shop-1",
        };

        const mockImages = [
            { id: 1, phone_id: 102, image_url: "http://storage.com/img1.jpg", is_primary: true },
            { id: 2, phone_id: 102, image_url: "http://storage.com/img2.jpg", is_primary: false },
        ];

        let callCount = 0;
        supabase.from = () => {
            callCount++;
            if (callCount === 1) return createMockSupabaseBuilder({ data: mockCreatedReport }); // lost_phones insert
            if (callCount === 2) return createMockSupabaseBuilder({ data: {} }); // report_status_history insert
            return createMockSupabaseBuilder({ data: mockImages }); // phone_images insert
        };

        // Mock Supabase storage upload & getPublicUrl
        supabase.storage = {
            from: () => ({
                upload: async () => ({ data: { path: "test" }, error: null }),
                getPublicUrl: () => ({ data: { publicUrl: "http://storage.com/img1.jpg" } }),
                remove: async () => ({ data: {}, error: null }),
            }),
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "user-shop-1", role: "user" },
            body: { brand: "Xiaomi", model: "Redmi Note 13" },
            files: [
                { originalname: "front.jpg", mimetype: "image/jpeg", buffer: createValidJpegBuffer() },
                { originalname: "back.jpg", mimetype: "image/jpeg", buffer: createValidJpegBuffer() },
            ],
        });

        await createLostPhone(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 201);
        assert.equal(res.jsonData.results.images.length, 2);
        assert.equal(res.jsonData.results.images[0].is_primary, true);
    });

    test("createLostPhone handles invalid image buffer during processing and triggers rollback", async () => {
        const mockCreatedReport = { id: 104, brand: "Xiaomi", model: "Redmi Note 13" };
        let deletedReportId = null;

        supabase.from = (table) => {
            if (table === "lost_phones") {
                return {
                    insert: () => ({
                        select: () => ({
                            single: async () => ({ data: mockCreatedReport, error: null }),
                        }),
                    }),
                    delete: () => ({
                        eq: (col, val) => {
                            deletedReportId = val;
                            return { error: null };
                        },
                    }),
                };
            }
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "user-shop-1", role: "user" },
            body: { brand: "Xiaomi", model: "Redmi Note 13" },
            files: [
                { originalname: "fake.jpg", mimetype: "image/jpeg", buffer: createInvalidBuffer() },
            ],
        });

        await createLostPhone(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 500);
        assert.equal(deletedReportId, 104);
    });

    test("createLostPhone triggers rollback and cleanup if image record insertion fails", async () => {
        const mockCreatedReport = { id: 103, brand: "Apple", model: "iPhone 13" };

        let removedFiles = [];
        let deletedReportId = null;

        let callCount = 0;
        supabase.from = (table) => {
            callCount++;
            if (callCount === 1) return createMockSupabaseBuilder({ data: mockCreatedReport });
            if (callCount === 2) return createMockSupabaseBuilder({ data: {} });
            if (table === "phone_images") {
                // Fail image records insert
                return createMockSupabaseBuilder({ data: null, error: { message: "DB Error" } });
            }
            if (table === "lost_phones") {
                return {
                    delete: () => ({
                        eq: (col, val) => {
                            deletedReportId = val;
                            return { error: null };
                        },
                    }),
                };
            }
            return createMockSupabaseBuilder({ data: {} });
        };

        supabase.storage = {
            from: () => ({
                upload: async () => ({ data: { path: "test" }, error: null }),
                getPublicUrl: () => ({ data: { publicUrl: "http://storage.com/file.jpg" } }),
                remove: async (paths) => {
                    removedFiles = paths;
                    return { data: {}, error: null };
                },
            }),
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "user-shop-1", role: "user" },
            body: { brand: "Apple", model: "iPhone 13" },
            files: [
                { originalname: "phone.jpg", mimetype: "image/jpeg", buffer: createValidJpegBuffer() },
            ],
        });

        await createLostPhone(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 500);
        // Verify rollback happened
        assert.ok(removedFiles.length > 0);
        assert.equal(deletedReportId, 103);
    });

    supabase.from = originalFrom;
    supabase.storage = originalStorage;
});

describe("3. Lost Phones Retrieval & Visibility Rules", () => {
    const originalFrom = supabase.from;

    test("getLostPhones returns list with embedded images", async () => {
        const mockReports = [
            { id: 1, brand: "Samsung", model: "S23", status: "lost", phone_images: [] },
            { id: 2, brand: "Apple", model: "iPhone 14", status: "lost", phone_images: [{ image_url: "url" }] },
        ];
        supabase.from = () => createMockSupabaseBuilder({ data: mockReports, count: 2 });

        const { req, res, next, getNext } = createMockReqRes({
            query: { page: 1, limit: 10 },
        });

        await getLostPhones(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.length, 2);
        assert.equal(res.jsonData.pagination.total, 2);
    });

    test("getLostPhones filters by keyword across device fields excluding contact numbers", async () => {
        const orClauses = [];
        const builder = {
            select: () => builder,
            eq: () => builder,
            gte: () => builder,
            lte: () => builder,
            order: () => builder,
            or: (clause) => {
                orClauses.push(clause);
                return builder;
            },
            range: async () => ({ data: [], error: null, count: 0 }),
        };
        supabase.from = () => builder;

        const { req, res, next, getNext } = createMockReqRes({
            query: { keyword: "iphone" },
        });

        await getLostPhones(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);

        // Verify keyword OR clause was constructed
        const keywordClause = orClauses.find((c) => c.includes("brand.ilike.%iphone%"));
        assert.ok(keywordClause, "Should contain keyword search across device fields");
        assert.ok(keywordClause.includes("model.ilike.%iphone%"));
        assert.ok(keywordClause.includes("serial_number.ilike.%iphone%"));
        assert.ok(keywordClause.includes("imei.ilike.%iphone%"));
        assert.ok(keywordClause.includes("imei2.ilike.%iphone%"));
        assert.ok(keywordClause.includes("color.ilike.%iphone%"));
        assert.ok(keywordClause.includes("storage.ilike.%iphone%"));
        assert.ok(keywordClause.includes("description.ilike.%iphone%"));
        assert.ok(!keywordClause.includes("contact"), "Must NOT include contact numbers in keyword search");
    });

    test("getLostPhoneById returns active report for public requester", async () => {
        const mockReport = {
            id: 1,
            brand: "Samsung",
            model: "S23",
            status: "lost",
            visible_until: new Date(Date.now() + 100000).toISOString(),
            phone_images: [],
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockReport });

        const { req, res, next, getNext } = createMockReqRes({
            params: { id: "1" },
        });

        await getLostPhoneById(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.id, 1);
    });

    test("getLostPhoneById hides 'hidden' status from public/other shops with 404", async () => {
        const mockHiddenReport = {
            id: 2,
            brand: "Apple",
            model: "iPhone 12",
            status: "hidden",
            created_by: "creator-uuid",
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockHiddenReport });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "different-user", role: "user" },
            params: { id: "2" },
        });

        await getLostPhoneById(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 404);
    });

    test("getLostPhoneById allows admin to view 'hidden' report", async () => {
        const mockHiddenReport = {
            id: 2,
            brand: "Apple",
            model: "iPhone 12",
            status: "hidden",
            created_by: "creator-uuid",
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockHiddenReport });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "2" },
        });

        await getLostPhoneById(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.status, "hidden");
    });

    supabase.from = originalFrom;
});

describe("4. Lost Phones Update & Ownership Checks", () => {
    const originalFrom = supabase.from;

    test("updateLostPhone prevents shop from editing another shop's report with 403", async () => {
        const existingReport = {
            id: 50,
            brand: "Apple",
            model: "iPhone 11",
            created_by: "original-creator-uuid",
        };
        supabase.from = () => createMockSupabaseBuilder({ data: existingReport });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "intruder-user-uuid", role: "user" },
            params: { id: "50" },
            body: { color: "أسود" },
        });

        await updateLostPhone(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 403);
    });

    test("updateLostPhone allows report owner to update permitted fields", async () => {
        const existingReport = {
            id: 50,
            brand: "Apple",
            model: "iPhone 11",
            color: "أبيض",
            created_by: "owner-uuid",
        };
        const updatedReport = {
            ...existingReport,
            color: "أسود",
            phone_images: [],
        };

        let lostPhonesCalls = 0;
        supabase.from = (table) => {
            if (table === "phone_images") return createMockSupabaseBuilder({ data: [] });
            if (table === "audit_logs") return createMockSupabaseBuilder({ data: {} });
            lostPhonesCalls++;
            if (lostPhonesCalls === 1) return createMockSupabaseBuilder({ data: existingReport });
            return createMockSupabaseBuilder({ data: updatedReport });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-uuid", role: "user" },
            params: { id: "50" },
            body: { color: "أسود" },
        });

        await updateLostPhone(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.color, "أسود");
    });

    test("updateLostPhone allows admin to update any report", async () => {
        const existingReport = {
            id: 60,
            brand: "Samsung",
            model: "A54",
            created_by: "shop-uuid",
        };
        const updatedReport = {
            ...existingReport,
            description: "معدل بواسطة المسؤول",
            phone_images: [],
        };

        let lostPhonesCalls = 0;
        supabase.from = (table) => {
            if (table === "phone_images") return createMockSupabaseBuilder({ data: [] });
            if (table === "audit_logs") return createMockSupabaseBuilder({ data: {} });
            lostPhonesCalls++;
            if (lostPhonesCalls === 1) return createMockSupabaseBuilder({ data: existingReport });
            return createMockSupabaseBuilder({ data: updatedReport });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "60" },
            body: { description: "معدل بواسطة المسؤول" },
        });

        await updateLostPhone(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.description, "معدل بواسطة المسؤول");
    });

    supabase.from = originalFrom;
});

describe("5. Lost Phones HTTP Route Integration", () => {
    test("GET /api/lost-phones is accessible publicly with 200", async () => {
        const res = await fetch(`${baseUrl}/api/lost-phones`);
        assert.equal(res.status, 200);
    });

    test("POST /api/lost-phones rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/lost-phones`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brand: "Apple", model: "iPhone 15" }),
        });
        assert.equal(res.status, 401);
    });

    test("PATCH /api/lost-phones/:id rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/lost-phones/1`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ color: "أحمر" }),
        });
        assert.equal(res.status, 401);
    });

    test("GET /api/lost-phones/invalid-id responds with 400", async () => {
        const res = await fetch(`${baseUrl}/api/lost-phones/abc`);
        assert.equal(res.status, 400);
    });

    test("GET /api/lost-phones/dashboard rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/lost-phones/dashboard`);
        assert.equal(res.status, 401);
    });

    test("PATCH /api/lost-phones/:id/status rejects unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/api/lost-phones/1/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "found" }),
        });
        assert.equal(res.status, 401);
    });
});

describe("6. Lost Phones Status Transitions & Access Rules", () => {
    const originalFrom = supabase.from;

    test("updateLostPhoneStatus allows report owner to set status to 'found'", async () => {
        const existing = { id: 70, status: "lost", created_by: "owner-1" };
        const updated = { id: 70, status: "found", found_by: "owner-1", phone_images: [] };

        let callCount = 0;
        supabase.from = () => {
            callCount++;
            if (callCount === 1) return createMockSupabaseBuilder({ data: existing });
            if (callCount === 2) return createMockSupabaseBuilder({ data: updated });
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "70" },
            body: { status: "found", reason: "تم استلام الجهاز" },
        });

        await updateLostPhoneStatus(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.status, "found");
    });

    test("updateLostPhoneStatus prevents normal user from setting status to 'hidden' with 403", async () => {
        const existing = { id: 71, status: "lost", created_by: "owner-1" };
        supabase.from = () => createMockSupabaseBuilder({ data: existing });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "71" },
            body: { status: "hidden" },
        });

        await updateLostPhoneStatus(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 403);
    });

    test("updateLostPhoneStatus allows admin to set status to 'hidden'", async () => {
        const existing = { id: 72, status: "lost", created_by: "other-shop" };
        const updated = { id: 72, status: "hidden", hidden_by: "admin-1", phone_images: [] };

        let callCount = 0;
        supabase.from = () => {
            callCount++;
            if (callCount === 1) return createMockSupabaseBuilder({ data: existing });
            if (callCount === 2) return createMockSupabaseBuilder({ data: updated });
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-1", role: "admin" },
            params: { id: "72" },
            body: { status: "hidden" },
        });

        await updateLostPhoneStatus(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.status, "hidden");
    });

    test("updateLostPhoneStatus prevents owner from setting 'lost' if existing status is 'hidden'", async () => {
        const existing = { id: 73, status: "hidden", created_by: "owner-1" };
        supabase.from = () => createMockSupabaseBuilder({ data: existing });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "73" },
            body: { status: "lost" },
        });

        await updateLostPhoneStatus(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 403);
    });

    test("updateLostPhoneStatus allows owner to revert from 'found' to 'lost'", async () => {
        const existing = { id: 74, status: "found", created_by: "owner-1" };
        const updated = { id: 74, status: "lost", phone_images: [] };

        let callCount = 0;
        supabase.from = () => {
            callCount++;
            if (callCount === 1) return createMockSupabaseBuilder({ data: existing });
            if (callCount === 2) return createMockSupabaseBuilder({ data: updated });
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "74" },
            body: { status: "lost" },
        });

        await updateLostPhoneStatus(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.status, "lost");
    });

    supabase.from = originalFrom;
});

describe("7. Lost Phones Dashboard for Admin", () => {
    const originalFrom = supabase.from;

    test("getLostPhonesDashboard returns all reports including hidden without restrictions", async () => {
        const mockReports = [
            { id: 1, brand: "Apple", status: "hidden" },
            { id: 2, brand: "Samsung", status: "found" },
            { id: 3, brand: "Xiaomi", status: "lost" },
        ];
        supabase.from = () => createMockSupabaseBuilder({ data: mockReports, count: 3 });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-1", role: "admin" },
            query: { page: 1, limit: 10 },
        });

        await getLostPhonesDashboard(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.length, 3);
        assert.equal(res.jsonData.pagination.total, 3);
    });

    supabase.from = originalFrom;
});

describe("8. Lost Phone Images Update & Deletion Logic", () => {
    const originalFrom = supabase.from;

    test("updateLostPhone rejects deleting image that does not belong to report with 400", async () => {
        const existingReport = { id: 10, brand: "Apple", created_by: "owner-1" };
        const currentImages = [{ id: 101, phone_id: 10, image_url: "url1" }];

        supabase.from = (table) => {
            if (table === "lost_phones") return createMockSupabaseBuilder({ data: existingReport });
            if (table === "phone_images") return createMockSupabaseBuilder({ data: currentImages });
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "10" },
            body: { delete_image_ids: [999] },
        });

        await updateLostPhone(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
        assert.ok(err.message.includes("999"));
    });

    test("updateLostPhone deletes specific image and keeps remaining images", async () => {
        const existingReport = { id: 10, brand: "Apple", created_by: "owner-1" };
        const currentImages = [
            { id: 101, phone_id: 10, image_url: "http://example.com/phones/10/img1.webp", is_primary: true },
            { id: 102, phone_id: 10, image_url: "http://example.com/phones/10/img2.webp", is_primary: false },
        ];
        const remainingImages = [
            { id: 102, phone_id: 10, image_url: "http://example.com/phones/10/img2.webp", is_primary: true },
        ];

        let deleteCalled = false;
        supabase.from = (table) => {
            if (table === "lost_phones") return createMockSupabaseBuilder({ data: existingReport });
            if (table === "phone_images") {
                const builder = createMockSupabaseBuilder({ data: currentImages });
                builder.delete = () => {
                    deleteCalled = true;
                    return builder;
                };
                builder.range = async () => ({ data: remainingImages });
                builder.order = () => createMockSupabaseBuilder({ data: remainingImages });
                return builder;
            }
            if (table === "audit_logs") return createMockSupabaseBuilder({ data: {} });
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "10" },
            body: { delete_image_ids: [101] },
        });

        await updateLostPhone(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(deleteCalled, true);
    });

    test("updateLostPhone rejects total images exceeding limit of 5 with 400", async () => {
        const existingReport = { id: 10, brand: "Apple", created_by: "owner-1" };
        const currentImages = [
            { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }
        ];

        supabase.from = (table) => {
            if (table === "lost_phones") return createMockSupabaseBuilder({ data: existingReport });
            if (table === "phone_images") return createMockSupabaseBuilder({ data: currentImages });
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "10" },
            files: [{ buffer: createValidJpegBuffer() }],
            body: {},
        });

        await updateLostPhone(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
    });

    test("updateLostPhone rejects updating soft-deleted report with 404", async () => {
        const deletedReport = { id: 10, brand: "Apple", created_by: "owner-1", is_deleted: true };

        supabase.from = () => createMockSupabaseBuilder({ data: deletedReport });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "10" },
            body: { color: "أحمر" },
        });

        await updateLostPhone(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 404);
    });

    test("updateLostPhone with replace_images: true targets all existing images for deletion", async () => {
        const existingReport = { id: 10, brand: "Apple", created_by: "owner-1" };
        const currentImages = [
            { id: 1, phone_id: 10, image_url: "url1", is_primary: true },
            { id: 2, phone_id: 10, image_url: "url2", is_primary: false },
        ];

        let deletedIdsPassed = null;
        supabase.from = (table) => {
            if (table === "lost_phones") return createMockSupabaseBuilder({ data: existingReport });
            if (table === "phone_images") {
                const builder = createMockSupabaseBuilder({ data: currentImages });
                builder.in = (col, val) => {
                    deletedIdsPassed = val;
                    return builder;
                };
                builder.delete = () => builder;
                builder.range = async () => ({ data: [] });
                builder.order = () => createMockSupabaseBuilder({ data: [] });
                return builder;
            }
            if (table === "audit_logs") return createMockSupabaseBuilder({ data: {} });
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "10" },
            body: { replace_images: "true" },
        });

        await updateLostPhone(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(deletedIdsPassed, [1, 2]);
    });

    supabase.from = originalFrom;
});

describe("9. My Reports (GET /api/lost-phones/my-reports)", () => {
    const originalFrom = supabase.from;

    test("getMyLostPhonesSchema parses valid pagination and status filters", async () => {
        const valid = await getMyLostPhonesSchema.parseAsync({
            page: "2",
            limit: "20",
            status: "found",
        });
        assert.equal(valid.page, 2);
        assert.equal(valid.limit, 20);
        assert.equal(valid.status, "found");
    });

    test("getMyLostPhones returns reports created by current user only and excludes deleted", async () => {
        const myReports = [
            { id: 10, brand: "Apple", created_by: "user-123", is_deleted: false, phone_images: [] },
            { id: 11, brand: "Samsung", created_by: "user-123", is_deleted: false, phone_images: [] },
        ];

        let queriedCreatedBy = null;
        let queriedIsDeleted = null;

        supabase.from = () => {
            const builder = createMockSupabaseBuilder({ data: myReports, count: 2 });
            builder.eq = (col, val) => {
                if (col === "created_by") queriedCreatedBy = val;
                if (col === "is_deleted") queriedIsDeleted = val;
                return builder;
            };
            return builder;
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "user-123", role: "user" },
            query: { page: 1, limit: 10 },
        });

        await getMyLostPhones(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.length, 2);
        assert.equal(queriedCreatedBy, "user-123");
        assert.equal(queriedIsDeleted, false);
    });

    supabase.from = originalFrom;
});

describe("10. Lost Phone Soft Delete (DELETE /api/lost-phones/:id)", () => {
    const originalFrom = supabase.from;

    test("deleteLostPhone allows report owner to soft delete report", async () => {
        const existingReport = { id: 70, brand: "Apple", created_by: "owner-1", is_deleted: false };
        const updatedReport = { ...existingReport, is_deleted: true };

        let updatePayload = null;
        supabase.from = (table) => {
            if (table === "lost_phones") {
                const builder = createMockSupabaseBuilder({ data: existingReport });
                builder.update = (payload) => {
                    updatePayload = payload;
                    return createMockSupabaseBuilder({ data: updatedReport });
                };
                return builder;
            }
            if (table === "audit_logs") return createMockSupabaseBuilder({ data: {} });
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "70" },
        });

        await deleteLostPhone(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.is_deleted, true);
        assert.equal(updatePayload.is_deleted, true);
    });

    test("deleteLostPhone allows admin to soft delete any report", async () => {
        const existingReport = { id: 71, brand: "Google", created_by: "owner-other", is_deleted: false };
        const updatedReport = { ...existingReport, is_deleted: true };

        supabase.from = (table) => {
            if (table === "lost_phones") {
                const builder = createMockSupabaseBuilder({ data: existingReport });
                builder.update = () => createMockSupabaseBuilder({ data: updatedReport });
                return builder;
            }
            if (table === "audit_logs") return createMockSupabaseBuilder({ data: {} });
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-1", role: "admin" },
            params: { id: "71" },
        });

        await deleteLostPhone(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.is_deleted, true);
    });

    test("deleteLostPhone prevents non-owner shop from deleting report with 403", async () => {
        const existingReport = { id: 72, brand: "Apple", created_by: "owner-1", is_deleted: false };

        supabase.from = () => createMockSupabaseBuilder({ data: existingReport });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "intruder-user", role: "user" },
            params: { id: "72" },
        });

        await deleteLostPhone(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 403);
    });

    test("deleteLostPhone rejects already deleted report with 400", async () => {
        const alreadyDeletedReport = { id: 73, brand: "Apple", created_by: "owner-1", is_deleted: true };

        supabase.from = () => createMockSupabaseBuilder({ data: alreadyDeletedReport });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "owner-1", role: "user" },
            params: { id: "73" },
        });

        await deleteLostPhone(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
        assert.ok(err.message.includes("مسبقاً"));
    });

    test("getLostPhoneById hides soft-deleted report from regular users with 404", async () => {
        const deletedReport = { id: 75, brand: "Nokia", status: "lost", created_by: "owner-1", is_deleted: true };

        supabase.from = () => createMockSupabaseBuilder({ data: deletedReport });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "regular-user", role: "user" },
            params: { id: "75" },
        });

        await getLostPhoneById(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 404);
    });

    supabase.from = originalFrom;
});
