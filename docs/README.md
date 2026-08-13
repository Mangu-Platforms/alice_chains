# Alice Chains — Documentation Index

Twenty documents: sixteen here in `docs/`, four at the repository root, plus the parked long-term program. Find yourself in one of the four headings below.

---

## I want to run it

| Document | One line |
|---|---|
| [SETUP.md](SETUP.md) | Clone → `npm ci` → `.env` → MySQL → `npm run dev`, with a troubleshooting table; literally followable from zero |
| [../README.md](../README.md) | Project front page: what Alice Chains is, quick start, scripts, configuration table |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The system as it exists today — topology, auth flow, sockets, schema — in about five minutes of reading |
| [API.md](API.md) | One-page cheat sheet of every tRPC procedure and socket event. **Non-normative** — see API_CONTRACT.md |

## I want to build the next thing

| Document | One line |
|---|---|
| [../CLAUDE.md](../CLAUDE.md) | The working agreement: the ten rules, the gate, and which document answers which question. Read first |
| [BUILD_PLAN.md](BUILD_PLAN.md) | **Canonical.** Every task card in wave order — files to touch, requirement ids, acceptance criteria, proving command |
| [../BACKLOG.md](../BACKLOG.md) | The same tasks as a one-line-each ordered queue with priority, dependency and status |
| [../CURRENT_STATUS.md](../CURRENT_STATUS.md) | Honest point-in-time state: what works, what is broken, what was just fixed |
| [TEST_PLAN.md](TEST_PLAN.md) | Test strategy, the `TC-*` case catalogue, coverage targets, and the exit criteria per task |
| [TRACEABILITY.md](TRACEABILITY.md) | **The audit trail.** Every requirement joined to its owning task, its verifying test and its security control, with the coverage arithmetic, the P0 release gate and the orphan lists |
| [ROADMAP.md](ROADMAP.md) | Phases 1–4 on the current stack, the milestone view, and why the MLS track is parked |

## I want to understand the design

| Document | One line |
|---|---|
| [SRS.md](SRS.md) | 164 numbered `FR-*`/`NFR-*` requirements, each with priority, status and source-cited evidence. The contract for *what* |
| [TECH_SPEC.md](TECH_SPEC.md) | The contract for *how*: module design, env schema, build pipeline, bundle budget, observability, migration plan |
| [DATA_MODEL.md](DATA_MODEL.md) | Tables, columns, the 10 foreign keys / 3 unique constraints / 6 indexes that are owed, and the migration runbook |
| [API_CONTRACT.md](API_CONTRACT.md) | **Normative wire contract.** Every procedure, payload, auth precondition, socket event and error envelope, each with a `file.ts:LINE` citation |
| [SECURITY.md](SECURITY.md) | STRIDE threat model, the `SEC-C-*` control catalogue, and the prioritised remediation table |
| [PRD.md](PRD.md) | Product requirements and design v2.0 — vision, competitive landscape, phase deep-dives, performance targets, GDPR |
| [ADR.md](ADR.md) | Architecture decision records: why MySQL, why signed cookies rather than JWTs, why E2EE is deferred |

## I want the history

| Document | One line |
|---|---|
| [DELIVERY_RECONCILIATION.md](DELIVERY_RECONCILIATION.md) | Audit of the June 2026 delivery zip against what is actually in this repository |
| [ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md](ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md) | The parked Track B program: a 13-phase E2EE/MLS re-architecture with release gates A–F |
| [../info.md](../info.md) | The original hand-written notes. Superseded and partly wrong — kept for provenance only |

---

**Precedence.** When two documents disagree: BUILD_PLAN.md wins on task ids and order; SRS.md wins on requirement ids and status; API_CONTRACT.md wins on the wire; DATA_MODEL.md wins on the schema; SECURITY.md wins on controls; TEST_PLAN.md wins on `TC-*` ids. TRACEABILITY.md never wins — it reports the join, and when it disagrees with a source the source is right and the matrix is stale. If a document disagrees with the code and the code is demonstrably right, fix the document in the same PR and say so.

`assets/prd/` holds the PRD figures (architecture, competitive matrix, benchmarks, rate-limiting comparison, roadmap timeline, cover art).
