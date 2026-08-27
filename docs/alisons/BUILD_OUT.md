# Technical build-out of each surface

How to make (or finish) every window. Current stack unless marked Track B.

## Login `/login`

- File: `src/pages/Login.tsx`
- Flow: redirect to Kimi authorize URL with PKCE S256 (`api/kimi/auth.ts`, `api/kimi/pkce.ts`)
- Session: HMAC cookie + server store (`api/kimi/session.ts`)
- Gaps: single IdP. No passkey, no email magic link, no OIDC/SAML
- Next: keep as-is for Track A. Track B adds passkeys on `/welcome`

## Chat `/` — split this first

`src/pages/Chat.tsx` (~81 KB) currently owns:

1. Sidebar list + recency sort + unread
2. Thread window (50 messages, no infinite scroll)
3. Composer (4000 cap, paste-to-attach, emoji, outbox)
4. Header (search, media, stub call/video)
5. Group management dialog
6. In-conversation + global search overlays
7. Message hover/long-press menu

**Required split before calls or E2EE:**

| Module | Owns |
|---|---|
| `ConversationList` | rooms, unread, presence dots, mobile overlay |
| `Thread` | bubbles, receipts, edits, deletes, replies, reactions, typing, **pagination** |
| `Composer` | draft, attach, emoji, send, length, outbox |
| `ChatHeader` | name, presence, tools |
| `GroupDialog` | rename, members, leave, transfer |
| `SearchOverlay` | local + global FULLTEXT |
| `MediaDrawer` | already `MediaDrawer.tsx` — keep |
| `CallOverlay` | new. Do not grow Chat.tsx |

History: `api/queries/messages.ts` already accepts limit/offset. Wire infinite scroll. H-9.

Realtime: `api/socket.ts` + `src/hooks/useSocket.ts`. Presence is an in-process Map — two nodes split truth until Redis adapter (S-19).

## Contacts `/contacts`

- File: `src/pages/Contacts.tsx`
- Router: `api/contact-router.ts`
- States: pending / accepted / blocked
- Blocking must stay on `isBlockedBetween` for every path (messages, contacts, presence)

## Settings `/settings`

- File: `src/pages/Settings.tsx`
- Avatar: presigned PUT, JPEG/PNG/GIF/WebP
- Security: `admin.revokeAllSessions` — no per-device list until Track B
- Missing buttons: delete account, member export

## Admin `/admin` (missing UI)

- Backend: `api/admin-router.ts` — list, deactivate, export, erase
- Build a gated page for the owner. Do not expose bulk-delete to the public client

## Calls (stub → Track A M5)

- Signaling over existing Socket.IO events
- Coturn in `docker-compose.yml`
- New overlay: mute, speaker, end; video grid + screen share later
- Schema: call sessions table when you persist history
- Blocker: STUN/TURN estate. Not a weekend stub

## Alice admission (Track B)

- Dialog on the room, not a backend observer
- Disclose provider, retention, capabilities
- Consent required; remove like a member
- Needs encrypted wire or an explicit MANAGED/PRIVATE mode badge

## Legal `/legal` (missing)

Static pages: privacy, terms, AUP, DPA, subprocessors. MIT `LICENSE` is not product legal.

## Native

Do not start iOS/Android until Track B protocol core exists. PWA + desktop web is Track A mobile.
