/**
 * BUILD_PLAN S-11 — `conversations.updatedAt` becomes real, and unread counts
 * exist.
 *
 * Cases: TC-CONV-04, TC-CONV-05, TC-CONV-14, TC-MSG-23, TC-MSG-32, TC-E2E-07.
 */
import { beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { conversations } from "@db/schema";
import {
  createConversation,
  createMessage,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import { getDb } from "./queries/connection";
import { appRouter } from "./router";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

async function updatedAtOf(conversationId: number) {
  const [row] = await getDb()
    .select({ updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  return row.updatedAt;
}

/**
 * Advance past the timestamp resolution.
 *
 * This used to cross two whole second boundaries, because MySQL TIMESTAMP had
 * one-second resolution and rounded, so two writes 1.1 s apart could share a
 * stored second. H-8 widened the columns to `timestamp(3)` with a `now(3)`
 * default, so a few milliseconds is now genuinely enough — and this suite runs
 * in a second rather than fifteen.
 */
async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describeIntegration("conversation recency and unread counts (S-11)", () => {
  let alice: Row;
  let bob: Row;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
  });

  // ── updatedAt ───────────────────────────────────────────────────────────
  // TC-CONV-04 — nothing wrote this column at all before S-11.
  it("moves updatedAt forward when a message is sent", async () => {
    const conv = await createConversation([alice.id, bob.id]);
    const before = await updatedAtOf(conv);

    await tick();
    await caller(alice).message.send({ conversationId: conv, content: "hello" });

    expect((await updatedAtOf(conv)).getTime()).toBeGreaterThan(before.getTime());
  });

  // TC-CONV-05 — the ordering the sidebar claimed to have.
  it("orders the list by recency for the sender and the recipient alike", async () => {
    const older = await createConversation([alice.id, bob.id]);
    await tick();
    const newer = await createConversation([alice.id, bob.id], { type: "group", name: "G" });

    // The newer conversation is at the top by creation.
    expect((await caller(alice).conversation.list()).map((c) => c.id)).toEqual([newer, older]);

    await tick();
    await caller(alice).message.send({ conversationId: older, content: "bump" });

    // A message in the older one moves it to the top — for both members.
    expect((await caller(alice).conversation.list()).map((c) => c.id)).toEqual([older, newer]);
    expect((await caller(bob).conversation.list()).map((c) => c.id)).toEqual([older, newer]);
  });

  it("leaves an empty conversation ordered by its creation time", async () => {
    const first = await createConversation([alice.id, bob.id]);
    await tick();
    const second = await createConversation([alice.id, bob.id], { type: "group", name: "G" });

    expect((await caller(alice).conversation.list()).map((c) => c.id)).toEqual([second, first]);
  });

  // ── unread counts ───────────────────────────────────────────────────────
  // TC-CONV-14
  it("counts messages the caller has not read", async () => {
    const conv = await createConversation([alice.id, bob.id]);
    await createMessage(conv, bob.id, "one");
    await createMessage(conv, bob.id, "two");

    const [row] = await caller(alice).conversation.list();
    expect(row.unreadCount).toBe(2);
  });

  // TC-MSG-23 — your own messages are never unread.
  it("excludes the caller's own messages from their unread count", async () => {
    const conv = await createConversation([alice.id, bob.id]);
    await createMessage(conv, alice.id, "mine");
    await createMessage(conv, bob.id, "theirs");

    const [forAlice] = await caller(alice).conversation.list();
    const [forBob] = await caller(bob).conversation.list();

    expect(forAlice.unreadCount).toBe(1);
    expect(forBob.unreadCount).toBe(1);
  });

  // TC-MSG-32 — opening the conversation clears it.
  it("clears the count when the conversation is marked read", async () => {
    const conv = await createConversation([alice.id, bob.id]);
    await createMessage(conv, bob.id, "one");
    await tick();

    await caller(alice).conversation.markAsRead({ conversationId: conv });

    const [row] = await caller(alice).conversation.list();
    expect(row.unreadCount).toBe(0);
  });

  it("counts only what arrived after the last read", async () => {
    const conv = await createConversation([alice.id, bob.id]);
    await createMessage(conv, bob.id, "before");
    await tick();
    await caller(alice).conversation.markAsRead({ conversationId: conv });
    await tick();
    await createMessage(conv, bob.id, "after one");
    await createMessage(conv, bob.id, "after two");

    const [row] = await caller(alice).conversation.list();
    expect(row.unreadCount).toBe(2);
  });

  it("reports zero for a conversation with no messages", async () => {
    await createConversation([alice.id, bob.id]);
    const [row] = await caller(alice).conversation.list();

    expect(row.unreadCount).toBe(0);
    expect(row.latestMessage).toBeNull();
  });

  it("counts per member, not globally", async () => {
    const carol = await createUser({ name: "Carol" });
    const conv = await createConversation([alice.id, bob.id, carol.id], {
      type: "group",
      name: "G",
      createdBy: alice.id,
    });
    await createMessage(conv, alice.id, "from alice");
    await tick();
    await caller(bob).conversation.markAsRead({ conversationId: conv });

    expect((await caller(bob).conversation.list())[0].unreadCount).toBe(0);
    expect((await caller(carol).conversation.list())[0].unreadCount).toBe(1);
  });

  // ── the last-message projection ─────────────────────────────────────────
  it("returns the newest message, not an arbitrary one", async () => {
    const conv = await createConversation([alice.id, bob.id]);
    await createMessage(conv, bob.id, "first");
    await createMessage(conv, bob.id, "second");
    await createMessage(conv, bob.id, "newest");

    const [row] = await caller(alice).conversation.list();
    expect(row.latestMessage?.content).toBe("newest");
    expect(row.latestMessage?.senderId).toBe(bob.id);
  });

  it("keeps each conversation's last message to itself", async () => {
    const one = await createConversation([alice.id, bob.id]);
    const two = await createConversation([alice.id, bob.id], { type: "group", name: "G" });
    await createMessage(one, bob.id, "in one");
    await createMessage(two, bob.id, "in two");

    const list = await caller(alice).conversation.list();
    const byId = new Map(list.map((c) => [c.id, c.latestMessage?.content]));

    expect(byId.get(one)).toBe("in one");
    expect(byId.get(two)).toBe("in two");
  });

  it("returns nothing for a member of no conversations", async () => {
    const stranger = await createUser({ name: "Stranger" });
    await createConversation([alice.id, bob.id]);

    await expect(caller(stranger).conversation.list()).resolves.toEqual([]);
  });

  it("never lists a conversation the caller is not a member of", async () => {
    const carol = await createUser({ name: "Carol" });
    const theirs = await createConversation([bob.id, carol.id]);
    await createMessage(theirs, bob.id, "private");

    const list = await caller(alice).conversation.list();
    expect(list.map((c) => c.id)).not.toContain(theirs);
  });
});
