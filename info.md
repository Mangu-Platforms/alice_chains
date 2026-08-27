# Alice Chains - Development Notes

## Project Setup

This project was built using the webapp-building and backend-building skills.

### Key Architecture Decisions

- **Socket.IO for real-time**: Used Socket.IO with room-based broadcasting for real-time messaging. Each conversation is a room, and users join their own rooms for direct notifications.
- **tRPC for API**: All CRUD operations go through tRPC routers with Zod validation for end-to-end type safety.
- **Drizzle ORM**: Type-safe database queries with MySQL.
- **OAuth 2.0**: Authentication via Kimi OAuth (with `state` and PKCE S256). Sessions are HMAC-SHA256 signed cookies backed by a server-side session store — not JWTs, despite the historical `JWT_SECRET` variable name (renamed to `SESSION_SECRET` in H-7; the old name still works, deprecated).

### Database Schema

The database has 6 tables:
1. `users` - Managed by auth system
2. `conversations` - Direct and group chats
3. `conversation_participants` - Many-to-many relationship
4. `messages` - Chat messages with types (text/image/file)
5. `message_reads` - Read receipts
6. `contacts` - Friend relationships

### Socket Events

**Client -> Server:**
- `join` - User connects and provides their userId
- `joinConversation` - User enters a conversation room
- `sendMessage` - Send a new message
- `markAsRead` - Mark messages as read
- `typing` - Typing indicator

**Server -> Client:**
- `newMessage` - New message received
- `conversationUpdated` - Conversation list needs refresh
- `messagesRead` - Messages were read by someone
- `userTyping` - Someone is typing
- `userOnline`/`userOffline` - Presence updates

### Development

```bash
npm run dev       # Start dev server (client + server)
npm run build     # Build for production
npm start         # Start production server
npm run check     # Type check
npm run db:push   # Push schema to database
```
