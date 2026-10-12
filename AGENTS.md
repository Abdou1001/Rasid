# Backend Agent Instructions

Operational guidelines for AI coding agents implementing or modifying backend features.

---

## 1. Primary Directives

1. **Consult Reference First**: Read [BACKEND_REFERENCE.md](file:///d:/programming/Dot%20Code/website/BACKEND_REFERENCE.md) before implementing backend components. Do not re-inspect the entire reference repository when the reference document answers the question.
2. **Minimal File Inspection**: Inspect only the files directly necessary for your specific task (e.g., the target route, controller, validation schema, and database migration). Do not scan entire directories or unrelated features.
3. **Strict Scope Control**: Keep changes strictly scoped to the requested task. Do not rewrite, reformat, or refactor unrelated files. Preserve existing API contracts, database schemas, and business rules.
4. **No Assumed Context**: Never assume that another project's schema, routes, environment variables, or business logic apply here. Verify against the current project's codebase.
5. **No Gratuitous Dependencies**: Reuse existing project libraries, utilities, and abstractions. Do not introduce new packages without explicit instruction.

---

## 2. Architecture & File Layout Conventions

Follow the layered request pipeline:
```text
Route → Middleware Chain → Controller Action → Supabase / Service → Response
```

- **Controller Architecture (Strict Rule)**:
  - Dedicated directory per entity: `src/controller/<resource>/`.
  - **Single Action per File**: Every endpoint handler MUST reside in its own file named `<action>.controller.js` (e.g., `createItem.controller.js`). Never combine multiple actions in one controller file.
  - Route files import controller actions directly from their dedicated action files. An optional domain index `src/controller/<resource>.controller.js` may re-export them.
- **Route Definitions (`src/routes/<resource>.route.js`)**:
  - Declare specific sub-routes (e.g., `/dashboard`) *before* parameterized routes (e.g., `/:slug` or `/:id`).
  - Use `express.Router({ mergeParams: true })` for nested sub-resource routers.
- **Validation Schemas (`src/validations/<resource>/<action>.js`)**:
  - Define asynchronous Zod schemas per mutating action.
  - Connect schemas to routes via the `validate(schema)` middleware.
- **Infrastructure Services Only (`src/services/`)**:
  - Keep domain business logic and database queries in controllers. Use `src/services/` exclusively for external/infrastructure adapters (Redis cache, storage, image processing, email).
- **Configuration & Constants (`src/config/`)**:
  - Centralize Redis cache keys and TTLs in `src/config/cache.js`.
  - Centralize storage bucket names in `src/config/storage.js`. Never hardcode bucket names or cache key prefixes.

---

## 3. Handler Standards & Error Propagation

- **ESM Exports**: Use named ESM exports.
- **Async Handling**: Wrap every controller action and async middleware with `express-async-handler` (`AsyncHandler`). Do not write redundant `try/catch` blocks unless implementing specific rollback logic (e.g. storage cleanup).
- **Operational Errors**: Pass operational errors to `next()` using `ApiError(message, statusCode)`.
- **Standardized Responses**: Dispatch all successful responses using the `sendSuccess(res, { statusCode, message, results, pagination })` helper.
- **Query Verification**: Always verify error flags returned by the database client (`if (error) return next(new ApiError(..., 500));`). Use `.maybeSingle()` for single-row lookups where zero rows is a valid non-exceptional condition.

---

## 4. Caching, Auth, & Cross-Cutting Concerns

- **Cache-Aside Pattern**:
  - Check `getCache(key)` first for public read endpoints; return cached data immediately on hit.
  - Populate cache on miss via `setCache(key, data, ttl)`.
  - Bypass caching for authenticated/admin requests.
- **Cache Invalidation**:
  - Mutating operations (`POST`, `PUT`, `PATCH`, `DELETE`) must invalidate specific keys and list patterns using `deleteCache` and `deleteByPattern`.
- **Authentication & Role Guards**:
  - Protect authenticated endpoints with `protect` and role boundaries with `allowedTo(...roles)`.
  - Use `optionalAuth` for endpoints with public and admin views.
- **Rate Limiting**:
  - Apply the appropriate rate limiter from `src/middlewares/rateLimit.middleware.js` to public or sensitive endpoints.
