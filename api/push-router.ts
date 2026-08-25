/**
 * Push subscription management (BUILD_PLAN F-6).
 *
 * The browser produces the subscription — endpoint plus two keys — and hands it
 * here to be stored against the member. `p256dh` and `auth` are secrets: they
 * are written and read only by the send path, and no procedure ever returns
 * them.
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { pushSubscriptions } from "@db/schema";
import { env } from "./lib/env";
import { hashUserAgent } from "./kimi/session";
import { pushIsConfigured, removeSubscription } from "./lib/push/send";

export const pushRouter = createRouter({
  /**
   * What the client needs before it can subscribe.
   *
   * The public key is public by definition — the browser sends it to the push
   * service. `enabled` lets the UI hide the whole feature rather than offer a
   * toggle that cannot work on a deployment with no keys configured.
   */
  config: authedQuery.query(() => ({
    enabled: pushIsConfigured(),
    publicKey: env.VAPID_PUBLIC_KEY ?? null,
  })),

  subscribe: authedQuery
    .input(
      z.object({
        endpoint: z.string().url().max(512),
        p256dh: z.string().min(1).max(255),
        auth: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // The endpoint is unique across the table, not per member: a browser that
      // re-subscribes after a member signs out and another signs in on the same
      // device must move to the new owner, not be duplicated. The upsert
      // rewrites the owner along with the keys.
      await db
        .insert(pushSubscriptions)
        .values({
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: hashUserAgent(ctx.userAgent) ?? null,
        })
        .onDuplicateKeyUpdate({
          set: {
            userId: ctx.user.id,
            p256dh: input.p256dh,
            auth: input.auth,
            failureCount: 0,
          },
        });

      return { success: true };
    }),

  unsubscribe: authedQuery
    .input(z.object({ endpoint: z.string().url().max(512) }))
    .mutation(async ({ ctx, input }) => {
      await removeSubscription(ctx.user.id, input.endpoint);
      return { success: true };
    }),

  /** Whether this browser's endpoint is currently registered. */
  status: authedQuery
    .input(z.object({ endpoint: z.string().url().max(512) }))
    .query(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, ctx.user.id),
            eq(pushSubscriptions.endpoint, input.endpoint)
          )
        )
        .limit(1);

      return { subscribed: Boolean(row) };
    }),
});
