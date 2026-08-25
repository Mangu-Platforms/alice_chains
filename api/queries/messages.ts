/**
 * Message writes.
 *
 * One implementation for both doors. `conversation.list` orders by
 * `conversations.updatedAt`, but until S-11 nothing in the codebase ever wrote
 * that column — a grep for `update(conversations` returned nothing — so the
 * sidebar was sorted by creation time while looking like it was sorted by
 * recency. Touching it belongs with the insert, in the same transaction, on
 * whichever path the message arrived through.
 */
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { conversations, messages } from "@db/schema";
import { getDb } from "./connection";

export interface NewMessage {
  conversationId: number;
  senderId: number;
  content: string;
  type?: "text" | "image" | "file";
  /** Deprecated by F-4's `attachments` table; kept until it is dropped. */
  fileUrl?: string | null;
  replyToId?: number | null;
}

/**
 * Insert a message and bump its conversation's `updatedAt` atomically, then
 * return the stored row.
 *
 * The two writes share a transaction because a message that exists without
 * having moved its conversation to the top of everyone's list is worse than
 * neither write happening: the sidebar would be silently, permanently wrong for
 * that conversation.
 */
export class InvalidReplyError extends Error {
  constructor() {
    super("You can only reply to a message in this conversation");
  }
}

/**
 * FR-MSG-15. A reply must point at a message in the same conversation.
 *
 * Neither door validated this, and `messages.replyToId` had no foreign key
 * until S-3 — so a reply could reference a message the reader has no right to
 * see, and the quoted snippet F-5 renders would have leaked its content into a
 * conversation the author was never a member of.
 */
export async function assertReplyTargetIsInConversation(
  replyToId: number,
  conversationId: number,
  db = getDb()
): Promise<void> {
  const [parent] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.id, replyToId), eq(messages.conversationId, conversationId)))
    .limit(1);

  if (!parent) throw new InvalidReplyError();
}

export async function insertMessage(input: NewMessage) {
  if (input.replyToId != null) {
    // Checked before the transaction opens: this is a read, and holding a
    // write transaction across it buys nothing.
    try {
      await assertReplyTargetIsInConversation(input.replyToId, input.conversationId);
    } catch (error) {
      if (error instanceof InvalidReplyError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
      throw error;
    }
  }

  return getDb().transaction(async (tx) => {
    const [result] = await tx.insert(messages).values({
      conversationId: input.conversationId,
      senderId: input.senderId,
      content: input.content,
      type: input.type ?? "text",
      fileUrl: input.fileUrl ?? undefined,
      replyToId: input.replyToId ?? undefined,
    });

    const messageId = Number(result.insertId);

    await tx
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, input.conversationId));

    const [stored] = await tx
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    return stored;
  });
}
