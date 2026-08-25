/**
 * BUILD_PLAN S-7 — the realtime paths, with two real clients.
 *
 * The acceptance criteria this file covers directly: a message broadcast
 * reaches a second client; a non-participant `joinConversation` is a no-op;
 * presence goes offline only after the *last* socket for a member disconnects.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import { eq } from "drizzle-orm";
import { conversations, messages } from "@db/schema";
import {
  befriend,
  createConversation,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import {
  connectAs,
  disconnectAll,
  nextEvent,
  settle,
  startSocketServer,
  type TestServer,
} from "../test/support/socket";
import { getDb } from "./queries/connection";

type Row = Awaited<ReturnType<typeof createUser>>;

describeIntegration("realtime message flow (S-7)", () => {
  let server: TestServer;
  let alice: Row;
  let bob: Row;
  let carol: Row;
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
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    carol = await createUser({ name: "Carol" });
    conversation = await createConversation([alice.id, bob.id]);
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(150);
  });

  async function client(user: Row) {
    const socket = await connectAs(server.port, user);
    open.push(socket);
    return socket;
  }

  async function joined(user: Row) {
    const socket = await client(user);
    socket.emit("joinConversation", { conversationId: conversation });
    await settle(200);
    return socket;
  }

  it("delivers a message to the other member's open client", async () => {
    const sender = await joined(alice);
    const receiver = await joined(bob);

    const delivered = nextEvent<{ content: string; senderId: number }>(receiver, "newMessage");
    sender.emit("sendMessage", { conversationId: conversation, content: "hello there" });

    await expect(delivered).resolves.toMatchObject({
      content: "hello there",
      senderId: alice.id,
    });
  });

  it("echoes the message back to the sender with its tempId, for optimistic UI", async () => {
    const sender = await joined(alice);
    await joined(bob);

    const echoed = nextEvent<{ tempId?: string; id: number }>(sender, "newMessage");
    sender.emit("sendMessage", {
      conversationId: conversation,
      content: "mine",
      tempId: "temp-123",
    });

    const message = await echoed;
    expect(message.tempId).toBe("temp-123");
    expect(message.id).toBeGreaterThan(0);
  });

  it("persists what it broadcasts", async () => {
    const sender = await joined(alice);
    const receiver = await joined(bob);

    const delivered = nextEvent<{ id: number }>(receiver, "newMessage");
    sender.emit("sendMessage", { conversationId: conversation, content: "durable" });
    const { id } = await delivered;

    const [stored] = await getDb().select().from(messages).where(eq(messages.id, id));
    expect(stored.content).toBe("durable");
    expect(stored.senderId).toBe(alice.id);
  });

  it("bumps the conversation's updatedAt on a socket send too", async () => {
    const [before] = await getDb()
      .select({ updatedAt: conversations.updatedAt })
      .from(conversations)
      .where(eq(conversations.id, conversation));

    // H-8 widened these columns to millisecond precision, so a short pause is
    // enough to make the two writes distinguishable.
    await settle(20);
    const sender = await joined(alice);
    const receiver = await joined(bob);
    const delivered = nextEvent(receiver, "newMessage");
    sender.emit("sendMessage", { conversationId: conversation, content: "bump" });
    await delivered;

    const [after] = await getDb()
      .select({ updatedAt: conversations.updatedAt })
      .from(conversations)
      .where(eq(conversations.id, conversation));

    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it("notifies every member's user room, even one not in the conversation room", async () => {
    const sender = await joined(alice);
    // Bob connects but never joins the conversation room — the sidebar still
    // has to update for him.
    const idle = await client(bob);
    await settle();

    const updated = nextEvent<{ conversationId: number }>(idle, "conversationUpdated");
    sender.emit("sendMessage", { conversationId: conversation, content: "sidebar" });

    await expect(updated).resolves.toMatchObject({ conversationId: conversation });
  });

  it("does not deliver to a member of a different conversation", async () => {
    const other = await createConversation([alice.id, carol.id]);
    const sender = await joined(alice);

    const outsider = await client(carol);
    outsider.emit("joinConversation", { conversationId: other });
    await settle();

    const leaked = nextEvent(outsider, "newMessage", 700);
    sender.emit("sendMessage", { conversationId: conversation, content: "not for carol" });

    await expect(leaked).rejects.toThrow(/timed out/);
  });

  it("stops delivering once a member leaves the conversation room", async () => {
    const sender = await joined(alice);
    const receiver = await joined(bob);

    receiver.emit("leaveConversation", { conversationId: conversation });
    await settle(200);

    const afterLeaving = nextEvent(receiver, "newMessage", 700);
    sender.emit("sendMessage", { conversationId: conversation, content: "gone" });

    await expect(afterLeaving).rejects.toThrow(/timed out/);
  });

  // ── Typing ──────────────────────────────────────────────────────────────
  it("relays a typing indicator to the other member but not back to the typist", async () => {
    const typist = await joined(alice);
    const watcher = await joined(bob);

    const seen = nextEvent<{ userId: number; isTyping: boolean }>(watcher, "userTyping");
    const echo = nextEvent(typist, "userTyping", 700);
    typist.emit("typing", { conversationId: conversation, isTyping: true });

    await expect(seen).resolves.toMatchObject({ userId: alice.id, isTyping: true });
    await expect(echo).rejects.toThrow(/timed out/);
  });

  it("ignores a typing indicator from a non-participant", async () => {
    const watcher = await joined(bob);
    const intruder = await client(carol);
    await settle();

    const leaked = nextEvent(watcher, "userTyping", 700);
    intruder.emit("typing", { conversationId: conversation, isTyping: true });

    await expect(leaked).rejects.toThrow(/timed out/);
  });

  // ── Presence across several sockets for one member ──────────────────────
  it("announces a member online exactly once, however many tabs they open", async () => {
    await befriend(alice, bob);
    const watcher = await client(bob);
    await settle();

    let announcements = 0;
    watcher.on("userOnline", () => {
      announcements += 1;
    });

    await client(alice);
    await settle(300);
    await client(alice);
    await settle(400);

    expect(announcements).toBe(1);
  });

  it("goes offline only after the last socket for that member closes", async () => {
    await befriend(alice, bob);
    const watcher = await client(bob);
    const tabOne = await client(alice);
    const tabTwo = await client(alice);
    await settle(300);

    const premature = nextEvent(watcher, "userOffline", 700);
    tabOne.disconnect();
    await expect(premature).rejects.toThrow(/timed out/);

    const final = nextEvent<{ userId: number }>(watcher, "userOffline");
    tabTwo.disconnect();
    await expect(final).resolves.toEqual({ userId: alice.id });
  });
});
