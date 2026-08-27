# Alice Chains — CURRENT STATUS

## Handoff 2026-08-27

**Waves 1–7 are complete.** Every task in [BACKLOG.md](BACKLOG.md) is `✅ Done` except three explicitly deferred items (S-12a, S-12b, S-20a — see below) and the gated S-19, plus the parked E2EE/MLS track. No unauthorized data path from the original audit remains open.

- **Gate:** `npm run validate` green, including with `TEST_DATABASE_URL` set (integration and socket suites run rather than skip). **525 tests** across 35 files.
- **PR history:** [PR #3](https://github.com/Mangu-Platforms/alice_chains/pull/3) ("Waves 1–5: authorization, integrity, tests, Phase 2 features, hardening") **merged** into `main` on 2026-08-25. Work continued on the same branch name after that merge (Wave 6/7 product-completeness and operator-tooling tasks, plus H-7/H-9); those commits were rebased onto the post-merge `main` and opened as a new draft, [PR #5](https://github.com/Mangu-Platforms/alice_chains/pull/5), since a merged PR cannot track further commits.
- **What's in PR #5:** P-TOOL-2/5 (guarded destructive reset + operator npm scripts), P-TOOL-10 (`CONTRIBUTING.md`), P-TOOL-6 (fixed a real defect: `docker compose up -d db` never provisioned `alice_chains_test`, so the documented test command failed on a genuinely clean checkout), H-9 (message-history pagination with scroll-position preservation), H-7 (`VITE_KIMI_AUTH_URL`/`VITE_APP_ID`/`JWT_SECRET` → `KIMI_AUTH_URL`/`KIMI_APP_ID`/`SESSION_SECRET` per ADR-002, dual-read with deprecation warning, `SESSION_SECRET_PREVIOUS` rotation support).
- **Remaining backlog, all intentionally not one-shot tasks:**
  - **S-12a** — publish coverage in CI; needs a lockfile change (`@vitest/coverage-v8`), left for maintainer approval rather than an unauthorized `npm install`.
  - **S-12b** — make `validate` a required GitHub branch-protection check; not a committable file change, a maintainer sets it in Settings → Branches.
  - **S-19** — Socket.IO Redis adapter for horizontal scale; gated behind the ADR-006 trigger metric, which has not fired.
  - **S-20a** — sweep remaining display strings in `Chat.tsx`/`Contacts.tsx` into the i18n catalogue; explicitly an incremental "as files are touched" practice, not a single diff.

**Local dev note:** this session runs MySQL 8.0.46 installed directly (no Docker daemon in the sandbox), databases `alice_chains` and `alice_chains_test`, user `alice`/`alice_pw`. A container restart stops that MySQL process; restart it with `sudo service mysql start` before running integration tests, and remember `db:migrate` only reads `DATABASE_URL` — point it at `TEST_DATABASE_URL`'s value to migrate the test database separately (see `.github/workflows/ci.yml` for the pattern CI uses).

---

**As of:** 2026-08-12 · **Repo:** `Mangu-Platforms/alice_chains` · **Priority:** P1 – ACTIVE
**Baseline:** `main` @ `3999bca` + the stabilization commit described below.

**Verdict in one line:** the repository **could not build from a clean clone** — `index.html` was never committed and three declared-but-missing dependencies broke the gate. That is now fixed and verified; what remains is a set of real authorization defects, an integrity-free schema, and a near-empty test suite, all specified and ordered in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

---

## 1. What changed in this pass

The previous audit documented the repository but could not execute anything — the sandbox had no access to the npm registry. That restriction is gone, so this pass **ran the build** rather than reasoning about it. The results were worse than the static review suggested, and then better once fixed.

### The build was broken, and now it is not

| # | Defect | How it presented | Status |
|---|---|---|---|
| 1 | **`index.html` was never committed** | `vite build` → `Could not resolve entry module "index.html"`. Confirmed via `git log --all -- index.html` (empty) and `git check-ignore` (not ignored) — it simply never existed in the repo. | ✅ Fixed |
| 2 | **`vitest` missing from `devDependencies`** | `npm test` → `sh: 1: vitest: not found`; `npm run typecheck` → `TS2307: Cannot find module 'vitest'`. **This is the root cause of the CI failures on 2026-07-17.** | ✅ Fixed |
| 3 | **`@eslint/js` imported but never declared** | resolved only transitively through eslint; fragile without a lockfile | ✅ Fixed |
| 4 | **`tailwindcss-animate` required but never declared** | absent from `node_modules`; `tailwind.config.js` also used `require()` in an ESM file | ✅ Fixed |
| 5 | **No `drizzle.config.ts`** | every `db:push` / `db:generate` / `db:migrate` script had no config to read | ✅ Fixed |
| 6 | **`npm run dev` served no API** | `api/boot.ts` bound a port only under `NODE_ENV=production`; Vite proxied to `:3001` where nothing listened | ✅ Fixed |
| 7 | **No lockfile** | installs were not reproducible; CI used `npm install` | ✅ Fixed |
| 8 | **`eslint.config.js` had no `ignores`** | after any build, lint reported ~1900 errors from the bundled `dist/boot.js`. CI escaped it only because lint runs before build | ✅ Fixed |
| 9 | **`vitest.config.ts` lacked path aliases** | tests could not resolve `@contracts/*`, failing at collect time | ✅ Fixed |
| 10 | Two `no-empty-object-type` lint errors | `input.tsx`, `textarea.tsx` | ✅ Fixed |

**Verification performed in this session:**

```
npm ci                → 540 packages, clean
npm run typecheck     → exit 0
npm test              → 1 passed
npm run lint          → exit 0 (6 warnings, 0 errors)
npm run build         → dist/public + dist/boot.js produced
npm run validate      → exit 0, repeatable
NODE_ENV=development npx tsx api/boot.ts
                      → "listening on http://localhost:3001/"
                      → GET /api/trpc/ping → 200 · GET /api/x → 404
npx drizzle-kit generate
                      → baseline migration 0000_*.sql, 6 tables
```

The baseline migration also quantified the integrity gap precisely: **6 tables, 0 foreign keys, 0 indexes**.

---

## 2. What works

Verified by code review and, where noted, by execution:

- **Real-time messaging** — Socket.IO rooms per conversation and per user; send, broadcast, `conversationUpdated` fan-out
- **Auth** — Kimi OAuth 2.0 code exchange → user upsert → HMAC-SHA256-signed session cookie (`alice_session`, 7-day, timing-safe verify); `/api/logout`
- **Authenticated sockets** — handshake middleware rejects connections without a valid session; `userId` derives from the session, never the client; membership gates `joinConversation`, `sendMessage`, `typing`
- **Multi-socket presence** — `Map<userId, Set<socketId>>` supports several tabs or devices per user
- **Conversations, messages, contacts** — direct and group creation, paginated history, read receipts, a pending/accepted/blocked contact state machine
- **UI** — Chat and Contacts pages, dark glassmorphism theme, mobile responsive, 34 shadcn/ui components
- **The full gate** — typecheck, test, lint, build, and now a reproducible `npm ci`

---

## 3. What is broken

These are the findings that matter. Each is specified with a fix in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md); severity ordering is reflected in the wave structure there.

### Authorization — a signed-in user can reach data that is not theirs

| Defect | Location | Impact |
|---|---|---|
| **`message.markAsRead` performs no authorization at all** | `api/message-router.ts:135-156` | Any authenticated user can write read receipts for any message id in the system. The socket variant checks conversation membership but never checks that the message ids belong to that conversation. |
| **Conversation creation accepts arbitrary user ids** | `api/conversation-router.ts:160-243` | No existence, contact, or block check; `participantIds` uncapped. Anyone can pull strangers into a group and message them. |
| **`contacts.status = 'blocked'` is enforced nowhere** | schema only | Blocking is stored and then ignored by every code path. |
| **`contact.searchUsers` returns `email` on a 1-character match** | `api/contact-router.ts:165-188` | Full user-directory enumeration. `%`/`_` unescaped. |
| **Presence is globally broadcast** | `api/socket.ts:52,54,206` | Every user learns every other user's online state, and each new socket receives the entire online-user list. |

### Correctness

| Defect | Location | Impact |
|---|---|---|
| **Read receipts return for only the first message per page** | `api/message-router.ts:68` | `IN (${ids.join(",")})` binds the joined string as a *single* parameter → `IN (?)` with `"11,12,13"`, which MySQL coerces to `11`. Silent data bug. Not injectable — values are server-derived — but wrong. |
| **`conversations.updatedAt` is never written** | ordered by at `api/conversation-router.ts:38` | Nothing anywhere updates the column, so the sidebar is sorted by creation time, not recency. |
| **`lastReadAt` is written but never read** | — | Unread counts do not exist. |
| **`createDirect` can duplicate a DM** | `api/conversation-router.ts:184-196` | The lookup takes the first shared conversation; if that is a group, the `type='direct'` filter misses. |
| **`contact.add` is TOCTOU-racy** | `api/contact-router.ts:74-89` | Check and insert are not atomic and no unique key backstops it. |
| **`contact.pending` shows a phantom incoming request** | `api/contact-router.ts:55` vs `:96-105` | The requester sees a request from the person they just added. |

### Security posture

- **OAuth**: no `state`, no PKCE; the authorize/token/userinfo base URL is incoherent across `.env.example`, `Login.tsx` and `auth.ts`; and `redirect_uri` differs between client (`window.location.origin`, `:3000`) and server (inbound `url.origin`, `:3001` behind the proxy) — a conformant provider rejects the exchange.
- **Session cookie has no `Secure` flag** (`api/kimi/auth.ts:102`).
- **Socket payloads are not validated at runtime.** The 4000-character message cap exists only on the tRPC path, and the UI sends via the socket — so it is unenforced in practice.
- **No rate limiting anywhere.** Body limit is 50 MB.
- **`JWT_SECRET` / `APP_SECRET` accept a single character** (`api/lib/env.ts:7-8`).

### Structural

- **0 foreign keys, 0 indexes** on all six tables; `try/catch` blocks "handle" duplicate-key errors that cannot fire because no unique key exists.
- **No tRPC procedure emits any socket event** — `getIO()` has zero call sites. Realtime happens only on the socket path, so the stricter tRPC validation is never exercised.
- **Test coverage is one file, one test.**
- `OWNER_UNION_ID` is parsed and exposed by `getOwnerUnionId()`, which has zero call sites; `users.role` is never read or written as `admin`. Admin capability does not exist.
- Dead code: `api/lib/http.ts`, the duplicated `getSessionCookieOptions`, orphan `tsconfig.app.json` / `tsconfig.server.json`.
- `dist/boot.js` bundles Drizzle's **pg-core** into a MySQL-only server.

---

## 4. Documentation delivered

Written this pass, all grounded in the source with `file.ts:LINE` citations:

| Document | What it is |
|---|---|
| [docs/SRS.md](docs/SRS.md) | 164 atomic requirements (109 functional, 55 non-functional) with MUST/SHOULD/MAY, priority, current status, and verification method. 42 unmet P0s are the release-blocking set. |
| [docs/TECH_SPEC.md](docs/TECH_SPEC.md) | Technical design: topology, module architecture, request lifecycles, delivery guarantees, env contract, observability, performance, rollout |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | ERD, per-column reference, the full integrity gap (10 FKs, 3 uniques, 6 indexes) with drop-in Drizzle and a dedupe runbook, plus Phase 2 schemas |
| [docs/API_CONTRACT.md](docs/API_CONTRACT.md) | All 16 tRPC procedures and every socket event with exact payloads, auth preconditions, rooms, and 25 numbered contract gaps |
| [docs/SECURITY.md](docs/SECURITY.md) | STRIDE threat model, 30 numbered controls, and a prioritised remediation table |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | ~190 test cases with IDs, preconditions and expected results, plus the harness and CI design |
| [docs/ADR.md](docs/ADR.md) | 15 decision records, including MySQL-vs-Supabase with a costed migration path |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | **The execution plan** — waves, task cards, acceptance criteria, sequencing |
| [docs/TRACEABILITY.md](docs/TRACEABILITY.md) | The audit trail — one row per requirement joining SRS.md, BUILD_PLAN.md, TEST_PLAN.md, SECURITY.md and DATA_MODEL.md: owning task, verifying test, security control, plus the coverage arithmetic, the P0 release gate and the orphan lists |
| [docs/PRD.md](docs/PRD.md) | Product requirements and design v2.0 — vision, competitive landscape, phase deep-dives, performance targets |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phases 1–4 reconciled against the parked MLS program, with a milestone view |
| [CLAUDE.md](CLAUDE.md) | Claude Code handoff and working agreement |

---

## 5. Decisions of record

| # | Decision | Rationale |
|---|---|---|
| D-1 | **Stay on MySQL for this release.** Supabase/Postgres is a gated future migration ([ADR-001](docs/ADR.md)). | Supabase Pro is not provisioned, and nothing in this release depends on it. The migration is costed at 6–10 engineer-weeks; unsigned bigint alone changes the domain of every FK column. Blocked account, unblocked work. |
| D-2 | **Stabilize → Phase 2 on the current stack** is the active track; the July 2026 MLS/Rust re-architecture stays parked. | Both plans require prototype stabilization first, so they share their first mile. |
| D-3 | **Authorization defects outrank features.** Wave 1 of the build plan ships before any Phase 2 work. | A user reaching another user's data is worse than a missing badge. |

---

## 6. Known blockers

| Blocker | Effect | Mitigation |
|---|---|---|
| **Supabase Pro account not provisioned** | None on this release | D-1 — MySQL is the target; no task depends on Supabase |
| **Object storage credentials (F-4)** | Attachments cannot ship to production | MinIO in `docker-compose.yml` for local development; late in the order |
| **VAPID keys (F-6)** | Web push cannot ship to production | Generate keys locally; late in the order |
| **No GitHub write credentials in the authoring sandbox** | This work could not be pushed directly | Delivered as a git bundle + patch; see the handoff notes |

---

## 7. Immediate next actions

1. Land the stabilization commit (it makes the repository build — nothing else can be verified until it is on `main`).
2. Work [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) Wave 1 in order: **S-8 → S-9 → S-10 → S-4 → S-5**. These close every known unauthorized data path.
3. Then Wave 2 (S-3, S-11) for database-enforced integrity, and Wave 3 (S-7, S-12) for a test suite worth trusting.
4. Only then Phase 2 features.

[CLAUDE.md](CLAUDE.md) tells Claude Code exactly how to start.
