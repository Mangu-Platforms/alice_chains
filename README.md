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

---

## Start here

> **AI coding agents: read [AGENTS.md](AGENTS.md) before proposing or making any change.**
> It is the cross-agent operating policy — reading order, commands, conventions, prohibited
> behaviour and the definition of done. This README is a front door, **not** the specification.

**The full documentation index, with authority and update duty per document, is [docs/README.md](docs/README.md).**

### Evaluators and product readers

| | |
|---|---|
| [ALISONS.md](ALISONS.md) | Product overview and vision — what this is, and what it is not |
| [docs/alisons/README.md](docs/alisons/README.md) | The product bible: white paper, features, IA, user stories, feasibility, gaps |
| [docs/PRD.md](docs/PRD.md) | Product requirements and design v2.0 — vision, competitive landscape, phases |
| [CURRENT_STATUS.md](CURRENT_STATUS.md) | Current implementation status — what works, what is broken |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phases 1–4, milestones, and why the MLS track is parked |

### Developers and contributors

| | |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute: branch, commit, validate, pull request |
| [docs/SETUP.md](docs/SETUP.md) | Runnable setup from zero, with a troubleshooting table |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | The implementation plan — every task card, in wave order, with acceptance criteria |
| [BACKLOG.md](BACKLOG.md) | The ordered backlog, one line per task |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The system as it exists today, in five minutes |
| [docs/TECH_SPEC.md](docs/TECH_SPEC.md) | Technical specification — module design, env schema, build pipeline, observability |
| [docs/SRS.md](docs/SRS.md) | Software requirements — 164 numbered requirements and their status |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Data model — tables, constraints, indexes, migration runbook |
| [docs/API_CONTRACT.md](docs/API_CONTRACT.md) | The normative wire contract — every tRPC procedure and socket event |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model and the `SEC-C-*` control catalogue |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Test plan — strategy, the `TC-*` case catalogue, exit criteria |
| [test/README.md](test/README.md) | The test harness and the conventions that keep suites honest |
| [docs/TRACEABILITY.md](docs/TRACEABILITY.md) | Traceability — requirement → task → test → control, with the P0 release gate |
| [docs/ADR.md](docs/ADR.md) | Architecture decision records — why it is built this way |

### AI coding agents

| | |
|---|---|
| **[AGENTS.md](AGENTS.md)** | **Read this first.** The vendor-neutral operating policy for every agent |
| [CLAUDE.md](CLAUDE.md) | Claude-specific additions on top of AGENTS.md |
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | Copilot-specific additions on top of AGENTS.md |
| [docs/README.md](docs/README.md) | Which document is authoritative for which question |

### Deployment and operations

| | |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Prerequisites, environment, database, containers, troubleshooting |
| [.env.example](.env.example) | Every environment variable the code reads, documented inline |
| [docs/TECH_SPEC.md](docs/TECH_SPEC.md) | Environment contract, build pipeline, observability, rollout |
| [docker-compose.yml](docker-compose.yml) · [Dockerfile](Dockerfile) | The container stack |
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | What CI runs, and the required checks |

---

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

The long-form version, with a troubleshooting table, is [docs/SETUP.md](docs/SETUP.md).

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
| `npm run check:docs` | assert every relative documentation link resolves and every document is reachable |
| `npm run generate-vapid` | generate a VAPID key pair for web push |
| `npm run db:verify-migration` | prove the constraint migration against a deliberately dirty scratch database |

## Configuration

Copy `.env.example` and fill it in. Every variable is documented there, and in full in [docs/TECH_SPEC.md §8](docs/TECH_SPEC.md) and [docs/SETUP.md §3](docs/SETUP.md).

Two rules the server enforces at boot rather than trusting you to remember:

- **`APP_SECRET` and `JWT_SECRET` must be at least 32 characters.** Generate one with `openssl rand -base64 32`.
- **No secret may carry a `VITE_` prefix.**

`VITE_KIMI_AUTH_URL` and `PUBLIC_BASE_URL` must be bare origins — no path, no query.

## Tests

```bash
npm test                                    # unit tests; integration suites skip
TEST_DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm test
```

Integration and Socket.IO suites opt in through `TEST_DATABASE_URL`; CI always sets it. The harness, its layers and its conventions are documented in [test/README.md](test/README.md).

## Documentation

**Start at the index: [docs/README.md](docs/README.md)** — every document, with its purpose, audience, authority level and when it must be updated.

| Document | What it answers |
|---|---|
| [AGENTS.md](AGENTS.md) | **AI agents:** what to read, what to run, what is forbidden, when it is done |
| [CONTRIBUTING.md](CONTRIBUTING.md) | **Humans:** how to get a change reviewed and merged |
| [docs/README.md](docs/README.md) | Which document is authoritative for which question |
| [ALISONS.md](ALISONS.md) | **Product bible** — rename, features, pages, feasibility, documents to procure |
| [CURRENT_STATUS.md](CURRENT_STATUS.md) | What works, what is broken, what was just fixed |
| [docs/SETUP.md](docs/SETUP.md) | How to run it, from zero, with troubleshooting |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | What to build next, in order, with acceptance criteria |
| [docs/SRS.md](docs/SRS.md) | 164 numbered requirements and their current status |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The system as it exists today |
| [docs/TECH_SPEC.md](docs/TECH_SPEC.md) | Technical design |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Schema, constraints, indexes, migrations |
| [docs/API_CONTRACT.md](docs/API_CONTRACT.md) | Every tRPC procedure and socket event |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model and controls |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Test strategy and case catalogue |
| [test/README.md](test/README.md) | The test harness and its conventions |
| [docs/TRACEABILITY.md](docs/TRACEABILITY.md) | Which task builds each requirement and which test proves it |
| [docs/ADR.md](docs/ADR.md) | Why it is built this way |
| [BACKLOG.md](BACKLOG.md) | The ordered backlog |
| [CLAUDE.md](CLAUDE.md) | Claude-specific working agreement |

## Status

Phase 1 (core messaging) is implemented. `npm ci && npm run validate` is green.

Waves 1–4 of [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) have shipped, along with most of Waves 5–7; per-task status is in [BACKLOG.md](BACKLOG.md). Remaining work: pagination past 50 messages, split `Chat.tsx`, admin UI, calls beta. See [docs/alisons/GAPS.md](docs/alisons/GAPS.md).

> [CURRENT_STATUS.md](CURRENT_STATUS.md) carries a current handoff on top of an older body that is
> known to be stale. For what has actually shipped, [BACKLOG.md](BACKLOG.md) and
> [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) are current — see
> [docs/README.md § Known documentation conflicts](docs/README.md#known-documentation-conflicts).

## Contributing

`npm run validate` must be green. One task, one commit, one PR. Tests accompany behavioural changes.

- **Humans:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **AI agents:** [AGENTS.md](AGENTS.md), then [CLAUDE.md](CLAUDE.md) or [.github/copilot-instructions.md](.github/copilot-instructions.md)

## License

MIT — see [LICENSE](LICENSE).
