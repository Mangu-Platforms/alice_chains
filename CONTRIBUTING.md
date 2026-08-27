# Contributing to Alice Chains

Backlog item **P-TOOL-10** — "the working agreement is written down where contributors look."

This is the short, human version. The substance lives in documents this file points at; nothing here
overrides them.

- **AI coding agents: read [AGENTS.md](AGENTS.md) instead.** It is the authoritative operating
  policy, and it is stricter than this page.
- **What to build next:** [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) — task cards in wave order, with
  acceptance criteria. [BACKLOG.md](BACKLOG.md) is the same queue, one line per task.
- **Which document is authoritative for which question:** [docs/README.md](docs/README.md).

---

## 1. Get it running

```bash
git clone https://github.com/Mangu-Platforms/alice_chains.git
cd alice_chains
./scripts/dev.sh          # or: npm run dev:up
npm run db:seed           # demo accounts, a DM and a group — no OAuth provider needed
```

The long form, with a troubleshooting table, is [docs/SETUP.md](docs/SETUP.md).

Two things that are not negotiable and will waste your afternoon if you miss them:

- **`npm ci`, never `npm install`.** The lockfile is the contract, and CI installs from it.
- **Node 22.x.** CI pins it; the project is ESM.

## 2. Pick one task

Work **one task at a time, in wave order**, from [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md). Each card
names the files to touch, the requirement ids it satisfies, the acceptance criteria and the command
that proves it.

Do not start a task whose dependencies are unmet. Do not skip ahead because a later feature looks
more interesting — Wave 1 closed authorization holes, and that ordering is deliberate.

**Never widen scope inside a task.** Found something else broken? Add it to
[BACKLOG.md](BACKLOG.md) and carry on. A pull request that fixes two things is harder to review,
harder to revert, and harder to trust than two pull requests.

## 3. Read before you write

The specification is long because the product is not simple. Read the authoritative document for
whatever you are touching — [docs/README.md](docs/README.md) tells you which one:

| Touching | Read |
|---|---|
| A tRPC procedure or socket event | [docs/API_CONTRACT.md](docs/API_CONTRACT.md) (normative) |
| The database | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) |
| Auth, sessions, uploads, input handling | [docs/SECURITY.md](docs/SECURITY.md) |
| Anything with a test | [docs/TEST_PLAN.md](docs/TEST_PLAN.md) and [test/README.md](test/README.md) |
| Module design, environment, build | [docs/TECH_SPEC.md](docs/TECH_SPEC.md) |
| Why something is the way it is | [docs/ADR.md](docs/ADR.md) |

**[README.md](README.md) is a front door, not the specification.** Do not treat it as complete.

## 4. Write the change and a test

- **Every behavioural change ships with a test that fails before the change and passes after.**
  Red-proof it: revert your fix, watch the test fail, restore it. This repository does that as a
  matter of course, and the practice has caught real defects.
- Case ids live in [docs/TEST_PLAN.md](docs/TEST_PLAN.md). Use an existing `TC-*` where one fits;
  add the case to the catalogue when you invent one.
- Pick the right harness layer — in-process caller, HTTP, or Socket.IO. [test/README.md](test/README.md)
  explains which is which, and the conventions (prove the *absence* of an event; `fileParallelism` is
  off; MySQL timestamp resolution) that are not guessable.

**Schema changes** are forward-only migrations: edit `db/schema.ts`, run `npm run db:generate`, then
`npm run db:migrate`, and update [docs/DATA_MODEL.md](docs/DATA_MODEL.md) in the same pull request.
`npm run db:push` is scratch development only ([ADR-005](docs/ADR.md)).

**Environment variables** go in `api/lib/env.ts` **and** `.env.example` — `test/env-example.test.ts`
fails in both directions, so an undocumented variable and a documented-but-unread one are each a
test failure. **Never prefix a secret with `VITE_`**: Vite inlines every `VITE_*` variable into the
public client bundle.

**New infrastructure** — Supabase, Postgres, Redis, a queue, a search engine — needs an ADR first.
MySQL is the decision of record ([ADR-001](docs/ADR.md)).

## 5. Run the gate

```bash
npm run validate          # typecheck → test → lint → a11y names → build → bundle budget
```

It must exit 0. Not "will exit 0 once I fix the types" — exit 0, now.

Integration and Socket.IO suites **skip** without `TEST_DATABASE_URL`, so a green run on a machine
with no database proves less than CI does. If you touched anything they cover, run them:

```bash
docker compose up -d db
DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm run db:migrate
TEST_DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm test
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the gate with a real MySQL service,
plus `npm run db:verify-migration` and a from-zero migration of a fresh database.

## 6. Update the documentation you invalidated

In the **same** pull request. [AGENTS.md §12](AGENTS.md) has the full table; the common cases:

- Contract moved → [docs/API_CONTRACT.md](docs/API_CONTRACT.md)
- Schema moved → [docs/DATA_MODEL.md](docs/DATA_MODEL.md)
- Control added or changed → [docs/SECURITY.md](docs/SECURITY.md) + [docs/TRACEABILITY.md](docs/TRACEABILITY.md)
- Requirement satisfied → [docs/SRS.md](docs/SRS.md) + [docs/TRACEABILITY.md](docs/TRACEABILITY.md)
- Task finished → [BACKLOG.md](BACKLOG.md)
- What is shipped or broken changed → [CURRENT_STATUS.md](CURRENT_STATUS.md)
- A new authoritative document → link it from [docs/README.md](docs/README.md)

Then run **`npm run check:docs`**. It fails on a broken relative link, a broken heading anchor, or a
document nothing links to. It is not part of `npm run validate`, so nothing will remind you.

If a specification and the code disagree, **the spec wins** — unless the code is demonstrably
correct, in which case fix the spec here and say so in the pull request.

## 7. Commit and open the pull request

- One task, one commit, one pull request. Title: `<TASK-ID>: <summary>`, e.g.
  `S-14: validate socket payloads at runtime`. Documentation- or tooling-only work with no card uses
  `docs:` or `chore:`.
- Work on a feature branch; never commit directly to `main`.
- Fill in [.github/pull_request_template.md](.github/pull_request_template.md) honestly. An unchecked
  box with a reason is worth more than a checked lie.
- CI must be green.

## 8. Definition of done

Acceptance criteria met · tests added, green and red-proofed · `npm run validate` green (actually
run) · CI green · documentation updated · status and traceability updated · no secrets committed ·
remaining risks stated in the pull request.

## Reporting a security issue

There is no separate vulnerability-disclosure policy in this repository yet.
[docs/SECURITY.md](docs/SECURITY.md) is the engineering threat model, not a disclosure process.
Until one exists, raise security concerns privately with the maintainers rather than in a public
issue, and do not include a working exploit in a public pull request.

## Licence

By contributing you agree that your contributions are licensed under the MIT licence
([LICENSE](LICENSE)).
