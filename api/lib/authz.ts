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
import { and, eq, inArray, or } from "drizzle-orm";
import { contacts, conversationParticipants, messages, users } from "@db/schema";
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
  db: Db = getDb()
): Promise<void> {
  const blocked = await blockedAgainst(userId, otherIds, db);
  if (blocked.size > 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You cannot start a conversation with one of these people",
    });
  }
}
