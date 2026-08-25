import { z } from "zod";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { insertMessage } from "./queries/messages";
import { assertMessagesReadable, assertParticipant, isParticipant } from "./lib/authz";
import { messages, messageReads, users } from "@db/schema";
import { MAX_READ_RECEIPT_BATCH } from "@contracts/constants";

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
          createdAt: messages.createdAt,
          senderName: users.name,
          senderAvatar: users.avatar,
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(desc(messages.createdAt))
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
        content: z.string().min(1).max(4000),
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
