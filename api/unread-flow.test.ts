/**
 * BUILD_PLAN F-1 — unread badges, proven at the layer beneath the DOM.
 *
 * The card's acceptance is a two-browser test showing a live increment and a
 * clear on open. There is no browser driver in this repository, so the same
 * sequence is driven through two real socket clients and the real
 * `conversation.list` the sidebar renders from: a message arrives over the
 * socket, the recipient's count increments, opening the conversation clears it.
 * The count query's use of the index is pinned separately, by the EXPLAIN
 * assertion in api/schema-constraints.test.ts.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import {
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
import { appRouter } from "./router";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

describeIntegration("unread badge flow (F-1)", () => {
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

  async function client(user: Row) {
    const socket = await connectAs(server.port, user);
    open.push(socket);
    socket.emit("joinConversation", { conversationId: conversation });
    await settle(200);
    return socket;
  }

  /** The number the sidebar would render for `user`. */
  async function badge(user: Row) {
    const list = await caller(user).conversation.list();
    return list.find((c) => c.id === conversation)?.unreadCount ?? 0;
  }

  it("increments the recipient's badge when a message arrives over the socket", async () => {
    const sender = await client(alice);
    const receiver = await client(bob);

    expect(await badge(bob)).toBe(0);

    const delivered = nextEvent(receiver, "newMessage");
    sender.emit("sendMessage", { conversationId: conversation, content: "one" });
    await delivered;

    expect(await badge(bob)).toBe(1);
  });

  it("keeps counting while the recipient does not open the conversation", async () => {
    const sender = await client(alice);
    const receiver = await client(bob);

    for (const content of ["one", "two", "three"]) {
      const delivered = nextEvent(receiver, "newMessage");
      sender.emit("sendMessage", { conversationId: conversation, content });
      await delivered;
    }

    expect(await badge(bob)).toBe(3);
  });

  it("never counts the sender's own messages against them", async () => {
    const sender = await client(alice);
    const receiver = await client(bob);

    const delivered = nextEvent(receiver, "newMessage");
    sender.emit("sendMessage", { conversationId: conversation, content: "mine" });
    await delivered;

    expect(await badge(alice)).toBe(0);
  });

  it("clears the badge when the recipient opens the conversation", async () => {
    const sender = await client(alice);
    const receiver = await client(bob);

    const delivered = nextEvent(receiver, "newMessage");
    sender.emit("sendMessage", { conversationId: conversation, content: "unread" });
    await delivered;
    expect(await badge(bob)).toBe(1);

    // What the client does on open.
    await caller(bob).conversation.markAsRead({ conversationId: conversation });

    expect(await badge(bob)).toBe(0);
  });

  it("does not clear the other member's badge when one member reads", async () => {
    const carol = await createUser({ name: "Carol" });
    const group = await createConversation([alice.id, bob.id, carol.id], {
      type: "group",
      name: "Group",
      createdBy: alice.id,
    });

    await caller(alice).message.send({ conversationId: group, content: "hello all" });
    await caller(bob).conversation.markAsRead({ conversationId: group });

    const bobRow = (await caller(bob).conversation.list()).find((c) => c.id === group);
    const carolRow = (await caller(carol).conversation.list()).find((c) => c.id === group);

    expect(bobRow?.unreadCount).toBe(0);
    expect(carolRow?.unreadCount).toBe(1);
  });

  it("counts again after the conversation is read and a new message arrives", async () => {
    const sender = await client(alice);
    const receiver = await client(bob);

    let delivered = nextEvent(receiver, "newMessage");
    sender.emit("sendMessage", { conversationId: conversation, content: "first" });
    await delivered;

    await caller(bob).conversation.markAsRead({ conversationId: conversation });
    expect(await badge(bob)).toBe(0);

    // Past the one-second TIMESTAMP resolution, so the new message is
    // unambiguously after the read marker.
    await settle(2100);

    delivered = nextEvent(receiver, "newMessage");
    sender.emit("sendMessage", { conversationId: conversation, content: "second" });
    await delivered;

    expect(await badge(bob)).toBe(1);
  });

  it("refuses to move another member's read marker", async () => {
    await caller(alice).message.send({ conversationId: conversation, content: "hi" });

    const mallory = await createUser({ name: "Mallory" });
    // A non-participant's markAsRead updates no row rather than clearing Bob's.
    await caller(mallory).conversation.markAsRead({ conversationId: conversation });

    expect(await badge(bob)).toBe(1);
  });
});
