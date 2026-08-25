import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { assertNotBlocked, assertUsersExist, isParticipant } from "./lib/authz";
import { MAX_CONVERSATION_PARTICIPANTS } from "@contracts/constants";
import {
  conversations,
  conversationParticipants,
  messages,
  users,
} from "@db/schema";

/**
 * `conversation_participants` is joined twice in `createDirect` — once for the
 * caller, once for the other member — so the second reference needs an alias.
 */
const otherMember = alias(conversationParticipants, "otherMember");

export const conversationRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;

    // Get all conversation IDs where user is a participant
    const participantRows = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));

    const conversationIds = participantRows.map((r) => r.conversationId);
    if (conversationIds.length === 0) return [];

    // Get conversations with latest message
    const convs = await db
      .select({
        id: conversations.id,
        name: conversations.name,
        type: conversations.type,
        avatar: conversations.avatar,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(inArray(conversations.id, conversationIds))
      .orderBy(desc(conversations.updatedAt));

    // Get participants for each conversation
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

    // Get latest message for each conversation
    const latestMessages = await db
      .select({
        conversationId: messages.conversationId,
        content: messages.content,
        createdAt: messages.createdAt,
        senderId: messages.senderId,
      })
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .orderBy(desc(messages.createdAt));

    // Build result
    const latestByConv = new Map<number, (typeof latestMessages)[number]>();
    for (const m of latestMessages) {
      if (!latestByConv.has(m.conversationId)) {
        latestByConv.set(m.conversationId, m);
      }
    }

    const partsByConv = new Map<number, typeof participants>();
    for (const p of participants) {
      const arr = partsByConv.get(p.conversationId) || [];
      arr.push(p);
      partsByConv.set(p.conversationId, arr);
    }

    return convs.map((conv) => {
      const parts = partsByConv.get(conv.id) || [];
      const otherParticipant = parts.find((p) => p.userId !== userId);
      const latest = latestByConv.get(conv.id);

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
        latestMessage: latest
          ? {
              content: latest.content,
              createdAt: latest.createdAt,
              senderId: latest.senderId,
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
