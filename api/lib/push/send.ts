/**
 * Delivering a Web Push notification.
 *
 * The push service is a third party that can be slow, down, or holding a
 * subscription the browser abandoned months ago. So delivery is best-effort and
 * never blocks the message write that triggered it — a notification that fails
 * must not fail the message.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { pushSubscriptions } from "@db/schema";
import { getDb } from "../../queries/connection";
import { env } from "../env";
import { encryptPayload } from "./ece";
import { audienceFor, buildVapidHeader, type VapidKeyPair } from "./vapid";

/** How many consecutive rejections before a subscription is dropped. */
export const MAX_PUSH_FAILURES = 3;

/** TTL the push service should hold an undelivered message for. */
const PUSH_TTL_SECONDS = 24 * 60 * 60;

export function pushIsConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

function vapidKeys(): VapidKeyPair {
  return {
    publicKey: env.VAPID_PUBLIC_KEY!,
    privateKey: env.VAPID_PRIVATE_KEY!,
  };
}

export interface NotificationPayload {
  title: string;
  body: string;
  /** Where clicking the notification should land. */
  url: string;
  /** Collapses several notifications for one conversation into the latest. */
  tag: string;
  icon?: string;
}

export interface DeliveryResult {
  sent: number;
  pruned: number;
  failed: number;
}

interface Subscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send to one subscription.
 *
 * Returns `"gone"` when the push service says the subscription is dead — 404
 * or 410 are the documented "this endpoint will never work again" responses,
 * and 403 means the VAPID key no longer matches what the browser subscribed
 * with, which is equally terminal.
 */
async function deliverOne(
  subscription: Subscription,
  payload: NotificationPayload,
  fetchImpl: typeof fetch
): Promise<"sent" | "gone" | "failed"> {
  try {
    const body = encryptPayload({
      clientPublicKey: subscription.p256dh,
      clientAuthSecret: subscription.auth,
      payload: Buffer.from(JSON.stringify(payload), "utf8"),
    });

    const response = await fetchImpl(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: buildVapidHeader({
          audience: audienceFor(subscription.endpoint),
          subject: env.VAPID_SUBJECT,
          keys: vapidKeys(),
        }),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(PUSH_TTL_SECONDS),
        Urgency: "normal",
      },
      body: new Uint8Array(body),
    });

    if (response.ok) return "sent";
    if (response.status === 404 || response.status === 410 || response.status === 403) {
      return "gone";
    }
    return "failed";
  } catch {
    // A network error is transient; it must not prune a good subscription.
    return "failed";
  }
}

/**
 * Notify a set of members, skipping anyone with no subscription.
 *
 * Dead subscriptions are deleted immediately; transient failures increment a
 * counter and are dropped once they have failed consistently, so one bad night
 * at a push service does not sign everybody out of notifications.
 */
export async function sendToUsers(
  userIds: number[],
  payload: NotificationPayload,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, pruned: 0, failed: 0 };
  if (!pushIsConfigured() || userIds.length === 0) return result;

  const db = getDb();
  const subscriptions = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, [...new Set(userIds)]));

  if (subscriptions.length === 0) return result;

  const fetchImpl = options.fetchImpl ?? fetch;
  const outcomes = await Promise.all(
    subscriptions.map(async (subscription) => ({
      subscription,
      outcome: await deliverOne(subscription, payload, fetchImpl),
    }))
  );

  const gone = outcomes.filter((o) => o.outcome === "gone").map((o) => o.subscription.id);
  const failed = outcomes.filter((o) => o.outcome === "failed").map((o) => o.subscription.id);
  const sent = outcomes.filter((o) => o.outcome === "sent").map((o) => o.subscription.id);

  if (gone.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  }

  if (failed.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(inArray(pushSubscriptions.id, failed));

    // Prune anything that has now failed too many times in a row.
    const exhausted = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(
        and(
          inArray(pushSubscriptions.id, failed),
          sql`${pushSubscriptions.failureCount} >= ${MAX_PUSH_FAILURES}`
        )
      );

    if (exhausted.length > 0) {
      await db.delete(pushSubscriptions).where(
        inArray(
          pushSubscriptions.id,
          exhausted.map((r) => r.id)
        )
      );
      result.pruned += exhausted.length;
    }
  }

  if (sent.length > 0) {
    // A success clears the failure counter: the run of failures is what
    // matters, not the lifetime total.
    await db
      .update(pushSubscriptions)
      .set({ lastUsedAt: new Date(), failureCount: 0 })
      .where(inArray(pushSubscriptions.id, sent));
  }

  result.sent = sent.length;
  result.pruned += gone.length;
  result.failed = failed.length;
  return result;
}

/** Remove one subscription by endpoint — what "turn off notifications" does. */
export async function removeSubscription(userId: number, endpoint: string): Promise<void> {
  await getDb()
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))
    );
}
