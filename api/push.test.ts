/**
 * BUILD_PLAN F-6 — subscription management and delivery.
 *
 * The encryption and VAPID signing are pinned separately against their RFC
 * vectors. These cover what surrounds them: who is notified, who is not, and
 * that a dead subscription is pruned rather than retried forever.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pushSubscriptions } from "@db/schema";
import {
  createConversation,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import { getDb } from "./queries/connection";
import { appRouter } from "./router";
import { MAX_PUSH_FAILURES, sendToUsers } from "./lib/push/send";
import { audienceFor, buildVapidHeader, generateVapidKeys, assertKeyPairMatches } from "./lib/push/vapid";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

// A real P-256 subscription, so the encryption path runs for real.
const SUBSCRIPTION = {
  p256dh:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
};

describeIntegration("web push (F-6)", () => {
  let alice: Row;
  let bob: Row;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    // The VAPID pair comes from test/setup.ts: env is parsed at import time,
    // so setting it here would be too late for `pushIsConfigured()`.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function subscribe(user: Row, endpoint: string) {
    await caller(user).push.subscribe({ endpoint, ...SUBSCRIPTION });
  }

  async function rows() {
    return getDb().select().from(pushSubscriptions);
  }

  // ── Subscription management ─────────────────────────────────────────────
  it("stores a subscription and reports it back as subscribed", async () => {
    await subscribe(alice, "https://push.example.test/a");

    expect(await rows()).toHaveLength(1);
    await expect(
      caller(alice).push.status({ endpoint: "https://push.example.test/a" })
    ).resolves.toEqual({ subscribed: true });
  });

  it("never returns the keying material to anyone", async () => {
    await subscribe(alice, "https://push.example.test/a");

    const config = await caller(alice).push.config();
    const status = await caller(alice).push.status({
      endpoint: "https://push.example.test/a",
    });

    expect(JSON.stringify({ config, status })).not.toContain(SUBSCRIPTION.auth);
    expect(JSON.stringify({ config, status })).not.toContain(SUBSCRIPTION.p256dh);
  });

  it("re-subscribing the same endpoint updates rather than duplicating", async () => {
    await subscribe(alice, "https://push.example.test/a");
    await subscribe(alice, "https://push.example.test/a");

    expect(await rows()).toHaveLength(1);
  });

  it("moves an endpoint to the new owner when a device changes hands", async () => {
    await subscribe(alice, "https://push.example.test/shared-device");
    await subscribe(bob, "https://push.example.test/shared-device");

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].userId).toBe(bob.id);
    // Alice must not still be notified on a device she signed out of.
    await expect(
      caller(alice).push.status({ endpoint: "https://push.example.test/shared-device" })
    ).resolves.toEqual({ subscribed: false });
  });

  it("unsubscribes only the caller's own endpoint", async () => {
    await subscribe(alice, "https://push.example.test/a");
    await subscribe(bob, "https://push.example.test/b");

    await caller(alice).push.unsubscribe({ endpoint: "https://push.example.test/b" });
    expect(await rows()).toHaveLength(2);

    await caller(alice).push.unsubscribe({ endpoint: "https://push.example.test/a" });
    expect(await rows()).toHaveLength(1);
  });

  it("drops a member's subscriptions when their account goes", async () => {
    await subscribe(alice, "https://push.example.test/a");
    await getDb().delete(await import("@db/schema").then((m) => m.users));
    expect(await rows()).toHaveLength(0);
  });

  // ── Delivery ────────────────────────────────────────────────────────────
  it("posts an encrypted, VAPID-signed request to the endpoint", async () => {
    await subscribe(bob, "https://push.example.test/bob");

    const calls: { url: string; headers: Headers; bodyLength: number }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: new Headers(init?.headers),
        bodyLength: (init?.body as Uint8Array).byteLength,
      });
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    const result = await sendToUsers(
      [bob.id],
      { title: "Alice", body: "hello", url: "/chat?c=1", tag: "conversation-1" },
      { fetchImpl }
    );

    expect(result).toMatchObject({ sent: 1, pruned: 0, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get("content-encoding")).toBe("aes128gcm");
    expect(calls[0].headers.get("authorization")).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    // Header (86 bytes) plus ciphertext: the payload is genuinely encrypted.
    expect(calls[0].bodyLength).toBeGreaterThan(86);
  });

  it("sends nothing to a member with no subscription", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const result = await sendToUsers(
      [alice.id],
      { title: "t", body: "b", url: "/chat", tag: "x" },
      { fetchImpl }
    );

    expect(result.sent).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // The card's acceptance: expired subscriptions pruned on 404/410.
  it("prunes a subscription the push service reports as gone (410)", async () => {
    await subscribe(bob, "https://push.example.test/gone");

    const fetchImpl = vi.fn(async () => new Response(null, { status: 410 })) as unknown as typeof fetch;
    const result = await sendToUsers(
      [bob.id],
      { title: "t", body: "b", url: "/chat", tag: "x" },
      { fetchImpl }
    );

    expect(result.pruned).toBe(1);
    expect(await rows()).toHaveLength(0);
  });

  it("prunes on 404 too", async () => {
    await subscribe(bob, "https://push.example.test/missing");

    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    await sendToUsers([bob.id], { title: "t", body: "b", url: "/chat", tag: "x" }, { fetchImpl });

    expect(await rows()).toHaveLength(0);
  });

  it("prunes on 403, which means the VAPID key no longer matches", async () => {
    await subscribe(bob, "https://push.example.test/rotated");

    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 })) as unknown as typeof fetch;
    await sendToUsers([bob.id], { title: "t", body: "b", url: "/chat", tag: "x" }, { fetchImpl });

    expect(await rows()).toHaveLength(0);
  });

  it("keeps a subscription through a transient failure", async () => {
    await subscribe(bob, "https://push.example.test/flaky");

    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    const result = await sendToUsers(
      [bob.id],
      { title: "t", body: "b", url: "/chat", tag: "x" },
      { fetchImpl }
    );

    expect(result.failed).toBe(1);
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0].failureCount).toBe(1);
  });

  it("gives up after a run of failures rather than retrying forever", async () => {
    await subscribe(bob, "https://push.example.test/dead");

    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    for (let i = 0; i < MAX_PUSH_FAILURES; i += 1) {
      await sendToUsers([bob.id], { title: "t", body: "b", url: "/chat", tag: "x" }, { fetchImpl });
    }

    expect(await rows()).toHaveLength(0);
  });

  it("resets the failure count after a success", async () => {
    await subscribe(bob, "https://push.example.test/recovering");

    const failing = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    const working = vi.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch;

    await sendToUsers([bob.id], { title: "t", body: "b", url: "/chat", tag: "x" }, { fetchImpl: failing });
    await sendToUsers([bob.id], { title: "t", body: "b", url: "/chat", tag: "x" }, { fetchImpl: working });

    const [row] = await rows();
    expect(row.failureCount).toBe(0);
    expect(row.lastUsedAt).not.toBeNull();
  });

  it("survives a network error without pruning anything", async () => {
    await subscribe(bob, "https://push.example.test/offline");

    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const result = await sendToUsers(
      [bob.id],
      { title: "t", body: "b", url: "/chat", tag: "x" },
      { fetchImpl }
    );

    expect(result.failed).toBe(1);
    expect(await rows()).toHaveLength(1);
  });

  it("notifies several devices belonging to one member", async () => {
    await subscribe(bob, "https://push.example.test/phone");
    await subscribe(bob, "https://push.example.test/laptop");

    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
    const result = await sendToUsers(
      [bob.id],
      { title: "t", body: "b", url: "/chat", tag: "x" },
      { fetchImpl }
    );

    expect(result.sent).toBe(2);
  });

  it("carries a deep link to the conversation", async () => {
    await subscribe(bob, "https://push.example.test/bob");
    const conversation = await createConversation([alice.id, bob.id]);

    let body: Uint8Array | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      body = init?.body as Uint8Array;
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    await sendToUsers(
      [bob.id],
      {
        title: "Alice",
        body: "hello",
        url: `/chat?c=${conversation}`,
        tag: `conversation-${conversation}`,
      },
      { fetchImpl }
    );

    // The URL is inside the ciphertext, which is the point — it is not
    // readable here, and it is not readable by the push service either.
    expect(body).toBeDefined();
    expect(Buffer.from(body!).toString("utf8")).not.toContain("/chat?c=");
  });
});

// ── VAPID, independent of the database ────────────────────────────────────
it("generates a matching VAPID key pair", () => {
  const keys = generateVapidKeys();

  expect(Buffer.from(keys.publicKey, "base64url")).toHaveLength(65);
  expect(Buffer.from(keys.publicKey, "base64url")[0]).toBe(0x04);
  expect(Buffer.from(keys.privateKey, "base64url")).toHaveLength(32);
  expect(() => assertKeyPairMatches(keys)).not.toThrow();
});

it("rejects a mismatched pair rather than signing unusable tokens", () => {
  const a = generateVapidKeys();
  const b = generateVapidKeys();

  expect(() => assertKeyPairMatches({ publicKey: a.publicKey, privateKey: b.privateKey })).toThrow(
    /does not match/
  );
});

it("signs an ES256 JWT with a raw 64-byte signature, not DER", () => {
  const keys = generateVapidKeys();
  const header = buildVapidHeader({
    audience: "https://push.example.test",
    subject: "mailto:admin@example.test",
    keys,
    now: new Date("2026-08-25T20:00:00Z"),
  });

  const token = header.slice("vapid t=".length).split(",")[0];
  const [encodedHeader, encodedClaims, signature] = token.split(".");

  expect(JSON.parse(Buffer.from(encodedHeader, "base64url").toString())).toEqual({
    typ: "JWT",
    alg: "ES256",
  });
  const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString());
  expect(claims.aud).toBe("https://push.example.test");
  expect(claims.sub).toBe("mailto:admin@example.test");
  expect(claims.exp).toBeGreaterThan(claims.iat ?? 0);
  // DER signatures vary in length and start with 0x30; a push service rejects
  // them. The raw r||s pair is always exactly 64 bytes.
  expect(Buffer.from(signature, "base64url")).toHaveLength(64);
});

it("derives the audience from the endpoint origin", () => {
  expect(audienceFor("https://fcm.googleapis.com/fcm/send/abc123")).toBe(
    "https://fcm.googleapis.com"
  );
});
