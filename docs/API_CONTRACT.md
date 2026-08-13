# Alice Chains — API Contract

**Repo:** `Mangu-Platforms/alice_chains` · **Server:** Hono `4.13.1` + tRPC `11.18.0` + Socket.IO `4.8.3` · **Client:** React 19 + Vite 6, `@trpc/react-query` 11, `socket.io-client` 4
**Root router:** `api/router.ts:7-13` · **Procedure builders:** `api/middleware.ts` · **Context:** `api/context.ts` · **Socket server:** `api/socket.ts` · **HTTP bootstrap:** `api/boot.ts`

This document is the wire contract. Every claim carries a `file.ts:LINE` reference. Anything not verifiable from source is marked `> **UNVERIFIED:**`.

---

## 1. Transport overview

### 1.1 Surfaces

| Surface | Path | Handler | Notes |
|---|---|---|---|
| tRPC | `/api/trpc/*` | `api/boot.ts:23-30` → `fetchRequestHandler({ endpoint: "/api/trpc", router: appRouter, createContext })` | Registered with `app.use`, not `app.all`; the handler returns a `Response` so all verbs land there. |
| OAuth callback | `GET /api/oauth/callback` | `api/boot.ts:18` → `createOAuthCallbackHandler()` (`api/kimi/auth.ts:24-109`). Path constant `contracts/constants.ts:2`. | 302 on success. |
| Logout | `GET /api/logout` | `api/boot.ts:19-22` | 302 to `/login`, clears cookie with `Max-Age=0`. |
| Socket.IO | `/socket.io` | `api/socket.ts:21-213`, attached to the Node server at `api/boot.ts:75` | Path set explicitly at `api/socket.ts:27`. |
| API catch-all | `/api/*` | `api/boot.ts:31` | `{"error":"Not Found"}` with HTTP 404 — **not** a tRPC error envelope. |
| Static client (prod only) | `/*` | `api/lib/vite.ts:5-8` via `api/boot.ts:52-53` | SPA fallback to `dist/public/index.html`. |

Body limit for all Hono routes: **50 MiB** (`api/boot.ts:17`).

### 1.2 tRPC configuration

```ts
// api/middleware.ts:5
const t = initTRPC.context<Context>().create({ transformer: superjson });
```

| Property | Value | Evidence |
|---|---|---|
| Version | tRPC v11 (`@trpc/server` 11.18.0) | `package.json:50` |
| Transformer | `superjson` on **both** ends — `Date` survives the wire as `Date` | `api/middleware.ts:5`, `src/providers/trpc.tsx:13` |
| Link | `httpBatchLink({ url: "/api/trpc", transformer: superjson })` | `src/providers/trpc.tsx:13` |
| Adapter | fetch adapter (`@trpc/server/adapters/fetch`) | `api/boot.ts:6` |
| Error formatter | none configured → tRPC `defaultFormatter` | `api/middleware.ts:5` (no `errorFormatter` key) |
| Batching | on. Queries → `GET /api/trpc/<a>,<b>?batch=1&input=<urlencoded json>`; mutations → `POST /api/trpc/<name>?batch=1` | `httpBatchLink` default |
| Dev proxy | Vite `:3000` proxies `/api` and `/socket.io` to `:3001` (`ws: true`) | `vite.config.ts:16-26`; ports in `contracts/constants.ts:17-19` |

### 1.3 Context and authentication

```ts
// api/context.ts:4-6
export async function createContext({ req }: FetchCreateContextFnOptions) {
  return { user: await authenticateRequest(req.headers) };
}
```

`authenticateRequest` (`api/kimi/auth.ts:4-22`): read `alice_session` cookie → `verifySessionToken` → look up `users` by `unionId` → return the **full `users` row** or `undefined`.

| Step | Detail | Evidence |
|---|---|---|
| Cookie name | `alice_session` | `contracts/constants.ts:6` |
| Token format | `base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, JWT_SECRET))` — **not a JWT** | `api/kimi/session.ts:23-26` |
| Payload | `{ userId, unionId, name, email?, iat }` — base64url, **not encrypted, trivially readable** | `api/kimi/types.ts:9-15`, `api/kimi/session.ts:24` |
| Signature check | `timingSafeEqual` with a length guard | `api/kimi/session.ts:32-34` |
| Expiry | `Date.now() - iat > 7 days` → reject | `api/kimi/session.ts:36`, `contracts/constants.ts:7` |
| Cookie attributes as set | `Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` — **no `Secure` flag** | `api/kimi/auth.ts:102` |
| Revocation | none. Logout clears the cookie only; the token stays valid for its full 7 days | `api/boot.ts:19-22` |

`getSessionCookieOptions` (`api/kimi/session.ts:40-51` and a byte-identical duplicate at `api/lib/cookies.ts:4-15`) would set `secure` from `x-forwarded-proto` — **both copies are dead code, imported nowhere** (verified by repo-wide grep).

### 1.4 Procedure builders

```ts
// api/middleware.ts:7-12
export const createRouter = t.router;
export const publicQuery  = t.procedure;
export const authedQuery  = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
```

| Builder | Guarantee | Failure |
|---|---|---|
| `publicQuery` | `ctx.user` is `User \| undefined` | — |
| `authedQuery` | `ctx.user` is `User` (narrowed) | `TRPCError { code: "UNAUTHORIZED" }` → **HTTP 401**, JSON-RPC code `-32001` |

Naming trap: `publicQuery`/`authedQuery` are *procedure builders*, not query-only — every mutation in this codebase is built from `authedQuery` (e.g. `api/message-router.ts:85`).

### 1.5 OAuth flow (FR-AUTH-LOGIN)

| # | Step | Evidence |
|---|---|---|
| 1 | Client links to `${VITE_KIMI_AUTH_URL}/oauth/authorize?client_id=…&redirect_uri=${origin}/api/oauth/callback&response_type=code` | `src/pages/Login.tsx:4-7` |
| 2 | Provider redirects to `GET /api/oauth/callback?code=…`; missing `code` → `400 {"error":"Missing authorization code"}` | `api/kimi/auth.ts:29-31` |
| 3 | `POST ${VITE_KIMI_AUTH_URL}/api/oauth/token` with `{code, client_id, client_secret, grant_type:"authorization_code", redirect_uri}`; non-2xx → `400 {"error":"Failed to exchange code"}` | `api/kimi/auth.ts:35-54` |
| 4 | `GET ${VITE_KIMI_AUTH_URL}/api/oauth/userinfo` with `Authorization: Bearer`; non-2xx → `400 {"error":"Failed to get user info"}` | `api/kimi/auth.ts:59-70` |
| 5 | `upsertUser({unionId, name, email, avatar})` then re-read by `unionId`; miss → `500 {"error":"Failed to create user"}` | `api/kimi/auth.ts:75-87`, `api/queries/users.ts:10-14` |
| 6 | Set `alice_session`, `302 → /` | `api/kimi/auth.ts:98-104` |
| — | Any throw → `500 {"error":"Authentication failed"}` | `api/kimi/auth.ts:105-108` |

**No `state` parameter is generated or verified** — the flow is unprotected against CSRF-style authorization-code injection. **NFR-SEC-OAUTH-STATE.** PKCE is likewise absent.

---

## 2. tRPC procedures

Router composition (`api/router.ts:7-13`): `ping`, `auth`, `conversation`, `message`, `contact`. Sixteen procedures total.

**Name corrections against the commissioning brief** — the following differ from the assumed names; the real names below are authoritative:

| Assumed | Actual | Evidence |
|---|---|---|
| `conversation.get` / `byId` | **`conversation.getById`** | `api/conversation-router.ts:106` |
| `message.list` | **`message.listByConversation`** | `api/message-router.ts:13` |
| `contact.search` | **`contact.searchUsers`** | `api/contact-router.ts:165` |

### 2.1 `ping`

| | |
|---|---|
| Type | query |
| Auth | **public** |
| Defined | `api/router.ts:8` |
| Input | none |
| Output | `{ ok: true; ts: number }` |
| Errors | none reachable |
| Side effects | none |

Used as the container liveness probe: `Dockerfile` `HEALTHCHECK` fetches `http://127.0.0.1:$PORT/api/trpc/ping`. **The probe does not touch the database**, so a healthy container can be serving 500s on every real procedure. **NFR-OPS-HEALTH:** add a `readyz` procedure that executes `SELECT 1`.

### 2.2 `auth.me`

| | |
|---|---|
| Type | query |
| Auth | **authed** |
| Defined | `api/auth-router.ts:4` |
| Input | none |
| Output | the entire `users` row |
| Errors | `UNAUTHORIZED` (401) |
| Side effects | none |

```ts
// output === typeof users.$inferSelect (db/schema.ts:29)
{
  id: number; unionId: string; name: string | null; email: string | null;
  avatar: string | null; status: string | null; role: "user" | "admin";
  createdAt: Date; updatedAt: Date; lastSignInAt: Date;
}
```

Over-exposes `unionId` (the OAuth subject) and `role`. Client consumes it via `useAuth()` with `retry: false` (`src/hooks/useAuth.ts:4`); `AuthLayout` renders the sign-in screen whenever `user` is falsy (`src/components/AuthLayout.tsx:14`), so **any** error — including a 500 — is displayed as "logged out". **NFR-SEC-PII / H-CLIENT-ERRSTATE.**

### 2.3 `conversation.list`

| | |
|---|---|
| Type | query · **Auth** authed · **Defined** `api/conversation-router.ts:13` |
| Input | none |
| Errors | `UNAUTHORIZED`; `INTERNAL_SERVER_ERROR` on DB failure |
| Side effects | none |

```ts
// Output: Array<...>  — empty array when the user has no memberships (:24)
{
  id: number;
  name: string | null;
  type: "direct" | "group";
  avatar: string | null;
  createdAt: Date;
  updatedAt: Date;
  displayName: string;                    // :86-89  direct → other participant's name ?? "Unknown"; group → name ?? "Group Chat"
  displayAvatar: string | null | undefined; // :90-93 undefined when a direct conversation has no other participant
  participants: Array<{
    conversationId: number;
    userId: number;
    userName: string | null;              // LEFT JOIN users (:49) — null if the user row is missing
    userAvatar: string | null;
  }>;
  latestMessage: { content: string; createdAt: Date; senderId: number } | null; // :95-101
}[]
```

Ordered by `conversations.updatedAt DESC` (`:38`) — which is never bumped, so the order is effectively creation order (see `DATA_MODEL.md` §6.5). Contains **no unread count**. Four queries per call, one of which loads every message of every conversation (`:53-62`).

### 2.4 `conversation.getById`

| | |
|---|---|
| Type | query · **Auth** authed · **Defined** `api/conversation-router.ts:106` |

```ts
// Input (:107)
z.object({ id: z.number() })
```

```ts
// Output
{
  id: number; name: string | null; type: "direct" | "group"; avatar: string | null;
  createdBy: number; createdAt: Date; updatedAt: Date;   // full conversations row (:127)
  displayName: string;
  displayAvatar: string | null | undefined;
  participants: Array<{ userId: number; userName: string | null; userAvatar: string | null }>;
} | null
```

| Condition | Result | Line |
|---|---|---|
| Caller is not a participant | `null` — **not** `FORBIDDEN` | `:124` |
| Conversation does not exist | `null` — **not** `NOT_FOUND` | `:132` |

Returning `null` for both makes existence and membership indistinguishable to the client (defensible as anti-enumeration, undocumented as such) and forces the client to treat a permission failure as an empty state (`src/pages/Chat.tsx:347`).

### 2.5 `conversation.createDirect`

| | |
|---|---|
| Type | **mutation** · **Auth** authed · **Defined** `api/conversation-router.ts:160` |

```ts
// Input (:161)
z.object({ otherUserId: z.number() })
```

```ts
// Output — a UNION of two different shapes:
| { id: number; name: string | null; type: "direct" | "group"; avatar: string | null;
    createdBy: number; createdAt: Date; updatedAt: Date }   // existing conversation, full row (:196)
| { id: number; type: "direct"; createdBy: number }          // freshly created, partial (:212)
```

| Aspect | Detail |
|---|---|
| Reuse logic | Loads every membership row for both users (`:167-175`), intersects in JS (`:177-184`), takes the **first** common conversation id (`:184`), then requires it to be `type = 'direct'` (`:191-193`). If that first common conversation is a *group*, the procedure falls through and **creates a duplicate direct conversation** even though one exists. |
| Existence check on `otherUserId` | **none** — no FK, no lookup. A conversation can be created against a non-existent user id. |
| Contact check | **none** — any authenticated user can open a direct conversation with any user id. **FR-CONV-DM-AUTHZ gap.** |
| Atomicity | none: conversation insert (`:200`) and participant insert (`:207`) are separate statements outside a transaction. |
| Socket events | **none.** The counterparty's UI does not learn about the new conversation until it refetches. |
| Errors | `UNAUTHORIZED`; `INTERNAL_SERVER_ERROR` on DB failure |

Client handles the union defensively: `onSuccess: (data: { id?: number }) => …` (`src/pages/Contacts.tsx:75-83`).

### 2.6 `conversation.createGroup`

| | |
|---|---|
| Type | **mutation** · **Auth** authed · **Defined** `api/conversation-router.ts:215` |

```ts
// Input (:216-221)
z.object({
  name: z.string().min(1).max(100),
  participantIds: z.array(z.number()).min(1),
})
```

```ts
// Output (:242)
{ id: number; name: string; type: "group" }
```

Caller is force-added and ids are de-duplicated in JS (`:234`). No validation that the ids exist or are contacts. No transaction. **No socket event** — invitees do not learn about the group in real time. `name` max 100 but `conversations.name` is `varchar(255)` (`db/schema.ts:35`) — the tighter bound is the API's.

### 2.7 `conversation.markAsRead`

| | |
|---|---|
| Type | **mutation** · **Auth** authed · **Defined** `api/conversation-router.ts:245` |

```ts
// Input (:246)
z.object({ conversationId: z.number() })
```

```ts
// Output (:258)
{ success: true }
```

Sets `conversation_participants.lastReadAt = NOW()` for `(conversationId, ctx.user.id)` (`:249-257`). Returns `{success: true}` unconditionally, even when zero rows match (non-member). **No socket event.** `lastReadAt` is never read by any procedure, and **the client never calls this procedure** (verified: no `conversation.markAsRead` reference in `src/`).

### 2.8 `message.listByConversation`

| | |
|---|---|
| Type | query · **Auth** authed · **Defined** `api/message-router.ts:13` |

```ts
// Input (:15-19)
z.object({
  conversationId: z.number(),
  limit:  z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
})
```

```ts
// Output: Array<...> in ASCENDING createdAt order (fetched DESC then .reverse(), :78)
{
  id: number; conversationId: number; senderId: number;
  content: string; type: "text" | "image" | "file";
  fileUrl: string | null; replyToId: number | null; isEdited: boolean; createdAt: Date;
  senderName: string | null; senderAvatar: string | null;   // LEFT JOIN users (:54)
  readBy: Array<{ id: number; messageId: number; userId: number; readAt: Date }>;
  isMine: boolean;                                          // :81 senderId === ctx.user.id
}[]
```

| Condition | Result | Line |
|---|---|---|
| Caller is not a participant | `[]` — **not** `FORBIDDEN` | `:37` |
| No messages | `[]` | — |

**`readBy` is wrong for all but one message per page.** The receipt query at `:68` compiles to `messageId IN (?)` with a single joined-string parameter, so MySQL coerces `'11,12,13'` to `11` and matches only the first id (see `DATA_MODEL.md` §6.3). The double-tick indicator at `src/pages/Chat.tsx:471` is therefore unreliable. Track as **S-MSG-READS**.

`offset` pagination is unstable under concurrent inserts; the intended replacement is a keyset cursor (`DATA_MODEL.md` §6.2) — a **breaking** input change.

### 2.9 `message.send`

| | |
|---|---|
| Type | **mutation** · **Auth** authed · **Defined** `api/message-router.ts:85` |

```ts
// Input (:87-93)
z.object({
  conversationId: z.number(),
  content: z.string().min(1).max(4000),
  type: z.enum(["text", "image", "file"]).default("text"),
  fileUrl: z.string().optional(),
  replyToId: z.number().optional(),
})
```

```ts
// Output (:124-132)
{ id: number; conversationId: number; senderId: number;
  content: string; type: "text" | "image" | "file";
  createdAt: Date;      // JS-side new Date(), NOT the value MySQL stored
  isMine: true }
```

| Aspect | Detail |
|---|---|
| Membership check | `:100-109`; failure → `throw new Error("You are not a participant in this conversation")` (`:112`) → tRPC classifies it as **`INTERNAL_SERVER_ERROR` (500)** with the message preserved, not `FORBIDDEN` |
| Socket events | **NONE.** `api/message-router.ts` does not import `api/socket.ts` (verified). A message sent over tRPC is never broadcast — other clients see it only on refetch. **FR-MSG-SEND contract split.** |
| Client usage | **never called.** The UI sends exclusively over the socket (`src/pages/Chat.tsx:157`). |
| `createdAt` fidelity | client-generated; may disagree with the stored `messages.createdAt` by the round-trip latency |
| Output shape | omits `fileUrl`, `replyToId`, `isEdited` — differs from both `listByConversation` and the socket `newMessage` payload |

### 2.10 `message.markAsRead`

| | |
|---|---|
| Type | **mutation** · **Auth** authed · **Defined** `api/message-router.ts:135` |

```ts
// Input (:136)
z.object({ messageIds: z.array(z.number()) })
```

```ts
// Output (:155)
{ success: true }
```

Empty array short-circuits (`:141`). Inserts one row per id in a **sequential loop** with a `try/catch` labelled "Ignore duplicate errors" (`:144-153`) — no unique key exists, so no duplicate error can be raised and duplicates accumulate (`DATA_MODEL.md` §2.5). **No membership check** — any authenticated user can create a read receipt for any message id, including messages in conversations they cannot see. **NFR-SEC-IDOR.** No socket event, and **the client never calls it** (it uses the socket path instead).

### 2.11 `contact.list`

| | |
|---|---|
| Type | query · **Auth** authed · **Defined** `api/contact-router.ts:8` |
| Input | none |

```ts
// Output: Array<...>  — WHERE contacts.userId = me AND status = 'accepted' (:26-31)
{
  id: number; userId: number; contactUserId: number;
  status: "pending" | "accepted" | "blocked"; nickname: string | null; createdAt: Date;
  contactName: string | null; contactAvatar: string | null; contactEmail: string | null; // LEFT JOIN users ON contacts.contactUserId (:25)
}[]
```

The join is on `contactUserId`, so `contact*` fields describe **the other person**.

### 2.12 `contact.pending`

| | |
|---|---|
| Type | query · **Auth** authed · **Defined** `api/contact-router.ts:36` |
| Input | none |

```ts
// Output: Array<...>  — WHERE contacts.contactUserId = me AND status = 'pending' (:53-58)
{
  id: number; userId: number; contactUserId: number;
  status: "pending" | "accepted" | "blocked"; nickname: string | null; createdAt: Date;
  contactName: string | null; contactAvatar: string | null;   // LEFT JOIN users ON contacts.userId (:52)
}[]
```

Here the join is on `contacts.userId`, so `contactName`/`contactAvatar` describe **the requester**. Same field names, opposite subject, versus `contact.list` — a latent client bug and no `contactEmail` is provided. Because `contact.add` writes *both* directions as `pending` (`:89-105`), **both users see each other in `pending`**; there is no requester/receiver distinction in the data.

### 2.13 `contact.add`

| | |
|---|---|
| Type | **mutation** · **Auth** authed · **Defined** `api/contact-router.ts:63` |

```ts
// Input (:64)
z.object({ contactUserId: z.number() })
```

```ts
// Output (:107)
{ success: true }
```

| Condition | Behaviour | Line |
|---|---|---|
| `contactUserId === ctx.user.id` | `throw new Error("Cannot add yourself as a contact")` → **500** | `:69-71` |
| Forward edge already exists | `throw new Error("Contact request already exists")` → **500** | `:85-87` |
| Otherwise | insert forward `pending` (`:89`), then insert reverse `pending` with `.onDuplicateKeyUpdate({set:{status:"pending"}})` (`:96-105`) | |
| Target user existence | **not checked** | |
| Atomicity | none (two statements, no transaction) | |
| Socket events | none — the recipient sees the request only on refetch | |

The `onDuplicateKeyUpdate` compiles to genuine `ON DUPLICATE KEY UPDATE` SQL but **can never fire**: `contacts` has no unique key. Concrete failure: B adds A (rows B→A, A→B), A removes the contact (both deleted, `:148-160`), B adds A again — fine. But if B→A survives while A→B does not (possible after a partial failure), A adding B inserts a **second** B→A row, and `contact.list` renders duplicates. Fixed by UQ-3 (`DATA_MODEL.md` §3.2).

Client surfaces the raw thrown message via `toast.error(err.message)` (`src/pages/Contacts.tsx:55`).

### 2.14 `contact.accept`

| | |
|---|---|
| Type | **mutation** · **Auth** authed · **Defined** `api/contact-router.ts:110` |

```ts
// Input (:111)
z.object({ contactId: z.number() })
```

```ts
// Output (:138)
{ success: true }
```

**`contactId` is a misnomer: the value is a `users.id`, not a `contacts.id`.** The server uses it as `eq(contacts.userId, input.contactId)` (`:123`) and `eq(contacts.contactUserId, input.contactId)` (`:134`); the client passes `request.userId` (`src/pages/Contacts.tsx:349-350`). Behaviour is consistent, the name is not. Rename to `requesterUserId` — **breaking** (see §6).

Updates both directions to `accepted` (`:117-136`), non-atomically. Returns `{success:true}` even when zero rows matched, so accepting a non-existent request is indistinguishable from success. No socket event: the requester's UI does not update until refetch.

### 2.15 `contact.remove`

| | |
|---|---|
| Type | **mutation** · **Auth** authed · **Defined** `api/contact-router.ts:141` |

```ts
// Input (:142)
z.object({ contactUserId: z.number() })
```

```ts
// Output (:162)
{ success: true }
```

Hard-deletes both directed edges in one statement (`:148-160`). Also used by the UI as the "reject request" action (`src/pages/Contacts.tsx:338`). Idempotent; returns success regardless of rows affected. No socket event.

### 2.16 `contact.searchUsers`

| | |
|---|---|
| Type | query · **Auth** authed · **Defined** `api/contact-router.ts:165` |

```ts
// Input (:166)
z.object({ query: z.string().min(1) })
```

```ts
// Output (:172-177, then :187)
Array<{ id: number; name: string | null; email: string | null; avatar: string | null }>
```

`WHERE name LIKE '%q%' OR email LIKE '%q%' LIMIT 20`, then the caller's own row is filtered **in JS after the limit** (`:187`) — so a full page can silently return 19 rows. The `sql` template parameterises both patterns (verified by compiling the statement: `params: ["%bob%","%bob%"]`), so this is **not** SQL injection. It is an unindexed full scan and an **unauthenticated-by-relationship directory enumeration**: any user can page the entire user table, emails included, one character at a time, with no rate limit and no debounce (`src/pages/Contacts.tsx:43-46` fires per keystroke). **NFR-SEC-ENUM.**

### 2.17 Procedure index

| Procedure | Type | Auth | Defined | Emits socket events | Called by client |
|---|---|---|---|---|---|
| `ping` | query | public | `api/router.ts:8` | no | no (Docker healthcheck) |
| `auth.me` | query | authed | `api/auth-router.ts:4` | no | `src/hooks/useAuth.ts:4` |
| `conversation.list` | query | authed | `api/conversation-router.ts:13` | no | `src/pages/Chat.tsx:54` |
| `conversation.getById` | query | authed | `api/conversation-router.ts:106` | no | `src/pages/Chat.tsx:56` |
| `conversation.createDirect` | mutation | authed | `api/conversation-router.ts:160` | **no** | `src/pages/Contacts.tsx:74` |
| `conversation.createGroup` | mutation | authed | `api/conversation-router.ts:215` | **no** | **no** |
| `conversation.markAsRead` | mutation | authed | `api/conversation-router.ts:245` | **no** | **no** |
| `message.listByConversation` | query | authed | `api/message-router.ts:13` | no | `src/pages/Chat.tsx:62` |
| `message.send` | mutation | authed | `api/message-router.ts:85` | **no** | **no** |
| `message.markAsRead` | mutation | authed | `api/message-router.ts:135` | **no** | **no** |
| `contact.list` | query | authed | `api/contact-router.ts:8` | no | `src/pages/Contacts.tsx:39` |
| `contact.pending` | query | authed | `api/contact-router.ts:36` | no | `src/pages/Contacts.tsx:41` |
| `contact.add` | mutation | authed | `api/contact-router.ts:63` | **no** | `src/pages/Contacts.tsx:48` |
| `contact.accept` | mutation | authed | `api/contact-router.ts:110` | **no** | `src/pages/Contacts.tsx:59` |
| `contact.remove` | mutation | authed | `api/contact-router.ts:141` | **no** | `src/pages/Contacts.tsx:67` |
| `contact.searchUsers` | query | authed | `api/contact-router.ts:165` | no | `src/pages/Contacts.tsx:43` |

**No tRPC procedure emits a single socket event.** Real-time delivery exists only on the socket write path (§3).

---

## 3. Socket.IO contract

### 3.1 Server configuration

```ts
// api/socket.ts:22-28
io = new SocketIOServer(server, {
  cors: {
    origin: process.env.NODE_ENV === "production" ? false : "http://localhost:3000",
    credentials: true,
  },
  path: "/socket.io",
});
```

| Property | Value | Consequence |
|---|---|---|
| Path | `/socket.io` | Proxied in dev by `vite.config.ts:21-25` with `ws: true` |
| CORS origin (prod) | `false` | Cross-origin clients are rejected; same-origin only. A split client/API deployment breaks. |
| CORS origin (dev) | `http://localhost:3000` | Matches `CLIENT_PORT` (`contracts/constants.ts:17`) |
| Adapter | **default in-memory** | Rooms and presence are per-process; **more than one app instance breaks fan-out entirely**. **NFR-SCALE-ADAPTER:** requires `@socket.io/redis-adapter` before horizontal scaling. |
| Transports (client) | `["websocket","polling"]`, `autoConnect: true`, **no `withCredentials`** | `src/hooks/useSocket.ts:42-46`. Fine same-origin; cookies would not be sent cross-origin. |

### 3.2 Handshake authentication

```ts
// api/socket.ts:30-39
io.use(async (socket, next) => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(socket.handshake.headers)) {
    if (typeof value === "string") headers.set(key, value);
  }
  const user = await authenticateRequest(headers);
  if (!user) return next(new Error("Unauthorized"));
  socket.data.userId = user.id;
  next();
});
```

| Aspect | Detail |
|---|---|
| Credential | the same `alice_session` cookie, read from the handshake headers |
| Failure | `next(new Error("Unauthorized"))` → the client receives a `connect_error` event with `message: "Unauthorized"` |
| Identity | `socket.data.userId` only — never trusted from the payload |
| Array-valued headers | dropped by the `typeof value === "string"` guard (`:33`); `cookie` is a single-value header in practice, so this does not affect auth |
| Re-validation | **none.** The session is checked once at handshake; an expired or revoked session keeps a long-lived socket alive indefinitely. **NFR-SEC-SOCKET-TTL.** |

### 3.3 Client → server events

All handlers destructure raw parameters with TypeScript annotations and **no runtime validation** — there is no Zod schema, no type guard, and no length or range check on any socket payload (verified across `api/socket.ts:66, 71, 76-85, 155-157, 188-190`). TypeScript types are erased at runtime; a malicious client may send anything.

| Event | Payload (declared TS type) | Runtime validation | Auth / membership precondition | Effect | Line |
|---|---|---|---|---|---|
| `joinConversation` | `{ conversationId: number }` | **none** | handshake auth **+** membership `SELECT` (`:56-63`) | joins room `conv_{conversationId}`; silently no-ops if not a member | `:66-68` |
| `leaveConversation` | `{ conversationId: number }` | **none** | handshake auth only — **no membership check** | leaves room `conv_{conversationId}` | `:71-73` |
| `sendMessage` | `{ conversationId: number; content: string; type?: string; fileUrl?: string; replyToId?: number; tempId?: string }` | **none** — `content` length unbounded, `type` cast to the enum without checking (`:111`), `replyToId` not verified to exist or to belong to the conversation | handshake auth **+** membership `SELECT` (`:93-102`) | inserts a `messages` row, re-reads it, emits `newMessage` to `conv_{id}` and `conversationUpdated` to each `user_{participantId}` | `:76-152` |
| `markAsRead` | `{ messageIds: number[]; conversationId: number }` | **none** — array length unbounded | handshake auth **+** membership on `conversationId` (`:161`). **The message ids themselves are never checked against the conversation**, so a member of conversation X can mark messages of conversation Y as read | one insert per id, then emits `messagesRead` to `conv_{conversationId}` excluding self | `:155-185` |
| `typing` | `{ conversationId: number; isTyping: boolean }` | **none** | handshake auth **+** membership `SELECT` on **every event** (`:191`) | emits `userTyping` to `conv_{id}` excluding self | `:188-198` |
| `disconnect` | — (Socket.IO built-in) | — | — | removes the socket from the presence map; on last socket, broadcasts `userOffline` | `:201-209` |

**`join` does not exist.** `info.md:27` documents a client→server `join` event and `src/hooks/useSocket.ts:55-57` exposes a `join(userId)` helper (called at `src/pages/Chat.tsx:71`), but that helper only calls `socket.connect()` — **no `join` handler is registered on the server**. The `user_{id}` room is joined automatically at connection time (`api/socket.ts:49`). Documentation defect: **H-DOC-JOIN**.

### 3.4 Server → client events

| Event | Payload (as emitted) | Target | Trigger | Line |
|---|---|---|---|---|
| `onlineUsers` | `number[]` — **every** online user id, process-wide, including self | the connecting socket only (`socket.emit`) | connection established | `:54` |
| `userOnline` | `{ userId: number }` | **global broadcast** (`socket.broadcast.emit`, all sockets except the newly connected one) | user's socket count 0 → 1 | `:51-53` |
| `userOffline` | `{ userId: number }` | **global broadcast** | user's socket count → 0 | `:204-207` |
| `newMessage` | full `messages` row **plus** `tempId?: string` — `{ id, conversationId, senderId, content, type, fileUrl, replyToId, isEdited, createdAt, updatedAt, tempId? }` | room `conv_{conversationId}` (**including the sender**) | successful socket `sendMessage` | `:127-130` |
| `conversationUpdated` | `{ conversationId: number; lastMessage: <full messages row> }` | room `user_{participantId}`, once per participant | successful socket `sendMessage` | `:141-144` |
| `messagesRead` | `{ messageIds: number[]; userId: number }` | room `conv_{conversationId}`, **excluding** the reader (`socket.to`) | socket `markAsRead` | `:177-180` |
| `userTyping` | `{ userId: number; conversationId: number; isTyping: boolean }` | room `conv_{conversationId}`, **excluding** the typist | socket `typing` | `:192-196` |
| `messageError` | `{ error: "Failed to send message" }` | the originating socket only | exception inside the `sendMessage` handler | `:147-150` |

The client's `ServerToClientEvents` interface (`src/hooks/useSocket.ts:5-21`) declares `newMessage` as `Message & { tempId?: string }`, which matches the emitted full row (`db/schema.ts:78`). Because `superjson` is **not** used on the socket transport, `createdAt`/`updatedAt` arrive as **ISO strings, not `Date`s**, while the same fields arrive as `Date` over tRPC. The client already compensates by wrapping in `new Date(...)` (`src/pages/Chat.tsx:280`, `:467`), but the declared type is wrong. **H-SOCKET-DATE.**

### 3.5 Emission-target summary

| Room | Format | Joined at | Emitted to |
|---|---|---|---|
| Per-user | `user_{userId}` | automatically on connection, `api/socket.ts:49` | `conversationUpdated` |
| Per-conversation | `conv_{conversationId}` | on `joinConversation` after a membership check, `api/socket.ts:67` | `newMessage`, `messagesRead`, `userTyping` |
| Global broadcast | — | — | `userOnline`, `userOffline` |
| Single socket | — | — | `onlineUsers`, `messageError` |

---

## 4. Room and presence model

### 4.1 Rooms

| Room | Lifecycle |
|---|---|
| `user_{userId}` | Joined once per socket, immediately after handshake auth (`api/socket.ts:49`). Never explicitly left; Socket.IO removes the socket on disconnect. With N tabs open, N sockets are in the room, so a `conversationUpdated` emit reaches every tab. |
| `conv_{conversationId}` | Joined only via `joinConversation`, gated on a live membership query (`api/socket.ts:66-68`). Left via `leaveConversation` with **no** check (`:71-73`). Client joins on conversation selection and leaves in the effect cleanup (`src/pages/Chat.tsx:70-74`). |

**Membership is not re-checked after joining.** If a user is removed from a conversation (no such feature exists yet), their socket stays in the room and continues to receive `newMessage`. Once membership removal ships, `conv_*` rooms must be invalidated server-side.

### 4.2 Presence map

```ts
// api/socket.ts:11
const onlineUsers = new Map<number, Set<string>>();   // userId -> set of socket ids
```

| Transition | Rule | Line |
|---|---|---|
| Connect | `sockets = onlineUsers.get(userId) ?? new Set()`; `wasOffline = sockets.size === 0`; `sockets.add(socket.id)`; `onlineUsers.set(userId, sockets)` | `:45-48` |
| → online | emit `userOnline` **only if** `wasOffline` (0 → 1 sockets) | `:51-53` |
| Snapshot | `socket.emit("onlineUsers", Array.from(onlineUsers.keys()))` — sent **only** to the socket that just connected, after it was added, so the list includes self | `:54` |
| Disconnect | `userSockets?.delete(socket.id)` | `:202-203` |
| → offline | if the set is now empty: `onlineUsers.delete(userId)` and broadcast `userOffline` | `:204-207` |

Multi-tab is handled correctly: closing one of two tabs emits nothing; closing the last emits `userOffline` exactly once.

| Property | Status |
|---|---|
| Durability | In-process memory. A restart wipes presence; clients keep the stale set until they reconnect and receive a fresh `onlineUsers`. |
| Multi-instance | **Broken.** Each instance has its own map and its own default adapter — users on instance A are invisible to instance B. **NFR-SCALE-PRESENCE.** |
| Scoping | **None.** Every authenticated user receives the full online roster and every online/offline transition for every other user, regardless of contact or conversation relationship. This is a social-graph and activity leak. **NFR-SEC-PRESENCE:** scope emissions to `user_*` rooms of accepted contacts and co-participants. |
| Heartbeat | Socket.IO's default `pingInterval` 25 s / `pingTimeout` 20 s. No application-level liveness. |
| Accessor | `getOnlineUsers()` (`api/socket.ts:17`) returns a deep copy but **is never imported anywhere** — dead code. |

### 4.3 Typing indicator

`typing` is relayed verbatim to `conv_{id}` excluding the sender (`api/socket.ts:192-196`); the client adds/removes the user id from a `Set` (`src/pages/Chat.tsx:103-115`). There is **no server-side expiry and no client-side timeout**: if a client sends `isTyping: true` and then disconnects, navigates away, or crashes, the other participants' indicators stick until they change conversation. Each event also costs a membership `SELECT` on an unindexed table (`api/socket.ts:191`), and the client emits on **every keystroke** with no debounce (`src/pages/Chat.tsx:176-184`). **F-PRES-TYPING-TTL** (server-side TTL + client debounce).

---

## 5. Error taxonomy

### 5.1 tRPC error shape

No `errorFormatter` is configured (`api/middleware.ts:5`), so tRPC's default shape applies:

```jsonc
{
  "error": {
    "message": "…",          // TRPCError.message, or the original Error's message for unknown throws
    "code": -32001,           // JSON-RPC code
    "data": {
      "code": "UNAUTHORIZED", // string key
      "httpStatus": 401,
      "path": "auth.me",
      "stack": "…"            // present only when config.isDev (NODE_ENV !== "production")
    }
  }
}
```

### 5.2 Codes actually reachable

| Code | JSON-RPC | HTTP | Raised by |
|---|---|---|---|
| `UNAUTHORIZED` | `-32001` | 401 | `authedQuery` when `ctx.user` is absent — `api/middleware.ts:10` |
| `BAD_REQUEST` | `-32600` | 400 | Zod input parse failure on any procedure with an `.input()` schema |
| `INTERNAL_SERVER_ERROR` | `-32603` | 500 | Every bare `throw new Error(...)`: `api/message-router.ts:112`, `api/contact-router.ts:70`, `api/contact-router.ts:86`; plus any `mysql2` driver error |
| `NOT_FOUND` | `-32004` | 404 | Unknown procedure path |

`getTRPCErrorFromUnknown` wraps a non-`TRPCError` throw as `new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause })`, and `TRPCError`'s constructor falls back to `cause.message`. **The original message therefore reaches the client verbatim** — `"You are not a participant in this conversation"` is delivered as a 500 whose body contains that string, and in non-production the stack trace is attached too.

**Codes that should be used but are not:** `FORBIDDEN` (403) for membership failures, `CONFLICT` (409) for duplicate contact requests, `NOT_FOUND` (404) for missing conversations, `TOO_MANY_REQUESTS` (429) — no rate limiting exists anywhere in `api/` (verified by grep). Track as **S-ERR-CODES**.

### 5.3 Non-tRPC HTTP errors

| Endpoint | Failure | Response |
|---|---|---|
| `/api/oauth/callback` | missing code / exchange failure / userinfo failure | `400 {"error": "…"}` — `api/kimi/auth.ts:30, 53, 69` |
| `/api/oauth/callback` | user upsert miss | `500 {"error":"Failed to create user"}` — `:86` |
| `/api/oauth/callback` | any throw | `500 {"error":"Authentication failed"}` — `:107` |
| `/api/*` unmatched | — | `404 {"error":"Not Found"}` — `api/boot.ts:31` |

These use a bare `{error}` envelope, unrelated to both the tRPC envelope and the unused `createErrorResponse` helper in `api/lib/http.ts:17` (dead code, imported nowhere).

### 5.4 Socket error channel

| Channel | Payload | When |
|---|---|---|
| `connect_error` (Socket.IO built-in) | `Error("Unauthorized")` | handshake auth failure — `api/socket.ts:36` |
| `messageError` | `{ error: "Failed to send message" }` | exception in the `sendMessage` handler — `api/socket.ts:149` |
| *(silent)* | — | `markAsRead` failures are `console.error`'d only (`api/socket.ts:182`); `joinConversation`, `leaveConversation`, `typing` have no error path at all |
| *(silent)* | — | `sendMessage` by a non-member returns early with **no** emission (`api/socket.ts:104`) — the sender sees nothing happen |

### 5.5 Client-side handling (current)

| Path | Handling | Defect |
|---|---|---|
| `auth.me` | `retry: false`; falsy `user` renders the sign-in screen (`src/components/AuthLayout.tsx:14`) | A 500 or a network blip is presented as "signed out" |
| `contact.add` | `toast.error(err.message)` (`src/pages/Contacts.tsx:55`) | Displays a raw server error string to the end user |
| `contact.accept` / `remove` | `onSuccess` only (`:59-72`) | Failures are silent |
| `conversation.createDirect` | `onSuccess` only (`:74-84`) | Failures are silent |
| `messageError` | **not subscribed.** `useSocket` declares the event (`src/hooks/useSocket.ts:20`) but exposes no `onMessageError` helper, and `Chat.tsx` never listens | A failed send is completely invisible; the textarea is cleared regardless (`src/pages/Chat.tsx:163`), so the message is lost |
| `messagesRead` | `onMessagesRead` exists (`src/hooks/useSocket.ts:105-113`) but **`Chat.tsx` never calls it** | Read receipts never update live; only a refetch changes the ticks |
| `connect_error` | not handled anywhere | An unauthenticated socket retries silently forever |

**Required client contract (S-CLIENT-ERR):** subscribe to `messageError` and `connect_error`; keep unsent text on failure; distinguish 401 from 5xx before showing the sign-in screen.

---

## 6. Contract stability rules

### 6.1 What is a breaking change

**Breaking — requires a coordinated client release and a deprecation window:**

| Category | Examples |
|---|---|
| Renaming or removing a procedure | `message.listByConversation` → `message.list`; `contact.searchUsers` → `contact.search` |
| Renaming an input field | `contact.accept.contactId` → `requesterUserId` (§2.14) |
| Adding a required input field | any new non-`.optional()`, non-`.default()` key |
| Narrowing an input | lowering `content.max(4000)`; raising `query.min(1)` to `min(3)` |
| Removing or renaming an output field | dropping `latestMessage`; renaming `displayName` |
| Changing an output type | `offset` → `cursor` pagination (`DATA_MODEL.md` §6.2) changes both input and output |
| Changing enum members | adding a member to `messages.type` breaks exhaustive client switches |
| Renaming a socket event | any key in `ServerToClientEvents` / `ClientToServerEvents` (`src/hooks/useSocket.ts:5-36`) |
| Changing a socket payload's shape | removing `tempId` from `newMessage` |
| Changing room naming | `conv_{id}` / `user_{id}` |
| Changing the error code for an existing condition | 500 → 403 for "not a participant" **is** breaking for any client that branches on `httpStatus`; it is nevertheless required (**S-ERR-CODES**) and must ship in a single coordinated release |

**Non-breaking — may ship server-first:**

- Adding a new procedure or a new socket event.
- Adding an **optional** input field (`.optional()` or `.default()`).
- Adding a new field to an output object (clients ignore unknown keys; tRPC does not strip them).
- Adding an enum member to an **input** enum (widening what is accepted).
- Adding an index, transaction, or query rewrite that does not alter results.
- Tightening authorisation where the previous behaviour was a bug — but log before enforcing.

### 6.2 Versioning policy

| Rule | Statement |
|---|---|
| **Single version, type-coupled** | The client imports `AppRouter` directly from server source (`src/providers/trpc.tsx:6` → `../../api/router`). Client and server are compiled from one tree and deployed as one artefact (`Dockerfile`), so there is no independent versioning today. This is acceptable **only** while the web client is the sole consumer. |
| **On introducing a second consumer** (mobile, third-party) | Freeze the current surface as `v1`, mount future routers under an explicit namespace, and publish the router types as a versioned package. Do not silently reshape procedures once a client you do not deploy exists. |
| **Additive-first** | Prefer a new procedure (`message.listPaged`) over changing an existing one. Run both, migrate the client, then delete the old one in a later release. |
| **Deprecation window** | Minimum one release with the old surface live and instrumented. A procedure may be deleted only after its call count is zero for a full window. Requires request logging, which does not exist yet — **NFR-OPS-TELEMETRY.** |
| **Socket events are append-only** | Never repurpose an event name. New payload data goes in a new **optional** field or a new event. Clients must ignore unknown events (Socket.IO does this by default) and unknown fields. |
| **Contract tests** | Every procedure gets an input/output snapshot test. The suite currently contains exactly one test file (`api/kimi/session.test.ts`, 1 test) — no router or socket coverage at all. **S-TEST-CONTRACT.** |
| **Schema/API co-evolution** | Any procedure change that requires a schema change references its migration id from `DATA_MODEL.md` §4.4 in the PR description. |

---

## 7. Contract gaps

### 7.1 Client/server disagreements

| # | Gap | Evidence | Severity |
|---|---|---|---|
| G-1 | **tRPC writes are invisible in real time.** `message.send`, `conversation.createDirect`, `createGroup`, `contact.add`, `contact.accept`, `contact.remove` emit **no** socket events. Real-time delivery exists only via socket `sendMessage`. | `api/message-router.ts` and `api/contact-router.ts` never import `api/socket.ts` | High |
| G-2 | **Dual write paths with different validation.** tRPC `message.send` enforces `content.max(4000)` and a strict `type` enum (`api/message-router.ts:89-90`); socket `sendMessage` enforces neither (`api/socket.ts:78-85, 111`). The client uses only the socket path (`src/pages/Chat.tsx:157`), so **the stricter validation is never exercised in production**. | as cited | High |
| G-3 | **`readBy` is wrong.** `messageId IN (?)` bound to a joined string returns receipts for the first id only. | `api/message-router.ts:68`; compiled SQL in `DATA_MODEL.md` §6.3 | High |
| G-4 | **`messagesRead` is never consumed.** The helper exists but `Chat.tsx` never subscribes. | `src/hooks/useSocket.ts:105-113`; absent from `src/pages/Chat.tsx` | Medium |
| G-5 | **`messageError` is never consumed** and has no subscription helper; the input box is cleared before any confirmation. | `src/hooks/useSocket.ts:20`; `src/pages/Chat.tsx:157-163` | High |
| G-6 | **`tempId` is emitted but unused.** The server echoes `tempId` on `newMessage` (`api/socket.ts:129`) for optimistic reconciliation; the client does no optimistic insert and instead calls `refetchMessages()` (`src/pages/Chat.tsx:82`). Every inbound message triggers a full history refetch. | as cited | Medium |
| G-7 | **`join` documented but nonexistent.** `info.md:27` and `useSocket.join()` imply a server handler; none is registered. | `info.md:27`, `src/hooks/useSocket.ts:55-57`, `src/pages/Chat.tsx:71` | Low |
| G-8 | **Date type mismatch.** tRPC delivers `Date` (superjson); the socket delivers ISO strings, but `ServerToClientEvents.newMessage` is typed `Message` (with `Date` fields). | `src/hooks/useSocket.ts:6` vs `api/socket.ts:127` | Medium |
| G-9 | **`conversation.getById` / `message.listByConversation` return `null` / `[]` for permission failures**, while `message.send` throws a 500 for the identical condition. | `api/conversation-router.ts:124`, `api/message-router.ts:37` vs `:112` | Medium |
| G-10 | **`contact.accept.contactId` is a user id, not a contact id.** | `api/contact-router.ts:111, 123` vs `src/pages/Contacts.tsx:349` | Low (naming) |
| G-11 | **`contact.list` and `contact.pending` reuse `contactName`/`contactAvatar` for different subjects** (the other party vs the requester), and `pending` omits `contactEmail`. | `api/contact-router.ts:25` vs `:52` | Medium |
| G-12 | **`createDirect` returns two different shapes.** | `api/conversation-router.ts:196` vs `:212` | Medium |
| G-13 | **Docs contradict the implementation.** `README.md:13`, `README.md:20` and `info.md:12` all claim "JWT sessions"; the implementation is an HMAC-SHA256-signed base64url envelope (`api/kimi/session.ts:23-38`). The env var is named `JWT_SECRET` (`api/lib/env.ts:8`) but is used as an HMAC key. `README.md:42` tells developers to run `db:push`, contradicting the migration workflow in `drizzle.config.ts:6-9`. | as cited | Medium |

### 7.2 Unvalidated socket payloads (confirmed)

**Confirmed: no socket handler performs any runtime validation.** All five handlers destructure parameters typed only by TypeScript annotations, which are erased at runtime.

| Handler | Declared type | Actually enforced at runtime |
|---|---|---|
| `joinConversation` (`:66`) | `{ conversationId: number }` | nothing — a non-numeric value flows into a Drizzle `eq()` and is sent to MySQL as a bound parameter |
| `leaveConversation` (`:71`) | `{ conversationId: number }` | nothing; also no membership check |
| `sendMessage` (`:78-85`) | `{ conversationId; content; type?; fileUrl?; replyToId?; tempId? }` | nothing. `content` has **no length cap** (the 4000-char rule lives only in the unused tRPC path); `type` is cast (`:111`) so an out-of-enum value reaches MySQL and fails at insert time in strict mode, surfacing as a generic `messageError`; `fileUrl` is an unvalidated arbitrary string; `replyToId` is not checked to exist or to belong to the conversation |
| `markAsRead` (`:157`) | `{ messageIds: number[]; conversationId: number }` | only `data.messageIds.length` truthiness (`:160`). Array size unbounded → an N-element array becomes N sequential inserts. Ids are never checked against `conversationId` |
| `typing` (`:190`) | `{ conversationId: number; isTyping: boolean }` | nothing |

**Required (S-SOCKET-ZOD):** define Zod schemas mirroring the tRPC input schemas, parse at the top of every handler, and emit a typed `validationError` on failure. Shared schemas belong in `contracts/` so both transports use one definition — the module already exists for exactly this purpose (`contracts/constants.ts`).

### 7.3 Missing rate limiting

**Confirmed: no rate limiting exists anywhere.** A repo-wide grep for `ratelimit|rate-limit|helmet|csrf` matches nothing in `api/`, `src/`, or `contracts/`; the only CORS configuration is the Socket.IO block at `api/socket.ts:23`.

| Surface | Abuse | Cost per request |
|---|---|---|
| socket `sendMessage` | unbounded message flood | 2 DB writes + 1 read + fan-out to every participant room |
| socket `typing` | per-keystroke flood | 1 unindexed membership `SELECT` (full table scan) + room broadcast |
| socket `markAsRead` | huge `messageIds` array | N sequential inserts, unbounded |
| socket connections | many concurrent sockets per user | unbounded entries in the presence `Set` |
| `contact.searchUsers` | directory enumeration | full `users` scan per keystroke |
| `contact.add` | request spam | 2 inserts, no cap on outstanding requests |
| `/api/oauth/callback` | code-replay attempts | 2 outbound HTTP calls to the provider per request |
| `/api/trpc/*` | 50 MiB body limit (`api/boot.ts:17`) with no per-IP throttle | parse cost |

**Required (S-SEC-RATELIMIT):** per-user token buckets on the socket handlers (send, typing, markAsRead), per-IP limits on `/api/oauth/callback`, per-user limits on `contact.searchUsers` and `contact.add`, a cap on concurrent sockets per user, and a `TOO_MANY_REQUESTS` (429) tRPC code plus a `rateLimited` socket event added to the contract.

### 7.4 Other contract-adjacent defects

| # | Defect | Evidence |
|---|---|---|
| G-14 | **IDOR on `message.markAsRead`** — no membership check; any authenticated user can write receipts for arbitrary message ids | `api/message-router.ts:135-156` |
| G-15 | **Cross-conversation read receipts over the socket** — membership is checked on `conversationId`, but `messageIds` are never verified to belong to it | `api/socket.ts:155-180` |
| G-16 | **Presence broadcast to everyone** — full online roster and every transition leak to all users | `api/socket.ts:52, 54, 206` |
| G-17 | **No OAuth `state` / PKCE** | `src/pages/Login.tsx:7`, `api/kimi/auth.ts:24-56` |
| G-18 | **Session cookie has no `Secure` flag**, and the helper that would add it is dead code | `api/kimi/auth.ts:102`; `api/kimi/session.ts:40`, `api/lib/cookies.ts:4` |
| G-19 | **No session revocation** — logout clears the cookie only | `api/boot.ts:19-22`, `api/kimi/session.ts:28-38` |
| G-20 | **No socket re-authentication** after handshake | `api/socket.ts:30-39` |
| G-21 | **Socket.IO default in-memory adapter** — rooms and presence do not survive more than one instance | `api/socket.ts:22-28` |
| G-22 | **Dead modules on the API surface:** `api/lib/http.ts` (entire file), `api/lib/cookies.ts` (entire file), `api/kimi/platform.ts` (entire file), `getSessionCookieOptions` (`api/kimi/session.ts:40`), `getIO`/`getOnlineUsers` (`api/socket.ts:13, 17`), `isProduction`/`getPort`/`getOwnerUnionId` (`api/lib/env.ts:15, 17, 21`) — all defined, none imported anywhere | repo-wide grep |
| G-23 | **`users.role` and `OWNER_UNION_ID` are never read** — there is no admin authorisation path despite the enum and env var | `db/schema.ts:20`, `api/lib/env.ts:11` |
| G-24 | **No request logging or tracing** on either transport; only `console.log` on socket connect/disconnect (`api/socket.ts:42, 208`) and `console.error` in catch blocks | `api/` |
| G-25 | **Test coverage of the contract is zero** — the only test file is `api/kimi/session.test.ts` (one test, session signing) | `vitest.config.ts:18`, `api/kimi/session.test.ts` |
