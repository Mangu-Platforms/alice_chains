import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { getDb } from "./queries/connection";
import { messages, messageReads, conversationParticipants } from "@db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest } from "./kimi/auth";
import { isParticipant, messagesBelongToConversation } from "./lib/authz";
import { MAX_READ_RECEIPT_BATCH } from "@contracts/constants";

let io: SocketIOServer | null = null;

// Track online users
const onlineUsers = new Map<number, Set<string>>();

export function getIO() {
  return io;
}

export function getOnlineUsers() {
  return new Map(Array.from(onlineUsers, ([id, sockets]) => [id, new Set(sockets)]));
}

export function initSocket(server: HttpServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : "http://localhost:3000",
      credentials: true,
    },
    path: "/socket.io",
  });

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

  io.on("connection", (socket: Socket) => {
    console.log("Socket connected:", socket.id);

    const userId = socket.data.userId as number;
    const sockets = onlineUsers.get(userId) ?? new Set<string>();
    const wasOffline = sockets.size === 0;
    sockets.add(socket.id);
    onlineUsers.set(userId, sockets);
    socket.join(`user_${userId}`);

    if (wasOffline) {
      socket.broadcast.emit("userOnline", { userId });
    }
    socket.emit("onlineUsers", Array.from(onlineUsers.keys()));

    // Membership is asked of the shared predicate in api/lib/authz.ts so the
    // socket and tRPC doors can never drift apart (BUILD_PLAN S-8).
    const isMember = (conversationId: number) => isParticipant(userId, conversationId);

    // Join a conversation room
    socket.on("joinConversation", async ({ conversationId }: { conversationId: number }) => {
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

          if (!(await isMember(data.conversationId))) return;

          const db = getDb();

          // Insert message
          const [result] = await db.insert(messages).values({
            conversationId: data.conversationId,
            senderId: userId,
            content: data.content,
            type: (data.type as "text" | "image" | "file") || "text",
            fileUrl: data.fileUrl,
            replyToId: data.replyToId,
          });

          const messageId = Number(result.insertId);

          // Fetch the complete message with sender info
          const [message] = await db
            .select()
            .from(messages)
            .where(eq(messages.id, messageId))
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
          if (!Number.isInteger(data?.conversationId)) return;

          if (!(await isMember(data.conversationId))) return;

          // S-8. Membership alone was the whole check here, so a member of one
          // conversation could write receipts against message ids belonging to
          // a conversation they are not in. The ids must be in *this*
          // conversation.
          if (!(await messagesBelongToConversation(messageIds, data.conversationId))) return;

          const db = getDb();

          for (const messageId of messageIds) {
            try {
              await db.insert(messageReads).values({
                messageId,
                userId,
              });
            } catch {
              // Ignore duplicates
            }
          }

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
        if (!(await isMember(data.conversationId))) return;
        socket.to(`conv_${data.conversationId}`).emit("userTyping", {
          userId: socket.data.userId,
          conversationId: data.conversationId,
          isTyping: data.isTyping,
        });
      }
    );

    // Disconnect
    socket.on("disconnect", () => {
      const userSockets = onlineUsers.get(userId);
      userSockets?.delete(socket.id);
      if (!userSockets?.size) {
        onlineUsers.delete(userId);
        socket.broadcast.emit("userOffline", { userId });
      }
      console.log("Socket disconnected:", socket.id);
    });
  });

  return io;
}
