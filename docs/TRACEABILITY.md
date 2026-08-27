# Alice Chains — Requirements Traceability Matrix

**Version:** 1.1 · **Date:** 2026-08-12 · **Baseline:** `main` @ `3999bca` + the Wave 0 stabilization tree

> **v1.1 — regenerated.** Every count, list and reverse index below was recomputed from the source documents after three fixes landed: the 33 colliding `TC-*` ids in `SRS.md` §1.4/§4–§5 were re-pointed or renumbered; the `**Tests:**` line of every `BUILD_PLAN.md` task card was rebound to cases that actually verify its `**Satisfies:**` requirements; and six new task cards (S-17, S-18, S-19, S-20, F-7, F-8) plus explicit `Satisfies` lines on the Wave 5 cards gave every blocking P0 an owner. No number on this page is hand-written.
**Sources joined:** [SRS.md](SRS.md) §4–§5 (requirement spine) · [BUILD_PLAN.md](BUILD_PLAN.md) (tasks, waves) · [TEST_PLAN.md](TEST_PLAN.md) §5–§7 (test catalogue) · [SECURITY.md](SECURITY.md) §13 (controls) · [DATA_MODEL.md](DATA_MODEL.md) §3–§4 (constraints) · [API_CONTRACT.md](API_CONTRACT.md) §7 (contract gaps)

---

## 1. Purpose and how to maintain it

This matrix is the **audit trail** for Alice Chains. It answers one question per row: *who builds this, and what proves it works?*

**A requirement with no owning task and no test case is not real.** It is an intention. It will not be built, because nothing schedules it; and if it is built by accident, nothing will stop it regressing. The count of such requirements (§2) is the honest measure of how much of this specification is currently fiction. [BUILD_PLAN.md](BUILD_PLAN.md) §5 item 6 makes this document a release gate: *"TRACEABILITY.md shows every P0 requirement mapped to an owning task **and** a passing test, with no `†` (owed) and no `‡` (colliding) id left in the P0 rows of its §3 matrix or its §6 release gate."*

### Maintenance rule

| # | Rule |
|---|---|
| **M-1** | **Any PR that adds, changes or withdraws a requirement in `SRS.md` MUST add or update its row here in the same PR.** A PR that touches `SRS.md` §4 or §5 without touching this file fails review. |
| **M-2** | Any PR that adds a `TC-*` case to `TEST_PLAN.md` MUST fill that id into the **Test case(s)** column of every requirement it verifies, and into §5. |
| **M-3** | Any PR that adds or renumbers a `BUILD_PLAN.md` task MUST state its `**Satisfies:**` requirement ids explicitly — never a wildcard such as `NFR-REL-*` — and update §4. |
| **M-4** | Never invent a link. If a requirement has no task or no test, write `—` and let it be counted in §7. A fabricated mapping is worse than an admitted gap, because it removes the gap from the backlog without doing the work. |
| **M-5** | Ids are stable. Retire with `(WITHDRAWN)`; never renumber, never reuse. |
| **M-6** | Regenerate the counts in §2 mechanically from the tables below. If a hand-written count and the tables disagree, the tables win. |

### Column and marker legend

| Marker | Meaning |
|---|---|
| `—` | No link exists in any source document. Counted as a gap in §7. |
| `°` | **Inferred task.** The `BUILD_PLAN.md` task's scope demonstrably covers this requirement, but the task card does not name the requirement id. Confirm before relying on it; fix by applying **M-3**. |
| `†` | **Test case not yet written.** The id is allocated by `SRS.md` but does not exist in `TEST_PLAN.md`. |
| `‡` | **Id collision.** `SRS.md` allocates this id as new (`†`) but `TEST_PLAN.md` has already issued that number to a different case. **No row carries this marker any more** — the 33 collisions were resolved in v1.1 (§7.4). It is retained in the legend so a future regression is recognisable. |
| Spec section | Section of `SRS.md` that states the requirement. |
| Security control | `SEC-C-*` from `SECURITY.md`. Plain = cited by the SRS row; *italic* = mapped only from the reverse direction in `SECURITY.md` §13. |

---

## 2. Coverage summary

### 2.1 Headline

| Measure | Count | Share of 164 |
|---|---:|---:|
| Requirements in `SRS.md` §4–§5 | 164 | 100 % |
| …functional (`FR-*`) | 109 | 66.5 % |
| …non-functional (`NFR-*`) | 55 | 33.5 % |
| Has an owning task (stated **or** inferred) | 108 | 65.9 % |
| …of which the task card names the requirement id (stated) | 82 | 50.0 % |
| Has ≥ 1 test case that exists in `TEST_PLAN.md` | 82 | 50.0 % |
| Has ≥ 1 test id cited at all, counting `†` ids not yet written | 137 | 83.5 % |
| Cites no test id at all — verification is a measurement method | 27 | 16.5 % |
| Has **both** a task and an existing test | 48 | 29.3 % |
| **Has neither a task nor an existing test — the true gap** | **22** | **13.4 %** |

`‡` (id collision) no longer appears anywhere in this matrix: the 33 reissued ids were re-pointed or renumbered in `SRS.md` §1.4/§4–§5, so "exists in `TEST_PLAN.md`" and "exists and is not a collision" are now the same measure.

### 2.2 By status

| Status | Count | Share | Has task | Has test | Neither |
|---|---:|---:|---:|---:|---:|
| Implemented | 33 | 20.1 % | 5 | 28 | 4 |
| Partial | 14 | 8.5 % | 9 | 8 | 1 |
| Defective | 37 | 22.6 % | 31 | 29 | 2 |
| Missing | 68 | 41.5 % | 60 | 15 | 7 |
| Unverified | 12 | 7.3 % | 3 | 2 | 8 |
| **Total** | **164** | **100 %** | **108** | **82** | **22** |

### 2.3 By priority

| Priority | Count | Share | Not yet Implemented | Has task | Has test | Neither |
|---|---:|---:|---:|---:|---:|---:|
| P0 | 70 | 42.7 % | 42 | 44 | 60 | 4 |
| P1 | 67 | 40.9 % | 62 | 40 | 21 | 15 |
| P2 | 27 | 16.5 % | 27 | 24 | 1 | 3 |
| **Total** | **164** | **100 %** | **131** | **108** | **82** | **22** |

### 2.4 By area

| Area | Total | P0 | Implemented | Has task | Has test | Neither |
|---|---:|---:|---:|---:|---:|---:|
| FR-AUTH | 12 | 12 | 7 | 5 | 12 | 0 |
| FR-SESS | 10 | 4 | 3 | 7 | 6 | 0 |
| FR-CONV | 15 | 9 | 4 | 11 | 10 | 0 |
| FR-MSG | 19 | 9 | 4 | 10 | 10 | 4 |
| FR-CONT | 14 | 6 | 3 | 11 | 10 | 0 |
| FR-PRES | 9 | 5 | 3 | 3 | 8 | 1 |
| FR-FILE | 10 | 2 | 0 | 9 | 0 | 1 |
| FR-NOTIF | 9 | 0 | 0 | 8 | 0 | 1 |
| FR-ADMIN | 11 | 1 | 1 | 11 | 1 | 0 |
| NFR-PERF | 8 | 1 | 0 | 2 | 3 | 4 |
| NFR-SEC | 12 | 10 | 0 | 12 | 11 | 0 |
| NFR-REL | 7 | 2 | 2 | 1 | 4 | 3 |
| NFR-SCALE | 5 | 1 | 1 | 2 | 2 | 2 |
| NFR-OPS | 8 | 5 | 2 | 6 | 4 | 2 |
| NFR-A11Y | 6 | 0 | 0 | 6 | 0 | 0 |
| NFR-COMPAT | 5 | 2 | 3 | 0 | 1 | 4 |
| NFR-I18N | 4 | 1 | 0 | 4 | 0 | 0 |
| **Total** | **164** | **70** | **33** | **108** | **82** | **22** |

### 2.5 Test-catalogue position

| Measure | Count |
|---|---:|
| `TC-*` cases catalogued in `TEST_PLAN.md` §5–§7 | 158 |
| Distinct `TC-*` ids the SRS allocates that do **not** exist in `TEST_PLAN.md` (`†`) | 60 |
| Test cases once the 60 outstanding `†` ids are written | 218 |
| `†` ids whose number is **already issued** to a different case (`‡`) | 0 |
| Requirements affected by a `‡` collision | 0 |
| `TC-*` groups in `TEST_PLAN.md` today | 10 (`AUTH`, `AUTHZ`, `CONT`, `CONV`, `DATA`, `E2E`, `MSG`, `NFR`, `REG`, `SOCK`) |
| `TC-*` groups the SRS allocates that must still be created | 3 (`ADMIN`, `FILE`, `NOTIF`) |

### 2.6 What the numbers mean

**Two requirements in three now have an owner; one in two has a test; 48 of 164 have both.** 108 of 164 requirements (65.9 %) trace to a `BUILD_PLAN.md` task, and 82 of those (50.0 %) are named by id on the task card rather than inferred from its prose. 82 (50.0 %) have a test case that exists in `TEST_PLAN.md` today. **22 requirements (13.4 %) still have neither an owner nor a test** — down from 65 before the six new task cards (S-17, S-18, S-19, S-20, F-7, F-8) and the id reconciliation landed.

**The P0 gate is now fully scheduled.** Every one of the 34 P0 requirements that is Missing or Defective has an owning task, and only 3 of them lack a test case that exists today (FR-MSG-08, FR-FILE-05, FR-FILE-07) — all three are `†` ids owed by the task that closes them. Before this pass, 11 blocking P0s had no owner at all and 17 had no test.

**The remaining gap is concentrated in the not-yet-built areas, and that is the expected shape.** `FR-FILE` (10), `FR-NOTIF` (9) and `FR-ADMIN` (11) are almost entirely Missing and their tests are entirely unwritten — legitimate for Wave 4/5 work, provided the `†` ids get written when the feature lands. What is left in the "neither" column is dominated by NFR budgets whose verification is an instrument (k6, Lighthouse, axe-core, a chaos test) rather than a `TC-*` case; §7.2 lists them.

**Coverage of what already works is better than coverage of what is broken.** 28 of 33 Implemented requirements have a test — the regression suite is real. 15 of 68 Missing ones do, which is the correct direction of travel only if the `†` backlog is actually written.

**One id namespace is still in conflict.** `BUILD_PLAN.md` task ids and the `S-*`/`F-*` ids used by `SECURITY.md` §13 and `TEST_PLAN.md` §9 remain *different sets with the same names* (§7.5); both companions flag this themselves. The other two conflicts are closed: the 60 `TC-*` ids the SRS allocates as new no longer collide with any of the 158 ids `TEST_PLAN.md` has already issued (§7.4), and every `**Tests:**` line in `BUILD_PLAN.md` now cites cases bound to a requirement on its own `**Satisfies:**` line (§4.1).

---

## 3. The matrix

One row per requirement, **sorted by id** (area prefix alphabetically, then numerically). Every id below appears in the source document named in its column. `—` means the link does not exist.

| Requirement ID | Title (short) | Pri | Status | Spec section | Owning task | Test case(s) | Security control | Notes |
|---|---|---|---|---|---|---|---|---|
| FR-ADMIN-01 | `OWNER_UNION_ID` provisions `role='admin'` | P1 | **Missing** | SRS §4.9 | S-18 | TC-ADMIN-01† | — | gap G-23 |
| FR-ADMIN-02 | `adminQuery` builder throws `FORBIDDEN` | P1 | **Missing** | SRS §4.9 | S-18 | TC-ADMIN-02† | — | — |
| FR-ADMIN-03 | No owner configured ⇒ no administrator | P1 | Implemented | SRS §4.9 | S-18 | TC-ADMIN-03† | — | gap G-23 |
| FR-ADMIN-04 | Admin can list members | P2 | **Missing** | SRS §4.9 | S-18 | TC-ADMIN-04† | — | — |
| FR-ADMIN-05 | Admin can deactivate a member | P2 | **Missing** | SRS §4.9 | S-18 | TC-ADMIN-05† | — | — |
| FR-ADMIN-06 | Append-only admin audit record | P2 | **Missing** | SRS §4.9 | S-18 | TC-ADMIN-06† | — | — |
| FR-ADMIN-07 | `auth.me` hides `unionId` and `role` | P1 | **Defective** | SRS §4.9 | S-18 | TC-AUTH-15, TC-ADMIN-07† | — | — |
| FR-ADMIN-08 | Personal data export | P2 | **Missing** | SRS §4.9 | S-18 | TC-ADMIN-08† | — | — |
| FR-ADMIN-09 | Erasure with 30-day grace | P2 | **Missing** | SRS §4.9 | S-18 | TC-ADMIN-09† | — | — |
| FR-ADMIN-10 | Conversation delete cascades, no orphans | P2 | **Missing** | SRS §4.9 | S-18, S-3° | TC-ADMIN-10† | SEC-C-16 | — |
| FR-ADMIN-11 | Health endpoint reflects real readiness | P0 | **Partial** | SRS §4.9 | S-15 | TC-REG-20† | — | — |
| FR-AUTH-01 | Session token sign/verify (HMAC-SHA256) | P0 | Implemented | SRS §4.1 | — | TC-AUTH-01, TC-AUTH-02, TC-AUTH-03, TC-AUTH-07, TC-AUTH-11, TC-AUTH-12 | *SEC-C-01*, *SEC-C-02* | regression guard; **unowned** |
| FR-AUTH-02 | OAuth callback: exchange, provision, redirect | P0 | Implemented | SRS §4.1 | — | TC-AUTH-19, TC-AUTH-21, TC-AUTH-20, TC-AUTH-22, TC-AUTH-23, TC-AUTH-24, TC-AUTH-26 | *SEC-C-03*, *SEC-C-04* | regression guard; **unowned** |
| FR-AUTH-03 | Reject token older than 7 days | P0 | Implemented | SRS §4.1 | — | TC-AUTH-04, TC-AUTH-05 | *SEC-C-05*, *SEC-C-06*, *SEC-C-29* | gap G-19; regression guard; **unowned** |
| FR-AUTH-04 | Every tRPC procedure resolves a live user | P0 | Implemented | SRS §4.1 | — | TC-AUTH-13, TC-AUTH-14, TC-AUTH-15, TC-AUTHZ-01 | — | regression guard; **unowned** |
| FR-AUTH-05 | Logout clears cookie and redirects | P0 | Implemented | SRS §4.1 | — | TC-AUTH-16, TC-E2E-08 | — | gap G-19; regression guard; **unowned** |
| FR-AUTH-06 | Single IdP origin; no path doubling | P0 | **Defective** | SRS §4.1 | S-4 | TC-E2E-02, TC-AUTH-31, TC-AUTH-32 | SEC-C-01 | — |
| FR-AUTH-07 | Identical `redirect_uri` on both legs | P0 | **Defective** | SRS §4.1 | S-4 | TC-AUTH-21, TC-AUTH-33 | SEC-C-02 | — |
| FR-AUTH-08 | OAuth `state` (single-use, 32 B) | P0 | **Missing** | SRS §4.1 | S-4 | TC-AUTH-27, TC-AUTH-28, TC-AUTH-29 | SEC-C-03 | gap G-17 |
| FR-AUTH-09 | PKCE S256 | P0 | **Missing** | SRS §4.1 | S-4 | TC-AUTH-30 | SEC-C-04 | gap G-17 |
| FR-AUTH-10 | Provisioning keyed on `unionId` | P0 | Implemented | SRS §4.1 | — | TC-AUTH-19, TC-AUTH-20 | — | regression guard; **unowned** |
| FR-AUTH-11 | Failed callback issues no session | P0 | Implemented | SRS §4.1 | — | TC-AUTH-22, TC-AUTH-23, TC-AUTH-24, TC-AUTH-25, TC-AUTH-26 | — | regression guard; **unowned** |
| FR-AUTH-12 | Secrets absent from the client bundle | P0 | **Partial** | SRS §4.1 | S-17 | TC-REG-12, TC-REG-13 | SEC-C-24 | gap G-13 |
| FR-CONT-01 | `contact.list` returns accepted only | P0 | Implemented | SRS §4.5 | — | TC-CONT-05, TC-CONT-11, TC-AUTHZ-09 | — | regression guard; **unowned** |
| FR-CONT-02 | `contact.add` pending, no self, no duplicate | P0 | Implemented | SRS §4.5 | S-3 | TC-CONT-01, TC-CONT-06, TC-CONT-07, TC-CONT-08, TC-CONT-02, TC-CONT-03, TC-CONT-04 | — | regression guard |
| FR-CONT-03 | `contact.remove` deletes both directions | P0 | Implemented | SRS §4.5 | — | TC-CONT-09, TC-CONT-10 | *SEC-C-11* | regression guard; **unowned** |
| FR-CONT-04 | Blocking exists and hides from `contact.list` | P1 | **Defective** | SRS §4.5 | F-8, S-3 | TC-CONT-11, TC-CONT-19† | *SEC-C-12* | — |
| FR-CONT-05 | Search returns ≤ 20, excludes caller | P0 | **Defective** | SRS §4.5 | S-10 | TC-CONT-13, TC-CONT-14, TC-CONT-15, TC-CONT-16 | SEC-C-12, *SEC-C-22* | — |
| FR-CONT-06 | Search rejects queries under 3 chars | P0 | **Missing** | SRS §4.5 | S-10 | TC-AUTHZ-10 | SEC-C-12 | — |
| FR-CONT-07 | Search never returns email | P0 | **Defective** | SRS §4.5 | S-10 | TC-CONT-17, TC-AUTHZ-10 | SEC-C-12 | — |
| FR-CONT-08 | Search escapes LIKE metacharacters | P1 | **Defective** | SRS §4.5 | S-10 | TC-CONT-20† | — | — |
| FR-CONT-09 | Block prevents conversation and messaging | P1 | **Missing** | SRS §4.5 | F-8 | TC-CONT-12 | — | — |
| FR-CONT-10 | Block hides presence both ways | P1 | **Missing** | SRS §4.5 | F-8 | TC-CONT-22† | — | gap G-16 |
| FR-CONT-11 | Unblock | P1 | **Missing** | SRS §4.5 | F-8 | TC-CONT-23† | — | — |
| FR-CONT-12 | `contact.add` rejects unknown user id | P1 | **Missing** | SRS §4.5 | S-9 | TC-CONT-24† | — | — |
| FR-CONT-13 | Outbound request absent from own pending list | P1 | **Defective** | SRS §4.5 | — | TC-CONT-03 | — | **unowned** |
| FR-CONT-14 | `contact.accept` receiver-only, pending-only | P1 | **Defective** | SRS §4.5 | S-3° | TC-CONT-04, TC-CONT-25† | — | task inferred from scope, not stated |
| FR-CONV-01 | `createDirect` idempotent | P0 | **Defective** | SRS §4.3 | S-9 | TC-CONV-01, TC-CONV-02 | *SEC-C-11* | — |
| FR-CONV-02 | Participation gates all conversation content | P0 | Implemented | SRS §4.3 | S-8 | TC-AUTHZ-03, TC-AUTHZ-04, TC-AUTHZ-05, TC-SOCK-04, TC-SOCK-07, TC-SOCK-11 | SEC-C-09 | gap G-9; regression guard |
| FR-CONV-03 | `createGroup` creates group, includes caller | P0 | Implemented | SRS §4.3 | — | TC-CONV-03 | — | regression guard; **unowned** |
| FR-CONV-04 | `markAsRead` scoped to caller's own row | P0 | Implemented | SRS §4.3 | — | TC-CONV-10, TC-AUTHZ-07 | — | regression guard; **unowned** |
| FR-CONV-05 | List ordered by most recent activity | P0 | **Defective** | SRS §4.3 | S-11 | TC-CONV-04, TC-E2E-07, TC-CONV-05, TC-CONV-06, TC-CONV-07, TC-SOCK-06 | — | — |
| FR-CONV-06 | List returns name, avatar, participants, latest | P0 | Implemented | SRS §4.3 | — | TC-CONV-05, TC-CONV-06, TC-CONV-07, TC-CONV-08 | — | regression guard; **unowned** |
| FR-CONV-07 | `unreadCount` per conversation | P1 | **Missing** | SRS §4.3 | S-11 | TC-CONV-14† | — | — |
| FR-CONV-08 | Reject non-existent participant ids | P0 | **Missing** | SRS §4.3 | S-9 | TC-CONV-11 | SEC-C-11 | — |
| FR-CONV-09 | Reject blocked participants on creation | P0 | **Missing** | SRS §4.3 | S-9 | TC-CONV-13 | SEC-C-11 | — |
| FR-CONV-10 | `participantIds` capped at 256 | P0 | **Missing** | SRS §4.3 | S-9 | TC-CONV-12 | — | — |
| FR-CONV-11 | Direct conversation holds exactly 2 members | P1 | **Missing** | SRS §4.3 | S-9 | TC-CONV-15† | — | — |
| FR-CONV-12 | Reject self-DM | P1 | **Missing** | SRS §4.3 | S-9 | TC-CONV-16† | — | — |
| FR-CONV-13 | Leave a group | P2 | **Missing** | SRS §4.3 | F-7 | TC-CONV-17† | — | — |
| FR-CONV-14 | Creator can rename / manage members | P2 | **Missing** | SRS §4.3 | F-7 | TC-CONV-18† | — | — |
| FR-CONV-15 | Authz failure is a `TRPCError` | P1 | **Defective** | SRS §4.3 | — | TC-AUTHZ-06, TC-AUTHZ-08 | SEC-C-26 | gap G-9; **unowned** |
| FR-FILE-01 | Presigned upload URL, ≤ 300 s, participant-only | P1 | **Missing** | SRS §4.7 | F-4° | TC-FILE-01† | *SEC-C-23* | task inferred from scope, not stated |
| FR-FILE-02 | MIME allowlist + magic-byte agreement | P1 | **Missing** | SRS §4.7 | F-4° | TC-FILE-02† | — | task inferred from scope, not stated |
| FR-FILE-03 | 25 MB upload cap | P1 | **Missing** | SRS §4.7 | F-4° | TC-FILE-03† | SEC-C-20 | task inferred from scope, not stated |
| FR-FILE-04 | Reject `image/svg+xml` | P1 | **Missing** | SRS §4.7 | F-4° | TC-FILE-04† | — | task inferred from scope, not stated |
| FR-FILE-05 | Private objects; presigned participant-scoped GET | P0 | **Missing** | SRS §4.7 | F-4° | TC-FILE-05† | — | task inferred from scope, not stated |
| FR-FILE-06 | `pending`→`attached` lifecycle; 24 h purge | P1 | **Missing** | SRS §4.7 | F-4° | TC-FILE-06† | — | task inferred from scope, not stated |
| FR-FILE-07 | `fileUrl` must map to an owned attachment | P0 | **Missing** | SRS §4.7 | F-4° | TC-FILE-07† | — | task inferred from scope, not stated |
| FR-FILE-08 | Filenames sanitised, not used as keys | P1 | **Missing** | SRS §4.7 | F-4° | TC-FILE-08† | — | task inferred from scope, not stated |
| FR-FILE-09 | Thumbnail ≤ 512 px / download card | P1 | **Missing** | SRS §4.7 | F-4° | TC-FILE-09† | — | task inferred from scope, not stated |
| FR-FILE-10 | Malware scan before `attached` | P2 | **Missing** | SRS §4.7 | — | TC-FILE-10† | — | **unowned** |
| FR-MSG-01 | Content 1–4 000 chars on every ingress path | P0 | **Defective** | SRS §4.4 | S-14 | TC-MSG-06, TC-MSG-07, TC-MSG-08, TC-MSG-09, TC-SOCK-19, TC-MSG-10, TC-MSG-13, TC-SOCK-05 | SEC-C-13 | gap G-2 |
| FR-MSG-02 | Paginated history, ascending, `isMine` | P0 | Implemented | SRS §4.4 | — | TC-MSG-01, TC-MSG-02, TC-MSG-03, TC-MSG-04, TC-MSG-05, TC-MSG-21 | — | regression guard; **unowned** |
| FR-MSG-03 | `replyToId` persisted and returned | P1 | **Partial** | SRS §4.4 | F-5° | TC-MSG-11 | — | gap G-2; task inferred from scope, not stated |
| FR-MSG-04 | Full read receipts per history page | P0 | **Defective** | SRS §4.4 | S-5 | TC-MSG-14, TC-MSG-16 | SEC-C-15 | gap G-3 |
| FR-MSG-05 | Read receipts authorized and de-duplicated | P0 | **Defective** | SRS §4.4 | S-8 | TC-MSG-18, TC-MSG-19, TC-AUTHZ-08, TC-DATA-02, TC-MSG-14, TC-MSG-16, TC-SOCK-10 | SEC-C-10, SEC-C-16 | gap G-14, G-15 |
| FR-MSG-06 | Delivery to every connected participant | P0 | Implemented | SRS §4.4 | — | TC-SOCK-05, TC-E2E-03 | — | gap G-6, G-8; regression guard; **unowned** |
| FR-MSG-07 | `conversationUpdated` on personal room | P0 | Implemented | SRS §4.4 | — | TC-SOCK-06 | — | regression guard; **unowned** |
| FR-MSG-08 | tRPC `send` emits the same realtime events | P0 | **Missing** | SRS §4.4 | S-11 | TC-MSG-32† | — | gap G-1, G-22 |
| FR-MSG-09 | Message write touches `conversations.updatedAt` | P0 | **Missing** | SRS §4.4 | S-11 | TC-CONV-04, TC-MSG-23† | — | — |
| FR-MSG-10 | Keyset pagination | P2 | **Missing** | SRS §4.4 | — | TC-MSG-24† | — | **unowned** |
| FR-MSG-11 | Deterministic ordering on tied `createdAt` | P1 | **Defective** | SRS §4.4 | — | TC-MSG-25† | — | **unowned** |
| FR-MSG-12 | Edit own message + `messageUpdated` | P2 | **Missing** | SRS §4.4 | F-2° | TC-MSG-26† | — | task inferred from scope, not stated |
| FR-MSG-13 | Soft-delete own message + `messageDeleted` | P2 | **Missing** | SRS §4.4 | F-2° | TC-MSG-27† | — | task inferred from scope, not stated |
| FR-MSG-14 | Emoji reactions + `reactionUpdated` | P2 | **Missing** | SRS §4.4 | F-3° | TC-MSG-28† | — | task inferred from scope, not stated |
| FR-MSG-15 | `replyToId` same-conversation only | P1 | **Missing** | SRS §4.4 | — | TC-MSG-29† | — | gap G-2; **unowned** |
| FR-MSG-16 | Optimistic send reconciled by `tempId` | P1 | **Partial** | SRS §4.4 | — | TC-SOCK-05, TC-E2E-03 | — | gap G-2; **unowned** |
| FR-MSG-17 | Unicode round-trip (utf8mb4) | P1 | **Partial** | SRS §4.4 | — | TC-MSG-10 | — | **unowned** |
| FR-MSG-18 | Content rendered as text, never HTML | P0 | Implemented | SRS §4.4 | — | TC-MSG-30† | — | —; **unowned** |
| FR-MSG-19 | No send into a conversation with a blocker | P1 | **Missing** | SRS §4.4 | F-8 | TC-MSG-31† | — | — |
| FR-NOTIF-01 | Service worker + permission on user action | P2 | **Missing** | SRS §4.8 | F-6° | TC-NOTIF-01† | — | task inferred from scope, not stated |
| FR-NOTIF-02 | One subscription per (user, endpoint) | P2 | **Missing** | SRS §4.8 | F-6° | TC-NOTIF-02† | — | task inferred from scope, not stated |
| FR-NOTIF-03 | Push to disconnected participants | P2 | **Missing** | SRS §4.8 | F-6° | TC-NOTIF-03† | — | task inferred from scope, not stated |
| FR-NOTIF-04 | Delete subscription on 404/410 | P2 | **Missing** | SRS §4.8 | F-6° | TC-NOTIF-04† | — | task inferred from scope, not stated |
| FR-NOTIF-05 | Payload ≤ 4 096 B, no message content | P2 | **Missing** | SRS §4.8 | F-6° | TC-NOTIF-05† | — | task inferred from scope, not stated |
| FR-NOTIF-06 | Per-conversation mute | P2 | **Missing** | SRS §4.8 | F-6° | TC-NOTIF-06† | — | task inferred from scope, not stated |
| FR-NOTIF-07 | Tab title unread count when hidden | P1 | **Missing** | SRS §4.8 | — | TC-NOTIF-07† | — | **unowned** |
| FR-NOTIF-08 | Per-conversation unread badge, `99+` cap | P1 | **Missing** | SRS §4.8 | F-1° | TC-NOTIF-08† | — | task inferred from scope, not stated |
| FR-NOTIF-09 | Notification click focuses the conversation | P2 | **Missing** | SRS §4.8 | F-6° | TC-NOTIF-09† | — | task inferred from scope, not stated |
| FR-PRES-01 | Online while ≥1 socket; no duplicate event | P0 | Implemented | SRS §4.6 | — | TC-SOCK-03, TC-SOCK-13 | *SEC-C-21* | regression guard; **unowned** |
| FR-PRES-02 | Offline only on last socket disconnect | P0 | Implemented | SRS §4.6 | — | TC-SOCK-16, TC-E2E-06, TC-SOCK-14, TC-SOCK-15 | *SEC-C-21* | regression guard; **unowned** |
| FR-PRES-03 | Typing delivered to others, not the author | P0 | Implemented | SRS §4.6 | — | TC-SOCK-08, TC-E2E-04, TC-SOCK-09 | — | regression guard; **unowned** |
| FR-PRES-04 | Presence disclosed only to related members | P0 | **Defective** | SRS §4.6 | S-10 | TC-SOCK-17 | SEC-C-21 | gap G-16 |
| FR-PRES-05 | Presence snapshot scoped to the recipient | P0 | **Defective** | SRS §4.6 | S-10 | TC-SOCK-17 | SEC-C-21 | — |
| FR-PRES-06 | Typing indicator expires after 5 s | P1 | **Missing** | SRS §4.6 | — | TC-SOCK-26†, TC-E2E-04 | — | **unowned** |
| FR-PRES-07 | Presence map leaks no disconnected sockets | P1 | **Partial** | SRS §4.6 | — | TC-NFR-01, TC-SOCK-16 | SEC-C-21 | **unowned** |
| FR-PRES-08 | Presence consistent across nodes | P1 | **Missing** | SRS §4.6 | S-19 | TC-NFR-02 | — | gap G-21 |
| FR-PRES-09 | `lastSeenAt` for offline members | P2 | **Missing** | SRS §4.6 | — | TC-SOCK-27† | — | **unowned** |
| FR-SESS-01 | Cookie name and attributes | P0 | Implemented | SRS §4.2 | — | TC-AUTH-16, TC-E2E-01 | — | gap G-18; regression guard; **unowned** |
| FR-SESS-02 | `Secure` cookie in production | P0 | **Defective** | SRS §4.2 | S-4 | TC-AUTH-17 | SEC-C-07 | gap G-18 |
| FR-SESS-03 | `__Host-` cookie prefix in production | P1 | **Missing** | SRS §4.2 | S-17 | TC-AUTH-36† | SEC-C-07 | — |
| FR-SESS-04 | Trust only `unionId`; re-read user per request | P0 | Implemented | SRS §4.2 | — | TC-AUTH-14 | — | regression guard; **unowned** |
| FR-SESS-05 | Malformed token returns no session, no throw | P0 | Implemented | SRS §4.2 | — | TC-AUTH-06, TC-AUTH-09 | — | gap G-19; regression guard; **unowned** |
| FR-SESS-06 | Server-side session revocation | P1 | **Missing** | SRS §4.2 | S-17 | TC-AUTH-18 | SEC-C-05 | gap G-19 |
| FR-SESS-07 | 24 h idle expiry | P2 | **Missing** | SRS §4.2 | S-17 | TC-AUTH-37† | SEC-C-06 | gap G-19 |
| FR-SESS-08 | Session payload version field | P2 | **Missing** | SRS §4.2 | S-17 | TC-AUTH-35† | SEC-C-06 | — |
| FR-SESS-09 | Socket session re-validation every 5 min | P2 | **Missing** | SRS §4.2 | S-17 | TC-SOCK-24 | SEC-C-29 | gap G-20 |
| FR-SESS-10 | Exactly one cookie implementation | P1 | **Defective** | SRS §4.2 | S-17 | TC-REG-19† | SEC-C-08 | gap G-18, G-22 |
| NFR-A11Y-01 | WCAG 2.2 AA conformance | P1 | **Unverified** | SRS §5.6 | S-20 | — | — | budget never measured; verification is a measurement method, not a `TC-*` |
| NFR-A11Y-02 | Keyboard operability + visible focus | P1 | **Partial** | SRS §5.6 | S-20 | — | — | verification is a measurement method, not a `TC-*` |
| NFR-A11Y-03 | 4.5:1 text contrast | P1 | **Unverified** | SRS §5.6 | S-20 | — | — | budget never measured; verification is a measurement method, not a `TC-*` |
| NFR-A11Y-04 | `aria-live` announcement of new messages | P1 | **Missing** | SRS §5.6 | S-20 | — | — | verification is a measurement method, not a `TC-*` |
| NFR-A11Y-05 | Accessible names on images and icon buttons | P1 | **Defective** | SRS §5.6 | S-20 | — | — | verification is a measurement method, not a `TC-*` |
| NFR-A11Y-06 | Respect `prefers-reduced-motion` | P2 | **Missing** | SRS §5.6 | S-20 | — | — | verification is a measurement method, not a `TC-*` |
| NFR-COMPAT-01 | Browser support matrix | P1 | **Unverified** | SRS §5.7 | — | TC-E2E-01, TC-E2E-02, TC-E2E-03, TC-E2E-04, TC-E2E-05, TC-E2E-06, TC-E2E-07, TC-E2E-08, TC-E2E-09, TC-E2E-10 | — | budget never measured; **unowned** |
| NFR-COMPAT-02 | 320–2560 px viewports | P1 | Implemented | SRS §5.7 | — | — | — | verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-COMPAT-03 | Node.js 22 LTS | P0 | Implemented | SRS §5.7 | — | — | — | verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-COMPAT-04 | MySQL 8.0 / 8.4 with `utf8mb4` | P0 | **Partial** | SRS §5.7 | — | — | — | verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-COMPAT-05 | Long-polling fallback | P1 | Implemented | SRS §5.7 | — | — | — | verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-I18N-01 | Strings from a message catalogue | P2 | **Missing** | SRS §5.8 | S-20 | — | — | verification is a measurement method, not a `TC-*` |
| NFR-I18N-02 | Locale/timezone-correct timestamps | P1 | **Defective** | SRS §5.8 | S-20 | — | — | verification is a measurement method, not a `TC-*` |
| NFR-I18N-03 | Timestamps stored and sent in UTC | P0 | **Partial** | SRS §5.8 | S-20 | — | — | verification is a measurement method, not a `TC-*` |
| NFR-I18N-04 | RTL layout and bidi isolation | P2 | **Missing** | SRS §5.8 | S-20 | — | — | verification is a measurement method, not a `TC-*` |
| NFR-OPS-01 | Clean clone passes `npm ci && npm run validate` | P0 | Implemented | SRS §5.5 | S-0° | TC-REG-01, TC-REG-03, TC-REG-04, TC-DATA-10, TC-REG-02 | *SEC-C-27* | regression guard; task inferred from scope, not stated |
| NFR-OPS-02 | Every build-critical file tracked in git | P0 | **Defective** | SRS §5.5 | S-0° | TC-REG-02 | *SEC-C-24*, SEC-C-27 | task inferred from scope, not stated |
| NFR-OPS-03 | Structured JSON logs, redacted | P1 | **Defective** | SRS §5.5 | S-15 | TC-REG-17† | SEC-C-25 | gap G-24 |
| NFR-OPS-04 | Port contract dev / prod / test | P0 | Implemented | SRS §5.5 | S-2° | TC-REG-05, TC-REG-07, TC-REG-08, TC-REG-09, TC-REG-10 | — | regression guard; task inferred from scope, not stated |
| NFR-OPS-05 | Versioned migrations, no pending diff | P0 | **Partial** | SRS §5.5 | S-3, S-0° | TC-DATA-10 | — | — |
| NFR-OPS-06 | Configurable data retention | P1 | **Missing** | SRS §5.5 | — | — | — | verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-OPS-07 | `docker compose up` reproducible in 120 s | P0 | **Partial** | SRS §5.5 | S-6 | TC-REG-18† | — | — |
| NFR-OPS-08 | Docs claim no out-of-scope capability | P1 | **Defective** | SRS §5.5 | — | — | — | verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-PERF-01 | `conversation.list` ≤ 200 ms / history ≤ 150 ms p95 | P1 | **Unverified** | SRS §5.1 | S-3 | TC-DATA-08, TC-DATA-09 | SEC-C-16 | budget never measured |
| NFR-PERF-02 | No query count proportional to rows returned | P1 | **Defective** | SRS §5.1 | — | TC-CONV-09, TC-CONT-15 | — | **unowned** |
| NFR-PERF-03 | Send→deliver p95 ≤ 250 ms, p99 ≤ 800 ms | P0 | **Unverified** | SRS §5.1 | — | — | — | budget never measured; verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-PERF-04 | OAuth callback ≤ 300 ms; handshake ≤ 200 ms p95 | P1 | **Unverified** | SRS §5.1 | — | — | — | budget never measured; verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-PERF-05 | FCP ≤ 1.2 s, LCP ≤ 2.5 s | P1 | **Unverified** | SRS §5.1 | — | — | — | budget never measured; verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-PERF-06 | Initial JS ≤ 250 KB gzip, CI-gated | P1 | **Partial** | SRS §5.1 | S-16 | — | — | budget never measured; verification is a measurement method, not a `TC-*` |
| NFR-PERF-07 | Conversation switch renders in ≤ 300 ms | P1 | **Unverified** | SRS §5.1 | — | — | — | budget never measured; verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-PERF-08 | Inbound message triggers no full refetch | P1 | **Defective** | SRS §5.1 | — | TC-E2E-03 | — | **unowned** |
| NFR-REL-01 | Foreign keys and unique constraints | P0 | **Defective** | SRS §5.3 | S-3 | TC-DATA-01, TC-DATA-02, TC-DATA-03, TC-DATA-04, TC-DATA-05, TC-DATA-06, TC-DATA-07, TC-MSG-19, TC-CONT-18, TC-CONV-08, TC-MSG-10, TC-MSG-22 | SEC-C-16 | — |
| NFR-REL-02 | Survive and recover from DB loss in 30 s | P1 | **Unverified** | SRS §5.3 | — | — | SEC-C-28 | budget never measured; verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-REL-03 | No handler can terminate the process | P1 | **Partial** | SRS §5.3 | — | TC-AUTH-25, TC-SOCK-21 | — | **unowned** |
| NFR-REL-04 | Disconnected socket leaves no state | P1 | Implemented | SRS §5.3 | — | TC-SOCK-16, TC-NFR-01 | — | regression guard; **unowned** |
| NFR-REL-05 | Monthly availability ≥ 99.5 % | P1 | **Unverified** | SRS §5.3 | — | — | — | budget never measured; verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-REL-06 | RTO ≤ 1 h, RPO ≤ 15 min | P1 | **Missing** | SRS §5.3 | — | — | — | verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-REL-07 | Durable persist before acknowledgement | P0 | Implemented | SRS §5.3 | — | TC-SOCK-05 | — | regression guard; **unowned** |
| NFR-SCALE-01 | Correct delivery on ≥ 2 API nodes | P0 | **Defective** | SRS §5.4 | S-19 | TC-NFR-02 | — | gap G-21 |
| NFR-SCALE-02 | 10 000 sockets per node within budget | P1 | **Unverified** | SRS §5.4 | — | — | *SEC-C-19* | budget never measured; verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-SCALE-03 | 500 messages/s per node | P1 | **Unverified** | SRS §5.4 | — | — | — | budget never measured; verification is a measurement method, not a `TC-*`; **unowned** |
| NFR-SCALE-04 | DB pool capped at 20 per process | P1 | **Missing** | SRS §5.4 | S-19 | — | — | verification is a measurement method, not a `TC-*` |
| NFR-SCALE-05 | Fan-out O(participants) | P1 | Implemented | SRS §5.4 | — | TC-SOCK-06 | — | gap G-8; regression guard; **unowned** |
| NFR-SEC-01 | OAuth resistant to CSRF / code injection | P0 | **Missing** | SRS §5.2 | S-4 | TC-AUTH-27, TC-AUTH-28, TC-AUTH-29, TC-AUTH-30 | SEC-C-03, SEC-C-04 | gap G-17 |
| NFR-SEC-02 | No interpolated SQL; lint-enforced | P0 | **Defective** | SRS §5.2 | S-5 | TC-MSG-14 | SEC-C-15 | gap G-3 |
| NFR-SEC-03 | Zod validation on every trust boundary | P0 | **Defective** | SRS §5.2 | S-14 | TC-SOCK-18, TC-SOCK-19, TC-SOCK-20, TC-SOCK-21, TC-SOCK-22, TC-AUTH-06, TC-AUTH-09, TC-AUTH-10 | SEC-C-13 | — |
| NFR-SEC-04 | Session cookie never over cleartext HTTP | P0 | **Defective** | SRS §5.2 | S-17 | TC-AUTH-17 | SEC-C-07, *SEC-C-08* | gap G-18 |
| NFR-SEC-05 | No enumeration; uniform authz failures | P0 | **Defective** | SRS §5.2 | S-8 | TC-AUTHZ-01, TC-AUTHZ-02, TC-AUTHZ-03, TC-AUTHZ-04, TC-AUTHZ-05, TC-AUTHZ-06, TC-AUTHZ-07, TC-AUTHZ-08, TC-AUTHZ-09, TC-AUTHZ-10, TC-CONT-17, TC-SOCK-01, TC-SOCK-02 | SEC-C-12, SEC-C-26, SEC-C-30 | gap G-16 |
| NFR-SEC-06 | Security headers + CORS allowlist | P0 | **Missing** | SRS §5.2 | S-15 | TC-REG-15 | SEC-C-17, SEC-C-18, SEC-C-22 | gap G-21 |
| NFR-SEC-07 | Token-bucket rate limiting on write surfaces | P0 | **Missing** | SRS §5.2 | S-13 | TC-SOCK-23 | SEC-C-14, SEC-C-19, *SEC-C-20* | — |
| NFR-SEC-08 | Secrets ≥ 32 bytes or refuse to start | P0 | **Defective** | SRS §5.2 | S-17 | TC-AUTH-34 | SEC-C-24 | gap G-13 |
| NFR-SEC-09 | DB least privilege, TLS, capped pool | P1 | **Defective** | SRS §5.2 | S-19 | TC-DATA-11† | SEC-C-28 | — |
| NFR-SEC-10 | No over-disclosing response fields | P0 | **Defective** | SRS §5.2 | S-10, S-18 | TC-AUTH-15, TC-CONT-17 | — | — |
| NFR-SEC-11 | Request body limit 256 KB | P1 | **Defective** | SRS §5.2 | S-13 | TC-REG-14 | SEC-C-20 | — |
| NFR-SEC-12 | Committed lockfile + advisory gate | P0 | **Partial** | SRS §5.2 | S-0° | TC-REG-01, TC-REG-02 | SEC-C-27 | task inferred from scope, not stated |

---

## 4. Reverse index — task → requirements

This is the section Claude Code reads when picking up a task. For each `BUILD_PLAN.md` task: the requirements it closes, and the test ids that verify them.

**Stated** = the task card names the id on its `**Satisfies:**` line. **Inferred (°)** = the card's scope covers it but no id is named — apply **M-3** and promote these to stated.

| Task | Wave | Title | Closes (stated) | Closes (inferred °) | Verifying tests that exist in `TEST_PLAN.md` | Tests still to write (†) |
|---|---|---|---|---|---|---|
| **S-0** | 0 | Make the repository build from a clean clone ✅ | — | NFR-OPS-01, NFR-OPS-02, NFR-OPS-05, NFR-SEC-12 | TC-DATA-10, TC-REG-01, TC-REG-02, TC-REG-03, TC-REG-04 | — |
| **S-2** | 0 | Dev server binds a port ✅ | — | NFR-OPS-04 | TC-REG-05, TC-REG-07, TC-REG-08, TC-REG-09, TC-REG-10 | — |
| **S-8** | 1 | Authorize `message.markAsRead` | FR-CONV-02, FR-MSG-05, NFR-SEC-05 | — | TC-AUTHZ-01, TC-AUTHZ-02, TC-AUTHZ-03, TC-AUTHZ-04, TC-AUTHZ-05, TC-AUTHZ-06, TC-AUTHZ-07, TC-AUTHZ-08, TC-AUTHZ-09, TC-AUTHZ-10, TC-CONT-17, TC-DATA-02, TC-MSG-14, TC-MSG-16, TC-MSG-18, TC-MSG-19, TC-SOCK-01, TC-SOCK-02, TC-SOCK-04, TC-SOCK-07, TC-SOCK-10, TC-SOCK-11 | — |
| **S-9** | 1 | Validate participants on conversation creation, and enforce blocking | FR-CONT-12, FR-CONV-01, FR-CONV-08, FR-CONV-09, FR-CONV-10, FR-CONV-11, FR-CONV-12 | — | TC-CONV-01, TC-CONV-02, TC-CONV-11, TC-CONV-12, TC-CONV-13 | TC-CONT-24, TC-CONV-15, TC-CONV-16 |
| **S-10** | 1 | Close the directory-enumeration and presence leaks | FR-CONT-05, FR-CONT-06, FR-CONT-07, FR-CONT-08, FR-PRES-04, FR-PRES-05, NFR-SEC-10 | — | TC-AUTH-15, TC-AUTHZ-10, TC-CONT-13, TC-CONT-14, TC-CONT-15, TC-CONT-16, TC-CONT-17, TC-SOCK-17 | TC-CONT-20 |
| **S-4** | 1 | OAuth coherence, `state`, PKCE, and the redirect_uri mismatch | FR-AUTH-06, FR-AUTH-07, FR-AUTH-08, FR-AUTH-09, FR-SESS-02, NFR-SEC-01 | — | TC-AUTH-17, TC-AUTH-21, TC-AUTH-27, TC-AUTH-28, TC-AUTH-29, TC-AUTH-30, TC-AUTH-31, TC-AUTH-32, TC-AUTH-33, TC-E2E-02 | — |
| **S-5** | 1 | Fix read receipts (`IN (?)`) and message-router query hygiene | FR-MSG-04, NFR-SEC-02 | — | TC-MSG-14, TC-MSG-16 | — |
| **S-17** | 1 | Session lifecycle hardening | FR-AUTH-12, FR-SESS-03, FR-SESS-06, FR-SESS-07, FR-SESS-08, FR-SESS-09, FR-SESS-10, NFR-SEC-04, NFR-SEC-08 | — | TC-AUTH-17, TC-AUTH-18, TC-AUTH-34, TC-REG-12, TC-REG-13, TC-SOCK-24 | TC-AUTH-35, TC-AUTH-36, TC-AUTH-37, TC-REG-19 |
| **S-3** | 2 | Foreign keys, unique constraints, and indexes | FR-CONT-02, FR-CONT-04, NFR-OPS-05, NFR-PERF-01, NFR-REL-01 | FR-ADMIN-10, FR-CONT-14 | TC-CONT-01, TC-CONT-02, TC-CONT-03, TC-CONT-04, TC-CONT-06, TC-CONT-07, TC-CONT-08, TC-CONT-11, TC-CONT-18, TC-CONV-08, TC-DATA-01, TC-DATA-02, TC-DATA-03, TC-DATA-04, TC-DATA-05, TC-DATA-06, TC-DATA-07, TC-DATA-08, TC-DATA-09, TC-DATA-10, TC-MSG-10, TC-MSG-19, TC-MSG-22 | TC-ADMIN-10, TC-CONT-19, TC-CONT-25 |
| **S-11** | 2 | Make `conversations.updatedAt` real, and add unread counts | FR-CONV-05, FR-CONV-07, FR-MSG-08, FR-MSG-09 | — | TC-CONV-04, TC-CONV-05, TC-CONV-06, TC-CONV-07, TC-E2E-07, TC-SOCK-06 | TC-CONV-14, TC-MSG-23, TC-MSG-32 |
| **S-7** | 3 | Integration and socket test harness | — | — | — | — |
| **S-12** | 3 | CI: integration services and required checks | — | — | — | — |
| **F-1** | 4 | Unread message badges | — | FR-NOTIF-08 | — | TC-NOTIF-08 |
| **F-2** | 4 | Message editing & soft deletion | — | FR-MSG-12, FR-MSG-13 | — | TC-MSG-26, TC-MSG-27 |
| **F-3** | 4 | Emoji reactions | — | FR-MSG-14 | — | TC-MSG-28 |
| **F-4** | 4 | File & image attachments | — | FR-FILE-01, FR-FILE-02, FR-FILE-03, FR-FILE-04, FR-FILE-05, FR-FILE-06, FR-FILE-07, FR-FILE-08, FR-FILE-09 | — | TC-FILE-01, TC-FILE-02, TC-FILE-03, TC-FILE-04, TC-FILE-05, TC-FILE-06, TC-FILE-07, TC-FILE-08, TC-FILE-09 |
| **F-5** | 4 | Reply threading UI | — | FR-MSG-03 | TC-MSG-11 | — |
| **F-6** | 4 | Web push notifications | — | FR-NOTIF-01, FR-NOTIF-02, FR-NOTIF-03, FR-NOTIF-04, FR-NOTIF-05, FR-NOTIF-06, FR-NOTIF-09 | — | TC-NOTIF-01, TC-NOTIF-02, TC-NOTIF-03, TC-NOTIF-04, TC-NOTIF-05, TC-NOTIF-06, TC-NOTIF-09 |
| **F-7** | 4 | Group management | FR-CONV-13, FR-CONV-14 | — | — | TC-CONV-17, TC-CONV-18 |
| **F-8** | 4 | Blocking semantics end to end | FR-CONT-04, FR-CONT-09, FR-CONT-10, FR-CONT-11, FR-MSG-19 | — | TC-CONT-11, TC-CONT-12 | TC-CONT-19, TC-CONT-22, TC-CONT-23, TC-MSG-31 |
| **S-6** | 5 | Docker stack ✅ | NFR-OPS-07 | — | — | TC-REG-18 |
| **S-13** | 5 | Rate limiting | NFR-SEC-07, NFR-SEC-11 | — | TC-REG-14, TC-SOCK-23 | — |
| **S-14** | 5 | Runtime validation of socket payloads with shared Zod schemas in `cont | FR-MSG-01, NFR-SEC-03 | — | TC-AUTH-06, TC-AUTH-09, TC-AUTH-10, TC-MSG-06, TC-MSG-07, TC-MSG-08, TC-MSG-09, TC-MSG-10, TC-MSG-13, TC-SOCK-05, TC-SOCK-18, TC-SOCK-19, TC-SOCK-20, TC-SOCK-21, TC-SOCK-22 | — |
| **S-15** | 5 | Observability | FR-ADMIN-11, NFR-OPS-03, NFR-SEC-06 | — | TC-REG-15 | TC-REG-17, TC-REG-20 |
| **S-16** | 5 | Client code-splitting to meet the SRS bundle budget; add a CI size gat | NFR-PERF-06 | — | — | — |
| **S-18** | 5 | Owner/admin capability and data rights | FR-ADMIN-01, FR-ADMIN-02, FR-ADMIN-03, FR-ADMIN-04, FR-ADMIN-05, FR-ADMIN-06, FR-ADMIN-07, FR-ADMIN-08, FR-ADMIN-09, FR-ADMIN-10, NFR-SEC-10 | — | TC-AUTH-15, TC-CONT-17 | TC-ADMIN-01, TC-ADMIN-02, TC-ADMIN-03, TC-ADMIN-04, TC-ADMIN-05, TC-ADMIN-06, TC-ADMIN-07, TC-ADMIN-08, TC-ADMIN-09, TC-ADMIN-10 |
| **S-19** | 5 | Horizontal scale readiness | FR-PRES-08, NFR-SCALE-01, NFR-SCALE-04, NFR-SEC-09 | — | TC-NFR-02 | TC-DATA-11 |
| **S-20** | 5 | Accessibility and internationalisation baseline | NFR-A11Y-01, NFR-A11Y-02, NFR-A11Y-03, NFR-A11Y-04, NFR-A11Y-05, NFR-A11Y-06, NFR-I18N-01, NFR-I18N-02, NFR-I18N-03, NFR-I18N-04 | — | — | — |

### 4.1 `BUILD_PLAN.md` `**Tests:**` lines vs the `TEST_PLAN.md` catalogue

Every task card that carries a `**Tests:**` line, cross-checked mechanically: a cited id is **sound** when `TEST_PLAN.md` binds it to a requirement on that card's `**Satisfies:**` line, **or** when one of those requirements cites the id in its `SRS.md` Verification column, **or** when the `SEC-C-*` control `TEST_PLAN.md` binds it to is mapped by `SECURITY.md` §13 to one of them. Many `TEST_PLAN.md` rows are bound to a control rather than to a requirement id; that is the reverse direction of the same link.

| Task | Cited in `BUILD_PLAN.md` | Sound? |
|---|---|---|
| S-8 | TC-AUTHZ-08, TC-MSG-18, TC-MSG-19, TC-SOCK-11, TC-SOCK-12 | **Sound** — every id binds to a requirement this card satisfies |
| S-9 | TC-CONV-01, TC-CONV-02, TC-CONV-11, TC-CONV-12, TC-CONV-13, TC-CONV-15, TC-CONV-16, TC-CONT-24 | **Sound** — every id binds to a requirement this card satisfies |
| S-10 | TC-AUTHZ-10, TC-CONT-13, TC-CONT-14, TC-CONT-15, TC-CONT-16, TC-CONT-17, TC-SOCK-17, TC-CONT-20 | **Sound** — every id binds to a requirement this card satisfies |
| S-4 | TC-AUTH-17, TC-AUTH-21, TC-AUTH-27, TC-AUTH-28, TC-AUTH-29, TC-AUTH-30, TC-AUTH-31, TC-AUTH-32, TC-AUTH-33, TC-E2E-02 | **Sound** — every id binds to a requirement this card satisfies |
| S-5 | TC-MSG-14, TC-MSG-15, TC-MSG-16, TC-REG-11 | **Sound** — every id binds to a requirement this card satisfies |
| S-17 | TC-AUTH-17, TC-AUTH-18, TC-AUTH-34, TC-REG-12, TC-REG-13, TC-SOCK-24, TC-AUTH-35, TC-AUTH-36, TC-AUTH-37, TC-REG-19 | **Sound** — every id binds to a requirement this card satisfies |
| S-3 | TC-DATA-01, TC-DATA-02, TC-DATA-03, TC-DATA-04, TC-DATA-05, TC-DATA-06, TC-DATA-07, TC-DATA-08, TC-DATA-09, TC-DATA-10, TC-CONT-11, TC-CONT-18, … (13 ids) | **Sound** — every id binds to a requirement this card satisfies |
| S-11 | TC-CONV-04, TC-CONV-05, TC-E2E-07, TC-CONV-14, TC-MSG-23, TC-MSG-32 | **Sound** — every id binds to a requirement this card satisfies |
| F-7 | TC-CONV-17, TC-CONV-18 | **Sound** — every id binds to a requirement this card satisfies |
| F-8 | TC-CONT-11, TC-CONT-12, TC-CONT-19, TC-CONT-22, TC-CONT-23, TC-MSG-31 | **Sound** — every id binds to a requirement this card satisfies |
| S-6 | TC-REG-18 | **Sound** — every id binds to a requirement this card satisfies |
| S-13 | TC-SOCK-23, TC-REG-14 | **Sound** — every id binds to a requirement this card satisfies |
| S-14 | TC-MSG-06, TC-MSG-07, TC-MSG-08, TC-MSG-09, TC-MSG-13, TC-SOCK-18, TC-SOCK-19, TC-SOCK-20, TC-SOCK-21, TC-SOCK-22 | **Sound** — every id binds to a requirement this card satisfies |
| S-15 | TC-REG-15, TC-REG-17, TC-REG-20 | **Sound** — every id binds to a requirement this card satisfies |
| S-18 | TC-AUTH-15, TC-ADMIN-01, TC-ADMIN-02, TC-ADMIN-03, TC-ADMIN-04, TC-ADMIN-05, TC-ADMIN-06, TC-ADMIN-07, TC-ADMIN-08, TC-ADMIN-09, TC-ADMIN-10 | **Sound** — every id binds to a requirement this card satisfies |
| S-19 | TC-NFR-02, TC-DATA-11 | **Sound** — every id binds to a requirement this card satisfies |
| S-20 | *no `TC-*` id cited — `to be written — see TEST_PLAN.md §5`* | **Sound** — an admitted gap, not a borrowed case |

**0 mis-citations remain.** Before this pass, 5 of the 7 cards then carrying a `**Tests:**` line cited at least one case that `TEST_PLAN.md` binds to a different requirement — S-8 cited a `replyToId` test and a presence test for a read-receipt authorization fix, S-5 cited two 4 000-character content-validation cases for the `IN (?)` read-receipt defect, S-10 cited `contact.remove` and a 100 000-character socket payload for a search/presence leak, and S-4 cited the session-token and logout range for `state`/PKCE/`redirect_uri`. Rule for keeping it this way: **a task card's `**Tests:**` line must cite ids whose binding — in either direction — names one of the requirements on its `**Satisfies:**` line.** Where no case exists yet, write `Tests: to be written — see TEST_PLAN.md §5` rather than borrowing a wrong one.

### 4.2 Tasks with no `Satisfies` line at all

`S-0`, `S-2`, `S-7`, `S-12`, `F-1`, `F-2`, `F-3`, `F-4`, `F-5`, `F-6` carry no `**Satisfies:**` line. Where the card's prose is unambiguous the requirement is recorded above with `°`; the basis for each inference is:

| Task | Basis for the inferred mapping |
|---|---|
| S-0 | card text: lockfile committed, entry/config files added, baseline migration generated |
| S-2 | card text: dev binds `API_PORT` 3001, prod `PORT` 3000, test binds none |
| S-7 | pure enabler — see §7.3 |
| S-12 | pure enabler — see §7.3 |
| F-1 | feature name: unread message badges |
| F-2 | feature name: message editing & soft deletion |
| F-3 | feature name: emoji reactions |
| F-4 | feature name: file & image attachments |
| F-5 | feature name: reply threading UI |
| F-6 | feature name: web push notifications |
| H-1…H-5 | card text: archive `alice.pdf`, delete the dead cookie helper, reconcile the "JWT" wording |

### 4.3 Wildcards in `Satisfies` lines

| Task | Wildcard as written | Resolved to | Status |
|---|---|---|---|
| S-8 | `NFR-SEC-* (authorization)` | NFR-SEC-05 | **Fixed** — the card now states `FR-MSG-05, NFR-SEC-05`. `NFR-SEC-*` was 12 requirements; only NFR-SEC-05 names `message.markAsRead` as one of its three enumeration oracles |
| S-3 | `NFR-REL-*` | NFR-REL-01 | **Fixed** — the card now states `NFR-REL-01, NFR-PERF-01, FR-CONT-02, FR-CONT-04`. `NFR-REL-*` was 7 requirements; NFR-REL-02…07 (reconnect, error boundaries, soak, availability, RTO/RPO, durability) are untouched by S-3 |
| S-4 | `FR-AUTH-06…09` | FR-AUTH-06, FR-AUTH-07, FR-AUTH-08, FR-AUTH-09 | **Fixed** — range expanded to explicit ids, plus NFR-SEC-01 |

No wildcard remains in any `**Satisfies:**` line. Under **M-3** none may be reintroduced.

---

## 5. Reverse index — test → requirements

### 5.1 By group

| Group | Ids in `TEST_PLAN.md` | Count | `TEST_PLAN.md` §| Requirements covered (union of both directions) |
|---|---|---:|---|---|
| TC-AUTH | TC-AUTH-01…TC-AUTH-34 | 34 | §5.1 | FR-ADMIN-07, FR-AUTH-01, FR-AUTH-02, FR-AUTH-03, FR-AUTH-04, FR-AUTH-05, FR-AUTH-06, FR-AUTH-07, FR-AUTH-08, FR-AUTH-09, FR-AUTH-10, FR-AUTH-11, FR-SESS-01, FR-SESS-02, FR-SESS-04, FR-SESS-05, FR-SESS-06, NFR-REL-03, NFR-SEC-01, NFR-SEC-03, NFR-SEC-04, NFR-SEC-08, NFR-SEC-10 |
| TC-AUTHZ | TC-AUTHZ-01…TC-AUTHZ-10 | 10 | §5.2 | FR-AUTH-04, FR-CONT-01, FR-CONT-06, FR-CONT-07, FR-CONV-02, FR-CONV-04, FR-CONV-15, FR-MSG-05, NFR-SEC-05 |
| TC-CONV | TC-CONV-01…TC-CONV-13 | 13 | §5.3 | FR-CONV-01, FR-CONV-03, FR-CONV-04, FR-CONV-05, FR-CONV-06, FR-CONV-08, FR-CONV-09, FR-CONV-10, FR-MSG-09, NFR-PERF-02, NFR-REL-01 |
| TC-MSG | TC-MSG-01…TC-MSG-22 | 22 | §5.4 | FR-MSG-01, FR-MSG-02, FR-MSG-03, FR-MSG-04, FR-MSG-05, FR-MSG-17, NFR-REL-01, NFR-SEC-02 |
| TC-CONT | TC-CONT-01…TC-CONT-18 | 18 | §5.5 | FR-CONT-01, FR-CONT-02, FR-CONT-03, FR-CONT-04, FR-CONT-05, FR-CONT-07, FR-CONT-09, FR-CONT-13, FR-CONT-14, NFR-PERF-02, NFR-REL-01, NFR-SEC-05, NFR-SEC-10 |
| TC-SOCK | TC-SOCK-01…TC-SOCK-24 | 24 | §5.6 | FR-CONV-02, FR-CONV-05, FR-MSG-01, FR-MSG-05, FR-MSG-06, FR-MSG-07, FR-MSG-16, FR-PRES-01, FR-PRES-02, FR-PRES-03, FR-PRES-04, FR-PRES-05, FR-PRES-07, FR-SESS-09, NFR-REL-03, NFR-REL-04, NFR-REL-07, NFR-SCALE-05, NFR-SEC-03, NFR-SEC-05, NFR-SEC-07 |
| TC-DATA | TC-DATA-01…TC-DATA-10 | 10 | §5.7 | FR-MSG-05, NFR-OPS-01, NFR-OPS-05, NFR-PERF-01, NFR-REL-01 |
| TC-REG | TC-REG-01…TC-REG-15 | 15 | §5.8 | FR-AUTH-12, NFR-OPS-01, NFR-OPS-02, NFR-OPS-04, NFR-SEC-06, NFR-SEC-11, NFR-SEC-12 |
| TC-E2E | TC-E2E-01…TC-E2E-10 | 10 | §6 | FR-AUTH-05, FR-AUTH-06, FR-CONV-05, FR-MSG-06, FR-MSG-16, FR-PRES-02, FR-PRES-03, FR-PRES-06, FR-SESS-01, NFR-COMPAT-01, NFR-PERF-08 |
| TC-NFR | TC-NFR-01…TC-NFR-02 | 2 | §7.3 | FR-PRES-07, FR-PRES-08, NFR-REL-04, NFR-SCALE-01 |

**Groups that do not yet exist and must be created (all cases `†`):**

| Group | Ids allocated by `SRS.md` | Count | Requirements they would cover |
|---|---|---:|---|
| TC-FILE | TC-FILE-01…TC-FILE-10 | 10 | FR-FILE-01, FR-FILE-02, FR-FILE-03, FR-FILE-04, FR-FILE-05, FR-FILE-06, FR-FILE-07, FR-FILE-08, FR-FILE-09, FR-FILE-10 |
| TC-NOTIF | TC-NOTIF-01…TC-NOTIF-09 | 9 | FR-NOTIF-01, FR-NOTIF-02, FR-NOTIF-03, FR-NOTIF-04, FR-NOTIF-05, FR-NOTIF-06, FR-NOTIF-07, FR-NOTIF-08, FR-NOTIF-09 |
| TC-ADMIN | TC-ADMIN-01…TC-ADMIN-10 | 10 | FR-ADMIN-01, FR-ADMIN-02, FR-ADMIN-03, FR-ADMIN-04, FR-ADMIN-05, FR-ADMIN-06, FR-ADMIN-07, FR-ADMIN-08, FR-ADMIN-09, FR-ADMIN-10 |

**Ids allocated by `SRS.md` above the maximum of an existing group (all cases `†`):**

| Group | Existing maximum | New ids allocated | Next free id |
|---|---|---|---|
| TC-AUTH | TC-AUTH-34 | TC-AUTH-35, TC-AUTH-36, TC-AUTH-37 | TC-AUTH-38 |
| TC-AUTHZ | TC-AUTHZ-10 | *none* | TC-AUTHZ-11 |
| TC-CONV | TC-CONV-13 | TC-CONV-14, TC-CONV-15, TC-CONV-16, TC-CONV-17, TC-CONV-18 | TC-CONV-19 |
| TC-MSG | TC-MSG-22 | TC-MSG-23, TC-MSG-24, TC-MSG-25, TC-MSG-26, TC-MSG-27, TC-MSG-28, TC-MSG-29, TC-MSG-30, TC-MSG-31, TC-MSG-32 | TC-MSG-33 |
| TC-CONT | TC-CONT-18 | TC-CONT-19, TC-CONT-20, TC-CONT-22, TC-CONT-23, TC-CONT-24, TC-CONT-25 | TC-CONT-26 |
| TC-SOCK | TC-SOCK-24 | TC-SOCK-26, TC-SOCK-27 | TC-SOCK-28 |
| TC-DATA | TC-DATA-10 | TC-DATA-11 | TC-DATA-12 |
| TC-REG | TC-REG-15 | TC-REG-17, TC-REG-18, TC-REG-19, TC-REG-20 | TC-REG-21 |
| TC-E2E | TC-E2E-10 | *none* | TC-E2E-11 |
| TC-NFR | TC-NFR-02 | *none* | TC-NFR-03 |

Every id in the third column is strictly greater than the second, so no `†` id can denote an existing case. `SRS.md` §1.4 carries the same table as the allocation rule.

### 5.2 Per test case

`Verifies (TEST_PLAN)` is that document's own binding — a requirement id where it names one, otherwise the `SEC-C-*` control it names, in *italics*. `Cited by (SRS)` is every requirement whose Verification column points at the case. A `—` in the last column means no requirement cites the case; a `—` in both means the case has no binding at all and one must be added.

| TC | §| Verifies (TEST_PLAN) | Cited by (SRS) |
|---|---|---|---|
| TC-AUTH-01 | §5.1 | FR-AUTH-01 | FR-AUTH-01 |
| TC-AUTH-02 | §5.1 | FR-AUTH-01 | FR-AUTH-01 |
| TC-AUTH-03 | §5.1 | FR-AUTH-01 | FR-AUTH-01 |
| TC-AUTH-04 | §5.1 | FR-AUTH-03 | FR-AUTH-03 |
| TC-AUTH-05 | §5.1 | FR-AUTH-03 | FR-AUTH-03 |
| TC-AUTH-06 | §5.1 | NFR-SEC-03 | FR-SESS-05 |
| TC-AUTH-07 | §5.1 | FR-AUTH-01 | — |
| TC-AUTH-08 | §5.1 | *SEC-C-24* | — |
| TC-AUTH-09 | §5.1 | NFR-SEC-03 | FR-SESS-05 |
| TC-AUTH-10 | §5.1 | NFR-SEC-03 | — |
| TC-AUTH-11 | §5.1 | FR-AUTH-01 | — |
| TC-AUTH-12 | §5.1 | FR-AUTH-01 | — |
| TC-AUTH-13 | §5.1 | FR-AUTH-04 | FR-AUTH-04 |
| TC-AUTH-14 | §5.1 | FR-AUTH-04 | FR-AUTH-04, FR-SESS-04 |
| TC-AUTH-15 | §5.1 | FR-AUTH-04 | FR-AUTH-04, FR-ADMIN-07, NFR-SEC-10 |
| TC-AUTH-16 | §5.1 | FR-AUTH-05 | FR-AUTH-05, FR-SESS-01 |
| TC-AUTH-17 | §5.1 | *SEC-C-07* | FR-SESS-02, NFR-SEC-04 |
| TC-AUTH-18 | §5.1 | *SEC-C-05* | FR-SESS-06 |
| TC-AUTH-19 | §5.1 | FR-AUTH-02 | FR-AUTH-02, FR-AUTH-10 |
| TC-AUTH-20 | §5.1 | FR-AUTH-02 | FR-AUTH-10 |
| TC-AUTH-21 | §5.1 | FR-AUTH-02 | FR-AUTH-02, FR-AUTH-07 |
| TC-AUTH-22 | §5.1 | FR-AUTH-02 | FR-AUTH-11 |
| TC-AUTH-23 | §5.1 | FR-AUTH-02 | FR-AUTH-11 |
| TC-AUTH-24 | §5.1 | FR-AUTH-02 | FR-AUTH-11 |
| TC-AUTH-25 | §5.1 | NFR-REL-03 | FR-AUTH-11, NFR-REL-03 |
| TC-AUTH-26 | §5.1 | FR-AUTH-02 | FR-AUTH-11 |
| TC-AUTH-27 | §5.1 | *SEC-C-03* | FR-AUTH-08, NFR-SEC-01 |
| TC-AUTH-28 | §5.1 | *SEC-C-03* | FR-AUTH-08, NFR-SEC-01 |
| TC-AUTH-29 | §5.1 | *SEC-C-03* | FR-AUTH-08, NFR-SEC-01 |
| TC-AUTH-30 | §5.1 | *SEC-C-04* | FR-AUTH-09, NFR-SEC-01 |
| TC-AUTH-31 | §5.1 | *SEC-C-01* | FR-AUTH-06 |
| TC-AUTH-32 | §5.1 | *SEC-C-01* | FR-AUTH-06 |
| TC-AUTH-33 | §5.1 | *SEC-C-02* | FR-AUTH-07 |
| TC-AUTH-34 | §5.1 | *SEC-C-24* | NFR-SEC-08 |
| TC-AUTHZ-01 | §5.2 | NFR-SEC-05 | FR-AUTH-04, NFR-SEC-05 |
| TC-AUTHZ-02 | §5.2 | — | NFR-SEC-05 |
| TC-AUTHZ-03 | §5.2 | FR-CONV-02 | FR-CONV-02, NFR-SEC-05 |
| TC-AUTHZ-04 | §5.2 | FR-CONV-02 | FR-CONV-02, NFR-SEC-05 |
| TC-AUTHZ-05 | §5.2 | FR-CONV-02 | FR-CONV-02, NFR-SEC-05 |
| TC-AUTHZ-06 | §5.2 | *SEC-C-26* | FR-CONV-15, NFR-SEC-05 |
| TC-AUTHZ-07 | §5.2 | FR-CONV-04 | FR-CONV-04, NFR-SEC-05 |
| TC-AUTHZ-08 | §5.2 | *SEC-C-10* | FR-CONV-15, FR-MSG-05, NFR-SEC-05 |
| TC-AUTHZ-09 | §5.2 | FR-CONT-01 | FR-CONT-01, NFR-SEC-05 |
| TC-AUTHZ-10 | §5.2 | *SEC-C-12* | FR-CONT-06, FR-CONT-07, NFR-SEC-05 |
| TC-CONV-01 | §5.3 | FR-CONV-01 | FR-CONV-01 |
| TC-CONV-02 | §5.3 | FR-CONV-01 | FR-CONV-01 |
| TC-CONV-03 | §5.3 | FR-CONV-03 | FR-CONV-03 |
| TC-CONV-04 | §5.3 | FR-CONV-05 | FR-CONV-05, FR-MSG-09 |
| TC-CONV-05 | §5.3 | FR-CONV-05 | FR-CONV-06 |
| TC-CONV-06 | §5.3 | FR-CONV-05 | FR-CONV-06 |
| TC-CONV-07 | §5.3 | FR-CONV-05 | FR-CONV-06 |
| TC-CONV-08 | §5.3 | NFR-REL-01 | FR-CONV-06 |
| TC-CONV-09 | §5.3 | NFR-PERF-02 | NFR-PERF-02 |
| TC-CONV-10 | §5.3 | FR-CONV-04 | FR-CONV-04 |
| TC-CONV-11 | §5.3 | *SEC-C-11* | FR-CONV-08 |
| TC-CONV-12 | §5.3 | *SEC-C-11* | FR-CONV-10 |
| TC-CONV-13 | §5.3 | *SEC-C-11* | FR-CONV-09 |
| TC-MSG-01 | §5.4 | FR-MSG-02 | FR-MSG-02 |
| TC-MSG-02 | §5.4 | FR-MSG-02 | FR-MSG-02 |
| TC-MSG-03 | §5.4 | FR-MSG-02 | FR-MSG-02 |
| TC-MSG-04 | §5.4 | FR-MSG-02 | FR-MSG-02 |
| TC-MSG-05 | §5.4 | FR-MSG-02 | FR-MSG-02 |
| TC-MSG-06 | §5.4 | FR-MSG-01 | FR-MSG-01 |
| TC-MSG-07 | §5.4 | FR-MSG-01 | FR-MSG-01 |
| TC-MSG-08 | §5.4 | FR-MSG-01 | FR-MSG-01 |
| TC-MSG-09 | §5.4 | FR-MSG-01 | FR-MSG-01 |
| TC-MSG-10 | §5.4 | FR-MSG-01, NFR-REL-01 | FR-MSG-17 |
| TC-MSG-11 | §5.4 | FR-MSG-03 | FR-MSG-03 |
| TC-MSG-12 | §5.4 | *SEC-C-11* | — |
| TC-MSG-13 | §5.4 | FR-MSG-01 | — |
| TC-MSG-14 | §5.4 | FR-MSG-05 | FR-MSG-04, NFR-SEC-02 |
| TC-MSG-15 | §5.4 | *SEC-C-15* | — |
| TC-MSG-16 | §5.4 | FR-MSG-05 | FR-MSG-04 |
| TC-MSG-17 | §5.4 | *SEC-C-15* | — |
| TC-MSG-18 | §5.4 | FR-MSG-05 | FR-MSG-05 |
| TC-MSG-19 | §5.4 | FR-MSG-05 | FR-MSG-05, NFR-REL-01 |
| TC-MSG-20 | §5.4 | *SEC-C-13* | — |
| TC-MSG-21 | §5.4 | FR-MSG-02 | FR-MSG-02 |
| TC-MSG-22 | §5.4 | NFR-REL-01 | — |
| TC-CONT-01 | §5.5 | FR-CONT-02 | FR-CONT-02 |
| TC-CONT-02 | §5.5 | FR-CONT-02 | — |
| TC-CONT-03 | §5.5 | FR-CONT-02 | FR-CONT-13 |
| TC-CONT-04 | §5.5 | FR-CONT-02 | FR-CONT-14 |
| TC-CONT-05 | §5.5 | FR-CONT-01 | FR-CONT-01 |
| TC-CONT-06 | §5.5 | FR-CONT-02 | FR-CONT-02 |
| TC-CONT-07 | §5.5 | FR-CONT-02 | FR-CONT-02 |
| TC-CONT-08 | §5.5 | FR-CONT-02 | FR-CONT-02 |
| TC-CONT-09 | §5.5 | FR-CONT-03 | FR-CONT-03 |
| TC-CONT-10 | §5.5 | FR-CONT-03 | FR-CONT-03 |
| TC-CONT-11 | §5.5 | FR-CONT-04 | FR-CONT-01, FR-CONT-04 |
| TC-CONT-12 | §5.5 | *SEC-C-11* | FR-CONT-09 |
| TC-CONT-13 | §5.5 | FR-CONT-05 | FR-CONT-05 |
| TC-CONT-14 | §5.5 | FR-CONT-05 | FR-CONT-05 |
| TC-CONT-15 | §5.5 | FR-CONT-05, NFR-PERF-02 | FR-CONT-05, NFR-PERF-02 |
| TC-CONT-16 | §5.5 | FR-CONT-05 | FR-CONT-05 |
| TC-CONT-17 | §5.5 | *SEC-C-12* | FR-CONT-07, NFR-SEC-05, NFR-SEC-10 |
| TC-CONT-18 | §5.5 | *SEC-C-16* | NFR-REL-01 |
| TC-SOCK-01 | §5.6 | NFR-SEC-05 | — |
| TC-SOCK-02 | §5.6 | NFR-SEC-05 | — |
| TC-SOCK-03 | §5.6 | FR-PRES-01 | FR-PRES-01 |
| TC-SOCK-04 | §5.6 | FR-CONV-02 | FR-CONV-02 |
| TC-SOCK-05 | §5.6 | FR-MSG-01 | FR-MSG-06, FR-MSG-16, NFR-REL-07 |
| TC-SOCK-06 | §5.6 | FR-CONV-05 | FR-MSG-07, NFR-SCALE-05 |
| TC-SOCK-07 | §5.6 | FR-CONV-02 | FR-CONV-02 |
| TC-SOCK-08 | §5.6 | FR-PRES-03 | FR-PRES-03 |
| TC-SOCK-09 | §5.6 | FR-PRES-03 | — |
| TC-SOCK-10 | §5.6 | FR-MSG-05 | — |
| TC-SOCK-11 | §5.6 | FR-CONV-02 | — |
| TC-SOCK-12 | §5.6 | *SEC-C-10* | — |
| TC-SOCK-13 | §5.6 | FR-PRES-01 | — |
| TC-SOCK-14 | §5.6 | FR-PRES-02 | — |
| TC-SOCK-15 | §5.6 | FR-PRES-02 | — |
| TC-SOCK-16 | §5.6 | NFR-REL-04 | FR-PRES-02, FR-PRES-07, NFR-REL-04 |
| TC-SOCK-17 | §5.6 | *SEC-C-21* | FR-PRES-04, FR-PRES-05 |
| TC-SOCK-18 | §5.6 | *SEC-C-13* | NFR-SEC-03 |
| TC-SOCK-19 | §5.6 | *SEC-C-13* | FR-MSG-01, NFR-SEC-03 |
| TC-SOCK-20 | §5.6 | *SEC-C-13* | NFR-SEC-03 |
| TC-SOCK-21 | §5.6 | NFR-REL-03 | NFR-SEC-03, NFR-REL-03 |
| TC-SOCK-22 | §5.6 | *SEC-C-13* | NFR-SEC-03 |
| TC-SOCK-23 | §5.6 | *SEC-C-19* | NFR-SEC-07 |
| TC-SOCK-24 | §5.6 | *SEC-C-29* | FR-SESS-09 |
| TC-DATA-01 | §5.7 | *SEC-C-16* | NFR-REL-01 |
| TC-DATA-02 | §5.7 | FR-MSG-05 | NFR-REL-01 |
| TC-DATA-03 | §5.7 | *SEC-C-16* | NFR-REL-01 |
| TC-DATA-04 | §5.7 | *SEC-C-16* | NFR-REL-01 |
| TC-DATA-05 | §5.7 | *SEC-C-16* | NFR-REL-01 |
| TC-DATA-06 | §5.7 | *SEC-C-16* | NFR-REL-01 |
| TC-DATA-07 | §5.7 | *SEC-C-16* | NFR-REL-01 |
| TC-DATA-08 | §5.7 | NFR-PERF-01 | NFR-PERF-01 |
| TC-DATA-09 | §5.7 | NFR-PERF-01 | NFR-PERF-01 |
| TC-DATA-10 | §5.7 | NFR-OPS-01 | NFR-OPS-05 |
| TC-REG-01 | §5.8 | NFR-OPS-01 | NFR-SEC-12, NFR-OPS-01 |
| TC-REG-02 | §5.8 | NFR-OPS-01 | NFR-SEC-12, NFR-OPS-02 |
| TC-REG-03 | §5.8 | NFR-OPS-01 | NFR-OPS-01 |
| TC-REG-04 | §5.8 | NFR-OPS-01 | NFR-OPS-01 |
| TC-REG-05 | §5.8 | NFR-OPS-04 | NFR-OPS-04 |
| TC-REG-06 | §5.8 | — | — |
| TC-REG-07 | §5.8 | NFR-OPS-04 | NFR-OPS-04 |
| TC-REG-08 | §5.8 | NFR-OPS-04 | NFR-OPS-04 |
| TC-REG-09 | §5.8 | NFR-OPS-04 | NFR-OPS-04 |
| TC-REG-10 | §5.8 | NFR-OPS-04 | NFR-OPS-04 |
| TC-REG-11 | §5.8 | *SEC-C-15* | — |
| TC-REG-12 | §5.8 | *SEC-C-24* | FR-AUTH-12 |
| TC-REG-13 | §5.8 | *SEC-C-24* | FR-AUTH-12 |
| TC-REG-14 | §5.8 | *SEC-C-20* | NFR-SEC-11 |
| TC-REG-15 | §5.8 | *SEC-C-17* | NFR-SEC-06 |
| TC-E2E-01 | §6 | — | FR-SESS-01, NFR-COMPAT-01 |
| TC-E2E-02 | §6 | — | FR-AUTH-06, NFR-COMPAT-01 |
| TC-E2E-03 | §6 | — | FR-MSG-06, FR-MSG-16, NFR-PERF-08, NFR-COMPAT-01 |
| TC-E2E-04 | §6 | — | FR-PRES-03, FR-PRES-06, NFR-COMPAT-01 |
| TC-E2E-05 | §6 | — | NFR-COMPAT-01 |
| TC-E2E-06 | §6 | — | FR-PRES-02, NFR-COMPAT-01 |
| TC-E2E-07 | §6 | — | FR-CONV-05, NFR-COMPAT-01 |
| TC-E2E-08 | §6 | — | FR-AUTH-05, NFR-COMPAT-01 |
| TC-E2E-09 | §6 | — | NFR-COMPAT-01 |
| TC-E2E-10 | §6 | — | NFR-COMPAT-01 |
| TC-NFR-01 | §7.3 | FR-PRES-07, NFR-REL-04 | FR-PRES-07, NFR-REL-04 |
| TC-NFR-02 | §7.3 | FR-PRES-08, NFR-SCALE-01 | FR-PRES-08, NFR-SCALE-01 |

---

## 6. P0 release gate

`BUILD_PLAN.md` §5.3 requires **every P0 requirement Implemented — no Defective, no Missing** before release. `SRS.md` §10.4 counts 42 P0 requirements not yet met; that figure includes Partial and Unverified. The strict blocking set is the 34 P0 requirements below that are **Missing or Defective**. Work down in wave order.

### 6.1 Blocking — P0 Missing or Defective (34)

| # | Requirement | Title | Status | Owning task | Wave | Test to prove it |
|---|---|---|---|---|---|---|
| 1 | NFR-OPS-02 | Every build-critical file tracked in git | **Defective** | S-0° | 0 | TC-REG-02 |
| 2 | FR-AUTH-06 | Single IdP origin; no path doubling | **Defective** | S-4 | 1 | TC-E2E-02, TC-AUTH-31, TC-AUTH-32 |
| 3 | FR-AUTH-07 | Identical `redirect_uri` on both legs | **Defective** | S-4 | 1 | TC-AUTH-21, TC-AUTH-33 |
| 4 | FR-AUTH-08 | OAuth `state` (single-use, 32 B) | **Missing** | S-4 | 1 | TC-AUTH-27, TC-AUTH-28, TC-AUTH-29 |
| 5 | FR-AUTH-09 | PKCE S256 | **Missing** | S-4 | 1 | TC-AUTH-30 |
| 6 | FR-CONT-05 | Search returns ≤ 20, excludes caller | **Defective** | S-10 | 1 | TC-CONT-13, TC-CONT-14, TC-CONT-15, TC-CONT-16 |
| 7 | FR-CONT-06 | Search rejects queries under 3 chars | **Missing** | S-10 | 1 | TC-AUTHZ-10 |
| 8 | FR-CONT-07 | Search never returns email | **Defective** | S-10 | 1 | TC-CONT-17, TC-AUTHZ-10 |
| 9 | FR-CONV-01 | `createDirect` idempotent | **Defective** | S-9 | 1 | TC-CONV-01, TC-CONV-02 |
| 10 | FR-CONV-08 | Reject non-existent participant ids | **Missing** | S-9 | 1 | TC-CONV-11 |
| 11 | FR-CONV-09 | Reject blocked participants on creation | **Missing** | S-9 | 1 | TC-CONV-13 |
| 12 | FR-CONV-10 | `participantIds` capped at 256 | **Missing** | S-9 | 1 | TC-CONV-12 |
| 13 | FR-MSG-04 | Full read receipts per history page | **Defective** | S-5 | 1 | TC-MSG-14, TC-MSG-16 |
| 14 | FR-MSG-05 | Read receipts authorized and de-duplicated | **Defective** | S-8 | 1 | TC-MSG-18, TC-MSG-19, TC-AUTHZ-08, TC-DATA-02, TC-MSG-14, TC-MSG-16, TC-SOCK-10 |
| 15 | FR-PRES-04 | Presence disclosed only to related members | **Defective** | S-10 | 1 | TC-SOCK-17 |
| 16 | FR-PRES-05 | Presence snapshot scoped to the recipient | **Defective** | S-10 | 1 | TC-SOCK-17 |
| 17 | FR-SESS-02 | `Secure` cookie in production | **Defective** | S-4 | 1 | TC-AUTH-17 |
| 18 | NFR-SEC-01 | OAuth resistant to CSRF / code injection | **Missing** | S-4 | 1 | TC-AUTH-27, TC-AUTH-28, TC-AUTH-29, TC-AUTH-30 |
| 19 | NFR-SEC-02 | No interpolated SQL; lint-enforced | **Defective** | S-5 | 1 | TC-MSG-14 |
| 20 | NFR-SEC-04 | Session cookie never over cleartext HTTP | **Defective** | S-17 | 1 | TC-AUTH-17 |
| 21 | NFR-SEC-05 | No enumeration; uniform authz failures | **Defective** | S-8 | 1 | TC-AUTHZ-01, TC-AUTHZ-02, TC-AUTHZ-03, TC-AUTHZ-04, TC-AUTHZ-05, TC-AUTHZ-06, TC-AUTHZ-07, TC-AUTHZ-08, TC-AUTHZ-09, TC-AUTHZ-10, TC-CONT-17, TC-SOCK-01, TC-SOCK-02 |
| 22 | NFR-SEC-08 | Secrets ≥ 32 bytes or refuse to start | **Defective** | S-17 | 1 | TC-AUTH-34 |
| 23 | NFR-SEC-10 | No over-disclosing response fields | **Defective** | S-10, S-18 | 1 | TC-AUTH-15, TC-CONT-17 |
| 24 | FR-CONV-05 | List ordered by most recent activity | **Defective** | S-11 | 2 | TC-CONV-04, TC-E2E-07, TC-CONV-05, TC-CONV-06, TC-CONV-07, TC-SOCK-06 |
| 25 | FR-MSG-08 | tRPC `send` emits the same realtime events | **Missing** | S-11 | 2 | TC-MSG-32† |
| 26 | FR-MSG-09 | Message write touches `conversations.updatedAt` | **Missing** | S-11 | 2 | TC-CONV-04, TC-MSG-23† |
| 27 | NFR-REL-01 | Foreign keys and unique constraints | **Defective** | S-3 | 2 | TC-DATA-01, TC-DATA-02, TC-DATA-03, TC-DATA-04, TC-DATA-05, TC-DATA-06, TC-DATA-07, TC-MSG-19, TC-CONT-18, TC-CONV-08, TC-MSG-10, TC-MSG-22 |
| 28 | FR-FILE-05 | Private objects; presigned participant-scoped GET | **Missing** | F-4° | 4 | TC-FILE-05† |
| 29 | FR-FILE-07 | `fileUrl` must map to an owned attachment | **Missing** | F-4° | 4 | TC-FILE-07† |
| 30 | FR-MSG-01 | Content 1–4 000 chars on every ingress path | **Defective** | S-14 | 5 | TC-MSG-06, TC-MSG-07, TC-MSG-08, TC-MSG-09, TC-SOCK-19, TC-MSG-10, TC-MSG-13, TC-SOCK-05 |
| 31 | NFR-SCALE-01 | Correct delivery on ≥ 2 API nodes | **Defective** | S-19 | 5 | TC-NFR-02 |
| 32 | NFR-SEC-03 | Zod validation on every trust boundary | **Defective** | S-14 | 5 | TC-SOCK-18, TC-SOCK-19, TC-SOCK-20, TC-SOCK-21, TC-SOCK-22, TC-AUTH-06, TC-AUTH-09, TC-AUTH-10 |
| 33 | NFR-SEC-06 | Security headers + CORS allowlist | **Missing** | S-15 | 5 | TC-REG-15 |
| 34 | NFR-SEC-07 | Token-bucket rate limiting on write surfaces | **Missing** | S-13 | 5 | TC-SOCK-23 |

### 6.2 Also counted release-blocking by `SRS.md` §10.4 — P0 Partial or Unverified (8)

| Requirement | Title | Status | Owning task | Wave | Test to prove it |
|---|---|---|---|---|---|
| FR-ADMIN-11 | Health endpoint reflects real readiness | **Partial** | S-15 | 5 | TC-REG-20† |
| FR-AUTH-12 | Secrets absent from the client bundle | **Partial** | S-17 | 1 | TC-REG-12, TC-REG-13 |
| NFR-COMPAT-04 | MySQL 8.0 / 8.4 with `utf8mb4` | **Partial** | — | — | — |
| NFR-I18N-03 | Timestamps stored and sent in UTC | **Partial** | S-20 | 5 | — |
| NFR-OPS-05 | Versioned migrations, no pending diff | **Partial** | S-3, S-0° | 0 | TC-DATA-10 |
| NFR-OPS-07 | `docker compose up` reproducible in 120 s | **Partial** | S-6 | 5 | TC-REG-18† |
| NFR-PERF-03 | Send→deliver p95 ≤ 250 ms, p99 ≤ 800 ms | **Unverified** | — | — | — |
| NFR-SEC-12 | Committed lockfile + advisory gate | **Partial** | S-0° | 0 | TC-REG-01, TC-REG-02 |

### 6.3 Gate arithmetic

| Measure | Count |
|---|---:|
| P0 requirements | 70 |
| P0 Implemented (regression set — MUST NOT regress) | 28 |
| **P0 Missing or Defective — strict blocking set** | **34** |
| P0 Partial or Unverified — also blocking per SRS §10.4 | 8 |
| P0 not yet met (SRS §10.4 total) | 42 |
| Blocking P0 with **no owning task** | 0 |
| Blocking P0 with **no existing test** | 3 |

**Blocking P0 by delivering wave:** wave 0: 1 · wave 1: 22 · wave 2: 4 · wave 4: 2 · wave 5: 5 · **unscheduled: 0**

**Every blocking P0 now has an owner.** The eleven that had none — FR-CONT-06, FR-CONV-01, FR-CONV-10, FR-MSG-08, NFR-SCALE-01, NFR-SEC-01, NFR-SEC-02, NFR-SEC-04, NFR-SEC-06, NFR-SEC-08, NFR-SEC-10 — were assigned to the task that demonstrably does the work rather than to a new catch-all: FR-CONV-01 and FR-CONV-10 to **S-9** (its steps 3 and 4 *are* the 256-cap and the `createDirect` idempotency fix), FR-CONT-06 to **S-10** (its step 1 *is* the minimum query length), FR-MSG-08 to **S-11** (it already touches both the tRPC and socket write paths), NFR-SEC-01 to **S-4** (`SEC-C-03`/`SEC-C-04` are its own scope), NFR-SEC-02 to **S-5** (it already adds the lint rule banning interpolated `sql` templates), NFR-SEC-04 and NFR-SEC-08 to the new **S-17**, NFR-SEC-06 to **S-15** (headers and the CORS allowlist mount in the same bootstrap as `/healthz`), NFR-SEC-10 to **S-10** and **S-18** (the search projection and the `auth.me` projection are its two halves), and NFR-SCALE-01 to the new **S-19**.

3 blocking P0s still have no test that exists today — FR-MSG-08, FR-FILE-05, FR-FILE-07 — and each is owed a `†` case by the task that closes it. The two P0 Partial/Unverified requirements with no owner, NFR-PERF-03, NFR-COMPAT-04, are measurement items rather than build items: NFR-PERF-03 needs an instrumented latency run and NFR-COMPAT-04 needs the integration suite executed against both MySQL versions.

---

## 7. Orphans and gaps

### 7.1 (a) Requirements with no owning task (56)

Down from 106. 28 of the 56 are **Implemented** — they need a regression guard, not a build task — so the actionable remainder is **28**. Grouped by area; recommended fix in the right-hand column.

| Area | Count | Of which Implemented | Requirements | Recommended fix |
|---|---:|---:|---|---|
| FR-AUTH | 7 | 7 | FR-AUTH-01, FR-AUTH-02, FR-AUTH-03, FR-AUTH-04, FR-AUTH-05, FR-AUTH-10, FR-AUTH-11 | All seven are **Implemented** — the OAuth and session regression set. No build task is owed; name them on S-4 as *must-not-break* if the regression intent should be explicit. |
| FR-SESS | 3 | 3 | FR-SESS-01, FR-SESS-04, FR-SESS-05 | All three are **Implemented** (cookie name and attributes, re-read identity, malformed-token handling). S-17 owns everything still outstanding in this area; these are its regression guard. |
| FR-CONV | 4 | 3 | FR-CONV-03, FR-CONV-04, FR-CONV-06, FR-CONV-15 | Three are **Implemented** regression items. FR-CONV-15 (P1 Defective — authorization failures returned as empty success payloads) is the real gap: it maps to `SEC-C-26`, whose `SECURITY.md` §13 task id does not exist in `BUILD_PLAN.md`. Fold it into S-8, which already introduces the shared authorization helper. |
| FR-MSG | 9 | 4 | FR-MSG-02, FR-MSG-06, FR-MSG-07, FR-MSG-10, FR-MSG-11, FR-MSG-15, FR-MSG-16, FR-MSG-17, FR-MSG-18 | Four are **Implemented**. The genuine orphans are FR-MSG-11 (P1 Defective — non-deterministic ordering on equal `createdAt`, fixed by the S-3 keyset index), FR-MSG-15 (P1 — cross-conversation `replyToId`, the same validation surface as S-9, verified by TC-MSG-12), FR-MSG-10/16/17 (P1–P2 — keyset pagination, optimistic reconciliation, astral-plane round-trip). Assign FR-MSG-11 and FR-MSG-15 explicitly; the rest are legitimate backlog. |
| FR-CONT | 3 | 2 | FR-CONT-01, FR-CONT-03, FR-CONT-13 | Two are **Implemented**. FR-CONT-13 (P1 Defective — the requester sees their own outbound request in their inbound pending list, `api/contact-router.ts:55`) is a small bug with a test already written (TC-CONT-03) and no owner. It needs a card or a line on S-10. |
| FR-PRES | 6 | 3 | FR-PRES-01, FR-PRES-02, FR-PRES-03, FR-PRES-06, FR-PRES-07, FR-PRES-09 | Three are **Implemented**. FR-PRES-06 (typing-indicator expiry), FR-PRES-07 (bounded presence map) and FR-PRES-09 (`lastSeenAt`) are unowned; FR-PRES-06 and FR-PRES-09 are small enough to fold into S-10, FR-PRES-07 is proved by the TC-NFR-01 soak rather than built. |
| FR-FILE | 1 | 0 | FR-FILE-10 | F-4 covers FR-FILE-01…09 by scope. FR-FILE-10 (malware scanning, P2) is unowned — either schedule it under F-4 or withdraw it to `BACKLOG.md` with a recorded rationale. |
| FR-NOTIF | 1 | 0 | FR-NOTIF-07 | F-6 covers 01…06 and 09; F-1 covers 08. FR-NOTIF-07 (tab-title unread count) is unowned — add it to F-1, which already computes the count. |
| NFR-PERF | 6 | 0 | NFR-PERF-02, NFR-PERF-03, NFR-PERF-04, NFR-PERF-05, NFR-PERF-07, NFR-PERF-08 | Only NFR-PERF-01 and NFR-PERF-06 have owners. The remaining six are **budgets**, not features: they close by instrumenting the §8.3 reference deployment and recording a number, not by a code change. They need one measurement task (k6 + Lighthouse + React Profiler in CI) that no wave currently contains. |
| NFR-REL | 6 | 2 | NFR-REL-02, NFR-REL-03, NFR-REL-04, NFR-REL-05, NFR-REL-06, NFR-REL-07 | S-3 owns NFR-REL-01 and S-19 the pool/TLS half of NFR-SEC-09. NFR-REL-02 (reconnect), 03 (error boundaries), 05 (availability) and 06 (RTO/RPO) are unowned: 02/03 belong with S-15's observability work, 06 needs a backup-and-restore task that does not exist. NFR-REL-04 and 07 are Implemented. |
| NFR-SCALE | 3 | 1 | NFR-SCALE-02, NFR-SCALE-03, NFR-SCALE-05 | S-19 owns NFR-SCALE-01 and 04. NFR-SCALE-02 and 03 are load budgets — the same measurement gap as NFR-PERF, and they are also S-19's trigger metric ([ADR-006](ADR.md)). NFR-SCALE-05 is Implemented. |
| NFR-OPS | 2 | 0 | NFR-OPS-06, NFR-OPS-08 | NFR-OPS-06 (configurable retention) is unowned and belongs with S-15's logging retention work. NFR-OPS-08 (documentation must not overclaim) sits with H-1…H-5 but is not stated there. |
| NFR-COMPAT | 5 | 3 | NFR-COMPAT-01, NFR-COMPAT-02, NFR-COMPAT-03, NFR-COMPAT-04, NFR-COMPAT-05 | Compatibility is **verified by the E2E matrix, not built by a task**. Bind NFR-COMPAT-01…05 to the `TEST_PLAN.md` §6 Playwright matrix and treat CI as the owner. The exception is NFR-COMPAT-04 (`utf8mb4` on MySQL 8.0 and 8.4) — a real code and migration change that belongs to S-3, and a P0 Partial that is release-blocking. |

### 7.2 (b) Requirements with no existing test (82)

Two causes now, not three — the collision class is empty.

| Cause | Count | Requirements | Recommended fix |
|---|---:|---|---|
| **Test id allocated but never written** (`†`) | 55 | see the `†` entries in §3 | Write the case in `TEST_PLAN.md` §5 as part of the task that closes the requirement (`BUILD_PLAN.md` rule **G-3**: every behavioural change ships with a test that fails before and passes after). 60 distinct ids are outstanding; §5.1 gives the allocation range per group. |
| **Cited id collides with an existing case** (`‡`) | 0 | — | **Closed.** All 33 reissued ids were re-pointed at the case that actually proves the requirement or renumbered above their group maximum. See §7.4. |
| **No `TC-*` cited at all** — verification is a measurement method | 27 | NFR-A11Y-01, NFR-A11Y-02, NFR-A11Y-03, NFR-A11Y-04, NFR-A11Y-05, NFR-A11Y-06, NFR-COMPAT-02, NFR-COMPAT-03, NFR-COMPAT-04, NFR-COMPAT-05, NFR-I18N-01, NFR-I18N-02, NFR-I18N-03, NFR-I18N-04, NFR-OPS-06, NFR-OPS-08, NFR-PERF-03, NFR-PERF-04, NFR-PERF-05, NFR-PERF-06, NFR-PERF-07, NFR-REL-02, NFR-REL-05, NFR-REL-06, NFR-SCALE-02, NFR-SCALE-03, NFR-SCALE-04 | These are NFR budgets whose Verification column names an instrument (axe-core, Lighthouse, k6, `EXPLAIN`, a chaos test, a screen reader) rather than a case. Allocate a `TC-NFR-*` id per budget so the matrix can close; `TEST_PLAN.md` §7 already models this for TC-NFR-01/02, and the next free id is TC-NFR-03. |

### 7.3 (c) Tasks that close no stated requirement

| Task | Wave | Situation | Recommended fix |
|---|---|---|---|
| **S-7** · Integration and socket test harness | 3 | Closes no requirement, stated or inferable. It is a pure enabler: without it none of the `†` cases can be written. | Legitimate as an enabler — record it as such rather than leaving it blank. Its acceptance criteria (≥ 25 meaningful assertions, unauthenticated handshake rejected, non-participant `joinConversation` no-op, broadcast reaches a second client, presence offline only after the last socket) are the harness for FR-CONV-02, FR-MSG-06, FR-PRES-01/02. Name those as *enabled-by*, not *satisfied-by*. |
| **S-12** · CI: integration services and required checks | 3 | Closes no requirement. | Bind to NFR-OPS-01 as the enforcing mechanism (`npm ci && npm run validate` green is NFR-OPS-01's own acceptance) and to NFR-SEC-12's `npm audit` gate. |

Additionally, **10 of 28 tasks** close requirements only by inference — `S-0`, `S-2`, `S-7`, `S-12`, `F-1`, `F-2`, `F-3`, `F-4`, `F-5`, `F-6`. They are not orphans, but under **M-3** each must gain an explicit `**Satisfies:**` line before its wave starts, or the linkage will be lost at the first edit. The count was 14 of 23; the six new cards (S-17, S-18, S-19, S-20, F-7, F-8) and the rewritten Wave 5 ownership table all state their ids.

### 7.4 (d) Id collisions — `TEST_PLAN.md` numbers reissued by `SRS.md` — **RESOLVED**

`SRS.md` §1.4 used to claim that its `†` ids "continue that document's existing numbering", then allocate **33 ids at or below** the stated maxima — so each of them named a real, unrelated case. 33 requirements were affected. Every one is now re-pointed at the case that actually proves it, or renumbered strictly above its group maximum.

**Where each collision went.** Every "now cites" entry was checked against both documents; an id without `†` exists in `TEST_PLAN.md` today.

| Requirement | Cited before | What that id is in `TEST_PLAN.md` | Now cites |
|---|---|---|---|
| FR-AUTH-06 | TC-AUTH-27 † | callback with `state` absent (SEC-C-03) | **TC-AUTH-31, TC-AUTH-32** — `kimiEndpoint` path-doubling and the origin-only assertion |
| FR-AUTH-07 | TC-AUTH-28 † | `state=attacker` vs cookie `state=victim` (SEC-C-03) | **TC-AUTH-33** — byte-identical `redirect_uri` on both legs |
| FR-AUTH-08 | TC-AUTH-29 †, TC-AUTH-30 † | replayed `state` (SEC-C-03); PKCE S256 (SEC-C-04) | **TC-AUTH-27, TC-AUTH-28, TC-AUTH-29** — absent, mismatched and replayed `state` |
| FR-AUTH-09 | TC-AUTH-31 † | `kimiEndpoint(…)` returns un-doubled URLs (SEC-C-01) | **TC-AUTH-30** — `code_challenge_method=S256` |
| FR-AUTH-12 | TC-REG-11 †, TC-AUTH-32 † | interpolated-`sql` grep (SEC-C-15); origin-only assertion (SEC-C-01) | **TC-REG-12, TC-REG-13** — bundle grep for secrets and the `VITE_` prefix guard |
| FR-SESS-02 | TC-AUTH-17 † | `Secure` + `SameSite=Lax` in production (SEC-C-07) | **TC-AUTH-17** — the id was correct; only the `†` marker was wrong |
| FR-SESS-03 | TC-AUTH-18 † | logout → reuse cookie → `UNAUTHORIZED` (SEC-C-05) | **TC-AUTH-36 †** — genuinely new: nothing asserts the `__Host-` name prefix |
| FR-SESS-06 | TC-AUTH-33 † | `redirect_uri` derivation (SEC-C-02) | **TC-AUTH-18** — the revocation case |
| FR-SESS-07 | TC-AUTH-34 † | `envSchema.parse({SESSION_SECRET:"a"})` throws (SEC-C-24; `JWT_SECRET` until H-7) | **TC-AUTH-37 †** — genuinely new: nothing asserts idle expiry |
| FR-SESS-09 | TC-SOCK-25 † | *free, but the case it described already existed* | **TC-SOCK-24** — socket session re-validation (SEC-C-29) |
| FR-SESS-10 | TC-REG-14 † | 2 MB body → 413 (SEC-C-20) | **TC-REG-19 †** — genuinely new |
| FR-CONV-08 | TC-CONV-11 † | `createGroup` with a non-existent participant id (SEC-C-11) | **TC-CONV-11** — the id was correct; only the `†` marker was wrong |
| FR-CONV-09 | TC-CONV-12 † | 257 participant ids → cap 256 (SEC-C-11) | **TC-CONV-13** — blocked pair → `FORBIDDEN` |
| FR-CONV-10 | TC-CONV-13 † | blocked pair → `FORBIDDEN` (SEC-C-11) | **TC-CONV-12** — the 256-participant cap |
| FR-CONV-15 | TC-AUTHZ-06 †, TC-AUTHZ-08 † | `TRPCError.code === "FORBIDDEN"`; `markAsRead` row not created | **TC-AUTHZ-06, TC-AUTHZ-08** — same ids, markers dropped: both already exist |
| FR-MSG-01 | TC-SOCK-18 † | socket `sendMessage` with `conversationId:"abc"` (SEC-C-13) | **TC-SOCK-19** — 100 000-character content rejected on the socket path |
| FR-MSG-05 | TC-MSG-17 †, TC-AUTHZ-02 | mutant-build `IN ()` guard (SEC-C-15); the intentionally public `ping` | **TC-MSG-18, TC-AUTHZ-08** — empty `messageIds` no-op and the ownership check |
| FR-MSG-08 | TC-MSG-20 † | 200-id `markAsRead` (SEC-C-13) | **TC-MSG-32 †** — genuinely new: nothing tests tRPC/socket event parity |
| FR-CONT-06 | TC-CONT-17 † | wildcard escaped, no `email` (SEC-C-12) | **TC-AUTHZ-10** — `BAD_REQUEST` for `query.length < 3` |
| FR-CONT-07 | TC-CONT-12 † | blocked pair → `FORBIDDEN` (SEC-C-11) | **TC-CONT-17** — result does not include the `email` field |
| FR-CONT-09 | TC-CONT-21 † | *free, but the case it described already existed* | **TC-CONT-12** — a blocked member can neither add nor send |
| FR-PRES-04 | TC-SOCK-13 †, TC-SOCK-14 † | 3 sockets → one `userOnline`; disconnect 1 of 3 | **TC-SOCK-17** — unrelated users receive no presence event |
| FR-PRES-05 | TC-SOCK-15 † | `userOffline` on the last disconnect | **TC-SOCK-17** — the same case asserts the connect snapshot |
| FR-ADMIN-11 | TC-REG-12 † | bundle grep for secrets (SEC-C-24) | **TC-REG-20 †** — genuinely new |
| NFR-SEC-01 | TC-AUTH-29…31 † | `state` replay, PKCE, `kimiEndpoint` | **TC-AUTH-27…30** — the four `state`/PKCE cases |
| NFR-SEC-03 | TC-SOCK-18…22 † | the five socket-payload validation cases (SEC-C-13) | **TC-SOCK-18…22** — same ids, markers dropped: all five already exist |
| NFR-SEC-04 | TC-AUTH-17 † | `Secure` + `SameSite=Lax` in production | **TC-AUTH-17** — marker dropped |
| NFR-SEC-05 | TC-CONT-12 † | blocked pair → `FORBIDDEN` | **TC-CONT-17** — no `email` in search results |
| NFR-SEC-06 | TC-REG-13 † | `VITE_` prefix guard (SEC-C-24) | **TC-REG-15** — CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` |
| NFR-SEC-07 | TC-SOCK-23/24 † | rate limiting; socket session re-validation | **TC-SOCK-23** — 100 sends in 1 s, `rateLimited` |
| NFR-SEC-08 | TC-AUTH-32 † | origin-only assertion (SEC-C-01) | **TC-AUTH-34** — `SESSION_SECRET: "a"` throws (min 32; `JWT_SECRET` until H-7) |
| NFR-SEC-10 | TC-CONT-12 † | blocked pair → `FORBIDDEN` | **TC-CONT-17** — no `email` in search results |
| NFR-SEC-11 | TC-REG-16 † | *free, but the case it described already existed* | **TC-REG-14** — 2 MB body → 413 after SEC-C-20 |

**Group arithmetic after the fix.** `TEST_PLAN.md` maximum → first id `SRS.md` allocates above it → next free id:

| Group | `TEST_PLAN.md` max | `†` ids `SRS.md` now allocates | Next free |
|---|---|---|---|
| TC-AUTH | TC-AUTH-34 | TC-AUTH-35, TC-AUTH-36, TC-AUTH-37 | TC-AUTH-38 |
| TC-AUTHZ | TC-AUTHZ-10 | *none* | TC-AUTHZ-11 |
| TC-CONT | TC-CONT-18 | TC-CONT-19, TC-CONT-20, TC-CONT-22, TC-CONT-23, TC-CONT-24, TC-CONT-25 | TC-CONT-26 |
| TC-CONV | TC-CONV-13 | TC-CONV-14, TC-CONV-15, TC-CONV-16, TC-CONV-17, TC-CONV-18 | TC-CONV-19 |
| TC-DATA | TC-DATA-10 | TC-DATA-11 | TC-DATA-12 |
| TC-E2E | TC-E2E-10 | *none* | TC-E2E-11 |
| TC-MSG | TC-MSG-22 | TC-MSG-23, TC-MSG-24, TC-MSG-25, TC-MSG-26, TC-MSG-27, TC-MSG-28, TC-MSG-29, TC-MSG-30, TC-MSG-31, TC-MSG-32 | TC-MSG-33 |
| TC-NFR | TC-NFR-02 | *none* | TC-NFR-03 |
| TC-REG | TC-REG-15 | TC-REG-17, TC-REG-18, TC-REG-19, TC-REG-20 | TC-REG-21 |
| TC-SOCK | TC-SOCK-24 | TC-SOCK-26, TC-SOCK-27 | TC-SOCK-28 |

Two numbers — **TC-REG-16** and **TC-CONT-21** — were vacated when their rows were re-pointed at existing cases and are deliberately left unused, per **M-5** (ids are never reused).

**Verification.** A `†` id that duplicates a `TEST_PLAN.md` id is now a mechanical error, not a judgement call:

```bash
python3 - <<'EOF'
import re
tp=set(re.findall(r'\bTC-[A-Z0-9]+-\d+\b', open('docs/TEST_PLAN.md').read()))
bad=[]
for line in open('docs/SRS.md'):
    for m in re.finditer(r'TC-([A-Z0-9]+)-(\d+)(?:…(?:TC-\1-)?(\d+))?\s*†', line):
        a=int(m.group(2)); b=int(m.group(3) or a)
        bad += [f'TC-{m.group(1)}-{n}' for n in range(a,b+1) if f'TC-{m.group(1)}-{n}' in tp]
print('collisions:', bad)          # must print []
EOF
```

Run it in any PR that touches `SRS.md` §4–§5 or `TEST_PLAN.md` §5.

### 7.5 (e) Task-id namespace conflict

`SECURITY.md` §13 and `TEST_PLAN.md` §9 both allocate `S-*`/`F-*` ids, both flag them `†`/UNVERIFIED, and both disagree with `BUILD_PLAN.md`:

| Id | `BUILD_PLAN.md` | `SECURITY.md` §13 uses it for | `TEST_PLAN.md` §9 uses it for |
|---|---|---|---|
| S-1 | *does not exist* | SEC-C-27 lockfile provenance | Toolchain / CI repair |
| S-5 | Fix read receipts (`IN (?)`) | SEC-C-09/10/13 socket Zod + authz | Socket payload validation + central authz |
| S-6 | Docker stack | SEC-C-15 `inArray` + SQL lint | Raw-SQL removal + error hygiene |
| S-7 | Integration & socket test harness | SEC-C-05/06/08/17/18/20/24/30 session & header hardening | Session, cookie and header hardening |
| F-1 | Unread message badges | SEC-C-25/28 logging + DB hardening | Observability + DB hardening |
| F-4 | File & image attachments | SEC-C-14/19/29 rate limiting | Rate limiting & abuse controls |
| F-6 | Web push notifications | SEC-C-23 attachment pipeline | Attachments |

`SRS.md` §1.6 records the same problem for `F-4`/`F-6` between `ROADMAP.md` and `TEST_PLAN.md`. **`BUILD_PLAN.md` is treated as authoritative for task ids throughout this matrix.** The two companions must be re-mapped onto it; until then, no `SEC-C-*` task column may be transcribed into the Owning-task column of §3. That is why 56 requirements still show `—` there, some of them despite having a named security control — although the six new cards (S-17…S-20, F-7, F-8) absorbed most of the affected `SEC-C-*` scope, so the figure is down from 106.

---

## 8. Constraint traceability

`DATA_MODEL.md` §3–§4 specifies **10 foreign keys, 3 unique constraints and 6 indexes**. The baseline migration `db/migrations/0000_lumpy_marten_broadcloak.sql` currently declares **zero foreign keys, zero indexes and one unique key** (`users.unionId`, `:66`). Every row below is delivered by a single task, **S-3**, and every row below is therefore blocked behind it.

| Constraint | Definition | `ON DELETE` | Requirements it is needed by | Task | Test | Why it matters |
|---|---|---|---|---|---|---|
| **FK-1** | `conversation_participants.conversationId` → `conversations.id` | CASCADE | NFR-REL-01, FR-ADMIN-10 | S-3 | TC-DATA-04 | Membership is the ACL; a dangling row grants permission to a non-existent conversation |
| **FK-2** | `conversation_participants.userId` → `users.id` | CASCADE | NFR-REL-01, FR-CONV-08, FR-ADMIN-09 | S-3 | TC-DATA-07 | Blocks the FR-CONV-08 defect at the database, not only in the router |
| **FK-3** | `messages.conversationId` → `conversations.id` | CASCADE | NFR-REL-01, FR-ADMIN-10 | S-3 | TC-DATA-04, TC-DATA-06 | Orphan messages survive as undeletable PII |
| **FK-4** | `messages.senderId` → `users.id` | RESTRICT | NFR-REL-01, FR-ADMIN-09 | S-3 | TC-DATA-07 | Deliberately not CASCADE — forces the anonymise-or-purge decision of DATA_MODEL §7.3 into code |
| **FK-5** | `messages.replyToId` → `messages.id` (self) | SET NULL | NFR-REL-01, FR-MSG-15, FR-MSG-13 | S-3 | TC-DATA-05 | A deleted parent must degrade the reply, never cascade-delete another author's message |
| **FK-6** | `message_reads.messageId` → `messages.id` | CASCADE | NFR-REL-01, FR-ADMIN-10 | S-3 | TC-DATA-04 | A receipt for a deleted message is meaningless |
| **FK-7** | `message_reads.userId` → `users.id` | CASCADE | NFR-REL-01, FR-ADMIN-09 | S-3 | TC-DATA-07 | Erase receipts with the account |
| **FK-8** | `contacts.userId` → `users.id` | CASCADE | NFR-REL-01, FR-ADMIN-09 | S-3 | TC-DATA-07 | Edge owned by the user |
| **FK-9** | `contacts.contactUserId` → `users.id` | CASCADE | NFR-REL-01, FR-CONT-12, FR-ADMIN-09 | S-3 | TC-DATA-07 | Symmetric to FK-8; also stops `contact.add` against a non-existent id |
| **FK-10** | `conversations.createdBy` → `users.id` | RESTRICT | NFR-REL-01, FR-CONV-14, FR-ADMIN-09 | S-3 | TC-DATA-07 | Forces an explicit ownership transfer before account deletion |
| **UQ-1** | `conversation_participants` (`conversationId`, `userId`) | — | NFR-REL-01, FR-CONV-11, FR-CONV-01 | S-3 | TC-DATA-01 | Duplicate membership inflates participant lists and duplicates `conversationUpdated` fan-out |
| **UQ-2** | `message_reads` (`messageId`, `userId`) | — | NFR-REL-01, FR-MSG-05 | S-3 | TC-DATA-02 | Without it the `try/catch` at `api/message-router.ts:150` is dead code — FR-MSG-05 cannot be satisfied |
| **UQ-3** | `contacts` (`userId`, `contactUserId`) | — | NFR-REL-01, FR-CONT-02 | S-3 | TC-DATA-03, TC-CONT-18 | Makes `onDuplicateKeyUpdate` functional and closes the `contact.add` TOCTOU race |
| **IX-1** | `messages` (`conversationId`, `createdAt`) | — | NFR-PERF-01, FR-MSG-02 | S-3 | TC-DATA-08 | History pagination and the last-message scan are full table scans + filesort today |
| **IX-2** | `conversation_participants` (`userId`) | — | NFR-PERF-01, FR-CONV-02, FR-PRES-03 | S-3 | TC-DATA-09 | Membership is re-checked on every `typing` event — a full scan per keystroke |
| **IX-3** | `contacts` (`contactUserId`, `status`) | — | NFR-PERF-01, FR-CONT-13 | S-3 | **—** | No test asserts this index — add an `EXPLAIN` case for `contact.pending` |
| **IX-4** | `contacts` (`userId`, `status`) | — | NFR-PERF-01, FR-CONT-01 | S-3 | **—** | No test asserts this index — add an `EXPLAIN` case for `contact.list` |
| **IX-5** | `message_reads` (`messageId`) | — | NFR-PERF-01 | S-3 | **—** | **Redundant** — UQ-2's leftmost prefix already serves it; DATA_MODEL directs that it be omitted |
| **IX-6** | `messages` (`senderId`) | — | NFR-REL-01, FR-ADMIN-08 | S-3 | **—** | Required by FK-4 and by the "messages by author" export; no test asserts it |

**Reading.** Four requirements cannot be satisfied in application code at all until S-3 lands: **FR-MSG-05** (duplicate suppression needs UQ-2 — there is nothing for `onDuplicateKeyUpdate` to collide with today), **FR-CONT-02** (duplicate-request rejection needs UQ-3), **FR-CONV-11** (two-participant invariant needs UQ-1), and **FR-ADMIN-10** (cascade delete needs FK-1/3/6, without which the same `DELETE` leaves three tables of orphans). **NFR-PERF-01** is unreachable without IX-1 and IX-2. S-3 is consequently the highest-leverage task in the plan after Wave 1: it is the sole owner of 19 constraints and a hard dependency of F-1…F-6.

**Gap.** IX-3, IX-4 and IX-6 have no verifying test; TC-DATA-08 and TC-DATA-09 assert only IX-1 and IX-2. Add `EXPLAIN` cases for `contact.pending`, `contact.list` and the author export, or the three indexes can be dropped in a later migration without any signal. IX-5 must be **omitted**, not implemented — implementing it would duplicate UQ-2's leftmost prefix.
