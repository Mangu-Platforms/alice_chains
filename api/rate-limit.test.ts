/**
 * BUILD_PLAN S-13 — rate limiting (SECURITY.md §8).
 *
 * Cases: TC-SOCK-23, TC-REG-14. There was no rate limiting anywhere, so every
 * endpoint accepted requests as fast as they arrived.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import {
  bucketCount,
  consume,
  Limits,
  perDay,
  resetRateLimits,
  sweep,
} from "./lib/rate-limit";
import {
  createConversation,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import {
  connectAs,
  connectWithCookie,
  disconnectAll,
  nextEvent,
  sessionCookieFor,
  settle,
  startSocketServer,
  type TestServer,
} from "../test/support/socket";
import { anonymous } from "../test/support/http";
import { appRouter } from "./router";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

// ── The bucket itself ─────────────────────────────────────────────────────

describe("the token bucket (S-13)", () => {
  beforeEach(() => resetRateLimits());

  it("allows a burst up to capacity, then refuses", () => {
    const policy = { capacity: 3, refillPerSecond: 1 };
    const now = 1_000_000;

    for (let i = 0; i < 3; i += 1) {
      expect(consume("t", "a", policy, now).allowed).toBe(true);
    }
    expect(consume("t", "a", policy, now).allowed).toBe(false);
  });

  it("refills over time at the stated rate", () => {
    const policy = { capacity: 2, refillPerSecond: 1 };
    const start = 1_000_000;

    consume("t", "a", policy, start);
    consume("t", "a", policy, start);
    expect(consume("t", "a", policy, start).allowed).toBe(false);

    // One second buys exactly one token.
    expect(consume("t", "a", policy, start + 1000).allowed).toBe(true);
    expect(consume("t", "a", policy, start + 1000).allowed).toBe(false);
  });

  it("never refills past capacity, so idling does not bank a bigger burst", () => {
    const policy = { capacity: 2, refillPerSecond: 1 };
    const start = 1_000_000;

    consume("t", "a", policy, start);
    // An hour idle. Capacity is still 2, not 3600.
    expect(consume("t", "a", policy, start + 3_600_000).allowed).toBe(true);
    expect(consume("t", "a", policy, start + 3_600_000).allowed).toBe(true);
    expect(consume("t", "a", policy, start + 3_600_000).allowed).toBe(false);
  });

  it("keeps buckets separate per subject and per surface", () => {
    const policy = { capacity: 1, refillPerSecond: 0.001 };
    const now = 1_000_000;

    expect(consume("send", "alice", policy, now).allowed).toBe(true);
    expect(consume("send", "alice", policy, now).allowed).toBe(false);
    // A different member is unaffected...
    expect(consume("send", "bob", policy, now).allowed).toBe(true);
    // ...and so is a different surface for the same member.
    expect(consume("search", "alice", policy, now).allowed).toBe(true);
  });

  it("reports how long to wait", () => {
    const policy = { capacity: 1, refillPerSecond: 0.5 };
    const now = 1_000_000;

    consume("t", "a", policy, now);
    const refused = consume("t", "a", policy, now);

    expect(refused.allowed).toBe(false);
    // Half a token per second, so a full token is two seconds away.
    expect(refused.retryAfterMs).toBeGreaterThan(1900);
    expect(refused.retryAfterMs).toBeLessThanOrEqual(2000);
  });

  it("expresses a per-day allowance as a burst plus a slow refill", () => {
    const policy = perDay(20);
    const now = 1_000_000;

    for (let i = 0; i < 20; i += 1) {
      expect(consume("t", "a", policy, now).allowed).toBe(true);
    }
    expect(consume("t", "a", policy, now).allowed).toBe(false);
    // A full day later the whole allowance is back.
    expect(consume("t", "a", policy, now + 86_400_000).allowed).toBe(true);
  });

  it("evicts a refilled, idle bucket but keeps one still owing tokens", () => {
    const now = 1_000_000;
    consume("fast", "a", { capacity: 5, refillPerSecond: 5 }, now);
    // Spend the whole daily allowance, so it genuinely takes a day to refill.
    for (let i = 0; i < 20; i += 1) consume("slow", "b", perDay(20), now);
    expect(bucketCount()).toBe(2);

    // Two hours on, the fast bucket refilled long ago and is indistinguishable
    // from no bucket. The daily one has earned back under two of twenty
    // tokens, so dropping it would hand back an allowance already spent.
    sweep(now + 2 * 3_600_000);

    expect(bucketCount()).toBe(1);
    expect(consume("slow", "b", perDay(20), now + 2 * 3_600_000).allowed).toBe(true);
    expect(consume("slow", "b", perDay(20), now + 2 * 3_600_000).allowed).toBe(false);
  });
});

// ── The surfaces ──────────────────────────────────────────────────────────

describeIntegration("rate-limited surfaces (S-13)", () => {
  let server: TestServer;
  let alice: Row;
  let bob: Row;
  let conversation: number;
  const open: ClientSocket[] = [];

  beforeAll(async () => {
    await resetDatabase();
    server = await startSocketServer();
  });

  afterAll(async () => {
    await server.close();
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    resetRateLimits();
    alice = await createUser({ name: "Alice Anderson" });
    bob = await createUser({ name: "Bob Brown" });
    conversation = await createConversation([alice.id, bob.id]);
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(150);
  });

  it("refuses message.send past the burst, with TOO_MANY_REQUESTS", async () => {
    for (let i = 0; i < Limits.messageSendPerUser.capacity; i += 1) {
      await caller(alice).message.send({ conversationId: conversation, content: `m${i}` });
    }

    await expect(
      caller(alice).message.send({ conversationId: conversation, content: "one too many" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("limits per member, so one busy client cannot silence another", async () => {
    for (let i = 0; i < Limits.messageSendPerUser.capacity; i += 1) {
      await caller(alice).message.send({ conversationId: conversation, content: `m${i}` });
    }

    await expect(
      caller(bob).message.send({ conversationId: conversation, content: "mine" })
    ).resolves.toBeDefined();
  });

  it("caps directory search, which is the enumeration surface", async () => {
    for (let i = 0; i < Limits.searchBurst.capacity; i += 1) {
      await caller(alice).contact.searchUsers({ query: "Bob" });
    }

    await expect(
      caller(alice).contact.searchUsers({ query: "Bob" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("refuses the same way whether the search matched or not", async () => {
    // Never leak whether a key exists: a hit and a miss must cost the same.
    for (let i = 0; i < Limits.searchBurst.capacity; i += 1) {
      await caller(alice).contact.searchUsers({ query: i % 2 ? "Bob" : "Nobody" });
    }

    await expect(
      caller(alice).contact.searchUsers({ query: "Nobody" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("caps contact requests, conversation creation and upload targets", async () => {
    const others = [];
    for (let i = 0; i < Limits.createDirect.capacity + 1; i += 1) {
      others.push(await createUser());
    }

    for (let i = 0; i < Limits.createDirect.capacity; i += 1) {
      await caller(alice).conversation.createDirect({ otherUserId: others[i].id });
    }
    await expect(
      caller(alice).conversation.createDirect({
        otherUserId: others[Limits.createDirect.capacity].id,
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    for (let i = 0; i < Limits.uploadInit.capacity; i += 1) {
      await caller(bob).attachment.createUpload({
        conversationId: conversation,
        fileName: `f${i}.png`,
        mimeType: "image/png",
        byteSize: 100,
      });
    }
    await expect(
      caller(bob).attachment.createUpload({
        conversationId: conversation,
        fileName: "one-more.png",
        mimeType: "image/png",
        byteSize: 100,
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  // TC-SOCK-23
  it("tells a socket sender it was rate-limited, rather than dropping silently", async () => {
    const sender = await connectAs(server.port, alice);
    open.push(sender);
    sender.emit("joinConversation", { conversationId: conversation });
    await settle(200);

    const refused = nextEvent<{ event: string; retryAfterMs: number }>(
      sender,
      "rateLimited",
      3000
    );

    // Past the per-conversation burst, which is the tighter of the two.
    for (let i = 0; i < Limits.messageSendPerConversation.capacity + 5; i += 1) {
      sender.emit("sendMessage", { conversationId: conversation, content: `flood ${i}` });
    }

    await expect(refused).resolves.toMatchObject({ event: "sendMessage" });
    expect(sender.connected).toBe(true);
  });

  it("does not disconnect a socket for a first offence", async () => {
    const sender = await connectAs(server.port, alice);
    open.push(sender);
    await settle(200);

    for (let i = 0; i < 50; i += 1) {
      sender.emit("typing", { conversationId: conversation, isTyping: true });
    }
    await settle(300);

    expect(sender.connected).toBe(true);
  });

  it("refuses a handshake past the per-account connection cap", async () => {
    const cookie = await sessionCookieFor(alice);

    for (let i = 0; i < 10; i += 1) {
      open.push(await connectWithCookie(server.port, cookie));
    }

    await expect(connectWithCookie(server.port, cookie)).rejects.toThrow(
      /too many connections/i
    );
  });

  // TC-REG-14
  it("rate-limits the unauthenticated OAuth paths by address", async () => {
    for (let i = 0; i < Limits.oauthLogin.capacity; i += 1) {
      expect((await anonymous().raw("/api/oauth/login")).status).toBe(302);
    }

    const refused = await anonymous().raw("/api/oauth/login");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBeTruthy();
  });
});
