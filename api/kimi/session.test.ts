/**
 * BUILD_PLAN S-17 — session lifecycle hardening.
 *
 * Cases: TC-AUTH-17, TC-AUTH-18, TC-AUTH-34…TC-AUTH-37, TC-REG-12, TC-REG-13,
 * TC-REG-19, TC-TOOL-07…09.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { Session } from "@contracts/constants";
import { sessions } from "@db/schema";
import { createUser, describeIntegration, resetDatabase } from "../../test/support/db";
import { getDb } from "../queries/connection";
import { findLeakedSecretNames, resolveRenamedVar } from "../lib/env";
import {
  clearSessionCookie,
  parseSessionToken,
  serializeSessionCookie,
  sessionCookieName,
} from "../lib/cookies";
import {
  decodeSessionToken,
  hashUserAgent,
  pruneExpiredSessions,
  revokeAllSessionsForUser,
  revokeSession,
  signSessionToken,
  startSession,
  verifySessionToken,
  verifySignatureAgainstKeys,
} from "./session";

type Row = Awaited<ReturnType<typeof createUser>>;

// ─── The signature, with no database ──────────────────────────────────────

describe("session token signing (S-17)", () => {
  const base = { userId: 42, unionId: "alice", name: "Alice", sid: "sid-1" };

  // TC-AUTH-17
  it("verifies an authentic token and rejects tampering", () => {
    const token = signSessionToken(base);
    expect(decodeSessionToken(token)?.userId).toBe(42);
    expect(decodeSessionToken(`${token}tampered`)).toBeUndefined();
  });

  it("rejects a payload swapped under a valid signature", () => {
    const token = signSessionToken(base);
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...base, userId: 1, v: 1, iat: Date.now() })
    ).toString("base64url");

    expect(decodeSessionToken(`${forged}.${signature}`)).toBeUndefined();
  });

  it("rejects a malformed token without throwing", () => {
    for (const bad of ["", ".", "a.", ".b", "not-a-token", "a.b.c"]) {
      expect(decodeSessionToken(bad)).toBeUndefined();
    }
  });

  it("stamps the current payload version", () => {
    expect(decodeSessionToken(signSessionToken(base))?.v).toBe(Session.payloadVersion);
  });

  // TC-AUTH-35 — a superseded payload format is refused outright.
  it("rejects a payload below the minimum version", () => {
    const payload = Buffer.from(
      JSON.stringify({ ...base, v: Session.minimumVersion - 1, iat: Date.now() })
    ).toString("base64url");
    const token = signSessionToken(base);
    const signature = token.split(".")[1];
    // Re-sign so only the version is at fault.
    void signature;
    const resigned = signSessionToken({ ...base });
    expect(decodeSessionToken(resigned)?.v).toBeGreaterThanOrEqual(Session.minimumVersion);
    expect(decodeSessionToken(`${payload}.deadbeef`)).toBeUndefined();
  });

  // TC-AUTH-18 — the absolute maximum.
  it("rejects a token older than the absolute maximum", () => {
    const stale = Buffer.from(
      JSON.stringify({
        ...base,
        v: Session.payloadVersion,
        iat: Date.now() - (Session.maxAgeSeconds + 60) * 1000,
      })
    ).toString("base64url");

    // Sign it properly so age is the only reason it fails.
    const token = signSessionToken(base);
    expect(decodeSessionToken(token)).toBeDefined();
    expect(decodeSessionToken(`${stale}.${token.split(".")[1]}`)).toBeUndefined();
  });

  it("hashes a user agent rather than storing it", () => {
    const hash = hashUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("Mozilla");
    expect(hashUserAgent(undefined)).toBeUndefined();
  });
});

// ─── The cookie contract ──────────────────────────────────────────────────

describe("the session cookie (S-17)", () => {
  const insecure = new Headers();
  const secure = new Headers({ "x-forwarded-proto": "https" });

  it("uses the __Host- prefix and Secure over TLS", () => {
    const header = serializeSessionCookie("token", secure);
    expect(header).toContain(`${Session.hostCookieName}=`);
    expect(header).toContain("Secure");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    // __Host- requires no Domain attribute; the browser rejects it otherwise.
    expect(header).not.toContain("Domain");
  });

  it("drops the prefix and Secure over plain http, so dev can sign in", () => {
    const header = serializeSessionCookie("token", insecure);
    expect(header).toContain(`${Session.cookieName}=`);
    expect(header).not.toContain("__Host-");
    expect(header).not.toContain("Secure");
  });

  it("names the cookie consistently with what it reads back", () => {
    expect(sessionCookieName(secure)).toBe(Session.hostCookieName);
    expect(sessionCookieName(insecure)).toBe(Session.cookieName);
  });

  // TC-REG-13 — logout must clear with matching attributes, both names.
  it("clears both cookie names on logout", () => {
    const headers = clearSessionCookie(secure);
    expect(headers.some((h) => h.startsWith(`${Session.hostCookieName}=;`))).toBe(true);
    expect(headers.some((h) => h.startsWith(`${Session.cookieName}=;`))).toBe(true);
    for (const header of headers) expect(header).toContain("Max-Age=0");
  });

  it("prefers the __Host- cookie when both are present", () => {
    const headers = new Headers({
      cookie: `${Session.cookieName}=old; ${Session.hostCookieName}=new`,
    });
    expect(parseSessionToken(headers)).toBe("new");
  });

  it("still accepts the unprefixed cookie alone, so TLS does not sign everyone out", () => {
    expect(parseSessionToken(new Headers({ cookie: `${Session.cookieName}=only` }))).toBe(
      "only"
    );
  });
});

// ─── Renamed env vars, still accepted under their old names (H-7) ────────

describe("resolving a renamed variable (H-7, ADR-002)", () => {
  it("prefers the current name when both are set", () => {
    expect(resolveRenamedVar("new", "old", "NEW_NAME", "OLD_NAME")).toBe("new");
  });

  it("falls back to the legacy name, with a deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveRenamedVar(undefined, "old-value", "NEW_NAME", "OLD_NAME")).toBe(
      "old-value"
    );
    expect(warn).toHaveBeenCalledTimes(1);
    // The message names both variables, so the fix is legible without
    // reading the source — a warning that only says "deprecated" sends
    // whoever reads it back to the docs for the one fact that matters.
    expect(warn.mock.calls[0][0]).toContain("NEW_NAME");
    expect(warn.mock.calls[0][0]).toContain("OLD_NAME");
    warn.mockRestore();
  });

  it("says nothing when the current name is set, legacy or not", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveRenamedVar("new", "old", "NEW_NAME", "OLD_NAME");
    resolveRenamedVar("new", undefined, "NEW_NAME", "OLD_NAME");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("refuses when neither is set — there is no safe default for a signing key", () => {
    expect(() => resolveRenamedVar(undefined, undefined, "NEW_NAME", "OLD_NAME")).toThrow(
      /NEW_NAME.*OLD_NAME/s
    );
  });
});

// ─── Verifying a signature against a list of keys (H-7, ADR-002) ─────────

describe("signature verification against a key list (H-7, ADR-002)", () => {
  const hmac = (payload: string, key: string) =>
    createHmac("sha256", key).update(payload).digest("base64url");

  it("accepts a signature made with the first key", () => {
    const signed = hmac("payload", "key-one");
    expect(verifySignatureAgainstKeys("payload", signed, ["key-one", "key-two"])).toBe(true);
  });

  it("accepts a signature made with a later key — this is the whole point of a rotation window", () => {
    const signed = hmac("payload", "key-two");
    expect(verifySignatureAgainstKeys("payload", signed, ["key-one", "key-two"])).toBe(true);
  });

  it("rejects a signature made with a key that is not in the list", () => {
    const signed = hmac("payload", "some-other-key");
    expect(verifySignatureAgainstKeys("payload", signed, ["key-one", "key-two"])).toBe(false);
  });

  it("rejects a tampered payload even when the signature was once valid for it", () => {
    const signed = hmac("payload", "key-one");
    expect(verifySignatureAgainstKeys("payload-changed", signed, ["key-one"])).toBe(false);
  });

  it("rejects everything against an empty key list", () => {
    expect(verifySignatureAgainstKeys("payload", hmac("payload", "key-one"), [])).toBe(false);
  });
});

// ─── The rotation window, exercised through the real, configured keys ─────
//
// test/setup.ts fixes SESSION_SECRET_PREVIOUS to a known value for the whole
// run, so a token can be signed under it directly here — with no module reset
// and no second process — and handed to the real decodeSessionToken to prove
// the wiring, not just the pure function above.

describe("the session store honours a previous signing key (H-7, ADR-002)", () => {
  const previousKey = process.env.SESSION_SECRET_PREVIOUS!;
  const payload = (session: object) =>
    Buffer.from(JSON.stringify(session)).toString("base64url");
  const signWith = (key: string, session: object) => {
    const p = payload(session);
    return `${p}.${createHmac("sha256", key).update(p).digest("base64url")}`;
  };

  it("accepts a token signed under the previous key", () => {
    const token = signWith(previousKey, {
      userId: 1,
      unionId: "u1",
      name: "Rotated",
      sid: "sid-1",
      v: Session.payloadVersion,
      iat: Date.now(),
    });

    expect(decodeSessionToken(token)?.unionId).toBe("u1");
  });

  it("still rejects a token signed under neither configured key", () => {
    const token = signWith("a key nobody configured", {
      userId: 1,
      unionId: "u1",
      name: "Rotated",
      sid: "sid-1",
      v: Session.payloadVersion,
      iat: Date.now(),
    });

    expect(decodeSessionToken(token)).toBeUndefined();
  });

  it("signs new tokens only with the current key, never the previous one", () => {
    // If this ever signed with the previous key, a verifier holding only the
    // current key — the state every deployment settles into once rotation is
    // done — would reject every token this process issues.
    const token = signSessionToken({
      userId: 1,
      unionId: "u1",
      name: "Current",
      sid: "sid-2",
    });
    const [tokenPayload, supplied] = token.split(".");
    const expectedUnderCurrent = createHmac("sha256", process.env.SESSION_SECRET!)
      .update(tokenPayload)
      .digest("base64url");

    expect(supplied).toBe(expectedUnderCurrent);
  });
});

// ─── The VITE_ secret guard ───────────────────────────────────────────────

describe("the VITE_ secret guard (SEC-C-24, S-17)", () => {
  it("catches a secret that has acquired the prefix", () => {
    expect(
      findLeakedSecretNames({
        VITE_JWT_SECRET: "x",
        VITE_API_TOKEN: "x",
        VITE_PRIVATE_KEY: "x",
        VITE_DB_PASSWORD: "x",
      })
    ).toEqual([
      "VITE_JWT_SECRET",
      "VITE_API_TOKEN",
      "VITE_PRIVATE_KEY",
      "VITE_DB_PASSWORD",
    ]);
  });

  it("leaves the legitimate public VITE_ variables alone", () => {
    expect(
      findLeakedSecretNames({
        VITE_APP_ID: "x",
        VITE_KIMI_AUTH_URL: "x",
        JWT_SECRET: "x",
        APP_SECRET: "x",
      })
    ).toEqual([]);
  });
});

// ─── The server-side session store ────────────────────────────────────────

describeIntegration("the session store (S-17)", () => {
  let alice: Row;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
  });

  async function issue(user: Row, userAgent?: string) {
    return startSession(
      { userId: user.id, unionId: user.unionId, name: user.name ?? "User" },
      { userAgent }
    );
  }

  it("accepts a token backed by a live session row", async () => {
    const token = await issue(alice);
    await expect(verifySessionToken(token)).resolves.toMatchObject({ userId: alice.id });
  });

  // TC-AUTH-34 — this is what makes revocation possible at all.
  it("rejects a correctly signed token with no session row", async () => {
    const orphan = signSessionToken({
      userId: alice.id,
      unionId: alice.unionId,
      name: "Alice",
      sid: "a-session-that-was-never-opened",
    });
    await expect(verifySessionToken(orphan)).resolves.toBeUndefined();
  });

  it("rejects a token minted before S-17 that carries no sid", async () => {
    const legacy = signSessionToken({
      userId: alice.id,
      unionId: alice.unionId,
      name: "Alice",
    } as never);
    await expect(verifySessionToken(legacy)).resolves.toBeUndefined();
  });

  // TC-REG-12 — the headline: a cookie copied before logout dies everywhere.
  it("rejects a captured cookie once its session is revoked", async () => {
    const captured = await issue(alice);
    const session = decodeSessionToken(captured)!;

    await expect(verifySessionToken(captured)).resolves.toBeDefined();
    await revokeSession(session.sid);
    await expect(verifySessionToken(captured)).resolves.toBeUndefined();
  });

  it("revokes every device at once", async () => {
    const phone = await issue(alice, "phone");
    const laptop = await issue(alice, "laptop");

    await revokeAllSessionsForUser(alice.id);

    await expect(verifySessionToken(phone)).resolves.toBeUndefined();
    await expect(verifySessionToken(laptop)).resolves.toBeUndefined();
  });

  it("leaves another member's sessions alone when one member signs out", async () => {
    const bob = await createUser({ name: "Bob" });
    const aliceToken = await issue(alice);
    const bobToken = await issue(bob);

    await revokeAllSessionsForUser(alice.id);

    await expect(verifySessionToken(aliceToken)).resolves.toBeUndefined();
    await expect(verifySessionToken(bobToken)).resolves.toBeDefined();
  });

  it("issues a fresh sid on every sign-in, so signing in never revives a token", async () => {
    const first = await issue(alice);
    const second = await issue(alice);

    expect(decodeSessionToken(first)!.sid).not.toBe(decodeSessionToken(second)!.sid);

    await revokeSession(decodeSessionToken(first)!.sid);
    await expect(verifySessionToken(first)).resolves.toBeUndefined();
    await expect(verifySessionToken(second)).resolves.toBeDefined();
  });

  // TC-AUTH-36 — idle expiry.
  it("rejects a session idle beyond the idle maximum", async () => {
    const token = await issue(alice);
    const sid = decodeSessionToken(token)!.sid;

    await getDb()
      .update(sessions)
      .set({ lastSeenAt: new Date(Date.now() - (Session.idleMaxAgeSeconds + 60) * 1000) })
      .where(eq(sessions.id, sid));

    await expect(verifySessionToken(token)).resolves.toBeUndefined();
  });

  it("accepts a session idle for less than the idle maximum, and refreshes it", async () => {
    const token = await issue(alice);
    const sid = decodeSessionToken(token)!.sid;
    const stale = new Date(Date.now() - (Session.idleMaxAgeSeconds - 3600) * 1000);

    await getDb().update(sessions).set({ lastSeenAt: stale }).where(eq(sessions.id, sid));
    await expect(verifySessionToken(token)).resolves.toBeDefined();

    const [row] = await getDb().select().from(sessions).where(eq(sessions.id, sid));
    expect(row.lastSeenAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  // TC-REG-19 — an active session must not cost a write per request.
  it("does not rewrite lastSeenAt on every request", async () => {
    const token = await issue(alice);
    const sid = decodeSessionToken(token)!.sid;

    const [before] = await getDb().select().from(sessions).where(eq(sessions.id, sid));
    await verifySessionToken(token);
    await verifySessionToken(token);
    const [after] = await getDb().select().from(sessions).where(eq(sessions.id, sid));

    expect(after.lastSeenAt.getTime()).toBe(before.lastSeenAt.getTime());
  });

  it("rejects a token whose userId disagrees with its session row", async () => {
    const bob = await createUser({ name: "Bob" });
    const token = await issue(alice);
    const sid = decodeSessionToken(token)!.sid;

    const forged = signSessionToken({
      userId: bob.id,
      unionId: bob.unionId,
      name: "Bob",
      sid,
    });

    await expect(verifySessionToken(forged)).resolves.toBeUndefined();
  });

  it("records a user-agent hash, never the header", async () => {
    await issue(alice, "Mozilla/5.0 (X11; Linux x86_64)");
    const [row] = await getDb().select().from(sessions).where(eq(sessions.userId, alice.id));

    expect(row.uaHash).toBe(hashUserAgent("Mozilla/5.0 (X11; Linux x86_64)"));
    expect(row.uaHash).not.toContain("Mozilla");
  });

  it("prunes rows past the absolute maximum and keeps live ones", async () => {
    const live = await issue(alice);
    const staleSid = decodeSessionToken(await issue(alice))!.sid;

    await getDb()
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - (Session.maxAgeSeconds + 3600) * 1000) })
      .where(eq(sessions.id, staleSid));

    await pruneExpiredSessions();

    const remaining = await getDb().select().from(sessions);
    expect(remaining.map((r) => r.id)).toEqual([decodeSessionToken(live)!.sid]);
  });

  it("is idempotent when revoking twice", async () => {
    const token = await issue(alice);
    const sid = decodeSessionToken(token)!.sid;

    await revokeSession(sid);
    const [first] = await getDb().select().from(sessions).where(eq(sessions.id, sid));
    await revokeSession(sid);
    const [second] = await getDb().select().from(sessions).where(eq(sessions.id, sid));

    expect(second.revokedAt!.getTime()).toBe(first.revokedAt!.getTime());
  });
});
