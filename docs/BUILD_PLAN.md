# Alice Chains — Build Plan

**Version:** 1.0 · **Date:** 2026-08-12 · **Audience:** Claude Code (primary), human reviewers (secondary)
**Baseline:** `main` @ `3999bca` + the stabilization commit described in [Wave 0](#wave-0--build-restoration-done).

This is the execution plan. [SRS.md](SRS.md) says *what* the product must do; [TECH_SPEC.md](TECH_SPEC.md) says *how* it is designed; this document says *in what order to build it and how to know each step is finished*.

---

## 1. How to use this plan

Work **one task at a time, in wave order**. Do not start a task whose dependencies are unmet. Each task card is self-contained: it names the files to touch, the requirement IDs it satisfies, the exact acceptance criteria, and the command that proves it.

**Ground rules — these are not negotiable:**

| # | Rule |
|---|---|
| G-1 | `npm ci && npm run validate` (typecheck → test → lint → build) MUST pass before any task is marked done. A task that leaves the gate red is not done. |
| G-2 | One task = one commit = one PR, titled `<TASK-ID>: <summary>`. Never bundle unrelated tasks. |
| G-3 | Every behavioural change ships with a test that fails before the change and passes after. See [TEST_PLAN.md](TEST_PLAN.md) for the case catalogue and IDs. |
| G-4 | Never widen scope inside a task. If you discover new work, add it to [BACKLOG.md](../BACKLOG.md) and carry on. |
| G-5 | Schema changes are forward-only migrations via `npm run db:generate`. `db:push` is scratch-development only ([ADR-005](ADR.md#adr-005--drizzle-migrations-are-canonical-dbpush-is-scratch-only)). |
| G-6 | Do not introduce Supabase, Postgres, Redis, or any new infrastructure dependency without the ADR that authorises it. MySQL is the decision of record ([ADR-001](ADR.md#adr-001--keep-mysql-8-for-this-release-supabasepostgres-is-a-gated-future-migration)). |
| G-7 | Secrets never carry a `VITE_` prefix — Vite inlines those into the public bundle. |
| G-8 | If a spec and the code disagree, the spec wins *unless* the code is demonstrably correct; in that case fix the spec in the same PR and note it. |

**Definition of done for a task:** acceptance criteria met · tests added and green · `npm run validate` green · CI green on the PR · docs touched if behaviour changed.

---

## 2. Environment setup (do this once)

```bash
git clone https://github.com/Mangu-Platforms/alice_chains.git && cd alice_chains
cp .env.example .env          # then fill in the OAuth values
npm ci                        # lockfile is committed; do not use `npm install`
docker compose up -d db       # MySQL 8.4 on :3306
npm run db:migrate            # apply the baseline migration
npm run dev                   # client :3000, API :3001
```

`npm run dev` is expected to work. If the API does not answer on `:3001`, that is a regression of [S-2](#s-2) — fix it before anything else.

**Blocked-dependency policy.** Supabase Pro is **not** provisioned and nothing in this plan requires it. Object storage (F-4) and web push (F-6) need credentials; both are late in the order and each names a local substitute (MinIO, self-signed VAPID keys) so work never stalls waiting on an account.

---

## 3. Wave overview

| Wave | Theme | Tasks | Gate to exit the wave |
|---|---|---|---|
| **0** | Build restoration | S-0 (done) | `npm ci && npm run validate` green from a clean clone |
| **1** | Correctness & security P0 | S-8, S-9, S-10, S-4, S-5, S-17 | No unauthenticated or unauthorised data path remains, and no session credential outlives its logout |
| **2** | Data integrity | S-3, S-11 | Constraints enforced in the database, not in `try/catch` |
| **3** | Trustworthy tests | S-7, S-12 | ≥ 25 meaningful assertions; CI runs integration tests |
| **4** | Phase 2 features | F-1 … F-6, F-7, F-8 | The PRD Phase 2 matrix is complete, groups are administrable and blocking is enforced |
| **5** | Hardening & scale | S-6, S-13, S-14, S-15, S-16, S-18, S-19, S-20, H-1…H-5 | Deployable, observable, administrable, accessible, horizontally scalable |

Waves 1 and 2 are strictly ordered. Within wave 4, tasks are independent unless a dependency is stated.

---

## Wave 0 — Build restoration (DONE)

### S-0 · Make the repository build from a clean clone ✅

The repository could not build at all. Five independent defects, all fixed and verified in this commit:

| Defect | Evidence | Fix |
|---|---|---|
| `index.html` never committed — Vite has no entry module | `git log --all -- index.html` empty; `vite build` → `Could not resolve entry module "index.html"` | Added `index.html` with `#root` + `/src/main.tsx` |
| `vitest` missing from `devDependencies` while `npm test` runs `vitest run` | `sh: 1: vitest: not found`; `tsc` → `TS2307 Cannot find module 'vitest'` | Added `vitest@^3` |
| `@eslint/js` imported by `eslint.config.js`, never declared | resolved only transitively | Added `@eslint/js@^9` |
| `tailwindcss-animate` required by `tailwind.config.js`, never declared | absent from `node_modules` | Added `tailwindcss-animate@^1.0.7`, converted `require()` → ESM import |
| No `drizzle.config.ts` — every `db:*` script fails | `drizzle-kit` has no config to read | Added `drizzle.config.ts`; generated baseline migration `0000_*.sql` |

Also fixed in the same commit: no lockfile (now committed, CI switched to `npm ci`); two `@typescript-eslint/no-empty-object-type` errors in `input.tsx`/`textarea.tsx`; `vitest.config.ts` missing the `@`/`@db`/`@contracts` aliases (tests could not resolve imports); `eslint.config.js` missing `ignores`, so lint failed with ~1900 errors whenever `dist/` existed; and **S-2** below.

**Verified:** `npm ci && npm run validate` passes from a clean checkout; `dist/public` and `dist/boot.js` are produced.

### S-2 · Dev server binds a port ✅

`api/boot.ts` created the HTTP server and called `initSocket` **only** inside `if (env.NODE_ENV === "production")`. In development Vite proxied `/api` and `/socket.io` to `localhost:3001` where nothing listened, so the app could not be run in dev mode at all.

The old code also hand-rolled `createServer()` and passed Node's `IncomingMessage` straight into `app.fetch()` as though it were a fetch `Request` — an invalid conversion that would misbehave on any request carrying a body.

**Fix:** always bind (except `NODE_ENV=test`), using `serve()` from `@hono/node-server`, which returns a real `http.Server` for Socket.IO to attach to. Dev binds `API_PORT` (3001), production binds `PORT` (3000) and additionally serves `dist/public`. Ports are now a contract in `contracts/constants.ts` (`CLIENT_PORT`, `API_PORT`, `DEFAULT_PROD_PORT`) and `API_PORT`/`PUBLIC_BASE_URL` were added to the Zod env schema.

**Verified:** `npx tsx api/boot.ts` with `NODE_ENV=development` logs `listening on http://localhost:3001/`; `GET /api/trpc/ping` → `200`; unknown `/api/*` → `404`.

---

## Wave 1 — Correctness & security P0

> Every task in this wave closes a path by which a user can read or write data they have no right to. Ship this wave before anything else.

<a id="s-8"></a>
### S-8 · Authorize `message.markAsRead` — **CRITICAL**

**Problem.** `api/message-router.ts:135-156` accepts an arbitrary `messageIds: number[]` from any authenticated caller and writes read receipts with **no authorization check whatsoever**. Any signed-in user can mark any message in the system as read, including messages in conversations they are not a member of. The socket variant (`api/socket.ts:161`) checks conversation membership but never verifies that the supplied message ids actually belong to that conversation.

**Do.**
1. In the tRPC procedure, resolve each message's `conversationId` and reject (`FORBIDDEN`) unless the caller is a participant of every one of them. Prefer a single join against `conversation_participants` over N queries.
2. In the socket handler, additionally assert `messages.conversationId = data.conversationId` for every id supplied.
3. Extract the membership assertion into one shared helper (e.g. `api/lib/authz.ts → assertParticipant(userId, conversationId)`) and use it from both paths.

**Satisfies:** FR-CONV-02, FR-MSG-05, NFR-SEC-05 · **Tests:** TC-AUTHZ-08, TC-MSG-18, TC-MSG-19, TC-SOCK-11, TC-SOCK-12
**Accept:** a non-participant calling `message.markAsRead` with a foreign message id receives `FORBIDDEN` and writes no row; a participant marking ids from a *different* conversation is rejected; existing happy-path receipts still work.

<a id="s-9"></a>
### S-9 · Validate participants on conversation creation, and enforce blocking

**Problem.** `api/conversation-router.ts:160-243`. `createDirect` and `createGroup` accept arbitrary user ids with no existence check, no contact check, and no block check. `participantIds` is uncapped. `contacts.status = 'blocked'` is stored but **enforced nowhere in the codebase**. Any user can therefore pull strangers — including users who have blocked them — into a group and message them.

**Do.**
1. Validate every supplied id exists in `users`; reject unknown ids with `BAD_REQUEST`.
2. Reject if any target has a `contacts` row blocking the caller. Define the block semantics in one predicate and reuse it.
3. Cap `participantIds` (recommend 256; put the constant in `contracts/constants.ts`) and reject self-referential direct conversations.
4. Fix the `createDirect` idempotency bug: the lookup takes the *first* shared conversation, so if that happens to be a group the `type='direct'` filter misses and a duplicate DM is created. Filter on `type='direct'` inside the query, not after it.

**Satisfies:** FR-CONV-01, FR-CONV-08, FR-CONV-09, FR-CONV-10, FR-CONV-11, FR-CONV-12, FR-CONT-12 · **Tests:** TC-CONV-01, TC-CONV-02, TC-CONV-11, TC-CONV-12, TC-CONV-13; TC-CONV-15 †, TC-CONV-16 †, TC-CONT-24 † to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5
**Accept:** creating a conversation with a non-existent id fails; a blocked user cannot be added; creating a direct conversation twice returns the same row even when a group is shared; group size cap enforced.

> **Ordering constraint:** this task MUST ship before or with [S-3](#s-3). Once foreign keys exist, an invalid id becomes a database error surfacing as a 500 instead of a clean 400.

<a id="s-10"></a>
### S-10 · Close the directory-enumeration and presence leaks

**Problem A.** `api/contact-router.ts:165-188` — `contact.searchUsers` accepts a 1-character query and returns `email` for every match. This is a full user-directory dump. The `LIKE` pattern is also unescaped (`%` and `_` are live wildcards) and unindexed with a leading wildcard.
**Problem B.** `api/socket.ts:52,54,206` — `userOnline`/`userOffline` are `socket.broadcast.emit` to *every* connected socket, and each new socket receives the complete online-user list. Every user learns every other user's presence regardless of any relationship.

**Do.**
1. Require a minimum query length (recommend 3), escape `%`/`_`, and remove `email` from the result shape — return id, name, avatar only. Rate-limit the endpoint.
2. Scope presence to the caller's contacts and co-participants: emit to `user_{id}` rooms of related users rather than broadcasting, and filter the initial `onlineUsers` snapshot to that same set.

**Satisfies:** FR-CONT-05, FR-CONT-06, FR-CONT-07, FR-CONT-08, FR-PRES-04, FR-PRES-05, NFR-SEC-10 · **Tests:** TC-AUTHZ-10, TC-CONT-13, TC-CONT-14, TC-CONT-15, TC-CONT-16, TC-CONT-17, TC-SOCK-17; TC-CONT-20 † to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5
**Accept:** a 1–2 char search is rejected; no response contains another user's email; a user with no relationship to X receives no presence event for X.

<a id="s-4"></a>
### S-4 · OAuth coherence, `state`, PKCE, and the redirect_uri mismatch

**Problem.** Three distinct defects:
1. **Base URL incoherence.** `.env.example` shipped `VITE_KIMI_AUTH_URL=https://example.com/oauth/authorize` (a full authorize URL as the *base*), while `src/pages/Login.tsx:7` builds `${authUrl}/oauth/authorize` and `api/kimi/auth.ts:36,60` exchange at `${VITE_KIMI_AUTH_URL}/api/oauth/token` and `/api/oauth/userinfo`. With the shipped sample the authorize URL doubles. *(The sample is corrected in this commit; the single-source-of-truth refactor is still owed.)*
2. **redirect_uri mismatch.** The client sends `window.location.origin` (`:3000` in dev, `src/pages/Login.tsx:6`); the server exchanges using the inbound `url.origin` (`api/kimi/auth.ts:47`), which is `:3001` behind the Vite proxy (`changeOrigin: true`). A conformant provider rejects the exchange. The same breaks behind any reverse proxy.
3. **No CSRF protection and no PKCE.**

**Do.**
1. Define the endpoint contract once in `contracts/oauth.ts`: one base origin → derived `authorizeUrl`, `tokenUrl`, `userinfoUrl`. Assert at startup that the base is a bare origin.
2. Use the new `PUBLIC_BASE_URL` for `redirect_uri` on **both** legs so they are byte-identical.
3. Add `state` (random, bound to an HttpOnly cookie, verified on callback) and PKCE S256.
4. Because the `code_verifier` must live in an HttpOnly cookie the client cannot set, build the authorize URL **server-side** behind a new `GET /api/oauth/login` that sets the cookies and 302s to the provider. `Login.tsx` links to that endpoint instead of constructing the URL. See TECH_SPEC §5.1/§8b.

**Satisfies:** FR-AUTH-06, FR-AUTH-07, FR-AUTH-08, FR-AUTH-09, FR-SESS-02, NFR-SEC-01 · **Tests:** TC-AUTH-17, TC-AUTH-21, TC-AUTH-27, TC-AUTH-28, TC-AUTH-29, TC-AUTH-30, TC-AUTH-31, TC-AUTH-32, TC-AUTH-33, TC-E2E-02
**Accept:** full sign-in round trip against the real provider (or a mocked fetch in tests); callback rejects missing/mismatched `state`; both legs send an identical `redirect_uri`; no client code constructs provider URLs.

<a id="s-5"></a>
### S-5 · Fix read receipts (`IN (?)`) and message-router query hygiene

**Problem.** `api/message-router.ts:68` builds `IN (${messageIds.join(",")})` inside a `sql` template. Drizzle binds the *joined string* as one parameter, producing `IN (?)` with the value `"11,12,13"`; MySQL coerces that to `11`. **Read receipts are therefore returned for only the first message on every page** — a silent correctness bug, not merely a style issue. (It is not SQL-injectable: the values are server-derived and correctly parameterised.)

**Do.** Replace with Drizzle's `inArray(messageReads.messageId, messageIds)`. Batch `markAsRead` inserts into a single multi-row insert. Add a lint-enforced rule banning interpolated arrays inside `sql` templates.

**Satisfies:** FR-MSG-04, NFR-SEC-02 · **Tests:** TC-MSG-14, TC-MSG-15, TC-MSG-16, TC-REG-11
**Accept:** a page of N messages returns `readBy` for all N; empty `messageIds` is a no-op; no interpolated-array `sql` template remains.

<a id="s-17"></a>
### S-17 · Session lifecycle hardening

**Problem.** The session cookie is a hand-written header string with no `Secure` attribute (`api/kimi/auth.ts:102`), so the bearer credential is transmissible over cleartext HTTP in production. The token is a self-contained HMAC with no server-side record, so `GET /api/logout` (`api/boot.ts:19-22`) clears only the caller's own cookie — a copied cookie stays valid for the full 7 days on every other device. There is no idle expiry and no payload version, so a leaked secret cannot be invalidated without waiting out the absolute maximum (`api/kimi/session.ts:36`). `getSessionCookieOptions` is defined twice, identically (`api/kimi/session.ts:40-51` and `api/lib/cookies.ts:4-15`), and **neither is ever called**. Worst of all, `api/lib/env.ts:7-8` accepts `z.string().min(1)` for `JWT_SECRET` and `APP_SECRET`: a one-character HMAC key starts the server and every session in the deployment is forgeable.

**Do.**
1. Raise both secrets to `z.string().min(32)` in `api/lib/env.ts` and refuse to start below that; document the generation command in `.env.example`. Add the build-time guard that fails if any key matching `/SECRET|TOKEN|KEY|PASSWORD/i` carries a `VITE_` prefix, so a secret can never reach the client bundle (`SEC-C-24`).
2. Emit the cookie through **one** helper. Delete the duplicate `getSessionCookieOptions` and the dead `api/lib/http.ts`, set `Secure` whenever `NODE_ENV=production`, and use the `__Host-` name prefix in production (`SEC-C-07`, `SEC-C-08`).
3. Add a server-side session record keyed by a random session id, rotate that id on every sign-in, and make logout delete it so every device is invalidated within 60 s (`SEC-C-05`).
4. Add a 24-hour idle expiry alongside the 7-day absolute maximum, and a version field in the payload that the server rejects below a configured minimum (`SEC-C-06`).
5. Re-validate an established Socket.IO connection against session validity at least every 5 minutes and disconnect it on expiry (`SEC-C-29`).

**Satisfies:** FR-AUTH-12, FR-SESS-03, FR-SESS-06, FR-SESS-07, FR-SESS-08, FR-SESS-09, FR-SESS-10, NFR-SEC-04, NFR-SEC-08 · **Tests:** TC-AUTH-17, TC-AUTH-18, TC-AUTH-34, TC-REG-12, TC-REG-13, TC-SOCK-24; TC-AUTH-35 †, TC-AUTH-36 †, TC-AUTH-37 †, TC-REG-19 † to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5
**Accept:** the process refuses to start with a secret under 32 bytes; no `VITE_`-prefixed variable matches a secret name and no secret string appears in `dist/public/assets/*.js`; in production the `Set-Cookie` header carries `Secure`, `HttpOnly`, `SameSite=Lax` and the `__Host-` prefix; a cookie captured before logout is rejected afterwards on every device; an idle session expires at 24 h and an absolute one at 7 days; exactly one cookie-handling implementation remains in the tree; a socket whose session is expired server-side is disconnected within 5 minutes.

> **Ordering constraint:** S-17 and [S-4](#s-4) both touch the cookie. S-4 owns FR-SESS-02 (the `Secure` flag on the callback's `Set-Cookie`); S-17 owns the rest of the cookie contract. Ship S-4 first, or ship both in one PR — never S-17's step 2 before S-4.

---

## Wave 2 — Data integrity

<a id="s-3"></a>
### S-3 · Foreign keys, unique constraints, and indexes

**Problem.** The generated baseline confirms **0 foreign keys and 0 indexes across all 6 tables**. Integrity is currently "enforced" by `try/catch` blocks that swallow duplicate-key errors which can never fire, because there is no unique key to violate. `contact.add` (`api/contact-router.ts:74-89`) has a TOCTOU race that creates duplicate rows.

**Do.** Follow [DATA_MODEL.md §3–§4](DATA_MODEL.md) exactly. It specifies 10 FKs, 3 unique constraints, and 6 indexes, each with `ON DELETE` justification and the drop-in Drizzle definition, plus a four-step migration runbook: probe → dedupe (`ROW_NUMBER()`, including the contacts status-precedence collapse) → orphan cleanup → DDL.

Then replace the exception-driven control flow in `markAsRead` (router **and** socket) with `onDuplicateKeyUpdate` semantics now backed by a real unique key.

**Satisfies:** FR-CONT-02, FR-CONT-04, NFR-PERF-01, NFR-OPS-05, NFR-REL-01 · **Tests:** TC-DATA-01…TC-DATA-10, TC-CONT-11, TC-CONT-18, TC-MSG-19
**Accept:** a fresh MySQL + `npm run db:migrate` produces the full schema; duplicate participant/read-receipt/contact inserts are rejected or no-ops without exceptions; `EXPLAIN` on message history uses the `(conversationId, createdAt)` index; concurrent `contact.add` cannot duplicate.

<a id="s-11"></a>
### S-11 · Make `conversations.updatedAt` real, and add unread counts

**Problem.** `conversation.list` orders by `conversations.updatedAt` (`api/conversation-router.ts:38`), but **nothing in the codebase ever writes that column** — a grep for `update(conversations` returns nothing. The sidebar is therefore permanently sorted by creation time, not recency. Separately, `conversation_participants.lastReadAt` is written but never read, so unread counts do not exist.

**Do.** Touch `conversations.updatedAt` on every message insert (same transaction as the message write, on both the tRPC and socket paths). Then compute `unreadCount` in `conversation.list` from messages newer than the participant's `lastReadAt`, excluding the caller's own.

**Satisfies:** FR-CONV-05, FR-CONV-07, FR-MSG-08, FR-MSG-09 · **Tests:** TC-CONV-04, TC-CONV-05, TC-E2E-07; TC-CONV-14 †, TC-MSG-23 †, TC-MSG-32 † to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5
**Accept:** sending a message moves that conversation to the top of the sender's *and* recipient's list; `unreadCount` is correct and served by the S-3 index. This unblocks [F-1](#f-1).

---

## Wave 3 — Trustworthy tests

<a id="s-7"></a>
### S-7 · Integration and socket test harness

One test file exists today. Build the harness described in [TEST_PLAN.md §3–§5](TEST_PLAN.md): a MySQL 8 service container, per-test truncation or transaction rollback, fixture factories, router integration tests through the Hono app, and `socket.io-client` tests for the realtime paths.

**Accept:** ≥ 25 meaningful assertions across routers and sockets; unauthenticated handshake rejected; non-participant `joinConversation` is a no-op; a message broadcast reaches a second client; presence goes offline only after the **last** socket for a user disconnects; green on 3 consecutive CI runs.

<a id="s-12"></a>
### S-12 · CI: integration services and required checks

Add the MySQL service container to `.github/workflows/ci.yml`, run migrations before the integration suite, publish coverage, and mark `validate` a required check on `main`.

**Accept:** CI green on `main`; a PR that breaks any gate cannot merge.

---

## Wave 4 — Phase 2 features

Each is specified in [SRS.md](SRS.md) and [PRD.md](PRD.md); schema additions are pre-designed in [DATA_MODEL.md §5](DATA_MODEL.md).

<a id="f-1"></a>
| ID | Feature | Depends on | Accept |
|---|---|---|---|
| **F-1** | Unread message badges | S-3, S-11 | Two-browser test shows live increment and clear on open; count query hits the index |
| **F-2** | Message editing & soft deletion | S-3 | `messageUpdated`/`messageDeleted` reach both clients live; deleted content absent from API responses; owner-only |
| **F-3** | Emoji reactions | S-3 | Toggle semantics (re-tapping removes), counts group correctly, live across clients |
| **F-4** | File & image attachments | S-3, S-6 | Presigned upload → render round trip for image and PDF; oversize and forbidden MIME rejected server-side; works against MinIO locally |
| **F-5** | Reply threading UI | S-3 | Reply chains survive reload; quoted snippet returned by the server join; no N+1 on history |
| **F-6** | Web push notifications | S-3 | Closed-tab browser receives a notification deep-linking to the conversation; expired subscriptions pruned on 404/410 |

**F-4 and F-6 carry external dependencies.** Use MinIO in `docker-compose.yml` for F-4 and locally generated VAPID keys for F-6 so neither blocks on account provisioning.

<a id="f-7"></a>
### F-7 · Group management

**Problem.** A group can be created and then never administered. `conversation.createGroup` writes `name` and the participant rows once (`api/conversation-router.ts:219-243`) and **no procedure exists** to rename a group, change its avatar, add or remove a participant, or leave it. `conversations.createdBy` is written but never read, so there is no owner check and no way to transfer ownership — which `DATA_MODEL.md` FK-10 (`ON DELETE RESTRICT`) exists precisely to force before an account can be deleted.

**Do.**
1. Add `conversation.rename`, `conversation.setAvatar`, `conversation.addParticipants`, `conversation.removeParticipant`, `conversation.leave` and `conversation.transferOwnership`, every one of them authorized through the shared `assertParticipant` helper introduced by [S-8](#s-8), and the four mutating ones additionally gated on `createdBy`.
2. Re-use the [S-9](#s-9) validation predicate for added participants — existence, block check, 256 cap. Do not re-implement it.
3. Emit `conversationUpdated` to every participant room on each change, so open clients converge without a refetch.
4. On leave, delete the participant row, stop the fan-out to that member and drop the conversation from their `conversation.list`.

**Satisfies:** FR-CONV-13, FR-CONV-14 · **Tests:** TC-CONV-17 †, TC-CONV-18 † to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5
**Accept:** a non-creator cannot rename, add or remove; a member who leaves stops receiving the conversation's messages and no longer sees it listed; ownership transfer moves `createdBy` and lets the previous owner's account be deleted; every mutation reaches a second open client live. **Depends on** S-3, S-8, S-9.

> FR-CONV-01 (`createDirect` idempotency) and FR-CONV-10 (the 256-participant cap) are **not** owned here. Both are creation-time invariants delivered by [S-9](#s-9) steps 3 and 4 in Wave 1; this card consumes them.

<a id="f-8"></a>
### F-8 · Blocking semantics end to end

**Problem.** `contacts.status = 'blocked'` is a valid enum value (`db/schema.ts:96`) that is **enforced nowhere**: the only readers of `contacts.status` filter for `'accepted'` (`api/contact-router.ts:29`) or `'pending'` (`:56`). A member who has been blocked can still be pulled into a conversation, can still send messages into a shared one, still appears in the blocker's search results, and still sees the blocker's presence. There is also no way to unblock — the status can be written but never reversed.

**Do.**
1. Define one `isBlockedBetween(a, b)` predicate in `api/lib/authz.ts` — the same predicate [S-9](#s-9) introduces for conversation creation — and call it from message send (socket **and** tRPC), conversation creation, `contact.add`, `contact.searchUsers` and the presence fan-out. One definition, five call sites.
2. Add `contact.block` and `contact.unblock` procedures that update both directions symmetrically; unblocking restores `accepted` or deletes the pair outright.
3. Exclude blocked pairs from `contact.list` and from search results in both directions.
4. Suppress `userOnline`, `userOffline` and `typing` between blocked pairs.

**Satisfies:** FR-CONT-04, FR-CONT-09, FR-CONT-10, FR-CONT-11, FR-MSG-19 · **Tests:** TC-CONT-11, TC-CONT-12; TC-CONT-19 †, TC-CONT-22 †, TC-CONT-23 †, TC-MSG-31 † to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5
**Accept:** blocking is symmetric and immediate on all five surfaces; a blocked member's `message.send` into a shared conversation is refused on both ingress paths; neither party sees the other in search, in `contact.list` or in presence; unblocking restores the previous state. **Depends on** S-3, S-9, S-10.

> The search-side hardening on the same endpoint — FR-CONT-06 (minimum query length), FR-CONT-07 (no e-mail in results) and FR-CONT-08 (LIKE escaping) — ships earlier with [S-10](#s-10). This card adds only the blocked-pair filter to it.

---

## Wave 5 — Hardening & scale

| ID | Task | Accept |
|---|---|---|
| **S-6** | Docker stack ✅ *(Dockerfile + compose added; needs a live `docker compose up` verification run)* | Clean checkout → `docker compose up` serves the app on `:3000` with migrations applied; image < 400 MB |
| **S-13** | Rate limiting per [SECURITY.md §8](SECURITY.md) — token bucket on login/callback, message send (socket **and** tRPC), contact requests, search, upload; plus the HTTP body limit 50 MB → 256 KB (`SEC-C-20`) and socket frame/flood caps (`SEC-C-14`) | Limits enforced and observable; abusive clients receive a documented error, not a crash |
| **S-14** | Runtime validation of socket payloads with shared Zod schemas in `contracts/`; enforce the 4000-char cap on the socket path (today it exists only on the unused tRPC path) | Malformed payloads rejected without disconnecting the socket; caps identical on both paths |
| **S-15** | Observability per [TECH_SPEC.md §10](TECH_SPEC.md): structured logs with redaction, `/healthz` + `/readyz` (the health check must touch the database, not just the process), RED metrics; plus the transport hardening that mounts in the same bootstrap — `secureHeaders()` for CSP/HSTS/`X-Content-Type-Options`/`Referrer-Policy`/`X-Frame-Options` and an explicit CORS + Socket.IO origin allowlist ([SECURITY.md §7](SECURITY.md), `SEC-C-17`/`SEC-C-18`/`SEC-C-22`) | Dashboards show request and socket rates, errors, durations; no secret or message content in logs |
| **S-16** | Client code-splitting to meet the SRS bundle budget; add a CI size gate | Gate fails a PR that regresses bundle size |
| **H-1…H-5** | Hygiene: archive the 11.5 MB `alice.pdf`; delete duplicated `getSessionCookieOptions` and dead `api/lib/http.ts`; give `.prettierignore` real contents; reconcile "JWT" wording; remove orphan `tsconfig.app.json`/`tsconfig.server.json`; drop stale `copilot/*` branches | Each ≤ 30 min, no behaviour change |

**Requirement ownership for the five table cards above.** Stated explicitly rather than by wildcard, so the traceability matrix can join on it ([TRACEABILITY.md](TRACEABILITY.md) rule M-3):

| Task | Satisfies | Tests |
|---|---|---|
| **S-6** | NFR-OPS-07 | TC-REG-18 † to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5 |
| **S-13** | NFR-SEC-07, NFR-SEC-11 | TC-SOCK-23, TC-REG-14 |
| **S-14** | FR-MSG-01, NFR-SEC-03 | TC-MSG-06…TC-MSG-09, TC-MSG-13, TC-SOCK-18, TC-SOCK-19, TC-SOCK-20, TC-SOCK-21, TC-SOCK-22 |
| **S-15** | FR-ADMIN-11, NFR-OPS-03, NFR-SEC-06 | TC-REG-15; TC-REG-17 †, TC-REG-20 † to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5 |
| **S-16** | NFR-PERF-06 | to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5 |
| **H-1…H-5** | NFR-OPS-08 | to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5 (H-2's duplicate-cookie-helper deletion is claimed by [S-17](#s-17) as FR-SESS-10) |

<a id="s-18"></a>
### S-18 · Owner/admin capability and data rights

**Problem.** `OWNER_UNION_ID` is parsed into the env schema (`api/lib/env.ts:11`) and exposed by `getOwnerUnionId()`, which has **zero call sites**; `users.role` exists in `db/schema.ts` and is never written or read. There is therefore no administrator, no administrative procedure and no audit record anywhere in the product. `auth.me` returns the whole user row including `unionId` and `role` (`api/auth-router.ts:4`). No member can export or erase their own data, which is the baseline `PRD.md` claims for GDPR.

**Do.**
1. At provisioning time set `users.role='admin'` when `unionId === getOwnerUnionId()` and `'user'` otherwise; with `OWNER_UNION_ID` unset the deployment has no administrator and every administrative procedure returns `FORBIDDEN`.
2. Add an `adminQuery` tRPC procedure builder that throws `FORBIDDEN` unless `ctx.user.role === 'admin'`, and build every administrative procedure on it — never an inline check.
3. Administrative surface: list members (`id`, `name`, `email`, `createdAt`, `lastSignInAt`, `role`); deactivate a member, revoking their sessions through the [S-17](#s-17) session store within 60 s and refusing new sign-ins.
4. Write every administrative action to an append-only audit record: actor, action, target, outcome, UTC timestamp.
5. Data rights: an asynchronous JSON export of a member's own data; erasure that marks the account deleted, revokes sessions immediately and purges after a 30-day grace period; conversation deletion that cascades cleanly through the [S-3](#s-3) foreign keys.
6. Narrow `auth.me` to `{id, name, email, avatar, status}`.

**Satisfies:** FR-ADMIN-01, FR-ADMIN-02, FR-ADMIN-03, FR-ADMIN-04, FR-ADMIN-05, FR-ADMIN-06, FR-ADMIN-07, FR-ADMIN-08, FR-ADMIN-09, FR-ADMIN-10, NFR-SEC-10 · **Tests:** TC-AUTH-15; TC-ADMIN-01…TC-ADMIN-10 † to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5
**Accept:** the owner named by `OWNER_UNION_ID` is the only `admin`; with the variable unset every administrative procedure is `FORBIDDEN`; a deactivated member cannot sign in and their live sockets drop within 60 s; every administrative call produces exactly one audit row; an export contains the member's messages, contacts and memberships and nothing belonging to anyone else; an erasure leaves no orphan rows; `auth.me` no longer returns `unionId` or `role`. **Depends on** S-3, S-17.

> FR-ADMIN-11 (the health endpoint) is **not** owned here — it ships with [S-15](#s-15), which adds `/healthz` and `/readyz`.

<a id="s-19"></a>
### S-19 · Horizontal scale readiness

**Problem.** Presence is an in-process `Map<userId, Set<socketId>>` (`api/socket.ts:11`) and Socket.IO runs with the default in-memory adapter (`api/socket.ts:22-28`). On two API nodes behind a load balancer, a member connected to node A never receives a fan-out that originates on node B, and presence is per-node — a member with one device on each node produces a **false `userOffline`** when either tab closes (`TECH_SPEC.md` §3.4, failure mode P-4). NFR-SCALE-01 is a P0 that is Defective today, `TEST_PLAN.md` names the two-node case as TC-NFR-02, and no task schedules it. The MySQL pool is also uncapped (`api/queries/connection.ts:6`).

**Do.**
1. Add `@socket.io/redis-adapter` behind a `REDIS_URL` env var per [TECH_SPEC.md §3.4](TECH_SPEC.md). Unset keeps today's single-node behaviour byte for byte.
2. Move presence to Redis per [TECH_SPEC.md §3.5](TECH_SPEC.md) — one key per member holding the socket-id set, TTL-refreshed — so `getOnlineUsers()` is cluster-wide.
3. Cap the connection pool explicitly at 20 connections per process and connect over TLS (`SEC-C-28`).
4. Prove it: a two-node compose profile in which a message sent through node A reaches a subscriber on node B, and both nodes agree on presence.

**Satisfies:** FR-PRES-08, NFR-SCALE-01, NFR-SCALE-04, NFR-SEC-09 · **Tests:** TC-NFR-02; TC-DATA-11 † to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5
**Accept:** with `REDIS_URL` unset the single-node behaviour is unchanged; with it set, two nodes deliver messages and presence correctly, and a member with one device per node is never reported offline while either is open; the pool is capped at 20 and the connection is TLS.

> **Do not build this before the trigger fires.** [ADR-006](ADR.md#adr-006--single-process-deployment-now-redis-adapter-when-horizontal-scaling-is-needed) makes the Redis adapter conditional on `socket_connections_active` sustaining **> 6 000 per node for 15 consecutive minutes on 3 separate days within 14 days** (60 % of the NFR-SCALE-02 per-node target of 10 000), or on any one secondary trigger — CPU > 75 % of one core, RSS > 2 GB, > 400 msg/s sustained, or delivery p95 > 250 ms attributable to CPU. Build the seam (step 1's env gate) whenever convenient; adopt the adapter, Redis-backed presence and sticky sessions **together** only when the trigger has fired. Partial adoption is worse than none: the adapter alone fixes fan-out and leaves presence actively wrong.

<a id="s-20"></a>
### S-20 · Accessibility and internationalisation baseline

**Problem.** No accessibility work has been done and none is scheduled. NFR-A11Y-05 is already Defective — icon-only buttons ship with no accessible name — NFR-A11Y-02 is Partial, and NFR-A11Y-01/03/04/06 are unverified or missing outright. Separately, every user-visible string is inlined in JSX, so the product cannot be translated at all, and timestamps are rendered with the browser default rather than the viewer's locale (NFR-I18N-02, Defective).

**Do.**
1. Run axe-core over `/` and `/contacts` in CI and fail the build on any serious or critical finding; fix what it reports, to WCAG 2.2 Level AA.
2. Give every icon-only button and every non-decorative image an accessible name.
3. Make the conversation list and the composer fully keyboard-operable with a visible focus indicator at ≥ 3:1, and manage focus explicitly when the chat list changes selection, when a conversation opens and when a dialog closes.
4. Announce incoming messages through an `aria-live="polite"` region, and honour `prefers-reduced-motion` by disabling the typing-indicator bounce and the transition animations.
5. i18n scaffolding: a message catalogue, a lint rule forbidding string literals in JSX text position, `Intl.DateTimeFormat` for every timestamp, logical CSS properties plus bidirectional isolation so an RTL locale does not break the layout, and the MySQL session timezone pinned to UTC so stored and transmitted timestamps are unambiguous.

**Satisfies:** NFR-A11Y-01, NFR-A11Y-02, NFR-A11Y-03, NFR-A11Y-04, NFR-A11Y-05, NFR-A11Y-06, NFR-I18N-01, NFR-I18N-02, NFR-I18N-03, NFR-I18N-04 · **Tests:** to be written — see [TEST_PLAN.md](TEST_PLAN.md) §5
**Accept:** axe-core reports zero serious/critical on both live routes and the gate is enforced in CI; every control is reachable and operable by keyboard with a visible focus ring; a screen reader announces an incoming message without the user leaving the composer; the token-pair contrast check passes at 4.5:1; no user-visible string remains inlined in a component; the same message renders correctly under `en-US`/`UTC` and `de-DE`/`Asia/Tokyo`; Arabic and Hebrew content renders without layout breakage at 768 px.

> The verification column for every NFR-A11Y and NFR-I18N requirement in [SRS.md](SRS.md) §5.7 and §5.9 names an **instrument** — axe-core, a contrast checker, VoiceOver/NVDA, an emulated media query, an RTL render — not a `TC-*` case. Allocate a `TC-NFR-*` id per instrument when the harness lands so the matrix can close.

---

## 4. Sequencing

```
Week 1   S-8 · S-9 · S-10        authorization holes closed
Week 2   S-4 · S-17 · S-5        auth hardened, sessions revocable, read receipts correct
Week 3   S-3 · S-11              integrity in the database; recency + unread
Week 4   S-7 · S-12              tests worth trusting, enforced in CI
Week 5   F-1 · F-2 · F-3         the visible Phase 2 wins
Week 6   F-5 · F-8 · S-13 · S-14 threading, blocking enforced, rate limits, payload validation
Week 7   F-4 · F-6 · F-7         attachments, push, group management
Week 8+  S-6 · S-15 · S-18 · S-20 · S-16 · H-*   deployable, observable, administrable, accessible
Deferred S-19                    horizontal scale — build only when the ADR-006 trigger fires
```

Waves 1–3 are the critical path to "complete, buildable, usable". Wave 4 is the product promise. Wave 5 is what makes it operable by someone other than its author. S-17 sits in Wave 1 because a forgeable one-character HMAC key (`api/lib/env.ts:7-8`) is the single largest unauthenticated data path in the tree; S-19 is scheduled but gated on [ADR-006](ADR.md#adr-006--single-process-deployment-now-redis-adapter-when-horizontal-scaling-is-needed)'s trigger metric and must not be built speculatively.

## 5. Release definition of done

1. `npm ci && npm run validate` green from a clean clone, and CI green on `main`.
2. `docker compose up` yields a working instance with migrations applied.
3. Every P0 requirement in [SRS.md §10.4](SRS.md) is Implemented — no Defective, no Missing.
4. No unauthenticated or unauthorised data path remains (Wave 1 complete, verified by tests).
5. The [TEST_PLAN.md](TEST_PLAN.md) catalogue passes, including the two-browser E2E scenarios.
6. [TRACEABILITY.md](TRACEABILITY.md) shows every P0 requirement mapped to an owning task **and** a passing test, with no `†` (owed) and no `‡` (colliding) id left in the P0 rows of its §3 matrix or its §6 release gate. `SRS.md` §4–§5 remains the requirement spine; TRACEABILITY.md is the join across SRS.md, this document, TEST_PLAN.md, SECURITY.md and DATA_MODEL.md, and is maintained under its own rules M-1…M-6.
7. `SETUP.md` reproduces a working environment when followed literally by someone who has never seen the repo.

---

## Wave 6 — Product completeness (`P-*`)

Authored after Wave 4 closed, per the working agreement's rule that no work is
uncarded. Waves 1–5 make the app correct, integral, tested and operable; these
cards are what stand between that and an app a stranger would keep using.

<a id="p-search-1"></a>
### P-SEARCH-1 · In-conversation message search

**Problem.** The chat header carries a search icon that does nothing
(`src/pages/Chat.tsx`), and `conversation.list` filters only on the sidebar's
display names. There is no way to find a message.
**Do.** 1. Add a `message.search` procedure scoped to one conversation,
authorized through `assertParticipant`. 2. Use a MySQL `FULLTEXT` index on
`messages.content` where the collation allows, falling back to an indexed
prefix `LIKE` — no Meilisearch or Elasticsearch without an ADR ([ADR-006](ADR.md)).
3. Exclude soft-deleted messages. 4. Return enough context to render a result
row and jump to it.
**Satisfies:** NEW-FR-SEARCH-01 · **Tests:** TC-SEARCH-01…04
**Accept:** a member finds their own and others' messages in a conversation
they belong to, finds nothing in one they do not, and deleted messages never
appear. **Depends on:** S-3, F-2.

<a id="p-search-2"></a>
### P-SEARCH-2 · Global search

**Problem.** Search that stops at one conversation is not how anyone looks for
a message they half-remember.
**Do.** Extend to every conversation the caller belongs to, grouped by
conversation, with the same authorization boundary applied per row rather than
per request.
**Satisfies:** NEW-FR-SEARCH-02 · **Tests:** TC-SEARCH-05…07
**Accept:** results span conversations, never include one the caller is not in,
and are capped. **Depends on:** P-SEARCH-1.

<a id="p-prof-1"></a>
### P-PROF-1 · Profile and account settings

**Problem.** `users.name`, `users.avatar` and `users.status` are written once at
sign-in from the OAuth provider and can never be changed. "View Profile" was a
menu item that did nothing until F-8 removed it.
**Do.** 1. `user.updateProfile` for display name and status text.
2. Avatar upload through F-4's storage. 3. "Sign out everywhere", on
[S-17](#s-17)'s `revokeAllSessionsForUser`. 4. A settings page reachable from
the header.
**Satisfies:** NEW-FR-PROF-01…03 · **Tests:** TC-PROF-01…05
**Accept:** a changed name appears for other members without a reload; signing
out everywhere drops every other device's socket within the S-17 window.
**Depends on:** F-4, S-17.

<a id="p-prof-2"></a>
### P-PROF-2 · Remembered UI state

**Problem.** The sidebar's collapsed state resets on every navigation.
**Do.** Persist it to `localStorage` under one namespaced key. Do not introduce
a second theme system — the app is dark-only by design.
**Satisfies:** NEW-FR-PROF-04 · **Tests:** TC-PROF-06
**Accept:** the sidebar remembers its state across a reload, and a first-time
visitor gets the sensible default.

<a id="p-ux-1"></a>
### P-UX-1 · No control that lies

**Problem.** Several buttons still do nothing when pressed. Empty states are
missing or generic.
**Do.** Wire or remove every remaining stub. Give zero conversations, zero
contacts and zero search hits states that say what to do next.
**Satisfies:** NEW-FR-UX-01 · **Tests:** TC-UX-01…03
**Accept:** every visible control either acts or is absent.

<a id="p-ux-2"></a>
### P-UX-2 · Connection state and outbox

**Problem.** A send attempted while the socket is down is lost silently: the
composer clears and the message never arrives.
**Do.** A connection banner, and an in-memory outbox that replays on reconnect.
**Satisfies:** NEW-FR-UX-02 · **Tests:** TC-UX-04…06
**Accept:** a message composed while disconnected is delivered on reconnect,
exactly once, and the member is told what is happening meanwhile.

<a id="p-ux-3"></a>
### P-UX-3 · The composer

**Problem.** Enter-to-send exists; nothing else does. No character counter
against the 4000 cap, no emoji picker, no paste-to-attach.
**Do.** Shift+Enter for a newline, a counter that appears as the cap nears, an
emoji picker, and paste-image straight into F-4's upload path.
**Satisfies:** NEW-FR-UX-03 · **Tests:** TC-UX-07…09
**Accept:** each behaviour works with a keyboard alone. **Depends on:** F-4.

<a id="p-ux-4"></a>
### P-UX-4 · Thread search and media drawer

**Problem.** F-4 added `attachment.listForConversation` and nothing renders it.
**Do.** A drawer listing a conversation's images and files, and in-thread search
built on P-SEARCH-1.
**Satisfies:** NEW-FR-UX-04 · **Tests:** TC-UX-10
**Accept:** every attachment in a conversation is reachable without scrolling
the thread. **Depends on:** F-4, P-SEARCH-1.

<a id="p-link-1"></a>
### P-LINK-1 · Safe link rendering

**Problem.** A URL in a message renders as plain text.
**Do.** Detect URLs and render anchors with `rel="noopener noreferrer"` and
`target="_blank"`. No unfurling — that would make the server fetch arbitrary
URLs on a member's behalf, which is an SSRF surface, not a feature.
**Satisfies:** NEW-FR-LINK-01 · **Tests:** TC-LINK-01…03
**Accept:** links are clickable and carry the rel attributes; a `javascript:`
URL is never rendered as a link.

---

## Wave 7 — Operator tooling (`P-TOOL-*`)

The half of "complete" that is not the member-facing app. Ships with
[Wave 5](#wave-5--hardening--scale).

| ID | Task | Accept |
|---|---|---|
| **P-TOOL-1** | `scripts/dev.sh` — bring up the database, migrate, run dev | One command from a clean clone to a running app |
| **P-TOOL-2** | `scripts/reset-dev.sh` — wipe the local volume and re-migrate, documented as destructive and refusing to run against a non-local `DATABASE_URL` | Destroys only local data, and says so before it does |
| **P-TOOL-3** | `/healthz` liveness and `/readyz` that touches MySQL | A database outage shows as not-ready, not as healthy |
| **P-TOOL-4** | Structured logs with a request id; no bodies, no secrets | A request can be followed end to end; no message content in any log |
| **P-TOOL-5** | npm scripts for validate, dev, migrate, compose up/down | `npm run` lists everything an operator needs |
| **P-TOOL-6** | Follow SETUP.md as a stranger and fix whatever fails | A clean clone reaches a running app with no undocumented step |
| **P-TOOL-7** | `.env.example` complete, with the generate-secret one-liner | Every variable the code reads is documented |
| **P-TOOL-8** | CI required checks documented in the README | A contributor knows what must pass before review |
| **P-TOOL-9** | `npm run db:seed` — two demo users, a DM and a group, dev-only guarded | A new contributor sees a populated app without an OAuth provider |
| **P-TOOL-10** | CONTRIBUTING.md — one task, one PR, validate green | The working agreement is written down where contributors look |

> **S-19 remains gated.** The [ADR-006](ADR.md) trigger has not fired, and
> building a Redis adapter for a deployment that does not exist is speculative
> work with real maintenance cost.
