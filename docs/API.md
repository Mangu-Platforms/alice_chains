# Alice Chains — API Quick Reference

> **This is the one-page cheat sheet. [API_CONTRACT.md](API_CONTRACT.md) is normative.**
> Where the two differ on a procedure name, a payload shape, an auth precondition or an error envelope, API_CONTRACT.md is correct — it carries a `file.ts:LINE` citation for every claim and is the document to update first. Use this page to find the right procedure quickly, then read API_CONTRACT.md before you depend on its behaviour. Known-wrong aliases (`conversation.get`, `message.list`, `contact.search`) are catalogued at the head of [API_CONTRACT.md §2](API_CONTRACT.md); the correct names are `conversation.getById`, `message.listByConversation` and `contact.searchUsers`.

*Generated from source on 2026-08-12. tRPC procedures live under `/api/trpc` (superjson transformer, HTTP batch link). All procedures except `ping` require a valid `alice_session` cookie and throw `UNAUTHORIZED` otherwise. The PRD's API table includes planned procedures (`file.getPresignedUrl`, `search.messages`) that do **not** exist yet — they arrive with BUILD_PLAN F-4 and Phase 2 search.*

## HTTP endpoints (non-tRPC)

| Method + path | Purpose |
|---|---|
| `GET /api/oauth/callback?code=…` | OAuth code exchange → user upsert → sets `alice_session` cookie → 302 `/` |
| `GET /api/logout` | Clears cookie → 302 `/login` |
| `GET /api/*` (unmatched) | `404 {"error":"Not Found"}` |

## tRPC router: `auth`

| Procedure | Kind | Input | Returns |
|---|---|---|---|
| `auth.me` | query | — | The authenticated `User` row (or `UNAUTHORIZED`) |

## tRPC router: `conversation`

| Procedure | Kind | Input | Returns / behavior |
|---|---|---|---|
| `conversation.list` | query | — | Caller's conversations, most-recently-updated first, each with participants (id, name, avatar, status) and `lastMessage`. Direct chats display the *other* participant's name/avatar |
| `conversation.getById` | query | `{ id: number }` | Conversation + participants; membership enforced |
| `conversation.createDirect` | mutation | `{ otherUserId: number }` | Returns existing direct conversation if one already exists, else creates it with both participants |
| `conversation.createGroup` | mutation | `{ name: string, participantIds: number[] }` | Creates group; caller is added automatically |
| `conversation.markAsRead` | mutation | `{ conversationId: number }` | Sets caller's `conversation_participants.lastReadAt = now` (basis for unread badges, F-1) |

## tRPC router: `message`

| Procedure | Kind | Input | Returns / behavior |
|---|---|---|---|
| `message.listByConversation` | query | `{ conversationId: number, limit?: 1–100 = 50, offset?: ≥0 = 0 }` | Chronological page of messages with `senderName`, `senderAvatar`, `readBy[]`, `isMine`. Non-participants get `[]` |
| `message.send` | mutation | `{ conversationId, content: 1–4000 chars, type?: "text"\|"image"\|"file" = "text", fileUrl?, replyToId? }` | Persists and returns the new message. **Does not emit socket events** — realtime sends go through the socket `sendMessage` event; HTTP send is the fallback path |
| `message.markAsRead` | mutation | `{ messageIds: number[] }` | Inserts read receipts (duplicates ignored) |

## tRPC router: `contact`

| Procedure | Kind | Input | Returns / behavior |
|---|---|---|---|
| `contact.list` | query | — | Accepted contacts with profile + status |
| `contact.pending` | query | — | Incoming requests awaiting the caller's acceptance |
| `contact.add` | mutation | `{ contactUserId: number }` | Creates a `pending` request |
| `contact.accept` | mutation | `{ contactId: number }` | Accepts a pending request (both directions become usable) |
| `contact.remove` | mutation | `{ contactUserId: number }` | Removes the relationship |
| `contact.searchUsers` | query | `{ query: string (min 1) }` | Users matching name/email `LIKE %q%`, excluding self |

## Root

| Procedure | Kind | Returns |
|---|---|---|
| `ping` | public query | `{ ok: true, ts: number }` — liveness probe |

---

## Socket.IO protocol

Path `/socket.io`, same origin. **Handshake:** the server-side middleware authenticates the `alice_session` cookie from the handshake headers; unauthenticated connections are refused (`Unauthorized`). The socket's user identity is fixed server-side at handshake — there is no client "join as user X" event.

On connect the server: registers the socket in the presence map, joins `user_{userId}`, broadcasts `userOnline` (first socket only), and emits the current `onlineUsers` list to the new socket.

### Client → server

| Event | Payload | Guard |
|---|---|---|
| `joinConversation` | `{ conversationId }` | membership checked; silently ignored otherwise |
| `leaveConversation` | `{ conversationId }` | — |
| `sendMessage` | `{ conversationId, content, type?, fileUrl?, replyToId?, tempId? }` | membership checked; persists then broadcasts |
| `markAsRead` | `{ messageIds: number[], conversationId }` | membership checked; inserts receipts |
| `typing` | `{ conversationId, isTyping }` | membership checked |

### Server → client

| Event | Payload | Emitted when |
|---|---|---|
| `newMessage` | full message row + `tempId?` | to `conv_{id}` after a socket send (echoes `tempId` for optimistic-UI reconciliation) |
| `conversationUpdated` | `{ conversationId, lastMessage }` | to each participant's `user_{id}` room after a send |
| `messagesRead` | `{ messageIds, userId }` | to `conv_{id}` (excluding reader) after `markAsRead` |
| `userTyping` | `{ userId, conversationId, isTyping }` | to `conv_{id}` (excluding typist) |
| `userOnline` / `userOffline` | `{ userId }` | first socket connects / last socket disconnects |
| `onlineUsers` | `number[]` | to a socket at connect |
| `messageError` | `{ error }` | send failed server-side |

### Client helper

`src/hooks/useSocket.ts` wraps the connection with typed `ServerToClientEvents` / `ClientToServerEvents` interfaces — **update both sides together** when adding events. Note: `join(_userId)` in that hook is a legacy no-op retained for call-site compatibility; identity comes from the cookie.

## Error semantics

- tRPC: standard tRPC error envelope; `UNAUTHORIZED` for missing/invalid session; input validation errors from Zod schemas above.
- Sockets: failed guards are silent no-ops (by design, to avoid probing); hard failures emit `messageError`.
- Body size: global 50 MB limit (`bodyLimit`, `api/boot.ts:17`) — will matter for F-4 uploads, and is itself a hardening item (`SECURITY.md` SEC-C-20 drops it to 256 KB).

## Planned surface (not yet implemented)

From [PRD.md](PRD.md) and [BUILD_PLAN.md](BUILD_PLAN.md): `reaction.add`/`reaction.remove` + `reactionUpdated` (F-3), `message.edit`/`message.delete` + `messageUpdated`/`messageDeleted` (F-2), `file.getPresignedUrl` (F-4), push subscription endpoints (F-6), `search.messages` (Phase 2 search), WebRTC signaling events `call:*` (Phase 3).
