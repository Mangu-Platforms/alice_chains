# Alice Chains — Test Strategy & Plan

**Repo:** `Mangu-Platforms/alice_chains` · **Runner:** Vitest (`package.json:92` declares `^3.0.0`; `package-lock.json` pins 3.2.7) · **Stack under test:** Hono + tRPC 11 + Socket.IO 4.8.3 + Drizzle 0.40.1 / MySQL 8 + React 19.

Every claim about existing code cites `file.ts:LINE`. Unverifiable items are marked `> **UNVERIFIED:**`.

> **UNVERIFIED:** Requirement-ID numeric suffixes are assigned by this document; reconcile with the PRD. Task-ID meanings are pinned by the program brief only for `S-2`, `S-3`, `S-4`; the rest are inferred (see §9).

---

## 1. Current state

### 1.1 What exists

**One test file: `api/kimi/session.test.ts` (18 lines, 1 test).**

| Line | What it does |
|---|---|
| `:3-9` | `beforeAll` sets `DATABASE_URL`, `VITE_KIMI_AUTH_URL`, `VITE_APP_ID`, `APP_SECRET`, `JWT_SECRET` on `process.env` — required because `api/lib/env.ts:14` calls `envSchema.parse(process.env)` at module load and throws otherwise |
| `:13` | dynamic `await import("./session")` — deliberate, so the env is set before `api/lib/env.ts` evaluates |
| `:14-15` | round-trips a token and asserts `verifySessionToken(token)?.userId === 42` |
| `:16` | asserts `verifySessionToken(\`${token}tampered\`)` is `undefined` |

Confirmed green in this tree: `npx vitest run` → `1 passed (1)`, 752 ms.

### 1.2 Coverage gap

| Area | Files | Tests |
|---|---|---|
| Session sign/verify | `api/kimi/session.ts` (51 lines) | 1 (partial — no expiry, no cookie options, no `getSessionToken`) |
| OAuth callback | `api/kimi/auth.ts` (110 lines) | **0** |
| tRPC context/middleware | `api/context.ts`, `api/middleware.ts` | **0** |
| Conversation router | `api/conversation-router.ts` (260 lines) | **0** |
| Message router | `api/message-router.ts` (157 lines) | **0** |
| Contact router | `api/contact-router.ts` (189 lines) | **0** |
| Socket handlers | `api/socket.ts` (213 lines) | **0** |
| HTTP bootstrap / logout | `api/boot.ts` (73 lines) | **0** |
| Client (hooks, pages, providers) | `src/**` | **0** |
| E2E | — | **0** |

Roughly **1 000 lines of server logic behind 1 assertion.** Every authorization check, every membership guard, the entire realtime path and the entire OAuth path are untested.

### 1.3 Two infrastructure defects, both now fixed in the working tree

1. **`vitest` was missing from `devDependencies`.** `package.json:19` has declared `"test": "vitest run"` since before the fix, and `.github/workflows/ci.yml:18` runs `npm test` — so CI failed at the `npm test` step with "vitest: command not found". Now present: `package.json:92` → `"vitest": "^3.0.0"` (resolved 3.2.7).
2. **`vitest.config.ts` lacked path aliases.** `api/kimi/session.ts:2` imports `@contracts/constants`, `api/queries/connection.ts:3` imports `@db/schema`, and `src/**` imports `@/…`. Vitest does not read `vite.config.ts` when a `vitest.config.ts` exists, so collection failed on module resolution. Now mirrored at `vitest.config.ts:9-13` (`@`, `@db`, `@contracts`), with a comment at `:6-8` recording why.

Both fixes are **uncommitted**: `git status` shows `vitest.config.ts` and `package.json` as modified and `package-lock.json` as untracked. `npm ci` fails without a committed lockfile, so CI still breaks from a clean clone of `origin/main` until they land (see TC-REG-01).

---

## 2. Test pyramid & targets

```
        ▲  E2E (Playwright, 2 browsers)          ~8 specs      target  5%
       ███ Realtime integration (socket.io-client + MySQL)  ~35 tests  20%
      █████ HTTP/tRPC integration (app.fetch + MySQL)       ~55 tests  30%
    █████████ Unit (pure fns, schemas, guards)              ~80 tests  45%
```

**Rationale for the unusually fat integration band:** almost every defect in this codebase lives at a boundary — SQL semantics (`api/message-router.ts:68`), room fan-out (`api/socket.ts:127-145`), cookie strings (`api/kimi/auth.ts:102`), missing DB constraints (`db/migrations/0000_lumpy_marten_broadcloak.sql`). Pure-unit tests cannot observe any of them.

### 2.1 Coverage targets

| Scope | Lines | Branches | Enforcement |
|---|---|---|---|
| `api/**` excluding `api/boot.ts` | 85% | 75% | CI gate, blocking |
| `api/kimi/**`, `api/middleware.ts`, `api/context.ts` | 95% | 90% | CI gate, blocking |
| `contracts/**` | 100% | 100% | CI gate, blocking |
| `src/hooks/**`, `src/providers/**` | 60% | — | warn only |
| `src/components/ui/**` | excluded | — | vendored shadcn |
| Repo overall | 70% | 60% | CI gate, blocking |

Ratchet-only: the threshold may rise in a PR, never fall.

### 2.2 "Meaningful assertion"

A test counts only if **all** hold:

1. It asserts a **value or an observable effect**, not merely that a call did not throw. `expect(fn()).not.toThrow()` alone is not a test.
2. For authorization tests, it asserts **both** the denial (error code / empty result) **and** that no side effect occurred (row count unchanged, no socket event received).
3. For realtime tests, it asserts the **recipient set**, not just that some event fired — e.g. sender receives `newMessage` (`api/socket.ts:127` uses `io.to`, which includes the sender) but does **not** receive `userTyping` (`api/socket.ts:192` uses `socket.to`, which excludes it).
4. It fails if the guard is deleted. Before merging, delete the guard locally and confirm red. (Mutation spot-check, not full mutation testing.)
5. It asserts the specific error **code**, not a message substring — `TRPCError.code === "FORBIDDEN"`, `HTTP 400`, socket `validationError` — so refactors of copy do not break tests and code regressions do.

---

## 3. Tooling

| Layer | Tool | Notes |
|---|---|---|
| Unit + integration | **Vitest** — `package.json:92` declares `"vitest": "^3.0.0"`; the committed lockfile resolves it to 3.2.7 | already installed |
| HTTP | **`app.fetch(new Request(...))`** against the exported Hono app (`api/boot.ts:33`) — supertest-style, no server socket | `api/boot.ts:48` gates the bootstrap on `NODE_ENV !== "test"`, so importing the app in tests binds **no port** |
| tRPC direct | `appRouter.createCaller(ctx)` (`api/router.ts:7`) | for procedure-level tests without HTTP framing/superjson |
| Realtime | **`socket.io-client` 4.8.3** — already a dependency (`package.json:65`) | real `http.Server` + `initSocket()` (`api/socket.ts:21`) on an ephemeral port |
| DB | **MySQL 8 service container** in CI; `docker-compose.yml:2-19` (`mysql:8.4`) locally | migrations applied with `drizzle-kit migrate` (`package.json:15`) |
| E2E | **Playwright** (`@playwright/test`) | two browser contexts for live delivery |
| Coverage | **`@vitest/coverage-v8`** | |
| Load | **k6** or **artillery** with a Socket.IO scenario | §7 |

### 3.1 New devDependencies

```jsonc
"@vitest/coverage-v8": "^3.2.0",
"@playwright/test": "^1.49.0",
"cross-env": "^7.0.3",          // NODE_ENV=test on Windows dev boxes
"msw": "^2.7.0"                 // intercept fetch to the Kimi IdP in OAuth tests
```

`socket.io-client` is already a runtime dependency (`package.json:65`) and needs no addition.

### 3.2 `vitest.config.ts` — required changes

Keep the aliases at `:9-13` verbatim. Replace the `test` block (`:15-20`) with:

```ts
test: {
  globals: true,
  setupFiles: ["./test/setup.ts"],
  exclude: ["node_modules/**", "dist/**"],
  coverage: {
    provider: "v8",
    reporter: ["text", "lcov"],
    include: ["api/**", "contracts/**", "src/hooks/**", "src/providers/**"],
    exclude: ["api/boot.ts", "src/components/ui/**", "**/*.test.*"],
    thresholds: { lines: 70, branches: 60, "api/kimi/**": { lines: 95, branches: 90 } },
  },
  projects: [
    {
      test: {
        name: "unit",
        environment: "node",
        include: ["api/**/*.test.ts", "contracts/**/*.test.ts"],
        exclude: ["**/*.int.test.ts"],
      },
    },
    {
      test: {
        name: "integration",
        environment: "node",
        include: ["api/**/*.int.test.ts", "test/**/*.int.test.ts"],
        globalSetup: ["./test/global-setup.int.ts"],  // migrate + seed
        hookTimeout: 60_000,
        fileParallelism: false,                        // one DB, serial files
      },
    },
    {
      test: {
        name: "client",
        environment: "jsdom",
        include: ["src/**/*.test.{ts,tsx}"],
      },
    },
  ],
}
```

`test/setup.ts` replaces the per-file `beforeAll` at `api/kimi/session.test.ts:3-9`:

```ts
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "mysql://alice:alice_pw@127.0.0.1:3306/alice_test";
process.env.VITE_KIMI_AUTH_URL ??= "https://kimi.test";   // bare origin (SEC-C-01)
process.env.VITE_APP_ID ??= "test-app";
process.env.APP_SECRET ??= "test-secret-at-least-32-characters-long";
process.env.JWT_SECRET ??= "test-signing-secret-at-least-32-chars";
process.env.PUBLIC_BASE_URL ??= "http://localhost:3000";
```

`api/kimi/session.test.ts:13` may then use a static import; keep the dynamic import if any test needs to re-import with a different `JWT_SECRET` (TC-AUTH-08).

### 3.3 `package.json` scripts

```jsonc
"test": "vitest run --project unit --project client",
"test:int": "vitest run --project integration",
"test:e2e": "playwright test",
"test:cov": "vitest run --coverage",
"validate": "npm run typecheck && npm test && npm run lint && npm run build"
```

`validate` already exists at `package.json:22`; extend CI (not `validate`) with `test:int` so the local loop stays DB-free.

### 3.4 Connection-pool caveat

`api/queries/connection.ts:6` creates the mysql2 pool **at module import**, module-scoped, with no exported close. `mysql2.createPool` connects lazily, so unit tests may import routers safely — but any integration test that issues a query leaves open sockets and Vitest will not exit. **Required change:** export `closeDb()` from `api/queries/connection.ts` and call it in an `afterAll`, or the integration project hangs.

---

## 4. Test data strategy

### 4.1 Factories

`test/factories.ts` — pure builders, explicit overrides, no global mutable state:

```ts
let seq = 0;
export const nextId = () => ++seq;

export const aUser = (o: Partial<InsertUser> = {}): InsertUser => ({
  unionId: `union-${nextId()}`, name: `User ${seq}`,
  email: `u${seq}@test.local`, avatar: null, ...o,
});

export const aDirectConversation = async (db, a: number, b: number) => { /* insert conv + 2 participants */ };
export const aMessage = (o = {}) => ({ content: `msg ${nextId()}`, type: "text" as const, ...o });

/** Signed cookie header for a user, using the same code path as production. */
export const authCookie = (u: { id: number; unionId: string; name: string }) =>
  `alice_session=${createSessionToken({ userId: u.id, unionId: u.unionId, name: u.name })}`;
```

Rules: factories never assert; they return data or ids. Tests declare only the fields they care about. No shared "world" fixture — a test that needs two users creates two users.

### 4.2 Determinism

* `seq` resets in `beforeEach`; every generated value carries the sequence number, so failures name their own data.
* Time: `vi.setSystemTime()` for expiry tests (TC-AUTH-04, TC-AUTH-06). `iat` is `Date.now()` (`api/kimi/session.ts:24`) and expiry is a `Date.now()` delta (`api/kimi/session.ts:36`), so fake timers alone are sufficient — no DB clock involvement.
* `messages.createdAt` is a DB `DEFAULT (now())` with **one-second resolution** (`db/migrations/0000_lumpy_marten_broadcloak.sql:49`). Ordering tests must set `createdAt` explicitly rather than relying on insert order (TC-MSG-01, TC-CONV-04).
* No `Math.random()` or `Date.now()` in assertions.

### 4.3 Isolation

Primary: **truncate between tests.** MySQL DDL is non-transactional and `mysql2`'s pool hands out arbitrary connections, so a per-test transaction cannot wrap code that calls `getDb()` internally.

```ts
beforeEach(async () => {
  const db = getDb();
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const t of ["message_reads","messages","conversation_participants","conversations","contacts","users"]) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${t}\``));   // sql-ok: fixed identifier allow-list
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
});
```

TRUNCATE also resets `AUTO_INCREMENT`, so ids are reproducible per test. `fileParallelism: false` (§3.2) prevents cross-file interference on the single database.

> Alternative for a later phase: one schema per worker (`alice_test_${VITEST_WORKER_ID}`) to restore parallelism. Not required at the current suite size.

### 4.4 Local seeded dev DB

`npm run db:seed` (new) against `docker-compose.yml`'s MySQL: 5 users (`alice`, `bob`, `carol`, `dave`, `erin`), 1 accepted contact pair, 1 direct conversation with 30 messages spread over 3 days, 1 group of 4 with 10 messages, 1 pending contact request, 1 blocked pair. Idempotent (upsert by `unionId`, mirroring `api/queries/users.ts:10-13`). The seed file is also the fixture source for Playwright.

---

## 5. Test catalogue

Legend: **U** unit · **I** integration (DB) · **R** realtime · **E** E2E. "Verifies" cites the requirement and, where relevant, the security control from `SECURITY.md`.

### 5.1 Auth & session — `api/kimi/session.ts`, `api/kimi/auth.ts`, `api/boot.ts`

| ID | Type | Preconditions | Steps | Expected | Verifies |
|---|---|---|---|---|---|
| TC-AUTH-01 | U | `JWT_SECRET` set | `createSessionToken({userId:42,unionId:"alice",name:"Alice"})` → `verifySessionToken` | returns `{userId:42, unionId:"alice", name:"Alice", iat:<number>}`; token matches `/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/` | FR-AUTH-01 (`api/kimi/session.ts:23-26`) |
| TC-AUTH-02 | U | token from TC-AUTH-01 | flip one char of the **signature** half | `undefined` | FR-AUTH-01 (`:31-34`) |
| TC-AUTH-03 | U | token from TC-AUTH-01 | re-encode payload with `userId:1` and keep the old signature | `undefined` (length equal, bytes differ) | FR-AUTH-01, SEC-C |
| TC-AUTH-04 | U | fake timers | sign at `T`; advance `7d + 1s`; verify | `undefined` — `Date.now() - iat > 604800000` (`:36`) | FR-AUTH-03 |
| TC-AUTH-05 | U | fake timers | sign at `T`; advance `7d - 1s`; verify | session returned | FR-AUTH-03 |
| TC-AUTH-06 | U | — | verify `""`, `"abc"`, `"a.b.c"`, `".x"`, `"x."`, `"$$$.$$$"` | all `undefined`; **no throw** — `:29-30` short-circuit and the caller's `catch` (`api/kimi/auth.ts:17-19`) | NFR-SEC-03 |
| TC-AUTH-07 | U | — | payload without `unionId`, correctly signed | `undefined` (`:36` first clause) | FR-AUTH-01 |
| TC-AUTH-08 | U | two secrets | sign with secret A; re-import module with secret B; verify | `undefined` — proves the HMAC key is load-bearing | SEC-C-24 |
| TC-AUTH-09 | U | — | supply a signature of **different byte length** | `undefined`, and `timingSafeEqual` is never reached (it throws on unequal lengths) — asserts the `a.length !== b.length` guard at `:34` | NFR-SEC-03 |
| TC-AUTH-10 | U | spy on `node:crypto.timingSafeEqual` | verify a valid and an invalid token | `timingSafeEqual` called in both paths; no `===`/`Buffer.compare` on the digest. *(Statistical timing measurement is explicitly out of scope — flaky in CI. This asserts the mechanism.)* | NFR-SEC-03 |
| TC-AUTH-11 | U | headers with `cookie: a=1; alice_session=T; b=2` | `getSessionToken(headers)` | `"T"` (`api/kimi/session.ts:7-13`, name from `contracts/constants.ts:6`) | FR-AUTH-01 |
| TC-AUTH-12 | U | headers with no `cookie` | `getSessionToken` | `undefined` (`:8-9`) | FR-AUTH-01 |
| TC-AUTH-13 | I | no cookie | `POST /api/trpc/auth.me` via `app.fetch` | tRPC error `UNAUTHORIZED` (`api/middleware.ts:10`), HTTP 401 | FR-AUTH-04 |
| TC-AUTH-14 | I | valid cookie for a user **absent from `users`** | `auth.me` | `UNAUTHORIZED` — `findUserByUnionId` returns `undefined` (`api/kimi/auth.ts:14`) | FR-AUTH-04 |
| TC-AUTH-15 | I | seeded user + valid cookie | `auth.me` | 200, body is the user row (`api/auth-router.ts:4`) | FR-AUTH-04 |
| TC-AUTH-16 | I | any state | `GET /api/logout` | 302 → `/login`; `Set-Cookie: alice_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` (`api/boot.ts:19-22`) | FR-AUTH-05 |
| TC-AUTH-17 | I | post-SEC-C-07 | `GET /api/logout` with `NODE_ENV=production` | `Set-Cookie` contains `Secure` **and** `SameSite=Lax`; asserts the current omission at `api/boot.ts:21` is fixed | SEC-C-07 |
| TC-AUTH-18 | I | post-SEC-C-05 | login → capture cookie → `GET /api/logout` → reuse the captured cookie on `auth.me` | `UNAUTHORIZED` (server-side revocation). **Currently would pass authentication** — this test is expected red until S-7 | SEC-C-05 |
| TC-AUTH-19 | I | msw intercepts token + userinfo; no user row | `GET /api/oauth/callback?code=good` | 302 → `/`; `Set-Cookie` present and verifiable by `verifySessionToken`; exactly one `users` row created with `unionId` from userinfo (`api/kimi/auth.ts:75-83`) | FR-AUTH-02 |
| TC-AUTH-20 | I | as above, user already exists | same | no new row; `name`/`email`/`avatar`/`lastSignInAt` updated (`api/queries/users.ts:11-13`) | FR-AUTH-02 |
| TC-AUTH-21 | I | msw asserts the outbound request | `GET /api/oauth/callback?code=good` | token POST body is JSON with `code`, `client_id`, `client_secret`, `grant_type:"authorization_code"`, `redirect_uri` (`api/kimi/auth.ts:42-48`); userinfo carries `Authorization: Bearer <access_token>` (`:63`) | FR-AUTH-02 |
| TC-AUTH-22 | I | — | `GET /api/oauth/callback` (no `code`) | 400 `{"error":"Missing authorization code"}` (`api/kimi/auth.ts:29-31`); no `Set-Cookie` | FR-AUTH-02 |
| TC-AUTH-23 | I | msw returns 400 on token | callback with `code` | 400, no `Set-Cookie`, no `users` row (`api/kimi/auth.ts:52-54`) | FR-AUTH-02, SEC-C-30 |
| TC-AUTH-24 | I | msw: token 200, userinfo 401 | callback | 400, no `Set-Cookie`, no `users` row (`:68-70`) | FR-AUTH-02 |
| TC-AUTH-25 | I | msw: token endpoint rejects the connection | callback | 500 `{"error":"Authentication failed"}` (`:105-108`); no unhandled rejection | NFR-REL-03 |
| TC-AUTH-26 | I | msw: userinfo returns `{}` | callback | no session issued (`unionId` undefined → `upsertUser` fails or `findUserByUnionId` misses → 500 at `:85-87`). Assert **no cookie** whichever branch runs | FR-AUTH-02 |
| TC-AUTH-27 | I | post-S-4 | callback with `state` absent while the state cookie is set | 400; no session cookie; state cookie cleared | SEC-C-03 |
| TC-AUTH-28 | I | post-S-4 | callback with `state=attacker` vs cookie `state=victim` | 400; no session; comparison uses `timingSafeEqual` | SEC-C-03 |
| TC-AUTH-29 | I | post-S-4 | valid `state`, replayed a second time | second attempt 400 (single-use) | SEC-C-03 |
| TC-AUTH-30 | I | post-S-4 (PKCE) | authorize URL built by the client | contains `code_challenge_method=S256` and a `code_challenge` equal to `base64url(sha256(verifier))`; token POST carries the matching `code_verifier` | SEC-C-04 |
| TC-AUTH-31 | U | post-SEC-C-01 | `kimiEndpoint("https://kimi.test","authorize"\|"token"\|"userinfo")` | `https://kimi.test/oauth/authorize`, `/api/oauth/token`, `/api/oauth/userinfo` — **no path doubling** | SEC-C-01 |
| TC-AUTH-32 | U | post-SEC-C-01 | `kimiEndpoint("https://example.com/oauth/authorize", …)` (the literal `.env.example:5` value) | throws "must be an origin only". Guards the confirmed out-of-the-box breakage | SEC-C-01 |
| TC-AUTH-33 | U | post-SEC-C-02 | `redirect_uri` derived on client and server | byte-identical, both `${PUBLIC_BASE_URL}/api/oauth/callback`; independent of the inbound `Host` (today the server uses `url.origin`, `api/kimi/auth.ts:47`, which differs from the client's `window.location.origin`, `src/pages/Login.tsx:6`, under the Vite proxy `vite.config.ts:17-20`) | SEC-C-02 |
| TC-AUTH-34 | U | post-SEC-C-24 | `envSchema.parse({ …, JWT_SECRET: "a" })` | throws (min 32). Today `api/lib/env.ts:8` accepts it | SEC-C-24 |

### 5.2 tRPC authorization

| ID | Type | Preconditions | Steps | Expected | Verifies |
|---|---|---|---|---|---|
| TC-AUTHZ-01 | I | no cookie | call **every** procedure in a table-driven loop: `auth.me`, `conversation.list/getById/createDirect/createGroup/markAsRead`, `message.listByConversation/send/markAsRead`, `contact.list/pending/add/accept/remove/searchUsers` | all `UNAUTHORIZED` (`api/middleware.ts:9-12`). The list is derived from `appRouter._def.procedures` so a new procedure that forgets `authedQuery` fails this test automatically | NFR-SEC-05 |
| TC-AUTHZ-02 | I | no cookie | `ping` | 200 `{ok:true}` — the only intentionally public procedure (`api/router.ts:8`) | — |
| TC-AUTHZ-03 | I | users A,B; conversation of B+C | A calls `conversation.getById({id})` | `null`, not the row (`api/conversation-router.ts:124`) | FR-CONV-02 |
| TC-AUTHZ-04 | I | as above, 5 messages present | A calls `message.listByConversation` | `[]` (`api/message-router.ts:37`) | FR-CONV-02 |
| TC-AUTHZ-05 | I | as above | A calls `message.send` | error thrown (`api/message-router.ts:112`); **`messages` row count unchanged** | FR-CONV-02 |
| TC-AUTHZ-06 | I | post-SEC-C-26 | same as TC-AUTHZ-05 | `TRPCError.code === "FORBIDDEN"` (today a bare `Error` → `INTERNAL_SERVER_ERROR`) | SEC-C-26 |
| TC-AUTHZ-07 | I | A not a participant | A calls `conversation.markAsRead({conversationId})` | `{success:true}` but **zero rows updated** — the WHERE is scoped by `userId` (`api/conversation-router.ts:252-256`) | FR-CONV-04 |
| TC-AUTHZ-08 | I | message M in a conversation A is **not** in | A calls `message.markAsRead({messageIds:[M]})` | **Currently:** a `message_reads` row is created — no check exists (`api/message-router.ts:135-156`). Test asserts the post-fix behaviour: row **not** created. Expected red until SEC-C-10 | SEC-C-10 |
| TC-AUTHZ-09 | I | users A,B; B has 3 contacts | A calls `contact.list` | only A's rows (`api/contact-router.ts:26-31`) | FR-CONT-01 |
| TC-AUTHZ-10 | I | A authenticated | `contact.searchUsers({query:"@"})` | **Currently:** every user with `@` in name or e-mail, including `email` (`api/contact-router.ts:171-187`). Post-SEC-C-12: `BAD_REQUEST` for `query.length < 3` and no `email` field in results | SEC-C-12 |

### 5.3 Conversations — `api/conversation-router.ts`

| ID | Type | Preconditions | Steps | Expected | Verifies |
|---|---|---|---|---|---|
| TC-CONV-01 | I | users A,B; no conversations | A: `createDirect({otherUserId:B})` twice | **Verified from source: idempotent in the simple case.** The second call finds a common `conversationId` (`:167-184`), confirms `type='direct'` (`:186-196`) and returns the existing row. Assert: exactly one `conversations` row and two `conversation_participants` rows | FR-CONV-01 |
| TC-CONV-02 | I | A,B share a **group** created before any DM, and a direct conversation created after | A: `createDirect({otherUserId:B})` | **Currently a duplicate DM is created.** `convIds1.find(id => convIds2.includes(id))` (`:184`) picks only the *first* shared id; if that is the group, the `type='direct'` filter (`:190-193`) misses and control falls through to the insert at `:200`. Test asserts the post-fix behaviour: the existing direct conversation is returned. Expected red until fixed | FR-CONV-01 |
| TC-CONV-03 | I | A,B,C | A: `createGroup({name:"Team", participantIds:[B,C]})` | one row `type='group'`, `createdBy=A`; **3** participants — the creator is unioned in and duplicates de-duped by `new Set` (`:234`) | FR-CONV-03 |
| TC-CONV-04 | I | A: conv X created first (message at `T+10`), conv Y created second (message at `T+1`) | A: `conversation.list` | **Currently ordered by `conversations.updatedAt` desc (`:38`), and nothing in the codebase ever updates that column** (no `update(conversations…)` call exists) — so the order is Y, X (creation order), *not* last-message order. Test asserts the intended order X, Y and is expected red until `updatedAt` is bumped on send (or the ORDER BY moves to the latest message) | FR-CONV-05 |
| TC-CONV-05 | I | conv with 3 messages | A: `conversation.list` | `latestMessage` is the newest by `createdAt` (`:65-70`); `null` for a conversation with no messages (`:101`) | FR-CONV-05 |
| TC-CONV-06 | I | direct conv A↔B, B named "Bob" | A: `conversation.list` | `displayName === "Bob"`, `displayAvatar === B.avatar` (`:86-93`); from B's side, `"A"` | FR-CONV-05 |
| TC-CONV-07 | I | group named `null` | `conversation.list` | `displayName === "Group Chat"` fallback (`:89`) | FR-CONV-05 |
| TC-CONV-08 | I | direct conv where the other user row was deleted | `conversation.list` | `displayName === "Unknown"` (`:88`) — proves the `leftJoin` (`:49`) tolerates the missing FK | NFR-REL-01 |
| TC-CONV-09 | I | A in no conversations | `conversation.list` | `[]`, and **no second query issued** (early return at `:24`) | NFR-PERF-02 |
| TC-CONV-10 | I | A participant, `lastReadAt` null | A: `conversation.markAsRead({conversationId})` | `lastReadAt` set to ~now; only A's participant row changed (`:249-257`) | FR-CONV-04 |
| TC-CONV-11 | I | post-SEC-C-11 | A: `createGroup({participantIds:[999999]})` (non-existent user) | `BAD_REQUEST`; no conversation created. **Currently succeeds** — no existence check and no FK (`db/migrations/…:12-19`) | SEC-C-11 |
| TC-CONV-12 | I | post-SEC-C-11 | A: `createGroup({participantIds:[…257 ids]})` | `BAD_REQUEST` (cap 256). Currently `.min(1)` with no max (`:219`) | SEC-C-11 |
| TC-CONV-13 | I | post-SEC-C-11, B blocked A | A: `createDirect({otherUserId:B})` | `FORBIDDEN`; no conversation | SEC-C-11 |

### 5.4 Messages — `api/message-router.ts`

| ID | Type | Preconditions | Steps | Expected | Verifies |
|---|---|---|---|---|---|
| TC-MSG-01 | I | participant A, 120 messages with explicit distinct `createdAt` | `listByConversation({conversationId, limit:50, offset:0})` | 50 items; **ascending** by `createdAt` (query is `desc` + `.reverse()`, `:56,78`); the newest message is last | FR-MSG-02 |
| TC-MSG-02 | I | same | `offset:50` then `offset:100` | 50 then 20 items; no overlap, no gaps across the union of the three pages | FR-MSG-02 |
| TC-MSG-03 | I | same | `offset:200` | `[]` | FR-MSG-02 |
| TC-MSG-04 | I | same | `limit:0`, `limit:101`, `offset:-1` | all rejected by Zod (`:17-18`); `limit:100` accepted | FR-MSG-02 |
| TC-MSG-05 | I | no messages | `listByConversation` | `[]`; the read-receipt query is skipped (`:64`) | FR-MSG-02 |
| TC-MSG-06 | I | participant | `send({content:""})` | Zod rejection, `content.min(1)` (`:89`); no row | FR-MSG-01 |
| TC-MSG-07 | I | participant | `send({content:"x"})` | 1 char accepted; row created | FR-MSG-01 |
| TC-MSG-08 | I | participant | `send({content:"x".repeat(4000)})` | accepted; stored value is exactly 4000 chars | FR-MSG-01 |
| TC-MSG-09 | I | participant | `send({content:"x".repeat(4001)})` | Zod rejection (`:89`); no row | FR-MSG-01 |
| TC-MSG-10 | I | participant, 4-byte emoji content | `send` | round-trips unchanged. **Also asserts the DB charset is `utf8mb4`** — the migration declares no charset (`db/migrations/0000_…`), so this depends on the server default and is a genuine risk | FR-MSG-01, NFR-REL-01 |
| TC-MSG-11 | I | message M1 exists | `send({replyToId: M1})` then list | the reply row carries `replyToId === M1` (`:120`, projected at `:47`) | FR-MSG-03 |
| TC-MSG-12 | I | `replyToId` pointing at a message in another conversation | `send` | **Currently accepted** (no validation, no FK). Test asserts post-fix rejection. Expected red | SEC-C-11 |
| TC-MSG-13 | I | `type:"bogus"` | `send` | Zod rejection (`:90`) | FR-MSG-01 |
| TC-MSG-14 | I | 3 messages, receipts by B on **all three** | A: `listByConversation` | **This is the raw-SQL bug.** `sql\`${messageReads.messageId} IN (${messageIds.join(",")})\`` (`:68`) compiles to `IN (?)` with the single parameter `"7,8,9"`; MySQL coerces it to `7`, so only the first id matches. Assert every message reports `readBy.length === 1`. **Expected red today** — currently two of three report `readBy: []` | FR-MSG-05, SEC-C-15 |
| TC-MSG-15 | U | — | compile the fixed predicate with `MySqlDialect().sqlToQuery()` | `IN (?, ?, ?)` with `params:[7,8,9]` — regression guard on the `inArray` fix (`SECURITY.md` §6.2) | SEC-C-15 |
| TC-MSG-16 | I | messages exist, none read | `listByConversation` | every item has `readBy: []`; the guard at `:64` prevents `IN ()` | FR-MSG-05 |
| TC-MSG-17 | I | post-fix, guard at `:64` removed in a mutant build | `listByConversation` on an empty page | must not produce `IN ()` syntax error — the `inArray` fix makes the guard redundant | SEC-C-15 |
| TC-MSG-18 | I | — | `message.markAsRead({messageIds:[]})` | `{success:true}`, no query issued (`:141`) | FR-MSG-05 |
| TC-MSG-19 | I | message M | `markAsRead({messageIds:[M]})` twice | **Currently two rows** in `message_reads` — the `try/catch` at `:146-152` cannot dedupe because there is no UNIQUE key (`db/migrations/…:32-38`). Post-S-3: exactly one row. Expected red until S-3 | FR-MSG-05, SEC-C-16 |
| TC-MSG-20 | I | 200 ids | `markAsRead` | completes; post-SEC-C-13 an array of 201 is rejected (currently uncapped, `:136`, one INSERT per id at `:144`) | SEC-C-13 |
| TC-MSG-21 | I | A sends, B lists | both list the conversation | `isMine` is `true` for A and `false` for B on the same row (`:81`) | FR-MSG-02 |
| TC-MSG-22 | I | sender row deleted | `listByConversation` | `senderName`/`senderAvatar` are `null` (leftJoin, `:54`); no crash | NFR-REL-01 |

### 5.5 Contacts — `api/contact-router.ts`

| ID | Type | Preconditions | Steps | Expected | Verifies |
|---|---|---|---|---|---|
| TC-CONT-01 | I | A,B, no contacts | A: `add({contactUserId:B})` | two rows, both `status='pending'` (forward `:89-93`, reverse `:96-105`) | FR-CONT-02 |
| TC-CONT-02 | I | after TC-CONT-01 | B: `pending` | one row, `userId=A`, `contactName='A'` (`:53-58`) | FR-CONT-02 |
| TC-CONT-03 | I | after TC-CONT-01 | A: `pending` | **Currently A also sees one pending row, apparently *from* B.** `pending` filters on `contactUserId = me` (`:55`), which matches the *reverse* row `add` created (`:96-105`), and the `leftJoin` on `contacts.userId` (`:52`) labels it with B's name — so the requester is shown an incoming request from the person they just added (`src/pages/Contacts.tsx:329`). Test asserts the intended `[]` and is expected red until the reverse row is written with a distinct status (e.g. `requested`) or `pending` is filtered accordingly | FR-CONT-02 |
| TC-CONT-04 | I | after TC-CONT-01 | B: `accept({contactId:A})` | **both** rows become `accepted` (`:117-136`). Note the input is named `contactId` but is used as a **user id** (`:123`), matching the client at `src/pages/Contacts.tsx:349` (`request.userId`) | FR-CONT-02 |
| TC-CONT-05 | I | after accept | A: `list` and B: `list` | each sees exactly one accepted contact with the other's `name`/`avatar`/`email` (`:12-31`) | FR-CONT-01 |
| TC-CONT-06 | I | after TC-CONT-01 | A: `add({contactUserId:B})` again | throws "Contact request already exists" (`:85-87`); still two rows | FR-CONT-02 |
| TC-CONT-07 | I | B already sent to A | A: `add({contactUserId:B})` | throws "Contact request already exists" — `add` already created the reverse row `(A→B)` (`:96-105`), which the forward-direction check finds (`:74-83`). Still two rows total | FR-CONT-02 |
| TC-CONT-08 | I | A | A: `add({contactUserId:A})` | throws "Cannot add yourself as a contact" (`:69-71`); zero rows | FR-CONT-02 |
| TC-CONT-09 | I | accepted pair | A: `remove({contactUserId:B})` | **both** directions deleted (`:149-159`); `list` empty for both | FR-CONT-03 |
| TC-CONT-10 | I | pending request | receiver: `remove` | request disappears from `pending` (rejection path used by `src/pages/Contacts.tsx:337-340`) | FR-CONT-03 |
| TC-CONT-11 | I | pair with `status='blocked'` | A: `list`, B: `list` | neither appears (filter is `status='accepted'`, `:29`) | FR-CONT-04 |
| TC-CONT-12 | I | post-SEC-C-11, B blocked A | A: `add({contactUserId:B})` / `message.send` to a shared conv | `FORBIDDEN`; no rows. **Currently `blocked` is stored but never enforced anywhere** | SEC-C-11 |
| TC-CONT-13 | I | users "Alice Smith"/`alice@x.io`, "Bob"/`bob@y.io`; caller = Alice | `searchUsers({query:"ali"})` | Bob absent; **Alice herself absent** — filtered post-query (`:187`) | FR-CONT-05 |
| TC-CONT-14 | I | as above | `searchUsers({query:"y.io"})` | matches Bob by e-mail (`:182`) | FR-CONT-05 |
| TC-CONT-15 | I | 25 matching users | `searchUsers` | at most 20 rows (`:185`), minus self-filtering | FR-CONT-05, NFR-PERF-02 |
| TC-CONT-16 | I | — | `searchUsers({query:""})` | Zod rejection (`:166`) | FR-CONT-05 |
| TC-CONT-17 | I | post-SEC-C-12 | `searchUsers({query:"%"})` | wildcard escaped → no match-all; result does **not** include the `email` field | SEC-C-12 |
| TC-CONT-18 | I | A,B, no contacts | fire two `add({contactUserId:B})` calls concurrently | **Currently 4 rows** — the existence check (`:74-83`) and the insert (`:89`) are not atomic and no UNIQUE key backstops the race, so both calls pass the check. Post-S-3: 2 rows, the loser gets `ER_DUP_ENTRY`, surfaced as "Contact request already exists". Expected red until S-3 | SEC-C-16 |

### 5.6 Sockets — `api/socket.ts`

Harness: real `http.Server` + `initSocket()` (`api/socket.ts:21`) on port 0; clients connect with `extraHeaders: { cookie: authCookie(user) }`; every assertion has a 2 s deadline and a "did NOT receive" assertion uses a 500 ms quiet window.

| ID | Type | Preconditions | Steps | Expected | Verifies |
|---|---|---|---|---|---|
| TC-SOCK-01 | R | — | connect with no cookie | `connect_error` with message `"Unauthorized"`; no `connection` handler runs (`:30-39`) | NFR-SEC-05 |
| TC-SOCK-02 | R | — | connect with a tampered cookie | `connect_error` "Unauthorized" | NFR-SEC-05 |
| TC-SOCK-03 | R | valid user | connect | `connect` fires; `onlineUsers` received (`:54`); server-side `socket.data.userId` equals the DB id (`:37`) | FR-PRES-01 |
| TC-SOCK-04 | R | A not a participant of conv X | A emits `joinConversation({conversationId:X})` | silent no-op — A's socket is **not** in room `conv_X`; B's later message is not delivered to A (`:66-68`) | FR-CONV-02 |
| TC-SOCK-05 | R | A and B both participants, both joined | A emits `sendMessage` | both A **and** B receive `newMessage` (`io.to(room)` at `:127` includes the sender); payload carries `tempId` echoed back (`:129`) and the DB `id` (`:116`) | FR-MSG-01 |
| TC-SOCK-06 | R | A,B,C participants; only A joined the room; all three connected | A emits `sendMessage` | every participant's `user_<id>` room receives `conversationUpdated` (`:140-145`) even though B and C never joined `conv_<id>` | FR-CONV-05 |
| TC-SOCK-07 | R | A not a participant | A emits `sendMessage` | no `newMessage` anywhere; no `messages` row; no error emitted (silent `return` at `:104`) | FR-CONV-02 |
| TC-SOCK-08 | R | participants A,B in room | A emits `typing({isTyping:true})` | B receives `userTyping`; **A does not** (`socket.to` at `:192` excludes the sender); payload `{userId:A, conversationId, isTyping:true}` | FR-PRES-03 |
| TC-SOCK-09 | R | A not a participant | A emits `typing` | nobody receives anything (`:191`) | FR-PRES-03 |
| TC-SOCK-10 | R | A,B in room; messages M1,M2 | B emits `markAsRead({messageIds:[M1,M2], conversationId})` | A receives `messagesRead {messageIds:[M1,M2], userId:B}`; **B does not** (`socket.to` at `:177`); two `message_reads` rows | FR-MSG-05 |
| TC-SOCK-11 | R | B not a participant | B emits `markAsRead` | no event, no rows (`:161`) | FR-CONV-02 |
| TC-SOCK-12 | R | B participant of conv X only; message M belongs to conv Y | B emits `markAsRead({conversationId:X, messageIds:[M]})` | **Currently a receipt row for M is written** — ids are never checked against the conversation (`:165-174`). Post-SEC-C-10: no row. Expected red | SEC-C-10 |
| TC-SOCK-13 | R | user A opens **3** sockets | connect s1, s2, s3 | `userOnline` broadcast **exactly once**, on s1 (`wasOffline` at `:46,51`); `onlineUsers` map holds one entry with 3 socket ids (`:11,45-48`) | FR-PRES-01 |
| TC-SOCK-14 | R | after TC-SOCK-13 | disconnect s1, then s2 | **no** `userOffline` yet; `getOnlineUsers()` still contains A (`:202-204`) | FR-PRES-02 |
| TC-SOCK-15 | R | after TC-SOCK-14 | disconnect s3 | `userOffline {userId:A}` broadcast exactly once; `getOnlineUsers()` has **no** key for A — the map entry is deleted, not left as an empty `Set` (`:205-207`) | FR-PRES-02 |
| TC-SOCK-16 | R | A connected, then abruptly `socket.disconnect(true)` from the client | — | server cleanup runs; no leaked entry after 1 s | NFR-REL-04 |
| TC-SOCK-17 | R | users A,B, unrelated (no shared conversation, no contact) | B connects | **Currently A receives `userOnline` for B** (`socket.broadcast.emit` at `:52`) and B's first `onlineUsers` payload lists A (`:54`). Post-SEC-C-21: neither. Expected red | SEC-C-21 |
| TC-SOCK-18 | R | — | emit `sendMessage` with `conversationId: "abc"` | **Currently:** the query runs with a string and the handler silently returns (or the `catch` at `:147` fires). Post-SEC-C-13: `validationError` emitted, no DB access | SEC-C-13 |
| TC-SOCK-19 | R | — | emit `sendMessage` with `content` of 100 000 chars | **Currently stored in full** — the 4000-char cap exists only on the tRPC path (`api/message-router.ts:89`), and the UI sends via the socket (`src/pages/Chat.tsx:157`). Post-SEC-C-13: `validationError`, no row | SEC-C-13 |
| TC-SOCK-20 | R | — | emit `sendMessage` with extra key `{admin:true}` | post-SEC-C-13 `.strict()` rejection | SEC-C-13 |
| TC-SOCK-21 | R | — | emit `markAsRead` with `messageIds: undefined` | no crash — `data.messageIds.length` throws inside the `try` and is swallowed at `:181`. Post-SEC-C-13: `validationError` | NFR-REL-03 |
| TC-SOCK-22 | R | — | emit `joinConversation` with `null` | no crash; post-fix `validationError` | SEC-C-13 |
| TC-SOCK-23 | R | post-SEC-C-19 | emit 100 `sendMessage` in 1 s | ≤ 20 stored; `rateLimited` emitted; socket stays connected | SEC-C-19 |
| TC-SOCK-24 | R | post-SEC-C-29 | connect, then expire the session server-side | socket receives `sessionExpired` and is disconnected within 15 min (test with fake timers) | SEC-C-29 |

### 5.7 Data integrity (post-S-3)

| ID | Type | Steps | Expected | Verifies |
|---|---|---|---|---|
| TC-DATA-01 | I | insert the same `(conversationId,userId)` into `conversation_participants` twice | second insert fails with `ER_DUP_ENTRY` | SEC-C-16 |
| TC-DATA-02 | I | insert the same `(messageId,userId)` into `message_reads` twice via the app path | exactly one row; the app's `try/catch` (`api/socket.ts:167-173`, `api/message-router.ts:146-152`) swallows the duplicate and the caller sees success | SEC-C-16, FR-MSG-05 |
| TC-DATA-03 | I | insert the same `(userId,contactUserId)` into `contacts` twice | `ER_DUP_ENTRY`; and `onDuplicateKeyUpdate` at `api/contact-router.ts:103-105` now actually fires | SEC-C-16 |
| TC-DATA-04 | I | delete a conversation with participants, messages and receipts | all dependent rows removed by `ON DELETE CASCADE`; no orphans | SEC-C-16 |
| TC-DATA-05 | I | delete a message that is another message's `replyToId` target | the replying row survives with `replyToId IS NULL` (`ON DELETE SET NULL`) | SEC-C-16 |
| TC-DATA-06 | I | insert a message with `conversationId` = 999999 | FK violation (today it succeeds — zero FKs in `db/migrations/0000_lumpy_marten_broadcloak.sql`) | SEC-C-16 |
| TC-DATA-07 | I | delete a user with contacts, messages, memberships | cascades per the migration; the app's `leftJoin` fallbacks (TC-CONV-08, TC-MSG-22) still behave | SEC-C-16 |
| TC-DATA-08 | I | `EXPLAIN` the query at `api/message-router.ts:39-58` on 100 k rows | uses `messages(conversationId, createdAt)`; no full scan | NFR-PERF-01 |
| TC-DATA-09 | I | `EXPLAIN` the participant lookup at `api/socket.ts:57-61` | uses the `conversation_participants` unique/index; no full scan | NFR-PERF-01 |
| TC-DATA-10 | I | run `drizzle-kit generate` after the S-3 migration | no pending diff — schema (`db/schema.ts`) and migrations agree | NFR-OPS-01 |

### 5.8 Regression guards

| ID | Type | Steps | Expected | Verifies |
|---|---|---|---|---|
| TC-REG-01 | CI | clean clone → `npm ci && npm run validate` | exits 0. **Guards the two fixed defects** (missing `vitest`, missing aliases) *and* guards the committed `package-lock.json` — `npm ci` fails outright without it | NFR-OPS-01, S-0 |
| TC-REG-02 | CI | `git ls-files package-lock.json index.html Dockerfile docker-compose.yml drizzle.config.ts db/migrations/0000_lumpy_marten_broadcloak.sql` | all six tracked. Today none are (`git status` lists them as untracked) | NFR-OPS-01 |
| TC-REG-03 | U | assert `index.html` exists at the repo root and references `/src/main.tsx` | true (`index.html:12`) — Vite's entry; without it `vite build` (`package.json:10`) fails | NFR-OPS-01 |
| TC-REG-04 | CI | `npm run build` then assert `dist/public/index.html` and `dist/boot.js` exist, and that `dist/public/index.html` contains a hashed `/assets/index-*.js` | true (matches the current artefact) | NFR-OPS-01 |
| TC-REG-05 | I | start with `NODE_ENV=development`, `API_PORT` unset | the API binds **3001** (`api/boot.ts:58`, `contracts/constants.ts:18`) and `http://localhost:3001/api/trpc/ping` answers. **This is the S-2 bug** — the bootstrap used to be gated on `NODE_ENV === "production"`, so `npm run dev` bound nothing and every proxied request returned `ECONNREFUSED` (`api/boot.ts:35-47`) | S-2, NFR-OPS-04 |
| TC-REG-06 | I | `NODE_ENV=development`, `API_PORT=4123` | binds 4123 | S-2 |
| TC-REG-07 | I | `NODE_ENV=production`, `PORT` unset | binds 3000 (`api/boot.ts:57`, `contracts/constants.ts:19`) and serves `dist/public/index.html` at `/` (`api/lib/vite.ts:5-8`) | NFR-OPS-04 |
| TC-REG-08 | U | `NODE_ENV=test` | importing `api/boot.ts` binds no port and starts no Socket.IO server (`api/boot.ts:48`) | NFR-OPS-04 |
| TC-REG-09 | U | assert `vite.config.ts` proxy target port === `contracts/constants.ts:18` `API_PORT`, and `vite.config.ts:15` server port === `CLIENT_PORT` | true — guards the drift the port contract comment warns about (`contracts/constants.ts:10-16`) | NFR-OPS-04 |
| TC-REG-10 | I | `GET /api/does-not-exist` | 404 `{"error":"Not Found"}` (`api/boot.ts:31`), not the SPA shell | NFR-OPS-04 |
| TC-REG-11 | U | grep `api/**` for `` sql` `` templates containing `${` on a non-column expression | zero matches outside the allow-list — enforces SEC-C-15 | SEC-C-15 |
| TC-REG-12 | U | build with the production config; grep `dist/public/assets/*.js` for `APP_SECRET`, `JWT_SECRET`, `DATABASE_URL` and their sample values | zero matches (**currently true** — verified) | SEC-C-24 |
| TC-REG-13 | U | assert no env key matching `/^VITE_/` also matches `/SECRET\|TOKEN\|KEY\|PASSWORD/i` in `api/lib/env.ts` and `.env.example` | passes | SEC-C-24 |
| TC-REG-14 | I | `POST /api/trpc/message.send` with a 2 MB body | post-SEC-C-20: 413. Currently accepted up to 50 MB (`api/boot.ts:17`) | SEC-C-20 |
| TC-REG-15 | I | `GET /` in production mode | response carries CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`; `script-src` contains no `'unsafe-inline'`/`'unsafe-eval'` | SEC-C-17 |

---

## 6. E2E scenarios (Playwright)

Fixtures: the seeded dev DB (§4.4) plus a mock Kimi IdP served by Playwright's `webServer` (a tiny Express/Hono stub implementing `/oauth/authorize`, `/api/oauth/token`, `/api/oauth/userinfo`) so no live provider is required.

| ID | Scenario | Assertions |
|---|---|---|
| TC-E2E-01 | **Sign-in** — click "Sign in" on `/login` (`src/pages/Login.tsx:8`) | redirected to the mock IdP; after consent, landed on `/`; `alice_session` cookie is `HttpOnly` and (in the prod-mode run) `Secure`; the chat shell renders |
| TC-E2E-02 | **Sign-in URL correctness** — inspect the `href` before clicking | exactly one `/oauth/authorize` segment. Directly guards the confirmed `.env.example:5` × `src/pages/Login.tsx:7` doubling |
| TC-E2E-03 | **Two-browser live delivery** — contexts A and B, same conversation open | B sees A's message without reload, < 1 s; content and sender name correct; A sees its own message once (no duplicate from the optimistic path + `newMessage`) |
| TC-E2E-04 | **Typing indicator** — A types | B shows "typing…" within 1 s; clears within 3 s of A stopping; **A never sees its own indicator** |
| TC-E2E-05 | **Read receipts** — B opens the conversation | A's message shows the read state; driven by the socket `markAsRead` fired on receipt (`src/pages/Chat.tsx:83-86`) |
| TC-E2E-06 | **Presence** — B closes the tab | A sees B go offline within 5 s; B reopens → online again |
| TC-E2E-07 | **Conversation list ordering** — B messages A in conversation Y while A is viewing X | Y moves to the top of A's list. Expected red until TC-CONV-04's ordering defect is fixed |
| TC-E2E-08 | **Logout** — A clicks logout (`src/hooks/useAuth.ts:5` → `/api/logout`) | redirected to `/login`; navigating back to `/` shows the signed-out state (`src/components/AuthLayout.tsx:14-45`); the socket is disconnected |
| TC-E2E-09 | **Unauthenticated deep link** — open `/?c=1` with no cookie | the AuthLayout sign-in panel, no message content, no socket connection |
| TC-E2E-10 | **Contact flow** — A searches, adds B; B accepts; A opens a DM | request appears in B's pending list (`src/pages/Contacts.tsx:329`); after accept both see an accepted contact; DM opens with the existing conversation, not a duplicate (TC-CONV-01) |

---

## 7. Non-functional testing

### 7.1 Socket.IO fan-out load profile

| Profile | Users | Conversations | Shape | Duration |
|---|---|---|---|---|
| P1 baseline | 100 concurrent sockets | 50 direct | 1 msg / user / 10 s | 10 min |
| P2 target | 1 000 sockets | 400 direct + 100 groups of 8 | 1 msg / user / 10 s, 20% typing | 30 min |
| P3 fan-out stress | 200 sockets | 1 group of 200 | 5 msg/s into the group | 10 min |
| P4 spike | 0 → 1 000 sockets in 30 s | as P2 | connection storm | 5 min |

Measured per profile: p50/p95/p99 **send→deliver** latency, sockets/s accepted, CPU and RSS, MySQL connections and slow-query count, event-loop lag.

Attention points grounded in the code:
* `sendMessage` performs **4 sequential DB round-trips** per message (participant check `:93-102`, insert `:107-114`, re-select `:119-123`, participants list `:133-138`) plus one `emit` per participant (`:140-145`). P3 therefore issues ~200 emits per message on top of the room broadcast.
* No indexes exist yet (`db/migrations/0000_…`), so P2 will be DB-bound until S-3 lands — run P2 before and after and record the delta as evidence for SEC-C-16.
* `getDb()` uses pool defaults (`api/queries/connection.ts:6`); watch for connection exhaustion under P4.

### 7.2 Latency budgets

| Metric | Target | Basis |
|---|---|---|
| socket `sendMessage` → `newMessage` at a peer, p95 | ≤ 250 ms same-region | NFR-PERF-03 |
| socket `sendMessage` → `newMessage`, p99 | ≤ 800 ms | NFR-PERF-03 |
| `conversation.list` p95 (50 conversations) | ≤ 200 ms | NFR-PERF-01 |
| `message.listByConversation` p95 (50 msgs) | ≤ 150 ms | NFR-PERF-01 |
| OAuth callback p95 (excluding IdP time) | ≤ 300 ms | NFR-PERF-04 |
| Socket handshake p95 | ≤ 200 ms (one DB read per handshake, `api/kimi/auth.ts:14`) | NFR-PERF-04 |

### 7.3 Soak — presence map leak

The presence map is a process-local `Map<number, Set<string>>` (`api/socket.ts:11`) mutated at `:45-48` and `:202-207`.

**TC-NFR-01 (4 h soak):** 200 users cycling connect/disconnect every 30 s, 10% using 2–3 concurrent sockets, 5% killed abruptly (no clean close). Assert after cool-down: `getOnlineUsers().size === 0` (`api/socket.ts:17-19`); no key maps to an empty `Set` (the delete at `:205` must run, not just `Set.delete` at `:203`); RSS growth < 5% over the run; no growth in Socket.IO's internal room maps.

**TC-NFR-02 (multi-process):** run two API processes behind one load balancer with no Socket.IO adapter configured (`api/socket.ts:22-28` sets none). Assert the currently-expected failure: a user connected to process 1 does **not** receive messages sent through process 2. This documents the horizontal-scaling blocker (NFR-SCALE-01) and becomes the acceptance test for a Redis adapter.

---

## 8. CI integration

Replace `.github/workflows/ci.yml` (current content: `npm ci` → `typecheck` → `test` → `lint` → `build`, `:16-20`) with:

```yaml
name: CI
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: git diff --exit-code package-lock.json   # TC-REG-01
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test -- --coverage
      - run: npm run build
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: coverage, path: coverage/ }

  integration:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.4
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: alice_test
          MYSQL_USER: alice
          MYSQL_PASSWORD: alice_pw
        ports: ["3306:3306"]
        options: >-
          --health-cmd="mysqladmin ping -h 127.0.0.1 -proot"
          --health-interval=5s --health-timeout=5s --health-retries=20
    env:
      NODE_ENV: test
      DATABASE_URL: mysql://alice:alice_pw@127.0.0.1:3306/alice_test
      JWT_SECRET: ci-signing-secret-at-least-32-characters
      APP_SECRET: ci-app-secret-at-least-32-characters-xx
      VITE_KIMI_AUTH_URL: https://kimi.test
      VITE_APP_ID: ci-app
      PUBLIC_BASE_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx drizzle-kit migrate        # db/migrations, drizzle.config.ts
      - run: npm run test:int

  e2e:
    runs-on: ubuntu-latest
    needs: [validate, integration]
    services: { mysql: { /* same as above */ } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx drizzle-kit migrate && npm run db:seed
      - run: npm run build
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }

  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm audit --audit-level=high
    continue-on-error: true    # blocking from Gate C
```

Ordering note: `lint` moves **before** `test` so a syntax error fails in ~20 s instead of after the suite.

**Required status checks on `main`:** `validate`, `integration`, `e2e`. `audit` advisory until Gate C.

**Flake policy.**

1. Zero retries in `validate` and `integration`. Playwright: `retries: 1` in CI only, and any test that passes on retry is auto-reported.
2. A test that flakes twice in 14 days is quarantined (`test.fixme`) with an issue linked in the skip reason, and must be fixed or deleted within 10 working days. Quarantine capacity is capped at 5 tests; exceeding it blocks feature merges.
3. Never fix a flake with a bare `sleep`. Realtime tests wait on events with a deadline; DB tests wait on state, not time.
4. Every realtime "must NOT receive" assertion uses an explicit quiet window (500 ms) plus a positive control in the same test (some other event *was* received), so a broken harness cannot pass vacuously.
5. Timeouts: 5 s per unit test, 15 s per integration test, 30 s per E2E test; a timeout is a failure, never a retry trigger in `validate`.

---

## 9. Exit criteria per task

Task ids below are [BUILD_PLAN.md](BUILD_PLAN.md)'s, which is canonical. Where one row of this table spans more than one BUILD_PLAN task, every id is listed.

| Task | Definition used here | Exit criteria |
|---|---|---|
| **S-0** ✅ | Toolchain / CI repair | TC-REG-01…04 green from a clean clone; `package-lock.json`, `index.html`, `Dockerfile`, `docker-compose.yml`, `drizzle.config.ts` and the baseline migration are **tracked in git**; `npm ci && npm run validate` exits 0; `vitest` resolves via `package.json:92` (`^3.0.0`, lockfile-pinned to 3.2.7) and aliases via `vitest.config.ts:9-13` |
| **S-2** ✅ | Dev server binds `API_PORT` | TC-REG-05…09 green; `npm run dev` serves the client on 3000 and answers `/api/trpc/ping` proxied to 3001; no `ECONNREFUSED` in the dev log |
| **S-3** | Data integrity migration | TC-DATA-01…10 green; TC-MSG-19 and TC-CONT-18 flip from red to green; `drizzle-kit generate` reports no pending diff; P2 load profile re-run shows the query-plan improvement |
| **S-4** | OAuth correctness + `state`/PKCE | TC-AUTH-19…33 green; TC-E2E-01/02 green; `.env.example` values produce a working sign-in on a fresh checkout; no `/oauth/authorize/oauth/authorize` anywhere |
| **S-8** + **S-14** | Socket payload validation + central authz | TC-SOCK-18…22 green; TC-AUTHZ-08 and TC-SOCK-12 green; every socket event schema lives in `contracts/` and is imported by both `api/socket.ts` and `src/hooks/useSocket.ts`; coverage of `api/socket.ts` ≥ 85% |
| **S-5** | Raw-SQL removal + error hygiene | TC-MSG-14/15/17 green; TC-AUTHZ-06 green; TC-REG-11 green; zero interpolated `` sql` `` templates outside the allow-list |
| **S-13**-adjacent (hardening; no dedicated BUILD_PLAN task yet — carried in BACKLOG) | Session, cookie and header hardening | TC-AUTH-17/18 green; TC-REG-14/15 green; production responses carry the full header set; `Secure` + `__Host-` cookie in production; dead duplicates at `api/kimi/session.ts:40-51` and `api/lib/cookies.ts` deleted |
| **S-15** | Observability + DB hardening | Structured logs with a redaction test (a session cookie fed through the logger emits `[redacted]`); `closeDb()` exported and used by the integration teardown; DB TLS and pool caps configured |
| **S-9** | Membership & participant validation | TC-CONV-11/12/13 and TC-MSG-12 green |
| **S-10a** | Contact/search hardening | TC-CONT-12/17 and TC-AUTHZ-10 green; `email` absent from `searchUsers` output |
| **S-13** | Rate limiting & abuse controls | TC-SOCK-23/24 green; every surface in `SECURITY.md` §8 has a test asserting its limit and its `429`/`rateLimited` behaviour |
| **S-10b** | Presence scoping & fan-out | TC-SOCK-13…17 green; TC-NFR-01 soak clean; TC-NFR-02 documented or resolved with a Redis adapter |
| **F-4** | Attachments | Upload/download tests covering MIME allow-list, magic-byte mismatch, size cap, filename sanitisation, presign TTL and cross-conversation download denial; SVG rejected or sanitised |
