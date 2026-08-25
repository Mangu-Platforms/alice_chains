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

## Wave 1 — Correctness & security P0

*Every task here closes a path by which a signed-in user reaches data that is not theirs. Ship this wave before anything else.*

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **S-8** | Authorize `message.markAsRead` on both the tRPC and socket paths; extract one `assertParticipant` helper — **CRITICAL** | P0 | — | ✅ Done |
| **S-9** | Validate participant ids on conversation creation, enforce blocking, cap group size, fix the `createDirect` idempotency bug | P0 | — (must ship before or with S-3) | ✅ Done |
| **S-10** | Close the directory-enumeration leak (`contact.searchUsers`) and the presence broadcast leak | P0 | — | ✅ Done |
| **S-4** | OAuth coherence: origin-only `VITE_KIMI_AUTH_URL`, `PUBLIC_BASE_URL` for both `redirect_uri` legs, `state`, PKCE S256 | P0 | — | ✅ Done |
| **S-5** | Fix read receipts (`inArray` instead of interpolated `IN (?)`) and message-router query hygiene | P0 | — | ✅ Done |
| **S-17** | Session lifecycle hardening — `Secure` + `__Host-` cookie from one helper, session-id rotation on login, server-side revocation on logout, 24 h idle expiry, payload version, ≥ 32-byte secrets (`api/lib/env.ts` accepts 1 character today) | P0 | S-4 (ship after or with it) | Not started |

## Wave 2 — Data integrity

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **S-3** | Foreign keys, unique constraints and indexes per [DATA_MODEL.md §3–§4](docs/DATA_MODEL.md); replace exception-driven duplicate handling | P0 | S-9 | Not started |
| **S-11** | Make `conversations.updatedAt` real on every message write; compute `unreadCount` in `conversation.list` | P0 | S-3 | Not started |

## Wave 3 — Trustworthy tests

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **S-7** | Integration and socket test harness — MySQL service container, fixture factories, ≥ 25 meaningful assertions | P0 | S-3 | Not started |
| **S-12** | CI: integration services, migrations before the suite, coverage published, `validate` a required check on `main` | P0 | S-7 | Not started |

## Wave 4 — Phase 2 features

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **F-1** | Unread message badges | P1 | S-3, S-11 | Not started |
| **F-2** | Message editing & soft deletion | P1 | S-3 | Not started |
| **F-3** | Emoji reactions | P1 | S-3 | Not started |
| **F-4** | File & image attachments (MinIO locally; no account needed) | P1 | S-3, S-6 | Not started |
| **F-5** | Reply threading UI | P1 | S-3 | Not started |
| **F-6** | Web push notifications (self-generated VAPID keys locally) | P1 | S-3 | Not started |
| **F-7** | Group management — rename, avatar, add/remove participants, leave, ownership transfer | P2 | S-3, S-8, S-9 | Not started |
| **F-8** | Blocking semantics end to end — one `isBlockedBetween` predicate enforced across conversation creation, message send, search, contacts and presence; `contact.block`/`unblock` | P1 | S-3, S-9, S-10 | Not started |

## Wave 5 — Hardening & scale

| ID | Title | Pri | Depends on | Status |
|---|---|---|---|---|
| **S-6** | Docker stack — `docker compose up` from a clean checkout, image < 400 MB | P1 | — | ✅ Built; awaiting a live `docker compose up` verification run |
| **S-13** | Rate limiting per [SECURITY.md §8](docs/SECURITY.md) — login/callback, message send (socket *and* tRPC), contact requests, search, upload | P1 | S-7 | Not started |
| **S-14** | Runtime validation of socket payloads with shared Zod schemas in `contracts/`; enforce the 4000-char cap on the socket path | P1 | S-7 | Not started |
| **S-15** | Observability per [TECH_SPEC.md §10](docs/TECH_SPEC.md) — structured logs with redaction, `/healthz` + `/readyz`, RED metrics | P1 | — | Not started |
| **S-16** | Client code-splitting plus a CI bundle-size gate (NFR-PERF-06 — the budget is met today at 177.5 KiB gzipped; the gate is what is missing) | P1 | — | Not started |
| **S-18** | Owner/admin capability and data rights — bind `OWNER_UNION_ID` to `users.role` (`getOwnerUnionId()` has zero call sites today), `adminQuery` builder, member list, deactivation, audit record, data export and erasure, narrowed `auth.me` | P1 | S-3, S-17 | Not started |
| **S-20** | Accessibility and internationalisation baseline — WCAG 2.2 AA audit and fixes, keyboard operation and focus management in the chat list, `aria-live` announcements, message catalogue and locale-aware timestamps | P1 | — | Not started |
| **S-19** | Horizontal scale readiness — Socket.IO Redis adapter and Redis-backed presence behind `REDIS_URL`, capped TLS pool, two-node proof | P2 | S-15 | **Gated** — build only when the [ADR-006](docs/ADR.md) trigger fires: `socket_connections_active` > 6 000 per node for 15 min on 3 days in 14 |

### H — Hygiene (P2, each ≤ 30 min, no behaviour change)

| ID | Title | Status |
|---|---|---|
| **H-1** | Archive the 11.5 MB `alice.pdf` out of the repository root | Not started |
| **H-2** | Delete the duplicated `getSessionCookieOptions` and the dead `api/lib/http.ts` | Not started |
| **H-3** | Give `.prettierignore` real contents; drop the stale `copilot/*` branches | Not started |
| **H-4** | Remove the orphan `tsconfig.app.json` / `tsconfig.server.json` | Not started |
| **H-5** | Reconcile the "JWT" wording in `README.md` and `info.md` — sessions are HMAC-signed cookies | Not started |
| **H-7** | `VITE_KIMI_AUTH_URL` and `VITE_APP_ID` are read on the server only — since S-4 the client builds no provider URL — so the `VITE_` prefix is now misleading. Rename to `KIMI_AUTH_URL`/`KIMI_APP_ID` keeping backwards compatibility, alongside the `JWT_SECRET` → `SESSION_SECRET` rename ([ADR-002](docs/ADR.md)) | Not started |
| **H-6** | `.env.example` ships `NODE_ENV=development`, so a `cp .env.example .env` followed by `npm run build` emits a **development** React bundle — 839 KB instead of 597 KB, with dev warnings shipped to users. Found while verifying S-8. Make `npm run build` force `NODE_ENV=production` | Not started |

---

## Parked

**E2EE / MLS re-architecture** — [docs/ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md](docs/ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md). Its Phase 0 ("repository stabilization") is satisfied by Waves 0–3 above. Revisit after Wave 4 has shipped and has users; the PRD's Phase 3 E2EE work should then be evaluated against the MLS program rather than implemented ad-hoc. See [docs/ROADMAP.md](docs/ROADMAP.md) Track B.

## Sequencing

See [docs/BUILD_PLAN.md §4](docs/BUILD_PLAN.md). In short: Waves 1–3 are the critical path to "complete, buildable, usable"; Wave 4 is the product promise; Wave 5 is what makes it operable by someone other than its author.
