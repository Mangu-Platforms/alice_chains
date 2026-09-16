# Alisons — complete tool

One room. People. A call. Alice as a guest.

This is the amalgamated product model: Studio chrome + every surface the bible
owes the dogfood messenger, running as a single file.

Open `index.html`. Nothing to install.

## What works

- Inbox, thread, inspector (one object, not a left-nav)
- Directs, groups, unread, presence
- Send, reply, react, edit, delete
- Files and voice notes (modeled)
- History pagination — Load earlier (H-9, proven here)
- Search this room
- Contacts, block, new group
- Call overlay with timer
- Alice admit / remove with terms
- Owner tools: remove member, invite, export transcript
- Offline banner + outbox
- Profile, notifications, spec
- Mobile list ↔ thread
- Persists in the browser

## What this is not

The production wire. Messages do not hit tRPC or Socket.IO. Calls have no
TURN. Encryption is a label. The dogfood stack remains the repo root.

When chrome ports, it ports onto `src/pages/Chat.tsx`. Not the other way.
