import { z } from "zod";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { insertMessage } from "./queries/messages";
import { TRPCError } from "@trpc/server";
import { assertMessagesReadable, assertParticipant, isParticipant } from "./lib/authz";
import { emitToConversation, emitToMembers } from "./lib/realtime";
import { messages, messageReads, users } from "@db/schema";
import { MAX_MESSAGE_LENGTH, MAX_READ_RECEIPT_BATCH } from "@contracts/constants";

/**
 * Resolve a message the caller is allowed to modify.
 *
 * Editing and deleting are owner-only — being a participant is not enough. A
 * message that is already deleted cannot be edited or re-deleted, and a message
 * belonging to someone else is refused exactly like one that does not exist, so
 * the endpoint is not an id-probing oracle.
 */
async function assertOwnMessage(
  userId: number,
  messageId: number,
  db = getDb()
): Promise<{ conversationId: number }> {
  const [message] = await db
    .select({
      senderId: messages.senderId,
      conversationId: messages.conversationId,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message || message.senderId !== userId || message.deletedAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You cannot modify this message",
    });
  }

  return { conversationId: message.conversationId };
}

export const messageRouter = createRouter({
  listByConversation: authedQuery
    .input(
      z.object({
        conversationId: z.number(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // A non-participant sees an empty page rather than an error: the caller
      // has no right to learn whether the conversation exists.
      if (!(await isParticipant(userId, input.conversationId, db))) return [];

      const msgs = await db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          senderId: messages.senderId,
          content: messages.content,
          type: messages.type,
          fileUrl: messages.fileUrl,
          replyToId: messages.replyToId,
          isEdited: messages.isEdited,
          // A deleted message is returned as a tombstone rather than omitted,
          // so a reply chain keeps its shape and the client can render
          // "message deleted" in place. `content` was blanked at delete time.
          deletedAt: messages.deletedAt,
          createdAt: messages.createdAt,
          senderName: users.name,
          senderAvatar: users.avatar,
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.conversationId, input.conversationId))
        // FR-MSG-11. `createdAt` alone is not a deterministic order: MySQL
        // TIMESTAMP here has one-second resolution, so messages sent within the
        // same second sorted arbitrarily and could swap places between two
        // fetches. `id` is monotonic and breaks the tie.
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(input.limit)
        .offset(input.offset);

      // S-5. This was `sql\`... IN (${messageIds.join(",")})\``, which Drizzle
      // binds as ONE parameter — `IN (?)` with the value "11,12,13" — and MySQL
      // then coerces to the integer 11. Read receipts came back for the first
      // message on every page and no others. Not injectable (the ids are
      // server-derived and correctly parameterised), but silently wrong.
      const messageIds = msgs.map((m) => m.id);
      const reads =
        messageIds.length > 0
          ? await db
              .select({
                messageId: messageReads.messageId,
                userId: messageReads.userId,
                readAt: messageReads.readAt,
              })
              .from(messageReads)
              .where(inArray(messageReads.messageId, messageIds))
          : [];

      const readsByMessage = new Map<number, typeof reads>();
      for (const r of reads) {
        const arr = readsByMessage.get(r.messageId) || [];
        arr.push(r);
        readsByMessage.set(r.messageId, arr);
      }

      return msgs.reverse().map((m) => ({
        ...m,
        readBy: readsByMessage.get(m.id) || [],
        isMine: m.senderId === userId,
      }));
    }),

  send: authedQuery
    .input(
      z.object({
        conversationId: z.number(),
        content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
        type: z.enum(["text", "image", "file"]).default("text"),
        fileUrl: z.string().optional(),
        replyToId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      await assertParticipant(userId, input.conversationId, db);

      // Shared with the socket path so `conversations.updatedAt` is touched
      // whichever door the message came through (S-11).
      const stored = await insertMessage({
        conversationId: input.conversationId,
        senderId: userId,
        content: input.content,
        type: input.type,
        fileUrl: input.fileUrl,
        replyToId: input.replyToId,
      });

      return { ...stored, isMine: true };
    }),

  edit: authedQuery
    .input(
      z.object({
        messageId: z.number().int().positive(),
        content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const message = await assertOwnMessage(ctx.user.id, input.messageId, db);

      await db
        .update(messages)
        .set({ content: input.content, isEdited: true })
        .where(eq(messages.id, input.messageId));

      const payload = {
        id: input.messageId,
        conversationId: message.conversationId,
        content: input.content,
        isEdited: true,
      };

      // Closes part of the getIO()-has-no-call-sites defect: a tRPC mutation
      // that changes conversation state now reaches open clients.
      emitToConversation(message.conversationId, "messageUpdated", payload);
      await emitToMembers(message.conversationId, "conversationUpdated", {
        conversationId: message.conversationId,
      });

      return payload;
    }),

  delete: authedQuery
    .input(z.object({ messageId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const message = await assertOwnMessage(ctx.user.id, input.messageId, db);

      // Soft: the row survives so the thread keeps its shape, but `content` is
      // blanked in the same statement so the body is not retrievable from the
      // tombstone.
      await db
        .update(messages)
        .set({ content: "", deletedAt: new Date(), deletedBy: ctx.user.id })
        .where(eq(messages.id, input.messageId));

      const payload = {
        id: input.messageId,
        conversationId: message.conversationId,
      };

      emitToConversation(message.conversationId, "messageDeleted", payload);
      await emitToMembers(message.conversationId, "conversationUpdated", {
        conversationId: message.conversationId,
      });

      return payload;
    }),

  markAsRead: authedQuery
    .input(
      z.object({
        messageIds: z.array(z.number().int().positive()).max(MAX_READ_RECEIPT_BATCH),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      if (input.messageIds.length === 0) return { success: true };

      // S-8. This procedure previously accepted an arbitrary id list and wrote
      // a receipt for every one of them with no authorization at all, so any
      // signed-in caller could mark any message in the deployment as read.
      // Every id must now live in a conversation the caller belongs to.
      await assertMessagesReadable(userId, input.messageIds, db);

      // One statement, no read-then-write race. S-3's unique key on
      // (messageId, userId) is what makes this correct: before it existed,
      // ON DUPLICATE KEY had nothing to conflict on and the read-then-insert it
      // replaces could double-write under concurrency.
      const unique = [...new Set(input.messageIds)];
      await db
        .insert(messageReads)
        .values(unique.map((messageId) => ({ messageId, userId })))
        .onDuplicateKeyUpdate({ set: { readAt: sql`readAt` } });

      return { success: true };
    }),
});
