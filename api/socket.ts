import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { TRPCError } from "@trpc/server";
import { notifyNewMessage } from "./lib/push/notify";
import { getDb } from "./queries/connection";
import { insertMessage } from "./queries/messages";
import { messageReads, conversationParticipants, conversations, users } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { authenticateRequest } from "./kimi/auth";
import { getSessionToken, verifySessionToken } from "./kimi/session";
import {
  blockedWith,
  isBlockedInConversation,
  isParticipant,
  messagesBelongToConversation,
  relatedUserIds,
} from "./lib/authz";
import { MAX_READ_RECEIPT_BATCH, SOCKET_SESSION_RECHECK_MS } from "@contracts/constants";
import {
  consume,
  Limits,
  SOCKET_CONNECTION_LIMITS,
  startRateLimitSweep,
} from "./lib/rate-limit";

let io: SocketIOServer | null = null;
let sessionRecheckTimer: ReturnType<typeof setInterval> | null = null;

/** Concurrent sockets per remote address, for the S-13 handshake cap. */
const connectionsByIp = new Map<string, number>();

// Track online users
const onlineUsers = new Map<number, Set<string>>();

export function getIO() {
  return io;
}

export function getOnlineUsers() {
  return new Map(Array.from(onlineUsers, ([id, sockets]) => [id, new Set(sockets)]));
}

/**
 * Disconnect every socket whose session is no longer valid.
 *
 * Exported so a test can drive one sweep directly rather than waiting out
 * SOCKET_SESSION_RECHECK_MS.
 */
export async function revalidateSockets(server: SocketIOServer): Promise<number> {
  const open = await server.fetchSockets();
  let dropped = 0;

  for (const socket of open) {
    const token = socket.data.sessionToken as string | undefined;
    const stillValid = token ? Boolean(await verifySessionToken(token)) : false;
    if (stillValid) continue;

    // Tell the client why before cutting it off, so it can show "signed out"
    // rather than a bare reconnect loop.
    socket.emit("sessionExpired");
    socket.disconnect(true);
    dropped += 1;
  }

  return dropped;
}

/**
 * Tell exactly the people related to `userId` that their state changed.
 *
 * Emitting into each recipient's own `user_{id}` room rather than broadcasting
 * means an unrelated member never sees the event at all — the fan-out is the
 * authorization.
 */
function announcePresence(
  userId: number,
  audience: Iterable<number>,
  event: "userOnline" | "userOffline"
) {
  for (const recipientId of audience) {
    io?.to(`user_${recipientId}`).emit(event, { userId });
  }
}

export function initSocket(server: HttpServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : "http://localhost:3000",
      credentials: true,
    },
    path: "/socket.io",
    // SEC-C-14. A frame larger than this is refused by the transport, before
    // any handler sees it. The 4000-character message cap is enforced in
    // S-14's payload schemas; this is the floor beneath it.
    maxHttpBufferSize: 128 * 1024,
    // Drop a connection that stops answering rather than holding it open.
    pingTimeout: 20_000,
    pingInterval: 25_000,
  });

  io.use(async (socket, next) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(socket.handshake.headers)) {
      if (typeof value === "string") headers.set(key, value);
    }
    const user = await authenticateRequest(headers);
    if (!user) return next(new Error("Unauthorized"));
    socket.data.userId = user.id;
    // Kept so the connection can be re-checked while it is open. A socket used
    // to be authorized once at handshake and then trusted for its whole life,
    // so a session revoked at logout left every open socket alive (SEC-C-29).
    socket.data.sessionToken = getSessionToken(headers);

    // S-13 / SEC-C-14. Concurrent connection caps, checked at the handshake.
    // Without them one client can open sockets until the process runs out of
    // file descriptors, and the per-user Set below grows without bound.
    const address = socket.handshake.address;
    if ((onlineUsers.get(user.id)?.size ?? 0) >= SOCKET_CONNECTION_LIMITS.perUser) {
      return next(new Error("Too many connections for this account"));
    }
    if ((connectionsByIp.get(address) ?? 0) >= SOCKET_CONNECTION_LIMITS.perIp) {
      return next(new Error("Too many connections from this address"));
    }

    socket.data.address = address;
    next();
  });

  startRateLimitSweep();

  sessionRecheckTimer = setInterval(() => {
    void revalidateSockets(io!);
  }, SOCKET_SESSION_RECHECK_MS);
  // Node should not stay alive purely to run this sweep.
  sessionRecheckTimer.unref?.();

  io.on("connection", (socket: Socket) => {
    console.log("Socket connected:", socket.id);

    const userId = socket.data.userId as number;
    const sockets = onlineUsers.get(userId) ?? new Set<string>();
    const wasOffline = sockets.size === 0;
    sockets.add(socket.id);
    onlineUsers.set(userId, sockets);
    socket.join(`user_${userId}`);

    const address = (socket.data.address as string) ?? socket.handshake.address;
    connectionsByIp.set(address, (connectionsByIp.get(address) ?? 0) + 1);

    // S-10. Presence was `socket.broadcast.emit`, so every signed-in member
    // learned every other member's online state, and each new socket was handed
    // the complete list of who was online. Both are now scoped to people the
    // member actually has a relationship with.
    void (async () => {
      try {
        const related = await relatedUserIds(userId);

        socket.emit(
          "onlineUsers",
          Array.from(onlineUsers.keys()).filter((id) => related.has(id))
        );

        if (wasOffline) {
          announcePresence(userId, related, "userOnline");
        }
      } catch (error) {
        console.error("Error scoping presence:", error);
      }
    })();

    // Membership is asked of the shared predicate in api/lib/authz.ts so the
    // socket and tRPC doors can never drift apart (BUILD_PLAN S-8).
    const isMember = (conversationId: number) => isParticipant(userId, conversationId);

    // Join a conversation room
    socket.on("joinConversation", async ({ conversationId }: { conversationId: number }) => {
      // Silent drop: joining is idempotent and a refused join is not something
      // a member did wrong.
      if (!consume("socket.join", userId, Limits.joinConversation).allowed) return;
      if (await isMember(conversationId)) socket.join(`conv_${conversationId}`);
    });

    // Leave a conversation room
    socket.on("leaveConversation", ({ conversationId }: { conversationId: number }) => {
      socket.leave(`conv_${conversationId}`);
    });

    // Send a message
    socket.on(
      "sendMessage",
      async (data: {
        conversationId: number;
        content: string;
        type?: string;
        fileUrl?: string;
        replyToId?: number;
        tempId?: string;
      }) => {
        try {
          const userId = socket.data.userId;
          if (!userId) return;

          // S-13. Two buckets: one bounds a member's total send rate, the
          // other stops one conversation being flooded. Unlike typing, a
          // refused send is reported — the member needs to know it did not go.
          const perUser = consume("socket.send", userId, Limits.messageSendPerUser);
          const perConversation = consume(
            "socket.send.conv",
            `${userId}:${data.conversationId}`,
            Limits.messageSendPerConversation
          );
          if (!perUser.allowed || !perConversation.allowed) {
            socket.emit("rateLimited", {
              event: "sendMessage",
              retryAfterMs: Math.max(perUser.retryAfterMs, perConversation.retryAfterMs),
            });
            return;
          }

          if (!(await isMember(data.conversationId))) return;

          const db = getDb();

          // F-8 / FR-MSG-19, on the door the UI actually uses. The socket has
          // no error channel, so the sender is told rather than ignored.
          if (await isBlockedInConversation(userId, data.conversationId)) {
            socket.emit("messageError", {
              error: "You cannot send messages to this conversation",
              tempId: data.tempId,
            });
            return;
          }

          // Same helper as the tRPC path: insert and bump the conversation's
          // updatedAt in one transaction (S-11).
          // FR-MSG-15 is enforced inside `insertMessage`, so both doors get
          // it. The socket has no error channel, so an invalid reply target is
          // reported back to the sender rather than thrown into the void.
          let message;
          try {
            message = await insertMessage({
              conversationId: data.conversationId,
              senderId: userId,
              content: data.content,
              type: (data.type as "text" | "image" | "file") || "text",
              fileUrl: data.fileUrl,
              replyToId: data.replyToId,
            });
          } catch (error) {
            socket.emit("messageError", {
              error:
                error instanceof TRPCError
                  ? error.message
                  : "Failed to send message",
              tempId: data.tempId,
            });
            return;
          }

          // Loaded once for the notification: the group's name and the
          // sender's, so the notification can say where to look.
          const [conversationMeta] = await getDb()
            .select({
              conversationName: conversations.name,
              isGroup: sql<boolean>`${conversations.type} = 'group'`,
              senderName: users.name,
            })
            .from(conversations)
            .leftJoin(users, eq(users.id, userId))
            .where(eq(conversations.id, data.conversationId))
            .limit(1);

          if (message) {
            // Broadcast to all participants in the conversation
            io?.to(`conv_${data.conversationId}`).emit("newMessage", {
              ...message,
              tempId: data.tempId,
            });

            // Also notify all participants directly
            const participants = await db
              .select({ userId: conversationParticipants.userId })
              .from(conversationParticipants)
              .where(
                eq(conversationParticipants.conversationId, data.conversationId)
              );

            for (const p of participants) {
              io?.to(`user_${p.userId}`).emit("conversationUpdated", {
                conversationId: data.conversationId,
                lastMessage: message,
              });
            }

            // F-6. Everyone in the conversation who is not connected right now.
            void notifyNewMessage({
              conversationId: data.conversationId,
              senderId: userId,
              senderName: conversationMeta?.senderName ?? null,
              conversationName: conversationMeta?.conversationName ?? null,
              isGroup: conversationMeta?.isGroup ?? false,
              content: data.content,
              hasAttachment: false,
            });
          }
        } catch (error) {
          console.error("Error sending message:", error);
          socket.emit("messageError", { error: "Failed to send message" });
        }
      }
    );

    // Mark messages as read
    socket.on(
      "markAsRead",
      async (data: { messageIds: number[]; conversationId: number }) => {
        try {
          const userId = socket.data.userId;
          if (!userId) return;

          // The payload arrives untyped over the wire — the TypeScript
          // annotation vanishes at compile time (S-14 adds Zod schemas for
          // every event). Guard the shape before touching it.
          const requested = Array.isArray(data?.messageIds) ? data.messageIds : [];
          const messageIds = [
            ...new Set(requested.filter((id) => Number.isInteger(id) && id > 0)),
          ];
          if (!messageIds.length || messageIds.length > MAX_READ_RECEIPT_BATCH) return;
          // Silent drop: receipts are best-effort and a missed one costs a tick.
          if (!consume("socket.read", userId, Limits.markAsRead).allowed) return;
          if (!Number.isInteger(data?.conversationId)) return;

          if (!(await isMember(data.conversationId))) return;

          // S-8. Membership alone was the whole check here, so a member of one
          // conversation could write receipts against message ids belonging to
          // a conversation they are not in. The ids must be in *this*
          // conversation.
          if (!(await messagesBelongToConversation(messageIds, data.conversationId))) return;

          // One statement rather than a loop of try/catch blocks that were
          // catching a duplicate-key error no unique key could raise. S-3 added
          // the key, so ON DUPLICATE KEY is now real.
          await getDb()
            .insert(messageReads)
            .values(messageIds.map((messageId) => ({ messageId, userId })))
            .onDuplicateKeyUpdate({ set: { readAt: sql`readAt` } });

          // Notify other participants that messages were read
          socket.to(`conv_${data.conversationId}`).emit("messagesRead", {
            messageIds,
            userId,
          });
        } catch (error) {
          console.error("Error marking as read:", error);
        }
      }
    );

    // Typing indicator
    socket.on(
      "typing",
      async (data: { conversationId: number; isTyping: boolean }) => {
        if (!Number.isInteger(data?.conversationId)) return;
        // Silent drop, never an error: typing is cosmetic, and telling someone
        // their keystroke was rate-limited is worse than dropping it.
        if (
          !consume("socket.typing", `${userId}:${data.conversationId}`, Limits.typing)
            .allowed
        ) {
          return;
        }
        if (!(await isMember(data.conversationId))) return;

        // F-8. Emitting to the conversation room would reach a member who has
        // blocked the typist, and a room cannot exclude one recipient. Fanning
        // out per member makes the audience the authorization — the same shape
        // presence uses.
        const [members, blocked] = await Promise.all([
          getDb()
            .select({ userId: conversationParticipants.userId })
            .from(conversationParticipants)
            .where(eq(conversationParticipants.conversationId, data.conversationId)),
          blockedWith(userId),
        ]);

        const payload = {
          userId,
          conversationId: data.conversationId,
          isTyping: Boolean(data.isTyping),
        };

        for (const member of members) {
          if (member.userId === userId || blocked.has(member.userId)) continue;
          io?.to(`user_${member.userId}`).emit("userTyping", payload);
        }
      }
    );

    // Disconnect
    socket.on("disconnect", () => {
      const remaining = (connectionsByIp.get(address) ?? 1) - 1;
      if (remaining > 0) connectionsByIp.set(address, remaining);
      else connectionsByIp.delete(address);

      const userSockets = onlineUsers.get(userId);
      userSockets?.delete(socket.id);

      // Only the *last* socket for a member takes them offline — several tabs
      // or devices share one presence entry.
      if (!userSockets?.size) {
        onlineUsers.delete(userId);

        // Recomputed rather than cached from connect time, so a relationship
        // formed during the session is honoured on the way out.
        void relatedUserIds(userId)
          .then((related) => announcePresence(userId, related, "userOffline"))
          .catch((error) => console.error("Error scoping presence:", error));
      }
      console.log("Socket disconnected:", socket.id);
    });
  });

  return io;
}

/** Stop the session sweep. Used by tests and by a graceful shutdown. */
export function stopSessionRecheck() {
  if (sessionRecheckTimer) {
    clearInterval(sessionRecheckTimer);
    sessionRecheckTimer = null;
  }
}
