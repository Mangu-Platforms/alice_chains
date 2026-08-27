# Alisons

**Formerly Alice Chains.** A private communications OS. This is a messenger — not a music app, not a publishing tool.

Product name: **Alisons**.  
AI guest in the room: **Alice**.  
Repo: [`Mangu-Platforms/alice_chains`](https://github.com/Mangu-Platforms/alice_chains)

This file is the door. The living product bible lives in [`docs/alisons/`](docs/alisons/README.md).

| Document | What it is |
|---|---|
| [White paper](docs/alisons/WHITE_PAPER.md) | Verdict: does the repo do the product justice |
| [Features](docs/alisons/FEATURES.md) | Every capability, shipped / stub / parked |
| [Pages and popups](docs/alisons/PAGES_AND_SURFACES.md) | Every page, subpage, drawer, dialog, tool |
| [Build-out](docs/alisons/BUILD_OUT.md) | How each surface is made |
| [User stories](docs/alisons/USER_STORIES.md) | Who wants what |
| [Feasibility](docs/alisons/FEASIBILITY.md) | Track A vs Track B |
| [Gaps](docs/alisons/GAPS.md) | Fixes, blockers, strategies, 90-day build |
| [Documents to procure](docs/alisons/DOCUMENTS_TO_PROCURE.md) | Chronological enterprise artefact list |

**Do not replace `src/pages/Chat.tsx` with a Grok preview shell.** The current stack (Vite + tRPC + Socket.IO + MySQL) is the dogfood messenger. The Grok preview is a future-state UI model only.

Existing authority still holds: `docs/PRD.md`, `docs/SRS.md`, `docs/TECH_SPEC.md`, `docs/BUILD_PLAN.md`, `BACKLOG.md`.
