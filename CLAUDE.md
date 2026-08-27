# CLAUDE.md — Claude-specific working agreement

> ## ▶ Read [AGENTS.md](AGENTS.md) first.
>
> **[AGENTS.md](AGENTS.md) is the authoritative, cross-agent operating policy for this repository** —
> reading order, the authoritative-document hierarchy, commands, conventions, database and API
> rules, security rules, testing rules, the git workflow, the definition of done, and the list of
> prohibited behaviour. It applies to Claude exactly as it applies to every other agent.
>
> **This file adds only what is Claude-specific.** It does not restate AGENTS.md, and it never
> overrides it. If the two appear to disagree, AGENTS.md wins and the disagreement is a bug —
> report it in your pull request.

After AGENTS.md: read [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md), then start at the first unfinished
task. The full documentation index is [docs/README.md](docs/README.md).

## What this project is

Alice Chains is a self-hostable real-time messaging platform (the Slack/WhatsApp category). React 19 + Vite 6 client, Hono + tRPC v11 server, Drizzle ORM on MySQL 8, Socket.IO 4, Kimi OAuth 2.0 with an HMAC-SHA256 signed session cookie.

## Start here

```bash
npm ci                    # lockfile is committed — never `npm install`
cp .env.example .env      # fill in the OAuth values
docker compose up -d db
npm run db:migrate
npm run dev               # client :3000, API :3001
npm run validate          # typecheck → test → lint → a11y → build → bundle budget; must be green
```

If `npm run validate` is not green on a clean checkout, stop and fix that first — nothing else can be trusted until it is.

## The rules

These are the repository's ground rules, restated here because Claude sessions start from this file.
They are the same rules as [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) G-1…G-8, and
[AGENTS.md](AGENTS.md) is where they are expanded.

1. **`npm run validate` must pass before any task is done.** No exceptions, no "I'll fix the types later". Run it. Never report a pass you did not observe.
2. **One task, one commit, one PR**, titled `<TASK-ID>: <summary>`. Task IDs come from [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).
3. **Every behavioural change ships with a test** that fails before and passes after. Case IDs are catalogued in [docs/TEST_PLAN.md](docs/TEST_PLAN.md).
4. **Work in wave order.** Wave 1 closed the authorization holes and shipped before any feature work; that ordering is the point. Do not skip ahead because a feature looks more fun.
5. **Never widen scope inside a task.** Found something new? Add it to [BACKLOG.md](BACKLOG.md) and carry on.
6. **Schema changes are forward-only migrations** via `npm run db:generate`. `db:push` is scratch-development only.
7. **Do not add infrastructure** — Supabase, Postgres, Redis, a queue — without the ADR that authorises it. MySQL is the decision of record ([ADR-001](docs/ADR.md)).
8. **Never prefix a secret with `VITE_`.** Vite inlines every `VITE_*` variable into the public client bundle.
9. **If a spec and the code disagree**, the spec wins unless the code is demonstrably correct — then fix the spec in the same PR and say so.
10. **Keep the four alias definitions in sync**: `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`. Drift between them has already caused one CI failure.

## Which document answers which question

The full index — with each document's audience, authority level and update duty — is
**[docs/README.md](docs/README.md)**. The precedence rules are in
[AGENTS.md §3](AGENTS.md) and [docs/README.md § Precedence](docs/README.md#precedence).

The short version: [docs/SRS.md](docs/SRS.md) for *what*, [docs/TECH_SPEC.md](docs/TECH_SPEC.md) for
*how*, [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) for *what next and when it is done*,
[docs/API_CONTRACT.md](docs/API_CONTRACT.md) for the wire,
[docs/DATA_MODEL.md](docs/DATA_MODEL.md) for the schema,
[docs/SECURITY.md](docs/SECURITY.md) for threats and controls,
[docs/ADR.md](docs/ADR.md) for why, and [CURRENT_STATUS.md](CURRENT_STATUS.md) for what is broken now.

## Things that will bite you

Verified against the tree on 2026-08-27. Several hazards this list has carried since Wave 0 are now
closed; they are kept, marked, with the evidence — an agent who read the old wording and "fixed" an
already-fixed defect is a real failure mode here.

**Still live:**

- **`JWT_SECRET` is a misnomer.** Sessions are HMAC-SHA256 signed cookies, not JWTs. A rename to `SESSION_SECRET` is planned (backlog H-7); keep backwards compatibility when you do it.
- **`VITE_KIMI_AUTH_URL` and `VITE_APP_ID` are read on the server only.** Since S-4 the client builds no provider URL at all, so the `VITE_` prefix is now misleading — it is historical, not a signal that the value is client-side. Renaming them is backlog H-7 as well.
- **Lint after a build used to explode.** `eslint.config.js` ignores `dist/**`, `db/migrations/**` and `coverage/**`; keep it that way. If lint suddenly reports ~1900 errors, that ignores block has been removed — restore it rather than deleting `dist/`.
- **Supabase Pro is not provisioned.** Nothing depends on it. Do not design around it ([ADR-001](docs/ADR.md)).
- **History stops at fifty messages.** `message.listByConversation` takes `limit`/`offset`; the client passes `limit: 50` and never moves. Backlog H-9.
- **Integration suites skip silently without `TEST_DATABASE_URL`.** A green `npm test` locally proves less than CI does — see [test/README.md](test/README.md).

**Closed — do not "fix" these again:**

- ~~Realtime writes go through Socket.IO and no tRPC procedure emits a socket event (`getIO()` has zero call sites).~~ **Partly closed.** `api/lib/realtime.ts` is the shared fan-out shape and `getIO()` now has call sites (`api/lib/realtime.ts:34`, `api/admin-router.ts:44`, `api/message-router.ts:310`). The defect is being closed **one write path at a time, as each is touched** ([ADR-007](docs/ADR.md)) — so when you touch a tRPC write, emit through `api/lib/realtime.ts` rather than leaving the client to re-fetch.
- ~~Socket payloads are not validated at runtime.~~ **Closed by S-14.** `api/socket.ts:66` runs `SOCKET_EVENT_SCHEMAS[event].safeParse(raw)` against the shared Zod schemas in `contracts/socket-events.ts`. The 4000-character cap (`MAX_MESSAGE_LENGTH`, `contracts/constants.ts:81`) is now enforced on **both** paths.
- ~~The `try/catch` duplicate-key handlers are dead code because there are no unique constraints.~~ **Closed by S-3.** `db/schema.ts` carries the unique indexes (`cp_conversation_user_uq`, `message_reads_message_user_uq`, `message_reactions_msg_user_emoji_uq`, and more), and the call sites now use `onDuplicateKeyUpdate` rather than exception-driven handling.
- ~~`conversations.updatedAt` is never written, yet `conversation.list` orders by it.~~ **Closed by S-11.** `api/conversation-router.ts:93` touches it, shared with the socket path.
- ~~`OWNER_UNION_ID` does nothing; `getOwnerUnionId()` has zero call sites.~~ **Closed by S-18.** `api/queries/users.ts:17` reconciles `users.role` against it on every sign-in. There is an admin capability and an audit trail; there is still no `/admin` **screen** (`ADMIN-UI` in [docs/alisons/GAPS.md](docs/alisons/GAPS.md)).

## Definition of done

Acceptance criteria met · tests added and green · `npm run validate` green · CI green on the PR · documentation updated if behaviour changed · status and traceability updated · remaining risks stated.

The full checklist is [AGENTS.md §14](AGENTS.md) and [.github/pull_request_template.md](.github/pull_request_template.md).
