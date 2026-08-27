# Alice Chains — Backlog

**Updated:** 2026-08-12 · **Canonical task cards:** [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)

This is the ordered queue and nothing more. **[BUILD_PLAN.md](docs/BUILD_PLAN.md) owns the task cards** — the problem statement, the files to touch, the requirement ids, the acceptance criteria and the command that proves each one. Task ids here are BUILD_PLAN's ids; if the two ever disagree, BUILD_PLAN wins.

Work top to bottom. Do not start a task whose dependency is unmet. A task is done when `npm run validate` is green, its tests are added and passing, and CI is green on the PR.

---

## Wave 0 — Build restoration ✅

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **S-0** | Make the repository build from a clean clone — commit `index.html`, the missing devDependencies, `drizzle.config.ts`, the baseline migration and `package-lock.json`; switch CI to `npm ci` | P0 | — | ✅ Done |
| **S-2** | Dev server binds a port — always `serve()` except under `NODE_ENV=test`; dev on `API_PORT` 3001, prod on `PORT` 3000 | P0 | — | ✅ Done |

> S-0 absorbs what an earlier revision of this backlog called "S-1 · make CI green + commit a lockfile". There is no S-1.

## Wave 1 — Correctness & security P0 ✅

*Every task here closes a path by which a signed-in user reaches data that is not theirs. Ship this wave before anything else.*

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **S-8** | Authorize `message.markAsRead` on both the tRPC and socket paths; extract one `assertParticipant` helper — **CRITICAL** | P0 | — | ✅ Done |
| **S-9** | Validate participant ids on conversation creation, enforce blocking, cap group size, fix the `createDirect` idempotency bug | P0 | — (must ship before or with S-3) | ✅ Done |
| **S-10** | Close the directory-enumeration leak (`contact.searchUsers`) and the presence broadcast leak | P0 | — | ✅ Done |
| **S-4** | OAuth coherence: origin-only `VITE_KIMI_AUTH_URL`, `PUBLIC_BASE_URL` for both `redirect_uri` legs, `state`, PKCE S256 | P0 | — | ✅ Done |
| **S-5** | Fix read receipts (`inArray` instead of interpolated `IN (?)`) and message-router query hygiene | P0 | — | ✅ Done |
| **S-17** | Session lifecycle hardening — `Secure` + `__Host-` cookie from one helper, session-id rotation on login, server-side revocation on logout, 24 h idle expiry, payload version, ≥ 32-byte secrets | P0 | S-4 | ✅ Done |

## Wave 2 — Data integrity ✅

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **S-3** | Foreign keys, unique constraints and indexes per [DATA_MODEL.md §3–§4](docs/DATA_MODEL.md); replace exception-driven duplicate handling | P0 | S-9 | ✅ Done |
| **S-11** | Make `conversations.updatedAt` real on every message write; compute `unreadCount` in `conversation.list` | P0 | S-3 | ✅ Done |

## Wave 3 — Trustworthy tests

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **S-7** | Integration and socket test harness — MySQL service container, fixture factories, ≥ 25 meaningful assertions | P0 | S-3 | ✅ Done — 169 assertions, green on 3 consecutive runs |
| **S-12** | CI: integration services, migrations before the suite, coverage published, `validate` a required check on `main` | P0 | S-7 | ✅ Done, with two carve-outs — see S-12a and S-12b |

## Wave 4 — Phase 2 features ✅

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **F-1** | Unread message badges | P1 | S-3, S-11 | ✅ Done |
| **F-2** | Message editing & soft deletion | P1 | S-3 | ✅ Done — also closes FR-MSG-11 (deterministic ordering) |
| **F-3** | Emoji reactions | P1 | S-3 | ✅ Done |
| **F-4** | File & image attachments (MinIO locally; no account needed) | P1 | S-3, S-6 | ✅ Done — filesystem driver by default, S3/MinIO behind `STORAGE_DRIVER=s3` |
| **F-5** | Reply threading UI | P1 | S-3 | ✅ Done — also closes FR-MSG-15 |
| **F-6** | Web push notifications (self-generated VAPID keys locally) | P1 | S-3 | ✅ Done |
| **F-7** | Group management — rename, avatar, add/remove participants, leave, ownership transfer | P2 | S-3, S-8, S-9 | ✅ Done |
| **F-8** | Blocking semantics end to end — one `isBlockedBetween` predicate enforced across conversation creation, message send, search, contacts and presence; `contact.block`/`unblock` | P1 | S-3, S-9, S-10 | ✅ Done |

## Wave 5 — Hardening & scale

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **S-6** | Docker stack — `docker compose up` from a clean checkout, image < 400 MB | P1 | — | ✅ Built; awaiting a live `docker compose up` verification run |
| **S-13** | Rate limiting per [SECURITY.md §8](docs/SECURITY.md) — login/callback, message send (socket *and* tRPC), contact requests, search, upload | P1 | S-7 | ✅ Done |
| **S-14** | Runtime validation of socket payloads with shared Zod schemas in `contracts/`; enforce the 4000-char cap on the socket path | P1 | S-7 | ✅ Done |
| **S-15** | Observability per [TECH_SPEC.md §10](docs/TECH_SPEC.md) — structured logs with redaction, `/healthz` + `/readyz`, RED metrics | P1 | — | ✅ Done |
| **S-16** | Client code-splitting plus a CI bundle-size gate (NFR-PERF-06) | P1 | — | ✅ Done — 172.6 KB gzipped, 31% headroom |
| **S-18** | Owner/admin capability and data rights — bind `OWNER_UNION_ID` to `users.role`, `adminQuery` builder, member list, deactivation, audit record, data export and erasure, narrowed `auth.me` | P1 | S-3, S-17 | ✅ Done |
| **S-20** | Accessibility and internationalisation baseline — WCAG 2.2 AA audit and fixes, keyboard operation and focus management in the chat list, `aria-live` announcements, message catalogue and locale-aware timestamps | P1 | — | ✅ Done — baseline; remaining display strings migrate to the catalogue as files are touched (S-20a) |
| **S-19** | Horizontal scale readiness — Socket.IO Redis adapter and Redis-backed presence behind `REDIS_URL`, capped TLS pool, two-node proof | P2 | S-15 | **Gated** — build only when the [ADR-006](docs/ADR.md) trigger fires: `socket_connections_active` > 6 000 per node for 15 min on 3 days in 14 |

## Wave 6 — Product completeness

*Authored after Wave 4 closed, per the no-uncarded-work rule. Cards in [BUILD_PLAN.md](docs/BUILD_PLAN.md).*

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **P-SEARCH-1** | In-conversation message search (MySQL FULLTEXT or indexed LIKE; no search engine without an ADR) | P1 | S-3, F-2 | ✅ Done |
| **P-SEARCH-2** | Global search, scoped to the caller's conversations | P1 | P-SEARCH-1 | ✅ Done |
| **P-PROF-1** | Profile settings — display name, status, avatar, sign out everywhere | P1 | F-4, S-17 | ✅ Done |
| **P-PROF-2** | Persist the sidebar's collapsed state | P2 | — | ✅ Done |
| **P-UX-1** | Wire or remove every remaining stub; real empty states | P1 | — | ✅ Done |
| **P-UX-2** | Connection banner and an outbox for sends attempted while disconnected | P1 | — | ✅ Done |
| **P-UX-3** | Composer — shift+enter, character counter, emoji picker, paste-to-attach | P1 | F-4 | ✅ Done |
| **P-UX-4** | Thread search and media drawer | P2 | F-4, P-SEARCH-1 | ✅ Done |
| **P-LINK-1** | Detect URLs, render with `rel=noopener noreferrer`, no unfurling | P2 | — | ✅ Done |

## Wave 7 — Operator tooling

| ID | Title | Pri | Status |
|---|---|---|---|
| **P-TOOL-1** | `scripts/dev.sh` — compose db, migrate, dev | P1 | ✅ Done — and fixed the fact that nothing loaded `.env` |
| **P-TOOL-2** | `scripts/reset-dev.sh` — destructive local reset, guarded | P2 | Not started |
| **P-TOOL-3** | `/healthz` and `/readyz` (readiness touches MySQL) | P1 | ✅ Done — with S-15 |
| **P-TOOL-4** | Structured logs with request id, no bodies, no secrets | P1 | ✅ Done — with S-15 |
| **P-TOOL-5** | npm scripts for every operator task | P2 | Not started |
| **P-TOOL-6** | Follow SETUP.md as a stranger; fix what fails | P1 | Not started |
| **P-TOOL-7** | `.env.example` complete with generate-secret one-liner | P1 | ✅ Done — and guarded by `test/env-example.test.ts`, which fails in both directions |
| **P-TOOL-8** | CI required checks documented in README | P2 | ✅ Done — with S-12 |
| **P-TOOL-9** | `npm run db:seed` — demo data, dev-only guard | P1 | ✅ Done — three members, a DM, a group, and a printed session cookie for each so no OAuth provider is needed |
| **P-TOOL-10** | CONTRIBUTING.md | P2 | ✅ Done — plus `AGENTS.md` as the cross-agent operating policy, `docs/README.md` rebuilt as the canonical index, a PR template and Copilot instructions |

### H — Hygiene (P2, each ≤ 30 min, no behaviour change)

| ID | Title | Status |
|---|---|---|
| **H-1** | Archive the 11.5 MB `alice.pdf` out of the repository root | ✅ Done — removed from the tree; it remains in git history, which would need a rewrite of `main` to purge |
| **H-2** | Delete the duplicated `getSessionCookieOptions` and the dead `api/lib/http.ts` | ✅ Done — absorbed by S-17 step 2 (SEC-C-08) |
| **H-3** | Give `.prettierignore` real contents; drop the stale `copilot/*` branches | ✅ Done — ignore file extended; the stale branches are a repository setting for a maintainer to delete |
| **H-4** | Remove the orphan `tsconfig.app.json` / `tsconfig.server.json` | ✅ Done — also removed the unreferenced `src/pages/Home.tsx` (SRS A-6) |
| **H-5** | Reconcile the "JWT" wording in `README.md` and `info.md` — sessions are HMAC-signed cookies | ✅ Done |
| **S-12a** | Publish coverage in CI. Needs `@vitest/coverage-v8`, which means a lockfile change; the working agreement puts `npm install` behind an explicit decision, so this is left for the maintainer to approve rather than taken unilaterally | Not started |
| **S-12b** | Make `validate` a required status check on `main`. This is a GitHub branch-protection setting, not a file in the repository, so it cannot be committed — a maintainer sets it in Settings → Branches | Not started |
| **S-20a** | Migrate the remaining display strings in `Chat.tsx` and `Contacts.tsx` into `src/i18n/en.ts`. S-20 established the catalogue and moved everything a screen reader *announces*; the rest is a mechanical sweep best done file by file rather than as one large risky diff | Not started |
| **H-8** | `messages.createdAt` / `lastReadAt` were `TIMESTAMP` without fractional seconds, and MySQL *rounds* — so a message sent in the same second as a read counted as already read | ✅ Done — widened to `timestamp(3)` with `now(3)` defaults (migration 0008) |
| **H-7** | `VITE_KIMI_AUTH_URL` and `VITE_APP_ID` are read on the server only — since S-4 the client builds no provider URL — so the `VITE_` prefix is now misleading. Rename to `KIMI_AUTH_URL`/`KIMI_APP_ID` keeping backwards compatibility, alongside the `JWT_SECRET` → `SESSION_SECRET` rename ([ADR-002](docs/ADR.md)) | Not started |
| **H-9** | The thread renders a fixed most-recent 50 messages with no way to load older ones — `message.listByConversation` takes `limit`/`offset` and the client passes `limit: 50` and never moves. So a conversation longer than 50 messages is silently truncated, and P-UX-4's jump-to-message has to tell the member when a search hit is further back than the loaded window rather than going to it. Found while building P-UX-4 | Not started |
| **H-6** | `.env.example` ships `NODE_ENV=development`, so a `cp .env.example .env` followed by `npm run build` emits a **development** React bundle — 839 KB instead of 597 KB, with dev warnings shipped to users. Found while verifying S-8. Make `npm run build` force `NODE_ENV=production` | ✅ Done |

---

## Parked

**E2EE / MLS re-architecture** — [docs/ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md](docs/ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md). Its Phase 0 ("repository stabilization") is satisfied by Waves 0–3 above. Revisit after Wave 4 has shipped and has users; the PRD's Phase 3 E2EE work should then be evaluated against the MLS program rather than implemented ad-hoc. See [docs/ROADMAP.md](docs/ROADMAP.md) Track B.

## Sequencing

See [docs/BUILD_PLAN.md §4](docs/BUILD_PLAN.md). In short: Waves 1–3 are the critical path to "complete, buildable, usable"; Wave 4 is the product promise; Wave 5 is what makes it operable by someone other than its author.
