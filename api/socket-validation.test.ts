/**
 * BUILD_PLAN S-14 — runtime validation of socket payloads.
 *
 * Cases: TC-MSG-06…09, TC-MSG-13, TC-SOCK-18…22.
 *
 * Every handler used to destructure its payload against a TypeScript type,
 * which vanishes at compile time — so the wire was entirely unvalidated, and
 * the 4000-character cap lived only on the tRPC path the UI does not use.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import { MAX_MESSAGE_LENGTH } from "@contracts/constants";
import { sendMessageSchema, SOCKET_EVENT_SCHEMAS } from "@contracts/socket-events";
import { messages } from "@db/schema";
import {
  createConversation,
  createMessage,
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

describe("the socket event schemas (S-14)", () => {
  it("covers every client-to-server event", () => {
    // A new event without a schema is the exact hole this card closed.
    expect(Object.keys(SOCKET_EVENT_SCHEMAS).sort()).toEqual([
      "joinConversation",
      "leaveConversation",
      "markAsRead",
      "sendMessage",
      "typing",
    ]);
  });

  it("caps message content at the same length as the tRPC path", () => {
    expect(
      sendMessageSchema.safeParse({ conversationId: 1, content: "x".repeat(MAX_MESSAGE_LENGTH) })
        .success
    ).toBe(true);
    expect(
      sendMessageSchema.safeParse({
        conversationId: 1,
        content: "x".repeat(MAX_MESSAGE_LENGTH + 1),
      }).success
    ).toBe(false);
  });

  it("trims before measuring, so whitespace is neither content nor overflow", () => {
    expect(sendMessageSchema.safeParse({ conversationId: 1, content: "   " }).success).toBe(
      false
    );
    const padded = sendMessageSchema.safeParse({ conversationId: 1, content: "  hi  " });
    expect(padded.success && padded.data.content).toBe("hi");
  });

  it("rejects the shapes a TypeScript annotation could not", () => {
    for (const bad of [
      { conversationId: "1", content: "hi" },
      { conversationId: 1.5, content: "hi" },
      { conversationId: -1, content: "hi" },
      { conversationId: 0, content: "hi" },
      { content: "hi" },
      { conversationId: 1 },
      { conversationId: 1, content: 42 },
      { conversationId: 1, content: "hi", replyToId: "abc" },
      null,
      undefined,
      "a string",
      [],
    ]) {
      expect(sendMessageSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("bounds the read-receipt batch", () => {
    const many = Array.from({ length: 501 }, (_, i) => i + 1);
    expect(
      SOCKET_EVENT_SCHEMAS.markAsRead.safeParse({ conversationId: 1, messageIds: many })
        .success
    ).toBe(false);
    expect(
      SOCKET_EVENT_SCHEMAS.markAsRead.safeParse({ conversationId: 1, messageIds: [] }).success
    ).toBe(false);
  });
});

describeIntegration("socket payload validation, live (S-14)", () => {
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
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    conversation = await createConversation([alice.id, bob.id]);
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(150);
  });

  async function joined(user: Row) {
    const socket = await connectAs(server.port, user);
    open.push(socket);
    socket.emit("joinConversation", { conversationId: conversation });
    await settle(200);
    return socket;
  }

  async function storedContents() {
    const rows = await getDb().select().from(messages);
    return rows.map((r) => r.content);
  }

  // TC-MSG-13 — the cap that existed only where the UI never went.
  it("refuses a message past the length cap on the socket path", async () => {
    const sender = await joined(alice);

    const refused = nextEvent<{ event: string; message: string }>(sender, "invalidPayload");
    sender.emit("sendMessage", {
      conversationId: conversation,
      content: "x".repeat(MAX_MESSAGE_LENGTH + 1),
    });

    await expect(refused).resolves.toMatchObject({ event: "sendMessage" });
    expect(await storedContents()).toEqual([]);
  });

  it("accepts a message exactly at the cap", async () => {
    const sender = await joined(alice);
    const watcher = await joined(bob);

    const delivered = nextEvent(watcher, "newMessage");
    sender.emit("sendMessage", {
      conversationId: conversation,
      content: "x".repeat(MAX_MESSAGE_LENGTH),
    });

    await expect(delivered).resolves.toBeDefined();
  });

  // TC-SOCK-18…21
  it("refuses a malformed payload without disconnecting", async () => {
    const sender = await joined(alice);

    for (const bad of [
      { conversationId: "not a number", content: "hi" },
      { conversationId: conversation },
      { content: "no conversation" },
      "just a string",
      null,
      42,
    ]) {
      sender.emit("sendMessage", bad);
    }
    await settle(400);

    expect(sender.connected).toBe(true);
    expect(await storedContents()).toEqual([]);
  });

  it("tells the sender which event was malformed", async () => {
    const sender = await joined(alice);

    const refused = nextEvent<{ event: string; message: string }>(sender, "invalidPayload");
    sender.emit("markAsRead", { conversationId: conversation, messageIds: "nope" });

    const event = await refused;
    expect(event.event).toBe("markAsRead");
    expect(typeof event.message).toBe("string");
    expect(event.message.length).toBeGreaterThan(0);
  });

  it("refuses an empty or whitespace-only message", async () => {
    const sender = await joined(alice);

    sender.emit("sendMessage", { conversationId: conversation, content: "" });
    sender.emit("sendMessage", { conversationId: conversation, content: "    " });
    await settle(400);

    expect(await storedContents()).toEqual([]);
  });

  it("stores the trimmed body, not the padded one", async () => {
    const sender = await joined(alice);
    const watcher = await joined(bob);

    const delivered = nextEvent(watcher, "newMessage");
    sender.emit("sendMessage", { conversationId: conversation, content: "  hello  " });
    await delivered;

    expect(await storedContents()).toEqual(["hello"]);
  });

  it("refuses an oversized read-receipt batch and keeps the socket", async () => {
    const sender = await joined(bob);
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);

    const refused = nextEvent(sender, "invalidPayload");
    sender.emit("markAsRead", { conversationId: conversation, messageIds: ids });

    await expect(refused).resolves.toBeDefined();
    expect(sender.connected).toBe(true);
  });

  it("still accepts every well-formed event", async () => {
    const message = await createMessage(conversation, alice.id, "existing");
    const sender = await joined(bob);
    const watcher = await joined(alice);

    const read = nextEvent(watcher, "messagesRead");
    sender.emit("markAsRead", { conversationId: conversation, messageIds: [message] });
    await expect(read).resolves.toBeDefined();

    const typing = nextEvent(watcher, "userTyping");
    sender.emit("typing", { conversationId: conversation, isTyping: true });
    await expect(typing).resolves.toMatchObject({ isTyping: true });

    sender.emit("leaveConversation", { conversationId: conversation });
    await settle(150);
    expect(sender.connected).toBe(true);
  });

  it("survives a flood of garbage without dropping the connection", async () => {
    const sender = await joined(alice);

    for (let i = 0; i < 100; i += 1) {
      sender.emit("sendMessage", { garbage: i });
      sender.emit("typing", null);
      sender.emit("joinConversation", []);
    }
    await settle(600);

    expect(sender.connected).toBe(true);
    expect(await storedContents()).toEqual([]);
  });
});
