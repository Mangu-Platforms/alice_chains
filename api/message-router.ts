import { z } from "zod";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { Limits } from "./lib/rate-limit";
import { getDb } from "./queries/connection";
import { insertMessage } from "./queries/messages";
import { TRPCError } from "@trpc/server";
import {
  assertMessagesReadable,
  assertNotBlockedInConversation,
  assertParticipant,
  isParticipant,
} from "./lib/authz";
import { emitToConversation, emitToMembers } from "./lib/realtime";
import { attachToMessage, attachmentsForMessages } from "./attachment-router";
import { notifyNewMessage } from "./lib/push/notify";
import { messages, messageReactions, messageReads, users } from "@db/schema";
import { MAX_MESSAGE_LENGTH, MAX_READ_RECEIPT_BATCH } from "@contracts/constants";
import { REACTION_EMOJI } from "@contracts/reactions";

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

/**
 * Aliases for the reply self-join: `messages` and `users` each appear twice in
 * the history query — once for the message, once for the message it quotes.
 */
const parentMessage = alias(messages, "parentMessage");
const parentSender = alias(users, "parentSender");

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Whether the caller is one of the reactors — drives the "on" state. */
  mine: boolean;
  userIds: number[];
}

/**
 * Group reactions by message and emoji.
 *
 * One query for a whole page rather than one per message: the history endpoint
 * returns up to 100 messages and a per-message round trip would dominate it.
 */
async function reactionsFor(
  messageIds: number[],
  viewerId: number,
  db = getDb()
): Promise<Map<number, ReactionSummary[]>> {
  const byMessage = new Map<number, ReactionSummary[]>();
  if (messageIds.length === 0) return byMessage;

  const rows = await db
    .select({
      messageId: messageReactions.messageId,
      emoji: messageReactions.emoji,
      userId: messageReactions.userId,
    })
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, messageIds))
    .orderBy(messageReactions.id);

  for (const row of rows) {
    const list = byMessage.get(row.messageId) ?? [];
    const existing = list.find((r) => r.emoji === row.emoji);

    if (existing) {
      existing.count += 1;
      existing.userIds.push(row.userId);
      existing.mine = existing.mine || row.userId === viewerId;
    } else {
      list.push({
        emoji: row.emoji,
        count: 1,
        mine: row.userId === viewerId,
        userIds: [row.userId],
      });
    }
    byMessage.set(row.messageId, list);
  }

  return byMessage;
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
          // F-5. The quoted snippet comes back on the same row via a self-join
          // rather than a lookup per reply, so a page of 100 replies is still
          // one query. `replyToDeletedAt` lets the client render "Message
          // deleted" in the quote instead of an empty bubble.
          replyToContent: parentMessage.content,
          replyToSenderId: parentMessage.senderId,
          replyToSenderName: parentSender.name,
          replyToDeletedAt: parentMessage.deletedAt,
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .leftJoin(parentMessage, eq(messages.replyToId, parentMessage.id))
        .leftJoin(parentSender, eq(parentMessage.senderId, parentSender.id))
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

      const [reactionsByMessage, attachmentsByMessage] = await Promise.all([
        reactionsFor(messageIds, userId, db),
        attachmentsForMessages(messageIds, db),
      ]);

      return msgs.reverse().map((m) => ({
        ...m,
        readBy: readsByMessage.get(m.id) || [],
        reactions: reactionsByMessage.get(m.id) ?? [],
        attachments: attachmentsByMessage.get(m.id) ?? [],
        isMine: m.senderId === userId,
      }));
    }),

  send: rateLimited("message.send", Limits.messageSendPerUser)
    .input(
      z.object({
        conversationId: z.number(),
        // A message with an attachment may have no text of its own, so the
        // minimum is zero and the guard below requires one or the other.
        content: z.string().max(MAX_MESSAGE_LENGTH).default(""),
        type: z.enum(["text", "image", "file"]).default("text"),
        replyToId: z.number().optional(),
        attachmentIds: z.array(z.number().int().positive()).max(10).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      await assertParticipant(userId, input.conversationId, db);
      // F-8 / FR-MSG-19. Membership is not enough: a member who has been
      // blocked by anyone else in the conversation cannot send into it.
      await assertNotBlockedInConversation(userId, input.conversationId, db);

      const attachmentIds = input.attachmentIds ?? [];
      if (input.content.trim().length === 0 && attachmentIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A message needs text or an attachment",
        });
      }

      // Shared with the socket path so `conversations.updatedAt` is touched
      // whichever door the message came through (S-11).
      const stored = await insertMessage({
        conversationId: input.conversationId,
        senderId: userId,
        content: input.content,
        type: input.type,
        replyToId: input.replyToId,
      });

      // Bound after the message exists, because `attachments.messageId` has a
      // foreign key. Each binding re-checks ownership and readiness, so one
      // upload cannot be re-used to place a file in a second conversation.
      for (const attachmentId of attachmentIds) {
        await attachToMessage(attachmentId, stored.id, userId, db);
      }

      // F-6. Fire and forget: a push service being slow must not slow down a
      // message send, and `notifyNewMessage` never throws.
      void notifyNewMessage({
        conversationId: input.conversationId,
        senderId: userId,
        senderName: ctx.user.name,
        conversationName: null,
        isGroup: false,
        content: input.content,
        hasAttachment: attachmentIds.length > 0,
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

  /**
   * Add or remove a reaction. One call, both directions.
   *
   * A separate add and remove would need the client to know whether its own
   * reaction is already there, which it can only know from a possibly stale
   * render — two taps in quick succession would then both add or both remove.
   * The server reads and decides.
   */
  react: authedQuery
    .input(
      z.object({
        messageId: z.number().int().positive(),
        emoji: z.enum(REACTION_EMOJI),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // Reacting requires being able to see the message — the same predicate
      // that guards read receipts.
      await assertMessagesReadable(userId, [input.messageId], db);

      const [message] = await db
        .select({
          conversationId: messages.conversationId,
          deletedAt: messages.deletedAt,
        })
        .from(messages)
        .where(eq(messages.id, input.messageId))
        .limit(1);

      if (!message || message.deletedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot react to this message",
        });
      }

      const existing = await db
        .select({ id: messageReactions.id })
        .from(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, input.messageId),
            eq(messageReactions.userId, userId),
            eq(messageReactions.emoji, input.emoji)
          )
        )
        .limit(1);

      const added = existing.length === 0;

      if (added) {
        // The unique key decides under concurrency: two taps racing each other
        // cannot both insert, and the loser is a no-op rather than an error.
        await db
          .insert(messageReactions)
          .values({ messageId: input.messageId, userId, emoji: input.emoji })
          .onDuplicateKeyUpdate({ set: { emoji: sql`emoji` } });
      } else {
        await db
          .delete(messageReactions)
          .where(
            and(
              eq(messageReactions.messageId, input.messageId),
              eq(messageReactions.userId, userId),
              eq(messageReactions.emoji, input.emoji)
            )
          );
      }

      const summary = await reactionsFor([input.messageId], userId, db);
      const payload = {
        messageId: input.messageId,
        conversationId: message.conversationId,
        added,
        reactions: summary.get(input.messageId) ?? [],
      };

      emitToConversation(message.conversationId, "reactionUpdated", payload);

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
