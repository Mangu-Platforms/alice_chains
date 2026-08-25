/**
 * Administration and data rights (BUILD_PLAN S-18).
 *
 * There was no administrator: `OWNER_UNION_ID` was parsed and never read, and
 * `users.role` was never written as anything but its default. There was also no
 * way for a member to get their own data out, or to have it erased.
 *
 * Every administrative procedure is built on `adminQuery` and wrapped in
 * `audited`, so the gate and the record are structural rather than remembered.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { createRouter, adminQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  attachments,
  contacts,
  conversationParticipants,
  conversations,
  messageReactions,
  messageReads,
  messages,
  users,
} from "@db/schema";
import { audited, readAuditLog, readAuditLogFor, recordAudit } from "./lib/audit";
import { revokeAllSessionsForUser } from "./kimi/session";
import { getIO } from "./socket";
import { log } from "./lib/logger";

/** How long a member has to change their mind before the purge runs. */
export const DELETION_GRACE_PERIOD_DAYS = 30;

/**
 * Disconnect every live socket belonging to a member.
 *
 * Revoking the session stops the *next* request, but a socket authorised at
 * handshake stays open until S-17's five-minute sweep notices. For a
 * deactivation that is too long, so the sockets are cut immediately and the
 * sweep is the backstop.
 */
async function disconnectAllSockets(userId: number): Promise<void> {
  try {
    const io = getIO();
    if (!io) return;
    for (const socket of await io.in(`user_${userId}`).fetchSockets()) {
      socket.emit("sessionExpired");
      socket.disconnect(true);
    }
  } catch (error) {
    log.error("failed to disconnect sockets for a deactivated member", { userId, error });
  }
}

export const adminRouter = createRouter({
  // ─── Administration ─────────────────────────────────────────────────────

  listMembers: adminQuery
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      return audited(
        { actorId: ctx.user.id, action: "admin.member.list" },
        async () =>
          getDb()
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              role: users.role,
              createdAt: users.createdAt,
              lastSignInAt: users.lastSignInAt,
              deactivatedAt: users.deactivatedAt,
              deletionRequestedAt: users.deletionRequestedAt,
            })
            .from(users)
            .orderBy(users.id)
            .limit(input.limit)
            .offset(input.offset)
      );
    }),

  deactivateMember: adminQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return audited(
        {
          actorId: ctx.user.id,
          action: "admin.member.deactivate",
          targetUserId: input.userId,
        },
        async () => {
          if (input.userId === ctx.user.id) {
            // An administrator locking themselves out leaves the deployment
            // with no administrator and no way to appoint one.
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "You cannot deactivate your own account",
            });
          }

          const db = getDb();
          const [target] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, input.userId))
            .limit(1);

          if (!target) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No such member" });
          }

          await db
            .update(users)
            .set({ deactivatedAt: new Date() })
            .where(eq(users.id, input.userId));

          // Both, in this order: the session store stops the next request, the
          // socket cut stops the current one.
          await revokeAllSessionsForUser(input.userId);
          await disconnectAllSockets(input.userId);

          return { deactivated: input.userId };
        }
      );
    }),

  reactivateMember: adminQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return audited(
        {
          actorId: ctx.user.id,
          action: "admin.member.reactivate",
          targetUserId: input.userId,
        },
        async () => {
          await getDb()
            .update(users)
            .set({ deactivatedAt: null })
            .where(eq(users.id, input.userId));
          return { reactivated: input.userId };
        }
      );
    }),

  auditLog: adminQuery
    .input(
      z.object({
        limit: z.number().int().min(1).max(500).default(100),
        userId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ input }) =>
      input.userId ? readAuditLogFor(input.userId, input.limit) : readAuditLog(input.limit)
    ),

  // ─── Data rights, for the member themselves ─────────────────────────────

  /**
   * Everything this member's account holds, as JSON.
   *
   * Scoped hard to the caller: their own messages, their own memberships, their
   * own contacts. Not the conversations' other messages — those belong to
   * everyone in them, and an export is not a way to obtain other people's data.
   */
  exportMyData: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;

    return audited({ actorId: userId, action: "account.export", targetUserId: userId }, async () => {
      const memberships = await db
        .select({
          conversationId: conversationParticipants.conversationId,
          joinedAt: conversationParticipants.joinedAt,
          lastReadAt: conversationParticipants.lastReadAt,
        })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.userId, userId));

      const [myMessages, myContacts, myReactions, myAttachments] = await Promise.all([
        db
          .select({
            id: messages.id,
            conversationId: messages.conversationId,
            content: messages.content,
            type: messages.type,
            createdAt: messages.createdAt,
            isEdited: messages.isEdited,
            deletedAt: messages.deletedAt,
          })
          .from(messages)
          .where(eq(messages.senderId, userId)),
        db
          .select({
            contactUserId: contacts.contactUserId,
            status: contacts.status,
            createdAt: contacts.createdAt,
          })
          .from(contacts)
          .where(eq(contacts.userId, userId)),
        db
          .select({
            messageId: messageReactions.messageId,
            emoji: messageReactions.emoji,
            createdAt: messageReactions.createdAt,
          })
          .from(messageReactions)
          .where(eq(messageReactions.userId, userId)),
        db
          .select({
            fileName: attachments.fileName,
            mimeType: attachments.mimeType,
            byteSize: attachments.byteSize,
            createdAt: attachments.createdAt,
          })
          .from(attachments)
          .where(eq(attachments.uploaderId, userId)),
      ]);

      return {
        exportedAt: new Date().toISOString(),
        account: {
          id: ctx.user.id,
          name: ctx.user.name,
          email: ctx.user.email,
          avatar: ctx.user.avatar,
          status: ctx.user.status,
          createdAt: ctx.user.createdAt,
        },
        memberships,
        messages: myMessages,
        contacts: myContacts,
        reactions: myReactions,
        attachments: myAttachments,
      };
    });
  }),

  /**
   * Request erasure.
   *
   * Two-phase: this marks the account, revokes every session and cuts every
   * socket. The purge runs after a grace period, so an account deleted in anger
   * or by mistake can still be recovered — an irreversible action taken
   * instantly is a support burden, not a privacy feature.
   */
  requestDeletion: authedQuery.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    return audited(
      { actorId: userId, action: "account.deletion.request", targetUserId: userId },
      async () => {
        await getDb()
          .update(users)
          .set({ deletionRequestedAt: new Date() })
          .where(eq(users.id, userId));

        await revokeAllSessionsForUser(userId);
        await disconnectAllSockets(userId);

        const purgeAt = new Date(
          Date.now() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
        );
        return { requested: true, purgeAt, graceDays: DELETION_GRACE_PERIOD_DAYS };
      }
    );
  }),

  cancelDeletion: authedQuery.mutation(async ({ ctx }) => {
    return audited(
      { actorId: ctx.user.id, action: "account.deletion.cancel", targetUserId: ctx.user.id },
      async () => {
        await getDb()
          .update(users)
          .set({ deletionRequestedAt: null })
          .where(eq(users.id, ctx.user.id));
        return { cancelled: true };
      }
    );
  }),

  /** Sign out of every device, including this one. */
  revokeAllSessions: authedQuery.mutation(async ({ ctx }) => {
    return audited(
      { actorId: ctx.user.id, action: "session.revoke_all", targetUserId: ctx.user.id },
      async () => {
        await revokeAllSessionsForUser(ctx.user.id);
        await disconnectAllSockets(ctx.user.id);
        return { success: true };
      }
    );
  }),
});

/**
 * Purge accounts past their grace period.
 *
 * Ordered against the foreign keys S-3 established: the RESTRICT keys on
 * `messages.senderId`, `conversations.createdBy` and `attachments.uploaderId`
 * exist precisely so this cannot happen by accident, and this is the explicit
 * routine they force. Groups the member owns are refused rather than deleted —
 * a group is other people's conversation, and ownership must be transferred
 * first (F-7).
 */
export async function purgeDueAccounts(now = new Date()): Promise<number> {
  const db = getDb();
  const cutoff = new Date(
    now.getTime() - DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
  );

  const due = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.deletionRequestedAt), lt(users.deletionRequestedAt, cutoff)));

  let purged = 0;

  for (const { id } of due) {
    const owned = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.createdBy, id), eq(conversations.type, "group")));

    if (owned.length > 0) {
      await recordAudit({
        actorId: null,
        action: "account.purge",
        targetUserId: id,
        outcome: "failure",
        detail: `still owns ${owned.length} group(s); ownership must be transferred first`,
      });
      continue;
    }

    try {
      // Children before parents: the RESTRICT keys refuse any other order, and
      // that refusal is the point — it makes the sequence explicit here rather
      // than implicit in DDL.
      await db.delete(messageReactions).where(eq(messageReactions.userId, id));
      await db.delete(messageReads).where(eq(messageReads.userId, id));
      await db.delete(attachments).where(eq(attachments.uploaderId, id));
      await db.delete(messages).where(eq(messages.senderId, id));

      // Direct conversations the member started still block the RESTRICT key
      // on `createdBy`. Deleting them would be over-deletion: the other party's
      // messages are the other party's data, and erasing one account must not
      // destroy someone else's copy of a conversation they took part in. So
      // ownership passes to whoever is left, and only a conversation with
      // nobody left in it is removed.
      const direct = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.createdBy, id), eq(conversations.type, "direct")));

      for (const conversation of direct) {
        const [survivor] = await db
          .select({ userId: conversationParticipants.userId })
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, conversation.id),
              ne(conversationParticipants.userId, id)
            )
          )
          .limit(1);

        if (survivor) {
          await db
            .update(conversations)
            .set({ createdBy: survivor.userId })
            .where(eq(conversations.id, conversation.id));
        } else {
          await db.delete(conversations).where(eq(conversations.id, conversation.id));
        }
      }

      // Memberships, contacts, sessions and push subscriptions all cascade
      // from the user row.
      await db.delete(users).where(eq(users.id, id));

      await recordAudit({
        actorId: null,
        action: "account.purge",
        targetUserId: id,
        outcome: "success",
      });
      purged += 1;
    } catch (error) {
      log.error("failed to purge an account", { userId: id, error });
      await recordAudit({
        actorId: null,
        action: "account.purge",
        targetUserId: id,
        outcome: "failure",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return purged;
}

/** Accounts still inside their grace period, for an operator to see. */
export async function pendingDeletions() {
  return getDb()
    .select({ id: users.id, requestedAt: users.deletionRequestedAt })
    .from(users)
    .where(and(isNotNull(users.deletionRequestedAt), isNull(users.deactivatedAt)));
}
