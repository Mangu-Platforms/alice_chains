/**
 * Socket.IO payload schemas (BUILD_PLAN S-14).
 *
 * Every handler used to destructure its payload against a TypeScript type,
 * which vanishes at compile time — so the wire was completely unvalidated. A
 * client could send a string where a number was expected, an array of a
 * million ids, or a message body of any length at all: the 4000-character cap
 * lived only on the tRPC path, and the UI sends over the socket.
 *
 * These live in `contracts/` so the client and the server agree by
 * construction rather than by convention.
 */
import { z } from "zod";
import { MAX_MESSAGE_LENGTH, MAX_READ_RECEIPT_BATCH } from "./constants";

/** Database ids are positive integers, always. */
const id = z.number().int().positive();

export const joinConversationSchema = z.object({
  conversationId: id,
});

export const leaveConversationSchema = z.object({
  conversationId: id,
});

export const sendMessageSchema = z.object({
  conversationId: id,
  // The same cap the tRPC path has always had. `trim` first, so a body of four
  // thousand spaces is rejected as empty rather than accepted as full.
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  type: z.enum(["text", "image", "file"]).optional(),
  fileUrl: z.string().max(2048).optional(),
  replyToId: id.optional(),
  // Client-generated, echoed back for optimistic reconciliation. Bounded
  // because it is client-controlled and travels back out to other clients.
  tempId: z.string().max(64).optional(),
});

export const markAsReadSchema = z.object({
  conversationId: id,
  messageIds: z.array(id).min(1).max(MAX_READ_RECEIPT_BATCH),
});

export const typingSchema = z.object({
  conversationId: id,
  isTyping: z.boolean(),
});

/** Every client-to-server event, so none can be added without a schema. */
export const SOCKET_EVENT_SCHEMAS = {
  joinConversation: joinConversationSchema,
  leaveConversation: leaveConversationSchema,
  sendMessage: sendMessageSchema,
  markAsRead: markAsReadSchema,
  typing: typingSchema,
} as const;

export type SocketEventName = keyof typeof SOCKET_EVENT_SCHEMAS;

export type SocketEventPayload<E extends SocketEventName> = z.infer<
  (typeof SOCKET_EVENT_SCHEMAS)[E]
>;
