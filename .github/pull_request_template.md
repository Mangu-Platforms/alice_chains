<!--
Title format: `<TASK-ID>: <summary>` — e.g. `S-14: validate socket payloads at runtime`.
Task ids come from docs/BUILD_PLAN.md. Documentation- or tooling-only work with no task
card uses a conventional prefix instead: `docs:` or `chore:`.

Before opening this pull request: humans read CONTRIBUTING.md, AI agents read AGENTS.md.
-->

## What and why

<!-- What changed, and the problem it solves. Link the BUILD_PLAN task card and any requirement
     (FR-*/NFR-*) or control (SEC-C-*) ids this satisfies. -->

**Task:** <!-- e.g. S-14, or "docs-only, no card" -->
**Requirements / controls:** <!-- FR-*, NFR-*, SEC-C-*, or "none" -->

## How it was verified

<!-- Paste the real result of `npm run validate`. If a check could not run, say which one and why —
     an honest skip is worth more than a claimed pass. -->

```
npm run validate  →
```

- [ ] `npm run validate` was **actually executed** and exited 0
- [ ] Integration and Socket.IO suites ran with `TEST_DATABASE_URL` set (or: stated below why not)
- [ ] The new behavioural test was red-proofed — it fails with the change reverted

## Checklist

**Scope**
- [ ] This pull request is **one task**. No unrelated changes, no opportunistic refactoring, no reformatting of untouched files
- [ ] Anything discovered but not fixed was added to [BACKLOG.md](../BACKLOG.md) rather than absorbed here

**Tests**
- [ ] Tests added or updated for every behavioural change, and they pass
- [ ] `TC-*` case ids added to [docs/TEST_PLAN.md](../docs/TEST_PLAN.md) where new cases were invented
- [ ] No test was skipped, disabled or deleted to reach green

**Contracts**
- [ ] No public contract changed — *or* [docs/API_CONTRACT.md](../docs/API_CONTRACT.md) is updated in this pull request, including its `file.ts:LINE` citations
- [ ] Shared payload schemas live in `contracts/` so client and server cannot drift
- [ ] [docs/API.md](../docs/API.md) refreshed if the cheat sheet moved

**Database**
- [ ] No schema change — *or* a forward-only migration was generated with `npm run db:generate` (never hand-written, never `db:push`)
- [ ] [docs/DATA_MODEL.md](../docs/DATA_MODEL.md) updated: columns, constraints, indexes, `ON DELETE` justification
- [ ] A **fresh** database migrates from zero, and `npm run db:verify-migration` passes if the migration touches existing data

**Security**
- [ ] Security impact considered against [docs/SECURITY.md](../docs/SECURITY.md); new or changed controls have a `SEC-C-*` entry
- [ ] No security control was removed or weakened to make anything pass
- [ ] No secret carries a `VITE_` prefix
- [ ] New environment variables are in `api/lib/env.ts`, `.env.example`, [docs/SETUP.md](../docs/SETUP.md) and [docs/TECH_SPEC.md](../docs/TECH_SPEC.md)
- [ ] **No secrets, credentials, tokens, private keys, `.env` files or production data are committed**
- [ ] No generated artefacts committed (`node_modules/`, `dist/`, coverage output)

**Documentation and status**
- [ ] Every document this change invalidates is updated in this pull request ([AGENTS.md §12](../AGENTS.md))
- [ ] Task status updated in [BACKLOG.md](../BACKLOG.md)
- [ ] [docs/TRACEABILITY.md](../docs/TRACEABILITY.md) updated if a requirement, task, test or control moved
- [ ] [CURRENT_STATUS.md](../CURRENT_STATUS.md) updated if what is shipped or broken changed
- [ ] Any new authoritative document is linked from [docs/README.md](../docs/README.md)
- [ ] `npm run check:docs` passes (no broken links, no unreachable document) if any Markdown changed

## Remaining risks and open questions

<!-- Anything you are unsure of, could not verify, deliberately deferred, or that a reviewer should
     look at hardest. Unresolved documentation conflicts go here too — and in
     docs/README.md § Known documentation conflicts. "None" is a valid answer if it is true. -->
