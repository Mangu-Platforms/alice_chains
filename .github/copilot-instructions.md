# GitHub Copilot instructions

> ## ▶ Read [`AGENTS.md`](../AGENTS.md) at the repository root before suggesting or making changes.
>
> **[`AGENTS.md`](../AGENTS.md) is the authoritative, cross-agent operating policy** for this
> repository: reading order, the authoritative-document hierarchy, commands, coding and
> architectural conventions, database and API-contract rules, security rules, testing rules, the
> git and pull-request workflow, the definition of done, and prohibited behaviour.
>
> This file adds **only** Copilot-specific guidance. It is not a second source of truth. Where the
> two appear to disagree, `AGENTS.md` wins.

## The 60-second orientation

Alice Chains (product name: **Alisons**) is a self-hostable real-time messenger.
React 19 + Vite 6 · Hono + tRPC v11 · Drizzle ORM on MySQL 8 · Socket.IO 4 · TypeScript, ESM, Node ≥ 22.
Auth is Kimi OAuth 2.0 (`state` + PKCE S256) into an HMAC-SHA256 **signed session cookie** — not a JWT,
despite the historical `JWT_SECRET` name.

Documentation index: [`docs/README.md`](../docs/README.md).
The gate: **`npm run validate`** (typecheck → test → lint → a11y → build → bundle budget).
Documentation check: **`npm run check:docs`** — run it after any Markdown change; it is not part of the gate.
Install with **`npm ci`**, never `npm install`.

## Copilot-specific guidance

### Completions and inline suggestions

- **This repository's specifications are long, and the answer is usually in them.** Before
  suggesting a tRPC procedure, socket event, table, column or environment variable, check that it
  exists: [`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md) is normative for the wire,
  [`docs/DATA_MODEL.md`](../docs/DATA_MODEL.md) for the schema, `.env.example` and `api/lib/env.ts`
  for environment variables. A plausible-looking invention is the failure mode here.
- **Prefer the existing helper over a new one.** Authorization predicates live in
  `api/lib/authz.ts`; session cookies are written **only** in `api/lib/cookies.ts`; shared Zod
  schemas and constants live in `contracts/`; realtime fan-out goes through `api/lib/realtime.ts`.
  Suggesting an inline membership check instead of `assertParticipant` is a defect, not a shortcut.
- **Both write paths, or neither.** Realtime writes go over Socket.IO and tRPC owns reads
  ([ADR-007](../docs/ADR.md)). A validation rule added to only one path is not enforced. If you
  complete a constraint on messages in `api/message-router.ts`, complete the matching one in
  `api/socket.ts` (and put the schema in `contracts/`).
- **Do not autocomplete secrets.** Never suggest a literal key, token, password or connection
  string. Never suggest a `VITE_`-prefixed name for anything secret — Vite inlines every `VITE_*`
  variable into the public client bundle, and the server refuses to boot when it detects one.
- **Do not suggest `npm install`, `npm run db:push`, or a hand-written SQL migration.** Migrations
  are generated: `npm run db:generate`, then `npm run db:migrate`.
- **Match the file you are in.** This codebase has a consistent comment style — comments explain the
  defect or decision behind the code, with task ids (`S-14`, `F-8`, `P-UX-3`) and `file.ts:LINE`
  citations. Follow it rather than adding restating-the-obvious comments.
- Tests are colocated in `api/` and `src/` as `*.test.ts(x)`; the harness lives in `test/support/`.
  Read [`test/README.md`](../test/README.md) before completing a new suite — the conventions
  (prove the *absence* of an event, `fileParallelism` off, MySQL timestamp resolution) are not
  guessable.

### Copilot code review

- Review against the authoritative documents, not against general best practice alone. A change that
  contradicts [`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md),
  [`docs/DATA_MODEL.md`](../docs/DATA_MODEL.md) or [`docs/SECURITY.md`](../docs/SECURITY.md) without
  updating them in the same pull request is a blocking finding.
- Flag: a behavioural change with no test; a schema change with no generated migration; a contract
  change with no `API_CONTRACT.md` update; a new environment variable missing from `.env.example`
  (`test/env-example.test.ts` fails in both directions); a security control weakened to make a test
  pass; scope beyond the single task the pull request claims.
- The pull-request checklist is [`.github/pull_request_template.md`](pull_request_template.md).

### Copilot coding agent (assigned issues and pull requests)

- Read [`AGENTS.md`](../AGENTS.md) in full, then the task card in
  [`docs/BUILD_PLAN.md`](../docs/BUILD_PLAN.md) whose id the issue names. If the issue names no task
  id, say so rather than inventing one.
- **One task, one commit, one pull request**, titled `<TASK-ID>: <summary>`.
- Run `npm run validate` and report its **actual** output. Never claim a command passed that you did
  not run. If you could not run it — no database, no network — say which check was skipped and why.
- Integration and Socket.IO suites skip without `TEST_DATABASE_URL`, so a green `npm test` locally
  does not predict CI. See [`AGENTS.md` §6](../AGENTS.md).
- Update the documentation your change invalidates, in the same pull request
  ([`AGENTS.md` §12](../AGENTS.md)).

### Scoped instructions

There are no `.github/instructions/*.instructions.md` files in this repository, and none are needed:
the per-area rules that would live in them (`api/`, `db/`, `src/`, `test/`, `docs/`) are already in
[`AGENTS.md`](../AGENTS.md) §§5–12 and in the authoritative documents it links. Add a scoped file
only when a directory genuinely needs a rule that would be wrong elsewhere — and link it from
[`docs/README.md`](../docs/README.md) when you do, per the documentation-governance rule.
