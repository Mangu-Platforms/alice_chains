# Documentation index — Alice Chains / Alisons

**This is the canonical index. Every document in the repository is listed here.**

Thirty-seven Markdown documents: seventeen in `docs/`, nine in [`docs/alisons/`](alisons/README.md),
eight at the repository root, two in [`.github/`](../.github), and the test-harness guide in `test/`.

New here?

- **Human, first visit** → [../README.md](../README.md), then [SETUP.md](SETUP.md).
- **AI coding agent** → [../AGENTS.md](../AGENTS.md) **before you change anything**.
- **Evaluating the product** → [../ALISONS.md](../ALISONS.md) → [alisons/WHITE_PAPER.md](alisons/WHITE_PAPER.md) → [PRD.md](PRD.md).
- **About to write code** → [BUILD_PLAN.md](BUILD_PLAN.md) → the authoritative document for your domain.

**Authority levels used below**

| Level | Meaning |
|---|---|
| **Authoritative** | Wins inside its domain. Change the code and this document together. |
| **Supporting** | Derived from, or subordinate to, an authoritative document. Never cite it as the contract. |
| **Status** | A point-in-time report. Goes stale by design; refresh it when reality moves. |
| **Historical** | Kept for provenance. Known to be partly wrong. Never act on it. |

---

## Product and vision

| Document | Purpose | Audience | Authority | Update it when |
|---|---|---|---|---|
| [../ALISONS.md](../ALISONS.md) | The door to the product bible: the Alice Chains → Alisons rename, and what this product is and is not | Everyone | **Authoritative** on product naming and positioning | The rename advances, or the product bible gains a document |
| [alisons/README.md](alisons/README.md) | Reading order for the product bible, and the Track A / Track B split | Product, leadership, engineering | **Authoritative** on the product read | A bible document is added, removed or reordered |
| [alisons/WHITE_PAPER.md](alisons/WHITE_PAPER.md) | The verdict: does the repository do the product justice | Leadership, evaluators | Supporting | The verdict changes |
| [alisons/FEATURES.md](alisons/FEATURES.md) | Every capability, marked shipped / stub / parked | Product, engineering | **Authoritative** on capability state | A capability ships, becomes a stub, or is parked |
| [alisons/PAGES_AND_SURFACES.md](alisons/PAGES_AND_SURFACES.md) | The information architecture — every page, subpage, drawer, dialog and tool | Design, front-end | **Authoritative** on IA | A surface is added, removed or renamed |
| [alisons/USER_STORIES.md](alisons/USER_STORIES.md) | Who wants what, and why | Product, engineering | Supporting | The audience or its jobs change |
| [PRD.md](PRD.md) | Product requirements and design v2.0 — vision, competitive landscape, phase deep-dives, performance targets, GDPR | Product, leadership | Supporting (its §"Historical (June 2026)" is explicitly stale — [SETUP.md](SETUP.md) is authoritative on environment) | Product direction changes; do not use it to answer environment questions |

## Requirements

| Document | Purpose | Audience | Authority | Update it when |
|---|---|---|---|---|
| [SRS.md](SRS.md) | 164 numbered `FR-*` / `NFR-*` requirements, each with priority, status and source-cited evidence — the contract for *what* | Engineering, QA, audit | **Authoritative** on requirement ids and status | A requirement is added, reworded, satisfied or dropped |
| [alisons/FEASIBILITY.md](alisons/FEASIBILITY.md) | Track A (current stack) versus Track B (MLS re-architecture) | Leadership, architecture | Supporting | The track decision changes |
| [alisons/GAPS.md](alisons/GAPS.md) | Fixes, blockers, opportunities and the 90-day build | Engineering, leadership | Supporting | A gap closes or a new one is found |

## Architecture and technical design

| Document | Purpose | Audience | Authority | Update it when |
|---|---|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | The system as it exists today — topology, auth flow, sockets, schema — in about five minutes | New engineers, reviewers | Supporting (a summary of TECH_SPEC) | The shape of the system changes |
| [TECH_SPEC.md](TECH_SPEC.md) | The contract for *how*: module design, env schema, build pipeline, bundle budget, observability, migration plan | Engineering | **Authoritative** on module design and where controls are wired | Design, environment schema or build pipeline changes |
| [ADR.md](ADR.md) | Architecture decision records — why MySQL, why signed cookies rather than JWTs, why writes go over Socket.IO, why E2EE is deferred | Engineering, architecture | **Authoritative** on decisions; binding until superseded | A decision is taken, or an existing one is superseded — add a record, never edit history |
| [alisons/BUILD_OUT.md](alisons/BUILD_OUT.md) | How each product surface is technically built | Front-end, product | Supporting | A surface's construction changes |
| [ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md](ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md) | The **parked** Track B programme: a 13-phase E2EE/MLS re-architecture with release gates A–F | Architecture, leadership | Supporting — **parked**, do not implement | Track B is unparked |

## Data and API contracts

| Document | Purpose | Audience | Authority | Update it when |
|---|---|---|---|---|
| [DATA_MODEL.md](DATA_MODEL.md) | Tables, columns, foreign keys, unique constraints, indexes, the migration runbook and the Phase 2 schemas | Engineering, DBA | **Authoritative** on the schema spec (`db/schema.ts` is the code source of truth) | Any schema change — in the same pull request as the migration |
| [API_CONTRACT.md](API_CONTRACT.md) | **Normative wire contract.** Every tRPC procedure and socket event with exact payloads, auth preconditions, rooms and error envelopes, each with a `file.ts:LINE` citation | Engineering, integrators | **Authoritative** on the wire | Any procedure, payload, event, room or error envelope changes |
| [API.md](API.md) | One-page cheat sheet of every procedure and event | Engineering, quick reference | Supporting — **non-normative** | The contract moves; never cite this instead of API_CONTRACT.md |

## Security and privacy

| Document | Purpose | Audience | Authority | Update it when |
|---|---|---|---|---|
| [SECURITY.md](SECURITY.md) | STRIDE threat model, the `SEC-C-*` control catalogue, and the prioritised remediation table | Engineering, security review | **Authoritative** on threats and controls (wins over TECH_SPEC on a control's content; TECH_SPEC wins on where it is wired) | A control is added, changed or removed; a new threat is identified |

> This repository has no separate root `SECURITY.md` vulnerability-disclosure policy. `docs/SECURITY.md`
> is the engineering threat model, not a disclosure process. Adding a disclosure policy is unclaimed
> work — raise it in [../BACKLOG.md](../BACKLOG.md) rather than assuming one exists.

## Testing and quality

| Document | Purpose | Audience | Authority | Update it when |
|---|---|---|---|---|
| [TEST_PLAN.md](TEST_PLAN.md) | Test strategy, the `TC-*` case catalogue, coverage targets and per-task exit criteria | Engineering, QA | **Authoritative** on `TC-*` ids and strategy | A case is added, changed or retired |
| [../test/README.md](../test/README.md) | The harness itself — fixtures, the in-process router, HTTP and Socket.IO layers, and the conventions that keep suites honest | Anyone writing a test | **Authoritative** on harness usage | The harness gains a layer or a convention changes |

## Delivery and planning

| Document | Purpose | Audience | Authority | Update it when |
|---|---|---|---|---|
| [BUILD_PLAN.md](BUILD_PLAN.md) | Every task card in wave order — files to touch, requirement ids, acceptance criteria, proving command — plus the ground rules G-1…G-8 | Engineering, agents | **Authoritative** on task ids, wave order and acceptance criteria | A task is added, re-scoped, re-ordered or completed |
| [../BACKLOG.md](../BACKLOG.md) | The same tasks as a one-line-each ordered queue with priority, dependency and status | Engineering, planning | Supporting — mirrors BUILD_PLAN; if they disagree, BUILD_PLAN wins | Any task's status changes |
| [ROADMAP.md](ROADMAP.md) | Phases 1–4 on the current stack, the milestone view, and why the MLS track is parked | Leadership, planning | Supporting | Phase boundaries or milestones move |
| [TRACEABILITY.md](TRACEABILITY.md) | The audit trail — every requirement joined to its owning task, verifying test and security control, with coverage arithmetic, the P0 release gate and the orphan lists | Audit, QA, leadership | Supporting — **never wins.** It reports the join; when it disagrees with a source, the source is right and the matrix is stale | A requirement, task, test or control changes |
| [alisons/DOCUMENTS_TO_PROCURE.md](alisons/DOCUMENTS_TO_PROCURE.md) | Chronological list of the enterprise artefacts this product still needs | Leadership, legal, ops | Supporting | An artefact is procured or a new one becomes necessary |

## Operations and deployment

| Document | Purpose | Audience | Authority | Update it when |
|---|---|---|---|---|
| [SETUP.md](SETUP.md) | Clone → `npm ci` → `.env` → MySQL → `npm run dev`, with a troubleshooting table; followable from zero | New contributors, self-hosters | **Authoritative** on how to run it | Any setup step, environment variable or failure mode changes |
| [../README.md](../README.md) | The front door: what this is, quick start, scripts, configuration, where every document lives | Everyone | Supporting — a map, never the specification | The quick start, the script table or the documentation set changes |

## Contribution and agent policy

| Document | Purpose | Audience | Authority | Update it when |
|---|---|---|---|---|
| [../AGENTS.md](../AGENTS.md) | The cross-agent operating policy — reading order, commands, conventions, prohibited behaviour, definition of done | **Every AI coding agent**, and humans who want the rules in one place | **Authoritative** on agent behaviour and documentation governance | Any rule, command or authority relationship changes |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | The human contribution workflow — branch, commit, validate, pull request | Human contributors | Supporting — points at AGENTS.md and BUILD_PLAN.md for the substance | The workflow or the gate changes |
| [../CLAUDE.md](../CLAUDE.md) | Claude-specific additions on top of AGENTS.md: the ten rules and the things that will bite you | Claude Code | Supporting — subordinate to AGENTS.md | A Claude-specific hazard or rule changes |
| [../.github/copilot-instructions.md](../.github/copilot-instructions.md) | Copilot-specific additions on top of AGENTS.md | GitHub Copilot | Supporting — subordinate to AGENTS.md | A Copilot-specific behaviour changes |
| [../.github/pull_request_template.md](../.github/pull_request_template.md) | The pull-request checklist every change is measured against | Everyone opening a pull request | Supporting | The definition of done changes |

## Status and historical records

| Document | Purpose | Audience | Authority | Update it when |
|---|---|---|---|---|
| [../CURRENT_STATUS.md](../CURRENT_STATUS.md) | Point-in-time state: what works, what is broken, what was just fixed | Everyone | **Status** — see the conflict noted below | Anything ships, breaks or is fixed |
| [DELIVERY_RECONCILIATION.md](DELIVERY_RECONCILIATION.md) | Audit of the June 2026 delivery zip against what is actually in this repository | Audit, leadership | Historical | Another external delivery is reconciled |
| [../info.md](../info.md) | The original hand-written development notes | Nobody, in practice | **Historical** — superseded and partly wrong | Never. Kept for provenance only |

`assets/prd/` holds the PRD figures (architecture diagram, competitive matrix, WebSocket benchmarks,
rate-limiting comparison, roadmap timeline, cover art).

---

## Precedence

When two documents disagree:

- **[BUILD_PLAN.md](BUILD_PLAN.md)** wins on task ids and order.
- **[SRS.md](SRS.md)** wins on requirement ids and status.
- **[API_CONTRACT.md](API_CONTRACT.md)** wins on the wire.
- **[DATA_MODEL.md](DATA_MODEL.md)** wins on the schema.
- **[SECURITY.md](SECURITY.md)** wins on controls; [TECH_SPEC.md](TECH_SPEC.md) wins on where a control is wired.
- **[TEST_PLAN.md](TEST_PLAN.md)** wins on `TC-*` ids.
- **[ADR.md](ADR.md)** wins on decisions, and is binding until a later record supersedes it.
- **[TRACEABILITY.md](TRACEABILITY.md) never wins** — it reports the join; when it disagrees with a
  source, the source is right and the matrix is stale.

If a document disagrees with the code and the code is demonstrably right, fix the document **in the
same pull request** and say so. Otherwise the spec wins.

## Documentation governance

These rules are binding, and are restated in [../AGENTS.md §12](../AGENTS.md):

1. **Any new authoritative document MUST be linked from this file**, with its purpose, audience,
   authority level and update duty.
2. **Any document required for onboarding, development, validation, deployment or contribution MUST
   also be discoverable from [../README.md](../README.md) or [../AGENTS.md](../AGENTS.md)** — one
   click from the repository root.
3. **No critical instruction may exist only in an unlinked nested file.** If it matters, it is linked.
4. **Do not create a second source of truth.** Extend the authoritative document rather than writing
   a parallel one.
5. When you add, rename or move a document, fix every relative link that pointed at it.

**`npm run check:docs`** enforces rules 1–3 and 5 mechanically: it fails on a broken relative link,
a broken heading anchor, and on any document no other document links to. Run it after any
documentation change. It is deliberately outside `npm run validate` — a documentation link should not
fail a build that ships code — so running it is a contributor's job, and the pull-request checklist
asks about it.

## Known documentation conflicts

Open conflicts are recorded here rather than silently resolved. Close one by fixing the source and
deleting its row.

| # | Conflict | Positions | Working resolution |
|---|---|---|---|
| **DC-1** | **How much has shipped.** | [../CURRENT_STATUS.md](../CURRENT_STATUS.md)'s 2026-08-25 handoff says Wave 1 is complete and Wave 2 is next; its 2026-08-12 body describes a repository that could not build from a clean clone. [../BACKLOG.md](../BACKLOG.md) and [BUILD_PLAN.md](BUILD_PLAN.md) show Waves 0–4 complete and most of Waves 5–7. [../README.md](../README.md) says Waves 1–4 have shipped. | **BACKLOG.md and BUILD_PLAN.md are current** for what has shipped. The CURRENT_STATUS body is stale and the repository already tracks the fix as `STATUS` in [alisons/GAPS.md](alisons/GAPS.md) — rewriting it is that task's job, not a documentation-index change. |
| **DC-2** | **Project naming.** | [../ALISONS.md](../ALISONS.md) states the product is Alisons; every other document, the package name and the repository still say Alice Chains. | **Not a defect — a planned single-cut rename.** Alice Chains is the codebase, Alisons the product, Alice the AI guest. Do not rename piecemeal. |
| **DC-3** | **Environment documentation.** | [PRD.md](PRD.md) §"Historical (June 2026)" describes `KIMI_CLIENT_ID`/`KIMI_CLIENT_SECRET`, `npm install` and `db:push`. | **Already self-resolved in place:** that section labels itself historical and names [SETUP.md](SETUP.md) as authoritative. `.env.example` plus `api/lib/env.ts` are the live contract. |
| **DC-4** | **Development commands in [../info.md](../info.md).** | `info.md` lists `npm run check` and `npm run db:push` as the development workflow, which contradicts [SETUP.md](SETUP.md) and [../AGENTS.md](../AGENTS.md). | **info.md is historical** and now carries a banner saying so. Use SETUP.md. |
