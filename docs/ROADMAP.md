# Alice Chains — Roadmap (reconciled)

**Updated 2026-08-12.** This reconciles the two planning documents in this repo — the [PRD](PRD.md) (June 2026, evolve the current stack) and the [E2EE/MLS buildout program](ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md) (July 2026, ground-up re-architecture) — under the decision of record ([CURRENT_STATUS.md](../CURRENT_STATUS.md) §6): **stabilize and complete Phase 2 on the current TypeScript stack; the MLS program is parked as the long-term track.**

![Roadmap timeline](assets/prd/roadmap_timeline.png)

## Track A (ACTIVE): current stack → complete product

### Phase 1 — Foundation ✅ (shipped June–July 2026)

Core messaging, conversations, contacts, presence, typing, read receipts, dark UI, responsive layout, OAuth + signed sessions, authenticated sockets. Detail: [ARCHITECTURE.md](ARCHITECTURE.md).

### Phase 1.5 — Stabilization 🔴 (now; [BUILD_PLAN.md](BUILD_PLAN.md) Waves 0–3)

Green CI + lockfile (S-0 ✅) · dev server actually listens (S-2 ✅) · authorization holes closed (S-8, S-9, S-10) · OAuth coherence + state/PKCE (S-4) · read-receipt query hygiene (S-5) · committed migrations with FKs/uniques/indexes (S-3, S-11) · real test harness in CI (S-7, S-12). **Exit gate:** fresh clone → `docker compose up` (or `npm run dev`) → two browsers exchanging messages; CI green.

### Phase 2 — Core enrichment (next; [BUILD_PLAN.md](BUILD_PLAN.md) Wave 4, F-1…F-6)

| Feature | Groundwork already in repo | Task |
|---|---|---|
| Unread badges | `conversation_participants.lastReadAt` + `markAsRead` | F-1 |
| Editing & deletion | `messages.isEdited` | F-2 |
| Emoji reactions | — (new table) | F-3 |
| File & image attachments | `messages.type`, `fileUrl`; composer stub | F-4 |
| Reply threading UI | `messages.replyToId` accepted end-to-end | F-5 |
| Web push notifications | — (new table + service worker) | F-6 |

**Exit gate:** the PRD's Phase 2 rows all flip to DONE; a small group can use Alice Chains daily.

### Phase 3 — Power features (specified in PRD, not yet scheduled)

WebRTC voice/video (signaling over existing sockets, STUN/TURN), screen sharing, voice messages. **End-to-end encryption is deliberately deferred to Track B** rather than implemented ad-hoc — the MLS program is the serious answer to E2EE, and bolting Signal-protocol crypto onto the prototype would be throwaway work.

### Phase 4 — Scale & platform (specified in PRD)

Redis pub/sub adapter for multi-instance sockets, token-bucket rate limiting, audit logging/GDPR workflows, native mobile apps (React Native). Performance targets and benchmarks: PRD §Performance.

## Track B (PARKED): E2EE / MLS re-architecture

The [buildout program](ALICE_CHAINS_END_TO_END_PRODUCT_BUILDOUT.md) defines a 13-phase path to a private, device-centric, MLS-encrypted messenger with a visible AI participant ("Alice"), Rust protocol core, passkeys, and event-sourced sync — with release gates A–F and a 20-item starter backlog.

Status: **parked, preserved, and partially satisfied** — its Phase 0 / Epic 0.2 ("repository stabilization") items map directly onto BUILD_PLAN Waves 0–3 (signed sessions and authenticated sockets already landed via PR #2). Reopen this track when Phase 2 has shipped and real usage justifies the investment; at that point its Gate A checklist should already be green.

## Milestone view

| Milestone | Definition of done | Target |
|---|---|---|
| **M1 Stabilized** | Waves 0–2 done (S-0, S-2 ✅; S-8, S-9, S-10, S-4, S-5, S-3, S-11); CI green; dev env runs | ~1–2 weeks of focused work |
| **M2 Packaged** | S-7, S-12, S-6; `docker compose up` demo; test harness in CI | +1 week |
| **M3 Daily-usable** | F-1, F-2, F-3, F-5 | +2 weeks |
| **M4 Media-complete** | F-4, F-6; Phase 2 fully DONE | +2 weeks |
| **M5 Calls beta** | Phase 3 WebRTC subset | scheduled after M4 review |
| **M-MLS** | Track B Gate B ("cryptographic proof") | unscheduled — requires explicit go decision |

*Estimates assume one focused engineer or a Claude Code agent working the backlog in order; re-baseline after M1 when CI reality is known.*
