/**
 * Token-bucket rate limiting (BUILD_PLAN S-13, SECURITY.md §8).
 *
 * There was none. Every endpoint accepted requests as fast as they arrived, so
 * one client could exhaust the connection pool, flood a conversation, or walk
 * the user directory three characters at a time.
 *
 * A bucket holds `capacity` tokens and refills at `refillPerSecond`. Capacity
 * is the burst a legitimate client is allowed; the refill rate is what it may
 * sustain. Both matter: a rate alone punishes normal bursty use, and a burst
 * alone is no limit at all.
 *
 * **Storage is in-process, and that is a real limitation.** With two replicas
 * each holds its own buckets, so the effective limit doubles. Presence has the
 * same shape (`api/socket.ts`), and both are fixed by the same Redis that S-19
 * introduces when the ADR-006 trigger fires. Until then this deployment is
 * single-node by design and the limits are honest.
 */

export interface BucketPolicy {
  /** Burst size. */
  capacity: number;
  /** Sustained rate. */
  refillPerSecond: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Tokens left after this call, rounded down. */
  remaining: number;
  /** Milliseconds until the next token, when refused. */
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
  /** Kept so the sweep can tell a refilled bucket from a nearly-empty one. */
  capacity: number;
  refillPerSecond: number;
}

const buckets = new Map<string, Bucket>();

/** How long a *fully refilled* bucket may sit before it is dropped. */
const IDLE_EVICTION_MS = 60 * 60 * 1000;

export function perDay(count: number): BucketPolicy {
  return { capacity: count, refillPerSecond: count / 86_400 };
}

export function perMinutes(count: number, minutes: number): BucketPolicy {
  return { capacity: count, refillPerSecond: count / (minutes * 60) };
}

/**
 * Take one token from `surface:subject`.
 *
 * Never throws and never blocks: callers decide what refusal means, because it
 * differs by surface — a refused `typing` is dropped silently, a refused
 * `message.send` is an error the member should see.
 */
export function consume(
  surface: string,
  subject: string | number,
  policy: BucketPolicy,
  now = Date.now()
): RateLimitResult {
  const key = `${surface}:${subject}`;
  const bucket = buckets.get(key) ?? {
    tokens: policy.capacity,
    updatedAt: now,
    capacity: policy.capacity,
    refillPerSecond: policy.refillPerSecond,
  };

  const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000;
  const tokens = Math.min(
    policy.capacity,
    bucket.tokens + elapsedSeconds * policy.refillPerSecond
  );

  if (tokens < 1) {
    buckets.set(key, { ...bucket, tokens, updatedAt: now });
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.ceil(((1 - tokens) / policy.refillPerSecond) * 1000),
    };
  }

  buckets.set(key, { ...bucket, tokens: tokens - 1, updatedAt: now });
  return { allowed: true, remaining: Math.floor(tokens - 1), retryAfterMs: 0 };
}

/**
 * Drop buckets that have fully refilled and gone quiet.
 *
 * A full bucket is indistinguishable from no bucket at all, so evicting one
 * changes no decision and bounds the map — which would otherwise grow by one
 * entry per key ever seen. A bucket that has *not* refilled must be kept, or
 * the sweep would hand back an allowance the member already spent; that is why
 * each bucket carries its own policy, since a per-day limit takes a day to
 * refill and a per-second one takes a second.
 */
export function sweep(now = Date.now()): number {
  let removed = 0;

  for (const [key, bucket] of buckets) {
    const idleMs = now - bucket.updatedAt;
    const refilled = bucket.tokens + (idleMs / 1000) * bucket.refillPerSecond;

    if (refilled >= bucket.capacity && idleMs > IDLE_EVICTION_MS) {
      buckets.delete(key);
      removed += 1;
    }
  }

  return removed;
}

/** Tests only: forget every bucket. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Tests and diagnostics: how many buckets are held. */
export function bucketCount(): number {
  return buckets.size;
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startRateLimitSweep(intervalMs = 10 * 60 * 1000): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => sweep(), intervalMs);
  sweepTimer.unref?.();
}

export function stopRateLimitSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

/**
 * The policies from SECURITY.md §8, in one place so a limit is never
 * invented at a call site.
 */
export const Limits = {
  oauthCallback: perMinutes(10, 10),
  oauthLogin: perMinutes(20, 10),
  logout: perMinutes(10, 1),
  messageSendPerUser: { capacity: 20, refillPerSecond: 5 },
  messageSendPerConversation: { capacity: 10, refillPerSecond: 3 },
  typing: { capacity: 5, refillPerSecond: 0.5 },
  markAsRead: { capacity: 30, refillPerSecond: 10 },
  joinConversation: { capacity: 30, refillPerSecond: 10 },
  contactAdd: perDay(20),
  // Two buckets: a per-second one that stops a tight loop, and a daily one
  // that stops a slow crawl of the directory. Both must allow the call.
  searchBurst: { capacity: 10, refillPerSecond: 1 },
  searchDaily: perDay(300),
  createGroup: { capacity: 5, refillPerSecond: 20 / 86_400 },
  createDirect: { capacity: 10, refillPerSecond: 50 / 86_400 },
  uploadInit: { capacity: 5, refillPerSecond: 50 / 86_400 },
} as const satisfies Record<string, BucketPolicy>;

/** Concurrent socket connection caps, which are counts rather than buckets. */
export const SOCKET_CONNECTION_LIMITS = {
  perUser: 10,
  perIp: 20,
} as const;
