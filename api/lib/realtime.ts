/**
 * Server-initiated realtime fan-out.
 *
 * `getIO()` had zero call sites: no tRPC procedure emitted a socket event, so
 * every realtime update had to originate on the socket path and the stricter
 * validation on the tRPC path was never exercised (ADR-007, CLAUDE.md). That
 * defect is closed one write path at a time, as each is touched. These helpers
 * are the shared shape.
 *
 * Emission is deliberately best-effort. A socket fan-out that fails must never
 * roll back a write that already committed: the data is correct, and the client
 * reconciles on its next fetch.
 */
import { and, eq, isNull } from "drizzle-orm";
import { conversationParticipants } from "@db/schema";
import { getDb } from "../queries/connection";
import { getIO } from "../socket";

/** Everyone who should hear about a change to `conversationId`. */
export async function participantIds(conversationId: number): Promise<number[]> {
  const rows = await getDb()
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));
  return rows.map((r) => r.userId);
}

/**
 * Emit into the conversation room — clients currently viewing the thread.
 *
 * Use for events that only matter to someone with the thread on screen.
 */
export function emitToConversation(conversationId: number, event: string, payload: unknown) {
  getIO()?.to(`conv_${conversationId}`).emit(event, payload);
}

/**
 * Emit into every member's personal room, whether or not they have the thread
 * open. Use for anything that changes what the sidebar should show.
 */
export async function emitToMembers(
  conversationId: number,
  event: string,
  payload: unknown
) {
  const io = getIO();
  if (!io) return;

  for (const userId of await participantIds(conversationId)) {
    io.to(`user_${userId}`).emit(event, payload);
  }
}

/** `deletedAt IS NULL` — the predicate every "live messages only" path shares. */
export const notDeleted = (column: Parameters<typeof isNull>[0]) => isNull(column);

/** Both conditions, for readability at call sites. */
export const activeIn = (
  conversationColumn: Parameters<typeof eq>[0],
  conversationId: number,
  deletedColumn: Parameters<typeof isNull>[0]
) => and(eq(conversationColumn, conversationId), isNull(deletedColumn));
