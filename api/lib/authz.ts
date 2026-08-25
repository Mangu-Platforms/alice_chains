/**
 * Shared authorization predicates.
 *
 * One definition, many call sites. Every mutating path — tRPC procedure or
 * Socket.IO event — asks these helpers rather than re-deriving membership
 * inline. Before this module existed, `message.markAsRead` performed no
 * authorization at all (BUILD_PLAN S-8) and the socket variant checked
 * conversation membership without checking that the supplied message ids
 * actually belonged to that conversation.
 *
 * The helpers come in two flavours:
 *   - `is*` / `filter*` return data and never throw. Use them on the socket
 *     path, which has no error channel and must simply drop the event.
 *   - `assert*` throw a `TRPCError`. Use them inside tRPC procedures.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { contacts, conversationParticipants, messages, users } from "@db/schema";
import { alias } from "drizzle-orm/mysql-core";

/** Second reference to `conversation_participants` for the co-member self-join. */
const coMember = alias(conversationParticipants, "coMember");
import { getDb } from "../queries/connection";

type Db = ReturnType<typeof getDb>;

/** True when `userId` is a member of `conversationId`. */
export async function isParticipant(
  userId: number,
  conversationId: number,
  db: Db = getDb()
): Promise<boolean> {
  const [row] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      )
    )
    .limit(1);

  return Boolean(row);
}

/** Throws `FORBIDDEN` unless `userId` is a member of `conversationId`. */
export async function assertParticipant(
  userId: number,
  conversationId: number,
  db: Db = getDb()
): Promise<void> {
  if (!(await isParticipant(userId, conversationId, db))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a participant in this conversation",
    });
  }
}

/**
 * Of `messageIds`, the subset that lives in a conversation `userId` belongs to.
 *
 * A single join rather than one query per id: the caller passes a page of ids
 * and N round trips would be the dominant cost of `markAsRead`.
 */
export async function readableMessageIds(
  userId: number,
  messageIds: number[],
  db: Db = getDb()
): Promise<Set<number>> {
  const unique = [...new Set(messageIds)];
  if (unique.length === 0) return new Set();

  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, messages.conversationId),
        eq(conversationParticipants.userId, userId)
      )
    )
    .where(inArray(messages.id, unique));

  return new Set(rows.map((r) => r.id));
}

/**
 * Throws `FORBIDDEN` unless every id in `messageIds` is visible to `userId`.
 *
 * Non-existent ids are rejected the same way a foreign id is: the caller has no
 * right to distinguish "not yours" from "does not exist", and telling them
 * apart is an id-probing oracle.
 */
export async function assertMessagesReadable(
  userId: number,
  messageIds: number[],
  db: Db = getDb()
): Promise<void> {
  const unique = [...new Set(messageIds)];
  if (unique.length === 0) return;

  const allowed = await readableMessageIds(userId, unique, db);
  if (allowed.size !== unique.length) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "One or more messages are not in a conversation you belong to",
    });
  }
}

/** True when every id in `messageIds` belongs to `conversationId`. */
export async function messagesBelongToConversation(
  messageIds: number[],
  conversationId: number,
  db: Db = getDb()
): Promise<boolean> {
  const unique = [...new Set(messageIds)];
  if (unique.length === 0) return true;

  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        inArray(messages.id, unique),
        eq(messages.conversationId, conversationId)
      )
    );

  return rows.length === unique.length;
}

// ─── Users and blocking ───────────────────────────────────────────────────
//
// `contacts.status = 'blocked'` was a valid enum value that no code path read
// (BUILD_PLAN S-9, F-8). These predicates are the single definition of what
// "blocked" means; every surface that must honour it calls one of them.

/**
 * The subset of `userIds` that exist. Callers compare sizes rather than trust
 * a supplied id, because `conversation_participants` carries no foreign key
 * until S-3 — an unknown id would otherwise become a permanent orphan row.
 */
export async function existingUserIds(
  userIds: number[],
  db: Db = getDb()
): Promise<Set<number>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Set();

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, unique));

  return new Set(rows.map((r) => r.id));
}

/** Throws `BAD_REQUEST` if any id in `userIds` does not exist. */
export async function assertUsersExist(
  userIds: number[],
  db: Db = getDb()
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

  const found = await existingUserIds(unique, db);
  if (found.size !== unique.length) {
    const missing = unique.filter((id) => !found.has(id));
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown user id: ${missing.join(", ")}`,
    });
  }
}

/**
 * True when either party has blocked the other.
 *
 * Blocking is symmetric in effect even though the rows are directional: one
 * `contacts` row with `status = 'blocked'` in either direction is enough.
 */
export async function isBlockedBetween(
  a: number,
  b: number,
  db: Db = getDb()
): Promise<boolean> {
  if (a === b) return false;

  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.status, "blocked"),
        or(
          and(eq(contacts.userId, a), eq(contacts.contactUserId, b)),
          and(eq(contacts.userId, b), eq(contacts.contactUserId, a))
        )
      )
    )
    .limit(1);

  return Boolean(row);
}

/** Of `otherIds`, those in a blocked relationship with `userId`. One query. */
export async function blockedAgainst(
  userId: number,
  otherIds: number[],
  db: Db = getDb()
): Promise<Set<number>> {
  const unique = [...new Set(otherIds)].filter((id) => id !== userId);
  if (unique.length === 0) return new Set();

  const rows = await db
    .select({ userId: contacts.userId, contactUserId: contacts.contactUserId })
    .from(contacts)
    .where(
      and(
        eq(contacts.status, "blocked"),
        or(
          and(eq(contacts.userId, userId), inArray(contacts.contactUserId, unique)),
          and(eq(contacts.contactUserId, userId), inArray(contacts.userId, unique))
        )
      )
    );

  return new Set(rows.map((r) => (r.userId === userId ? r.contactUserId : r.userId)));
}

/**
 * Throws `FORBIDDEN` if `userId` is in a blocked relationship with any of
 * `otherIds`. The message names no id: the caller must not learn which of the
 * people they named has blocked them.
 */
export async function assertNotBlocked(
  userId: number,
  otherIds: number[],
  db: Db = getDb(),
  message = "You cannot start a conversation with one of these people"
): Promise<void> {
  const blocked = await blockedAgainst(userId, otherIds, db);
  if (blocked.size > 0) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

// ─── Presence scope ───────────────────────────────────────────────────────

/**
 * Everyone `userId` has a relationship with: accepted contacts in either
 * direction, plus anyone they share a conversation with.
 *
 * Presence used to be `socket.broadcast.emit`, so every signed-in member
 * learned every other member's online state and each new socket received the
 * whole online-user list (BUILD_PLAN S-10). This set is the audience instead.
 * Blocked pairs are subtracted (F-8), so neither party sees the other.
 */
export async function relatedUserIds(
  userId: number,
  db: Db = getDb()
): Promise<Set<number>> {
  const [contactRows, coMemberRows] = await Promise.all([
    db
      .select({ userId: contacts.userId, contactUserId: contacts.contactUserId })
      .from(contacts)
      .where(
        and(
          eq(contacts.status, "accepted"),
          or(eq(contacts.userId, userId), eq(contacts.contactUserId, userId))
        )
      ),
    db
      .select({ userId: coMember.userId })
      .from(conversationParticipants)
      .innerJoin(
        coMember,
        eq(coMember.conversationId, conversationParticipants.conversationId)
      )
      .where(eq(conversationParticipants.userId, userId)),
  ]);

  const related = new Set<number>();
  for (const row of contactRows) {
    related.add(row.userId === userId ? row.contactUserId : row.userId);
  }
  for (const row of coMemberRows) related.add(row.userId);
  related.delete(userId);

  // F-8. A blocked pair may well still share a conversation, so they stay
  // "related" by the definition above — but neither should learn the other's
  // presence. Subtracting here covers every caller at once.
  for (const blocked of await blockedWith(userId, db)) related.delete(blocked);

  return related;
}

/**
 * True when any *other* member of `conversationId` has blocked `userId`.
 *
 * Directional on purpose. FR-MSG-19 constrains the blocked party only: "a
 * member MUST NOT be able to send to a conversation containing a member who has
 * blocked them". Making it symmetric would silence the *blocker* as well —
 * so blocking one person in a twenty-member group would mute you in that group
 * entirely, which is nobody's intent. Conversation *creation* stays symmetric
 * (S-9), because starting a new chat needs both parties willing.
 *
 * It is still strict in the direction it covers: a blocked member cannot reach
 * the blocker through any shared conversation, not merely through a direct
 * chat, or blocking would be trivially defeated by finding a common group.
 *
 * One joined query rather than "list the members, then check each": send is the
 * hottest write path in the app.
 */
export async function isBlockedInConversation(
  userId: number,
  conversationId: number,
  db: Db = getDb()
): Promise<boolean> {
  const [row] = await db
    .select({ id: contacts.id })
    .from(conversationParticipants)
    .innerJoin(
      contacts,
      and(
        eq(contacts.status, "blocked"),
        // The other member is the blocker; `userId` is the blocked party.
        eq(contacts.userId, conversationParticipants.userId),
        eq(contacts.contactUserId, userId)
      )
    )
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        ne(conversationParticipants.userId, userId)
      )
    )
    .limit(1);

  return Boolean(row);
}

/** Throws `FORBIDDEN` when `isBlockedInConversation` holds. */
export async function assertNotBlockedInConversation(
  userId: number,
  conversationId: number,
  db: Db = getDb()
): Promise<void> {
  if (await isBlockedInConversation(userId, conversationId, db)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You cannot send messages to this conversation",
    });
  }
}

/**
 * Everyone `userId` is in a blocked relationship with, either direction.
 *
 * Used to subtract from a fan-out audience rather than to gate one call, so it
 * returns the whole set in one query.
 */
export async function blockedWith(
  userId: number,
  db: Db = getDb()
): Promise<Set<number>> {
  const rows = await db
    .select({ userId: contacts.userId, contactUserId: contacts.contactUserId })
    .from(contacts)
    .where(
      and(
        eq(contacts.status, "blocked"),
        or(eq(contacts.userId, userId), eq(contacts.contactUserId, userId))
      )
    );

  return new Set(rows.map((r) => (r.userId === userId ? r.contactUserId : r.userId)));
}
