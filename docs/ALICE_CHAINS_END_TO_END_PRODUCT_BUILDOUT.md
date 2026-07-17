# Alice Chains — End-to-End Product Buildout

**Status:** Proposed canonical execution plan  
**Source basis:** Current `redinc23/alice_chains` repository, Alice Chains/Cosmic Chat product documents, and the uploaded encrypted collaboration architecture blueprint.  
**Purpose:** Convert the current prototype and broad vision into a sequenced, testable, assignable product program with epics, tasks, subtasks, release gates, and checklists.

---

## 1. Product Definition

### 1.1 Product promise

Alice Chains is a private, user-owned collaboration messenger where people and explicitly admitted AI participants can communicate, organize knowledge, and act together without surrendering control of their conversations or shared memory.

### 1.2 First market

The first release is for small trusted groups—founder teams, creative teams, research groups, families, and private communities—that need excellent messaging plus governed AI assistance.

### 1.3 Product principles

- Private means endpoint-readable only.
- AI is a visible participant, never an invisible backend observer.
- Security mode changes are explicit and irreversible in place.
- Every important user action is represented as an append-only event.
- Multi-device support is designed from the start.
- The MVP proves trust, reliability, and usefulness before enterprise breadth.
- No custom cryptography; use reviewed standards and implementations.

### 1.4 Conversation modes

| Mode | Intended use | Plaintext readers |
|---|---|---|
| PRIVATE | DMs and confidential groups | Authorized participant devices |
| AI_PRIVATE | Private group with a declared AI endpoint | Human devices and the visible AI participant |
| MANAGED | Organization-controlled collaboration | Participants and authorized tenant services |
| PUBLIC | Discoverable communities | Platform moderation and delivery services |

MVP ships PRIVATE and AI_PRIVATE. MANAGED and PUBLIC remain behind later release gates.

### 1.5 MVP outcome

A user can create an account, link multiple devices, start a private DM or group, exchange encrypted messages and attachments, restore permitted history on a newly authorized device, search locally, inspect and revoke devices, and optionally add a clearly identified Alice AI participant with defined access and retention.

---

## 2. Scope Boundaries

### 2.1 MVP must include

- Account creation and passkey-first login.
- Independent device identity, linking, verification, and revocation.
- Private DMs and private groups.
- Text, replies, edits, deletion events, reactions, mentions, read state, and typing state.
- Durable offline delivery, retries, deterministic deduplication, and resumable sync.
- Encrypted attachments with resumable upload/download.
- Encrypted recoverable history with explicit limitations.
- Local full-text search.
- Visible AI participant with explicit scope and retention disclosure.
- Web and desktop clients; one mobile platform in private beta, both mobile platforms before public beta.
- Blocking, reporting, invitation controls, and rate limiting.
- Security dashboard, device list, privacy labels, export, and account deletion.
- CI, automated tests, telemetry redaction, runbooks, and incident response.

### 2.2 Explicitly excluded from MVP

- PSTN calling.
- Large public communities.
- Enterprise legal hold, DLP, SCIM, and eDiscovery.
- Hidden or server-side AI over private content.
- Invisible bots.
- Federation.
- Custom cryptographic primitives.
- A claim that archived history remains forward-secret after archive-key compromise.

---

## 3. Canonical Architecture Direction

The current Hono/tRPC/Drizzle/MySQL/Socket.IO application is treated as a **product prototype**, not the final security architecture.

### 3.1 Target system boundaries

1. **Client trust boundary**
   - Shared Rust protocol core.
   - Device identity and key vault.
   - MLS state.
   - Event codec and deterministic reducer.
   - Encrypted local database.
   - Local search.
   - Attachment encryption.
   - Archive reconstruction.
   - AI participant policy UI.

2. **Control plane**
   - Authentication.
   - Accounts and devices.
   - Conversation metadata.
   - Membership and roles.
   - KeyPackage coordination.
   - AI/bot registry.
   - Policy and audit events.

3. **Delivery plane**
   - Authenticated realtime gateway.
   - Idempotent message ingress.
   - Ordered event backbone.
   - Durable opaque message store.
   - Fanout and device inboxes.
   - Push notifications with no private plaintext.
   - Sync cursors and acknowledgements.

4. **Storage plane**
   - PostgreSQL for transactional control state.
   - Durable event/message storage selected after benchmark.
   - Object storage for encrypted attachments and archive payloads.
   - Ephemeral connection state in a recoverable cache only.

5. **AI participant plane**
   - Alice is admitted as a visible cryptographic participant.
   - Access begins only after admission unless selected history is explicitly shared.
   - Provider, retention, capabilities, and export behavior are disclosed.
   - AI output is attributable, reviewable, and removable.

### 3.2 Mandatory ADRs

- ADR-001 Product thesis and first user.
- ADR-002 Conversation security modes.
- ADR-003 MLS for private DMs and groups.
- ADR-004 Device-level membership and revocation.
- ADR-005 Append-only event model.
- ADR-006 Encrypted recoverable history and its limits.
- ADR-007 Local search for private content.
- ADR-008 Visible AI participant model.
- ADR-009 Control/delivery/storage separation.
- ADR-010 Message ordering, retries, and idempotency.
- ADR-011 Attachment encryption and malware limitations.
- ADR-012 Web-client assurance limitations.

---

## 4. Delivery Program

## Phase 0 — Convergence and Repair

**Goal:** Produce one authoritative product, architecture, and delivery baseline.

### Epic 0.1 — Canonical product definition

- [ ] Approve one-sentence product promise.
  - [ ] Identify primary launch persona.
  - [ ] Define top three pains.
  - [ ] Define the single signature differentiator.
  - [ ] Define non-goals.
- [ ] Approve MVP scope.
  - [ ] Separate P0, P1, and post-MVP features.
  - [ ] Remove PSTN, public communities, and enterprise compliance from MVP.
  - [ ] Document mode-specific privacy guarantees.
- [ ] Establish product metrics.
  - [ ] Activation: first private conversation within 10 minutes.
  - [ ] Reliability: successful send rate above 99.9%.
  - [ ] Retention: target cohort and measurement window.
  - [ ] Trust: security-mode comprehension score.

**Exit gate:** Product thesis, target user, MVP, non-goals, and success measures are signed off.

### Epic 0.2 — Repository stabilization

- [ ] Replace unsigned base64 sessions with validated signed sessions.
- [ ] Authenticate the Socket.IO handshake.
- [ ] Remove client-controlled identity from `join` events.
- [ ] Enforce membership before room joins and message delivery.
- [ ] Support multiple sockets per user/device.
- [ ] Align development ports and startup behavior.
- [ ] Add missing runtime dependencies.
- [ ] Add a valid LICENSE file or correct README licensing claims.
- [ ] Replace the release-time npm publish workflow with application CI.
- [ ] Add `test`, `lint`, `typecheck`, and `build` gates.
- [ ] Add database constraints, indexes, and migrations.

**Exit gate:** Current prototype builds cleanly, runs locally, passes baseline CI, and has no known trivial impersonation path.

### Epic 0.3 — Program controls

- [ ] Create issue labels: `epic`, `security`, `protocol`, `backend`, `client`, `infra`, `product`, `legal`, `P0`, `P1`, `blocked`.
- [ ] Create milestone sequence matching this document.
- [ ] Create CODEOWNERS.
- [ ] Create PR template with security and privacy checklist.
- [ ] Create issue templates for feature, bug, threat, and ADR.
- [ ] Establish definition of ready and definition of done.
- [ ] Establish weekly architecture review and fortnightly product review.

---

## Phase 1 — Protocol and Security Foundation

### Epic 1.1 — Threat model

- [ ] Define assets: identity keys, device keys, message plaintext, archive keys, metadata, attachments, AI context.
- [ ] Define actors: user, malicious participant, compromised device, server operator, attacker, AI provider.
- [ ] Define trust boundaries and data-flow diagrams.
- [ ] Document protected and unprotected threats.
- [ ] Add abuse cases for account takeover, device addition, replay, room injection, archive theft, and AI exfiltration.
- [ ] Review with an external cryptography/security specialist.

### Epic 1.2 — Shared protocol core

- [ ] Create Rust workspace.
  - [ ] `identity` module.
  - [ ] `device_vault` module.
  - [ ] `mls_engine` module.
  - [ ] `event_codec` module.
  - [ ] `attachment_crypto` module.
  - [ ] `archive_crypto` module.
  - [ ] `sync_reducer` module.
  - [ ] `test_vectors` module.
- [ ] Define canonical protobuf schemas.
- [ ] Enforce deterministic serialization.
- [ ] Add protocol version negotiation.
- [ ] Generate known-answer test vectors.
- [ ] Add parser fuzzing.
- [ ] Produce bindings for TypeScript/WASM and desktop; add Swift/Kotlin bindings before mobile beta.

### Epic 1.3 — MLS integration

- [ ] Select reviewed MLS implementation and pinned version.
- [ ] Implement group creation.
- [ ] Implement add/remove/update proposals and commits.
- [ ] Implement device-level leaves.
- [ ] Implement KeyPackage upload, claim, expiry, and replay prevention.
- [ ] Implement external join for newly linked devices.
- [ ] Implement epoch reconciliation.
- [ ] Implement removal behavior and old-epoch rejection.
- [ ] Add cross-platform conformance tests.

**Exit gate:** Two independent clients create a group, exchange encrypted events, add and remove devices, and pass shared test vectors.

---

## Phase 2 — Identity, Accounts, and Devices

### Epic 2.1 — Account authentication

- [ ] Implement passkey-first account creation.
- [ ] Add verified email recovery channel without making email the encryption root.
- [ ] Add session issuance, rotation, expiry, and revocation.
- [ ] Add proof-of-possession for sensitive device requests.
- [ ] Add account lock and suspicious-login flow.

### Epic 2.2 — Device lifecycle

- [ ] Create pending device registration.
- [ ] Generate device signing and API keys locally.
- [ ] Implement QR/device-code linking.
- [ ] Display new-device name, platform, location approximation, and verification phrase.
- [ ] Require user presence on trusted device.
- [ ] Issue signed device certificate.
- [ ] Add active-device inventory.
- [ ] Add immediate server revocation.
- [ ] Trigger cryptographic removal from affected groups.
- [ ] Notify contacts of security-relevant device changes.

### Epic 2.3 — Account recovery

- [ ] Choose recovery model: trusted device, recovery phrase, or both.
- [ ] Encrypt account vault with a random vault key.
- [ ] Benchmark Argon2id wrapper parameters per platform.
- [ ] Implement recovery-key rotation.
- [ ] Add recovery-risk disclosure.
- [ ] Add recovery simulation tests.

**Exit gate:** A user links two devices, verifies them, revokes one, and proves the revoked device cannot receive new content.

---

## Phase 3 — Conversation and Membership Core

### Epic 3.1 — Conversation model

- [ ] Implement immutable conversation mode.
- [ ] Implement DM and group kinds.
- [ ] Store private titles and thread names as encrypted metadata.
- [ ] Implement roles: owner, admin, member, guest, AI participant.
- [ ] Implement conversation creation idempotency.
- [ ] Implement invite, accept, decline, leave, and remove.

### Epic 3.2 — ACL/MLS consistency

- [ ] Create pending membership mutation record.
- [ ] Validate expected ACL version and MLS epoch.
- [ ] Process commit and signed membership delta atomically.
- [ ] Reject mismatched ACL and cryptographic membership.
- [ ] Handle competing commits with rebase flow.
- [ ] Add invariant checker and repair tooling.

### Epic 3.3 — Event protocol

- [ ] Define events for text, reply, edit, delete, reaction, thread, receipt, typing, membership, and AI actions.
- [ ] Add event IDs and idempotency keys.
- [ ] Add sender device counters and previous-event hashes.
- [ ] Define maximum sizes, Unicode normalization, compression, and padding policy.
- [ ] Implement deterministic reducer.
- [ ] Preserve unknown future event types without applying them.

**Exit gate:** All clients produce identical materialized state from the same event log under duplicates, gaps, and reordered delivery.

---

## Phase 4 — Durable Delivery and Sync

### Epic 4.1 — Authenticated realtime gateway

- [ ] Authenticate every connection as a device.
- [ ] Maintain connection ownership outside process memory.
- [ ] Support multiple app instances per device/account.
- [ ] Add resumable cursors.
- [ ] Add heartbeat, reconnect, and backoff.
- [ ] Close revoked-device connections within SLO.
- [ ] Rate-limit connections and frames.

### Epic 4.2 — Message ingress

- [ ] Validate access token and device proof.
- [ ] Verify device request signature.
- [ ] Authorize active conversation membership.
- [ ] Validate mode, envelope size, protocol version, and epoch window.
- [ ] Reserve idempotency key.
- [ ] Persist to durable ordered backbone.
- [ ] Return stable message ID and stream sequence.

### Epic 4.3 — Persistence and fanout

- [ ] Persist opaque envelopes durably.
- [ ] Create per-device inbox references.
- [ ] Deliver to online devices.
- [ ] Send generic push for offline devices.
- [ ] Implement acknowledgements and compaction.
- [ ] Implement retention/expiry without inspecting private content.
- [ ] Add backpressure priorities: membership, messages, call signaling, receipts, presence, typing.

### Epic 4.4 — Failure testing

- [ ] Duplicate API submission.
- [ ] Consumer restart.
- [ ] Storage outage.
- [ ] Event-backbone outage.
- [ ] Gateway disconnect and reconnect.
- [ ] Message expiry during outage.
- [ ] Membership removal while message is queued.
- [ ] Region or availability-zone loss.

**Exit gate:** At-least-once delivery works with deterministic deduplication, and acknowledged messages survive tested failures.

---

## Phase 5 — Private Messaging UX

### Epic 5.1 — Core conversation experience

- [ ] Conversation list with unread state.
- [ ] Message composer and optimistic send.
- [ ] Delivery, sent, failed, and retry states.
- [ ] Reply/thread UI.
- [ ] Edit and deletion UI.
- [ ] Reactions and mentions.
- [ ] Typing and read-receipt preferences.
- [ ] Pagination and jump-to-message.
- [ ] Accessibility labels and keyboard navigation.
- [ ] Dark/light themes and responsive layouts.

### Epic 5.2 — Trust UX

- [ ] Persistent privacy-mode indicator.
- [ ] Participant and device detail sheet.
- [ ] Safety-number/device verification flow.
- [ ] Security change warnings.
- [ ] Plain-language archive limitation disclosure.
- [ ] Explain exactly what happens when Alice AI is added.
- [ ] Prevent silent mode conversion.

### Epic 5.3 — Abuse controls

- [ ] Message requests for unknown senders.
- [ ] Block and unblock.
- [ ] Invite and message rate limits.
- [ ] New-account restrictions.
- [ ] User-selected reporting package.
- [ ] Show exact private content disclosed by a report.
- [ ] Moderation operations runbook.

**Exit gate:** Private beta users can complete all core messaging actions and correctly explain who can read the conversation.

---

## Phase 6 — Encrypted Attachments

### Epic 6.1 — Upload and encryption

- [ ] Create upload reservation.
- [ ] Generate per-file key and nonce strategy.
- [ ] Encrypt in chunks.
- [ ] Support multipart/resumable upload.
- [ ] Store ciphertext hashes.
- [ ] Encrypt filename, media type, dimensions, and thumbnail metadata inside the message.

### Epic 6.2 — Download and rendering

- [ ] Verify chunk hashes before decryption.
- [ ] Resume interrupted downloads.
- [ ] Use sandboxed preview.
- [ ] Add dangerous-file warnings and executable restrictions.
- [ ] Add local cleanup and cache controls.

### Epic 6.3 — Attachment privacy tests

- [ ] No plaintext filename in storage keys, logs, traces, analytics, or push.
- [ ] Nonce uniqueness tests.
- [ ] Corruption and truncation tests.
- [ ] Large-file and poor-network tests.

---

## Phase 7 — Encrypted Recoverable History

### Epic 7.1 — Archive construction

- [ ] Generate a per-event Message Archive Key.
- [ ] Encrypt canonical event using authenticated encryption.
- [ ] Wrap event key to each entitled account archive public key.
- [ ] Store one ciphertext and per-account wrappers.
- [ ] Validate that wrappers target current entitled members only.
- [ ] Ensure server services cannot unwrap event keys.

### Epic 7.2 — History policy

- [ ] Support no-cloud-history and history-from-join.
- [ ] Add explicit selected-history sharing.
- [ ] Emit signed history-grant event.
- [ ] Keep removed members' previously granted access semantics explicit.
- [ ] Add archive deletion and retention controls.

### Epic 7.3 — New-device reconstruction

- [ ] Paginate archive records.
- [ ] Unwrap and rebuild local event log.
- [ ] Recreate materialized state and local search index.
- [ ] Add checkpoints and restartability.
- [ ] Measure 10,000-event restore target.

**Exit gate:** A new authorized device restores entitled history without any server component accessing private plaintext.

---

## Phase 8 — Local Search and Knowledge

### Epic 8.1 — Local search

- [ ] Encrypted local SQLite database.
- [ ] FTS index for message body.
- [ ] Structured filters for sender, date, type, attachment, and thread.
- [ ] Offline search UI.
- [ ] Search index rebuild after archive restoration.
- [ ] Test that private search creates no network request.

### Epic 8.2 — Shared memory model

- [ ] Define user-owned memory objects: fact, decision, task, preference, source link.
- [ ] Require source attribution to conversation events.
- [ ] Support inspect, correct, export, expire, and delete.
- [ ] Define per-conversation and per-AI permissions.
- [ ] Prevent memory creation from excluded or expired content.

---

## Phase 9 — Alice AI Participant

### Epic 9.1 — AI admission and identity

- [ ] Register Alice as a distinct participant type.
- [ ] Display provider, model family, capabilities, and retention.
- [ ] Require explicit member approval before admission.
- [ ] Add Alice as an MLS member for private conversations.
- [ ] Limit access to events after joining by default.
- [ ] Support explicit selected-history sharing.
- [ ] Remove Alice through normal membership removal.

### Epic 9.2 — AI capabilities

- [ ] Mention-triggered answer.
- [ ] Conversation summary with citations to source messages.
- [ ] Action-item extraction.
- [ ] Decision capture.
- [ ] Drafting assistance.
- [ ] Translation.
- [ ] Shared-memory proposal requiring confirmation.
- [ ] Refusal and uncertainty handling.

### Epic 9.3 — AI governance

- [ ] Per-conversation capability toggles.
- [ ] Per-user opt-out where technically possible.
- [ ] Data-retention enforcement.
- [ ] Provider failover without changing disclosed trust boundary.
- [ ] Prompt-injection and tool-abuse tests.
- [ ] Rate and spend controls.
- [ ] AI audit events without storing private plaintext in ordinary logs.
- [ ] Export and deletion of AI-derived memory.

**Exit gate:** Users understand Alice's access, can remove it, can inspect its sources, and can delete or correct retained shared memory.

---

## Phase 10 — Client Platforms

### Epic 10.1 — Web

- [ ] WASM protocol core integration.
- [ ] IndexedDB/encrypted local store strategy.
- [ ] CSP, Trusted Types, dependency integrity, and XSS hardening.
- [ ] Explicit lower-assurance-device disclosure.
- [ ] Background sync limitations documented.

### Epic 10.2 — Desktop

- [ ] Tauri/native shell.
- [ ] OS credential-vault integration.
- [ ] Secure automatic update chain.
- [ ] Notification privacy controls.
- [ ] File-system sandboxing.

### Epic 10.3 — iOS

- [ ] Swift bindings to Rust core.
- [ ] Keychain/Secure Enclave integration where available.
- [ ] APNs generic push flow.
- [ ] Background fetch and sync.
- [ ] App-lock and biometric options.

### Epic 10.4 — Android

- [ ] Kotlin bindings to Rust core.
- [ ] Keystore/StrongBox integration where available.
- [ ] FCM generic push flow.
- [ ] Background work and battery optimization.
- [ ] App-lock and biometric options.

**Exit gate:** Required platforms pass the same protocol vectors and interoperability suite.

---

## Phase 11 — Security, Privacy, and Compliance Readiness

### Epic 11.1 — Secure software supply chain

- [ ] Pin dependencies and lockfiles.
- [ ] Generate SBOM per release.
- [ ] Secret scanning.
- [ ] SAST and dependency scanning.
- [ ] Fuzz untrusted parsers continuously.
- [ ] Sign release commits, containers, and client artifacts.
- [ ] Verify signatures during deployment/update.

### Epic 11.2 — Privacy engineering

- [ ] Data inventory and data-flow map.
- [ ] Log/trace field allowlists.
- [ ] Tests that fail on private plaintext leakage.
- [ ] Generic push payloads.
- [ ] Rotating pseudonymous telemetry identifiers.
- [ ] Export and deletion workflows.
- [ ] Subprocessor register and retention map.

### Epic 11.3 — Legal documents

- [ ] Privacy policy.
- [ ] Terms of service.
- [ ] Acceptable-use policy.
- [ ] Data processing agreement.
- [ ] Subprocessor list.
- [ ] Security white paper.
- [ ] Open-source notice and license audit.
- [ ] Vulnerability-disclosure policy.

### Epic 11.4 — External validation

- [ ] Threat-model review.
- [ ] Cryptographic integration assessment.
- [ ] Device-linking penetration test.
- [ ] Web application penetration test.
- [ ] Mobile reverse-engineering review.
- [ ] Desktop update-chain review.
- [ ] Account-takeover red-team exercise.
- [ ] Critical/high findings resolved before GA.

---

## Phase 12 — Reliability and Operations

### Epic 12.1 — Observability

- [ ] Metrics for acceptance latency, delivery latency, sync lag, duplicate rate, epoch conflicts, decrypt failures, archive failures, auth failures, and revocation latency.
- [ ] Tracing with strict attribute allowlist.
- [ ] Alert thresholds and paging policy.
- [ ] Privacy-safe client health telemetry.
- [ ] Cost and capacity dashboards.

### Epic 12.2 — SLOs

- [ ] Authentication availability: 99.95%.
- [ ] Messaging API availability: 99.95%.
- [ ] Message acceptance p95: under 250 ms.
- [ ] Same-region online delivery p95: under 1 second.
- [ ] Revocation enforcement p95: under 10 seconds.
- [ ] No acknowledged message loss inside declared RPO.
- [ ] Crash-free client sessions above 99.5% for beta.

### Epic 12.3 — Runbooks

- [ ] Authentication outage.
- [ ] Delivery backlog.
- [ ] Storage degradation.
- [ ] Realtime-gateway overload.
- [ ] Push-provider outage.
- [ ] Key or token compromise.
- [ ] Suspected private-plaintext leakage.
- [ ] Dependency vulnerability.
- [ ] Account takeover campaign.
- [ ] Region failover and failback.

### Epic 12.4 — Disaster recovery

- [ ] Define home-region ownership.
- [ ] Define RPO/RTO by data class.
- [ ] Replicate only where residency allows.
- [ ] Preserve idempotency across failover.
- [ ] Fence old writers before promotion.
- [ ] Conduct game day before public beta.

---

## Phase 13 — Beta and Launch

### Epic 13.1 — Internal alpha

- [ ] 10–25 daily users.
- [ ] Dogfood private messaging and Alice AI.
- [ ] Daily issue triage.
- [ ] Weekly trust/comprehension interviews.
- [ ] No unresolved P0 security bugs.

### Epic 13.2 — Private beta

- [ ] 100–500 invited users.
- [ ] Web, desktop, and one mobile platform.
- [ ] Guided onboarding.
- [ ] Support and feedback channel.
- [ ] Measure activation, delivery failures, restore failures, and AI trust.
- [ ] Publish security architecture summary.

### Epic 13.3 — Public beta

- [ ] Both mobile platforms.
- [ ] External security review complete.
- [ ] Load and failure testing complete.
- [ ] Privacy policy and terms live.
- [ ] Incident response and on-call active.
- [ ] Status page and user-facing incident communications.

### Epic 13.4 — General availability

- [ ] Security gate passed.
- [ ] SLOs sustained for 30 days.
- [ ] Backup and restore exercise passed.
- [ ] Data export and account deletion verified.
- [ ] Security-mode comprehension target achieved.
- [ ] Support coverage and escalation paths operational.
- [ ] Pricing, billing, and entitlement behavior tested.

---

## 5. Cross-Cutting Definition of Done

A task is complete only when all applicable items are true:

- [ ] Acceptance criteria are written and pass.
- [ ] Threat and privacy impact are reviewed.
- [ ] Unit, integration, and failure tests exist.
- [ ] Logs and telemetry contain no prohibited data.
- [ ] Accessibility is reviewed.
- [ ] Documentation and runbooks are updated.
- [ ] Migration and rollback are defined.
- [ ] Metrics and alerts are added.
- [ ] Cross-platform behavior is verified.
- [ ] Security-sensitive changes receive independent review.

---

## 6. Release Gates

### Gate A — Prototype stabilized

- [ ] Authenticated sessions and sockets.
- [ ] Membership authorization enforced.
- [ ] CI passes.
- [ ] Database migrations and constraints exist.
- [ ] No known critical vulnerabilities.

### Gate B — Cryptographic proof

- [ ] MLS vectors pass.
- [ ] Device add/remove/revoke works.
- [ ] Cross-client interoperability works.
- [ ] Threat model approved.

### Gate C — Private messaging beta

- [ ] Durable offline delivery.
- [ ] Deterministic sync.
- [ ] Attachments.
- [ ] Recoverable history.
- [ ] Local search.
- [ ] Blocking/reporting.
- [ ] No private plaintext in server logs or push.

### Gate D — Alice AI beta

- [ ] Visible participant model.
- [ ] Explicit consent and removal.
- [ ] Source attribution.
- [ ] Retention controls.
- [ ] Memory inspect/correct/export/delete.
- [ ] Prompt-injection tests.

### Gate E — Public beta

- [ ] External assessment complete.
- [ ] SLOs met under load.
- [ ] Disaster recovery exercised.
- [ ] Legal documents live.
- [ ] Incident response operational.

### Gate F — GA

- [ ] No unresolved critical or high security findings.
- [ ] 30-day production reliability evidence.
- [ ] Security-mode comprehension validated.
- [ ] Export/deletion/recovery verified.
- [ ] Support and escalation readiness verified.

---

## 7. Suggested Initial GitHub Backlog

1. P0 — Replace unsigned session token implementation.
2. P0 — Authenticate realtime connections and bind them to device identity.
3. P0 — Enforce conversation membership on room join and send.
4. P0 — Repair local development port/startup configuration.
5. P0 — Replace npm-publish workflow with CI test/build workflow.
6. P0 — Add database migrations, foreign keys, unique constraints, and indexes.
7. P0 — Write ADR-001 through ADR-005.
8. P0 — Create protocol Rust workspace and deterministic event schema.
9. P0 — Implement device registry and revocation model.
10. P0 — Implement idempotent append-only event pipeline.
11. P1 — Implement encrypted local database and reducer.
12. P1 — Integrate MLS and conformance vectors.
13. P1 — Implement encrypted attachment pipeline.
14. P1 — Implement recoverable encrypted history.
15. P1 — Implement local FTS search.
16. P1 — Implement Alice as visible AI participant.
17. P1 — Add privacy-safe telemetry and plaintext-leak tests.
18. P1 — Build security dashboard and device verification UX.
19. P1 — Establish beta runbooks and incident response.
20. P1 — Commission external cryptographic and application review.

---

## 8. Product Success Measures

### Trust

- At least 90% of tested users correctly identify who can read PRIVATE and AI_PRIVATE conversations.
- Zero confirmed private-plaintext leakage through logs, traces, analytics, or push payloads.
- Device revocation completes within the declared SLO.

### Reliability

- Message-send success above 99.9%.
- Online delivery p95 below one second in the home region.
- Decryption failure below 0.1% excluding intentionally corrupted test traffic.
- Archive restore succeeds for more than 99% of eligible attempts.

### Product value

- Majority of activated groups create a second conversation within seven days.
- Alice answers include inspectable sources when based on conversation history.
- Users accept or edit a meaningful share of Alice-generated tasks, decisions, or summaries.
- Shared-memory correction and deletion are understandable without support intervention.

---

## 9. Immediate 30-Day Execution Plan

### Week 1

- [ ] Approve product thesis, first user, and MVP exclusions.
- [ ] Repair authentication and Socket.IO authorization.
- [ ] Replace CI workflow.
- [ ] Create ADR and issue templates.
- [ ] Draft threat model.

### Week 2

- [ ] Add relational constraints and migrations.
- [ ] Define canonical event schema.
- [ ] Scaffold Rust protocol core.
- [ ] Add baseline unit/integration tests.
- [ ] Implement multi-device connection model.

### Week 3

- [ ] Build device registry and revocation API.
- [ ] Build authenticated realtime handshake.
- [ ] Implement idempotent message acceptance.
- [ ] Implement deterministic reducer prototype.
- [ ] Draft private-mode trust UX.

### Week 4

- [ ] Complete MLS implementation spike and test vectors.
- [ ] Demonstrate two-device encrypted exchange.
- [ ] Demonstrate device removal and old-epoch rejection.
- [ ] Review threat model externally.
- [ ] Re-plan estimates based on measured prototype results.

---

## 10. Governing Statement

When AI enters a human conversation, the people in that conversation—not the platform—govern its access, memory, and power.
