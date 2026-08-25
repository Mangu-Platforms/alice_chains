/**
 * BUILD_PLAN F-8 — blocking enforced end to end.
 *
 * Cases: TC-CONT-11, TC-CONT-12, TC-CONT-19, TC-CONT-22, TC-CONT-23,
 * TC-MSG-31. `contacts.status = 'blocked'` was a valid enum value that no code
 * path read; the card's acceptance is that it is honoured on all five surfaces
 * and that unblocking works.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import {
  befriend,
  blockUser,
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

describeIntegration("blocking end to end (F-8)", () => {
  let server: TestServer;
  let alice: Row;
  let bob: Row;
  let carol: Row;
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
    alice = await createUser({ name: "Alice Anderson", email: "alice@example.test" });
    bob = await createUser({ name: "Bob Brown", email: "bob@example.test" });
    carol = await createUser({ name: "Carol Clark", email: "carol@example.test" });
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(150);
  });

  // ── The procedures ──────────────────────────────────────────────────────
  it("records a block and lists it back to the blocker", async () => {
    await caller(alice).contact.block({ contactUserId: bob.id });

    const blocked = await caller(alice).contact.blocked();
    expect(blocked.map((b) => b.contactUserId)).toEqual([bob.id]);
  });

  it("refuses to block yourself, or someone who does not exist", async () => {
    await expect(
      caller(alice).contact.block({ contactUserId: alice.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller(alice).contact.block({ contactUserId: 999_999 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("blocking an existing contact replaces the relationship", async () => {
    await befriend(alice, bob);
    await caller(alice).contact.block({ contactUserId: bob.id });

    expect(await caller(alice).contact.list()).toHaveLength(0);
    expect(await caller(bob).contact.list()).toHaveLength(0);
  });

  // TC-CONT-22 — authority, not just effect.
  it("does not let the blocked party unblock themselves", async () => {
    await caller(alice).contact.block({ contactUserId: bob.id });

    await caller(bob).contact.unblock({ contactUserId: alice.id });

    // Still blocked: the row belongs to Alice.
    await expect(
      caller(bob).conversation.createDirect({ otherUserId: alice.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets the blocker undo it", async () => {
    await caller(alice).contact.block({ contactUserId: bob.id });
    await caller(alice).contact.unblock({ contactUserId: bob.id });

    expect(await caller(alice).contact.blocked()).toHaveLength(0);
    await expect(
      caller(alice).conversation.createDirect({ otherUserId: bob.id })
    ).resolves.toBeDefined();
  });

  it("keeps a mutual block in force until both sides lift it", async () => {
    await caller(alice).contact.block({ contactUserId: bob.id });
    await caller(bob).contact.block({ contactUserId: alice.id });

    await caller(alice).contact.unblock({ contactUserId: bob.id });

    // Bob's block survives Alice's unblock.
    expect(await caller(bob).contact.blocked()).toHaveLength(1);
    await expect(
      caller(alice).conversation.createDirect({ otherUserId: bob.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ── Surface 1: conversation creation (delivered by S-9, re-pinned here) ──
  it("refuses a direct conversation in either direction", async () => {
    await blockUser(bob, alice);

    await expect(
      caller(alice).conversation.createDirect({ otherUserId: bob.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller(bob).conversation.createDirect({ otherUserId: alice.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ── Surface 2: message send, both doors ─────────────────────────────────
  // TC-MSG-31
  it("refuses a message into a conversation containing someone who blocked you", async () => {
    const conversation = await createConversation([alice.id, bob.id]);
    await blockUser(bob, alice);

    await expect(
      caller(alice).message.send({ conversationId: conversation, content: "still here" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses it in a group too, not only a direct chat", async () => {
    const group = await createConversation([alice.id, bob.id, carol.id], {
      type: "group",
      name: "Group",
      createdBy: carol.id,
    });
    await blockUser(bob, alice);

    await expect(
      caller(alice).message.send({ conversationId: group, content: "hello all" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Carol, who blocked nobody, is unaffected.
    await expect(
      caller(carol).message.send({ conversationId: group, content: "hello all" })
    ).resolves.toBeDefined();
  });

  it("refuses it over the socket and tells the sender why", async () => {
    const conversation = await createConversation([alice.id, bob.id]);
    await blockUser(bob, alice);

    const sender = await connectAs(server.port, alice);
    open.push(sender);
    sender.emit("joinConversation", { conversationId: conversation });
    await settle(200);

    const refused = nextEvent<{ error: string }>(sender, "messageError");
    sender.emit("sendMessage", { conversationId: conversation, content: "over socket" });

    await expect(refused).resolves.toMatchObject({
      error: expect.stringContaining("cannot send messages"),
    });

    const history = await caller(bob).message.listByConversation({
      conversationId: conversation,
    });
    expect(history.map((m) => m.content)).not.toContain("over socket");
  });

  it("still lets the blocker send", async () => {
    const conversation = await createConversation([alice.id, bob.id]);
    await blockUser(bob, alice);

    // Bob blocked Alice; nothing stops Bob. Only Alice is silenced.
    await expect(
      caller(bob).message.send({ conversationId: conversation, content: "my thread" })
    ).resolves.toBeDefined();
  });

  // ── Surface 3: contacts ─────────────────────────────────────────────────
  // TC-CONT-19
  it("hides a blocked pair from contact.list in both directions", async () => {
    await befriend(alice, bob);
    await befriend(alice, carol);
    await blockUser(bob, alice);

    expect((await caller(alice).contact.list()).map((c) => c.contactUserId)).toEqual([
      carol.id,
    ]);
    expect(await caller(bob).contact.list()).toHaveLength(0);
  });

  it("hides a pending request from a blocked pair", async () => {
    await caller(carol).contact.add({ contactUserId: alice.id });
    expect(await caller(alice).contact.pending()).toHaveLength(1);

    await caller(alice).contact.block({ contactUserId: carol.id });
    expect(await caller(alice).contact.pending()).toHaveLength(0);
  });

  it("refuses contact.add across a block", async () => {
    await blockUser(bob, alice);

    await expect(
      caller(alice).contact.add({ contactUserId: bob.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ── Surface 4: search ───────────────────────────────────────────────────
  // TC-CONT-23
  it("removes a blocked pair from search in both directions", async () => {
    await blockUser(bob, alice);

    const aliceSees = await caller(alice).contact.searchUsers({ query: "Bob" });
    const bobSees = await caller(bob).contact.searchUsers({ query: "Alice" });

    expect(aliceSees).toHaveLength(0);
    expect(bobSees).toHaveLength(0);
  });

  it("leaves unrelated people in search results", async () => {
    await blockUser(bob, alice);

    const results = await caller(alice).contact.searchUsers({ query: "Carol" });
    expect(results.map((r) => r.id)).toEqual([carol.id]);
  });

  // ── Surface 5: presence and typing ──────────────────────────────────────
  it("suppresses presence between a blocked pair", async () => {
    await createConversation([alice.id, bob.id]);
    await blockUser(bob, alice);

    const watcher = await connectAs(server.port, bob);
    open.push(watcher);
    await settle(300);

    const leaked = nextEvent(watcher, "userOnline", 800);
    const other = await connectAs(server.port, alice);
    open.push(other);

    await expect(leaked).rejects.toThrow(/timed out/);
  });

  it("still shows presence to someone who has not blocked you", async () => {
    await befriend(alice, carol);
    await blockUser(bob, alice);

    const watcher = await connectAs(server.port, carol);
    open.push(watcher);
    await settle(300);

    const seen = nextEvent<{ userId: number }>(watcher, "userOnline");
    const other = await connectAs(server.port, alice);
    open.push(other);

    await expect(seen).resolves.toEqual({ userId: alice.id });
  });

  it("suppresses the typing indicator between a blocked pair", async () => {
    const conversation = await createConversation([alice.id, bob.id]);
    await blockUser(bob, alice);

    const typist = await connectAs(server.port, alice);
    const watcher = await connectAs(server.port, bob);
    open.push(typist, watcher);
    await settle(300);

    const leaked = nextEvent(watcher, "userTyping", 800);
    typist.emit("typing", { conversationId: conversation, isTyping: true });

    await expect(leaked).rejects.toThrow(/timed out/);
  });

  it("still relays typing to a member who has not blocked the typist", async () => {
    const group = await createConversation([alice.id, bob.id, carol.id], {
      type: "group",
      name: "Group",
      createdBy: carol.id,
    });
    await blockUser(bob, alice);

    const typist = await connectAs(server.port, alice);
    const watcher = await connectAs(server.port, carol);
    open.push(typist, watcher);
    await settle(300);

    const seen = nextEvent<{ userId: number }>(watcher, "userTyping");
    typist.emit("typing", { conversationId: group, isTyping: true });

    await expect(seen).resolves.toMatchObject({ userId: alice.id });
  });

  // ── Restoration ─────────────────────────────────────────────────────────
  it("restores every surface once the block is lifted", async () => {
    await blockUser(alice, bob);
    await caller(alice).contact.unblock({ contactUserId: bob.id });

    const conversation = await caller(alice).conversation.createDirect({
      otherUserId: bob.id,
    });
    await expect(
      caller(alice).message.send({ conversationId: conversation.id, content: "again" })
    ).resolves.toBeDefined();
    expect(await caller(alice).contact.searchUsers({ query: "Bob" })).toHaveLength(1);
  });
});
