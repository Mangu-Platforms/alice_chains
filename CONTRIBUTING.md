# Contributing to Alice Chains

This is the short version of [CLAUDE.md](CLAUDE.md), which is the actual
working agreement — read that one before touching anything non-trivial. This
document exists because "read CLAUDE.md" is a strange first line for a human
contributor to land on, and because a project's contribution rules belong
where contributors look for them.

## Before you write any code

1. Get the repository running: [docs/SETUP.md](docs/SETUP.md), or the short
   version —

   ```bash
   git clone https://github.com/Mangu-Platforms/alice_chains.git
   cd alice_chains
   ./scripts/dev.sh
   ```

2. Confirm the gate is green on a clean checkout:

   ```bash
   TEST_DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm run validate
   ```

   If it is not green before you have changed a line, stop and say so rather
   than building on top of it — nothing else can be trusted until it is.

3. Read [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) and start at the first
   unfinished task in wave order. Do not skip ahead to a later wave because it
   looks more interesting; Wave 1 closes authorization holes and ships before
   any feature work, for reasons that stop being abstract the moment someone
   finds the hole first.

## The rules

These are not style preferences. Each one exists because skipping it already
cost this project something once.

- **`npm run validate` must pass before any task is done.** Typecheck → test →
  lint → accessible-names check → build → bundle-size check. No exceptions, no
  "I'll fix the types later" — a red gate is not a place to leave work for the
  next person to discover.
- **One task, one commit, one pull request**, titled `<TASK-ID>: <summary>`.
  Task IDs come from [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) — do not invent
  your own scheme, and do not bundle two cards into one PR even when they
  touch the same file.
- **Every behavioural change ships with a test that fails before the change
  and passes after it.** Not a test that merely exercises the new code — one
  that would have caught the bug if it had been written first. Case IDs are
  catalogued in [docs/TEST_PLAN.md](docs/TEST_PLAN.md); add yours there.
- **Work in wave order.** A task whose dependency is unmet does not start
  early just because it is ready to be written.
- **Never widen scope inside a task.** Found something else broken while you
  were in there? It goes in [BACKLOG.md](BACKLOG.md), named plainly, and you
  carry on with the task you started. A PR that fixes one thing and quietly
  refactors three others is not reviewable.
- **Schema changes are forward-only migrations**, generated with
  `npm run db:generate` and applied with `npm run db:migrate`. `db:push`
  syncs schema with no migration file and exists for local scratch work only —
  it must never be how a real change reaches the schema.
- **Do not add infrastructure** — Supabase, Postgres, Redis, a message queue,
  a second ORM — without the ADR that authorises it. MySQL is the decision of
  record ([ADR-001](docs/ADR.md)); a new dependency is a decision, not a
  side effect of solving today's problem the easiest way.
- **Never prefix a secret with `VITE_`.** Vite inlines every `VITE_*`
  variable into the public client bundle at build time — there is no way to
  keep one of those private after the fact. `test/env-example.test.ts`
  enforces this for `.env.example`; there is no equivalent check for a secret
  you introduce elsewhere, so this one is on you.
- **If a spec and the code disagree, the spec wins** — unless the code is
  demonstrably correct, in which case fix the spec in the same PR and say so
  in the commit message. A spec nobody keeps honest stops being worth reading.
- **Keep the four alias definitions in sync:** `tsconfig.json` (and its
  siblings), `vite.config.ts`, `vitest.config.ts`. They have drifted before
  and broken CI when they did; if you add a path alias, add it in all four
  places in the same commit.

## Making a change

1. **Branch from `main`.**
2. **Do the one task.** Keep the diff to what the task card and its
   acceptance criteria actually require.
3. **Write the test first if you can, or immediately after** — either way,
   confirm it fails before your fix and passes after. `npm run typecheck`
   before you commit, not after: a red tree committed and fixed in a second
   commit is a worse record than getting it right the first time.
4. **Run the full gate**, with a test database if the task touched the
   server:

   ```bash
   TEST_DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm run validate
   ```

5. **Commit** with a message that explains *why*, not just what — the diff
   already shows what. If you found and fixed a genuine defect, say what would
   have broken and how the test proves it is fixed.
6. **Open a draft pull request** titled `<TASK-ID>: <summary>`. Fill in what
   changed and why; link the requirement and test-case IDs the task card
   names.
7. **Wait for CI to go green** before asking for review. See
   [README.md](README.md#continuous-integration) for what the required checks are.

## Where to look things up

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
| What is left to do, and what was deliberately left undone? | [BACKLOG.md](BACKLOG.md) |

## Things that will bite you

The full list lives in [CLAUDE.md](CLAUDE.md#things-that-will-bite-you) and is
kept current there as things are fixed or discovered; skim it before you touch
sockets, sessions, or anything with a name ending in `_SECRET`.

## Code of conduct

Be the kind of contributor whose PRs are pleasant to review: small, one thing
at a time, tested, and honest in the commit message about what you found and
what you chose not to fix.
