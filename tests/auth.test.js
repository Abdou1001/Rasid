import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Config & Utils
import { env } from "../src/config/env.js";
import { redis } from "../src/config/redis.js";
import { supabase } from "../src/config/supabase.js";
import { normalizePhone, isValidYemeniPhone } from "../src/utils/phone.js";
import { signToken, getCookieOptions, getClearCookieOptions, sanitizeUser } from "../src/utils/token.js";
import ApiError from "../src/utils/ApiError.js";

// Schemas
import { loginSchema } from "../src/validations/auth/login.js";
import { adminLoginSchema } from "../src/validations/auth/adminLogin.js";
import { changePasswordSchema } from "../src/validations/auth/changePassword.js";
import { forgotPasswordSchema } from "../src/validations/auth/forgotPassword.js";
import { createUserSchema } from "../src/validations/users/createUser.js";
import { updateProfileSchema } from "../src/validations/users/updateProfile.js";
import { adminChangePasswordSchema } from "../src/validations/users/adminChangePassword.js";
import { updateUserStatusSchema } from "../src/validations/users/updateUserStatus.js";
import { getUsersSchema } from "../src/validations/users/getUsers.js";

// Middlewares
import { protect, allowedTo, optionalAuth } from "../src/middlewares/auth.middleware.js";

// Controllers
import { login } from "../src/controller/auth/login.controller.js";
import { adminLogin } from "../src/controller/auth/adminLogin.controller.js";
import { logout } from "../src/controller/auth/logout.controller.js";
import { getMe } from "../src/controller/auth/getMe.controller.js";
import { changePassword } from "../src/controller/auth/changePassword.controller.js";
import { forgotPassword } from "../src/controller/auth/forgotPassword.controller.js";
import { createUser } from "../src/controller/users/createUser.controller.js";
import { updateProfile } from "../src/controller/users/updateProfile.controller.js";
import { adminChangePassword } from "../src/controller/users/adminChangePassword.controller.js";
import { updateUserStatus } from "../src/controller/users/updateUserStatus.controller.js";
import { getUsers } from "../src/controller/users/getUsers.controller.js";
import { getUserById } from "../src/controller/users/getUserById.controller.js";

after(() => {
    // إغلاق اتصال Redis حتى لا يعلق Event Loop أثناء الفحص
    try {
        redis.disconnect();
    } catch {}
});

// Helper for Mock Request and Response
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
        cookiesSet: {},
        cookiesCleared: {},
        jsonData: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        cookie(name, val, options) {
            this.cookiesSet[name] = { val, options };
            return this;
        },
        clearCookie(name, options) {
            this.cookiesCleared[name] = options;
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
        eq: () => builder,
        or: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        range: async () => ({
            data: result.data || [],
            error: result.error || null,
            count: result.count !== undefined ? result.count : (result.data ? result.data.length : 0),
        }),
        maybeSingle: async () => result,
        single: async () => result,
    };
    return builder;
};

describe("1. Yemeni Phone Normalization & Validation", () => {
    test("Normalizes standard 9-digit local phone", () => {
        assert.equal(normalizePhone("771234567"), "771234567");
        assert.equal(isValidYemeniPhone("771234567"), true);
    });

    test("Normalizes international formats (+967, 967, 00967)", () => {
        assert.equal(normalizePhone("+967771234567"), "771234567");
        assert.equal(normalizePhone("967771234567"), "771234567");
        assert.equal(normalizePhone("00967771234567"), "771234567");
        assert.equal(isValidYemeniPhone("+967771234567"), true);
        assert.equal(isValidYemeniPhone("00967771234567"), true);
    });

    test("Normalizes local phone with leading zero (07XXXXXXXX)", () => {
        assert.equal(normalizePhone("0771234567"), "771234567");
        assert.equal(isValidYemeniPhone("0771234567"), true);
    });

    test("Rejects invalid non-Yemeni phone numbers", () => {
        assert.equal(isValidYemeniPhone("123456"), false);
        assert.equal(isValidYemeniPhone("966501234567"), false);
        assert.equal(isValidYemeniPhone("abcdefgh"), false);
    });
});

describe("2. Zod Validation Schemas", () => {
    test("loginSchema accepts valid phone and password", async () => {
        const parsed = await loginSchema.parseAsync({ phone: "771234567", password: "secretPassword" });
        assert.equal(parsed.phone, "771234567");
    });

    test("loginSchema rejects invalid phone format", async () => {
        await assert.rejects(async () => {
            await loginSchema.parseAsync({ phone: "12345", password: "secretPassword" });
        });
    });

    test("adminLoginSchema accepts valid phone and password", async () => {
        const parsed = await adminLoginSchema.parseAsync({ phone: "+967733445566", password: "adminPassword" });
        assert.equal(parsed.phone, "+967733445566");
    });

    test("changePasswordSchema enforces confirmation match and password difference", async () => {
        const valid = await changePasswordSchema.parseAsync({
            current_password: "oldPassword123",
            new_password: "newPassword123",
            confirm_password: "newPassword123",
        });
        assert.equal(valid.new_password, "newPassword123");

        await assert.rejects(async () => {
            await changePasswordSchema.parseAsync({
                current_password: "oldPassword123",
                new_password: "newPassword123",
                confirm_password: "differentPassword",
            });
        });

        await assert.rejects(async () => {
            await changePasswordSchema.parseAsync({
                current_password: "samePassword123",
                new_password: "samePassword123",
                confirm_password: "samePassword123",
            });
        });
    });

    test("createUserSchema validates required shop details", async () => {
        const payload = {
            shop_name: "المركز الذكي للهواتف",
            owner_name: "محمد علي",
            area: "التحرير",
            address: "شارع جمال",
            phone: "777112233",
            password: "initialPassword123",
        };
        const parsed = await createUserSchema.parseAsync(payload);
        assert.equal(parsed.shop_name, "المركز الذكي للهواتف");

        await assert.rejects(async () => {
            await createUserSchema.parseAsync({ ...payload, shop_name: " " });
        });

        await assert.rejects(async () => {
            await createUserSchema.parseAsync({ ...payload, password: "123" });
        });
    });
});

describe("3. Token & Security Utilities", () => {
    test("signToken generates verifiable JWT", () => {
        const token = signToken({ id: "uuid-1234", role: "user" });
        const decoded = jwt.verify(token, env.JWT_SECRET);
        assert.equal(decoded.id, "uuid-1234");
        assert.equal(decoded.role, "user");
    });

    test("getCookieOptions returns httpOnly and secure attributes", () => {
        const opts = getCookieOptions();
        assert.equal(opts.httpOnly, true);
        assert.ok(opts.maxAge > 0);
        assert.ok(["lax", "none"].includes(opts.sameSite));
    });

    test("getClearCookieOptions returns matching attributes", () => {
        const opts = getClearCookieOptions();
        assert.equal(opts.httpOnly, true);
        assert.ok(["lax", "none"].includes(opts.sameSite));
    });

    test("sanitizeUser strips password_hash", () => {
        const user = {
            id: "u-1",
            shop_name: "Shop 1",
            phone: "771111111",
            password_hash: "$2a$12$hashedstring",
            role: "user",
            status: true,
        };
        const clean = sanitizeUser(user);
        assert.equal(clean.password_hash, undefined);
        assert.equal(clean.id, "u-1");
        assert.equal(clean.shop_name, "Shop 1");
    });
});

describe("4. Auth Middlewares (protect, allowedTo, optionalAuth)", () => {
    const originalFrom = supabase.from;

    test("protect rejects missing token with 401", async () => {
        const { req, res, next, getNext } = createMockReqRes();
        await protect(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 401);
    });

    test("protect attaches user on valid token and active account", async () => {
        const token = signToken({ id: "u-100", role: "user" });
        const mockUser = {
            id: "u-100",
            shop_name: "Shop Test",
            role: "user",
            status: true,
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockUser, error: null });

        const { req, res, next, getNext } = createMockReqRes({
            cookies: { token },
        });

        await protect(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(req.user.id, "u-100");
        assert.equal(req.isAdmin, false);
    });

    test("protect rejects suspended account with 403", async () => {
        const token = signToken({ id: "u-suspended", role: "user" });
        const mockUser = {
            id: "u-suspended",
            shop_name: "Suspended Shop",
            role: "user",
            status: false,
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockUser, error: null });

        const { req, res, next, getNext } = createMockReqRes({
            cookies: { token },
        });

        await protect(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 403);
    });

    test("allowedTo rejects unauthorized roles with 403", async () => {
        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "u-1", role: "user", status: true },
        });
        await allowedTo("admin")(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 403);
    });

    test("allowedTo permits authorized roles", async () => {
        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "u-1", role: "admin", status: true },
        });
        await allowedTo("admin")(req, res, next);
        assert.equal(getNext(), null);
    });

    test("optionalAuth allows unauthenticated requests gracefully", async () => {
        const { req, res, next } = createMockReqRes();
        await optionalAuth(req, res, next);
        assert.equal(req.user, null);
        assert.equal(req.isAdmin, false);
    });

    // Reset supabase.from
    supabase.from = originalFrom;
});

describe("5. Authentication Controllers", () => {
    const originalFrom = supabase.from;

    test("login controller authenticates valid shop credentials and sets cookie", async () => {
        const hashedPassword = await bcrypt.hash("validPassword123", 10);
        const mockShop = {
            id: "shop-uuid-1",
            shop_name: "محل النور",
            owner_name: "علي أحمد",
            phone: "771122334",
            password_hash: hashedPassword,
            role: "user",
            status: true,
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockShop, error: null });

        const { req, res, next, getNext } = createMockReqRes({
            body: { phone: "+967771122334", password: "validPassword123" },
        });

        await login(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.ok(res.cookiesSet.token);
        assert.equal(res.jsonData.results.user.id, "shop-uuid-1");
        assert.equal(res.jsonData.results.user.password_hash, undefined);
        assert.equal(res.jsonData.token, undefined);
    });

    test("login controller rejects wrong password with 401", async () => {
        const hashedPassword = await bcrypt.hash("correctPassword", 10);
        const mockShop = {
            id: "shop-uuid-1",
            phone: "771122334",
            password_hash: hashedPassword,
            role: "user",
            status: true,
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockShop, error: null });

        const { req, res, next, getNext } = createMockReqRes({
            body: { phone: "771122334", password: "wrongPassword" },
        });

        await login(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 401);
    });

    test("login controller rejects admin account attempting shop login with 403", async () => {
        const hashedPassword = await bcrypt.hash("adminPassword", 10);
        const mockAdmin = {
            id: "admin-uuid-1",
            phone: "779999999",
            password_hash: hashedPassword,
            role: "admin",
            status: true,
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockAdmin, error: null });

        const { req, res, next, getNext } = createMockReqRes({
            body: { phone: "779999999", password: "adminPassword" },
        });

        await login(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 403);
    });

    test("login controller rejects suspended account with 403", async () => {
        const hashedPassword = await bcrypt.hash("shopPassword", 10);
        const mockSuspended = {
            id: "suspended-uuid",
            phone: "770000000",
            password_hash: hashedPassword,
            role: "user",
            status: false,
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockSuspended, error: null });

        const { req, res, next, getNext } = createMockReqRes({
            body: { phone: "770000000", password: "shopPassword" },
        });

        await login(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 403);
    });

    test("adminLogin controller allows admin and rejects non-admin with 403", async () => {
        const hashedPassword = await bcrypt.hash("pass123", 10);

        // 1. Non-admin
        const mockShop = {
            id: "shop-1",
            phone: "771111111",
            password_hash: hashedPassword,
            role: "user",
            status: true,
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockShop, error: null });

        const { req: req1, res: res1, next: next1, getNext: getNext1 } = createMockReqRes({
            body: { phone: "771111111", password: "pass123" },
        });
        await adminLogin(req1, res1, next1);
        assert.equal(getNext1().statusCode, 403);

        // 2. Admin
        const mockAdmin = {
            id: "admin-1",
            phone: "772222222",
            password_hash: hashedPassword,
            role: "admin",
            status: true,
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockAdmin, error: null });

        const { req: req2, res: res2, next: next2, getNext: getNext2 } = createMockReqRes({
            body: { phone: "772222222", password: "pass123" },
        });
        await adminLogin(req2, res2, next2);
        assert.equal(getNext2(), null);
        assert.equal(res2.statusCode, 200);
        assert.ok(res2.cookiesSet.token);
    });

    test("logout controller clears token cookie and returns 200", async () => {
        const { req, res } = createMockReqRes();
        await logout(req, res);
        assert.equal(res.statusCode, 200);
        assert.ok(res.cookiesCleared.token !== undefined);
        assert.equal(res.jsonData.status, "success");
    });

    test("getMe controller returns current profile without password_hash", async () => {
        const mockUser = {
            id: "u-profile",
            shop_name: "Shop Name",
            phone: "773333333",
            role: "user",
            status: true,
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockUser, error: null });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "u-profile" },
        });

        await getMe(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.user.id, "u-profile");
        assert.equal(res.jsonData.results.user.password_hash, undefined);
    });

    test("changePassword controller verifies current password and updates hash", async () => {
        const currentHash = await bcrypt.hash("currentSecret", 10);
        const mockUser = {
            id: "u-change-pass",
            password_hash: currentHash,
            status: true,
            role: "user",
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockUser, error: null });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "u-change-pass", role: "user" },
            body: { current_password: "currentSecret", new_password: "brandNewPassword123" },
        });

        await changePassword(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.ok(res.cookiesCleared.token !== undefined);
    });

    test("forgotPassword controller returns safe generic response for existing and non-existing accounts", async () => {
        // 1. Non-existent phone
        supabase.from = () => createMockSupabaseBuilder({ data: null, error: null });
        const { req: req1, res: res1 } = createMockReqRes({
            body: { phone: "770000001" },
        });
        await forgotPassword(req1, res1);
        assert.equal(res1.statusCode, 200);
        assert.ok(res1.jsonData.message.includes("إذا كان رقم الهاتف مسجلاً"));

        // 2. Existing phone
        supabase.from = () => createMockSupabaseBuilder({ data: { id: "u-found", phone: "770000002", status: true }, error: null });
        const { req: req2, res: res2 } = createMockReqRes({
            body: { phone: "770000002" },
        });
        await forgotPassword(req2, res2);
        assert.equal(res2.statusCode, 200);
        assert.equal(res2.jsonData.message, res1.jsonData.message);
    });

    test("createUser controller rejects duplicate phone numbers with 409", async () => {
        supabase.from = () => createMockSupabaseBuilder({ data: { id: "existing-id" }, error: null });
        const { req, res, next, getNext } = createMockReqRes({
            body: {
                shop_name: "محل السلام",
                owner_name: "سالم",
                phone: "771122334",
                password: "password123",
            },
        });

        await createUser(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 409);
    });

    test("createUser controller successfully creates shop account with role=user and status=true", async () => {
        let callCount = 0;
        supabase.from = () => {
            callCount++;
            if (callCount === 1) {
                // Existence check
                return createMockSupabaseBuilder({ data: null, error: null });
            }
            // Insert result
            return createMockSupabaseBuilder({
                data: {
                    id: "new-user-uuid",
                    shop_name: "محل الأمل",
                    owner_name: "سالم",
                    phone: "771122335",
                    role: "user",
                    status: true,
                },
                error: null,
            });
        };

        const { req, res, next, getNext } = createMockReqRes({
            body: {
                shop_name: "محل الأمل",
                owner_name: "سالم",
                phone: "771122335",
                password: "password123",
            },
        });

        await createUser(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 201);
        assert.equal(res.jsonData.results.user.role, "user");
        assert.equal(res.jsonData.results.user.status, true);
        assert.equal(res.jsonData.results.user.password_hash, undefined);
    });

    supabase.from = originalFrom;
});

describe("6. User Profile & Admin User Management", () => {
    const originalFrom = supabase.from;

    test("updateProfileSchema rejects empty body and accepts partial updates", async () => {
        await assert.rejects(async () => {
            await updateProfileSchema.parseAsync({});
        });

        const valid = await updateProfileSchema.parseAsync({
            shop_name: "محل النور",
            owner_name: "محمد أحمد",
        });
        assert.equal(valid.shop_name, "محل النور");
        assert.equal(valid.owner_name, "محمد أحمد");
    });

    test("updateProfile allows user to update shop_name and owner_name", async () => {
        const existingUser = {
            id: "user-uuid-1",
            shop_name: "محل القديم",
            owner_name: "أحمد",
            phone: "771234567",
            status: true,
            role: "user",
        };
        const updatedUser = {
            ...existingUser,
            shop_name: "محل النور للاتصالات",
            owner_name: "أحمد علي",
        };

        let callCount = 0;
        supabase.from = () => {
            callCount++;
            if (callCount === 1) {
                // Existence check
                return createMockSupabaseBuilder({ data: existingUser });
            }
            // Update
            return createMockSupabaseBuilder({ data: updatedUser });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "user-uuid-1", role: "user" },
            body: {
                shop_name: "محل النور للاتصالات",
                owner_name: "أحمد علي",
            },
        });

        await updateProfile(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.shop_name, "محل النور للاتصالات");
        assert.equal(res.jsonData.results.owner_name, "أحمد علي");
    });

    test("adminChangePasswordSchema requires matching passwords with min 6 chars", async () => {
        await assert.rejects(async () => {
            await adminChangePasswordSchema.parseAsync({
                password: "123",
                password_confirm: "123",
            });
        });

        await assert.rejects(async () => {
            await adminChangePasswordSchema.parseAsync({
                password: "password123",
                password_confirm: "different123",
            });
        });

        const valid = await adminChangePasswordSchema.parseAsync({
            password: "newPassword123",
            password_confirm: "newPassword123",
        });
        assert.equal(valid.password, "newPassword123");
    });

    test("adminChangePassword allows admin to change password for any user", async () => {
        const targetUser = {
            id: "a0000000-0000-4000-8000-000000000001",
            shop_name: "محل التجربة",
            role: "user",
        };

        supabase.from = (table) => {
            if (table === "users") return createMockSupabaseBuilder({ data: targetUser });
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "a0000000-0000-4000-8000-000000000001" },
            body: { password: "adminChangedPass123" },
        });

        await adminChangePassword(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.user_id, "a0000000-0000-4000-8000-000000000001");
    });

    test("adminChangePassword rejects invalid UUID with 400", async () => {
        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "invalid-uuid" },
            body: { password: "adminChangedPass123" },
        });

        await adminChangePassword(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
    });

    test("updateUserStatus allows admin to suspend user account", async () => {
        const existingUser = {
            id: "b0000000-0000-4000-8000-000000000002",
            status: true,
            role: "user",
            shop_name: "محل الشرق",
        };
        const updatedUser = { ...existingUser, status: false };

        let callCount = 0;
        supabase.from = (table) => {
            if (table === "users") {
                callCount++;
                if (callCount === 1) return createMockSupabaseBuilder({ data: existingUser });
                return createMockSupabaseBuilder({ data: updatedUser });
            }
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "b0000000-0000-4000-8000-000000000002" },
            body: { status: false, reason: "مخالفة الشروط" },
        });

        await updateUserStatus(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.status, false);
    });

    test("updateUserStatus prevents admin from suspending own account with 400", async () => {
        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid-1234-4000-8000-000000000000", role: "admin" },
            params: { id: "admin-uuid-1234-4000-8000-000000000000" },
            body: { status: false },
        });

        await updateUserStatus(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
    });

    test("updateUserStatus allows admin to activate suspended user account", async () => {
        const existingUser = {
            id: "b0000000-0000-4000-8000-000000000003",
            status: false,
            role: "user",
            shop_name: "محل الغرب",
        };
        const updatedUser = { ...existingUser, status: true };

        let callCount = 0;
        supabase.from = (table) => {
            if (table === "users") {
                callCount++;
                if (callCount === 1) return createMockSupabaseBuilder({ data: existingUser });
                return createMockSupabaseBuilder({ data: updatedUser });
            }
            return createMockSupabaseBuilder({ data: {} });
        };

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "b0000000-0000-4000-8000-000000000003" },
            body: { status: true },
        });

        await updateUserStatus(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.status, true);
    });

    supabase.from = originalFrom;
});

describe("9. Users Retrieval (getUsers & getUserById)", () => {
    const originalFrom = supabase.from;

    test("getUsersSchema parses pagination and filter parameters", async () => {
        const parsed = await getUsersSchema.parseAsync({
            page: "2",
            limit: "25",
            search: "الأمل",
            role: "user",
            status: "true",
        });
        assert.equal(parsed.page, 2);
        assert.equal(parsed.limit, 25);
        assert.equal(parsed.search, "الأمل");
        assert.equal(parsed.role, "user");
        assert.equal(parsed.status, "true");
    });

    test("getUsers returns paginated list of users for admin", async () => {
        const mockUsers = [
            { id: "10000000-0000-4000-8000-000000000001", shop_name: "محل 1", role: "user" },
            { id: "10000000-0000-4000-8000-000000000002", shop_name: "محل 2", role: "user" },
        ];
        supabase.from = () => createMockSupabaseBuilder({ data: mockUsers, count: 2 });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            query: { page: 1, limit: 10 },
        });

        await getUsers(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.length, 2);
        assert.equal(res.jsonData.pagination.total, 2);
    });

    test("getUserById allows admin to retrieve any user by UUID", async () => {
        const mockUser = {
            id: "20000000-0000-4000-8000-000000000001",
            shop_name: "متجر القدس",
            owner_name: "أحمد",
            phone: "777123456",
            role: "user",
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockUser });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "20000000-0000-4000-8000-000000000001" },
        });

        await getUserById(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.id, "20000000-0000-4000-8000-000000000001");
        assert.equal(res.jsonData.results.shop_name, "متجر القدس");
    });

    test("getUserById allows account owner to retrieve own data", async () => {
        const ownerId = "30000000-0000-4000-8000-000000000001";
        const mockUser = {
            id: ownerId,
            shop_name: "متجري",
            owner_name: "محمود",
            phone: "777654321",
            role: "user",
        };
        supabase.from = () => createMockSupabaseBuilder({ data: mockUser });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: ownerId, role: "user" },
            params: { id: ownerId },
        });

        await getUserById(req, res, next);
        assert.equal(getNext(), null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.jsonData.results.id, ownerId);
    });

    test("getUserById rejects user attempting to access another user's profile with 403", async () => {
        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "30000000-0000-4000-8000-000000000001", role: "user" },
            params: { id: "40000000-0000-4000-8000-000000000002" },
        });

        await getUserById(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 403);
    });

    test("getUserById rejects invalid UUID with 400", async () => {
        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "invalid-id-123" },
        });

        await getUserById(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
    });

    test("getUserById returns 404 when user does not exist", async () => {
        supabase.from = () => createMockSupabaseBuilder({ data: null });

        const { req, res, next, getNext } = createMockReqRes({
            user: { id: "admin-uuid", role: "admin" },
            params: { id: "50000000-0000-4000-8000-000000000001" },
        });

        await getUserById(req, res, next);
        const err = getNext();
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 404);
    });

    supabase.from = originalFrom;
});

