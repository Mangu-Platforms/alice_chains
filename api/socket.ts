import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { getDb } from "./queries/connection";
import { messages, messageReads, conversationParticipants } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateRequest } from "./kimi/auth";

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

    const isParticipant = async (conversationId: number) => {
      const [participant] = await getDb().select({ id: conversationParticipants.id })
        .from(conversationParticipants).where(and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId),
        )).limit(1);
      return Boolean(participant);
    };

    // Join a conversation room
    socket.on("joinConversation", async ({ conversationId }: { conversationId: number }) => {
      if (await isParticipant(conversationId)) socket.join(`conv_${conversationId}`);
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

          const db = getDb();

          // Verify user is participant
          const [participant] = await db
            .select()
            .from(conversationParticipants)
            .where(
              and(
                eq(conversationParticipants.conversationId, data.conversationId),
                eq(conversationParticipants.userId, userId)
              )
            )
            .limit(1);

          if (!participant) return;

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
          if (!userId || !data.messageIds.length) return;
          if (!(await isParticipant(data.conversationId))) return;

          const db = getDb();

          for (const messageId of data.messageIds) {
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
            messageIds: data.messageIds,
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
        if (!(await isParticipant(data.conversationId))) return;
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
