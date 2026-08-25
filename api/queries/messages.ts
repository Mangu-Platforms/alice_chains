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
import { eq } from "drizzle-orm";
import { conversations, messages } from "@db/schema";
import { getDb } from "./connection";

export interface NewMessage {
  conversationId: number;
  senderId: number;
  content: string;
  type?: "text" | "image" | "file";
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
export async function insertMessage(input: NewMessage) {
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
