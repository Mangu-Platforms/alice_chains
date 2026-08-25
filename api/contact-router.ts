import { z } from "zod";
import { eq, and, ne, or, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { contacts, users } from "@db/schema";
import { MIN_USER_SEARCH_LENGTH, USER_SEARCH_LIMIT } from "@contracts/constants";
import { escapeLikePattern } from "./lib/sql";

export const contactRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;

    const rows = await db
      .select({
        id: contacts.id,
        userId: contacts.userId,
        contactUserId: contacts.contactUserId,
        status: contacts.status,
        nickname: contacts.nickname,
        createdAt: contacts.createdAt,
        contactName: users.name,
        contactAvatar: users.avatar,
        contactEmail: users.email,
      })
      .from(contacts)
      .leftJoin(users, eq(contacts.contactUserId, users.id))
      .where(
        and(
          eq(contacts.userId, userId),
          eq(contacts.status, "accepted")
        )
      );

    return rows;
  }),

  pending: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;

    const rows = await db
      .select({
        id: contacts.id,
        userId: contacts.userId,
        contactUserId: contacts.contactUserId,
        status: contacts.status,
        nickname: contacts.nickname,
        createdAt: contacts.createdAt,
        contactName: users.name,
        contactAvatar: users.avatar,
      })
      .from(contacts)
      .leftJoin(users, eq(contacts.userId, users.id))
      .where(
        and(
          eq(contacts.contactUserId, userId),
          eq(contacts.status, "pending")
        )
      );

    return rows;
  }),

  add: authedQuery
    .input(z.object({ contactUserId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      if (userId === input.contactUserId) {
        throw new Error("Cannot add yourself as a contact");
      }

      // S-3. This was a check-then-insert with no unique key behind it, so two
      // concurrent calls both saw "no existing row" and both inserted. The
      // unique key on (userId, contactUserId) now makes the insert itself the
      // arbiter, and the second one is a no-op rather than a duplicate.
      //
      // A pair already in any state is left exactly as it is: re-adding must
      // never reset an `accepted` contact to `pending`, and must never
      // un-block someone.
      await db
        .insert(contacts)
        .values({
          userId,
          contactUserId: input.contactUserId,
          status: "pending",
        })
        .onDuplicateKeyUpdate({ set: { status: sql`status` } });

      // The reverse row records that the request exists, so the recipient can
      // see it in `contact.pending`. It carries the same "leave it alone if it
      // exists" rule for the same reason.
      await db
        .insert(contacts)
        .values({
          userId: input.contactUserId,
          contactUserId: userId,
          status: "pending",
        })
        .onDuplicateKeyUpdate({ set: { status: sql`status` } });

      return { success: true };
    }),

  accept: authedQuery
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // Update the pending request where current user is the receiver
      await db
        .update(contacts)
        .set({ status: "accepted" })
        .where(
          and(
            eq(contacts.contactUserId, userId),
            eq(contacts.userId, input.contactId)
          )
        );

      // Update the reverse entry too
      await db
        .update(contacts)
        .set({ status: "accepted" })
        .where(
          and(
            eq(contacts.userId, userId),
            eq(contacts.contactUserId, input.contactId)
          )
        );

      return { success: true };
    }),

  remove: authedQuery
    .input(z.object({ contactUserId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      await db
        .delete(contacts)
        .where(
          or(
            and(
              eq(contacts.userId, userId),
              eq(contacts.contactUserId, input.contactUserId)
            ),
            and(
              eq(contacts.userId, input.contactUserId),
              eq(contacts.contactUserId, userId)
            )
          )
        );

      return { success: true };
    }),

  searchUsers: authedQuery
    .input(
      z.object({
        // S-10. A one-character query returned every matching user together
        // with their e-mail address — a full directory dump. Three characters
        // is the shortest query that is a lookup rather than an enumeration.
        query: z.string().trim().min(MIN_USER_SEARCH_LENGTH).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const pattern = `%${escapeLikePattern(input.query)}%`;

      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        })
        .from(users)
        .where(
          and(
            ne(users.id, userId),
            or(
              sql`${users.name} LIKE ${pattern}`,
              sql`${users.email} LIKE ${pattern}`
            )
          )
        )
        .orderBy(users.name)
        .limit(USER_SEARCH_LIMIT);

      // S-10. `email` is deliberately absent from the projection: a caller who
      // is not yet a contact has no business learning an address. The column is
      // still *matched* on, so searching by a known address still finds the
      // person — it is simply never echoed back.
      return rows;
    }),
});
