/**
 * Session issue and verification.
 *
 * The token is a signed, self-contained payload — but a self-contained token
 * cannot be revoked, which is why `/api/logout` used to clear only the caller's
 * own cookie while a copy taken beforehand stayed valid on every other device
 * for the full seven days. Since S-17 the payload carries a `sid` that is
 * resolved against the `sessions` table on every request, so revocation is
 * immediate and idle expiry is possible.
 *
 * Three independent things must hold for a token to be accepted:
 *   1. the HMAC verifies and the payload version is current;
 *   2. the absolute lifetime (7 days from `iat`) has not elapsed;
 *   3. the session row exists, is not revoked, and was used within 24 hours.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { Session } from "@contracts/constants";
import { sessions } from "@db/schema";
import { getDb } from "../queries/connection";
import { env } from "../lib/env";
import { parseSessionToken } from "../lib/cookies";
import type { SessionData } from "./types";

export function getSessionToken(headers: Headers): string | undefined {
  return parseSessionToken(headers);
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signature(payload: string) {
  return createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
}

/** A hash of the user agent — never the header itself. */
export function hashUserAgent(userAgent: string | null | undefined): string | undefined {
  if (!userAgent) return undefined;
  return createHash("sha256").update(userAgent).digest("hex").slice(0, 64);
}

/**
 * Open a session: write the server-side row, then sign a token naming it.
 *
 * A fresh `sid` on every sign-in is the rotation requirement — an old token is
 * never revived by signing in again.
 */
export async function startSession(
  session: Omit<SessionData, "iat" | "sid" | "v">,
  options: { userAgent?: string | null } = {}
): Promise<string> {
  const sid = randomBytes(32).toString("base64url");

  await getDb().insert(sessions).values({
    id: sid,
    userId: session.userId,
    uaHash: hashUserAgent(options.userAgent),
  });

  return signSessionToken({ ...session, sid });
}

/** Sign a payload. Exported for tests; production goes through `startSession`. */
export function signSessionToken(session: Omit<SessionData, "iat" | "v">): string {
  const payload = encode(
    JSON.stringify({ ...session, v: Session.payloadVersion, iat: Date.now() })
  );
  return `${payload}.${signature(payload)}`;
}

/**
 * Verify the signature and the absolute lifetime. No database access.
 *
 * Split out from `verifySessionToken` so the purely cryptographic half stays
 * synchronous and independently testable.
 */
export function decodeSessionToken(token: string): SessionData | undefined {
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return undefined;

  const expected = signature(payload);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;

  let session: SessionData;
  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionData;
  } catch {
    return undefined;
  }

  if (!session.unionId) return undefined;
  // A token issued under a superseded payload format is rejected outright, so a
  // format change does not have to wait out the absolute maximum.
  if ((session.v ?? 0) < Session.minimumVersion) return undefined;
  if (Date.now() - session.iat > Session.maxAgeSeconds * 1000) return undefined;

  return session;
}

/**
 * Full verification: signature, absolute lifetime, revocation, idle lifetime.
 *
 * Returns `undefined` for every failure. The caller has no right to know which
 * of the four conditions failed.
 */
export async function verifySessionToken(token: string): Promise<SessionData | undefined> {
  const session = decodeSessionToken(token);
  if (!session) return undefined;

  // A token minted before S-17 carries no `sid`. It cannot be revoked, so it is
  // not honoured; the holder signs in again and gets one that can be.
  if (!session.sid) return undefined;

  const db = getDb();
  const [row] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      lastSeenAt: sessions.lastSeenAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(eq(sessions.id, session.sid))
    .limit(1);

  if (!row || row.revokedAt) return undefined;
  if (row.userId !== session.userId) return undefined;

  const now = Date.now();
  const idleMs = now - row.lastSeenAt.getTime();
  if (idleMs > Session.idleMaxAgeSeconds * 1000) return undefined;

  // Refresh at most once per interval: an active session would otherwise cost a
  // write on every single request.
  if (idleMs > Session.lastSeenRefreshSeconds * 1000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(sessions.id, session.sid));
  }

  return session;
}

/** Revoke one session. Idempotent. */
export async function revokeSession(sid: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sid), isNull(sessions.revokedAt)));
}

/** Revoke every session belonging to a user — "sign out everywhere". */
export async function revokeAllSessionsForUser(userId: number): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/**
 * Delete rows that can no longer authenticate anything.
 *
 * Nothing schedules this yet; S-15 owns the operational job. It lives here so
 * the table has a defined retention story rather than growing without bound.
 */
export async function pruneExpiredSessions(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - Session.maxAgeSeconds * 1000);
  await getDb().delete(sessions).where(lt(sessions.createdAt, cutoff));
}
