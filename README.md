<div align="center">

# Alice Chains

**A fast, self-hostable real-time messaging platform.**

React 19 · tRPC v11 · Hono · Drizzle ORM · MySQL 8 · Socket.IO 4 · TypeScript

[![CI](https://github.com/Mangu-Platforms/alice_chains/actions/workflows/ci.yml/badge.svg)](https://github.com/Mangu-Platforms/alice_chains/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

</div>

---

## What it is

Alice Chains is a dark-themed, self-hostable chat platform: direct and group conversations, live message delivery over WebSockets, typing indicators, read receipts, presence across multiple devices, and a contacts system with requests and blocking. It signs you in through Kimi OAuth 2.0 and keeps you signed in with an HMAC-SHA256 signed session cookie.

It is a **Phase 1 platform under active stabilization**. The messaging core is real and works; a set of authorization and integrity defects are documented and being fixed in order. Read [CURRENT_STATUS.md](CURRENT_STATUS.md) before you deploy it anywhere that matters.

## Quick start

```bash
git clone https://github.com/Mangu-Platforms/alice_chains.git
cd alice_chains
./scripts/dev.sh              # client → http://localhost:3000, API → :3001
```

`scripts/dev.sh` checks your Node version, writes a `.env` with freshly
generated secrets if you have none, installs from the lockfile, brings MySQL up
and waits for it to be genuinely ready, migrates, and starts both dev servers.
It is idempotent. `SKIP_DB=1` uses a MySQL you already have.

Then `npm run db:seed` for two demo accounts, a direct conversation and a
group — no OAuth provider needed.

By hand, if you would rather see every step:

```bash
cp .env.example .env          # fill in your OAuth values
npm ci                        # lockfile is committed — do not use `npm install`

docker compose up -d db       # MySQL 8.4 on :3306
npm run db:migrate            # apply migrations

npm run dev                   # client → http://localhost:3000, API → :3001
```

Or run the whole stack in containers:

```bash
docker compose up             # app on http://localhost:3000
```

## Scripts

| Script | Does |
|---|---|
| `npm run dev:up` | **from a clean clone to a running app** — `.env`, install, database, migrations, dev servers |
| `npm run dev` | Vite client on :3000 + API on :3001, both watching |
| `npm run build` | typecheck, build the client to `dist/public`, bundle the server to `dist/boot.js` |
| `npm start` | run the production build (single process, serves client + API) |
| `npm run validate` | **the gate** — typecheck → test → lint → accessible names → build → bundle budget |
| `npm test` | Vitest |
| `npm run db:generate` | emit a migration from `db/schema.ts` |
| `npm run db:migrate` | apply pending migrations (canonical) |
| `npm run db:push` | sync schema without a migration — **scratch development only** |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | demo members, a direct conversation and a group, plus a working session cookie for each — **local databases only** |
| `npm run check:a11y` | assert every icon-only control has an accessible name |
| `npm run check:bundle` | assert the initial JS payload against the NFR-PERF-06 budget |
| `npm run generate-vapid` | generate a VAPID key pair for web push |
| `npm run db:verify-migration` | prove the constraint migration against a deliberately dirty scratch database — dedupe, orphan handling, and the abort on a RESTRICT orphan |

## Configuration

Copy `.env.example` and fill it in. Every variable is documented there, and in full in [docs/TECH_SPEC.md §8](docs/TECH_SPEC.md).

Two rules the server enforces at boot rather than trusting you to remember:

- **`APP_SECRET` and `JWT_SECRET` must be at least 32 characters.** Generate one with `openssl rand -base64 32`. The process refuses to start below that — a one-character HMAC key made every session in the deployment forgeable.
- **No secret may carry a `VITE_` prefix.** Vite inlines every `VITE_*` variable into the public client bundle, so a prefixed secret is published to every visitor. Startup fails naming the offending variable.

`VITE_KIMI_AUTH_URL` and `PUBLIC_BASE_URL` must be bare origins — no path, no query. The server derives every OAuth endpoint from them and refuses a value carrying a path, naming the corrected one.

## Tests

```bash
npm test                                    # unit tests; integration suites skip
TEST_DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm test
```

Integration and Socket.IO suites need a MySQL database and opt in through `TEST_DATABASE_URL`. Without it they skip rather than fail, so `npm run validate` is green on a machine with no database. See [test/README.md](test/README.md) for which harness layer to reach for.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request. It brings up a MySQL 8.4 service container, applies migrations, then runs the full gate — typecheck → test → lint → build — followed by the migration verifier and a from-zero migration of an empty database. Because `TEST_DATABASE_URL` is set, the integration and socket suites actually run there rather than skipping.

Two things cannot be committed and need a maintainer:

- **Make `validate` a required status check on `main`** (Settings → Branches → branch protection). Until then a red build can still merge. Tracked as S-12b.
- **Coverage publication** needs `@vitest/coverage-v8`, which changes the lockfile; the working agreement puts that behind an explicit decision. Tracked as S-12a.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | MySQL 8 connection string |
| `VITE_KIMI_AUTH_URL` | yes | Provider **origin only** — no path, no trailing slash |
| `VITE_APP_ID` | yes | OAuth client id |
| `APP_SECRET` | yes | OAuth client secret — server-side only |
| `JWT_SECRET` | yes | Session signing key (≥ 32 random bytes). Historical name; sessions are HMAC, not JWT |
| `PUBLIC_BASE_URL` | prod | Canonical public origin; required behind any reverse proxy |
| `PORT` / `API_PORT` | no | 3000 / 3001 |

> ⚠️ Never prefix a secret with `VITE_` — Vite inlines those into the public client bundle.

## Architecture

```
Browser (React 19 SPA)
   │  tRPC over HTTP  ──►  /api/trpc      ─┐
   │  Socket.IO       ──►  /socket.io      ├─►  Hono server  ──►  MySQL 8 (Drizzle)
   │  OAuth redirect  ──►  /api/oauth/*   ─┘         │
                                                     └──►  Kimi identity provider
```

In development Vite serves the client on `:3000` and proxies `/api` and `/socket.io` to the API on `:3001`. In production a single Node process serves the built client and the API on `:3000`.

Details in [docs/TECH_SPEC.md](docs/TECH_SPEC.md); the wire contract in [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

## Documentation

| Document | What it answers |
|---|---|
| [CURRENT_STATUS.md](CURRENT_STATUS.md) | What works, what is broken, what was just fixed |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | What to build next, in order, with acceptance criteria |
| [docs/SRS.md](docs/SRS.md) | 164 numbered requirements and their current status |
| [docs/TECH_SPEC.md](docs/TECH_SPEC.md) | Technical design |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Schema, constraints, indexes, migrations |
| [docs/API_CONTRACT.md](docs/API_CONTRACT.md) | Every tRPC procedure and socket event |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model and controls |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Test strategy and case catalogue |
| [docs/TRACEABILITY.md](docs/TRACEABILITY.md) | Which task builds each requirement and which test proves it |
| [docs/ADR.md](docs/ADR.md) | Why it is built this way |
| [BACKLOG.md](BACKLOG.md) | The ordered backlog |
| [CLAUDE.md](CLAUDE.md) | Working agreement for agentic contributions |

## Status

Phase 1 (core messaging) is implemented. `npm ci && npm run validate` is green.

Waves 1–3 of [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) have shipped:

- **Wave 1 — authorization.** `message.markAsRead` performed no authorization at all; conversation creation accepted arbitrary user ids and ignored blocking; `contact.searchUsers` returned every match's email on a one-character query; presence was broadcast to every connected socket. All closed, on both the tRPC and Socket.IO paths, through one shared predicate module. OAuth gained `state` and PKCE, and sessions gained a server-side record so logout revokes on every device.
- **Wave 2 — integrity.** The schema had 0 foreign keys and 0 indexes. It now has 11 foreign keys, 3 unique constraints and 9 indexes, with a migration that dedupes and refuses to guess where a decision belongs to a human. `conversations.updatedAt` is written, so the sidebar is sorted by recency rather than creation order, and unread counts exist.
- **Wave 3 — tests.** One test became 169 assertions across router, HTTP and two-client Socket.IO layers, running in CI against a real MySQL.

What remains is scheduled in [BACKLOG.md](BACKLOG.md): Wave 4 features (unreads in the UI, edit/delete, reactions, attachments, push, group management, blocking end to end) and Wave 5 hardening (rate limiting, socket payload validation, observability, admin capability, accessibility).

## Contributing

`npm run validate` must be green. One task, one commit, one PR. Tests accompany behavioural changes. See [CLAUDE.md](CLAUDE.md) for the full working agreement.

## License

MIT — see [LICENSE](LICENSE).
