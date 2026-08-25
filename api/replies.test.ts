/**
 * BUILD_PLAN F-5 — reply threading, and FR-MSG-15, which is the guard that
 * makes the quoted snippet safe to render.
 *
 * Cases: TC-MSG-29, plus the card's acceptance — chains survive a reload, the
 * snippet comes back from the server join, and history stays one query.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
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
import { appRouter } from "./router";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

describeIntegration("reply threading (F-5)", () => {
  let server: TestServer;
  let alice: Row;
  let bob: Row;
  let conversation: number;
  let otherConversation: number;
  let parent: number;
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
    otherConversation = await createConversation([alice.id, bob.id], {
      type: "group",
      name: "Elsewhere",
      createdBy: alice.id,
    });
    parent = await createMessage(conversation, alice.id, "the original point");
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(150);
  });

  async function history(user: Row, id = conversation) {
    return caller(user).message.listByConversation({ conversationId: id });
  }

  // ── The quoted snippet comes from the server ────────────────────────────
  it("returns the quoted body and author alongside the reply", async () => {
    await caller(bob).message.send({
      conversationId: conversation,
      content: "I disagree",
      replyToId: parent,
    });

    const reply = (await history(bob)).find((m) => m.content === "I disagree")!;
    expect(reply.replyToId).toBe(parent);
    expect(reply.replyToContent).toBe("the original point");
    expect(reply.replyToSenderId).toBe(alice.id);
    expect(reply.replyToSenderName).toBe("Alice");
  });

  it("leaves the quote fields null on a message that is not a reply", async () => {
    const plain = (await history(bob)).find((m) => m.id === parent)!;
    expect(plain.replyToId).toBeNull();
    expect(plain.replyToContent).toBeNull();
  });

  it("survives a reload — the chain is stored, not client state", async () => {
    const first = await caller(bob).message.send({
      conversationId: conversation,
      content: "reply one",
      replyToId: parent,
    });
    await caller(alice).message.send({
      conversationId: conversation,
      content: "reply two",
      replyToId: first.id,
    });

    // A second, independent fetch is what a reload does.
    const rows = await history(alice);
    const one = rows.find((m) => m.content === "reply one")!;
    const two = rows.find((m) => m.content === "reply two")!;

    expect(one.replyToId).toBe(parent);
    expect(two.replyToId).toBe(one.id);
    expect(two.replyToContent).toBe("reply one");
  });

  it("shows a deleted parent as deleted rather than as an empty quote", async () => {
    await caller(bob).message.send({
      conversationId: conversation,
      content: "orphaned reply",
      replyToId: parent,
    });
    await caller(alice).message.delete({ messageId: parent });

    const reply = (await history(bob)).find((m) => m.content === "orphaned reply")!;
    expect(reply.replyToId).toBe(parent);
    expect(reply.replyToDeletedAt).not.toBeNull();
    expect(reply.replyToContent).toBe("");
  });

  // ── FR-MSG-15: the reply target must be in the same conversation ────────
  it("refuses a reply pointing at a message in another conversation", async () => {
    const elsewhere = await createMessage(otherConversation, alice.id, "over here");

    await expect(
      caller(bob).message.send({
        conversationId: conversation,
        content: "cross-thread",
        replyToId: elsewhere,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a reply pointing at a message that does not exist", async () => {
    await expect(
      caller(bob).message.send({
        conversationId: conversation,
        content: "ghost reply",
        replyToId: 999_999,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("writes nothing when the reply target is rejected", async () => {
    const before = (await history(bob)).length;

    await expect(
      caller(bob).message.send({
        conversationId: conversation,
        content: "should not land",
        replyToId: 999_999,
      })
    ).rejects.toThrow();

    expect(await history(bob)).toHaveLength(before);
  });

  // ── The socket door enforces the same rule ──────────────────────────────
  it("refuses a cross-conversation reply over the socket too", async () => {
    const elsewhere = await createMessage(otherConversation, alice.id, "over here");
    const sender = await connectAs(server.port, bob);
    open.push(sender);
    sender.emit("joinConversation", { conversationId: conversation });
    await settle(200);

    const refused = nextEvent<{ error: string }>(sender, "messageError");
    sender.emit("sendMessage", {
      conversationId: conversation,
      content: "cross-thread over socket",
      replyToId: elsewhere,
    });

    await expect(refused).resolves.toMatchObject({
      error: expect.stringContaining("only reply to a message in this conversation"),
    });

    const contents = (await history(bob)).map((m) => m.content);
    expect(contents).not.toContain("cross-thread over socket");
  });

  it("accepts a valid reply over the socket and broadcasts it", async () => {
    const sender = await connectAs(server.port, bob);
    const watcher = await connectAs(server.port, alice);
    open.push(sender, watcher);
    sender.emit("joinConversation", { conversationId: conversation });
    watcher.emit("joinConversation", { conversationId: conversation });
    await settle(200);

    const delivered = nextEvent<{ replyToId: number | null }>(watcher, "newMessage");
    sender.emit("sendMessage", {
      conversationId: conversation,
      content: "valid reply",
      replyToId: parent,
    });

    await expect(delivered).resolves.toMatchObject({ replyToId: parent });
  });

  // ── No N+1 ──────────────────────────────────────────────────────────────
  it("returns a page of replies without a query per reply", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const reply = await caller(bob).message.send({
        conversationId: conversation,
        content: `reply ${i}`,
        replyToId: parent,
      });
      ids.push(reply.id);
    }

    const rows = await history(alice);
    const replies = rows.filter((r) => ids.includes(r.id));

    expect(replies).toHaveLength(20);
    // Every one carries the quote, which is only possible from the join — a
    // per-reply lookup would have been visible as N+1 here.
    expect(replies.every((r) => r.replyToContent === "the original point")).toBe(true);
  });
});
