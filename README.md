<div align="center">

# Alice Chains

**A fast, self-hostable real-time messaging platform.**

Shipping name: **Alisons**. Codebase name until the one-cut rename: Alice Chains. AI guest: **Alice**.

React 19 · tRPC v11 · Hono · Drizzle ORM · MySQL 8 · Socket.IO 4 · TypeScript

[![CI](https://github.com/Mangu-Platforms/alice_chains/actions/workflows/ci.yml/badge.svg)](https://github.com/Mangu-Platforms/alice_chains/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

</div>

---

## What it is

Alice Chains is a dark-themed, self-hostable **messenger**: direct and group conversations, live message delivery over WebSockets, typing indicators, read receipts, presence across multiple devices, and a contacts system with requests and blocking. It signs you in through Kimi OAuth 2.0 and keeps you signed in with an HMAC-SHA256 signed session cookie.

It is a **Phase 1–2 platform under active stabilization**. The messaging core is real and works. Voice/video are icons. End-to-end encryption is parked. Read [CURRENT_STATUS.md](CURRENT_STATUS.md) before you deploy it anywhere that matters. Product bible after the Alisons rename: [ALISONS.md](ALISONS.md).

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
| `npm run reset:dev` | **destructive** — wipe the local database (and, unless `SKIP_DB=1`, the Docker volumes) and re-migrate. Refuses on a remote `DATABASE_URL`, names what it will destroy, asks you to type `reset` |
| `npm run compose:up` / `compose:down` / `compose:logs` | bring the Docker Compose stack up, down, or tail its logs |
| `npm run check:a11y` | assert every icon-only control has an accessible name |
| `npm run check:bundle` | assert the initial JS payload against the NFR-PERF-06 budget |
| `npm run generate-vapid` | generate a VAPID key pair for web push |
| `npm run db:verify-migration` | prove the constraint migration against a deliberately dirty scratch database |

## Configuration

Copy `.env.example` and fill it in. Every variable is documented there, and in full in [docs/TECH_SPEC.md §8](docs/TECH_SPEC.md).

Two rules the server enforces at boot rather than trusting you to remember:

- **`APP_SECRET` and `SESSION_SECRET` must be at least 32 characters.** Generate one with `openssl rand -base64 32`.
- **No secret may carry a `VITE_` prefix.**

`KIMI_AUTH_URL` and `PUBLIC_BASE_URL` must be bare origins — no path, no query.

## Tests

```bash
npm test                                    # unit tests; integration suites skip
TEST_DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm test
```

## Documentation

| Document | What it answers |
|---|---|
| [ALISONS.md](ALISONS.md) | **Product bible** — rename, features, pages, feasibility, documents to procure |
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

Waves 1–4 of [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) have shipped, and message-history pagination past 50 messages (H-9) since. Remaining work: split `Chat.tsx`, admin UI, calls beta. See [docs/alisons/GAPS.md](docs/alisons/GAPS.md).

## Contributing

`npm run validate` must be green. One task, one commit, one PR. Tests accompany behavioural changes. [CONTRIBUTING.md](CONTRIBUTING.md) is the entry point for a human contributor; [CLAUDE.md](CLAUDE.md) is the full working agreement, written for agentic contributions but binding on everyone.

## License

MIT — see [LICENSE](LICENSE).
