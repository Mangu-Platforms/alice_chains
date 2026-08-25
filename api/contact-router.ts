import { z } from "zod";
import { eq, and, ne, notExists, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { assertNotBlocked, assertUsersExist, blockedWith } from "./lib/authz";

/** Second reference to `contacts`, for the "is this pair blocked" subquery. */
const blocking = alias(contacts, "blocking");
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { Limits } from "./lib/rate-limit";
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
          eq(contacts.status, "accepted"),
          // F-8. Our own row can still say "accepted" after the other party
          // blocks us, because blocking writes only the blocker's row. Exclude
          // any pair blocked in either direction.
          notExists(
            db
              .select({ one: sql`1` })
              .from(blocking)
              .where(
                and(
                  eq(blocking.status, "blocked"),
                  or(
                    and(
                      eq(blocking.userId, userId),
                      eq(blocking.contactUserId, contacts.contactUserId)
                    ),
                    and(
                      eq(blocking.contactUserId, userId),
                      eq(blocking.userId, contacts.contactUserId)
                    )
                  )
                )
              )
          )
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
          eq(contacts.status, "pending"),
          notExists(
            db
              .select({ one: sql`1` })
              .from(blocking)
              .where(
                and(
                  eq(blocking.status, "blocked"),
                  or(
                    and(
                      eq(blocking.userId, userId),
                      eq(blocking.contactUserId, contacts.userId)
                    ),
                    and(
                      eq(blocking.contactUserId, userId),
                      eq(blocking.userId, contacts.userId)
                    )
                  )
                )
              )
          )
        )
      );

    return rows;
  }),

  add: rateLimited("contact.add", Limits.contactAdd)
    .input(z.object({ contactUserId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      if (userId === input.contactUserId) {
        throw new Error("Cannot add yourself as a contact");
      }

      // F-8. A blocked pair cannot become contacts in either direction.
      await assertNotBlocked(
        userId,
        [input.contactUserId],
        db,
        "You cannot add this person as a contact"
      );

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

  /**
   * Block someone.
   *
   * The row is owned by the blocker: only `(blocker → blocked)` carries the
   * status. `isBlockedBetween` treats a row in either direction as blocking, so
   * the *effect* is symmetric, but the *authority* is not — writing both rows
   * would let the blocked party call `unblock` and undo it.
   */
  block: authedQuery
    .input(z.object({ contactUserId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      if (userId === input.contactUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot block yourself" });
      }

      await assertUsersExist([input.contactUserId], db);

      await db
        .insert(contacts)
        .values({ userId, contactUserId: input.contactUserId, status: "blocked" })
        .onDuplicateKeyUpdate({ set: { status: "blocked" } });

      // Drop the other direction so the blocked person stops seeing a live
      // contact or a pending request — but never their *own* block of us,
      // which would hand them a way to clear it.
      await db
        .delete(contacts)
        .where(
          and(
            eq(contacts.userId, input.contactUserId),
            eq(contacts.contactUserId, userId),
            ne(contacts.status, "blocked")
          )
        );

      return { success: true };
    }),

  /**
   * Undo your own block.
   *
   * The pair is removed rather than restored to whatever it was before: the
   * previous status is not recorded anywhere, and guessing "accepted" would
   * silently re-establish a contact the blocker may not want back. They can
   * add each other again.
   */
  unblock: authedQuery
    .input(z.object({ contactUserId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      await db
        .delete(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            eq(contacts.contactUserId, input.contactUserId),
            eq(contacts.status, "blocked")
          )
        );

      return { success: true };
    }),

  /** The people this member has blocked, so the UI can offer "unblock". */
  blocked: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select({
        contactUserId: contacts.contactUserId,
        contactName: users.name,
        contactAvatar: users.avatar,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .leftJoin(users, eq(contacts.contactUserId, users.id))
      .where(and(eq(contacts.userId, ctx.user.id), eq(contacts.status, "blocked")));
  }),

  // Two buckets: one stops a tight loop, the other a slow crawl of the
  // directory over a day. Both must allow the call.
  searchUsers: rateLimited("contact.search", Limits.searchBurst, Limits.searchDaily)
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
      // `notInArray` with an empty list is invalid SQL, so an id that cannot
      // exist stands in for "nobody is blocked".
      const blockedIds = await blockedWith(userId, db);

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
            // F-8. Neither party appears in the other's search results.
            notInArray(users.id, blockedIds.size > 0 ? [...blockedIds] : [0]),
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
