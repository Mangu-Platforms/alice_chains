# Alice Chains — Software Requirements Specification

**Repo:** `Mangu-Platforms/alice_chains` · **Branch of record:** `main` @ `3999bca` plus the stabilization working tree (see §1.5)
**Document status:** Baseline v1.0 · 2026-08-12
**Companion specs:** [PRD.md](PRD.md) · [DATA_MODEL.md](DATA_MODEL.md) · [API_CONTRACT.md](API_CONTRACT.md) · [SECURITY.md](SECURITY.md) · [TEST_PLAN.md](TEST_PLAN.md)

---

## 1. Purpose, scope, definitions, and how to read this document

### 1.1 Purpose

This SRS is the **requirements spine** for Alice Chains. It is the single authority for *what the system must do*; the companion specs are authorities for *how*:

| Question | Authoritative document |
|---|---|
| What must the system do, at what priority, and is it done? | **This document** |
| What are the tables, columns, constraints, indexes, retention? | `DATA_MODEL.md` |
| What is the exact procedure / event / error shape on the wire? | `API_CONTRACT.md` |
| What is the threat model and which control mitigates which threat? | `SECURITY.md` |
| How is each requirement proven? | `TEST_PLAN.md` |
| Why are we building this and in what commercial order? | `PRD.md` |

Where this document and a companion disagree, **this document wins for the requirement statement** and the companion wins for the implementation detail. Where a companion has already allocated an ID, this document reuses it (§1.6).

### 1.2 Scope

The system under specification is the Alice Chains web application and its server: a self-hostable, single-tenant, real-time messaging platform. Scope covers the React 19 SPA, the Hono/tRPC/Socket.IO server, the Drizzle/MySQL 8 persistence layer, and the Kimi OAuth 2.0 integration. It does **not** cover the Kimi identity provider itself, the hosting substrate, or the parked MLS/Rust re-architecture program.

### 1.3 Definitions and acronyms

| Term | Definition |
|---|---|
| **Member** | A `users` row provisioned from a successful Kimi OAuth sign-in; identified internally by `users.id`, externally by `users.unionId`. |
| **Conversation** | A `conversations` row, `type` ∈ {`direct`, `group`} (`db/schema.ts:36`). |
| **Participant** | A member with a `conversation_participants` row for a conversation. Participation is the sole authorization primitive for conversation content. |
| **Direct conversation / DM** | `type='direct'`, intended to hold exactly two participants. |
| **Group** | `type='group'`, holds two or more participants, has its own `name` and `avatar`. |
| **Session** | An HMAC-SHA256-signed, base64url-encoded cookie named `alice_session` (`contracts/constants.ts:6`). **It is not a JWT**, despite `README.md` wording. |
| **Union ID** | The opaque external subject identifier issued by Kimi; the natural key of `users` (`db/schema.ts:15`). |
| **Presence** | In-process `Map<userId, Set<socketId>>` of connected sockets (`api/socket.ts:11`). |
| **Owner** | The deployment operator, nominated by the `OWNER_UNION_ID` environment variable (`api/lib/env.ts:11`). See §3.5. |
| **IdP** | Identity provider — Kimi OAuth 2.0 (`api/kimi/auth.ts`). |
| **Self-host** | A deployment run by the data owner from `docker-compose.yml`, with no dependency on any managed SaaS other than the IdP. |

### 1.4 Requirement syntax

Keywords are used per **RFC 2119 / RFC 8174**:

- **MUST** / **MUST NOT** — absolute requirement. Failure is a release blocker at P0/P1.
- **SHOULD** / **SHOULD NOT** — strong recommendation; deviation requires a recorded rationale in the PR description.
- **MAY** — optional; presence or absence is equally conformant.

Every requirement is **atomic** (one assertion), **testable** (a pass/fail check exists), and **unambiguous** (no "fast", "easy", "user-friendly" without a number).

**Column semantics in the requirement tables:**

| Column | Meaning |
|---|---|
| **ID** | Stable identifier. Never renumber. Retire with `(WITHDRAWN)` rather than reuse. |
| **Requirement** | One RFC-2119 statement. |
| **Priority** | **P0** = release blocker, the app is not usable or not safe without it. **P1** = required for the "complete, buildable, usable app" definition of done (§9). **P2** = post-release, tracked but not gating. |
| **Status** | **Implemented** — the code satisfies the requirement today. **Partial** — satisfied on one path or for one case but not generally. **Missing** — no implementation exists. **Defective** — an implementation exists and is wrong, i.e. the requirement is actively violated. |
| **Verification** | The `TC-*` id in `TEST_PLAN.md`, or an observable check. An id carrying **no** marker already exists in `TEST_PLAN.md` and is cited as written there. Ids marked **†** are *new* and must be added to `TEST_PLAN.md` §5; every one of them is numbered **strictly above** the highest id `TEST_PLAN.md` has already issued in its group, so a `†` id can never denote an existing case. Per group — `TEST_PLAN.md` maximum → first id allocated by this document → next free id: **TC-AUTH** 34 → 35 → 38 · **TC-AUTHZ** 10 → *none* → 11 · **TC-CONV** 13 → 14 → 19 · **TC-MSG** 22 → 23 → 33 · **TC-CONT** 18 → 19 → 26 · **TC-SOCK** 24 → 26 → 28 · **TC-DATA** 10 → 11 → 12 · **TC-REG** 15 → 17 → 21 · **TC-E2E** 10 → *none* → 11 · **TC-NFR** 2 → *none* → 3. Three groups do not exist in `TEST_PLAN.md` at all and start at 01: **TC-ADMIN** (01…10), **TC-FILE** (01…10), **TC-NOTIF** (01…09). TC-REG-16 and TC-CONT-21 were allocated by an earlier draft and are deliberately left vacant — ids are never reused. |
| **Notes** | Code citation `file.ts:LINE` for every Status claim about existing behaviour, plus the `SEC-C-*` control that fixes it. |

### 1.5 Evidence base

Every **Status** claim was read from source in the working tree at `main` @ `3999bca` with the stabilization changes applied. Anything not confirmed from source is marked `> **UNVERIFIED:**`.

The following build defects were present on a clean clone and are **now fixed** in the working tree; they are recorded here because they define the NFR-OPS baseline and because two of them are still untracked in git:

| Defect | Resolution | Residual risk |
|---|---|---|
| `index.html` never committed → `vite build` cannot resolve an entry | Added at repo root, references `/src/main.tsx` (`index.html:12`) | Untracked (`git status`) — must be committed |
| `vitest` and `@eslint/js` absent from `package.json` → `npm test` / `npm run lint` fail | Added (`package.json:73,92`) | none |
| No `drizzle.config.ts` → no migration workflow | Added; `schema`/`out`/`dialect: "mysql"` pinned | Untracked — must be committed |
| No `package-lock.json` → `npm ci` impossible, floating dependency tree | Generated | Untracked — must be committed |
| `api/boot.ts` bound a port only under `NODE_ENV=production`, so `npm run dev` served no API | Bootstrap now runs whenever `NODE_ENV !== "test"`; dev binds `API_PORT` 3001, prod binds `PORT` 3000 (`api/boot.ts:48-73`, `contracts/constants.ts:17-19`) | none |

`npm ci && npm run validate` (typecheck → test → lint → build) now exits 0.

### 1.6 ID reconciliation with the companion specs

`SECURITY.md` and `TEST_PLAN.md` allocated `FR-*` and `NFR-*` ids before this document existed. Those ids are **retained with their existing meanings**. Three conflicts were found and resolved as follows:

| Conflict | Resolution |
|---|---|
| `TEST_PLAN.md` maps `FR-AUTH-01` to session-token create/verify (TC-AUTH-01…03, 07, 11, 12); `SECURITY.md` maps `SEC-C-01`/`SEC-C-02` (OAuth base URL, `redirect_uri`) to `FR-AUTH-01`. | `FR-AUTH-01` = **session token issuance and verification** (TEST_PLAN's reading; it has 6 test cases bound to it). The OAuth-URL requirements become the new `FR-AUTH-06` and `FR-AUTH-07`, and `SEC-C-01`/`SEC-C-02` retarget there. Both readings fail the same user-visible symptom, so no test changes. |
| `SECURITY.md` maps `SEC-C-12` (search hardening) to `FR-CONT-04` and `SEC-C-22` (avatar proxy) to `FR-CONT-05`; `TEST_PLAN.md` maps `FR-CONT-04` to blocking (TC-CONT-11) and `FR-CONT-05` to search (TC-CONT-13…16). | `FR-CONT-04` = **blocking**, `FR-CONT-05` = **search** (TEST_PLAN's reading; 5 test cases). `SEC-C-12` retargets to `FR-CONT-05`/`FR-CONT-07`; `SEC-C-22` retargets to `NFR-SEC-06`. |
| `SECURITY.md` maps `SEC-C-15` (raw SQL) to `FR-MSG-04`; `TEST_PLAN.md` maps the same defect (TC-MSG-14) to `FR-MSG-05`. | Split: `FR-MSG-04` = **read receipts returned with history**, `FR-MSG-05` = **read receipts recorded**. TC-MSG-14 verifies FR-MSG-04; TC-MSG-18/19 verify FR-MSG-05. Both citations remain valid. |

Cookie, revocation and session-lifecycle requirements are new and use the `FR-SESS-*` prefix; they do not overlap `FR-AUTH-*`. `DATA_MODEL.md`'s provisional feature ids map as: `F-MSG-DELETE`→FR-MSG-12, `F-MSG-REACT`→FR-MSG-13, `F-NOTIF-PUSH`→FR-NOTIF-01…04, `F-FILE-UPLOAD`→FR-FILE-01…06, `F-PRIV-EXPORT`→FR-ADMIN-08, `F-PRIV-DELETE`→FR-ADMIN-09, `F-PRIV-CONVDEL`→FR-ADMIN-11, `NFR-SEC-ENUM`→NFR-SEC-05, `NFR-SEC-PII`→NFR-SEC-10, `NFR-OPS-BACKUP`→NFR-REL-06, `NFR-OPS-RETAIN`→NFR-OPS-06.

**Task ids.** [BUILD_PLAN.md](BUILD_PLAN.md) is canonical for task ids and wave order (`F-4` = attachments, `F-6` = web push); [BACKLOG.md](../BACKLOG.md) mirrors it one line per task. Earlier `S-*`/`F-*` numbering in `SECURITY.md §13` and `TEST_PLAN.md §9` predates it and is superseded wherever the two differ. This SRS does not depend on task ids.

---

## 2. Product overview

### 2.1 Vision

Alice Chains is the self-hostable real-time messaging platform for teams that will not trade data ownership for polish. It targets the gap between Slack/Discord (polished, unhostable) and Mattermost/Zulip (hostable, dated): a modern React 19 + TypeScript stack, a dark-first interface, sub-second message delivery, and a deployment story that ends at `docker compose up`.

### 2.2 In scope for this release

| Capability | Summary |
|---|---|
| Identity | Kimi OAuth 2.0 authorization-code sign-in; automatic member provisioning; signed-cookie sessions; logout |
| Conversations | Direct (1:1) and group conversations; participant-scoped access; sidebar list with last message, ordering, and unread counts |
| Messaging | Send/receive over Socket.IO with tRPC parity; paginated history; length and type validation; reply-to; read receipts; typing indicators |
| Contacts | Search, request, accept, remove, block; blocking enforced across messaging, conversation creation and presence |
| Presence | Multi-device online/offline, scoped to people the member can legitimately observe |
| Operations | Reproducible build, committed migrations with referential integrity, Docker deployment, rate limiting, security headers |

### 2.3 Explicitly out of scope for this release

The following are **not** part of this release. They are tracked separately and **no requirement in this document depends on them**:

| Out of scope | Where it is tracked |
|---|---|
| **End-to-end encryption (Signal Protocol or MLS)** — messages are stored as plaintext in `messages.content` (`db/schema.ts:66`) and are readable by the operator | Track B, `docs/ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md`; PRD §Phase 3 |
| **Voice and video calling (WebRTC), screen sharing, voice messages** — the `Phone`/`Video` buttons in `src/pages/Chat.tsx` are inert stubs with no handlers | PRD §Phase 3 |
| **Federation / multi-tenant / cross-instance messaging** | Not scheduled |
| **Native mobile applications (iOS, Android, React Native)** — the web app is responsive below the 768 px breakpoint but is not packaged | PRD §Phase 4 |
| **Full-text message search (Meilisearch)** — the `Search` button in the chat header is an inert stub | PRD §Phase 2/4 |
| **Audit logging and formal GDPR DSAR workflows** beyond the export/erasure primitives in FR-ADMIN-08/09 | PRD §Phase 4 |
| **Any migration to Supabase or PostgreSQL** | See §8.1 — decision of record is MySQL 8 |

Stating this plainly: **E2EE/MLS, voice/video, federation and mobile-native are out of scope for this release and tracked separately.** Marketing, README and UI copy MUST NOT claim any of them (see NFR-OPS-08).

---

## 3. Actors and personas

| # | Actor | Description | Authenticated | Capabilities |
|---|---|---|---|---|
| A-1 | **Anonymous visitor** | Any unauthenticated HTTP client. | No | Load the SPA shell and `/login`; call `ping`; initiate OAuth. Every other tRPC procedure returns `UNAUTHORIZED` (`api/middleware.ts:9-12`) and every socket handshake is rejected (`api/socket.ts:30-39`). |
| A-2 | **Authenticated member** | A provisioned `users` row with a valid session. The baseline persona. | Yes | Read own identity; search and manage contacts; create conversations; participate in conversations they belong to. |
| A-3 | **Conversation participant** | A member with a `conversation_participants` row. **This is the only authorization role that gates content.** | Yes | Read history, send, mark read, type, join the socket room for that conversation. |
| A-4 | **Group creator** | The member in `conversations.createdBy` (`db/schema.ts:38`). | Yes | Today: **no elevated capability whatsoever.** `createdBy` is written at `api/conversation-router.ts:229` and never read for an authorization decision anywhere. Group administration (rename, add/remove members) is specified at FR-CONV-12/13 and is Missing. |
| A-5 | **Owner / admin** | See §3.5. | Yes | Today: **none.** |
| A-6 | **Kimi identity provider** | External OAuth 2.0 authorization server. | n/a | Authenticates the human, issues an authorization code, exchanges it for an access token, serves the profile. See §7.1. |

### 3.5 The owner/admin actor — what `OWNER_UNION_ID` actually does today

**Nothing.** This is a precise, verified statement:

- `OWNER_UNION_ID` is declared as an optional string in the env schema (`api/lib/env.ts:11`) and is therefore *parsed and validated* at boot.
- It is exposed by an accessor, `getOwnerUnionId()` (`api/lib/env.ts:21-23`).
- **`getOwnerUnionId()` has zero call sites.** A repository-wide grep across `api/`, `src/`, `db/` and `contracts/` returns only the definition itself.
- `docker-compose.yml:50` faithfully plumbs the variable into the application container, so an operator setting it will observe no error and no effect.
- Separately, `users.role` is a non-null MySQL enum `('user','admin')` defaulting to `'user'` (`db/schema.ts:20`, DDL `db/migrations/0000_lumpy_marten_broadcloak.sql:61`). It is **never read** anywhere in `api/` or `src/`, and no code path ever writes `'admin'` — `upsertUser` sets only `name`, `email`, `avatar`, `lastSignInAt` (`api/queries/users.ts:11-13`).
- `OAuthUserInfo.role` is declared in `api/kimi/types.ts:6` but the callback never reads it (`api/kimi/auth.ts:75-80`).

The owner/admin actor is therefore **specified but entirely unimplemented**. FR-ADMIN-01 defines the intended binding: at provisioning time, a member whose `unionId` equals `OWNER_UNION_ID` is assigned `role='admin'`. Until FR-ADMIN-01 and FR-ADMIN-02 land, a deployment has no privileged user and no administrative surface.

---

## 4. Functional requirements

### 4.1 FR-AUTH — Authentication and identity provisioning

| ID | Requirement | Pri | Status | Verification | Notes |
|---|---|---|---|---|---|
| FR-AUTH-01 | The system MUST issue a session token that is the base64url-encoded session payload, a `.` separator, and an HMAC-SHA256 signature of that payload keyed by `JWT_SECRET`, and MUST reject any token whose signature does not verify. | P0 | Implemented | TC-AUTH-01, TC-AUTH-02, TC-AUTH-03 | `api/kimi/session.ts:19-26` (sign), `:28-38` (verify) |
| FR-AUTH-02 | On `GET /api/oauth/callback` with a valid `code`, the system MUST exchange the code at the IdP token endpoint, fetch the profile from the userinfo endpoint, provision or refresh the member, issue a session cookie, and redirect `302` to `/`. | P0 | Implemented | TC-AUTH-19, TC-AUTH-21 | `api/kimi/auth.ts:24-104`; route bound at `api/boot.ts:18` via `Paths.oauthCallback` |
| FR-AUTH-03 | The system MUST reject a session token whose `iat` is more than 604 800 seconds (7 days) old. | P0 | Implemented | TC-AUTH-04, TC-AUTH-05 | `api/kimi/session.ts:36`; constant `contracts/constants.ts:7` |
| FR-AUTH-04 | Every tRPC procedure other than `ping` MUST resolve the caller from the session cookie to a live `users` row and MUST throw `UNAUTHORIZED` when it cannot. | P0 | Implemented | TC-AUTH-13, TC-AUTH-14, TC-AUTH-15, TC-AUTHZ-01 | `api/context.ts:4-6` → `api/kimi/auth.ts:4-22` → `api/middleware.ts:9-12` |
| FR-AUTH-05 | `GET /api/logout` MUST clear the `alice_session` cookie with `Max-Age=0` and redirect `302` to `/login`. | P0 | Implemented | TC-AUTH-16, TC-E2E-08 | `api/boot.ts:19-22` |
| FR-AUTH-06 | The authorization request URL MUST be derived from a single configured IdP **origin** (no path segments), so that exactly one `/oauth/authorize` segment appears in the final URL. | P0 | **Defective** | TC-E2E-02, TC-AUTH-31, TC-AUTH-32 | `src/pages/Login.tsx:7` appends `/oauth/authorize` to `VITE_KIMI_AUTH_URL`, whose sample value was a full authorize URL (the sample is corrected at `.env.example:13`) → `.../oauth/authorize/oauth/authorize`. Meanwhile the server exchanges at `${VITE_KIMI_AUTH_URL}/api/oauth/token` (`api/kimi/auth.ts:36`) and `/api/oauth/userinfo` (`:60`) — three mutually incompatible readings of one variable. Fix: `SEC-C-01` (constrain `VITE_KIMI_AUTH_URL` to a bare origin + `contracts/oauth.ts`) |
| FR-AUTH-07 | The `redirect_uri` sent in the authorization request MUST be byte-identical to the `redirect_uri` sent in the token exchange, and both MUST derive from a single `PUBLIC_BASE_URL`. | P0 | **Defective** | TC-AUTH-21, TC-AUTH-33 | Client sends `${window.location.origin}/api/oauth/callback` (`src/pages/Login.tsx:6`) = `http://localhost:3000` in dev; server sends `${new URL(c.req.raw.url).origin}/api/oauth/callback` (`api/kimi/auth.ts:47`) = `http://localhost:3001` behind the Vite proxy (`vite.config.ts:17-20`). The IdP MUST reject the mismatch. Fix: `SEC-C-02` |
| FR-AUTH-08 | The authorization request MUST carry a single-use `state` value of at least 32 bytes of CSPRNG entropy, and the callback MUST reject any request whose `state` is absent or does not match, with HTTP 400 and no session issued. | P0 | Missing | TC-AUTH-27, TC-AUTH-28, TC-AUTH-29 | No `state` is generated (`src/pages/Login.tsx:7`) or checked (`api/kimi/auth.ts:26-31`). Fix: `SEC-C-03` |
| FR-AUTH-09 | The authorization request MUST use PKCE with `code_challenge_method=S256`, and the token exchange MUST present the matching `code_verifier`. | P0 | Missing | TC-AUTH-30 | No PKCE parameters anywhere (`src/pages/Login.tsx:7`, `api/kimi/auth.ts:42-48`). Fix: `SEC-C-04` |
| FR-AUTH-10 | Member provisioning MUST key on `unionId`: a first sign-in creates exactly one `users` row; a subsequent sign-in creates none and refreshes `name`, `email`, `avatar` and `lastSignInAt`. | P0 | Implemented | TC-AUTH-19, TC-AUTH-20 | `api/queries/users.ts:10-14`; `unionId` UNIQUE at `db/migrations/0000_lumpy_marten_broadcloak.sql:66` |
| FR-AUTH-11 | If any step of the callback fails — missing `code`, non-2xx token response, non-2xx userinfo response, network error, or absent `unionId` in the profile — the system MUST NOT set a session cookie and MUST NOT leave a partially provisioned member. | P0 | Implemented | TC-AUTH-22, TC-AUTH-23, TC-AUTH-24, TC-AUTH-25, TC-AUTH-26 | `api/kimi/auth.ts:29-31`, `:52-54`, `:68-70`, `:85-87`, `:105-108` |
| FR-AUTH-12 | `APP_SECRET` and `JWT_SECRET` MUST NOT be readable from the client bundle; the build MUST fail if either is exposed under a `VITE_` prefix. | P0 | Partial | TC-REG-12, TC-REG-13 | Both are read server-side only (`api/lib/env.ts:7-8`, used at `api/kimi/auth.ts:45` and `api/kimi/session.ts:20`), so no leak exists today — but nothing *enforces* it, and `VITE_APP_ID`/`VITE_KIMI_AUTH_URL` are deliberately inlined at build time (`Dockerfile:15-18`). Fix: `SEC-C-24` |

### 4.2 FR-SESS — Session transport and lifecycle

| ID | Requirement | Pri | Status | Verification | Notes |
|---|---|---|---|---|---|
| FR-SESS-01 | The session cookie MUST be named `alice_session` and MUST be set with `HttpOnly`, `Path=/`, `SameSite=Lax` and `Max-Age=604800`. | P0 | Implemented | TC-AUTH-16, TC-E2E-01 | `api/kimi/auth.ts:102`; name from `contracts/constants.ts:6` |
| FR-SESS-02 | The session cookie MUST carry the `Secure` attribute whenever `NODE_ENV=production`. | P0 | **Defective** | TC-AUTH-17 | The `Set-Cookie` header is a hard-coded string with no `Secure` (`api/kimi/auth.ts:102`), so the bearer credential is transmissible over cleartext HTTP. Fix: `SEC-C-07` |
| FR-SESS-03 | In production the session cookie name MUST use the `__Host-` prefix, which implies `Secure`, `Path=/`, and no `Domain`. | P1 | Missing | TC-AUTH-36 † | `contracts/constants.ts:6` is unconditionally `alice_session`. Fix: `SEC-C-07` |
| FR-SESS-04 | Authorization MUST NOT trust any field of the session payload other than `unionId`; the caller's identity, role and profile MUST be re-read from the database on every request. | P0 | Implemented | TC-AUTH-14 | `api/kimi/auth.ts:13-15` re-reads via `findUserByUnionId`; `userId`/`name`/`email` in the payload (`api/kimi/types.ts:9-15`) are never used for a decision |
| FR-SESS-05 | Verification of a malformed, truncated, empty or wrongly-sized token MUST return "no session" and MUST NOT throw. | P0 | Implemented | TC-AUTH-06, TC-AUTH-09 | `api/kimi/session.ts:29-30` short-circuit, `:34` length guard before `timingSafeEqual`, caller `catch` at `api/kimi/auth.ts:17-19` |
| FR-SESS-06 | The system MUST support server-side session revocation such that logout invalidates the token for every device within 60 seconds. | P1 | Missing | TC-AUTH-18 | The token is a self-contained HMAC with no server-side store; `/api/logout` only clears the caller's cookie (`api/boot.ts:19-22`). A copied cookie remains valid for the full 7 days. Fix: `SEC-C-05` |
| FR-SESS-07 | The session MUST expire after 24 hours of inactivity in addition to the 7-day absolute maximum. | P2 | Missing | TC-AUTH-37 † | Only absolute expiry exists (`api/kimi/session.ts:36`). Fix: `SEC-C-06` |
| FR-SESS-08 | The session payload MUST carry a version field, and the server MUST reject tokens whose version is below the configured minimum, enabling mass invalidation on secret rotation. | P2 | Missing | TC-AUTH-35 † | No version field (`api/kimi/types.ts:9-15`). Fix: `SEC-C-06` |
| FR-SESS-09 | An established Socket.IO connection MUST be re-validated against session validity at least every 5 minutes and MUST be disconnected when the session is no longer valid. | P2 | Missing | TC-SOCK-24 | The handshake authenticates once (`api/socket.ts:30-39`); nothing re-checks for the connection's lifetime. Fix: `SEC-C-29` |
| FR-SESS-10 | Exactly one cookie-handling implementation MUST exist in the codebase. | P1 | **Defective** | TC-REG-19 † | Three overlapping implementations: `getSessionCookieOptions` is defined twice, identically (`api/kimi/session.ts:40-51` and `api/lib/cookies.ts:4-15`), **and neither is ever called** — the callback hand-writes the header at `api/kimi/auth.ts:102`. `parseSessionToken` (`api/lib/cookies.ts:17-23`) is likewise dead, duplicating `getSessionToken` (`api/kimi/session.ts:7-13`). Fix: `SEC-C-08` |

### 4.3 FR-CONV — Conversations, membership and authorization

| ID | Requirement | Pri | Status | Verification | Notes |
|---|---|---|---|---|---|
| FR-CONV-01 | `conversation.createDirect` MUST be idempotent: calling it twice for the same ordered or unordered pair MUST return the same conversation and MUST NOT create a second `direct` row. | P0 | **Defective** | TC-CONV-01, TC-CONV-02 | Idempotent only when the pair shares no other conversation. `convIds1.find(id => convIds2.includes(id))` (`api/conversation-router.ts:184`) takes the **first** shared conversation id; if that is a group, the `type='direct'` filter at `:190-193` misses and control falls through to the insert at `:200`, creating a duplicate DM |
| FR-CONV-02 | Every read of and write to conversation content MUST be refused unless the caller has a `conversation_participants` row for that conversation. | P0 | Implemented | TC-AUTHZ-03, TC-AUTHZ-04, TC-AUTHZ-05, TC-SOCK-04, TC-SOCK-07 | Checked at `api/conversation-router.ts:113-124`, `api/message-router.ts:26-37`, `:100-113`, `api/socket.ts:56-63`, `:93-104`, `:161`, `:191`. **Exception: `message.markAsRead` — see FR-MSG-05.** Consolidate into one `assertParticipant` helper: `SEC-C-09` |
| FR-CONV-03 | `conversation.createGroup` MUST create one `type='group'` conversation with `createdBy` set to the caller, and MUST make the caller a participant even if the caller is absent from `participantIds`. | P0 | Implemented | TC-CONV-03 | `api/conversation-router.ts:226-240`; the caller is unioned in and duplicates removed by `new Set` at `:234` |
| FR-CONV-04 | `conversation.markAsRead` MUST set `lastReadAt` on the caller's own participant row and MUST NOT modify any other participant's row. | P0 | Implemented | TC-CONV-10, TC-AUTHZ-07 | `api/conversation-router.ts:249-257`; the `WHERE` is scoped by both `conversationId` and `userId` |
| FR-CONV-05 | `conversation.list` MUST return the caller's conversations ordered by most recent activity, newest first. | P0 | **Defective** | TC-CONV-04, TC-E2E-07 | Ordered by `conversations.updatedAt DESC` (`api/conversation-router.ts:38`), but **no code path anywhere writes `conversations.updatedAt`** — a repo-wide grep for `update(conversations` returns nothing, and `$onUpdate` (`db/schema.ts:40-43`) only fires on a Drizzle `UPDATE` that never happens. The sidebar is therefore ordered by *creation* time. See FR-MSG-09 |
| FR-CONV-06 | `conversation.list` MUST return, per conversation, a display name, a display avatar, the participant list, and the latest message or `null`. | P0 | Implemented | TC-CONV-05, TC-CONV-06, TC-CONV-07, TC-CONV-08 | `api/conversation-router.ts:79-103`; DM falls back to `"Unknown"` (`:88`), group to `"Group Chat"` (`:89`) |
| FR-CONV-07 | `conversation.list` MUST return an `unreadCount` per conversation, computed as the number of messages with `createdAt > lastReadAt` and `senderId != caller`. | P1 | Missing | TC-CONV-14 † | `lastReadAt` is written (`api/conversation-router.ts:251`) and **never read** — a repo-wide grep finds no `SELECT` of it. No unread count exists on the wire or in the UI (`src/pages/Chat.tsx:252-305` renders no badge). Query in `DATA_MODEL.md §6.1` |
| FR-CONV-08 | Conversation creation MUST reject any `participantIds` entry that does not correspond to an existing `users` row, with `BAD_REQUEST`. | P0 | Missing | TC-CONV-11 | `createDirect` accepts any `z.number()` (`api/conversation-router.ts:161`) and `createGroup` any `z.array(z.number())` (`:219`); both insert participant rows with no existence check (`:207-210`, `:235-240`), and no FK exists to stop them (`db/migrations/0000_lumpy_marten_broadcloak.sql:12-19`). Fix: `SEC-C-11` |
| FR-CONV-09 | Conversation creation MUST reject any participant who has blocked the caller or whom the caller has blocked, with `FORBIDDEN`. | P0 | Missing | TC-CONV-13 | `contacts.status='blocked'` is a valid enum value (`db/schema.ts:96`) that is **enforced nowhere** — the only reader of `contacts.status` filters for `'accepted'` (`api/contact-router.ts:29`) or `'pending'` (`:56`). Fix: `SEC-C-11` |
| FR-CONV-10 | `createGroup.participantIds` MUST be capped at 256 entries and rejected above that with `BAD_REQUEST`. | P0 | Missing | TC-CONV-12 | `z.array(z.number()).min(1)` with **no `.max()`** (`api/conversation-router.ts:219`); a single call can insert an unbounded number of participant rows at `:235-240`, bounded only by the 50 MB body limit (`api/boot.ts:17`) |
| FR-CONV-11 | A `direct` conversation MUST contain exactly two distinct participants, enforced at creation. | P1 | Missing | TC-CONV-15 † | Nothing constrains the count; `createDirect` inserts two rows (`api/conversation-router.ts:207-210`) but no invariant prevents later divergence, and no unique key exists on `(conversationId, userId)` |
| FR-CONV-12 | `conversation.createDirect` MUST reject `otherUserId` equal to the caller's own id with `BAD_REQUEST`. | P1 | Missing | TC-CONV-16 † | No self-check (`api/conversation-router.ts:160-213`), unlike `contact.add` which does have one (`api/contact-router.ts:69-71`). A self-DM produces two participant rows for the same user |
| FR-CONV-13 | A group participant MUST be able to leave a group, and MUST stop receiving its messages and stop seeing it in `conversation.list` on doing so. | P2 | Missing | TC-CONV-17 † | No leave/remove procedure exists (`api/conversation-router.ts:12-259`) |
| FR-CONV-14 | The group creator MUST be able to rename a group and add or remove participants; non-creators MUST NOT. | P2 | Missing | TC-CONV-18 † | `conversations.createdBy` is written (`api/conversation-router.ts:229`) and never read for authorization |
| FR-CONV-15 | An authorization failure MUST be signalled as a `TRPCError` with code `FORBIDDEN` or `NOT_FOUND`, not as an empty success payload. | P1 | **Defective** | TC-AUTHZ-06, TC-AUTHZ-08 | Non-participants receive `null` (`api/conversation-router.ts:124`), `[]` (`api/message-router.ts:37`), `{success:true}` with zero rows updated (`:245-258` via `TC-AUTHZ-07`), a bare `throw new Error` that surfaces as `INTERNAL_SERVER_ERROR` (`api/message-router.ts:112`), or silence on the socket path (`api/socket.ts:104`). Five different failure shapes for one condition. Fix: `SEC-C-26` |

### 4.4 FR-MSG — Messaging

| ID | Requirement | Pri | Status | Verification | Notes |
|---|---|---|---|---|---|
| FR-MSG-01 | Message content MUST be validated as a string of 1 to 4 000 characters on **every** ingress path, and out-of-range content MUST be rejected without persisting a row. | P0 | **Defective** | TC-MSG-06…TC-MSG-09, TC-SOCK-19 | Enforced on the tRPC path only (`api/message-router.ts:89`). The socket handler has **no runtime validation at all** — the payload is a bare TypeScript annotation (`api/socket.ts:78-85`) and `data.content` goes straight into the insert at `:110`. The UI sends exclusively over the socket (`src/pages/Chat.tsx:157-161`), so **the 4 000-character cap is unenforced in the shipping product**. Fix: `SEC-C-13` |
| FR-MSG-02 | `message.listByConversation` MUST return a page of at most `limit` (1–100, default 50) messages at `offset`, in ascending `createdAt` order, each flagged `isMine`. | P0 | Implemented | TC-MSG-01…TC-MSG-05, TC-MSG-21 | `api/message-router.ts:17-18` (Zod bounds), `:56-58` (`DESC` + limit/offset), `:78` (`.reverse()`), `:81` (`isMine`) |
| FR-MSG-03 | A message MAY carry `replyToId`, which MUST be persisted and returned with the message. | P1 | Partial | TC-MSG-11 | Accepted, persisted and projected on both paths (`api/message-router.ts:92,121,47`; `api/socket.ts:83,113`) but **never rendered** — `src/pages/Chat.tsx` has no quoted-reply UI and no way to set it |
| FR-MSG-04 | Every message in a history page MUST be returned with the complete set of read receipts recorded against it. | P0 | **Defective** | TC-MSG-14, TC-MSG-16 | `api/message-router.ts:68` builds `` sql`${messageReads.messageId} IN (${messageIds.join(",")})` ``, which compiles to `IN (?)` bound to the single string `"7,8,9"`; MySQL coerces it to `7`, so **receipts are returned only for the first message of each page**. Double-ticks are silently wrong for 49 of every 50 messages (`src/pages/Chat.tsx` read-state render). Fix: `SEC-C-15` (`inArray`) |
| FR-MSG-05 | A member MUST be able to record a read receipt only for messages in a conversation they participate in, and repeating the call MUST NOT create duplicate rows. | P0 | **Defective** | TC-MSG-18, TC-MSG-19, TC-AUTHZ-08 | `message.markAsRead` (`api/message-router.ts:135-156`) performs **no authorization of any kind**: it accepts `z.array(z.number())` (`:136`) and inserts a `message_reads` row for each id (`:144-153`) with no participant check, no ownership check, and no bound on array length. Any authenticated member can forge read receipts for any message in the system, including conversations they cannot see, and can probe message-id existence. The socket sibling *does* check participation (`api/socket.ts:161`) but still writes receipts for arbitrary ids within that call. Duplicates are impossible to suppress because `message_reads` has no UNIQUE key (`db/migrations/0000_lumpy_marten_broadcloak.sql:32-38`) — the `try/catch` at `:150-152` catches nothing. Fix: `SEC-C-10` + `SEC-C-16` |
| FR-MSG-06 | A message MUST be delivered to every participant of the conversation who has an open socket, within the latency budget of NFR-PERF-03. | P0 | Implemented | TC-SOCK-05, TC-E2E-03 | `api/socket.ts:127-130` broadcasts `newMessage` to room `conv_<id>`; `io.to()` includes the sender, so the author sees their own message once |
| FR-MSG-07 | On a new message, every participant MUST receive a `conversationUpdated` event on their personal room whether or not they have joined the conversation room. | P0 | Implemented | TC-SOCK-06 | `api/socket.ts:133-145`; personal room joined at `:49` |
| FR-MSG-08 | `message.send` over tRPC MUST emit the same realtime events as the socket path, so that both ingress paths are observationally equivalent. | P0 | Missing | TC-MSG-32 † | **No tRPC procedure emits any socket event.** `getIO()` is exported (`api/socket.ts:13-15`) and has no call sites; no router imports `./socket`. A message sent via `message.send` (`api/message-router.ts:85-133`) is persisted but never broadcast, so peers see it only on the next poll or refetch |
| FR-MSG-09 | Persisting a message MUST update `conversations.updatedAt` to the message timestamp in the same transaction. | P0 | Missing | TC-CONV-04, TC-MSG-23 † | Neither ingress path touches the conversation row (`api/message-router.ts:115-122`, `api/socket.ts:107-114`). This is the root cause of FR-CONV-05 |
| FR-MSG-10 | History pagination SHOULD use keyset (cursor) pagination on `(createdAt, id)` rather than `OFFSET`, so that concurrent inserts do not shift page boundaries. | P2 | Missing | TC-MSG-24 † | `OFFSET` is used (`api/message-router.ts:58`); a message arriving between page fetches shifts every subsequent page by one |
| FR-MSG-11 | Message ordering MUST be deterministic when two messages share a `createdAt` value. | P1 | **Defective** | TC-MSG-25 † | `orderBy(desc(messages.createdAt))` with no tiebreaker (`api/message-router.ts:56`); MySQL `timestamp` has 1-second resolution here (`db/migrations/0000_lumpy_marten_broadcloak.sql:49`), so messages within the same second order arbitrarily and can be reordered between two fetches. Add `, desc(messages.id)` and widen to `timestamp(3)` |
| FR-MSG-12 | A member MUST be able to edit their own message; the edit MUST set `isEdited=true` and MUST be propagated to participants via a `messageUpdated` event. | P2 | Missing | TC-MSG-26 † | `messages.isEdited` exists and is written only as its `false` default (`db/schema.ts:70`); no update procedure and no `messageUpdated` event exist |
| FR-MSG-13 | A member MUST be able to delete their own message; deletion MUST be soft (`deletedAt`), MUST render as "[deleted]" while preserving thread structure, and MUST be propagated via a `messageDeleted` event. | P2 | Missing | TC-MSG-27 † | No `deletedAt` column (`db/schema.ts:62-76`); migration specified in `DATA_MODEL.md §5.1` |
| FR-MSG-14 | A member MUST be able to add and remove an emoji reaction on a message, at most one row per `(message, member, emoji)`, propagated via a `reactionUpdated` event. | P2 | Missing | TC-MSG-28 † | No `message_reactions` table; migration specified in `DATA_MODEL.md §5.2` |
| FR-MSG-15 | `replyToId` MUST reference a message in the same conversation; a cross-conversation reference MUST be rejected with `BAD_REQUEST`. | P1 | Missing | TC-MSG-29 † | No validation on either path (`api/message-router.ts:92`, `api/socket.ts:83`) and no FK on `messages.replyToId` (`db/migrations/0000_lumpy_marten_broadcloak.sql:47`), so a reply can point at a message the reader cannot see |
| FR-MSG-16 | The client MUST render a message optimistically on send and MUST reconcile it with the server row via `tempId` without producing a duplicate. | P1 | Partial | TC-SOCK-05, TC-E2E-03 | `tempId` is accepted and echoed back (`api/socket.ts:83,129`) and the client type declares it (`src/hooks/useSocket.ts:32`), but `src/pages/Chat.tsx:154-164` never sets it and does not render optimistically — it clears the input and waits for `newMessage`, then triggers a **full refetch** (`:80-89`) |
| FR-MSG-17 | Message content MUST round-trip any Unicode string, including 4-byte astral-plane characters, byte-for-byte. | P1 | Partial | TC-MSG-10 | The `text` column declares no charset (`db/migrations/0000_lumpy_marten_broadcloak.sql:44`), so correctness depends on the server default; `utf8mb3` silently mangles emoji. MUST pin `utf8mb4`/`utf8mb4_0900_ai_ci` in the migration |
| FR-MSG-18 | Message content MUST be rendered as text and MUST NOT be interpreted as HTML or Markdown by the client. | P0 | Implemented | TC-MSG-30 † | `src/pages/Chat.tsx` renders `{msg.content}` inside a `<p>`; React escapes it and no `dangerouslySetInnerHTML` exists anywhere in `src/` |
| FR-MSG-19 | A member MUST NOT be able to send a message to a conversation containing a member who has blocked them. | P1 | Missing | TC-MSG-31 † | See FR-CONV-09; `contacts.status='blocked'` is never consulted on send (`api/message-router.ts:100-113`, `api/socket.ts:93-104`) |

### 4.5 FR-CONT — Contacts, blocking and directory search

| ID | Requirement | Pri | Status | Verification | Notes |
|---|---|---|---|---|---|
| FR-CONT-01 | `contact.list` MUST return only the caller's own contact rows whose status is `accepted`. | P0 | Implemented | TC-CONT-05, TC-CONT-11, TC-AUTHZ-09 | `api/contact-router.ts:26-31` |
| FR-CONT-02 | `contact.add` MUST create a pending relationship between caller and target, MUST reject self-addition, and MUST reject a duplicate request. | P0 | Implemented | TC-CONT-01, TC-CONT-06, TC-CONT-07, TC-CONT-08 | `api/contact-router.ts:69-71` (self), `:74-87` (duplicate), `:89-105` (forward + reverse rows) |
| FR-CONT-03 | `contact.remove` MUST delete the relationship in both directions. | P0 | Implemented | TC-CONT-09, TC-CONT-10 | `api/contact-router.ts:147-160` |
| FR-CONT-04 | A member MUST be able to block another member, and a blocked relationship MUST be excluded from `contact.list`. | P1 | **Defective** | TC-CONT-11, TC-CONT-19 † | The exclusion half works (`api/contact-router.ts:29` filters `status='accepted'`), but **there is no mutation that can ever set `status='blocked'`** — the enum value exists in the schema (`db/schema.ts:96`) and the UI shows an inert "Block User" menu item in `src/pages/Chat.tsx` with no handler. The state is unreachable |
| FR-CONT-05 | `contact.searchUsers` MUST return at most 20 members matching the query by display name, excluding the caller. | P0 | **Defective** | TC-CONT-13, TC-CONT-14, TC-CONT-15, TC-CONT-16 | Limit and self-exclusion are correct (`api/contact-router.ts:185,187`), but the procedure accepts a **1-character** query (`:166`) and matches `%q%` against both `name` **and** `email` (`:181-184`) — 26 requests enumerate a large fraction of the directory, and there is no rate limit anywhere to slow it. Fix: `SEC-C-12` |
| FR-CONT-06 | `contact.searchUsers` MUST reject a query shorter than 3 characters with `BAD_REQUEST`. | P0 | Missing | TC-AUTHZ-10 | `z.string().min(1)` (`api/contact-router.ts:166`). Fix: `SEC-C-12` |
| FR-CONT-07 | `contact.searchUsers` MUST NOT return any member's email address. | P0 | **Defective** | TC-CONT-17, TC-AUTHZ-10 | `email` is in the projection (`api/contact-router.ts:174`), so any authenticated member harvests `(name, email, avatar)` for the entire directory. Fix: `SEC-C-12` |
| FR-CONT-08 | `contact.searchUsers` MUST escape the LIKE metacharacters `%` and `_` in the query before interpolation. | P1 | **Defective** | TC-CONT-20 † | `"%" + input.query + "%"` (`api/contact-router.ts:181-184`); a query of `%` matches every row. Values are parameterized so this is not SQL injection, but it defeats the selectivity of the search |
| FR-CONT-09 | Blocking MUST prevent the blocked member from creating a conversation with, or sending a message to, the blocker. | P1 | Missing | TC-CONT-12 | See FR-CONV-09 and FR-MSG-19 |
| FR-CONT-10 | Blocking MUST hide the blocker's presence from the blocked member and vice versa. | P1 | Missing | TC-CONT-22 † | Presence is broadcast globally (`api/socket.ts:52,206`); see FR-PRES-04 |
| FR-CONT-11 | A member MUST be able to unblock a previously blocked member, restoring the relationship to `accepted` or removing it entirely. | P1 | Missing | TC-CONT-23 † | No mutation exists (`api/contact-router.ts:7-188`) |
| FR-CONT-12 | `contact.add` MUST reject a `contactUserId` that does not correspond to an existing `users` row. | P1 | Missing | TC-CONT-24 † | `z.number()` only (`api/contact-router.ts:64`); no FK on `contacts.userId`/`contactUserId` (`db/migrations/0000_lumpy_marten_broadcloak.sql:3-4`) |
| FR-CONT-13 | The requester of a contact request MUST NOT see their own outbound request in their inbound pending list. | P1 | **Defective** | TC-CONT-03 | `add` writes a symmetric reverse row also marked `pending` (`api/contact-router.ts:96-105`); `pending` selects rows where `contactUserId = me` (`:55`) and left-joins the *other* party's profile (`:52`), so **the requester is shown an incoming request from the person they just added** (rendered at `src/pages/Contacts.tsx:313`). Fix: write the reverse row with a distinct status such as `requested` |
| FR-CONT-14 | `contact.accept` MUST succeed only for the receiver of a request that is currently `pending`. | P1 | **Defective** | TC-CONT-04, TC-CONT-25 † | The input is named `contactId` but is used as a **user id** (`api/contact-router.ts:123`, matching the caller at `src/pages/Contacts.tsx:348`), and the `UPDATE` does not filter on `status='pending'` (`:117-136`), so a *blocked* or already-removed relationship can be flipped to `accepted` |

### 4.6 FR-PRES — Presence and typing

| ID | Requirement | Pri | Status | Verification | Notes |
|---|---|---|---|---|---|
| FR-PRES-01 | A member MUST be reported online while at least one of their sockets is connected, and connecting a second device MUST NOT emit a duplicate online event. | P0 | Implemented | TC-SOCK-03 | `Map<userId, Set<socketId>>` at `api/socket.ts:11`; the `wasOffline` guard at `:46,51` suppresses the duplicate |
| FR-PRES-02 | A member MUST be reported offline only when their **last** socket disconnects. | P0 | Implemented | TC-SOCK-16, TC-E2E-06 | `api/socket.ts:201-209`; the entry is deleted and `userOffline` emitted only when the set empties (`:204-207`) |
| FR-PRES-03 | A typing indicator MUST be delivered to the other participants of the conversation and MUST NOT be echoed to its author. | P0 | Implemented | TC-SOCK-08, TC-E2E-04 | `socket.to()` excludes the sender (`api/socket.ts:192`); membership checked at `:191` |
| FR-PRES-04 | A member's online state MUST be disclosed only to members who share a conversation with them or have an `accepted` contact relationship with them. | P0 | **Defective** | TC-SOCK-17 | Presence is broadcast to **every connected socket**: `socket.broadcast.emit("userOnline", …)` (`api/socket.ts:52`) and `socket.broadcast.emit("userOffline", …)` (`:206`) have no room scoping. Every member learns every other member's online state and, combined with FR-CONT-07, can correlate it to a name and email. Fix: `SEC-C-21` |
| FR-PRES-05 | The presence snapshot sent on connect MUST contain only members the recipient is permitted to observe. | P0 | **Defective** | TC-SOCK-17 | `socket.emit("onlineUsers", Array.from(onlineUsers.keys()))` (`api/socket.ts:54`) hands the new socket the **complete** list of online user ids. Fix: `SEC-C-21` |
| FR-PRES-06 | A typing indicator MUST expire automatically 5 seconds after the last `typing` event for that member and conversation. | P1 | Missing | TC-SOCK-26 †, TC-E2E-04 | The server relays without state (`api/socket.ts:188-198`) and the client only clears on an explicit `isTyping:false` (`src/pages/Chat.tsx:103-115`). The client emits on **every keystroke** (`:176-184`), which is also an unbounded event source with no rate limit |
| FR-PRES-07 | The presence map MUST NOT retain entries for disconnected sockets, verified by a soak test showing no growth over 1 hour. | P1 | Partial | TC-NFR-01, TC-SOCK-16 | Cleanup is correct on the `disconnect` event (`api/socket.ts:201-208`) but the map is unbounded and process-local (`:11`); a crash-restart of a peer node leaves no stale state only because the state is not shared. Fix: `SEC-C-21` |
| FR-PRES-08 | Presence MUST be consistent across all API nodes in a multi-node deployment. | P1 | Missing | TC-NFR-02 | No Socket.IO adapter is configured (`api/socket.ts:22-28`), so presence and room fan-out are per-process. See NFR-SCALE-01 |
| FR-PRES-09 | The system SHOULD record and expose a per-member `lastSeenAt` timestamp for offline members. | P2 | Missing | TC-SOCK-27 † | No column exists; `users.lastSignInAt` (`db/schema.ts:26`) tracks sign-in, not activity |

### 4.7 FR-FILE — Attachments

> Entire group is **Missing**. `messages.type` already accepts `image`/`file` and `messages.fileUrl` exists (`db/schema.ts:67-68`) and is accepted end-to-end (`api/message-router.ts:91,120`; `api/socket.ts:82,112`), but **nothing validates or produces a URL**: a member can today set `fileUrl` to an arbitrary string, including `javascript:` or an attacker-controlled origin. The composer's paperclip button in `src/pages/Chat.tsx` has no `onClick`. Schema in `DATA_MODEL.md §5.4`; controls in `SECURITY.md §9` (`SEC-C-23`).

| ID | Requirement | Pri | Status | Verification | Notes |
|---|---|---|---|---|---|
| FR-FILE-01 | The server MUST issue a presigned upload URL scoped to one object key, valid for at most 300 seconds, only to a participant of the target conversation. | P1 | Missing | TC-FILE-01 † | `file.getPresignedUrl` is specified in `PRD.md` Table 3 and does not exist in `api/router.ts:7-13` |
| FR-FILE-02 | Uploads MUST be rejected unless the declared MIME type is on an allowlist **and** the leading magic bytes agree with it. | P1 | Missing | TC-FILE-02 † | Allowlist: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`, `application/zip` |
| FR-FILE-03 | Uploads MUST be rejected above 25 MB, enforced at presign time and by bucket policy. | P1 | Missing | TC-FILE-03 † | 25 MB, not the PRD's 50 MB: the body limit drops to 256 KB under `SEC-C-20`, and 25 MB keeps a single upload inside one HTTP request on a 4G profile within NFR-PERF-06 |
| FR-FILE-04 | `image/svg+xml` MUST be rejected outright. | P1 | Missing | TC-FILE-04 † | SVG is a script-execution vector when served same-origin |
| FR-FILE-05 | Stored objects MUST NOT be publicly readable; download MUST be via a presigned GET valid for at most 300 seconds, issued only to a participant of the conversation the attachment belongs to. | P0 | Missing | TC-FILE-05 † | Prevents URL-sharing bypass of FR-CONV-02 |
| FR-FILE-06 | An attachment record MUST exist in `pending` state before upload and MUST transition to `attached` only when the referencing message is persisted; `pending` records MUST be purged after 24 hours. | P1 | Missing | TC-FILE-06 † | `DATA_MODEL.md §5.4` |
| FR-FILE-07 | A message MUST NOT be persisted with a `fileUrl` that does not correspond to an `attached` record owned by the sender. | P0 | Missing | TC-FILE-07 † | Closes the arbitrary-`fileUrl` hole described above |
| FR-FILE-08 | Uploaded filenames MUST be sanitised and MUST NOT be used as the storage key. | P1 | Missing | TC-FILE-08 † | Use a UUIDv7 key; retain the original name as metadata only |
| FR-FILE-09 | Image attachments MUST render as a lazy-loaded thumbnail of at most 512 px on the long edge; other types MUST render as a download card with filename and size. | P1 | Missing | TC-FILE-09 † | — |
| FR-FILE-10 | Uploaded objects SHOULD be scanned for malware before the record transitions to `attached`. | P2 | Missing | TC-FILE-10 † | — |

### 4.8 FR-NOTIF — Notifications

> Entire group is **Missing**. No service worker exists in `src/`, no `push_subscriptions` table exists (`db/schema.ts`), and `web-push` is not a dependency (`package.json:24-71`). Schema in `DATA_MODEL.md §5.3`.

| ID | Requirement | Pri | Status | Verification | Notes |
|---|---|---|---|---|---|
| FR-NOTIF-01 | The client MUST register a service worker and MUST request Web Push permission only in response to an explicit user action. | P2 | Missing | TC-NOTIF-01 † | Unprompted permission requests are penalised by Chrome's abusive-notification heuristics |
| FR-NOTIF-02 | A push subscription MUST be stored per `(user, endpoint)` and MUST be replaced, not duplicated, when the endpoint is re-registered. | P2 | Missing | TC-NOTIF-02 † | `DATA_MODEL.md §5.3` |
| FR-NOTIF-03 | On a new message, the server MUST send a Web Push notification to every subscription of every participant except the sender who has no socket connected to that conversation. | P2 | Missing | TC-NOTIF-03 † | Suppressing for connected sockets avoids double-notifying a focused tab |
| FR-NOTIF-04 | A subscription MUST be deleted when the push service returns 404 or 410. | P2 | Missing | TC-NOTIF-04 † | Required to stop unbounded growth of dead endpoints |
| FR-NOTIF-05 | The push payload MUST be at most 4 096 bytes and MUST contain sender display name and conversation id but MUST NOT contain message content by default. | P2 | Missing | TC-NOTIF-05 † | Message body on a lock screen is a confidentiality regression; make it opt-in per member |
| FR-NOTIF-06 | A member MUST be able to mute notifications per conversation, and a muted conversation MUST produce no push. | P2 | Missing | TC-NOTIF-06 † | The "Mute Notifications" menu item in `src/pages/Chat.tsx` is an inert stub |
| FR-NOTIF-07 | The browser tab title MUST show the total unread count when the document is hidden. | P1 | Missing | TC-NOTIF-07 † | Depends on FR-CONV-07 |
| FR-NOTIF-08 | The conversation list MUST show a per-conversation unread badge, capped at "99+". | P1 | Missing | TC-NOTIF-08 † | Depends on FR-CONV-07; no badge exists in `src/pages/Chat.tsx:252-305` |
| FR-NOTIF-09 | Clicking a push notification MUST focus an existing tab, or open one, at the originating conversation. | P2 | Missing | TC-NOTIF-09 † | Route already supports deep linking via `?c=<id>` (`src/pages/Chat.tsx:38-41`) |

### 4.9 FR-ADMIN — Owner, administration and data rights

| ID | Requirement | Pri | Status | Verification | Notes |
|---|---|---|---|---|---|
| FR-ADMIN-01 | At provisioning time, a member whose `unionId` equals `OWNER_UNION_ID` MUST be assigned `users.role='admin'`; all other members MUST be assigned `'user'`. | P1 | Missing | TC-ADMIN-01 † | `OWNER_UNION_ID` is parsed (`api/lib/env.ts:11`), exposed by `getOwnerUnionId()` (`:21-23`) which has **zero call sites**, and plumbed through `docker-compose.yml:50`. `upsertUser` never writes `role` (`api/queries/users.ts:11-13`). See §3.5 |
| FR-ADMIN-02 | An `adminQuery` procedure builder MUST exist that throws `FORBIDDEN` when `ctx.user.role !== 'admin'`, and every administrative procedure MUST be built from it. | P1 | Missing | TC-ADMIN-02 † | Only `publicQuery` and `authedQuery` exist (`api/middleware.ts:8-12`); `users.role` is read nowhere |
| FR-ADMIN-03 | If `OWNER_UNION_ID` is unset, the deployment MUST have no administrator and every administrative procedure MUST return `FORBIDDEN`. | P1 | Implemented | TC-ADMIN-03 † | Vacuously true: the variable is optional (`api/lib/env.ts:11`) and no administrative surface exists. Must be re-verified once FR-ADMIN-02 lands |
| FR-ADMIN-04 | An administrator MUST be able to list members with `id`, `name`, `email`, `createdAt`, `lastSignInAt` and `role`. | P2 | Missing | TC-ADMIN-04 † | — |
| FR-ADMIN-05 | An administrator MUST be able to deactivate a member, which MUST revoke their sessions within 60 seconds and refuse new sign-ins. | P2 | Missing | TC-ADMIN-05 † | Blocked on FR-SESS-06; HMAC cookies cannot be revoked today |
| FR-ADMIN-06 | Every administrative action MUST be written to an append-only audit record with actor, action, target, outcome and UTC timestamp. | P2 | Missing | TC-ADMIN-06 † | `PRD.md §Phase 4`; no `audit_logs` table |
| FR-ADMIN-07 | `auth.me` MUST return only `{id, name, email, avatar, status}` and MUST NOT expose `unionId` or `role`. | P1 | **Defective** | TC-AUTH-15, TC-ADMIN-07 † | `api/auth-router.ts:4` returns `ctx.user` — the complete `users` row including the external identity key `unionId` and `role` (`db/schema.ts:13-27`). Fix: `NFR-SEC-10` |
| FR-ADMIN-08 | A member MUST be able to request an export of their personal data, delivered asynchronously as JSON. | P2 | Missing | TC-ADMIN-08 † | Contents specified in `DATA_MODEL.md §7.3` (`F-PRIV-EXPORT`) |
| FR-ADMIN-09 | A member MUST be able to request erasure; the account MUST be marked deleted and sessions revoked immediately, and the data purged after a 30-day grace period. | P2 | Missing | TC-ADMIN-09 † | `DATA_MODEL.md §7.3` (`F-PRIV-DELETE`); blocked on FR-SESS-06 |
| FR-ADMIN-10 | Deleting a conversation MUST cascade to its participants, messages and read receipts, leaving no orphans. | P2 | Missing | TC-ADMIN-10 † | Impossible today: zero foreign keys exist (`db/migrations/0000_lumpy_marten_broadcloak.sql`). Requires `SEC-C-16` |
| FR-ADMIN-11 | The system MUST expose an unauthenticated health endpoint that returns 200 only when the process is able to serve requests. | P0 | Partial | TC-REG-20 † | `ping` returns `{ok:true, ts}` (`api/router.ts:8`) and is used by the container healthcheck (`Dockerfile:42-43`), but it does **not** touch the database — the process reports healthy with a dead connection pool |

---

## 5. Non-functional requirements

All budgets are measured against the reference deployment defined in §8.3 unless stated otherwise. Percentiles are computed over a rolling 1-hour window with at least 1 000 samples.

### 5.1 NFR-PERF — Performance

| ID | Requirement | Pri | Status | Measurement method | Justification |
|---|---|---|---|---|---|
| NFR-PERF-01 | `conversation.list` p95 MUST be ≤ 200 ms for a member with 50 conversations, and `message.listByConversation` p95 MUST be ≤ 150 ms for a 50-message page. | P1 | **Unverified — likely Defective** | k6 against a seeded DB; `EXPLAIN` asserted by TC-DATA-08/09 | The current `conversation.list` issues four sequential queries and pulls **every message of every conversation** to compute the latest per conversation (`api/conversation-router.ts:53-62`) — O(total messages), not O(conversations). No index exists on `messages(conversationId, createdAt)` (`db/migrations/0000_lumpy_marten_broadcloak.sql:40-52`). Both budgets are unreachable at scale until `SEC-C-16` and `DATA_MODEL.md §6.1` land |
| NFR-PERF-02 | A single request MUST NOT issue a number of database queries proportional to the number of rows it returns. | P1 | **Defective** | Query counter asserted in integration tests; TC-CONV-09, TC-CONT-15 | `message.markAsRead` loops one `INSERT` per id (`api/message-router.ts:144-153`) and `api/socket.ts:165-174` does the same — 50 round trips to mark a page read. `DATA_MODEL.md §6.6` |
| NFR-PERF-03 | Socket `sendMessage` → peer `newMessage` p95 MUST be ≤ 250 ms and p99 ≤ 800 ms, same region. | P0 | Unverified | Two instrumented Socket.IO clients, 1 000 messages, timestamps taken at emit and at receipt | The PRD's "<100 ms P99" ignores the synchronous MySQL insert and re-`SELECT` on the send path (`api/socket.ts:107-124`). 250 ms p95 is the honest budget for a single-node MySQL round trip plus broadcast, and is below the ~300 ms threshold at which a chat feels laggy |
| NFR-PERF-04 | OAuth callback p95 MUST be ≤ 300 ms excluding IdP time, and Socket.IO handshake p95 MUST be ≤ 200 ms. | P1 | Unverified | Server-side spans around `api/kimi/auth.ts:24-104` and `api/socket.ts:30-39` | The handshake performs one DB read per connection (`api/kimi/auth.ts:14`); 200 ms leaves headroom for connection-storm reconnects after a deploy |
| NFR-PERF-05 | First Contentful Paint MUST be ≤ 1.2 s and Largest Contentful Paint ≤ 2.5 s on a cold load, measured on a simulated Fast 3G profile with 4× CPU throttling. | P1 | Unverified | Lighthouse CI in the pipeline, median of 5 runs | LCP ≤ 2.5 s is the Core Web Vitals "good" threshold. FCP 1.2 s is inherited from `PRD.md §Performance` |
| NFR-PERF-06 | The initial JavaScript payload MUST be ≤ 250 KB gzipped, and CI MUST assert the gzipped size on every PR and fail the build when it exceeds the budget. | P1 | **Partial** — budget met, gate missing | Gzipped size of the initial `dist/public/assets/index-*.js` chunk asserted in CI (`TECH_SPEC.md §9.3` B-6) | Measured **181,756 B ≈ 177.5 KiB** gzipped (`TECH_SPEC.md §9.3`), so the budget is **currently met** with ~28 % headroom; the outstanding obligation is the CI gate, not the number. Note the earlier justification ("34 vendored Radix/shadcn components, several unused") was **wrong as a cause**: only 7 of the 34 files in `src/components/ui/` are imported by a live route, and a module nothing imports never enters the bundle graph, so the 27 unused files cost `node_modules` weight and typecheck time, not bytes on the wire. The real risk is regression: one unsplit chunk means every new dependency lands on the critical path unnoticed |
| NFR-PERF-07 | A member switching conversations MUST see the message list rendered within 300 ms when the page is already cached client-side. | P1 | Unverified | React Profiler in an E2E run | `src/pages/Chat.tsx:61-65` re-queries on every switch with no `staleTime`; TanStack Query caching makes this achievable |
| NFR-PERF-08 | Receiving a message MUST NOT trigger a full history refetch. | P1 | **Defective** | Network assertion in TC-E2E-03 | `src/pages/Chat.tsx:80-89` calls `refetchMessages()` **and** `refetchConversations()` on every inbound `newMessage`. At 60 messages/minute in an active conversation this is 120 extra round trips per minute per open tab. Append to the cache instead |

### 5.2 NFR-SEC — Security

| ID | Requirement | Pri | Status | Measurement method | Justification |
|---|---|---|---|---|---|
| NFR-SEC-01 | The OAuth flow MUST be resistant to authorization-code injection and CSRF, evidenced by `state` and PKCE S256. | P0 | Missing | TC-AUTH-27…30 | See FR-AUTH-08/09; `SEC-C-03`, `SEC-C-04` |
| NFR-SEC-02 | No SQL MUST be constructed by string interpolation of any value; every parameter MUST be bound. A lint rule MUST fail the build on an interpolated `` sql`` `` template outside an explicit allowlist. | P0 | **Defective** | ESLint rule + TC-MSG-14 | One violation, at `api/message-router.ts:68`. `SEC-C-15` |
| NFR-SEC-03 | Every message crossing a trust boundary — tRPC input **and** Socket.IO event payload — MUST be validated by a Zod schema before use, and an invalid payload MUST be rejected without side effects. | P0 | **Defective** | TC-SOCK-18…22 | tRPC inputs are validated; **Socket.IO payloads are not validated at runtime at all** — `api/socket.ts` imports no Zod and relies solely on TypeScript annotations at `:66,71,78-85,157,190`. `markAsRead` with `messageIds: undefined` throws inside the handler and is silently swallowed (`:181`). `SEC-C-13` |
| NFR-SEC-04 | The session cookie MUST NOT be transmissible over cleartext HTTP in production. | P0 | **Defective** | TC-AUTH-17 | See FR-SESS-02; `SEC-C-07` |
| NFR-SEC-05 | An unauthorized caller MUST NOT be able to distinguish "does not exist" from "not permitted", and MUST NOT be able to enumerate members, message ids or conversation ids. | P0 | **Defective** | TC-AUTHZ-01…10, TC-CONT-17 | Three enumeration oracles: directory search returns email for a 1-character query (`api/contact-router.ts:174,181-184`), `message.markAsRead` accepts arbitrary message ids without authorization (`api/message-router.ts:135-156`), and presence is globally broadcast (`api/socket.ts:52`). `SEC-C-12`, `SEC-C-26`, `SEC-C-30` |
| NFR-SEC-06 | Every HTML response MUST carry `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `X-Frame-Options: DENY`; CORS and the Socket.IO origin policy MUST use an explicit allowlist. | P0 | Missing | TC-REG-15 | **No security headers are set anywhere** — no `secureHeaders` or helmet middleware in `api/boot.ts:15-31`. Socket.IO CORS is `false` in production and a hard-coded `http://localhost:3000` otherwise (`api/socket.ts:24`), which is not a configurable allowlist. `SEC-C-17`, `SEC-C-18`, `SEC-C-22` |
| NFR-SEC-07 | Every write surface MUST be rate limited per member with a token bucket, returning HTTP 429 with `Retry-After` (tRPC) or a `rateLimited` event (socket). | P0 | Missing | TC-SOCK-23 | **No rate limiting exists anywhere** — verified by absence across `api/` and `package.json`. Limits: 60 messages/min, 10 contact requests/min, 30 searches/min, 5 uploads/min, 600 API calls/min, 240 typing events/min. Message and contact limits are inherited from `PRD.md §SR-6`; the typing limit reflects `src/pages/Chat.tsx:176-184` emitting on every keystroke. `SEC-C-19`, `SEC-C-14` |
| NFR-SEC-08 | `JWT_SECRET` and `APP_SECRET` MUST each be at least 32 bytes of entropy, and the process MUST refuse to start otherwise. | P0 | **Defective** | TC-AUTH-34 | `z.string().min(1)` for both (`api/lib/env.ts:7-8`) — a one-character HMAC key starts the server and every session in the deployment is forgeable. `SEC-C-24` |
| NFR-SEC-09 | The database account used by the application MUST hold only DML privileges on the application schema, MUST connect over TLS, and the pool MUST be capped. | P1 | **Defective** | Connection audit; TC-DATA-11 † | `mysql.createPool(env.DATABASE_URL)` with no TLS option and no `connectionLimit` (`api/queries/connection.ts:6`); `docker-compose.yml:6-9` provisions a root password alongside the app user. `SEC-C-28` |
| NFR-SEC-10 | No API response MUST include a field the caller does not need; in particular `unionId`, `role` and other members' `email` MUST NOT be returned. | P0 | **Defective** | TC-AUTH-15, TC-CONT-17 | See FR-ADMIN-07 (`api/auth-router.ts:4`) and FR-CONT-07 (`api/contact-router.ts:174`) |
| NFR-SEC-11 | The HTTP request body limit MUST be 256 KB. | P1 | **Defective** | TC-REG-14 | `bodyLimit({maxSize: 50 * 1024 * 1024})` (`api/boot.ts:17`) — 200× the largest legitimate request (a 4 000-character message), and applied before authentication, so an anonymous client can force 50 MB of buffering per request. `SEC-C-20` |
| NFR-SEC-12 | Dependencies MUST be installed from a committed lockfile, and CI MUST fail on a known high-or-critical advisory. | P0 | Partial | TC-REG-01, TC-REG-02 | `package-lock.json` now exists and CI uses `npm ci` (`.github/workflows/ci.yml:16`), but the lockfile is **still untracked** in git (`git status`) and no `npm audit` gate exists. `SEC-C-27` |

### 5.3 NFR-REL — Reliability

| ID | Requirement | Pri | Status | Measurement method | Justification |
|---|---|---|---|---|---|
| NFR-REL-01 | The database MUST enforce referential integrity with foreign keys, and MUST enforce uniqueness on `conversation_participants(conversationId,userId)`, `message_reads(messageId,userId)` and `contacts(userId,contactUserId)`. | P0 | **Defective** | TC-DATA-01…07, TC-MSG-19, TC-CONT-18 | The baseline migration declares **zero foreign keys and exactly one unique key** (`users.unionId`, `db/migrations/0000_lumpy_marten_broadcloak.sql:66`). Duplicate read receipts and duplicate participants are therefore representable, and the `try/catch` at `api/message-router.ts:150-152` is dead code. `SEC-C-16`, DDL in `DATA_MODEL.md §3.5` |
| NFR-REL-02 | The application MUST survive loss of the database connection without crashing, and MUST recover automatically within 30 seconds of the database returning. | P1 | Unverified | Chaos test: stop the `db` container for 60 s | `mysql2` pools reconnect, but no handler exists for pool-level errors (`api/queries/connection.ts:6-7`) and an unhandled pool error terminates the process. `SEC-C-28` |
| NFR-REL-03 | No request or socket event MUST be able to terminate the process; every async handler MUST have an error boundary. | P1 | Partial | TC-AUTH-25, TC-SOCK-21 | Socket handlers wrap in `try/catch` (`api/socket.ts:86-150`, `:159-184`) but **swallow silently** — the client is never told the message failed (`:104` returns with no emit). `joinConversation` and `typing` have no `try/catch` at all (`:66-68`, `:188-198`), so a rejected DB query there is an unhandled rejection |
| NFR-REL-04 | A disconnected socket MUST leave no residual server state, verified by a 1-hour soak showing bounded memory. | P1 | Implemented | TC-SOCK-16, TC-NFR-01 | `api/socket.ts:201-209` |
| NFR-REL-05 | Monthly availability MUST be ≥ 99.5 % for the reference single-node deployment. | P1 | Unverified | External HTTP probe of `/api/trpc/ping` every 30 s; monthly uptime = successful probes ÷ total | 99.5 % = 3 h 39 min/month. Justified by the reference topology: one app container, one MySQL container, no replica, no rolling deploy (`docker-compose.yml`). A higher target is unachievable without NFR-SCALE-01 and is not promised |
| NFR-REL-06 | RTO MUST be ≤ 1 hour and RPO ≤ 15 minutes. | P1 | Missing | Documented and rehearsed restore drill, timed | No backup exists: `docker-compose.yml:59-60` declares a named volume with no snapshot or dump policy. RPO 15 min is met by binary-log shipping plus a nightly `mysqldump`; RTO 1 h by a documented restore runbook. `DATA_MODEL.md §7.1` |
| NFR-REL-07 | A message acknowledged to the sender MUST be durably persisted before the acknowledgement. | P0 | Implemented | TC-SOCK-05 | Both paths insert and then read back before emitting (`api/socket.ts:107-127`; `api/message-router.ts:115-132`). Note the two writes in FR-MSG-09's fix must share a transaction |

### 5.4 NFR-SCALE — Scalability

| ID | Requirement | Pri | Status | Measurement method | Justification |
|---|---|---|---|---|---|
| NFR-SCALE-01 | The system MUST deliver messages correctly when running on two or more API nodes behind a load balancer. | P0 | **Defective** | TC-NFR-02 | No Socket.IO adapter is configured (`api/socket.ts:22-28`) and presence is a process-local `Map` (`:11`), so a member on node 1 receives nothing sent through node 2. This is the single hard blocker on horizontal scale. Fix: `@socket.io/redis-adapter` + sticky sessions |
| NFR-SCALE-02 | One API node MUST sustain 10 000 concurrent authenticated socket connections at ≤ 75 % of one CPU core and ≤ 2 GB RSS. | P1 | Unverified | Artillery/k6 socket ramp to 10 000, held 15 min | Matches `PRD.md` Table 5. Node comfortably holds far more idle sockets, but this app performs a DB read per handshake (`api/kimi/auth.ts:14`) and keeps a per-user `Set` in memory (`api/socket.ts:11`); 10 000 is the defensible per-node figure until measured |
| NFR-SCALE-03 | One API node MUST sustain 500 messages/second end-to-end, with NFR-PERF-03 still met at that rate. | P1 | Unverified | Load generator: 500 msg/s across 200 conversations for 10 min | `PRD.md` Table 5. Socket.IO itself benchmarks at ~27 000 msg/s; the binding constraint is the synchronous insert plus read-back per message (`api/socket.ts:107-124`), so 500/s is the realistic single-node ceiling |
| NFR-SCALE-04 | The database connection pool MUST be explicitly capped at 20 connections per process. | P1 | Missing | Configuration assertion | `PRD.md` Table 5; no cap is set (`api/queries/connection.ts:6`), so a connection storm exhausts MySQL's `max_connections` |
| NFR-SCALE-05 | Conversation fan-out MUST be O(participants), not O(members). | P1 | Implemented | Code review + TC-SOCK-06 | Room-scoped emits (`api/socket.ts:127`, `:141`). **Presence is the exception** — it is O(all connected), see FR-PRES-04 |

### 5.5 NFR-OPS — Operability

| ID | Requirement | Pri | Status | Measurement method | Justification |
|---|---|---|---|---|---|
| NFR-OPS-01 | A clean clone MUST satisfy `npm ci && npm run validate` with exit code 0. | P0 | Implemented | TC-REG-01, TC-REG-03, TC-REG-04 | Now passing after the §1.5 fixes; CI runs the same four gates (`.github/workflows/ci.yml:16-20`) |
| NFR-OPS-02 | Every file required to build MUST be tracked in git. | P0 | **Defective** | TC-REG-02 | `package-lock.json`, `index.html`, `drizzle.config.ts`, `Dockerfile`, `docker-compose.yml` and `db/migrations/0000_lumpy_marten_broadcloak.sql` are all present in the working tree but **untracked** (`git status`). A fresh clone still cannot build. `SEC-C-27` |
| NFR-OPS-03 | Logs MUST be structured JSON with a correlation id, and MUST NOT contain session tokens, secrets or message content. | P1 | **Defective** | TC-REG-17 † | Logging is **seven** bare `console.log`/`console.error` calls and nothing else — `api/socket.ts:42,148,182,208`, `api/kimi/auth.ts:106`, `api/boot.ts:69,71` — with no redaction, no correlation id and no level control. `console.error("Error sending message:", error)` (`api/socket.ts:148`) can emit driver errors containing row values. **`console.error("OAuth callback error:", error)` (`api/kimi/auth.ts:106`) is the worst site: it is the catch-all around the token exchange, so a `fetch`/parse error whose message or cause echoes the request body would print `APP_SECRET` to stdout.** `SEC-C-25` |
| NFR-OPS-04 | Dev MUST serve the client on 3000 and the API on 3001; prod MUST serve both on `PORT` (default 3000); tests MUST bind no port. | P0 | Implemented | TC-REG-05, TC-REG-07, TC-REG-08, TC-REG-09, TC-REG-10 | `api/boot.ts:48-73`; contract in `contracts/constants.ts:17-19`; proxy in `vite.config.ts:16-26`. This was the S-2 defect (§1.5) |
| NFR-OPS-05 | Schema changes MUST be applied by versioned migration files, and `drizzle-kit generate` MUST report no pending diff against `db/schema.ts`. | P0 | Partial | TC-DATA-10 | `drizzle.config.ts` and a baseline migration now exist and `docker-compose.yml:22-32` runs `drizzle-kit migrate` before the app starts — but both files are untracked (NFR-OPS-02), and `db:push` remains available in `package.json:13` as a footgun |
| NFR-OPS-06 | Data retention MUST be configurable per deployment, with a documented default. | P1 | Missing | Configuration review | Nothing is ever deleted today. Default: messages retained indefinitely; soft-deleted messages purged after 30 days; `pending` attachments after 24 h; logs 30 days. `DATA_MODEL.md §7.1` |
| NFR-OPS-07 | A deployment MUST be reproducible from `docker compose up` with only `.env` supplied, reaching a healthy state within 120 seconds. | P0 | Partial | TC-REG-18 † | `docker-compose.yml` orders db → migrate → app with health gating (`:28-32`, `:53-57`) and the image has a healthcheck (`Dockerfile:42-43`) — but the compose file and Dockerfile are untracked (NFR-OPS-02), and `.env.example` produces a **non-working sign-in** (FR-AUTH-06) |
| NFR-OPS-08 | Product documentation MUST NOT claim a capability listed as out of scope in §2.3. | P1 | **Defective** | Documentation review at release | `README.md` describes sessions as JWT when they are HMAC-signed cookies (`api/kimi/session.ts:19-26`); `PRD.md` Appendix A marks "OAuth 2.0 + JWT auth", "Read receipts" and "Online presence tracking" as DONE, all three of which are Defective here (FR-AUTH-08/09, FR-MSG-04, FR-PRES-04) |

### 5.6 NFR-A11Y — Accessibility

| ID | Requirement | Pri | Status | Measurement method | Justification |
|---|---|---|---|---|---|
| NFR-A11Y-01 | The application MUST conform to WCAG 2.2 Level AA. | P1 | Unverified | axe-core in CI (zero serious/critical) plus a manual audit of the two live routes | Legal baseline in the EU (EAA, June 2025) and for US public-sector procurement |
| NFR-A11Y-02 | Every interactive control MUST be operable by keyboard alone and MUST expose a visible focus indicator with a contrast ratio of at least 3:1. | P1 | Partial | Manual keyboard traversal of `/` and `/contacts` | Radix primitives supply roles and focus management, but conversation list items are hand-rolled `<button>` elements inside a `ScrollArea` (`src/pages/Chat.tsx:252-305`) with no roving-tabindex, and the message list is not a labelled region |
| NFR-A11Y-03 | All text MUST meet a 4.5:1 contrast ratio against its background (3:1 for text at 18.66 px bold or 24 px). | P1 | Unverified | Automated token-pair contrast check over `tailwind.config.js` and `src/index.css` | The dark glassmorphism palette uses `text-muted-foreground` on translucent `bg-card/50` surfaces (`src/pages/Chat.tsx:206`), where effective contrast depends on what is behind the blur |
| NFR-A11Y-04 | Incoming messages MUST be announced to assistive technology via an `aria-live="polite"` region. | P1 | Missing | Screen-reader test (VoiceOver, NVDA) | The message list has no live region (`src/pages/Chat.tsx`), so a screen-reader user is never told a message arrived |
| NFR-A11Y-05 | Every non-decorative image and icon-only button MUST have an accessible name. | P1 | **Defective** | axe-core rule `button-name` | The chat header's phone, video, search and overflow buttons are icon-only with no `aria-label` (`src/pages/Chat.tsx`), as is the composer's paperclip |
| NFR-A11Y-06 | The interface MUST respect `prefers-reduced-motion` by disabling the typing-indicator bounce and transition animations. | P2 | Missing | Emulated media query in an E2E run | `animate-bounce` on the typing dots (`src/pages/Chat.tsx`) is unconditional |

### 5.7 NFR-COMPAT — Compatibility

| ID | Requirement | Pri | Status | Measurement method | Justification |
|---|---|---|---|---|---|
| NFR-COMPAT-01 | The application MUST function fully on the latest two stable releases of Chrome, Edge and Firefox, and on Safari 16.4 and later, on desktop and mobile. | P1 | Unverified | Playwright matrix across Chromium, Firefox and WebKit; TC-E2E-01…10 on each | Safari 16.4 is the floor because it is the first release supporting Web Push for installed PWAs (FR-NOTIF), and Vite 6's default `baseline-widely-available` target already excludes older engines |
| NFR-COMPAT-02 | The application MUST be usable at viewport widths from 320 px to 2560 px, with the sidebar collapsing to an overlay below 768 px. | P1 | Implemented | Visual regression at 320/375/768/1280/2560 px | `src/pages/Chat.tsx:147-152` (`isMobile` at 768 px) and `:200-207` (overlay transform) |
| NFR-COMPAT-03 | The server MUST run on Node.js 22 LTS or later. | P0 | Implemented | `engines` check in CI | `package.json:94-96`; CI and both Docker stages pin Node 22 (`.github/workflows/ci.yml:14`, `Dockerfile:4,10,22`) |
| NFR-COMPAT-04 | The server MUST run against MySQL 8.0 and 8.4 with `utf8mb4`. | P0 | Partial | Integration suite against both versions | `docker-compose.yml:2` pins `mysql:8.4`; the migration declares no charset (`db/migrations/0000_lumpy_marten_broadcloak.sql`), so behaviour depends on the server default. See FR-MSG-17 |
| NFR-COMPAT-05 | The client MUST degrade to HTTP long-polling when WebSocket is blocked by an intermediary. | P1 | Implemented | Proxy test blocking the `Upgrade` header | `transports: ["websocket", "polling"]` (`src/hooks/useSocket.ts:44`) with Socket.IO's built-in fallback |

### 5.8 NFR-I18N — Internationalisation

| ID | Requirement | Pri | Status | Measurement method | Justification |
|---|---|---|---|---|---|
| NFR-I18N-01 | All user-visible strings MUST be sourced from a message catalogue rather than inlined in components. | P2 | Missing | Lint rule forbidding string literals in JSX text position | Every string is hard-coded in `src/pages/Chat.tsx` and `src/pages/Contacts.tsx` |
| NFR-I18N-02 | Timestamps MUST be rendered in the viewer's local timezone using their locale's conventions. | P1 | **Defective** | Render the same message under `en-US` and `de-DE`, `UTC` and `Asia/Tokyo` | `format(new Date(...), "HH:mm")` (`src/pages/Chat.tsx`) hard-codes a 24-hour pattern for every locale. Use `Intl.DateTimeFormat` |
| NFR-I18N-03 | All timestamps MUST be stored and transmitted in UTC. | P0 | Partial | Column and payload inspection | MySQL `timestamp` normalises to UTC, but the connection string sets no timezone (`api/queries/connection.ts:6`), so `new Date()` values written by the app (`api/conversation-router.ts:251`) depend on the session timezone |
| NFR-I18N-04 | The layout MUST NOT break for right-to-left scripts, and message content MUST render with correct bidirectional isolation. | P2 | Missing | Render Arabic and Hebrew content at 768 px | No `dir` handling and no `unicode-bidi: isolate` on message bodies |

---

## 6. Data requirements

| Topic | Requirement | Status |
|---|---|---|
| **Retention** | Messages retained indefinitely by default, with a per-deployment override (NFR-OPS-06). Soft-deleted messages hard-purged after 30 days. `pending` attachment records purged after 24 h. Application logs retained 30 days. Backups retained 30 days. | Missing — nothing is deleted today |
| **PII inventory** | `users.email` (direct identifier), `users.name`, `users.avatar` (URL to a third-party image host), `users.unionId` (pseudonymous external identifier), `messages.content` (free text, may contain any category of personal data), `message_reads.readAt` and `conversation_participants.lastReadAt` (behavioural — reveals when a person read a message), presence state (behavioural, in-memory only). Full table in `DATA_MODEL.md §7.2`. | Documented |
| **Lawful basis / minimisation** | The system MUST NOT collect any personal data beyond what the IdP returns and what members author. The callback stores exactly `unionId`, `name`, `email`, `avatar` (`api/kimi/auth.ts:75-80`) — conformant. | Implemented |
| **Export** | FR-ADMIN-08. Asynchronous JSON bundle: the member's `users` row; `contacts` rows in both directions; every conversation and participation they belong to; every message they authored; every read receipt they created. | Missing |
| **Erasure** | FR-ADMIN-09. Two-phase: mark deleted and revoke sessions immediately (blocked on FR-SESS-06), purge after 30 days. Cascading purge requires foreign keys (NFR-REL-01). | Missing |
| **Rectification** | Profile fields are refreshed from the IdP on every sign-in (`api/queries/users.ts:11-13`), so correction at the IdP propagates on next sign-in. `users.status` has a default but no procedure to change it. | Partial |
| **Backup** | NFR-REL-06. Nightly logical dump plus binary-log shipping; restore drill rehearsed quarterly and timed against RTO. | Missing — `docker-compose.yml:59-60` declares a bare named volume |
| **Encryption at rest** | Message content is stored as plaintext `text` (`db/schema.ts:66`) and is readable by the operator. Deployments handling regulated data MUST enable storage-level encryption on the MySQL volume. E2EE is out of scope (§2.3). | Documented |
| **Data residency** | Self-hosting means all application data remains on infrastructure the operator controls. The only egress is to the Kimi IdP (§7.1) and to whatever host serves `users.avatar` URLs — the latter is an uncontrolled third-party beacon and SHOULD be proxied (`SEC-C-22`). | Partial |

---

## 7. External interface requirements

### 7.1 Kimi identity provider (OAuth 2.0)

| Aspect | Contract |
|---|---|
| Grant | Authorization code. Implicit and ROPC MUST NOT be used. |
| Configuration | One variable, `VITE_KIMI_AUTH_URL`, holding a bare origin with no path (`.env.example:13`). Endpoint paths derived centrally in `contracts/oauth.ts` (`SEC-C-01`). Because it carries the `VITE_` prefix it is **inlined into the client bundle and is therefore public — it MUST NOT hold a secret** (`Dockerfile:15-18`, NFR-SEC-08). Client credentials: `VITE_APP_ID` (public, inlined at build time) and `APP_SECRET` (server-only). |
| Authorization endpoint | `GET {VITE_KIMI_AUTH_URL}/oauth/authorize` with `client_id`, `redirect_uri`, `response_type=code`, `state`, `code_challenge`, `code_challenge_method=S256`. |
| Token endpoint | `POST {VITE_KIMI_AUTH_URL}/api/oauth/token`, JSON body `{code, client_id, client_secret, grant_type:"authorization_code", redirect_uri, code_verifier}` (`api/kimi/auth.ts:35-50`). |
| Userinfo endpoint | `GET {VITE_KIMI_AUTH_URL}/api/oauth/userinfo` with `Authorization: Bearer <access_token>` (`api/kimi/auth.ts:59-66`). |
| Redirect URI | `{PUBLIC_BASE_URL}/api/oauth/callback`, identical on both legs (FR-AUTH-07), registered with the IdP. |
| Profile mapping | `unionId` ← `unionId ?? id`; `name` ← `name ?? nickname ?? "User"`; `email` ← `email ?? null`; `avatar` ← `avatar ?? null` (`api/kimi/auth.ts:75-80`). |
| Failure modes | Any non-2xx or network failure MUST produce no session (FR-AUTH-11). The IdP is a hard dependency: while it is down, existing sessions continue to work for up to 7 days but no new sign-in is possible. |
| Timeouts | The token and userinfo calls MUST use an explicit 5-second timeout. **Currently unbounded** — bare `fetch` with no `AbortSignal` (`api/kimi/auth.ts:35,59`), so an unresponsive IdP holds a request handler open indefinitely. |

> **UNVERIFIED:** The endpoint paths above are inferred from `api/kimi/auth.ts:36,60` and `src/pages/Login.tsx:7`. No IdP specification exists in the repository and the three code sites disagree with each other (FR-AUTH-06). Confirm against Kimi's published document before implementing `contracts/oauth.ts`.

### 7.2 Object storage for attachments

| Aspect | Contract |
|---|---|
| Protocol | S3-compatible. Reference implementations: MinIO (self-host), Cloudflare R2, AWS S3. |
| Configuration | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`. |
| Access model | Bucket private; no public read (FR-FILE-05). Upload by presigned POST, download by presigned GET, both ≤ 300 s TTL. |
| CORS | The bucket MUST allow `PUT`/`POST` from `PUBLIC_BASE_URL` only. |
| Key scheme | `attachments/{conversationId}/{uuidv7}` — never the client-supplied filename (FR-FILE-08). |
| Status | Not implemented. No S3 client is a dependency (`package.json:24-71`). |

### 7.3 Web Push (VAPID)

| Aspect | Contract |
|---|---|
| Protocol | RFC 8030 Web Push with RFC 8292 VAPID. |
| Configuration | `VAPID_PUBLIC_KEY` (exposed to the client), `VAPID_PRIVATE_KEY` (server-only), `VAPID_SUBJECT` (a `mailto:` URI). |
| Client | Service worker at `/sw.js`; `PushManager.subscribe({userVisibleOnly: true, applicationServerKey})`. |
| Server | `web-push` library; payload ≤ 4 096 bytes (FR-NOTIF-05); 404/410 responses delete the subscription (FR-NOTIF-04). |
| Platform note | Safari/iOS delivers push only for a PWA added to the Home Screen, from iOS 16.4. |
| Status | Not implemented. |

### 7.4 Browser APIs relied upon

| API | Used for | Required | Fallback |
|---|---|---|---|
| WebSocket | Realtime transport | Yes | HTTP long-polling (NFR-COMPAT-05) |
| `fetch` + cookies | tRPC over `httpBatchLink` (`src/providers/trpc.tsx:13`) | Yes | none |
| History API | SPA routing (`react-router`, `src/main.tsx:10`) | Yes | none |
| `window.matchMedia` / `resize` | Responsive breakpoint (`src/pages/Chat.tsx:147-152`) | Yes | none |
| `Intl.DateTimeFormat` | Locale-correct timestamps (NFR-I18N-02) | Yes | none |
| Service Worker + Push + Notifications | FR-NOTIF | No — feature-detect and hide the UI | In-app badge only |
| `IntersectionObserver` | Lazy thumbnails (FR-FILE-09) | No | Eager load |
| `getUserMedia` / `getDisplayMedia` / WebRTC | **Out of scope** (§2.3) | No | n/a |

---

## 8. Constraints and assumptions

### 8.1 Decision of record — persistence

**The system stays on MySQL 8 via Drizzle ORM. Supabase Pro is not provisioned, and nothing in this release depends on it.** No requirement in this document assumes PostgreSQL, Supabase Auth, Supabase Realtime, Supabase Storage, Row Level Security, or any other Supabase capability. Authorization is enforced in application code (FR-CONV-02), not by database policies. Realtime is Socket.IO (FR-MSG-06). Object storage is any S3-compatible endpoint (§7.2). A future migration to Postgres/Supabase is a **gated** decision that has not been taken; any design that presupposes it MUST be rejected in review.

### 8.2 Technical constraints

| # | Constraint |
|---|---|
| C-1 | Node.js ≥ 22 (`package.json:94-96`); ESM only (`"type": "module"`). |
| C-2 | The server is bundled to a single file by esbuild (`package.json:10`), so no runtime `require` of a dynamic path is permissible. |
| C-3 | `VITE_`-prefixed variables are inlined into the client bundle at build time (`Dockerfile:14-18`) and are therefore public by construction. Secrets MUST NOT use that prefix (FR-AUTH-12). |
| C-4 | tRPC uses `superjson` on both ends (`api/middleware.ts:5`, `src/providers/trpc.tsx:13`); any transport change must preserve `Date` fidelity. |
| C-5 | Socket.IO is served on the same origin at `/socket.io` and proxied in dev (`vite.config.ts:21-25`); the path is fixed by `api/socket.ts:27`. |
| C-6 | Port contract: dev client 3000, dev API 3001, prod 3000 — mirrored in `contracts/constants.ts:17-19` and `vite.config.ts:15-20` and guarded by TC-REG-09. |
| C-7 | Identity is entirely delegated to Kimi: there is no local password, no email verification, and no sign-up flow. If the IdP is unreachable, no new member can join. |
| C-8 | MySQL `timestamp` columns as generated have 1-second resolution (`db/migrations/0000_lumpy_marten_broadcloak.sql`), which constrains message ordering (FR-MSG-11). |

### 8.3 Reference deployment (the target of every NFR measurement)

Single host, 4 vCPU / 8 GB RAM. One app container and one MySQL 8.4 container from `docker-compose.yml`. TLS terminated by a reverse proxy setting `x-forwarded-proto`. Up to 200 members, up to 50 concurrent sockets. No Redis, no read replica, no CDN.

### 8.4 Assumptions

| # | Assumption | If false |
|---|---|---|
| A-1 | Kimi issues a stable, unique `unionId` per human that never changes or is reassigned. | Identity collisions or account takeover via `users.unionId` UNIQUE (`db/schema.ts:15`). |
| A-2 | Kimi supports `state` and PKCE S256. | FR-AUTH-08/09 cannot be satisfied and the OAuth flow remains CSRF-exposed. |
| A-3 | Deployments terminate TLS in front of the app and set `x-forwarded-proto`. | Cookie `Secure` derivation (`api/kimi/session.ts:41`) is wrong — moot today because that helper is dead code (FR-SESS-10). |
| A-4 | Members' clocks may be arbitrarily skewed; the server clock is authoritative. | Session expiry (`api/kimi/session.ts:36`) is server-evaluated, so this holds. |
| A-5 | The deployment is single-tenant; every member may legitimately discover that every other member exists. | FR-CONT-05/07 and FR-PRES-04 become materially more severe, not less. |
| A-6 | `alice.pdf` (11.5 MB, repo root) and `src/pages/Home.tsx` (unreferenced by `src/App.tsx:10-17`) are historical artefacts with no requirements attached. | — |

---

## 9. Release acceptance criteria

The release is **done** when all of the following hold. Each maps to requirements above; none is subjective.

**Buildable**

1. `git clone && npm ci && npm run validate` exits 0 on a machine with no prior state — NFR-OPS-01, NFR-OPS-02 (every build input tracked in git).
2. `docker compose up` with only `.env` supplied reaches a healthy app container in ≤ 120 s, having applied migrations — NFR-OPS-07, NFR-OPS-05.
3. `drizzle-kit generate` reports no pending diff — TC-DATA-10.
4. CI is green on `main` and runs typecheck, test, lint and build — `.github/workflows/ci.yml:16-20`.

**Usable**

5. Two members in two browsers complete: sign in → find each other → send a request → accept → open a DM → exchange messages live in < 1 s → see typing indicators → see accurate read receipts → see the conversation move to the top of the sidebar → see an unread badge when the tab is not focused → sign out — TC-E2E-01…10, FR-CONV-05, FR-CONV-07, FR-MSG-04.
6. Every P0 requirement is **Implemented**. No P0 remains Defective or Missing.
7. Every P1 requirement is Implemented, or is Partial with a written, accepted deviation recorded in the PR that closes it.
8. No control in the UI is inert: any button without a handler is either wired or removed — currently the paperclip, phone, video, search, "View Profile", "Mute Notifications" and "Block User" controls in `src/pages/Chat.tsx` are all stubs.

**Correct**

9. All `TEST_PLAN.md` cases pass, including the ones currently expected red: TC-CONV-02, TC-CONV-04, TC-MSG-14, TC-MSG-19, TC-CONT-03, TC-CONT-18, TC-E2E-07.
10. Unit + integration coverage ≥ 80 % of `api/`, and ≥ 85 % of `api/socket.ts` — `TEST_PLAN.md §2.1`.
11. Every `SEC-C-*` control rated **S1** in `SECURITY.md §13` is implemented and has a test asserting it.

**Safe**

12. A member cannot read, write, or infer the existence of any conversation, message, read receipt or presence state they are not entitled to — FR-CONV-02, FR-MSG-05, FR-PRES-04, NFR-SEC-05.
13. Every write surface is rate limited and returns a documented rejection — NFR-SEC-07.
14. Sign-in works from the values in `.env.example` on a fresh checkout, with `state` and PKCE — FR-AUTH-06…09.
15. Production responses carry the full security header set and the session cookie is `Secure` and `__Host-` prefixed — NFR-SEC-06, FR-SESS-02, FR-SESS-03.

**Honest**

16. `README.md`, `PRD.md` Appendix A and all UI copy accurately reflect §2.3 — no claim of E2EE, calling, federation or native mobile — NFR-OPS-08.

---

## 10. Requirements summary

### 10.1 Functional requirements by area and status

| Area | Implemented | Partial | Missing | Defective | Total | P0 | P1 | P2 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| FR-AUTH | 7 | 1 | 2 | 2 | 12 | 12 | 0 | 0 |
| FR-SESS | 3 | 0 | 5 | 2 | 10 | 4 | 3 | 3 |
| FR-CONV | 4 | 0 | 8 | 3 | 15 | 9 | 4 | 2 |
| FR-MSG | 4 | 3 | 8 | 4 | 19 | 9 | 6 | 4 |
| FR-CONT | 3 | 0 | 5 | 6 | 14 | 6 | 8 | 0 |
| FR-PRES | 3 | 1 | 3 | 2 | 9 | 5 | 3 | 1 |
| FR-FILE | 0 | 0 | 10 | 0 | 10 | 2 | 7 | 1 |
| FR-NOTIF | 0 | 0 | 9 | 0 | 9 | 0 | 2 | 7 |
| FR-ADMIN | 1 | 1 | 8 | 1 | 11 | 1 | 4 | 6 |
| **Total FR** | **25** | **6** | **58** | **20** | **109** | **48** | **37** | **24** |

### 10.2 Non-functional requirements by area and status

| Area | Implemented | Partial | Missing | Defective | Unverified | Total | P0 | P1 | P2 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| NFR-PERF | 0 | 1 | 0 | 2 | 5 | 8 | 1 | 7 | 0 |
| NFR-SEC | 0 | 1 | 3 | 8 | 0 | 12 | 10 | 2 | 0 |
| NFR-REL | 2 | 1 | 1 | 1 | 2 | 7 | 2 | 5 | 0 |
| NFR-SCALE | 1 | 0 | 1 | 1 | 2 | 5 | 1 | 4 | 0 |
| NFR-OPS | 2 | 2 | 1 | 3 | 0 | 8 | 5 | 3 | 0 |
| NFR-A11Y | 0 | 1 | 2 | 1 | 2 | 6 | 0 | 5 | 1 |
| NFR-COMPAT | 3 | 1 | 0 | 0 | 1 | 5 | 2 | 3 | 0 |
| NFR-I18N | 0 | 1 | 2 | 1 | 0 | 4 | 1 | 1 | 2 |
| **Total NFR** | **8** | **8** | **10** | **17** | **12** | **55** | **22** | **30** | **3** |

"Unverified" applies only to NFR budgets that are stated and measurable but have never been measured against the reference deployment (§8.3). No functional requirement is Unverified — every FR status was read from source.

### 10.3 Combined position

| Status | Count | Share |
|---|---:|---:|
| Implemented | 33 | 20.1 % |
| Partial | 14 | 8.5 % |
| Missing | 68 | 41.5 % |
| Defective | 37 | 22.6 % |
| Unverified (NFR budgets never measured) | 12 | 7.3 % |
| **Total** | **164** | **100 %** |

| Priority | Count | Not yet met | Met |
|---|---:|---:|---:|
| P0 | 70 | 42 | 28 |
| P1 | 67 | 62 | 5 |
| P2 | 27 | 27 | 0 |
| **Total** | **164** | **131** | **33** |

### 10.4 The 42 P0 requirements not yet met — the release-blocking set

| ID | One-line gap | Status |
|---|---|---|
| FR-AUTH-06 | OAuth base URL read three incompatible ways; sign-in broken from `.env.example` | Defective |
| FR-AUTH-07 | `redirect_uri` differs between client and server behind the dev proxy | Defective |
| FR-AUTH-08 | No OAuth `state` | Missing |
| FR-AUTH-09 | No PKCE | Missing |
| FR-AUTH-12 | Nothing enforces that secrets stay out of the client bundle | Partial |
| FR-SESS-02 | Session cookie has no `Secure` flag | Defective |
| FR-CONV-01 | Duplicate DM created when the pair already shares a group | Defective |
| FR-CONV-05 | Sidebar ordered by creation time, not recency | Defective |
| FR-CONV-08 | Conversations accept non-existent user ids | Missing |
| FR-CONV-09 | Blocking never enforced on conversation creation | Missing |
| FR-CONV-10 | `participantIds` uncapped | Missing |
| FR-MSG-01 | 4 000-char cap unenforced on the socket path the UI actually uses | Defective |
| FR-MSG-04 | Read receipts returned only for the first message of each page | Defective |
| FR-MSG-05 | `message.markAsRead` performs no authorization at all | Defective |
| FR-MSG-08 | tRPC `message.send` emits no realtime event | Missing |
| FR-MSG-09 | `conversations.updatedAt` never written | Missing |
| FR-CONT-05 | 1-character directory search enumerates the member list | Defective |
| FR-CONT-06 | No minimum query length | Missing |
| FR-CONT-07 | Search returns email for arbitrary members | Defective |
| FR-PRES-04 | Presence broadcast to every connected member | Defective |
| FR-PRES-05 | Full online-user list handed to every new socket | Defective |
| FR-FILE-05 | Attachment download not participant-scoped (attachments unimplemented) | Missing |
| FR-FILE-07 | Arbitrary `fileUrl` accepted and persisted today | Missing |
| FR-ADMIN-11 | Health endpoint reports healthy with a dead connection pool | Partial |
| NFR-PERF-03 | Delivery latency never measured | Unverified |
| NFR-SEC-01 | No `state`, no PKCE | Missing |
| NFR-SEC-02 | Interpolated SQL at `api/message-router.ts:68` | Defective |
| NFR-SEC-03 | Socket payloads unvalidated at runtime | Defective |
| NFR-SEC-04 | Session cookie transmissible over cleartext HTTP | Defective |
| NFR-SEC-05 | Three enumeration oracles; five different authz failure shapes | Defective |
| NFR-SEC-06 | No security headers; no CORS allowlist | Missing |
| NFR-SEC-07 | No rate limiting anywhere | Missing |
| NFR-SEC-08 | A 1-character `JWT_SECRET` starts the server | Defective |
| NFR-SEC-10 | `auth.me` returns `unionId` and `role`; search returns email | Defective |
| NFR-SEC-12 | Lockfile untracked; no advisory gate | Partial |
| NFR-REL-01 | Zero foreign keys, one unique key in the entire schema | Defective |
| NFR-SCALE-01 | Multi-node deployment silently drops messages | Defective |
| NFR-OPS-02 | Six build-critical files untracked in git | Defective |
| NFR-OPS-05 | Migrations exist but are untracked; `db:push` still available | Partial |
| NFR-OPS-07 | Compose stack works but its files are untracked and sign-in is broken | Partial |
| NFR-COMPAT-04 | `utf8mb4` not pinned in the migration | Partial |
| NFR-I18N-03 | Connection timezone not pinned | Partial |

The remaining 28 P0 requirements are already met and MUST NOT regress: FR-AUTH-01…05, FR-AUTH-10, FR-AUTH-11, FR-SESS-01, FR-SESS-04, FR-SESS-05, FR-CONV-02, FR-CONV-03, FR-CONV-04, FR-CONV-06, FR-MSG-02, FR-MSG-06, FR-MSG-07, FR-MSG-18, FR-CONT-01, FR-CONT-02, FR-CONT-03, FR-PRES-01, FR-PRES-02, FR-PRES-03, NFR-REL-07, NFR-OPS-01, NFR-OPS-04, NFR-COMPAT-03. Each has a passing `TC-*` case in `TEST_PLAN.md`; those cases are the regression suite.
