/**
 * Profile and account settings (BUILD_PLAN P-PROF-1).
 *
 * `users.name`, `users.avatar` and `users.status` were written once at sign-in
 * from the OAuth provider and could never be changed — "View Profile" was a
 * menu item that did nothing until F-8 removed it.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { getDb } from "./queries/connection";
import { attachments, users } from "@db/schema";
import { buildStorageKey, getStorage, sanitizeFileName } from "./lib/storage";
import { Limits } from "./lib/rate-limit";
import { emitToMembers } from "./lib/realtime";
import { conversationParticipants } from "@db/schema";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_AVATAR_BYTES,
  MAX_FILE_NAME_LENGTH,
} from "@contracts/attachments";
import { MAX_DISPLAY_NAME_LENGTH, MAX_STATUS_LENGTH } from "@contracts/constants";

/** Tell everyone who can see this member that their profile changed. */
async function announceProfileChange(userId: number): Promise<void> {
  const rows = await getDb()
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId));

  for (const { conversationId } of rows) {
    await emitToMembers(conversationId, "conversationUpdated", { conversationId });
  }
}

export const userRouter = createRouter({
  /** The caller's own profile, including the fields `auth.me` deliberately omits. */
  myProfile: authedQuery.query(({ ctx }) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    status: ctx.user.status,
    hasUploadedAvatar: Boolean(ctx.user.avatarKey),
    avatarUrl: ctx.user.avatarKey ? `/api/avatar/${ctx.user.id}` : ctx.user.avatar,
    createdAt: ctx.user.createdAt,
  })),

  updateProfile: authedQuery
    .input(
      z.object({
        name: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
        status: z.string().trim().max(MAX_STATUS_LENGTH).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.name === undefined && input.status === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to update" });
      }

      await getDb()
        .update(users)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where(eq(users.id, ctx.user.id));

      // The name appears on every message the member has ever sent, so an open
      // client needs to know rather than wait for its next refetch.
      await announceProfileChange(ctx.user.id);

      return { name: input.name ?? ctx.user.name, status: input.status ?? ctx.user.status };
    }),

  /**
   * An upload target for an avatar.
   *
   * Separate from `attachment.createUpload` because that one is scoped to a
   * conversation the caller belongs to, and an avatar belongs to nothing. The
   * limits are tighter: images only, and much smaller than a file attachment.
   */
  createAvatarUpload: rateLimited("user.avatarUpload", Limits.uploadInit)
    .input(
      z.object({
        fileName: z.string().trim().min(1).max(MAX_FILE_NAME_LENGTH),
        mimeType: z.enum(ALLOWED_IMAGE_TYPES),
        byteSize: z.number().int().positive().max(MAX_AVATAR_BYTES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const fileName = sanitizeFileName(input.fileName);
      const key = buildStorageKey(ctx.user.id, fileName);

      const target = await getStorage().createUploadTarget({
        key,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
      });

      const [result] = await db.insert(attachments).values({
        uploaderId: ctx.user.id,
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
      };
    }),

  /** Adopt an uploaded image as the avatar. */
  setAvatar: authedQuery
    .input(z.object({ attachmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [row] = await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.id, input.attachmentId),
            eq(attachments.uploaderId, ctx.user.id),
            isNull(attachments.messageId)
          )
        )
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown upload" });
      }

      const actualSize = await getStorage().statObject(row.storageKey);
      if (actualSize === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The upload did not complete" });
      }
      if (actualSize > MAX_AVATAR_BYTES) {
        await getStorage().deleteObject(row.storageKey).catch(() => undefined);
        throw new TRPCError({ code: "BAD_REQUEST", message: "That image is too large" });
      }

      const previousKey = ctx.user.avatarKey;

      await db
        .update(attachments)
        .set({ status: "ready", byteSize: actualSize })
        .where(eq(attachments.id, row.id));
      await db
        .update(users)
        .set({ avatarKey: row.storageKey })
        .where(eq(users.id, ctx.user.id));

      // The old image is now unreachable, so it goes rather than accumulating
      // one orphan per avatar change.
      if (previousKey && previousKey !== row.storageKey) {
        await getStorage().deleteObject(previousKey).catch(() => undefined);
        await db.delete(attachments).where(eq(attachments.storageKey, previousKey));
      }

      await announceProfileChange(ctx.user.id);
      return { avatarUrl: `/api/avatar/${ctx.user.id}` };
    }),

  /** Drop the uploaded avatar, falling back to the provider's picture. */
  clearAvatar: authedQuery.mutation(async ({ ctx }) => {
    const key = ctx.user.avatarKey;
    if (!key) return { avatarUrl: ctx.user.avatar };

    await getDb().update(users).set({ avatarKey: null }).where(eq(users.id, ctx.user.id));
    await getStorage().deleteObject(key).catch(() => undefined);
    await getDb().delete(attachments).where(eq(attachments.storageKey, key));

    await announceProfileChange(ctx.user.id);
    return { avatarUrl: ctx.user.avatar };
  }),
});
