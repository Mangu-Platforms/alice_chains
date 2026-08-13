# Delivery Reconciliation — Kimi June 2026 package vs. repository

**Audit date:** 2026-08-12
**Auditor:** Claude (Cowork session for Max Oza)
**Input:** `aliceinchains20260812T180012Z1001.zip` (uploaded 2026-08-12) vs. `Mangu-Platforms/alice_chains@main` (`3999bca`)

## Verdict

**All expected code is present in the repository.** The delivery zip contains **documentation and document-generation artifacts only** — there is no application source code in it, so nothing from it is "missing" from the repo. `main` is the single source of truth for code; the PRD inside the zip is the product source of truth and has been converted into the repo at [docs/PRD.md](PRD.md).

## Zip inventory

```
aliceinchains20260812T180012Z1001.zip
└── alice-inchains/
    ├── readme.docx                                   (469 KB, 2026-08-12)
    └── Kimi_Agent_Comprehensive Product Requirements Document.zip   (4.6 MB)
        ├── Alice_Chains_Mega_Document.docx           (1.9 MB, 2026-06-24)
        ├── Alice_Chains_Mega_Document.pdf            (995 KB, 2026-06-24)
        ├── Program.cs                                (80 KB,  2026-06-24)
        ├── images/cover_hero.png                     (1.0 MB)
        └── charts/                                   (5 PNGs: architecture, competitive
                                                       matrix, websocket benchmarks,
                                                       rate limiting, roadmap timeline)
```

| Item | Identification | Disposition |
|---|---|---|
| `readme.docx` | Kimi's **delivery cover letter**: describes the 25-page PRD package (15 sections, 5 charts + hero image, research foundation). Not a project README | Superseded by this audit; keep in the archive zip |
| `Alice_Chains_Mega_Document.docx/.pdf` | **PRD & Design Document v2.0**, June 2026, "Internal Use Only" — the product source of truth (vision, competitive analysis, architecture, schema roadmap, Phase 2–4 feature specs, security requirements SR-1…SR-10, performance targets, GDPR, 24-feature status matrix) | Converted to Markdown → [docs/PRD.md](PRD.md); figures committed to `docs/assets/prd/` |
| `Program.cs` | C# console program (DocumentFormat.OpenXml) that **generates the mega-document .docx** — build tooling for the document, **not Alice Chains app code** (the app is TypeScript) | No action; noted here so nobody mistakes it for missing app code |
| `charts/*.png`, `images/cover_hero.png` | PRD figures | Committed to `docs/assets/prd/` |

## Cross-check: does the repo contain the code the PRD describes?

The PRD's Appendix A claims 9 features DONE in Phase 1. Code review of `main` confirms each has a real implementation:

| PRD "DONE" claim | Evidence in repo |
|---|---|
| Real-time messaging (Socket.IO) | `api/socket.ts` (213 LOC): rooms, persist + broadcast |
| 1-on-1 and group conversations | `api/conversation-router.ts` (260 LOC): createDirect (idempotent), createGroup |
| Contact system with friend requests | `api/contact-router.ts` (189 LOC): pending/accepted/blocked machine |
| Online presence tracking | presence map + `userOnline`/`userOffline`/`onlineUsers` |
| Typing indicators | `typing` → `userTyping` events |
| Read receipts | `message_reads` table + `markAsRead` (router + socket) |
| Dark glassmorphism UI | `src/index.css` tokens, `tailwind.config.js`, Chat/Contacts pages |
| Mobile-responsive layout | `use-mobile` hook, collapsible sidebar in `Chat.tsx` |
| OAuth 2.0 + sessions | `api/kimi/` (OAuth callback, HMAC-signed cookie, tests) |

Timeline corroboration: the PRD files are dated **2026-06-24 10:03–10:32**, the same morning as the three "full platform" commits (08:58–09:24 UTC) — the PRD documents exactly the codebase that was pushed that day. PR #2 (2026-07-17) then hardened auth/sockets beyond what the PRD describes, so **the repo is *ahead of* the delivery, not behind it.**

## Discrepancies found (delivery ↔ repo)

1. **PRD repo URL is stale** — the doc's back cover points at `github.com/redinc23/alice_chains`; the canonical home is `Mangu-Platforms/alice_chains`. (Noted in the editor's preface of docs/PRD.md.)
2. **"JWT sessions" wording** — the PRD and old README say JWT; the implementation is an HMAC-SHA256-signed cookie. Docs updated; terminology decision tracked as BACKLOG H-5.
3. **PRD API table lists procedures that don't exist yet** (`file.getPresignedUrl`, `search.messages`) — these are Phase 2 items, flagged as *planned* in [docs/API.md](API.md).
4. **`alice.pdf` in the repo root** (11.5 MB, created 2026-01-27) is an unrelated *earlier* concept — an Express/MongoDB chat-app code listing printed to PDF. It predates the June delivery, contradicts the current stack, and should move to an archive location (BACKLOG H-1).
5. **Two roadmaps** — the zip's PRD (evolve the stack) vs. the repo's July buildout doc (MLS re-architecture). Reconciled by the decision of record in [CURRENT_STATUS.md](../CURRENT_STATUS.md) §6: stabilize + Phase 2 now; MLS parked as the later program.

## Chain of custody

- Delivery zip snapshot taken 2026-08-12T18:00Z (filename timestamp); inner PRD package authored 2026-06-24 by the Kimi agent (per cover letter and `Program.cs` header).
- Nothing in the zip was modified; conversions (docx→md via pandoc) are reproducible from the originals.
- Original binaries remain in Max's uploaded zip; the repo carries the converted Markdown + PNG figures only (2.0 MB), keeping the repo lean.
