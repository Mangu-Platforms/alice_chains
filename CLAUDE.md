# CLAUDE.md — working agreement for Claude Code

This file is the entry point for agentic work on Alice Chains. Read it, then read [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md), then start at the first unfinished task.

## What this project is

Alice Chains is a self-hostable real-time messaging platform (the Slack/WhatsApp category). React 19 + Vite 6 client, Hono + tRPC v11 server, Drizzle ORM on MySQL 8, Socket.IO 4, Kimi OAuth 2.0 with an HMAC-SHA256 signed session cookie.

## Start here

```bash
npm ci                    # lockfile is committed — never `npm install`
cp .env.example .env      # fill in the OAuth values
docker compose up -d db
npm run db:migrate
npm run dev               # client :3000, API :3001
npm run validate          # typecheck → test → lint → build; must be green
```

If `npm run validate` is not green on a clean checkout, stop and fix that first — nothing else can be trusted until it is.

## The rules

1. **`npm run validate` must pass before any task is done.** No exceptions, no "I'll fix the types later".
2. **One task, one commit, one PR**, titled `<TASK-ID>: <summary>`. Task IDs come from [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).
3. **Every behavioural change ships with a test** that fails before and passes after. Case IDs are catalogued in [docs/TEST_PLAN.md](docs/TEST_PLAN.md).
4. **Work in wave order.** Wave 1 closes authorization holes; it ships before any feature work. Do not skip ahead because a feature looks more fun.
5. **Never widen scope inside a task.** Found something new? Add it to [BACKLOG.md](BACKLOG.md) and carry on.
6. **Schema changes are forward-only migrations** via `npm run db:generate`. `db:push` is scratch-development only.
7. **Do not add infrastructure** — Supabase, Postgres, Redis, a queue — without the ADR that authorises it. MySQL is the decision of record ([ADR-001](docs/ADR.md)).
8. **Never prefix a secret with `VITE_`.** Vite inlines every `VITE_*` variable into the public client bundle.
9. **If a spec and the code disagree**, the spec wins unless the code is demonstrably correct — then fix the spec in the same PR and say so.
10. **Keep the four alias definitions in sync**: `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`. Drift between them has already caused one CI failure.

## Which document answers which question

| Question | Document |
|---|---|
| What must the product do? | [docs/SRS.md](docs/SRS.md) |
| How is it designed? | [docs/TECH_SPEC.md](docs/TECH_SPEC.md) |
| What do I build next, and how do I know it's done? | [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) |
| What are the tables, constraints and indexes? | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) |
| What is the exact wire contract? | [docs/API_CONTRACT.md](docs/API_CONTRACT.md) |
| What are the threats and controls? | [docs/SECURITY.md](docs/SECURITY.md) |
| What tests exist and which are owed? | [docs/TEST_PLAN.md](docs/TEST_PLAN.md) |
| Who builds this requirement, and what proves it works? | [docs/TRACEABILITY.md](docs/TRACEABILITY.md) |
| Why is it built this way? | [docs/ADR.md](docs/ADR.md) |
| What is broken right now? | [CURRENT_STATUS.md](CURRENT_STATUS.md) |

## Things that will bite you

- **Realtime writes go through Socket.IO, not tRPC.** No tRPC procedure emits a socket event (`getIO()` has zero call sites). So the stricter validation on the tRPC path — including the 4000-character message cap — is never exercised in practice, because the UI sends via the socket. Fix both paths or move writes to tRPC ([ADR-007](docs/ADR.md)).
- **Socket payloads are not validated at runtime.** They are destructured with TypeScript types, which vanish at compile time.
- **The `try/catch` duplicate-key handlers are dead code.** There are no unique constraints yet, so nothing can throw. Adding the constraints (S-3) is what makes them meaningful — or lets you delete them for `onDuplicateKeyUpdate`.
- **`conversations.updatedAt` is never written**, yet `conversation.list` orders by it. Sorting looks like recency and is actually creation order.
- **`JWT_SECRET` was a misnomer.** Sessions are HMAC-SHA256 signed cookies, not JWTs. Renamed to `SESSION_SECRET` in H-7, with `JWT_SECRET` still accepted, deprecated, for one release (ADR-002). `VITE_KIMI_AUTH_URL`/`VITE_APP_ID` were renamed the same way, to `KIMI_AUTH_URL`/`KIMI_APP_ID` — both were read only on the server even before the rename.
- **`OWNER_UNION_ID` does nothing.** It is parsed and exposed via `getOwnerUnionId()`, which has zero call sites. There is no admin capability today.
- **Lint after a build used to explode.** `eslint.config.js` now ignores `dist/**`; keep it that way.
- **Supabase Pro is not provisioned.** Nothing depends on it. Do not design around it.

## Definition of done

Acceptance criteria met · tests added and green · `npm run validate` green · CI green on the PR · documentation updated if behaviour changed.
