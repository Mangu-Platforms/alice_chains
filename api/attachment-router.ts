/**
 * Attachments (BUILD_PLAN F-4).
 *
 * Two phases, because the bytes never pass through this process:
 *
 *   1. `createUpload` records a `pending` row and hands back a target URL.
 *   2. The client PUTs the bytes straight to storage.
 *   3. `complete` verifies the object landed and marks the row `ready`.
 *   4. `message.send` names the attachment, which binds it to a message.
 *
 * A row that never reaches step 4 is an abandoned upload, reaped after 24
 * hours by `reapAbandonedUploads`.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { Limits } from "./lib/rate-limit";
import { getDb } from "./queries/connection";
import { attachments, messages } from "@db/schema";
import { assertParticipant, isParticipant } from "./lib/authz";
import { buildStorageKey, getStorage, sanitizeFileName } from "./lib/storage";
import {
  ABANDONED_UPLOAD_TTL_SECONDS,
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_FILE_NAME_LENGTH,
  formatBytes,
  isImageMimeType,
} from "@contracts/attachments";

/**
 * A download link for one attachment, given the caller may see it.
 *
 * Links are minted per request and expire, rather than being stored on the
 * row: a URL that never expires is a capability that outlives every
 * authorization decision that produced it.
 */
export async function downloadUrlFor(attachment: {
  storageKey: string;
  fileName: string;
  mimeType: string;
}): Promise<string> {
  return getStorage().createDownloadUrl({
    key: attachment.storageKey,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    inline: isImageMimeType(attachment.mimeType),
  });
}

export interface AttachmentView {
  id: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  isImage: boolean;
  url: string;
}

/** Load and sign the attachments for a page of messages. One query. */
export async function attachmentsForMessages(
  messageIds: number[],
  db = getDb()
): Promise<Map<number, AttachmentView[]>> {
  const byMessage = new Map<number, AttachmentView[]>();
  if (messageIds.length === 0) return byMessage;

  const rows = await db
    .select({
      id: attachments.id,
      messageId: attachments.messageId,
      storageKey: attachments.storageKey,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      byteSize: attachments.byteSize,
    })
    .from(attachments)
    .where(
      and(inArray(attachments.messageId, messageIds), eq(attachments.status, "ready"))
    );

  for (const row of rows) {
    if (row.messageId === null) continue;
    const list = byMessage.get(row.messageId) ?? [];
    list.push({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      isImage: isImageMimeType(row.mimeType),
      url: await downloadUrlFor(row),
    });
    byMessage.set(row.messageId, list);
  }

  return byMessage;
}

/**
 * Bind a `ready` attachment to a message.
 *
 * Called from the send path once the message row exists. Refuses an attachment
 * that is not the caller's, not ready, or already attached to something else —
 * so one upload cannot be re-used to smuggle a file into a second conversation.
 */
export async function attachToMessage(
  attachmentId: number,
  messageId: number,
  uploaderId: number,
  db = getDb()
): Promise<void> {
  const result = await db
    .update(attachments)
    .set({ messageId })
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.uploaderId, uploaderId),
        eq(attachments.status, "ready"),
        isNull(attachments.messageId)
      )
    );

  // Drizzle surfaces mysql2's affectedRows; zero means no row matched every
  // condition above, and the caller must not end up with a message claiming an
  // attachment it does not have.
  const affected = (result as unknown as { affectedRows?: number }[])[0]?.affectedRows ?? 0;
  if (affected === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That attachment is not available to attach",
    });
  }
}

/** Delete `pending` rows and their objects once they are past the TTL. */
export async function reapAbandonedUploads(now = new Date()): Promise<number> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - ABANDONED_UPLOAD_TTL_SECONDS * 1000);

  const stale = await db
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .where(and(isNull(attachments.messageId), lt(attachments.createdAt, cutoff)));

  if (stale.length === 0) return 0;

  const storage = getStorage();
  for (const row of stale) {
    // Best effort: a storage failure must not block reaping the row, or the
    // job never makes progress.
    await storage.deleteObject(row.storageKey).catch(() => undefined);
  }

  await db.delete(attachments).where(
    inArray(
      attachments.id,
      stale.map((r) => r.id)
    )
  );

  return stale.length;
}

export const attachmentRouter = createRouter({
  createUpload: rateLimited("attachment.createUpload", Limits.uploadInit)
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        fileName: z.string().trim().min(1).max(MAX_FILE_NAME_LENGTH),
        mimeType: z.enum(ALLOWED_MIME_TYPES),
        byteSize: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // The conversation is checked now even though the attachment is not bound
      // to it: an upload target is a write capability, and handing one to a
      // non-participant would let them fill storage against a conversation they
      // cannot see.
      await assertParticipant(userId, input.conversationId, db);

      const fileName = sanitizeFileName(input.fileName);
      const key = buildStorageKey(userId, fileName);

      const target = await getStorage().createUploadTarget({
        key,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
      });

      const [result] = await db.insert(attachments).values({
        uploaderId: userId,
        storageKey: key,
        fileName,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        status: "pending",
      });

      return {
        attachmentId: Number(result.insertId),
        uploadUrl: target.url,
        headers: target.headers,
        expiresAt: target.expiresAt,
      };
    }),

  complete: authedQuery
    .input(z.object({ attachmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [row] = await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.id, input.attachmentId),
            eq(attachments.uploaderId, ctx.user.id)
          )
        )
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unknown attachment" });
      }
      if (row.status === "ready") {
        return { attachmentId: row.id, byteSize: row.byteSize };
      }

      // The declared size was never trusted — it only sized the upload target.
      // This is the real one, read back from storage.
      const actualSize = await getStorage().statObject(row.storageKey);

      if (actualSize === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The upload did not complete",
        });
      }

      if (actualSize > MAX_ATTACHMENT_BYTES) {
        await db
          .update(attachments)
          .set({ status: "failed" })
          .where(eq(attachments.id, row.id));
        await getStorage().deleteObject(row.storageKey).catch(() => undefined);

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Files must be ${formatBytes(MAX_ATTACHMENT_BYTES)} or smaller`,
        });
      }

      await db
        .update(attachments)
        .set({ status: "ready", byteSize: actualSize })
        .where(eq(attachments.id, row.id));

      return { attachmentId: row.id, byteSize: actualSize };
    }),

  /** Everything attached to one conversation — the media drawer's source. */
  listForConversation: authedQuery
    .input(z.object({ conversationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!(await isParticipant(ctx.user.id, input.conversationId, db))) return [];

      const rows = await db
        .select({
          id: attachments.id,
          storageKey: attachments.storageKey,
          fileName: attachments.fileName,
          mimeType: attachments.mimeType,
          byteSize: attachments.byteSize,
          createdAt: attachments.createdAt,
          messageId: attachments.messageId,
        })
        .from(attachments)
        .innerJoin(messages, eq(messages.id, attachments.messageId))
        .where(
          and(
            eq(messages.conversationId, input.conversationId),
            eq(attachments.status, "ready"),
            isNull(messages.deletedAt)
          )
        )
        .orderBy(attachments.id);

      return Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          messageId: row.messageId,
          fileName: row.fileName,
          mimeType: row.mimeType,
          byteSize: row.byteSize,
          createdAt: row.createdAt,
          isImage: isImageMimeType(row.mimeType),
          url: await downloadUrlFor(row),
        }))
      );
    }),
});
