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
import { and, eq, inArray } from "drizzle-orm";
import { conversationParticipants, messages } from "@db/schema";
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
