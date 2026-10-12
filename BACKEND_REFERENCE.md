# Reusable Backend Engineering Reference

This reference documents the architectural patterns, conventions, and engineering standards extracted from a production-grade Node.js/Express and Supabase backend. It is designed to be adapted across greenfield and existing backend services.

---

## 1. Architecture Overview

The backend is built with **Node.js (ESM)** and **Express 5**, utilizing **Supabase (PostgreSQL + Storage)** as the database and asset store, and **Redis (`ioredis`)** for high-performance caching.

### Core Architectural Principles

1. **Strict Layered Request Flow**:
   ```text
   Request → Global Middlewares → Route Definition → Route Middlewares → Controller Action → Supabase / Infrastructure Services → Standardized Response
   ```
2. **Controller-Centric Business Logic**:
   - Controllers own domain logic, query composition, cache checks, and response dispatching.
   - Controllers do not delegate domain logic to separate "domain services".
3. **Infrastructure-Only Services**:
   - The `src/services/` layer is reserved strictly for third-party or infrastructure integrations: Redis cache operations (`cache.service.js`), Supabase storage operations (`storage.service.js`), image transformation (`image.service.js`), and email delivery.
4. **Isolated Process Lifecycle**:
   - `server.js` manages process bootstrap, environment validation, HTTP listener binding, and unhandled rejection hooks.
   - `app.js` configures Express middleware pipelines, security headers, route mounting, and global error middleware.
5. **Fail-Fast Environment Validation**:
   - Environment variables are parsed and coerced using Zod schemas at startup (`src/config/env.js`). If any variable is missing or malformed, the process terminates immediately with descriptive issue paths.

---

## 2. Directory Structure & File Organization

```text
src/
├── config/             # Singleton service clients and static configurations
│   ├── env.js          # Zod schema validation for process.env
│   ├── supabase.js     # Supabase admin client initialization
│   ├── redis.js        # ioredis client configuration & connection listeners
│   ├── cache.js        # Cache key generator functions & TTL definitions
│   └── storage.js      # Storage bucket name constants
├── controller/         # Feature controllers organized by resource directory
│   ├── <resource>/     # Dedicated directory per domain entity
│   │   ├── <action>.controller.js   # Exactly ONE action per file
│   │   └── ...
│   └── <resource>.controller.js     # Optional barrel re-export file
├── middlewares/        # Express middleware functions
│   ├── auth.middleware.js       # JWT cookie/header parsing, protect & role guards
│   ├── error.middleware.js      # Centralized error formatter (Zod, JWT, ApiError)
│   ├── rateLimit.middleware.js  # Tiered express-rate-limit configurations
│   ├── upload.middleware.js     # Multer memory storage and field mappings
│   └── validation.middleware.js # Generic Zod request-body validator
├── routes/             # Route modules mapping endpoints to middlewares & controllers
│   ├── <resource>.route.js
│   └── <nestedResource>.route.js
├── services/           # External infrastructure wrappers ONLY
│   ├── cache.service.js         # Redis get/set/delete/pattern helpers
│   ├── storage.service.js       # Supabase Storage bucket helpers
│   └── image.service.js         # Sharp image processing & rollback logic
├── utils/              # Pure utilities and helper classes
│   ├── ApiError.js              # Operational error class
│   ├── response.js              # Standardized API response dispatcher (sendSuccess)
│   ├── pagination.js            # Query pagination calculator & response builder
│   └── uuid.js                  # UUID regex and validation utilities
├── validations/        # Zod input schemas organized by resource
│   └── <resource>/
│       └── <action>.js          # Action-specific Zod schema
├── app.js              # Express app configuration & middleware pipeline
└── server.js           # Entry point: HTTP listener & process handlers
```

---

## 3. Standard Request Lifecycle

1. **Security & Parsing (Global)**:
   - `helmet()` sets secure HTTP headers.
   - `cors()` restricts origins with `credentials: true`.
   - `express.json()` and `express.urlencoded({ extended: true })` parse request bodies.
   - `cookieParser()` extracts cookies (including session JWT).
   - `compression()` gzips responses.
   - Global rate limiter protects all `/api` routes.
2. **Routing & Parameter Extraction**:
   - Main routes mounted at `/api/<resources>`.
   - Nested sub-resources mounted using `express.Router({ mergeParams: true })` to access parent IDs (`:parentId`).
   - Fixed sub-routes (e.g. `/dashboard`, `/health`) are declared before parameter routes (e.g. `/:slug`, `/:id`) to prevent wildcard shadowing.
3. **Authentication & Authorization**:
   - `protect`: Extracts JWT from HTTP-only cookie `token` (or `Bearer` header), verifies signature, fetches user record from database, confirms `is_active: true`, and attaches `req.user` and `req.isAdmin`.
   - `optionalAuth`: Safely extracts and attaches user info without rejecting unauthenticated requests. Enables dual-view endpoints (e.g., public gets published items; admin gets drafts).
   - `allowedTo(...roles)`: Checks `req.user.role` against permitted roles; throws 403 on mismatch.
4. **Payload Handling & Validation**:
   - Multipart file upload middleware (`multer.memoryStorage()`) runs *before* validation so files are parsed into `req.file` or `req.files`.
   - Validation middleware `validate(schema)` runs `await schema.parseAsync(req.body)`; forwards Zod errors directly to the global error handler.
5. **Controller Execution**:
   - Handlers are wrapped in `express-async-handler` (`AsyncHandler`) eliminating boilerplate `try/catch` blocks.
6. **Caching (Cache-Aside Pattern)**:
   - For public read endpoints, controllers check Redis via `getCache(key)`. If hit, response is returned immediately.
   - On cache miss, data is queried from the database, written to Redis with a TTL via `setCache(key, data, ttl)`, and returned.
   - Authenticated/admin requests bypass the cache to guarantee real-time data.
7. **Mutations & Cache Invalidation**:
   - Write operations (`POST`, `PUT`, `PATCH`, `DELETE`) perform database mutations and invalidate related cache keys and list patterns using `deleteCache` and `deleteByPattern`.
8. **Response Dispatch**:
   - Handlers call `sendSuccess(res, { statusCode, message, results, pagination })`.
9. **Centralized Error Handling**:
   - Operational errors instantiate `new ApiError(message, statusCode)` and pass it to `next()`.
   - Unmatched URLs trigger a 404 `ApiError`.
   - `globalError` normalizes `ApiError`, `ZodError`, `JsonWebTokenError`, and unhandled exceptions into uniform JSON structures.

---

## 4. Representative Implementation Patterns

### 4.1. Single-Action Controller

Every controller action resides in an independent file (`<action>.controller.js`).

```javascript
// src/controller/projects/createProject.controller.js
import { supabase } from "../../config/supabase.js";
import AsyncHandler from "express-async-handler";
import ApiError from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/response.js";
import { deleteByPattern } from "../../services/cache.service.js";

// @Desc Create new project
// @Route POST /api/projects
// @Access Private (Admin only)
export const createProject = AsyncHandler(async (req, res, next) => {
    const { slug, status = "draft", featured = false } = req.body;
    const normalizedSlug = slug.trim().toLowerCase();

    // 1. Existence check
    const { data: existing, error: checkError } = await supabase
        .from("projects")
        .select("id")
        .eq("slug", normalizedSlug)
        .maybeSingle();

    if (checkError) {
        return next(new ApiError("Failed to validate uniqueness", 500));
    }
    if (existing) {
        return next(new ApiError("A project with this slug already exists", 409));
    }

    // 2. Insert mutation
    const { data: newRecord, error: insertError } = await supabase
        .from("projects")
        .insert({
            slug: normalizedSlug,
            status,
            featured: Boolean(featured),
        })
        .select()
        .single();

    if (insertError || !newRecord) {
        return next(new ApiError("Failed to create record", 500));
    }

    // 3. Cache invalidation
    await deleteByPattern("projects:*");

    // 4. Standard response
    return sendSuccess(res, {
        statusCode: 201,
        message: "Project created successfully",
        results: newRecord,
    });
});
```

### 4.2. Route Configuration & Nested Sub-Resources

```javascript
// src/routes/projects.route.js
import express from "express";
import { protect, allowedTo, optionalAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createProjectSchema } from "../validations/projects/createProject.js";
import { getProjects } from "../controller/projects/getProjects.controller.js";
import { createProject } from "../controller/projects/createProject.controller.js";
import projectImagesRoutes from "./projectImages.route.js";

const router = express.Router();

// 1. Fixed routes before parameterized wildcards
router.get("/dashboard", protect, allowedTo("admin"), getAdminProjects);

// 2. Nested sub-resources (mergeParams: true in child router)
router.use("/:projectId/images", projectImagesRoutes);

// 3. Public endpoints with optional auth for privileged viewing
router.get("/", optionalAuth, getProjects);

// 4. Protected administrative endpoints
router.post(
    "/",
    protect,
    allowedTo("admin"),
    validate(createProjectSchema),
    createProject,
);

export default router;
```

For nested child routers, always pass `{ mergeParams: true }`:

```javascript
// src/routes/projectImages.route.js
import express from "express";
const router = express.Router({ mergeParams: true });

// req.params.projectId is available from parent route
router.get("/", optionalAuth, getProjectImages);
export default router;
```

### 4.3. Zod Validation & Middleware Binding

```javascript
// src/validations/projects/createProject.js
import z from "zod";

export const createProjectSchema = z.object({
    slug: z
        .string({ required_error: "Slug is required" })
        .trim()
        .min(1, "Slug cannot be empty")
        .max(200, "Slug must not exceed 200 characters")
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
    status: z.enum(["draft", "published", "hidden"]).default("draft").optional(),
    featured: z.boolean().default(false).optional(),
    sort_order: z.coerce.number().int().default(0).optional(),
});
```

```javascript
// src/middlewares/validation.middleware.js
import AsyncHandler from "express-async-handler";

export const validate = (schema) => AsyncHandler(async (req, res, next) => {
    await schema.parseAsync(req.body);
    next();
});
```

### 4.4. Error Handling & Standard Responses

```javascript
// src/utils/ApiError.js
export default class ApiError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = +statusCode;
        this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
        this.isOperational = true;
    }
}
```

```javascript
// src/utils/response.js
export const sendSuccess = (res, {
    statusCode = 200,
    message,
    results,
    pagination,
} = {}) => {
    const response = { status: "success", message };
    if (pagination) response.pagination = pagination;
    if (results !== undefined) response.results = results;
    return res.status(statusCode).json(response);
};
```

Global error middleware translates different error classes into consistent payloads:
- **Zod Error**: HTTP 400 with `{ status: "fail", errors: [{ field, message }] }`.
- **JWT Errors**: HTTP 401 with `{ status: "fail", message: "..." }`.
- **Operational ApiError**: HTTP `statusCode` with `{ status: "fail"|"error", message: "..." }`.
- **Unhandled 500**: Hides internal stack traces in production (`MODE_DEV !== "development"`).

---

## 5. Supabase Conventions

### 5.1. Client Initialization
- The backend connects via `@supabase/supabase-js` using the **Service Role Key** (`SUPABASE_SERVICE_ROLE_KEY`) in `src/config/supabase.js`.
- The client runs with administrative privileges on the server side, allowing backend controllers to bypass RLS policies when performing authorized admin operations.
- Direct frontend clients interact via Row Level Security (RLS) policies.

### 5.2. Querying Patterns
- **Existence / Single Record Check**:
  Use `.maybeSingle()` instead of `.single()`.
  ```javascript
  const { data, error } = await supabase
      .from("table")
      .select("id")
      .eq("id", id)
      .maybeSingle();
  // data is null if not found; does not throw PGRST116 (0 rows)
  ```
- **Relational Joins & Sub-queries**:
  Use PostgREST syntax for nested joins:
  ```javascript
  // Inner join translation
  const { data, error } = await supabase
      .from("projects")
      .select("*, project_translations!inner(*)")
      .eq("project_translations.locale", locale);
  ```
- **Pagination with Exact Count**:
  ```javascript
  const { data, error, count } = await supabase
      .from("projects")
      .select("*", { count: "exact" })
      .range(from, to);
  ```
- **Explicit Error Checking**:
  Always inspect `error` after every Supabase call:
  ```javascript
  if (error) return next(new ApiError("Failed to execute database query", 500));
  ```

---

## 6. Authentication & Authorization

### 6.1. Token Issuance & Cookie Delivery
- JWT tokens are signed using `jsonwebtoken` with `user_id` and `role`.
- Tokens are delivered via an **HTTP-only cookie** (`token`):
  ```javascript
  res.cookie("token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  ```
- Sensitive fields like `password_hash` are stripped before returning `results.user`.

### 6.2. Token Extraction & Middleware Guards
- `extractToken(req)` prioritizes `req.cookies.token`, falling back to `Authorization: Bearer <token>`.
- `protect` verifies the token, queries the `users` table, verifies `user.is_active === true`, and attaches `req.user` and `req.isAdmin = user.role === 'admin'`.
- `allowedTo(...roles)` enforces role boundaries:
  ```javascript
  export const allowedTo = (...roles) => AsyncHandler(async (req, res, next) => {
      if (!roles.includes(req.user?.role)) {
          return next(new ApiError("You do not have permission to access this resource.", 403));
      }
      next();
  });
  ```
- `logout` clears the cookie with matching attributes (`httpOnly: true`, `secure`, `sameSite: "lax"`).

---

## 7. Caching & Rate Limiting

### 7.1. Redis Cache Strategy
- Built with `ioredis` configured with short retry strategies (`maxRetriesPerRequest: 1`) to prevent server hangs during connection drops.
- **Centralized Keys & TTLs** (`src/config/cache.js`):
  ```javascript
  export const CACHE_KEYS = {
      PROJECTS_LIST: (page, limit) => `projects:page:${page}:limit:${limit}`,
      PROJECT: (slug) => `project:${slug}`,
  };
  export const CACHE_TTL = {
      PROJECTS: 86400, // 24 hours
      DASHBOARD: 300,  // 5 minutes
  };
  ```
- **Silent Degradation**: Cache methods (`getCache`, `setCache`, `deleteCache`, `deleteByPattern`) wrap operations in `try/catch` and log errors without throwing. A Redis failure does not crash or block primary API requests.
- **Cache Invalidation**: Mutations must invalidate single keys (`deleteCache`) and wildcard patterns (`deleteByPattern("projects:*")`).

### 7.2. Tiered Rate Limiting
Configured using `express-rate-limit` with explicit standard headers:
- **Global API**: 200 requests / 15 minutes (`apiRateLimit`).
- **Auth Endpoints**: 5 requests / 10 minutes (`authRateLimit`).
- **OTP Verification**: 3 requests / 5 minutes (`otpRateLimit`).
- **Public Contact Submissions**: 5 requests / 15 minutes (`messageRateLimit`).
- **Analytics/Event Tracking**: 60 requests / 1 minute (`visitorEventRateLimit`).

---

## 8. File Uploads & Storage Management

### 8.1. Multer Memory Storage
- Multer uses `memoryStorage()` with a 5MB limit and an image mimetype filter (`file.mimetype.startsWith("image/")`).
- Helper middlewares map polymorphic field names (e.g. `image`, `file`, `client_image`) onto `req.file`.

### 8.2. Image Processing & Compression
- Uploaded image buffers are processed using `sharp`:
  - Resized with max dimensions (e.g. width: 1200, `withoutEnlargement: true`).
  - Converted to modern `.webp` format at 80% quality.
  - Stored with UUID filenames (`crypto.randomUUID() + ".webp"`).

### 8.3. Storage Buckets & Rollback Pattern
- Bucket names are centralized in `src/config/storage.js`.
- If a database insert fails after an image has been uploaded to storage, the controller catches the error, calls `rollbackUploadedImage(bucket, fileName)`, and forwards the error to `next()`, preventing orphan files.

---

## 9. Database Conventions & Migrations

- Migrations located in `supabase/migrations/` using incremental numeric prefixes (`001_initial_schema.sql`).
- **Primary Keys**: UUID via `DEFAULT gen_random_uuid()`.
- **Timestamps**: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- **Trigger**: Automatic `updated_at` refresh via plpgsql function:
  ```sql
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
  END;
  $$;
  ```
- **Foreign Keys**: Explicit `REFERENCES parent_table(id) ON DELETE CASCADE`.
- **Relational Integrity**:
  - Composite primary keys on junction tables: `PRIMARY KEY (project_id, technology_id)`.
  - Composite unique constraints: `UNIQUE (project_id, locale)`.
  - Check constraints for status enums and locales.
- **Indexes**:
  - Partial indexes for filtered reads: `CREATE INDEX idx_name ON table(sort_order) WHERE is_active = TRUE;`.
  - Composite indexes on sorting/filtering columns: `(project_id, sort_order)`.
- **Row Level Security (RLS)**:
  - Enabled on all tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
  - Read-only policies for public/anon users filtered to published/active rows (`USING (status = 'published')`).
  - Zero public write policies (writes executed exclusively via backend service role client).

---

## 10. Checklist for Implementing a New Feature

When creating a new domain resource (e.g., `articles`):

1. **Database Schema**:
   - Write migration in `supabase/migrations/` with UUID primary key, `created_at`, `updated_at`, triggers, RLS, and indexes.
2. **Configuration Constants**:
   - Add cache keys & TTLs to `src/config/cache.js`.
   - Add storage buckets to `src/config/storage.js` if file uploads are involved.
3. **Validation Schemas**:
   - Create `src/validations/articles/<action>.js` using Zod for each mutating action (`createArticle.js`, `updateArticle.js`).
4. **Controllers**:
   - Create directory `src/controller/articles/`.
   - Create individual action files (`getArticles.controller.js`, `createArticle.controller.js`, etc.).
   - Wrap in `AsyncHandler`. Use `maybeSingle()` for single queries, `paginate()` for lists, and invalidate cache on mutations.
   - Optional: create `src/controller/articles.controller.js` to re-export actions.
5. **Route Definition**:
   - Create `src/routes/articles.route.js`.
   - Mount routes with appropriate middleware chain: `[protect] → [allowedTo] → [upload] → [validate] → controllerAction`.
   - Ensure parameterized routes (`/:id`) follow fixed routes (`/dashboard`).
6. **App Mount**:
   - Mount router in `src/app.js`: `app.use("/api/articles", ArticleRoutes);`.

---

## 11. Assumptions, Limitations & Project Porting Gotchas

When applying this reference to a new backend:

1. **Redis `keys()` Limitation**:
   - The current `deleteByPattern` helper uses `redis.keys(pattern)`. On large production databases with millions of keys, `KEYS` blocks the Redis event loop. For high-scale services, replace with `SCAN` cursor iteration.
2. **Controller vs Service Boundary**:
   - This architecture places queries directly in controller action files. If a project requires multi-step transactional business logic reused across multiple controllers, consider extracting domain service methods.
3. **Database Cascading vs Manual Cleanup**:
   - Even when database `ON DELETE CASCADE` is configured, controllers may perform explicit child deletions or storage file cleanups. Verify whether foreign keys cascade automatically before writing manual deletion queries.
4. **Cookie Security Across Domains**:
   - `sameSite: "lax"` with `httpOnly: true` works well for same-site or top-level navigation. If frontend and backend reside on different top-level domains, configure `sameSite: "none"` with `secure: true`.
5. **UUID Validation**:
   - Ensure all route ID parameters are validated against UUID format before querying Supabase to avoid PostgREST query parsing errors.
