import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { assertNotBlocked, assertUsersExist, isParticipant } from "./lib/authz";
import {
  CONVERSATION_LIST_LIMIT,
  MAX_CONVERSATION_PARTICIPANTS,
} from "@contracts/constants";

/** Row shape of the conversation-list statement in `list`. */
interface ConversationListRow {
  id: number;
  name: string | null;
  type: "direct" | "group";
  avatar: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageContent: string | null;
  lastMessageAt: Date | null;
  lastMessageSenderId: number | null;
  unreadCount: number | string | null;
}
import { conversations, conversationParticipants, users } from "@db/schema";

/**
 * `conversation_participants` is joined twice in `createDirect` — once for the
 * caller, once for the other member — so the second reference needs an alias.
 */
const otherMember = alias(conversationParticipants, "otherMember");

export const conversationRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;

    // S-11. This was four round trips reduced in JavaScript, and the fourth
    // selected EVERY message of EVERY conversation the caller belongs to — no
    // LIMIT — purely to pick the newest one per conversation in Node. At ten
    // conversations of five thousand messages that is fifty thousand rows per
    // sidebar render, and the client refetches on every inbound message.
    //
    // One statement now, per DATA_MODEL.md 6.1: a window function picks the
    // last message per conversation and a correlated subquery counts the
    // unread. Both are index range scans on IX-1
    // (messages(conversationId, createdAt)); the membership CTE uses IX-2.
    //
    // COALESCE against '1970-01-02' rather than '1970-01-01': MySQL TIMESTAMP
    // cannot represent the epoch itself, so the obvious zero value is a
    // runtime error.
    const rows = await db.execute(sql`
      WITH my AS (
        SELECT conversationId, lastReadAt
        FROM conversation_participants
        WHERE userId = ${userId}
      ),
      last_msg AS (
        SELECT m.id, m.conversationId, m.content, m.createdAt, m.senderId,
               ROW_NUMBER() OVER (PARTITION BY m.conversationId ORDER BY m.id DESC) rn
        FROM messages m
        JOIN my ON my.conversationId = m.conversationId
        -- F-2. History keeps tombstones so a reply chain holds its shape, but
        -- the sidebar preview must not: showing an empty bubble as the last
        -- message is worse than showing the one before it.
        WHERE m.deletedAt IS NULL
      )
      SELECT c.id, c.name, c.type, c.avatar, c.createdAt, c.updatedAt,
             lm.content        AS lastMessageContent,
             lm.createdAt      AS lastMessageAt,
             lm.senderId       AS lastMessageSenderId,
             (SELECT COUNT(*) FROM messages um
                WHERE um.conversationId = c.id
                  AND um.deletedAt IS NULL
                  AND um.senderId <> ${userId}
                  AND um.createdAt > COALESCE(my.lastReadAt, '1970-01-02')) AS unreadCount
      FROM conversations c
      JOIN my ON my.conversationId = c.id
      LEFT JOIN last_msg lm ON lm.conversationId = c.id AND lm.rn = 1
      ORDER BY COALESCE(lm.createdAt, c.createdAt) DESC
      LIMIT ${CONVERSATION_LIST_LIMIT}
    `);

    const convs = (rows as unknown as [ConversationListRow[]])[0];
    if (convs.length === 0) return [];

    const conversationIds = convs.map((c) => Number(c.id));

    // Participants are hydrated separately rather than GROUP_CONCAT-ed, so the
    // shape stays typed and a large group does not truncate at the
    // group_concat_max_len cliff.
    const participants = await db
      .select({
        conversationId: conversationParticipants.conversationId,
        userId: conversationParticipants.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(conversationParticipants)
      .leftJoin(users, eq(conversationParticipants.userId, users.id))
      .where(inArray(conversationParticipants.conversationId, conversationIds));

    const partsByConv = new Map<number, typeof participants>();
    for (const p of participants) {
      const arr = partsByConv.get(p.conversationId) || [];
      arr.push(p);
      partsByConv.set(p.conversationId, arr);
    }

    return convs.map((conv) => {
      const id = Number(conv.id);
      const parts = partsByConv.get(id) || [];
      const otherParticipant = parts.find((p) => p.userId !== userId);

      return {
        id,
        name: conv.name,
        type: conv.type,
        avatar: conv.avatar,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        displayName:
          conv.type === "direct"
            ? otherParticipant?.userName || "Unknown"
            : conv.name || "Group Chat",
        displayAvatar: conv.type === "direct" ? otherParticipant?.userAvatar : conv.avatar,
        participants: parts,
        unreadCount: Number(conv.unreadCount ?? 0),
        latestMessage: conv.lastMessageAt
          ? {
              content: conv.lastMessageContent as string,
              createdAt: conv.lastMessageAt,
              senderId: Number(conv.lastMessageSenderId),
            }
          : null,
      };
    });
  }),

  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      if (!(await isParticipant(userId, input.id, db))) return null;

      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.id))
        .limit(1);

      if (!conv) return null;

      const parts = await db
        .select({
          userId: conversationParticipants.userId,
          userName: users.name,
          userAvatar: users.avatar,
        })
        .from(conversationParticipants)
        .leftJoin(users, eq(conversationParticipants.userId, users.id))
        .where(eq(conversationParticipants.conversationId, input.id));

      const otherParticipant = parts.find((p) => p.userId !== userId);

      return {
        ...conv,
        displayName:
          conv.type === "direct"
            ? otherParticipant?.userName || "Unknown"
            : conv.name || "Group Chat",
        displayAvatar:
          conv.type === "direct"
            ? otherParticipant?.userAvatar
            : conv.avatar,
        participants: parts,
      };
    }),

  createDirect: authedQuery
    .input(z.object({ otherUserId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      if (input.otherUserId === userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot open a direct conversation with yourself",
        });
      }

      // S-9. The id used to be written straight into conversation_participants
      // with no existence check, and a user who had blocked the caller could
      // still be pulled into a conversation with them.
      await assertUsersExist([input.otherUserId], db);
      await assertNotBlocked(userId, [input.otherUserId], db);

      // S-9. The old lookup collected every conversation the two share, took
      // the *first* of them, and only then filtered on type='direct'. When the
      // pair also shared a group and that group sorted first, the filter missed
      // and a duplicate DM was created on every call. Filtering inside the
      // query makes the lookup idempotent.
      const [existing] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          and(
            eq(conversationParticipants.conversationId, conversations.id),
            eq(conversationParticipants.userId, userId)
          )
        )
        .innerJoin(
          otherMember,
          and(
            eq(otherMember.conversationId, conversations.id),
            eq(otherMember.userId, input.otherUserId)
          )
        )
        .where(eq(conversations.type, "direct"))
        .orderBy(conversations.id)
        .limit(1);

      if (existing) {
        const [conv] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, existing.id))
          .limit(1);
        if (conv) return conv;
      }

      const [newConv] = await db.insert(conversations).values({
        type: "direct",
        createdBy: userId,
      });

      const convId = Number(newConv.insertId);

      await db.insert(conversationParticipants).values([
        { conversationId: convId, userId },
        { conversationId: convId, userId: input.otherUserId },
      ]);

      const [created] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, convId))
        .limit(1);

      return created;
    }),

  createGroup: authedQuery
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        participantIds: z
          .array(z.number().int().positive())
          .min(1)
          // The creator is always a member, so the array itself may hold at
          // most one fewer than the conversation cap.
          .max(MAX_CONVERSATION_PARTICIPANTS - 1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const invited = [...new Set(input.participantIds)].filter((id) => id !== userId);
      if (invited.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A group needs at least one other member",
        });
      }

      // S-9. Every id was previously written verbatim: unknown ids became
      // orphan rows, and a user who had blocked the caller could be added to a
      // group by them and then messaged.
      await assertUsersExist(invited, db);
      await assertNotBlocked(userId, invited, db);

      const [newConv] = await db.insert(conversations).values({
        name: input.name,
        type: "group",
        createdBy: userId,
      });

      const convId = Number(newConv.insertId);

      const allParticipantIds = [userId, ...invited];
      await db.insert(conversationParticipants).values(
        allParticipantIds.map((id) => ({
          conversationId: convId,
          userId: id,
        }))
      );

      return { id: convId, name: input.name, type: "group" as const };
    }),

  markAsRead: authedQuery
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),
});
