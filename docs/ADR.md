# Alice Chains — Architecture Decision Records

**Repo:** `Mangu-Platforms/alice_chains` · **Working tree:** `main` @ `3999bca` with the stabilization changes applied
**Companions:** `SRS.md` (requirement IDs) · `DATA_MODEL.md` · `API_CONTRACT.md` · `SECURITY.md` · `TEST_PLAN.md` · `TECH_SPEC.md`

Every claim about existing behaviour cites `file.ts:LINE`. Anything not read from source is marked `> **UNVERIFIED:**`.

| ADR | Title | Status | Date |
|---|---|---|---|
| [ADR-001](#adr-001--keep-mysql-8-for-this-release-supabasepostgres-is-a-gated-future-migration) | Keep MySQL 8 for this release; Supabase/Postgres is a gated future migration | Accepted | 2026-08-12 |
| [ADR-002](#adr-002--signed-hmac-session-cookie-rather-than-jwt) | Signed HMAC session cookie rather than JWT | Accepted | 2026-08-12 |
| [ADR-003](#adr-003--socketio-as-the-realtime-transport) | Socket.IO as the realtime transport | Accepted | 2026-08-12 |
| [ADR-004](#adr-004--trpc-as-the-api-layer-and-the-absence-of-a-language-agnostic-public-api) | tRPC as the API layer, and the absence of a language-agnostic public API | Accepted | 2026-08-12 |
| [ADR-005](#adr-005--drizzle-migrations-are-canonical-dbpush-is-scratch-only) | Drizzle migrations are canonical; `db:push` is scratch-only | Accepted | 2026-08-12 |
| [ADR-006](#adr-006--single-process-deployment-now-redis-adapter-when-horizontal-scaling-is-needed) | Single-process deployment now; Redis adapter when horizontal scaling is needed | Accepted | 2026-08-12 |
| [ADR-007](#adr-007--realtime-writes-go-through-socketio-while-trpc-owns-reads) | Realtime writes go through Socket.IO while tRPC owns reads | Accepted (with a mandated target state) | 2026-08-12 |
| [ADR-008](#adr-008--defer-e2eemls-until-phase-2-ships) | Defer E2EE/MLS until Phase 2 ships | Accepted | 2026-08-12 |
| [ADR-009](#adr-009--s3-compatible-object-storage-via-an-env-selected-driver-minio-for-local) | S3-compatible object storage via an env-selected driver; MinIO for local | Accepted | 2026-08-12 |
| [ADR-010](#adr-010--retain-the-monorepo-in-one-package-layout) | Retain the monorepo-in-one-package layout | Accepted | 2026-08-12 |
| [ADR-011](#adr-011--one-shared-zod-contract-per-wire-message-in-contracts) | One shared Zod contract per wire message, in `contracts/` | Accepted | 2026-08-12 |
| [ADR-012](#adr-012--stop-bundling-node-dependencies-into-the-server-artefact) | Stop bundling node dependencies into the server artefact | Proposed | 2026-08-12 |
| [ADR-013](#adr-013--same-origin-deployment-client-and-api-on-one-origin) | Same-origin deployment: client and API on one origin | Accepted | 2026-08-12 |
| [ADR-014](#adr-014--superjson-on-trpc-iso-strings-on-socketio) | superjson on tRPC, ISO strings on Socket.IO | Accepted | 2026-08-12 |
| [ADR-015](#adr-015--server-assigned-auto_increment-id-is-the-ordering-and-recovery-cursor) | Server-assigned `AUTO_INCREMENT` id is the ordering and recovery cursor | Accepted | 2026-08-12 |

---

## ADR-001 — Keep MySQL 8 for this release; Supabase/Postgres is a gated future migration

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `SRS.md §8.1` (decision of record), `NFR-COMPAT-04`, `NFR-REL-01`, `NFR-SEC-09`

### Context

Supabase Pro is **not provisioned**. There is no project, no connection string, no budget line. Meanwhile the entire persistence layer is MySQL-specific, and not shallowly so:

| Coupling | Evidence |
|---|---|
| Drizzle dialect | `drizzle.config.ts:14` — `dialect: "mysql"`; `db/schema.ts:1-10` imports exclusively from `drizzle-orm/mysql-core` |
| Driver | `mysql2/promise` pool, `drizzle(pool, { schema, mode: "default" })` — `api/queries/connection.ts:1-7` |
| Column types | `serial`, `mysqlEnum`, `bigint({unsigned:true})`, `timestamp` with `defaultNow()` — `db/schema.ts:13-103` |
| Baseline DDL | `serial AUTO_INCREMENT`, `enum('pending','accepted','blocked')`, `bigint unsigned` — `db/migrations/0000_lumpy_marten_broadcloak.sql:1-67` |
| MySQL-only query API | `.onDuplicateKeyUpdate()` at `api/queries/users.ts:11` and `api/contact-router.ts:103-105` |
| Insert-result shape | `Number(result.insertId)` at `api/conversation-router.ts:205,232`, `api/message-router.ts:125`, `api/socket.ts:116` — MySQL returns `insertId`; Postgres requires `RETURNING` |
| Deployment | `mysql:8.4` container plus a `drizzle-kit migrate` job — `docker-compose.yml:2-32` |
| Test infrastructure | MySQL 8 service container in every CI job — `TEST_PLAN.md §8` |

The system also does not use any capability Supabase would provide. Authorization is enforced in application code at `api/middleware.ts:9-12`, `api/conversation-router.ts:113-124` and `api/socket.ts:56-63` — not by row-level security. Realtime is Socket.IO. Object storage (`SRS.md §7.2`) is S3-compatible and provider-neutral. Auth is Kimi OAuth, not Supabase Auth.

### Decision

**Ship this release on MySQL 8.** No requirement in `SRS.md` assumes PostgreSQL, Supabase Auth, Supabase Realtime, Supabase Storage or Row Level Security. Any design that presupposes a migration **must be rejected in review** (`SRS.md §8.1`).

Corollary: nothing in Phase 1 or Phase 2 (`TECH_SPEC.md §14`) may be justified as "preparation for Postgres". Portability is not a goal of this release.

### Consequences

**Positive.** No migration risk on the critical path to a shippable product. `NFR-REL-01`'s foreign-key and unique-key work (`DATA_MODEL.md §3.5`) proceeds against a known dialect. The reference deployment stays two containers (`SRS.md §8.3`), which is what "self-hostable" demands. `docker compose up` remains the whole install story.

**Negative.** MySQL 8 carries constraints that appear directly in the requirements: `timestamp` at 1-second resolution constrains message ordering (`SRS.md` C-8, `FR-MSG-11`); `utf8mb4` must be pinned explicitly or emoji are silently mangled (`FR-MSG-17`, the baseline DDL declares no charset); the `contacts` state machine leans on `ON DUPLICATE KEY UPDATE` rather than a richer upsert; and self-hosters must operate MySQL rather than consume a managed service.

**Neutral.** Every MySQL-ism above is a *known, enumerated* coupling. That enumeration is itself the deliverable of this ADR — a future migration starts from this list rather than from discovery.

### Costed migration path, if the triggers below ever fire

Estimates assume the Phase 1 codebase (post-`0001_constraints`), one engineer.

| # | Work item | Detail | Effort |
|---|---|---|---|
| M-1 | Schema rewrite | `db/schema.ts` from `mysql-core` to `pg-core`. `serial` → `bigserial`/`identity`; `bigint unsigned` → `bigint` (Postgres has **no unsigned integers** — every FK column in `db/schema.ts:52,53,64,65,69,84,85,94,95` changes domain, and negative values become representable where they previously were not); `mysqlEnum` → a native `CREATE TYPE … AS ENUM` or a `text` + `CHECK`; `boolean` maps cleanly; `text` maps cleanly | M |
| M-2 | Enum semantics | MySQL enums are per-column and mutable by `ALTER TABLE … MODIFY`. Postgres enums are **schema-level types**; adding a value is `ALTER TYPE … ADD VALUE` (non-transactional before PG 12, and still not reversible). The three enums are `users.role`, `conversations.type`, `messages.type`, `contacts.status` (`db/schema.ts:20,36,67,96`) | S |
| M-3 | Upsert rewrite | `.onDuplicateKeyUpdate({set})` → `.onConflictDoUpdate({target, set})`. Two call sites: `api/queries/users.ts:11-13`, `api/contact-router.ts:103-105`. **Semantics differ:** MySQL conflicts on *any* unique key; Postgres requires an explicit conflict target. `upsertUser` relies on the implicit `users.unionId` unique key (`db/migrations/0000_lumpy_marten_broadcloak.sql:66`) and must name it | S |
| M-4 | Insert-result rewrite | `Number(result.insertId)` at four call sites → `.returning({id})`. Postgres `RETURNING` is strictly better (it returns the whole row), so this also removes the re-`SELECT` after insert at `api/socket.ts:119-123` — a latency win, not just a port | S |
| M-5 | Timestamp semantics | MySQL `timestamp` stores UTC and converts on read using the session timezone (`api/queries/connection.ts:6` sets none — `NFR-I18N-03`, Partial). Postgres `timestamptz` stores an absolute instant; `timestamp` (without tz) does not. Choose `timestamptz` everywhere and audit every `new Date()` write site (e.g. `api/conversation-router.ts:251`). Default precision also changes: MySQL defaults to 0 fractional digits, Postgres to microseconds — which incidentally **fixes `FR-MSG-11`** | M |
| M-6 | Migration chain | `db/migrations/**` is MySQL SQL end to end (`DATA_MODEL.md §4.4`). Squash to a new Postgres baseline; the existing journal cannot be replayed | M |
| M-7 | Driver + pool | `mysql2` → `postgres`/`pg`; `drizzle-orm/mysql2` → `drizzle-orm/node-postgres`. Pool option names differ (`connectionLimit` → `max`) — see `TECH_SPEC.md §11.4` | S |
| M-8 | Data transfer | Dump, type-map, load, reconcile. Emoji/`utf8mb4` and enum values need verification. Requires a maintenance window proportional to `messages` row count | M–L |
| M-9 | Test + CI | Every integration and E2E job runs a MySQL service container (`TEST_PLAN.md §8`); swap the image and the DSN, then re-verify every `TC-DATA-*` | M |
| M-10 | Docs + compose | `docker-compose.yml`, `.env.example`, `README.md`, `DATA_MODEL.md`, `SRS.md §8`, this ADR | S |
| **If Supabase specifically** | Additional | RLS policies would duplicate the application authorization of `FR-CONV-02` — **do not** enable RLS without deciding which layer is authoritative; two enforcement points that disagree is worse than one. Supabase Realtime does not replace Socket.IO (no room semantics, no ack channel, no typing relay). PgBouncer transaction pooling breaks prepared statements and session-level settings | M–L |

**Total: 6–10 engineer-weeks including the data cutover and re-verification.** Roughly two-thirds of that is M-8 and M-9 — moving and re-proving data, not writing code.

### Trigger conditions that would justify migrating

Migration is justified only if **one** of these becomes true, and even then it competes against every Phase 2 item:

| # | Trigger | Rationale |
|---|---|---|
| T-1 | A funded product requirement needs a Postgres-only capability — full-text search with ranking (`tsvector`), `pgvector` for semantic search, `LISTEN/NOTIFY`, or partial/expression indexes | These are the only capabilities MySQL 8 genuinely cannot approximate at this scale. Note that `SRS.md §2.3` puts full-text search out of scope for this release |
| T-2 | Supabase Pro is provisioned **and** the operator's target audience wants managed hosting rather than self-hosting | Would contradict `SRS.md §2.1`'s positioning; requires a product decision first, not a technical one |
| T-3 | Multi-tenancy with per-tenant data isolation becomes a requirement | RLS is a materially better fit than application-level filtering. `SRS.md §2.3` currently lists multi-tenancy as unscheduled |
| T-4 | MySQL becomes an operational liability that Postgres would not be — measured, not assumed | Requires evidence from `TECH_SPEC.md §10.3` metrics. Nothing at reference scale (≤200 members, ≤50 sockets) will produce it |

**Not triggers:** developer preference; "Postgres is better"; a desire to use Supabase Auth (identity is delegated to Kimi — `SRS.md` C-7); a desire to use Supabase Realtime (see ADR-003).

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Migrate now, before feature work** | Supabase is not provisioned. 6–10 weeks against 42 unmet P0 requirements (`SRS.md §10.4`) with no user-visible benefit. It would also mean rewriting `0001_constraints` — the single highest-value migration in the backlog — in a dialect nobody has tested |
| **Dual-dialect abstraction (support both)** | Drizzle's dialect modules are not interchangeable; the schema file itself imports a dialect. Every query using `onDuplicateKeyUpdate` or `insertId` would need two branches, doubling the test matrix for zero present benefit. The server bundle already drags in `drizzle-orm/pg-core` (7 modules — `TECH_SPEC.md §9.2`) as dead weight; making that real would be worse |
| **SQLite for self-hosters, MySQL for hosted** | Attractive for a single-binary story, but SQLite's single-writer model conflicts with concurrent message writes, and it would fragment the migration chain and the test matrix in exactly the way the dual-dialect option does |
| **Postgres without Supabase** | Same 6–10 week cost, and forfeits T-2's only justification (managed hosting). If migration ever happens, it should be triggered by a capability need (T-1), and at that point Supabase-vs-plain-Postgres is a separate decision |

---

## ADR-002 — Signed HMAC session cookie rather than JWT

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `FR-AUTH-01`, `FR-AUTH-03`, `FR-SESS-01…10`, `NFR-SEC-04`, `NFR-SEC-08`

### Context

The session token is constructed and verified in 20 lines:

```ts
// api/kimi/session.ts:19-38
function signature(payload: string) {
  return createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
}
export function createSessionToken(session: Omit<SessionData, "iat">) {
  const payload = encode(JSON.stringify({ ...session, iat: Date.now() }));
  return `${payload}.${signature(payload)}`;
}
export function verifySessionToken(token: string): SessionData | undefined { … }
```

Verified properties:

| Property | Evidence |
|---|---|
| Format | `base64url(JSON) "." base64url(HMAC-SHA256(payload))` — **two** segments, not three | `api/kimi/session.ts:24-25` |
| No JOSE header, no `alg` field | the payload is the session object plus `iat` | `api/kimi/types.ts:9-15` |
| No JWT library | `jose`/`jsonwebtoken` absent from `package.json:24-93` | — |
| Constant-time comparison with a length guard | `api/kimi/session.ts:32-34` |
| Absolute 7-day expiry from `iat`, server-evaluated | `api/kimi/session.ts:36`, `contracts/constants.ts:7` |
| Payload is **not** trusted for authorization | `api/kimi/auth.ts:13-15` re-reads the user by `unionId` on every request — `FR-SESS-04` |
| Cookie | `alice_session; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` — **no `Secure`** | `api/kimi/auth.ts:102` |

The claim "these are JWTs" appears in `README.md:13,20` and `info.md:12`, and in the variable name `JWT_SECRET` (`api/lib/env.ts:8`). All are wrong.

### Decision

1. **Keep the HMAC-signed envelope.** Do not adopt JWT.
2. **Rename the concept and the variable.** `JWT_SECRET` → `SESSION_SECRET`, with a backwards-compatible dual-read across three releases (`TECH_SPEC.md §8.5`). The secret *value* does not change, so no session is invalidated.
3. **Correct the documentation** in the same PR — `README.md:13,20`, `info.md:12` (`NFR-OPS-08`).
4. **Keep the payload advisory.** Authorization reads only `unionId`, and the identity is re-read from the database every request (`FR-SESS-04`). This is the property that makes the format's simplicity safe, and it must not be optimised away without the caching prerequisite in `TECH_SPEC.md §12.2` N-7.

### Consequences

**Positive.** The whole scheme is auditable in one screen, with no algorithm negotiation, no `alg: none` class of bug, no key-set fetching, and one dependency-free primitive (`node:crypto`). Because the payload is advisory, a stolen cookie grants exactly the permissions the *current database row* grants — deactivating a user takes effect on the next request without touching the token (once `FR-ADMIN-05` exists).

**Negative.**

| Consequence | Detail | Tracked as |
|---|---|---|
| No revocation | The token is self-contained. `/api/logout` clears only the caller's cookie (`api/boot.ts:19-22`); a copied cookie stays valid for the full 7 days | `FR-SESS-06`, `SEC-C-05` |
| No standard tooling | No off-the-shelf introspection, no jwt.io debugging, no third-party resource server can validate it | accepted |
| Payload is readable, not encrypted | base64url of plain JSON containing `userId`, `unionId`, `name`, `email` (`api/kimi/types.ts:9-15`). Anyone with the cookie can read them — but they already hold the credential, so this leaks nothing they could not obtain from `auth.me` | accepted |
| No key rotation today | One key, read at `api/kimi/session.ts:20`. Rotation logs everyone out | `SECURITY.md §10` item 4 |
| No idle timeout, no payload version | Only absolute expiry exists | `FR-SESS-07`, `FR-SESS-08` |
| The name has already misled | `README.md:13,20`, `info.md:12`, and (per `SRS.md` NFR-OPS-08) `PRD.md` Appendix A marking "OAuth 2.0 + JWT auth" DONE | `NFR-OPS-08`, gap G-13 |

`PRD.md` and `ROADMAP.md` are present at `docs/PRD.md` and `docs/ROADMAP.md`, and every `SRS.md` citation into them resolves — `PRD.md` Table 5 (performance targets) and Appendix A (the "DONE" checklist) both exist. `README.md:13,20` and `info.md:12` were read directly and do say "JWT sessions".

**Required hardening, unchanged by this ADR** (each already has an ID): `Secure` + `__Host-` prefix (`FR-SESS-02/03`, `SEC-C-07`); minimum 32-byte secret (`NFR-SEC-08` — `z.string().min(1)` at `api/lib/env.ts:8` means `"a"` is a valid signing key today); collapse the three cookie implementations to one (`FR-SESS-10` — `getSessionCookieOptions` is defined identically twice, at `api/kimi/session.ts:40-51` and `api/lib/cookies.ts:4-15`, and **neither is ever called**); dual-key verification for rotation.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **JWT (HS256)** | Identical security properties to what exists, plus a dependency, plus `alg` confusion risk, plus a migration that would invalidate every live session. The only real gain — third-party validation — has no consumer (ADR-004: there is no public API) |
| **JWT (RS256/EdDSA)** | Asymmetric keys matter when a party must verify without being able to mint. There is exactly one verifier, and it is the minter. Pure overhead |
| **Opaque random token + server-side session store** | The genuinely better design for revocation (`FR-SESS-06`) and idle timeout (`FR-SESS-07`) — but it requires a store. Redis contradicts the two-container reference deployment (`SRS.md §8.3`); a MySQL `sessions` table adds a write on every request unless cached. **Deferred to `TECH_SPEC.md §15` Q-4**, whose recommendation is a `users.sessionEpoch` counter — global revocation for the cost of one column, keeping the stateless token |
| **Encrypted cookie (AEAD, e.g. `iron-session`)** | Hides `unionId`/`email` from the holder, but the holder already has the credential. Adds a dependency and key management for no threat actually closed |
| **Keep the name `JWT_SECRET`** | Cheapest option, and the reason to reject it is concrete: a reviewer who believes these are JWTs will reason about the wrong threat model — reaching for a JWT library that will fail, assuming `exp`/`aud`/`nbf` semantics that do not exist, and auditing for `alg` attacks that do not apply while missing that there is no revocation at all |

---

## ADR-003 — Socket.IO as the realtime transport

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `FR-MSG-06`, `FR-MSG-07`, `FR-PRES-01…08`, `NFR-COMPAT-05`, `NFR-SCALE-01`, `NFR-SCALE-05`

### Context

Socket.IO 4.8.3 is already the transport, on both ends (`package.json:64-65`). It is mounted at `/socket.io` on the same `http.Server` as the API (`api/socket.ts:27`, `api/boot.ts:64-72`) and proxied in dev with `ws: true` (`vite.config.ts:21-25`).

Features the application actively uses:

| Feature | Use | Evidence |
|---|---|---|
| Rooms | `conv_{id}` for message fan-out, `user_{id}` for per-member notification | `api/socket.ts:49,67,127,141` |
| Targeted emit including/excluding sender | `io.to()` includes the sender (`newMessage`); `socket.to()` excludes (`userTyping`, `messagesRead`) — the distinction is load-bearing and is asserted by `TEST_PLAN.md §2.2` item 3 | `api/socket.ts:127,177,192` |
| Handshake middleware | Cookie auth before any handler runs; identity from `socket.data.userId`, never from a payload | `api/socket.ts:30-39,44` |
| Bidirectional named events | 5 client→server, 8 server→client | `API_CONTRACT.md §3.3`, `§3.4` |
| Automatic reconnection with backoff | client default | `src/hooks/useSocket.ts:42-46` |
| Transport fallback to HTTP long-polling | `transports: ["websocket","polling"]` | `src/hooks/useSocket.ts:44` — satisfies `NFR-COMPAT-05` |
| Multi-tab correctness | `Map<userId, Set<socketId>>` with a `wasOffline` guard | `api/socket.ts:11,46,51` — `FR-PRES-01/02` |

### Decision

**Keep Socket.IO.** Add `@socket.io/redis-adapter` when horizontal scaling is required (ADR-006), not before.

Constrain future work: the path `/socket.io` and the room names `conv_{id}` / `user_{id}` are part of the public contract; renaming either is a breaking change (`API_CONTRACT.md §6.1`).

### Consequences

**Positive.** Rooms, acks, reconnection, multiplexing and polling fallback are solved and tested upstream. Reimplementing rooms and reconnect over raw WebSocket is where most of a bespoke realtime layer's bugs live. The adapter interface gives a defined, low-effort path to multi-node (`TECH_SPEC.md §3.5`) — a raw-WebSocket implementation would need a bespoke pub/sub layer written and tested from scratch.

**Negative.**

| Consequence | Detail |
|---|---|
| Protocol overhead | Socket.IO frames wrap the payload; not a factor at reference scale |
| Bundle cost | `engine.io` 15 modules + `ws` 13 + `socket.io` 9 + parsers on the server (`TECH_SPEC.md §9.2`); `socket.io-client` on the client, currently loaded even on `/login` where no socket is possible (`TECH_SPEC.md §9.3` B-2) |
| Non-standard protocol | Only a Socket.IO client can connect. A future mobile or CLI client must use a Socket.IO SDK (they exist for Swift, Kotlin, Java, Python, Go, Rust) |
| Sticky sessions required for multi-node | Because polling fallback is enabled and required by `NFR-COMPAT-05`. The Redis adapter does **not** remove this — see ADR-006 |
| No built-in schema validation | TypeScript annotations are erased at runtime; **no socket handler validates anything** (`api/socket.ts:66,71,78-85,157,190`) — `NFR-SEC-03` Defective, fixed by ADR-011 |
| Acks are unused | Socket.IO supports per-emit callbacks; the codebase uses none, which is part of why delivery is at-most-once (`TECH_SPEC.md §6.1`) |

### Alternatives considered

| Alternative | Assessment |
|---|---|
| **Raw WebSocket (`ws`)** | Smaller and standards-pure, but rooms, reconnection with backoff, heartbeats, multiplexing, polling fallback and cross-node fan-out all become application code. `NFR-COMPAT-05` alone (polling fallback for restrictive intermediaries) would have to be written by hand. The saving is bundle size; the cost is the highest-risk code in the system |
| **Server-Sent Events + POST** | SSE is unidirectional. The client→server channel (`typing`, `markAsRead`, `joinConversation`, `sendMessage`) would ride separate HTTP requests, doubling the moving parts and adding per-event connection overhead. SSE also caps at ~6 connections per origin on HTTP/1.1, which multi-tab members would hit. It does reconnect natively with `Last-Event-ID` — a real advantage for the recovery design of `TECH_SPEC.md §5.4` — but not enough to outweigh being half a transport |
| **Long polling only** | Higher latency and more connections. Socket.IO already provides it as a fallback |
| **WebTransport / HTTP-3 datagrams** | Insufficient browser support for `NFR-COMPAT-01`'s matrix (Safari 16.4 floor) |
| **A hosted realtime service (Pusher, Ably, Supabase Realtime)** | Directly contradicts `SRS.md §2.1` — self-hostable, no data leaving operator infrastructure. Message content would transit a third party. Non-starter |

---

## ADR-004 — tRPC as the API layer, and the absence of a language-agnostic public API

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `FR-AUTH-04`, `FR-CONV-*`, `FR-MSG-*`, `FR-CONT-*`, `SRS.md` C-4, `API_CONTRACT.md §6.2`

### Context

tRPC v11.18.0 with superjson, on the fetch adapter, mounted at `/api/trpc/*`:

```ts
// api/middleware.ts:5
const t = initTRPC.context<Context>().create({ transformer: superjson });
```

16 procedures across 5 namespaces (`api/router.ts:7-13`, index at `API_CONTRACT.md §2.17`). The client imports the router **type** directly from server source:

```ts
// src/providers/trpc.tsx:6
import type { AppRouter } from "../../api/router";
```

There is no OpenAPI document, no `.proto`, no generated SDK, and no versioned namespace. Client and server are compiled from one tree and shipped as one container (`Dockerfile`).

### Decision

1. **Keep tRPC** as the sole request/response API for the web client.
2. **Accept, explicitly, that Alice Chains has no language-agnostic public API.** This is a stated non-goal of this release, not an oversight.
3. **Preserve type coupling** — the client imports `AppRouter` as a type. That import is erased at build time and is the one permitted `src/ → api/` edge (`TECH_SPEC.md §4.3` rule D-2). It must remain type-only, enforced by lint.
4. **Preserve superjson on both ends** (`SRS.md` C-4). Any transport change must keep `Date` fidelity.
5. **Apply the contract-stability rules of `API_CONTRACT.md §6** to every change, even though there is only one consumer today — the discipline is what makes a second consumer cheap later.

### Consequences

**Positive.** End-to-end type safety with zero codegen: rename a procedure and the client fails to compile. Adding a field to an output is non-breaking by construction. `superjson` means `Date` survives the wire, which removes an entire class of serialization bug (the socket path, which lacks it, has exactly that bug — see ADR-014). `appRouter.createCaller(ctx)` gives procedure-level tests without HTTP framing (`TEST_PLAN.md §3`). Batching is free (`httpBatchLink`, `src/providers/trpc.tsx:13`).

**Negative.**

| Consequence | Detail |
|---|---|
| **No third-party integration surface** | A partner, a bot, a CLI, a mobile app in another language, or a webhook consumer cannot call this API without reverse-engineering tRPC's JSON-RPC-over-HTTP framing **and** superjson's encoding |
| **No API documentation artefact** | `API_CONTRACT.md` is hand-written and hand-maintained. It can drift from the router, and there is no generator to catch it |
| **Structural coupling to TypeScript** | Not just to a language, but to a *compilation unit*: the client's types come from server source paths |
| **No versioning today** | One surface, one deployment (`API_CONTRACT.md §6.2`). Fine while the web client is the only consumer; a trap the moment it is not |
| **HTTP semantics are non-idiomatic** | All queries are `GET /api/trpc/<a>,<b>?batch=1&input=…`; all mutations are `POST`. HTTP caching, standard status codes and REST tooling do not apply. tRPC errors carry JSON-RPC codes with an `httpStatus` inside the envelope (`API_CONTRACT.md §5.1`) |
| **Error shape is bespoke** | And currently leaks: a bare `throw new Error("You are not a participant…")` (`api/message-router.ts:112`) reaches the client verbatim as a 500 (`API_CONTRACT.md §5.2`) — fixed by `TECH_SPEC.md §11.1` |

### If a language-agnostic API is ever needed

Do it in this order; do not reshape existing procedures to accommodate a hypothetical consumer.

| Step | Action | Notes |
|---|---|---|
| 1 | Freeze the current surface as `v1` and mount future routers under an explicit namespace | `API_CONTRACT.md §6.2` |
| 2 | Add `trpc-to-openapi` (or equivalent) with explicit `.meta({openapi})` per procedure | Generates a REST façade **and** an OpenAPI document from the existing router. Lowest cost by a wide margin: no second implementation, no divergence, and the router stays the single source of truth |
| 3 | Introduce a non-cookie credential for machine callers | The session cookie is browser-shaped (`HttpOnly`, `SameSite=Lax`). Machines need bearer tokens with scopes — which requires the session store of `TECH_SPEC.md §15` Q-4 |
| 4 | Apply per-client rate limits and quotas | `SECURITY.md §8` buckets are per-user; a machine consumer needs its own key class |
| 5 | Publish `AppRouter` types as a versioned npm package for TypeScript consumers | Keeps the good path good |
| 6 | Add contract tests (request/response snapshots) before the first external consumer exists | `API_CONTRACT.md §6.2` "Contract tests"; there are currently none — the repo has exactly one test file (`api/kimi/session.test.ts`) |

**Do not** hand-write a parallel REST layer. Two implementations of the same procedures will diverge, exactly as the socket and tRPC message-write paths have already diverged (gap G-2, ADR-007).

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **REST + OpenAPI + generated clients** | Language-agnostic and tool-rich, but costs a spec to maintain, codegen in the build, and hand-written types on both sides. With one TypeScript consumer it is pure overhead for a benefit nobody is currently buying |
| **GraphQL** | Solves over-fetching this app does not have (16 procedures, all narrow) and adds a schema, resolvers, N+1 risk that would compound the existing N+1s (`DATA_MODEL.md §6.6`), and a much larger client runtime |
| **gRPC / Connect** | Genuinely good for polyglot service-to-service. Browser support requires grpc-web or Connect's HTTP fallback, plus `.proto` codegen. Wrong shape for a single-page app talking to its own backend |
| **Plain fetch + hand-written types** | Zero dependencies, and zero guarantees. The types drift the first time someone renames an output field |
| **Ripping out tRPC now to prepare for a hypothetical public API** | Speculative generality. `SRS.md §2.3` scopes this release to a web client; no partner integration is scheduled |

---

## ADR-005 — Drizzle migrations are canonical; `db:push` is scratch-only

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `NFR-OPS-05`, `NFR-OPS-02`, `NFR-REL-01`, `DATA_MODEL.md §4.2`

### Context

The migration toolchain now exists (it did not on a clean clone — `SRS.md §1.5`):

| Artefact | State |
|---|---|
| `drizzle.config.ts` | `schema: "./db/schema.ts"`, `out: "./db/migrations"`, `dialect: "mysql"`, `strict: true` (`:12-17`) — **untracked in git** |
| Baseline migration | `db/migrations/0000_lumpy_marten_broadcloak.sql`, 6 tables, **0 foreign keys, 0 non-PK indexes, 1 unique key** (`users.unionId`, `:66`) — **untracked** |
| Journal | `db/migrations/meta/_journal.json`, one entry, `idx: 0` — **untracked** |
| Scripts | `db:push`, `db:generate`, `db:migrate`, `db:studio` (`package.json:13-16`) |
| Deployment | `migrate` service runs `npx drizzle-kit migrate` to completion before the app starts (`docker-compose.yml:22-32,56-57`) |
| Documentation | `README.md:42` instructs new developers to run **`npm run db:push`** |

The two commands are not interchangeable. `db:generate` emits a reviewable SQL file and a journal entry; `db:migrate` applies pending files and records them. `db:push` diffs the live database against `db/schema.ts` and mutates it **with no artefact and no journal entry**.

### Decision

1. **`db:migrate` is the only path that touches any database an operator cares about** — CI, staging, production, and any developer database that will outlive the afternoon.
2. **`db:generate` → review the SQL as code → commit** is the only way a schema change enters the repository (`DATA_MODEL.md §4.2`).
3. **Migrations are forward-only.** Never edited after merge, never rolled back. A mistake is corrected by a new numbered migration. `_journal.json` is append-only; merge conflicts in it are resolved by **renumbering the incoming migration**, never by editing history.
4. **`db:push` is permitted only against a disposable local database** and must be labelled as such in `package.json` and the README.
5. **`README.md:42` must change to `db:migrate`** (`NFR-OPS-08`, `DATA_MODEL.md §4.2` H-DOC-PUSH). This is a one-line fix for a defect that silently corrupts every new developer's environment.
6. **Commit the untracked files** — `drizzle.config.ts`, the baseline SQL and `db/migrations/meta/**` (`S-DB-000`, `SEC-C-27`, `NFR-OPS-02`). Until then CI and the Docker `migrate` job have no baseline to apply.
7. **CI asserts no pending diff**: `drizzle-kit generate` must produce nothing on a clean tree (`NFR-OPS-05`, TC-DATA-10).

### Consequences

**Positive.** Schema changes are reviewable diffs. Every environment converges to the same DDL. `0001_constraints` — which contains destructive dedupe steps (`DATA_MODEL.md §4.3` Step 2) — is only possible as a reviewed, ordered file; `db:push` cannot express probe → dedupe → orphan cleanup → DDL. The compose ordering (`db` healthy → `migrate` exits 0 → `app`) means the app never starts against an unmigrated schema.

**Negative.** Slower loop: a schema change costs `generate` + review + commit. Journal conflicts on parallel branches require manual renumbering. `db:push` remains one keystroke away in `package.json:13` — a footgun the README currently *recommends*.

**Risk if the decision is not enforced.** A developer who runs `db:push` gets a database whose objects exist but whose journal is empty; the next `db:migrate` then tries to `CREATE TABLE` objects that already exist and fails. The failure is confusing and lands on whoever inherits the machine.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **`db:push` everywhere** | No artefact, no review, no ordering, no data steps. Incompatible with `0001_constraints`'s dedupe and with `NFR-OPS-05` |
| **Hand-written SQL migrations, no drizzle-kit** | Maximum control, but `db/schema.ts` and the SQL would drift with nothing to detect it. `drizzle-kit generate`'s no-pending-diff check is precisely the guard `NFR-OPS-05` asks for |
| **Up/down migrations with rollback** | Down migrations for destructive steps are lies — `0001_constraints` deletes duplicate rows (`DATA_MODEL.md §4.3` Step 2) and no down migration can restore them. Forward-only plus a pre-migration `mysqldump` (`TECH_SPEC.md §13.6`) is honest about what is actually recoverable |
| **Migrations applied by the app at boot** | Simpler compose file, but N replicas race to apply the same DDL, and a failed migration takes the app down instead of failing a job. The separate `migrate` service (`docker-compose.yml:22-32`) is correct |
| **Remove `db:push` from `package.json`** | Tempting. Kept because it is genuinely useful for throwaway schema experimentation — but only with the README fixed and the script labelled |

---

## ADR-006 — Single-process deployment now; Redis adapter when horizontal scaling is needed

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `NFR-SCALE-01` (Defective), `NFR-SCALE-02`, `FR-PRES-08`, `NFR-REL-05`, `SRS.md §8.3`

### Context

Today one process serves the client and the API, and holds all realtime state:

```ts
// api/socket.ts:11
const onlineUsers = new Map<number, Set<string>>();
```

```ts
// api/socket.ts:22-28  — no adapter configured
io = new SocketIOServer(server, { cors: {…}, path: "/socket.io" });
```

The reference deployment is a single host, 4 vCPU / 8 GB, one app container and one MySQL container, ≤200 members and ≤50 concurrent sockets (`SRS.md §8.3`). At that size a second node has no purpose.

`TECH_SPEC.md §3.4` enumerates the four failure modes a second node would introduce. The severe one is P-4: with the presence map per-process, a member with one device on each node produces a **false `userOffline`** when either tab closes. The system does not degrade gracefully — it lies.

### Decision

1. **Ship single-process.** `NFR-REL-05`'s 99.5 % monthly availability (3 h 39 m of budget) is achievable with one app container and no rolling deploy, and `SRS.md` justifies that target on exactly this topology.
2. **Do not add Redis speculatively.** It would add a container, a failure domain and an operational burden to a deployment whose whole promise is `docker compose up`.
3. **Build the seam now, use it later.** The Redis adapter is gated on `REDIS_URL` being set (`TECH_SPEC.md §3.5`); unset keeps today's behaviour byte for byte.
4. **When the trigger fires, adopt the full package** — adapter **and** Redis-backed presence **and** sticky sessions. Partial adoption is worse than none: the adapter alone fixes fan-out (P-1, P-2) and leaves presence actively wrong (P-3, P-4).

### The trigger metric

**Primary trigger:** `socket_connections_active` (per node, `TECH_SPEC.md §10.3`) sustains **> 6 000** — 60 % of the `NFR-SCALE-02` per-node target of 10 000 — for **15 consecutive minutes**, on **3 separate days within 14 days**.

Rationale for 60 %: the headroom must cover a full reconnect storm. When the process restarts, every client reconnects at once and each handshake performs a database read (`api/kimi/auth.ts:14`, `NFR-PERF-04`). Triggering at 90 % would leave no room to absorb that. Rationale for the 3-day rule: one spike is an event, three are a trend.

**Secondary triggers**, any one of which is sufficient:

| # | Signal | Threshold | Source |
|---|---|---|---|
| S-1 | Sustained CPU on the app container | > 75 % of one core for 30 min, 3 days in 14 | `NFR-SCALE-02` |
| S-2 | Process RSS | > 2 GB | `NFR-SCALE-02` |
| S-3 | Message throughput | > 400 msg/s sustained (80 % of the `NFR-SCALE-03` 500/s ceiling) | `NFR-SCALE-03` |
| S-4 | Delivery latency | `message_delivery_latency_seconds` p95 > 250 ms attributable to CPU rather than DB | `NFR-PERF-03` |
| S-5 | **Availability requirement changes** | Any commitment above 99.5 %, or a requirement for zero-downtime deploys | `NFR-REL-05`. This is a *product* trigger and the most likely one to fire first — a single container cannot do a rolling deploy |

**Explicitly not triggers:** anticipated growth; a desire for redundancy without a measured need; "Redis would be useful for caching" (it would — but `TECH_SPEC.md §12.3` shows the cache wins are client-side and per-process).

### Consequences

**Positive.** Two containers, one `.env`, one command (`NFR-OPS-07`, 120 s to healthy). No distributed-systems failure modes: no split brain, no adapter partition, no Redis eviction corrupting presence. Debugging is single-process. The rate-limiter can start as an in-process `Map` (`SECURITY.md §8`, `TECH_SPEC.md §15` Q-8).

**Negative.**

| Consequence | Detail |
|---|---|
| `NFR-SCALE-01` stays **Defective** until the trigger fires | This is a P0 requirement recorded as unmet in `SRS.md §10.4`. The decision is that it is unmet *by design* for this release, with an explicit adoption path — not that it is forgotten |
| No rolling deploys | Every deploy is a full disconnect. Mitigated by graceful shutdown with a `serverShutdown` notice and staggered reconnect (`TECH_SPEC.md §11.5`) |
| Single point of failure | Accepted by `NFR-REL-05`'s 99.5 % target |
| Presence and rate limits reset on restart | Clients re-receive `onlineUsers` on reconnect (`api/socket.ts:54`); rate-limit buckets reset, which is a minor abuse window |
| A latent trap for operators | Someone will eventually run `docker compose up --scale app=2`. **The compose file must document that this is unsupported without `REDIS_URL`**, and the app should log a `warn` at boot if it detects a peer without an adapter configured |

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Redis adapter from day one** | Adds a container and a failure domain to every self-hosted deployment for a capability nobody at reference scale needs. Contradicts the `docker compose up` promise |
| **Sticky sessions alone, no adapter** | Does not work, and the reason is worth recording: stickiness pins a *connection* to a node, not a *member*. A member's phone and laptop land on different nodes, so rooms still do not span processes (P-1, P-2) and presence still lies (P-4) |
| **Adapter alone, no sticky sessions** | Breaks HTTP long-polling, whose multiple requests per logical connection must reach the same node. Polling fallback is required by `NFR-COMPAT-05` (P1) |
| **`@socket.io/cluster-adapter` (Node cluster on one host)** | Fixes multi-core utilisation without Redis, and is a legitimate intermediate step if S-1 (CPU) fires before the connection trigger. Not chosen as the primary path because it does not survive multi-host, so the Redis work would still be needed later |
| **Postgres `LISTEN/NOTIFY` as the pub/sub bus** | Would avoid a new component — but ADR-001 keeps MySQL, which has no equivalent. Non-option |
| **Externalise realtime to a hosted service** | Same rejection as ADR-003: message content would transit a third party, contradicting `SRS.md §2.1` |

---

## ADR-007 — Realtime writes go through Socket.IO while tRPC owns reads

**Status:** Accepted (recording current state) — with a mandated target state
**Date:** 2026-08-12
**Requirements:** `FR-MSG-08` (Missing), `FR-MSG-01` (Defective), `NFR-SEC-03`, `API_CONTRACT.md §7.1` G-1/G-2

### Context — the split as built, verified

| Operation | Path the UI actually uses | Path that also exists |
|---|---|---|
| Read conversation list | tRPC `conversation.list` | — |
| Read message history | tRPC `message.listByConversation` | — |
| **Send a message** | **socket `sendMessage`** (`src/pages/Chat.tsx:157-161`) | tRPC `message.send` (`api/message-router.ts:85-133`) — **never called by the client** |
| Mark read | socket `markAsRead` (`src/pages/Chat.tsx:85`) | tRPC `message.markAsRead` — **never called by the client** |
| Typing | socket `typing` | — |
| Contacts, conversation creation | tRPC mutations | — |

**No tRPC procedure emits a single socket event.** `getIO()` is exported at `api/socket.ts:13-15` and has **zero call sites**; no router imports `./socket`. A message sent through `message.send` is persisted and never broadcast (`FR-MSG-08`, Missing; gap G-1).

The two write paths have **diverged**, and in the worst possible direction:

| Aspect | tRPC `message.send` | socket `sendMessage` |
|---|---|---|
| Content length | `z.string().min(1).max(4000)` (`api/message-router.ts:89`) | **nothing** — bare TS annotation (`api/socket.ts:78-85`), `data.content` goes straight into the insert at `:110` |
| `type` | `z.enum(["text","image","file"])` (`:90`) | cast without checking (`api/socket.ts:111`) |
| `fileUrl` | `z.string().optional()` | unvalidated arbitrary string |
| Realtime emission | **none** | `newMessage` + per-participant `conversationUpdated` |
| Failure signalling | throws (as a 500 — `:112`) | silence for non-participants (`api/socket.ts:104`) |

Because the UI uses only the socket path, **the stricter validation is never exercised in the shipping product** (gap G-2). `FR-MSG-01` is Defective for exactly this reason: the 4 000-character cap exists in code that never runs.

### Decision

**Record the split as the current state. Mandate this target, in this order:**

| Step | Change | Ships in | Closes |
|---|---|---|---|
| **1** | Extract one service function `sendMessage(ctx, input)` in `api/services/message.ts`. Both transports call it. It performs: Zod parse (shared schema, ADR-011) → `assertParticipant` → transaction { INSERT message; UPDATE `conversations.updatedAt` } → return the row | Phase 1 (P1-E, P1-K) | `FR-MSG-01`, `FR-MSG-09`, `NFR-SEC-03`, G-2 |
| **2** | Introduce `api/realtime/emit.ts` as the **only** module permitted to import `getIO()` (`TECH_SPEC.md §4.3` rule D-5). It exposes `emitNewMessage`, `emitConversationUpdated`, `emitMessagesRead`, and no-ops when `io` is null (tests, and any process that never called `initSocket`) | Phase 1 (P1-K) | `FR-MSG-08`, G-1 |
| **3** | Both transports emit through that façade. `message.send` and socket `sendMessage` become observationally equivalent | Phase 1 (P1-K) | `FR-MSG-08` |
| **4** | **Target: all writes go through tRPC procedures, which then emit. The socket layer becomes a thin transport** — subscribe, join/leave rooms, typing, and receive server pushes | Phase 2 (P2-B) | see below |

**The recommendation is step 4**, but it is deliberately sequenced last, because steps 1–3 remove the *defects* without a breaking change and step 4 is a client migration.

### Why tRPC should own writes

| # | Reason |
|---|---|
| W-1 | **One validation path.** Zod input schemas are declarative, enforced by the framework, and impossible to forget. The socket path's validation is whatever the handler remembers to do — currently nothing |
| W-2 | **One error contract.** tRPC has typed error codes and an `errorFormatter` (`TECH_SPEC.md §11.1`). The socket path's error story is one event plus four kinds of silence (`API_CONTRACT.md §5.4`) |
| W-3 | **Request/response is the natural shape of a write.** A send needs an ack carrying the server id — that is exactly a mutation's return value. Bolting `messageAck` onto the socket (`TECH_SPEC.md §6.3`) reinvents it |
| W-4 | **Rate limiting is uniform.** One middleware over all mutations, rather than per-handler token buckets on both transports (`SECURITY.md §8` currently specifies both) |
| W-5 | **Observability is uniform.** One place to instrument `trpc_requests_total`, `requestId` propagation and structured audit logging (`TECH_SPEC.md §10`) |
| W-6 | **Testability.** `appRouter.createCaller(ctx)` tests a write with no socket harness (`TEST_PLAN.md §3`) |
| W-7 | **superjson.** `Date` fidelity on the response, which the socket path does not have (ADR-014) |

### Why it is not step 1

| # | Counter-argument |
|---|---|
| C-1 | Latency: a tRPC mutation is an HTTP round trip while the socket connection is already open. At reference scale the difference is single-digit milliseconds against a 250 ms budget (`NFR-PERF-03`) — real, but not decisive |
| C-2 | The client must change: `src/pages/Chat.tsx:154-164` and `src/hooks/useSocket.ts:67-79` both move. Coupled with the optimistic-send rework (`TECH_SPEC.md §6.5`), this is a Phase 2 sized change |
| C-3 | Offline queueing (`TECH_SPEC.md §5.4` R-5) is currently expressed against the socket. It works over HTTP too, but the design must be written before the migration |

Steps 1–3 capture ~90 % of the benefit (one validation path, one error path, one emission path) for ~20 % of the cost, and leave step 4 as a pure transport swap behind a stable service function.

### Consequences

**Of the current split (until step 3 lands):** `FR-MSG-08` remains Missing, so any future non-web client calling `message.send` writes messages nobody receives in real time. `FR-MSG-01` remains Defective. Two code paths must be reviewed and tested for every message-write change — and history shows they drift.

**Of steps 1–3:** one service function to test, one emission façade to mock, and the two transports become observationally equivalent. `getIO()` stops being dead code. A dependency-rule lint (D-5) prevents the façade from being bypassed.

**Of step 4:** the socket handler set shrinks from 5 to 3 (`joinConversation`, `leaveConversation`, `typing`); `sendMessage` and `markAsRead` disappear from `ClientToServerEvents`. **This is a breaking socket-contract change** (`API_CONTRACT.md §6.1`) and must ship in one coordinated release — feasible because client and server deploy as one artefact (ADR-013).

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Keep both write paths permanently, sharing a service function (stop at step 3)** | Legitimate, and it is what Phase 1 delivers. Rejected as the *end state* because two transports for one operation means two rate limiters, two error shapes and two sets of tests forever. Acceptable as an interim |
| **Socket owns all writes; delete tRPC mutations** | The opposite consolidation, and cheaper client-side (no change at all). Rejected on W-1…W-7: reimplementing validation, typed errors, rate limiting and request correlation on the socket layer is rebuilding tRPC by hand |
| **Emit from the database (CDC / binlog tail)** | Perfectly decoupled and immune to a missed emit, but adds a binlog consumer to a two-container deployment (ADR-006) and delays delivery by the replication lag. Wildly disproportionate |
| **Outbox table polled by an emitter** | Guarantees emission even if the process dies between commit and emit — a real gap in step 3. Rejected for now: at-least-once delivery is achieved instead by the reconnect catch-up of `TECH_SPEC.md §5.4` R-3, which covers the same failure without a new component. Revisit if delivery-loss telemetry says otherwise |

---

## ADR-008 — Defer E2EE/MLS until Phase 2 ships

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `SRS.md §2.3` (out of scope), `SRS.md §6` (encryption at rest), `NFR-OPS-08`

### Context

`docs/ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md` is a committed, detailed program for an end-to-end-encrypted product. It specifies an `mls_engine` module (`:210`), MLS integration as a dedicated epic (`:223-225`), ACL/MLS epoch consistency (`:286-289`), conformance test vectors (`:709`, `:828`), and "ADR-003 MLS for private DMs and groups" (`:128`). Its product principles include "Private means endpoint-readable only" (`:20`).

The shipping system is the opposite of that:

| Reality | Evidence |
|---|---|
| Message content is plaintext in the database | `messages.content` is `text NOT NULL` — `db/schema.ts:66`, DDL `db/migrations/0000_lumpy_marten_broadcloak.sql:44` |
| Content is readable by the operator | direct consequence |
| Content transits Socket.IO frames in the clear (inside TLS) | `api/socket.ts:127` |
| No crypto beyond session HMAC | `node:crypto` used only at `api/kimi/session.ts:3` |
| No key management, no device registry, no key backup | absent from `db/schema.ts:1-106` |

Meanwhile `SRS.md §10.3` records 131 of 164 requirements not yet met, including 42 P0 blockers (`§10.4`). The product cannot currently order its own conversation list correctly (`FR-CONV-05`), returns read receipts for one message per page (`FR-MSG-04`), and lets any authenticated member forge read receipts for any message in the system (`FR-MSG-05`).

### Decision

1. **E2EE and MLS are out of scope for this release** (`SRS.md §2.3`). The July 2026 buildout program stays parked until Phase 2 ships.
2. **No requirement in `SRS.md` depends on it.** No Phase 1 or Phase 2 design may be justified as MLS preparation.
3. **Documentation must not claim it.** `README.md`, `PRD.md`, UI copy and marketing must not imply end-to-end encryption (`NFR-OPS-08`). The current honest statement is: *messages are encrypted in transit (TLS) and stored as plaintext readable by the operator; deployments handling regulated data should enable storage-level encryption on the MySQL volume* (`SRS.md §6`).
4. **Preserve optionality without paying for it.** Two cheap, independently-justified choices keep the door open: `messages.content` stays opaque to the server (never parsed, never indexed, never transformed — it is already only stored and returned), and the message-write path is consolidated behind one service function (ADR-007 step 1), which is where an encryption boundary would eventually sit.
5. **Reopen when, and only when,** Phase 2 exit criteria are met *and* a decision-maker accepts the consequences in the table below.

### Consequences

**Positive.** Engineering capacity goes to the 42 P0 blockers. No cryptographic design is committed to before the product's data model has stabilised — and it has not: `DATA_MODEL.md §5` still adds four tables in Phase 2. Building MLS against a moving schema would guarantee rework. It also avoids the single largest risk in the buildout program: bespoke crypto integration by a team with no key-management infrastructure, in a product with no session revocation (`FR-SESS-06`, Missing).

**Negative.**

| Consequence | Detail |
|---|---|
| The operator can read every message | Inherent, and must be stated plainly in the README and in-product. It is the honest description of a self-hosted, operator-trusted system |
| The buildout program's core promise is unmet | "Private means endpoint-readable only" (`ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md:20`) is false of this release |
| Positioning constraint | Alice Chains competes with Slack/Discord on self-hostability and data ownership, **not** with Signal on confidentiality |
| Retrofit cost is real | Adding MLS later requires: device identity and key packages; a per-conversation group state machine with epochs; key rotation on membership change; encrypted-blob storage replacing `messages.content`; multi-device key backup; loss of server-side search and preview generation; a migration for historical plaintext; and reworking read receipts and push payloads (`FR-NOTIF-05` already forbids content in push by default, which happens to align) |

**Explicitly not deferred** (they are prerequisites, not consolations): TLS everywhere and `Secure` cookies (`FR-SESS-02`); storage-level encryption on the MySQL volume, documented for regulated deployments (`SRS.md §6`); message content never logged (`SECURITY.md §11`); attachments private with presigned access only (`FR-FILE-05`).

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Build MLS now** | The product cannot order a conversation list correctly. Layering a group key-agreement protocol on 37 Defective requirements is how projects die. It would also freeze a schema that Phase 2 is still changing |
| **Ship a weaker "encryption" (server-held keys, per-conversation symmetric)** | The worst outcome: real cost, real complexity, and a claim users would reasonably read as end-to-end. If the server holds the key, the operator can still read everything — the only thing gained is a misleading marketing line, which `NFR-OPS-08` forbids |
| **Signal Protocol (X3DH + Double Ratchet) instead of MLS** | Excellent for 1:1, poor for groups — pairwise sessions mean group fan-out is O(members) encryptions. `FR-CONV-*` treats groups as first class. MLS is the better fit *when the time comes* |
| **Encrypt `messages.content` at rest with a server-held key (transparent column encryption)** | Protects against stolen backups and disk images, not against the operator. Worth doing eventually and it is **not** E2EE; it must never be described as such. Lower priority than storage-level volume encryption, which achieves the same threat coverage with zero application complexity |
| **Ship E2EE for DMs only** | Halves the crypto work but produces an inconsistent product where confidentiality depends on conversation type — and the same infrastructure (device identity, key backup) is still required |

---

## ADR-009 — S3-compatible object storage via an env-selected driver; MinIO for local

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `FR-FILE-01…10`, `SRS.md §7.2`, `SECURITY.md §9` (`SEC-C-23`), `NFR-PERF-06`

### Context

Attachments are entirely unbuilt (`SRS.md §4.7`: the whole `FR-FILE` group is Missing), but the schema already invites them and the invitation is dangerous:

| Fact | Evidence |
|---|---|
| `messages.type` accepts `'image'` and `'file'` | `db/schema.ts:67` |
| `messages.fileUrl` is a `text` column | `db/schema.ts:68` |
| Both are accepted end to end with **no validation** | `api/message-router.ts:91,120`; `api/socket.ts:82,112` |
| Consequence | A member can today store `javascript:…` or `http://attacker/track?u=…` in `fileUrl` and have it rendered by other members' clients (`SECURITY.md §9`) |
| No S3 client is a dependency | `package.json:24-71` |
| The composer's paperclip has no handler | `src/pages/Chat.tsx` — one of the inert controls `SRS.md §9` item 8 requires removing or wiring |

`SRS.md §7.2` already fixes the interface: S3-compatible protocol, private bucket, presigned POST/GET with ≤300 s TTL, key scheme `attachments/{conversationId}/{uuidv7}`, and CORS restricted to `PUBLIC_BASE_URL`.

### Decision

1. **The storage interface is the S3 API.** Not a filesystem, not a database blob.
2. **One driver, selected by environment**, not a driver-per-provider abstraction. The AWS SDK v3 S3 client with `endpoint`, `region`, `forcePathStyle` and credentials from `S3_*` variables (`SRS.md §7.2`) speaks to AWS S3, MinIO, Cloudflare R2, Backblaze B2, Wasabi and Ceph without a line of provider-specific code.
3. **MinIO for local development and CI**, added to `docker-compose.yml` as an optional profile so the default two-container deployment is unchanged (ADR-006).
4. **Bytes never pass through the application.** Upload is a presigned POST direct to the bucket; download is a presigned GET. The Node process handles metadata and authorization only — which is also why `SEC-C-20` can drop the body limit from 50 MB (`api/boot.ts:17`) to 256 KB without blocking attachments.
5. **Feature-flagged on `S3_BUCKET` being set** (`TECH_SPEC.md §13.4`). Unset: `file.*` procedures return `PRECONDITION_FAILED` and the client **hides** the paperclip rather than showing an inert control.
6. **Fix the `fileUrl` hole in Phase 1, before any upload work.** `FR-FILE-07` requires that a message may not be persisted with a `fileUrl` that does not correspond to an `attached` record owned by the sender. Until the attachments table exists, `fileUrl` must be **rejected outright** on both write paths. That is a one-line Zod change and it closes a live stored-XSS/tracking vector.

### Consequences

**Positive.** Self-hosters choose their own storage; nothing is locked to a cloud vendor. The app stays stateless — no volume to back up beyond MySQL. Large uploads never occupy a Node request handler, so `NFR-SCALE-02`'s connection budget is unaffected. The presigned-GET model makes `FR-FILE-05` (no public reads, participant-scoped access) enforceable, which is what stops attachment URLs from becoming a bypass of `FR-CONV-02`.

**Negative.**

| Consequence | Detail |
|---|---|
| A third infrastructure component for deployments that want attachments | Mitigated by the feature flag: no bucket, no component |
| Bucket CORS must be configured by the operator | `PUT`/`POST` from `PUBLIC_BASE_URL` only (`SRS.md §7.2`). A misconfiguration produces an opaque browser error — this needs a documented setup step and a startup self-check |
| Two-phase upload complexity | `pending` record → presign → client uploads → message persisted → `attached`; `pending` purged after 24 h (`FR-FILE-06`, `DATA_MODEL.md §5.4`). More moving parts than a direct upload, and the reason is `FR-FILE-07` |
| Server-side magic-byte sniffing needs the object back | `FR-FILE-02` requires that the sniffed type match the declared type. With direct-to-bucket upload the app must fetch the first 4 KB via a ranged GET after upload, before transitioning to `attached`. Budget for it |
| Deletion must cascade | Erasure (`FR-ADMIN-09`) and conversation deletion (`FR-ADMIN-10`) must remove objects, not just rows. Requires FKs (`NFR-REL-01`) plus an object-reaper job |
| SDK bundle weight | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` are server-side only, so the client bundle is unaffected (`NFR-PERF-06`), but they add meaningfully to `dist/boot.js` — another argument for ADR-012 |

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Local filesystem + a Docker volume** | Simplest to start, and it makes the app stateful: a volume to back up, no horizontal scale (ADR-006's future), no CDN path, and the app must serve bytes — reintroducing the 50 MB body limit that `SEC-C-20` removes |
| **Blobs in MySQL** | Bloats the dataset that `NFR-REL-06` must back up within a 15-minute RPO, destroys buffer-pool efficiency for the hot message queries (`TECH_SPEC.md §12.1`), and makes every backup proportional to attachment volume |
| **A provider-agnostic abstraction layer over several drivers** | Speculative generality. The S3 API *is* the abstraction; every relevant provider implements it. A second driver interface would be tested against exactly one implementation |
| **Cloudflare R2 or AWS S3 specifically** | Fine as *deployments*, wrong as a *decision* — self-hosters must not require a cloud account (`SRS.md §2.1`). Both are reachable through the same env-selected driver |
| **Supabase Storage** | Ruled out by ADR-001; it also implies the Supabase platform this release does not use |
| **Ship without attachments and revisit** | Effectively what Phase 1 does — but the `fileUrl` column already exists and is already exploitable, so decision point 6 (reject `fileUrl`) is not deferrable |

---

## ADR-010 — Retain the monorepo-in-one-package layout

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `NFR-OPS-01`, `NFR-OPS-02`, `SRS.md §8.2` C-1/C-2/C-3

### Context

One `package.json` at the root (`package.json:1-96`) declares client, server and shared dependencies together. Four top-level source directories — `api/`, `src/`, `db/`, `contracts/` — are bound by three path aliases declared in `tsconfig.json:18-22`, `vite.config.ts:8-12` and `vitest.config.ts:9-13`. One `tsc` invocation typechecks all four (`tsconfig.json:24`). One `npm run build` produces both artefacts (`package.json:10`). One container ships them (`Dockerfile`).

Known friction:

| Issue | Evidence |
|---|---|
| Alias map duplicated across 3 live sites + 2 orphaned tsconfigs | `TECH_SPEC.md §4.4`. Its absence from `vitest.config.ts` **was a CI failure** — any test importing a module that imports `@contracts/*` failed at collect time |
| `tsconfig.app.json` and `tsconfig.server.json` are referenced by nothing, and the former declares only `@/*` — missing `@db/*` and `@contracts/*` | verified: no match in any npm script, vite/vitest/eslint config, Dockerfile or CI workflow |
| Client and server dependencies are indistinguishable | `package.json:24-71` — `mysql2` and `react` are peers in `dependencies` |
| The runtime image installs client dependencies it never uses | `Dockerfile:29-30` runs `npm ci --omit=dev`, which still installs React, Radix and Tailwind runtime deps |
| No mechanical import-boundary enforcement | `eslint.config.js:6-31` has no `import/no-restricted-paths` rule; `TECH_SPEC.md §4.3` rules D-1…D-7 are conventions only |

### Decision

**Keep the single-package layout.** Do not split into npm/pnpm workspaces or a Turborepo/Nx monorepo for this release.

Mitigate the friction with four cheap changes instead (`TECH_SPEC.md §4.4`, task S-ALIAS):

1. Delete the orphaned `tsconfig.app.json` and `tsconfig.server.json`, or wire them into scripts. An incomplete orphan is a trap for the next person who runs `tsc -p tsconfig.app.json`.
2. Define the alias map **once** and import it into both `vite.config.ts` and `vitest.config.ts`.
3. Add `import/no-restricted-paths` enforcing D-1…D-7 — in particular, no value import from `src/**` into `api/**`, and no import of `api/lib/env` from `src/**` (`SECURITY.md §10` item 2).
4. Add a CI check that the JS alias map and `tsconfig.json` `paths` agree.

Revisit if any of these becomes true: a second deployable appears (a worker, a push sender, an admin app); a second consumer needs published router types (ADR-004 step 5); or the repository grows past roughly 200 first-party source files.

### Consequences

**Positive.** `npm ci && npm run validate` is the whole story (`NFR-OPS-01`) — no workspace protocol, no build orchestration, no topological ordering. One lockfile means one dependency resolution and one `npm audit` surface (`NFR-SEC-12`). Type sharing is free: `AppRouter` (`src/providers/trpc.tsx:6`) and `Message` (`src/hooks/useSocket.ts:3`) cross the boundary as plain relative/aliased imports with no build step and no version skew. A single `tsc` catches a server-side rename in the client immediately.

**Negative.**

| Consequence | Detail | Mitigation |
|---|---|---|
| Boundaries are conventional, not mechanical | Nothing *stops* `src/pages/Chat.tsx` importing `api/queries/connection` and pulling `mysql2` into the browser bundle | Decision point 3 |
| The alias map must be manually synchronised | Already caused one CI failure | Decision points 2 and 4 |
| Dependency sets are conflated | The runtime image carries React and Radix it never executes | ADR-012 (`--packages=external`) makes this *more* visible; a `devDependencies` audit or a two-stage prune would fix it properly |
| No per-package versioning | Cannot publish `contracts/` or router types independently | ADR-004 step 5 when a second consumer exists |
| Single CI job for everything | Any change runs the whole pipeline | Acceptable: `TEST_PLAN.md §8` already splits `validate`/`integration`/`e2e` by concern rather than by package |

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **npm/pnpm workspaces (`packages/client`, `packages/server`, `packages/contracts`)** | The textbook answer, and it makes boundaries mechanical and dependency sets honest. Costs: workspace-aware install and build, cross-package TS project references (a notorious source of stale-build confusion), a more complex Dockerfile, and rework of every path alias. For four directories and one deployable, the ceremony exceeds the benefit — and the same boundary enforcement is available for the price of one ESLint rule |
| **Turborepo / Nx** | Task orchestration and caching for a repo with one build target. Pure overhead |
| **Two repositories (client, server)** | Destroys the property that makes tRPC worth having: the client imports `AppRouter` from server source (`src/providers/trpc.tsx:6`). Cross-repo type sharing means publishing a package on every server change |
| **Split `contracts/` into its own package only** | The most defensible partial split, since `contracts/` must stay dependency-free and is imported by both sides. Deferred: it buys enforcement that decision point 3 provides more cheaply, and it introduces versioning where none is needed |

---

## ADR-011 — One shared Zod contract per wire message, in `contracts/`

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `NFR-SEC-03` (Defective), `FR-MSG-01` (Defective), `SEC-C-13`, `API_CONTRACT.md §7.2`

### Context

tRPC inputs are validated by Zod (`api/message-router.ts:86-94`, `api/conversation-router.ts:216-221`, `api/contact-router.ts:64,111,142,166`). **Socket.IO payloads are not validated at all.** Verified across all five handlers: `joinConversation` (`api/socket.ts:66`), `leaveConversation` (`:71`), `sendMessage` (`:78-85`), `markAsRead` (`:157`), `typing` (`:190`). Each destructures parameters typed only by TypeScript annotations, which are erased at runtime. `api/socket.ts` imports no Zod.

Consequences already visible:

| Effect | Evidence |
|---|---|
| The 4 000-character cap is unenforced in the shipping product | The cap exists only on the tRPC path (`api/message-router.ts:89`); the UI sends exclusively over the socket (`src/pages/Chat.tsx:157`) — `FR-MSG-01` |
| `messages.type` is cast, not checked | `api/socket.ts:111` — an out-of-enum value reaches MySQL and fails at insert in strict mode, surfacing as a generic `messageError` |
| `markAsRead` with `messageIds: undefined` throws inside the handler and is silently swallowed | `api/socket.ts:160`, caught at `:181` |
| `markAsRead` array length is unbounded | N sequential inserts (`:165-174`), a trivial amplification vector |
| `fileUrl` is an arbitrary unvalidated string | `api/socket.ts:82,112` — see ADR-009 |

`API_CONTRACT.md §7.2` already names the fix and the home for it: *"Shared schemas belong in `contracts/` so both transports use one definition — the module already exists for exactly this purpose."*

### Decision

1. **`contracts/schemas.ts` holds one Zod schema per wire message**, for both transports. `sendMessageInput`, `markAsReadInput`, `joinConversationInput`, `typingInput`, and so on.
2. **tRPC procedures use them via `.input(schema)`; socket handlers `safeParse` at the top of the handler**, before any authorization or database access.
3. **A parse failure emits `validationError { event, issues }` carrying field *paths only*, never values** (`SECURITY.md §11` forbids logging or returning validation values), and produces **no side effect**.
4. **`contracts/` stays dependency-free apart from Zod.** Zod is already a runtime dependency (`package.json:69`) and is safe to ship in the client bundle — it is small, tree-shakeable, and the client can reuse the same schemas for pre-submit validation.
5. **A test asserts that both transports reject the same input.** Divergence between them is the exact failure this ADR exists to prevent (gap G-2).
6. **Ramped enforcement:** one release in `SOCKET_VALIDATION=log` mode, then `enforce` (`TECH_SPEC.md §13.5`). Some client sends may currently be out of spec; find out from logs, not from a support ticket.

### Consequences

**Positive.** One definition per message means the transports cannot drift. The client can validate before sending, turning a round trip into an inline error. Adding a field is a one-line change in one file. `NFR-SEC-03` becomes testable by construction, and `TEST_PLAN.md §5.6`'s socket cases get a single target to assert against.

**Negative.** Zod parsing costs a few microseconds per event — irrelevant against a DB round trip, and it *removes* work by rejecting bad input before the membership `SELECT`. Enforcing validation is a behaviour change for any out-of-spec client, hence the ramp.

**One measured cost worth stating plainly.** Zod is currently **server-only**: `zod/v3` contributes 8 modules to `dist/boot.js` (`TECH_SPEC.md §9.2`), and greps of the built client asset `dist/public/assets/index-UJM86xCc.js` for `ZodError`, `ZodString`, `invalid_type` and `zod` all return **zero** — nothing in `src/` imports it. Putting shared schemas in `contracts/` therefore introduces Zod into the client bundle for the first time (roughly 12–14 KB gzipped for the v3 core, tree-shaken). Against the `NFR-PERF-06` budget that is ~13 KB of the ~72 KB of headroom currently available (177.5 KB used of 250 KB — `TECH_SPEC.md §9.3`). Acceptable, and it buys client-side pre-submit validation. If the budget ever tightens, the mitigation is to export the schemas from `contracts/` in a subpath the client can decline to import, and validate server-side only.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Validate in each socket handler with hand-written guards** | Fastest to write, and it recreates the divergence problem: two definitions of "valid message" that agree only by vigilance |
| **A Socket.IO middleware that validates every event generically** | Attractive, but the middleware runs before the event name is dispatched to a handler and has no per-event schema binding without a registry — which is what the shared-schema map effectively is, with better types |
| **TypeScript-only, trusting the client** | The current state. TypeScript types are erased at runtime; the client is untrusted by definition (`SECURITY.md §1.2`) |
| **JSON Schema / Ajv instead of Zod** | Zod is already a dependency and already the tRPC input language. A second validation vocabulary for the same data is strictly worse |
| **Put the schemas in `api/` and import them from `src/`** | Violates dependency rule D-2 (`TECH_SPEC.md §4.3`): `src/**` must not import values from `api/**`, because that path is how server secrets reach the bundle |

---

## ADR-012 — Stop bundling node dependencies into the server artefact

**Status:** Proposed
**Date:** 2026-08-12
**Requirements:** `NFR-OPS-01`, `SRS.md §8.2` C-2

### Context

The build bundles the entire server dependency graph into one file:

```
esbuild api/boot.ts --platform=node --bundle --format=esm --outdir=dist \
  --banner:js="import { createRequire } from 'module';const require = createRequire(import.meta.url);"
```
(`package.json:10`)

`dist/boot.js` is **2,594,758 bytes**, unminified, with no sourcemap. Composition, read from the emitted `// node_modules/...` banners:

| Package | Modules |
|---|---|
| `mysql2/lib` | 89 |
| `drizzle-orm/mysql-core` | 42 |
| `hono/dist` | 22 |
| `iconv-lite/encodings` | 18 (transitive from mysql2 — full legacy charset tables for a `utf8mb4`-only deployment) |
| `engine.io/build` | 15 |
| `ws/lib` | 13 |
| `superjson/dist` | 11 |
| `socket.io/dist` | 9 |
| `zod/v3` | 8 |
| **`drizzle-orm/pg-core`** | **7 — PostgreSQL core inside a MySQL-only server** |

The `createRequire` banner exists because bundled CommonJS packages call `require()` at runtime while the output is ESM. That banner is the origin of constraint C-2 in `SRS.md §8.2`: *no runtime `require` of a dynamic path is permissible.*

**The decisive fact:** the runtime image **already installs production dependencies**:

```
# Dockerfile:29-30
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
```

So every bundled package is also present on disk at runtime. The bundle is duplication, not consolidation.

### Decision

Change the server build to:

```
esbuild api/boot.ts --platform=node --bundle --format=esm --packages=external \
  --outdir=dist --sourcemap=external
```

Bundle first-party code only; resolve dependencies from `node_modules` at runtime. Keep `--bundle` so the `api/`, `db/` and `contracts/` graph (including `tsconfig.json` path aliases) still collapses into one output file.

**Status is Proposed, not Accepted,** because it changes the runtime artefact contract and should land with a deployment smoke test (`docker compose up` reaching healthy within the `NFR-OPS-07` 120 s budget) rather than as a drive-by build tweak.

### Consequences

**Positive.**

| Effect | Detail |
|---|---|
| Artefact size | 2.5 MB → tens of KB |
| Cold start | No 2.5 MB parse on boot |
| Debuggability | Stack traces point at real package files rather than one 2.5 MB line-shifted file; external sourcemaps for first-party code |
| Constraint C-2 relaxes | The `createRequire` banner is no longer needed, so dynamic `require` becomes permissible (not that anything needs it) |
| Native/optional deps resolve normally | `mysql2`'s optional native paths and Socket.IO's optional `bufferutil`/`utf-8-validate` stop being an esbuild concern |
| Dead weight disappears | `drizzle-orm/pg-core` and `iconv-lite`'s legacy tables are no longer copied into the artefact |
| Build time | esbuild does far less work |

**Negative.**

| Effect | Detail |
|---|---|
| The artefact is no longer self-contained | `node dist/boot.js` requires a sibling `node_modules`. The Dockerfile already provides it, but any deployment that copies only `dist/` breaks |
| Docker layer size | The runtime image gains nothing (it already installs deps) but no longer *avoids* needing them |
| A distroless / single-binary future is foreclosed | Reversible: re-add `--bundle` without `--packages=external` |
| Version skew becomes possible | The bundle used to freeze dependency code at build time; now runtime resolution matters. `npm ci` from a committed lockfile makes this a non-issue — which is another reason `SEC-C-27` (commit the lockfile) is a prerequisite |

**If this ADR is rejected**, the fallback is `--minify --sourcemap=external --external:mysql2`. Minification alone should roughly halve the artefact, and externalising mysql2 removes the largest contributor and its `iconv-lite` charset tables.

### Alternatives considered

| Alternative | Why rejected / deferred |
|---|---|
| **Keep bundling, add `--minify`** | Cheapest change, keeps self-containment, and still duplicates every dependency already on disk. Retained as the fallback |
| **Bundle and drop `node_modules` from the runtime image** | Would make the bundle worth its size — but `Dockerfile:27-28` keeps `node_modules` deliberately so `drizzle-kit` can run migrations, and the compose `migrate` service builds from the `build` stage for the same reason. Removing it means finding another migration runner |
| **Do not bundle at all — ship `api/**` as compiled JS** | Requires `tsc` to actually emit (it does not: `noEmit: true`, `tsconfig.json:11`), plus a path-alias rewrite step at runtime. More moving parts than `--bundle --packages=external` |
| **Bundle for production, run `tsx` in dev (status quo for dev)** | Already the case (`package.json:8`), and orthogonal to this decision |

---

## ADR-013 — Same-origin deployment: client and API on one origin

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `FR-SESS-01`, `NFR-SEC-06`, `NFR-OPS-04`, `NFR-OPS-07`, `SRS.md §8.2` C-5/C-6

### Context

In production, one Node process serves the built SPA and the API on the same origin and port:

```ts
// api/boot.ts:51-54
if (isProd) {
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);           // api/lib/vite.ts:5-8 → dist/public + SPA fallback
}
```

In development, Vite serves the client on 3000 and proxies `/api` and `/socket.io` to 3001 (`vite.config.ts:16-26`), which preserves the same-origin property from the browser's point of view.

This is why several things currently work without any cross-origin machinery:

| Property | Evidence |
|---|---|
| The session cookie is sent with `SameSite=Lax` and no CORS | `api/kimi/auth.ts:102` |
| tRPC posts to a relative URL | `src/providers/trpc.tsx:13` — `url: "/api/trpc"` |
| The socket connects with no URL and no `withCredentials` | `src/hooks/useSocket.ts:42-46` — `io({ path: "/socket.io" })` defaults to the page origin |
| Socket.IO CORS is `false` in production | `api/socket.ts:24` — cross-origin clients are rejected outright |

### Decision

**Client and API are served from one origin. Keep it.** Concretely:

1. The production artefact serves `dist/public` and the API from the same process and port (`PORT`, default 3000).
2. Client code uses **relative** URLs for both transports. No `VITE_API_URL`.
3. The dev proxy preserves same-origin semantics; the port contract 3000/3001/3000 stays in `contracts/constants.ts:17-19` (`NFR-OPS-04`, `SRS.md` C-6).
4. `PUBLIC_BASE_URL` (`TECH_SPEC.md §8b`) names that single origin and is the source for `redirect_uri`, CSP `form-action`, the S3 CORS allowlist and the default `ALLOWED_ORIGINS`.
5. If a split-origin deployment is ever required, it is a **deliberate, costed change** (see below) — not something that should quietly become possible.

### Consequences

**Positive.** No CORS preflights on the hot path. The session cookie needs no `SameSite=None`, which would otherwise force `Secure` and widen CSRF exposure; `SameSite=Lax` is a meaningful CSRF control precisely because everything is same-origin. CSP is simple to write — `default-src 'self'` covers nearly everything (`SEC-C-17`). One TLS certificate, one DNS name, one container, one health check (`NFR-OPS-07`). The socket needs no `withCredentials`, avoiding a class of "cookie not sent" bug.

**Negative.**

| Consequence | Detail |
|---|---|
| No CDN for static assets without extra work | Assets are served by Node from `dist/public` (`api/lib/vite.ts:5-8`) with **no cache headers set at all** — an `NFR-PERF-05` tax that must be fixed regardless (`TECH_SPEC.md §12.3`). A CDN can still front the whole origin |
| Node serves static bytes | Trivial at reference scale; an edge cache or the reverse proxy can take over |
| Client and server deploy together | Usually an advantage (ADR-004 §6.2: coordinated breaking changes are cheap), occasionally a constraint |
| Socket.IO prod CORS `false` is not a configurable allowlist | `api/socket.ts:24`, `NFR-SEC-06`. `SEC-C-18` introduces `ALLOWED_ORIGINS` — which will make split-origin *possible*, so the default must remain the single `PUBLIC_BASE_URL` |

**If a split origin is ever required** (e.g. an app served from a CDN domain calling `api.example.com`), the full cost is: `SameSite=None; Secure` cookies with the CSRF re-analysis that implies; a CORS allowlist with credentials on both the Hono and Socket.IO surfaces; `withCredentials: true` on the socket client; preflight latency on every non-simple request; a second TLS certificate and DNS name; and `redirect_uri` handling that distinguishes the app origin from the API origin. That is why it is a decision, not a configuration.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Static client on a CDN, API on its own origin** | The standard cloud-native split, and it trades the entire CORS/cookie simplicity above for a marginal static-serving win at ≤200 members. Also contradicts the `docker compose up` promise (`SRS.md §2.1`) by requiring CDN configuration |
| **Reverse proxy routing `/api` to one container and `/` to another** | Preserves same-origin for the browser while splitting the processes. Legitimate, and worth revisiting alongside ADR-006's multi-node topology — but it doubles the container count today for no benefit |
| **Serve the client from Vite in production** | Vite's dev server is not a production server. `api/lib/vite.ts` already does the right thing with `serveStatic` |
| **Separate API subdomain with a shared parent-domain cookie** | `Domain=.example.com` cookies are incompatible with the `__Host-` prefix that `FR-SESS-03` requires, and they widen the cookie's exposure to every subdomain |

---

## ADR-014 — superjson on tRPC, ISO strings on Socket.IO

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `SRS.md §8.2` C-4, `API_CONTRACT.md §3.4` (H-SOCKET-DATE), gap G-8

### Context

The two transports serialize differently, and the client's types do not admit it.

| Transport | Serializer | `createdAt` arrives as | Evidence |
|---|---|---|---|
| tRPC | superjson, both ends | `Date` | `api/middleware.ts:5`, `src/providers/trpc.tsx:13` |
| Socket.IO | default JSON | **ISO string** | `api/socket.ts:127` emits a raw row; no transformer is configured |

The client's `ServerToClientEvents.newMessage` is typed `Message & { tempId?: string }` (`src/hooks/useSocket.ts:6`), where `Message` is `typeof messages.$inferSelect` (`db/schema.ts:78`) — whose `createdAt` is `Date`. **The declared type is wrong at runtime.** The UI happens to survive because it wraps defensively: `format(new Date(msg.createdAt), "HH:mm")` (`src/pages/Chat.tsx:280,467`) — `new Date()` accepts both a `Date` and an ISO string.

This is a latent bug, not a live one. The first piece of code that does `msg.createdAt.getTime()` — entirely reasonable given the type — throws.

### Decision

1. **Keep superjson on tRPC.** It is constraint C-4 and it is load-bearing: `Date` fidelity across the tRPC boundary is relied on by every cached query.
2. **Do not add superjson to Socket.IO.** Socket.IO's transformer story is not equivalent to tRPC's, it would add encoding overhead to the latency-critical path (`NFR-PERF-03`), and it would be a breaking payload change for any existing client (`API_CONTRACT.md §6.1`).
3. **Fix the types instead.** Define socket payload types in `contracts/` as the **wire** shape — timestamps as `string` — derived from the same Zod schemas as ADR-011 (`z.string().datetime()` on output types). The client parses at the boundary, once, into `Date`.
4. **One parse site.** A `parseMessage(wire): Message` helper in `contracts/` used by every socket handler on the client, so the conversion is not scattered across render code (as it is today at two call sites, and would be at more).
5. **Document the asymmetry in `API_CONTRACT.md §3.4`**, which already records it as H-SOCKET-DATE.

### Consequences

**Positive.** The declared type matches reality, so a future `msg.createdAt.getTime()` fails at compile time rather than at runtime. No change to the wire format, so nothing breaks. The socket path stays as cheap as possible on the hot send path. The parse helper is the natural place to also normalise `id` and apply the dedupe key of `TECH_SPEC.md §6.2`.

**Negative.** Two payload shapes exist for the same entity — a wire shape and a domain shape — and every socket handler must go through the parse boundary. That is genuinely more ceremony than "superjson everywhere". It is also the honest representation of what the transports actually do, and the alternative has a worse failure mode: a type that silently lies.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Add superjson to the Socket.IO transport** | Makes the types true and costs a breaking payload change plus per-frame encoding on the latency path. Reconsider only if socket payloads acquire types JSON cannot express (`Map`, `Set`, `BigInt`); today the only offender is `Date` |
| **Emit ISO strings from tRPC too (drop superjson)** | Violates C-4 and would touch every query consumer for no gain |
| **Leave the types as they are** | The current state, and it is a trap: the type says `Date`, the value is a string, and nothing fails until someone trusts the type |
| **Convert on the server before emitting (`createdAt: row.createdAt.toISOString()`)** | Identical wire output to today, and it makes the intent explicit at the emit site. Compatible with this ADR and worth doing as part of the payload-type work — it is a refinement, not an alternative |

---

## ADR-015 — Server-assigned `AUTO_INCREMENT` id is the ordering and recovery cursor

**Status:** Accepted
**Date:** 2026-08-12
**Requirements:** `FR-MSG-11` (Defective), `FR-MSG-10`, `NFR-REL-03`, `SRS.md §8.2` C-8

### Context

`messages.id` is `serial AUTO_INCREMENT` (`db/schema.ts:63`, DDL `db/migrations/0000_lumpy_marten_broadcloak.sql:41`). `messages.createdAt` is a MySQL `timestamp` with **1-second resolution** (`:49`), and history is ordered by `createdAt` alone:

```ts
// api/message-router.ts:56-58
.orderBy(desc(messages.createdAt)).limit(input.limit).offset(input.offset)
```

Two messages in the same second therefore order **arbitrarily**, and can order differently between two fetches — `FR-MSG-11`. Pagination compounds it: `OFFSET` means a message arriving between page fetches shifts every subsequent page by one (`FR-MSG-10`).

The reconnection design (`TECH_SPEC.md §5.4`) needs a cursor that is monotonic, gap-tolerant and comparable across clients. Timestamps are none of those.

### Decision

1. **`messages.id` is the total order within a conversation** and the cursor for every catch-up query.
2. **History ordering becomes `ORDER BY createdAt DESC, id DESC`** — a compatible, non-breaking change that makes the existing order deterministic.
3. **`messages.createdAt` widens to `timestamp(3)`** for display fidelity (`TECH_SPEC.md §15` Q-12 recommends widening this column only). This does **not** replace the `id` tiebreaker; millisecond precision reduces collisions, it does not eliminate them.
4. **Recovery uses `id`**: `message.listSince({ conversationId, sinceId })` (`TECH_SPEC.md §5.4` R-3), never a timestamp.
5. **Keyset pagination migrates to `(createdAt, id)`** when `FR-MSG-10` is addressed, replacing `OFFSET`. That is a breaking input/output change (`API_CONTRACT.md §6.1`) and ships as an additive `message.listPaged` alongside the existing procedure.
6. **`clientMsgId` (`TECH_SPEC.md §6.2`) is an idempotency key, not an ordering key.** It never participates in sort.

### Consequences

**Positive.** Deterministic ordering with a one-line change and no schema dependency. A single integer cursor is trivially comparable, and `WHERE id > ?` on IX-1 (`DATA_MODEL.md §3.3`) is an index range scan. Keyset pagination becomes possible on the same index. The client's dedupe key (`TECH_SPEC.md §6.5` O-3) is the same `id`, so ordering and deduplication share one identity.

**Negative.**

| Consequence | Detail |
|---|---|
| `id` is monotonic per **table**, not per conversation | Harmless for ordering (comparisons are within one conversation) but the values are sparse — never present them as message numbers |
| `id` leaks volume | A member can infer total system message count from ids. `NFR-SEC-05` cares about *enumeration*, which authorization prevents; volume inference is accepted. UUIDv7 primary keys would fix it at the cost of index locality and a full schema migration — not worth it |
| Auto-increment gaps | Rolled-back transactions consume ids. `listSince` must tolerate gaps — it does, since it selects `id > cursor` rather than counting |
| Multi-node writes are still totally ordered | Because `AUTO_INCREMENT` is assigned by MySQL, not by the app node. This is a real advantage over any client- or node-generated ordering key under ADR-006's future topology |
| Ordering ≠ causality | Two members sending simultaneously get an arbitrary but *stable* order. That is the correct trade for a chat product; causal ordering (vector clocks) would be absurd here |

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| **`createdAt` alone** | The current state, and the cause of `FR-MSG-11` |
| **`timestamp(6)` alone, no `id` tiebreaker** | Reduces collision probability without eliminating it, and provides no usable cursor for recovery — timestamp cursors are ambiguous exactly when ties occur |
| **UUIDv7 primary keys** | Time-sortable and globally unique, so they would work as a cursor. Costs: a full schema migration across every FK in `DATA_MODEL.md §3.1`, worse InnoDB clustered-index locality, and 16 bytes per key. The only benefit over `AUTO_INCREMENT` is hiding volume — see above |
| **A per-conversation sequence number** | Perfectly dense ordering per conversation, at the cost of a contended counter row per conversation on the hot write path. Directly contradicts `NFR-PERF-03` |
| **Client-generated timestamps** | Clocks are untrusted (`SRS.md §8.4` A-4: the server clock is authoritative). Non-starter |
