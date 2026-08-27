# Features

Every capability. Status: shipped | stub | hygiene | specified | parked | missing.

## Core

| ID | Feature | Status | Story | Note |
|---|---|---|---|---|
| F-MSG | Real-time text messaging | shipped | Send a message; everyone sees it without refresh | Socket.IO rooms + tRPC persist. Sub-100ms unmeasured |
| F-DM | Direct conversations | shipped | Open a private 1:1 with an accepted contact | Idempotent createDirect after Wave 1 |
| F-GRP | Group conversations | shipped | Create, add, leave, transfer ownership | F-7 in repo |
| F-CTC | Contacts and requests | shipped | Search, request, accept, decline, remove | pending / accepted / blocked |
| F-BLK | Blocking | shipped | Blocked person cannot message, add, or see presence | Shared `isBlockedBetween` |
| F-PRE | Presence | shipped | Who is online across tabs | In-process Map. Breaks multi-instance |
| F-TYP | Typing indicators | shipped | See composing | Conversation-scoped socket event |
| F-READ | Read receipts | shipped | Know when a message was read | `message_reads`; Wave 1 bind-bug fixed |
| F-PAGE | History pagination | hygiene | Scroll past last 50 | Server has limit/offset; client never pages (H-9) |

## Enrichment

| ID | Feature | Status | Story | Note |
|---|---|---|---|---|
| F-UNR | Unread badges | shipped | Unread per conversation | Caps at 99+ |
| F-EDT | Edit and soft-delete | shipped | Correct or retract | isEdited + deletedAt |
| F-RXN | Emoji reactions | shipped | One react per emoji per user | Unique (message, user, emoji) |
| F-ATT | File and image attachments | shipped | Attach photo/file | 50MB. FS default; S3/MinIO optional |
| F-RPL | Reply threading | shipped | Reply to a specific message | Jump fails outside 50-window |
| F-PUSH | Web push | shipped | OS notification when tab closed | VAPID + SW. iOS needs PWA install |
| F-SRCH | Message search | shipped | This room or everywhere I belong | MySQL FULLTEXT, not Meilisearch |
| F-PROF | Profile | shipped | Name, status, avatar, sign out every device | Settings page |
| F-OUT | Offline outbox | shipped | Compose offline; retry | Connection banner + client outbox |
| F-CMP | Composer | shipped | Shift+enter, paste-to-attach, emoji, counter | 4000 cap |
| F-MED | Media drawer | shipped | Browse photos/files in the room | P-UX-4 |
| F-LNK | Link detection | shipped | Tap URL safely | rel=noopener. No unfurl |

## Platform

| ID | Feature | Status | Story | Note |
|---|---|---|---|---|
| F-AUTH | Kimi OAuth + signed sessions | shipped | Sign in and stay signed in | PKCE S256, HMAC cookie. Not passkeys. Single IdP |
| F-RL | Rate limiting | shipped | Spam/flood protection | S-13. Redis not required |
| F-OBS | Health and logs | shipped | /healthz /readyz, redacted logs | No SLO dashboard |
| F-ADM | Admin data rights | shipped | List, deactivate, export, erase | API only. No admin page |
| F-A11Y | Accessibility baseline | shipped | Keyboard + screen reader | Remaining copy still inline (S-20a) |
| F-REDIS | Horizontal realtime scale | specified | Two nodes, consistent presence | S-19 gated on 6k connections |

## Enterprise / media

| ID | Feature | Status | Story | Note |
|---|---|---|---|---|
| F-CALL | Voice and video calls | stub | Start a call from the header | Icons only. No signaling/TURN |
| F-SHARE | Screen sharing | specified | Share a window during a call | PRD Phase 3 |
| F-VOICE | Voice notes | specified | Hold to record audio bubble | MediaRecorder |
| F-MOB | Native iOS and Android | specified | Home-screen app + background push | PRD Phase 4. PWA is current |
| F-SSO | Enterprise SSO / SCIM | missing | Okta provision / deprovision | Excluded from MVP |
| F-HOLD | Legal hold, DLP, eDiscovery | missing | Freeze a matter | Needs MANAGED mode vs PRIVATE |
| F-AUDIT | Immutable audit log UI | specified | Review auth/admin/data-access | Writes exist. No operator UI |
| F-FED | Federation | missing | Two orgs without sharing a host | Matrix-class. Excluded from MVP |

## Crypto (Track B — parked)

| ID | Feature | Status | Story | Note |
|---|---|---|---|---|
| F-E2EE | End-to-end encryption (MLS) | parked | Server cannot read messages | Not Signal-on-MySQL |
| F-DEV | Device identity and revocation | parked | Link laptop, verify phrase, kill stolen phone | Passkeys + device certs |
| F-ALICE | Visible AI participant | parked | Admit Alice, see what she can read, remove her | Differentiator. Never a spy |
| F-ARCH | Encrypted recoverable history | parked | Restore on new device without server plaintext | Track B Phase 7 |
| F-LSEARCH | Local encrypted search | parked | Search private content offline | Today search hits MySQL |
