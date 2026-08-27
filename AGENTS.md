# AGENTS.md

**The operating policy for every AI coding agent working in this repository.**
Vendor-neutral. Claude Code, GitHub Copilot, Cursor, Codex, Aider — all of you, this file first.

Tool-specific files ([CLAUDE.md](CLAUDE.md), [.github/copilot-instructions.md](.github/copilot-instructions.md))
add tool-specific detail on top of this document. They never contradict it. If one appears to,
this file wins and the contradiction is a bug to report.

---

## 1. Project identity

| | |
|---|---|
| **Codebase name** | Alice Chains (`Mangu-Platforms/alice_chains`) |
| **Product name** | **Alisons** — the rename is planned as one cut and has not happened yet |
| **AI guest persona** | Alice |
| **What it is** | A self-hostable, real-time **messenger**: direct and group conversations, live delivery over WebSockets, typing indicators, read receipts, multi-device presence, contacts with requests and blocking, attachments, reactions, search and web push |
| **What it is not** | Not a music app, not a publishing tool. See [ALISONS.md](ALISONS.md) |
| **Stack** | React 19 · Vite 6 · Hono · tRPC v11 · Drizzle ORM · MySQL 8 · Socket.IO 4 · TypeScript (ESM) · Node ≥ 22 |
| **Auth** | Kimi OAuth 2.0 (`state` + PKCE S256) → HMAC-SHA256 signed session cookie. **Not JWTs**, despite the historical `JWT_SECRET` variable name |
| **Licence** | MIT ([LICENSE](LICENSE)) |

## 2. Current maturity

A **Phase 1–2 platform under active stabilization**, not a finished product.

The messaging core is real and works. Waves 0–4 of [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) have shipped
and most of Waves 5–7; the ordered queue with per-task status is [BACKLOG.md](BACKLOG.md).
Voice and video are icons only. End-to-end encryption is parked
([docs/ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md](docs/ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md) is Track B).
Known remaining gaps are inventoried in [docs/alisons/GAPS.md](docs/alisons/GAPS.md).

> **Status caveat.** [CURRENT_STATUS.md](CURRENT_STATUS.md) carries a 2026-08-25 handoff on top of a
> 2026-08-12 body that describes a repository state since fixed. The repository itself flags this as
> outstanding work (`STATUS` in [docs/alisons/GAPS.md](docs/alisons/GAPS.md)). **For what has actually
> shipped, trust [BACKLOG.md](BACKLOG.md) and [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) over the dated
> body of CURRENT_STATUS.md.** See §16.

## 3. Authoritative-document hierarchy

Each document owns a domain. Inside its domain it wins.

| Domain | Authority | Notes |
|---|---|---|
| Task ids, wave order, acceptance criteria | [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | [BACKLOG.md](BACKLOG.md) mirrors it one line per task; if they disagree, BUILD_PLAN wins |
| Requirement ids (`FR-*`, `NFR-*`) and their status | [docs/SRS.md](docs/SRS.md) | 164 numbered requirements |
| The wire contract — procedures, payloads, events, errors | [docs/API_CONTRACT.md](docs/API_CONTRACT.md) | **Normative.** [docs/API.md](docs/API.md) is a non-normative cheat sheet |
| Schema, constraints, indexes, migrations | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | `db/schema.ts` is the code source of truth; DATA_MODEL is the spec |
| Threats and controls (`SEC-C-*`) | [docs/SECURITY.md](docs/SECURITY.md) | Wins over TECH_SPEC on a control's content; TECH_SPEC wins on where it is wired |
| Test case ids (`TC-*`), strategy, exit criteria | [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Harness conventions live in [test/README.md](test/README.md) |
| Module design, env schema, build pipeline, observability | [docs/TECH_SPEC.md](docs/TECH_SPEC.md) | |
| Why it is built this way | [docs/ADR.md](docs/ADR.md) | An ADR is binding until superseded by another ADR |
| Product vision, competitive landscape, phases | [docs/PRD.md](docs/PRD.md) | §"Historical (June 2026)" is explicitly stale — [docs/SETUP.md](docs/SETUP.md) is authoritative on environment |
| Product read after the Alisons rename | [ALISONS.md](ALISONS.md) → [docs/alisons/](docs/alisons/README.md) | |
| The join across all of the above | [docs/TRACEABILITY.md](docs/TRACEABILITY.md) | **Never wins.** It reports; when it disagrees with a source, the source is right and the matrix is stale |
| Point-in-time state | [CURRENT_STATUS.md](CURRENT_STATUS.md) | Status, not specification — see the caveat in §2 |
| Runnable setup | [docs/SETUP.md](docs/SETUP.md) | |

The full index, with audience and update duty per document, is **[docs/README.md](docs/README.md)**.

**Code vs. spec.** If a spec and the code disagree, **the spec wins** — unless the code is
demonstrably correct, in which case fix the spec **in the same pull request** and say so in the
PR body ([CLAUDE.md](CLAUDE.md) rule 9, [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) G-8).

## 4. Mandatory reading order

Before you propose or make any change:

1. **This file.**
2. [docs/README.md](docs/README.md) — the documentation index; find the documents your change touches.
3. [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) — the ground rules (G-1…G-8) and the task card you are working.
4. [CURRENT_STATUS.md](CURRENT_STATUS.md) — what is known broken (read §2's caveat first).
5. **The authoritative document for your domain**, from the table in §3.
   Touching the API? [docs/API_CONTRACT.md](docs/API_CONTRACT.md). The schema?
   [docs/DATA_MODEL.md](docs/DATA_MODEL.md). Auth, sessions or input handling?
   [docs/SECURITY.md](docs/SECURITY.md). Tests? [docs/TEST_PLAN.md](docs/TEST_PLAN.md)
   and [test/README.md](test/README.md).
6. Claude Code only: [CLAUDE.md](CLAUDE.md). Copilot only: [.github/copilot-instructions.md](.github/copilot-instructions.md).

**[README.md](README.md) alone is not the specification.** It is a front door. Never treat it as the
complete statement of requirements, contracts or status.

## 5. Repository structure

```
api/          Hono server, tRPC routers, Socket.IO, OAuth, sessions
  kimi/       OAuth 2.0 code exchange, PKCE, session signing/verification
  lib/        env (Zod-validated), authz predicates, cookies, logger, metrics,
              rate limiting, search, sql helpers, audit
  *.test.ts   colocated router/integration tests
src/          React 19 client (Vite)
  pages/      Chat, Contacts, Settings, Login, NotFound
  components/ app components; shadcn/ui primitives under components/ui
  hooks/      useAuth, useSocket, usePersistedState, usePushNotifications
  lib/        composer, outbox, linkify, media, emoji
  i18n/       message catalogue (en)
db/           schema.ts (source of truth), relations.ts, migrations/ (forward-only)
contracts/    Zod schemas and constants shared by client, server and sockets
test/         harness: support/db.ts, support/http.ts, support/socket.ts, setup.ts
scripts/      dev.sh, seed.ts, check-a11y-labels.mjs, check-bundle-size.mjs,
              verify-constraint-migration.mjs, generate-vapid.mjs
docs/         all specifications — start at docs/README.md
  alisons/    the Alisons product bible
public/       favicon, service worker
.github/      CI workflow, PR template, Copilot instructions
```

Path aliases are defined in **four** places and must stay in sync:
`tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`.
Drift between them has already caused one CI failure.

## 6. Commands

Node **22.x**. The lockfile is committed: **`npm ci`, never `npm install`.**

| Command | What it does |
|---|---|
| `npm ci` | Install exactly the locked tree |
| `npm run dev:up` | Clean clone → running app: `.env`, install, database, migrations, dev servers (`scripts/dev.sh`, idempotent; `SKIP_DB=1` reuses your own MySQL) |
| `npm run dev` | Vite client on `:3000` + API on `:3001`, both watching |
| `npm run build` | `tsc` → Vite build to `dist/public` → esbuild bundle to `dist/boot.js` |
| `npm start` | Run the production build (single process, serves client + API) |
| **`npm run validate`** | **The gate:** typecheck → test → lint → a11y names → build → bundle budget |
| `npm run typecheck` / `npm run check` | `tsc --noEmit` |
| `npm test` | Vitest (integration suites skip without `TEST_DATABASE_URL`) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm run check:a11y` | Every icon-only control has an accessible name |
| `npm run check:bundle` | Initial JS payload against the NFR-PERF-06 budget |
| `npm run check:docs` | Every relative Markdown link resolves and every document is reachable — the governance rule in §12, made checkable. **Not** part of `validate`: run it whenever you touch documentation |
| `npm run db:generate` | Emit a migration from `db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations — **the canonical path** |
| `npm run db:push` | Sync schema without a migration — **scratch development only** |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | Demo members, a DM and a group, plus a session cookie each — **local databases only** |
| `npm run db:verify-migration` | Prove the constraint migration against a deliberately dirty scratch database |
| `npm run generate-vapid` | Generate a VAPID key pair for web push |

Database up: `docker compose up -d db` (MySQL 8.4 on `:3306`). Whole stack: `docker compose up`.

**CI runs more than `validate`** (`.github/workflows/ci.yml`): it provisions a MySQL 8.4 service,
sets `TEST_DATABASE_URL` so the integration and socket suites actually run, applies migrations
before the suite, then runs the full gate plus `db:verify-migration` and a from-zero migration of a
fresh database. A change that is green locally without `TEST_DATABASE_URL` can still fail CI —
run the integration suites yourself when you touch anything they cover:

```bash
docker compose up -d db
DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm run db:migrate
TEST_DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm test
```

## 7. Coding and architectural conventions

- **TypeScript, ESM, no `any` escapes.** `"type": "module"`; `tsc --noEmit` is part of the gate.
- **Validate at the boundary, at runtime.** TypeScript types vanish at compile time. Every socket
  payload and every tRPC input is parsed with a Zod schema; shared schemas live in `contracts/`.
- **Authorization lives in `api/lib/authz.ts`.** Membership and blocking predicates are written once
  and called everywhere. Do not re-implement a membership check inline.
- **Both write paths or neither.** Realtime writes go through Socket.IO; tRPC owns reads
  ([ADR-007](docs/ADR.md)). A rule enforced on only one path is not enforced. If you add or change a
  constraint on messages, apply it to the socket handler *and* the tRPC procedure.
- **One `Set-Cookie` emitter.** `api/lib/cookies.ts` is the only place session cookies are written.
- **Sessions are signed cookies, not JWTs.** `JWT_SECRET` is a historical name; a rename to
  `SESSION_SECRET` is planned (backlog H-7) and must keep backwards compatibility.
- **Keep the four alias definitions in sync** (§5).
- **Match the surrounding code.** Comment density, naming and idiom are already consistent; follow
  what is there rather than importing a different house style.
- **No new infrastructure without an ADR.** Supabase, Postgres, Redis, a queue, a search engine —
  none of it lands without the ADR that authorises it. MySQL is the decision of record
  ([ADR-001](docs/ADR.md)). Supabase Pro is not provisioned; do not design around it.

## 8. Database changes

1. Edit `db/schema.ts` (and `db/relations.ts` if relations change).
2. `npm run db:generate` to emit a **forward-only** migration into `db/migrations/`.
   Never hand-edit a generated migration's history; never delete or rewrite an applied migration.
3. `npm run db:migrate` to apply it. **Never `db:push` against anything you care about** —
   it is scratch development only ([ADR-005](docs/ADR.md)).
4. Update [docs/DATA_MODEL.md](docs/DATA_MODEL.md) in the same pull request: columns, constraints,
   indexes, `ON DELETE` justification, and the runbook if the migration needs one.
5. If the migration must survive existing dirty data, extend
   `scripts/verify-constraint-migration.mjs` and run `npm run db:verify-migration`.
6. Prove a **fresh** database still migrates from zero — CI does exactly this, and a migration that
   only applies on top of an already-migrated database is a deployment failure waiting to happen.

## 9. API-contract changes

Public contracts are the tRPC procedures and the Socket.IO events.

- **Do not change a procedure name, payload, error envelope, room or event without updating
  [docs/API_CONTRACT.md](docs/API_CONTRACT.md) in the same pull request.** It is normative and every
  entry carries a `file.ts:LINE` citation — update the citation too.
- [docs/API.md](docs/API.md) is a derived cheat sheet. Update it when the contract moves, but never
  treat it as the contract.
- Shared payload schemas belong in `contracts/`, imported by both the client and the server, so the
  two cannot drift.
- A contract change usually moves a requirement in [docs/SRS.md](docs/SRS.md) and a row in
  [docs/TRACEABILITY.md](docs/TRACEABILITY.md). Move them.

## 10. Security

Read [docs/SECURITY.md](docs/SECURITY.md) before touching auth, sessions, cookies, OAuth,
authorization, input handling, uploads, rate limiting or logging.

- **Never remove or weaken a security control to make a test pass.** If a control breaks a test, the
  test or the code is wrong — not the control. Say so and stop.
- **Never prefix a secret with `VITE_`.** Vite inlines every `VITE_*` variable into the public client
  bundle. The server refuses to boot if a `VITE_`-prefixed variable looks like a secret (SEC-C-24).
- **`APP_SECRET` and `JWT_SECRET` must be ≥ 32 characters.** The server enforces this at boot.
- **Never commit secrets, credentials, tokens, private keys, `.env` files or production data.**
  `.env` is git-ignored; keep it that way. Use `openssl rand -base64 32` for local secrets.
- **Never log message bodies or secrets.** Structured logs redact; do not add a field that defeats it.
- **Authorization is a membership check, every time.** A signed-in user is not an authorized user.
- New or changed controls get a `SEC-C-*` entry in [docs/SECURITY.md](docs/SECURITY.md) and a row in
  [docs/TRACEABILITY.md](docs/TRACEABILITY.md).

**Environment variables.** `api/lib/env.ts` is the authoritative schema — it Zod-validates
`process.env` at import time. Adding a variable means: add it to the schema **and** to
`.env.example` with a comment saying what it is for. `test/env-example.test.ts` fails in **both**
directions — an undocumented variable and a documented-but-unread one are each a test failure.
Document it in [docs/SETUP.md §3](docs/SETUP.md) and [docs/TECH_SPEC.md §8](docs/TECH_SPEC.md) too.

## 11. Testing

- **Every behavioural change ships with a test that fails before the change and passes after.**
  Red-proof it: disable your fix, watch the test fail, restore it. This is the repository's stated
  practice, not a suggestion ([test/README.md](test/README.md)).
- Case ids are catalogued in [docs/TEST_PLAN.md](docs/TEST_PLAN.md) (`TC-*`). Use an existing id
  where one fits; add the case to the catalogue when you invent one.
- Pick the right layer ([test/README.md](test/README.md)): `createCaller` for a procedure's own
  logic, `test/support/http.ts` for anything touching auth, cookies, superjson or error codes,
  `test/support/socket.ts` for realtime behaviour.
- **Prove the absence of an event, not just its presence.** A leak test asserts that `nextEvent(...)`
  *rejects* with a timeout.
- Integration suites skip without `TEST_DATABASE_URL`. A green `npm test` on a machine with no
  database proves less than you think — see §6.
- MySQL `TIMESTAMP` ordering and `fileParallelism` caveats are in [test/README.md](test/README.md).
  Read it before adding a suite.

## 12. Documentation duties

A change is not finished until the documents it invalidates are updated **in the same pull request**:

| You changed | Update |
|---|---|
| A requirement's meaning or status | [docs/SRS.md](docs/SRS.md) + [docs/TRACEABILITY.md](docs/TRACEABILITY.md) |
| A tRPC procedure or socket event | [docs/API_CONTRACT.md](docs/API_CONTRACT.md) (+ [docs/API.md](docs/API.md)) |
| The schema | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) |
| A security control | [docs/SECURITY.md](docs/SECURITY.md) + [docs/TRACEABILITY.md](docs/TRACEABILITY.md) |
| Tests or coverage | [docs/TEST_PLAN.md](docs/TEST_PLAN.md) |
| Task status | [BACKLOG.md](BACKLOG.md) (and the card in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)) |
| Something a newcomer must know to run it | [docs/SETUP.md](docs/SETUP.md) + [README.md](README.md) |
| A design decision | a new record in [docs/ADR.md](docs/ADR.md) |
| Anything that changes what is broken or shipped | [CURRENT_STATUS.md](CURRENT_STATUS.md) |

### Documentation governance

1. **Any new authoritative document MUST be linked from [docs/README.md](docs/README.md)**, with its
   purpose, audience, authority level and update duty.
2. **Any document required for onboarding, development, validation, deployment or contribution MUST
   also be discoverable from [README.md](README.md) or this file** — one click from the repository root.
3. **No critical instruction may exist only in an unlinked nested file.** If it matters, it is linked.
4. **Do not create a second source of truth.** Extend the authoritative document instead of writing a
   parallel one. Tool-specific agent files point back here; they do not restate policy.
5. When you add or move a document, fix every relative link that pointed at it.

**Run `npm run check:docs` after any documentation change.** It fails on a broken relative link, a
broken heading anchor, and on any document nothing links to. It is deliberately *not* part of
`npm run validate` — a documentation link is not a reason to fail a build that ships code — so it is
on you to run it.

## 13. Git, commits, branches, pull requests

- **One task, one commit, one pull request.** Title: `<TASK-ID>: <summary>`, where the id comes from
  [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) (e.g. `S-14: validate socket payloads at runtime`).
  Documentation-only work with no task card uses a conventional prefix — `docs:` or `chore:`.
- Never bundle unrelated tasks. Never widen scope inside a task: found something new? Add it to
  [BACKLOG.md](BACKLOG.md) and carry on.
- Work on a feature branch; never commit directly to `main`.
- The PR body follows [.github/pull_request_template.md](.github/pull_request_template.md).
  Fill the checklist honestly — an unchecked box with a reason is worth more than a checked lie.
- CI (`.github/workflows/ci.yml`) must be green on the pull request.
- Never force-push a branch someone else may have checked out. Never rewrite `main`.

## 14. Definition of done

A task is done when **all** of these hold:

- [ ] Acceptance criteria from the [BUILD_PLAN](docs/BUILD_PLAN.md) card are met
- [ ] Tests added or updated, and green — with the behavioural test red-proofed
- [ ] `npm run validate` exits 0, **actually executed**, not assumed
- [ ] CI is green on the pull request
- [ ] Documentation updated wherever behaviour changed (§12)
- [ ] Status and traceability updated ([BACKLOG.md](BACKLOG.md), [docs/TRACEABILITY.md](docs/TRACEABILITY.md))
- [ ] No secrets, credentials, generated artefacts or local environment files committed
- [ ] Remaining risks, skipped checks and unresolved conflicts stated in the pull request

## 15. Prohibited agent behaviour

**Never:**

- Claim a command passed unless you ran it and it exited 0. Paste or summarise the real output.
- Mark work complete while `npm run validate` is red, or while you have not run it.
- Invent requirements, commands, endpoints, environment variables, status claims or policies.
  Everything you assert must be traceable to this repository.
- Delete or weaken existing documentation to resolve a disagreement. Report the conflict (§16).
- Remove, disable, skip or quarantine a test to reach green. Fix the cause.
- Remove or weaken a security control to reach green.
- Commit secrets, credentials, tokens, private keys, `.env` files, production data,
  `node_modules`, `dist/`, coverage output or other generated junk.
- Run `npm install` (use `npm ci`) or `npm run db:push` against a database that matters.
- Add a dependency, service or infrastructure component without the ADR that authorises it.
- Change a public contract without updating [docs/API_CONTRACT.md](docs/API_CONTRACT.md).
- Change the schema without a generated forward-only migration and a DATA_MODEL update.
- Widen scope, refactor unrelated code, or reformat files your task does not touch.
- Replace `src/pages/Chat.tsx` with a Grok preview shell — the current stack is the dogfood
  messenger ([ALISONS.md](ALISONS.md)).
- Skip ahead in wave order because a later feature looks more interesting.

## 16. Conflicts and escalation

**When two documents disagree:**

1. Apply the precedence table in §3 and the Precedence note in [docs/README.md](docs/README.md).
2. If precedence settles it, follow the authority — and fix the losing document in the same pull
   request, saying what you changed and why.
3. If precedence does **not** settle it, **stop and report**. Do not silently pick one. State both
   positions, cite file and line, and put the question in the pull request body. Record it under
   "Known documentation conflicts" in [docs/README.md](docs/README.md) and, if it needs work, add a
   line to [BACKLOG.md](BACKLOG.md).

**When you are blocked:** say so explicitly. A blocker named in the pull request is useful; a
blocker worked around silently is a defect delivered.

**When you must skip a check:** name the check, say why it could not run, and say what would have to
be true to run it. Never let a skipped check read as a passed one.

**Known open conflicts** are listed in [docs/README.md](docs/README.md#known-documentation-conflicts).
