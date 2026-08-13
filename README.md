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
| `npm run dev` | Vite client on :3000 + API on :3001, both watching |
| `npm run build` | typecheck, build the client to `dist/public`, bundle the server to `dist/boot.js` |
| `npm start` | run the production build (single process, serves client + API) |
| `npm run validate` | **the gate** — typecheck → test → lint → build |
| `npm test` | Vitest |
| `npm run db:generate` | emit a migration from `db/schema.ts` |
| `npm run db:migrate` | apply pending migrations (canonical) |
| `npm run db:push` | sync schema without a migration — **scratch development only** |
| `npm run db:studio` | Drizzle Studio |

## Configuration

Copy `.env.example` and fill it in. Every variable is documented there, and in full in [docs/TECH_SPEC.md §8](docs/TECH_SPEC.md).

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

Phase 1 (core messaging) is implemented. The build was restored in August 2026 — `index.html` had never been committed and several declared dependencies were missing, so the project could not build from a clean clone. `npm ci && npm run validate` is now green.

Known defects, in priority order, are in [CURRENT_STATUS.md §3](CURRENT_STATUS.md) and scheduled in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md). The short version: several authorization checks are missing, the schema has no foreign keys or indexes, and test coverage is one file. Fix those before running this in production.

## Contributing

`npm run validate` must be green. One task, one commit, one PR. Tests accompany behavioural changes. See [CLAUDE.md](CLAUDE.md) for the full working agreement.

## License

MIT — see [LICENSE](LICENSE).
