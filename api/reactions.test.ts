/**
 * BUILD_PLAN F-3 — emoji reactions.
 *
 * Case: TC-MSG-28. The card's acceptance is toggle semantics (re-tapping
 * removes), counts that group correctly, and live propagation.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import { messageReactions } from "@db/schema";
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
import { appRouter } from "./router";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

describeIntegration("emoji reactions (F-3)", () => {
  let server: TestServer;
  let alice: Row;
  let bob: Row;
  let carol: Row;
  let mallory: Row;
  let conversation: number;
  let message: number;
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
    mallory = await createUser({ name: "Mallory" });
    conversation = await createConversation([alice.id, bob.id, carol.id], {
      type: "group",
      name: "Group",
      createdBy: alice.id,
    });
    message = await createMessage(conversation, alice.id, "react to me");
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(150);
  });

  async function reactionsInHistory(user: Row) {
    const rows = await caller(user).message.listByConversation({
      conversationId: conversation,
    });
    return rows.find((r) => r.id === message)!.reactions;
  }

  // ── Toggle ──────────────────────────────────────────────────────────────
  it("adds a reaction on the first tap", async () => {
    const result = await caller(bob).message.react({ messageId: message, emoji: "👍" });

    expect(result.added).toBe(true);
    expect(result.reactions).toEqual([
      { emoji: "👍", count: 1, mine: true, userIds: [bob.id] },
    ]);
  });

  it("removes it on the second tap, rather than stacking", async () => {
    await caller(bob).message.react({ messageId: message, emoji: "👍" });
    const result = await caller(bob).message.react({ messageId: message, emoji: "👍" });

    expect(result.added).toBe(false);
    expect(result.reactions).toEqual([]);
    expect(await getDb().select().from(messageReactions)).toHaveLength(0);
  });

  it("survives a full add-remove-add cycle", async () => {
    await caller(bob).message.react({ messageId: message, emoji: "👍" });
    await caller(bob).message.react({ messageId: message, emoji: "👍" });
    const third = await caller(bob).message.react({ messageId: message, emoji: "👍" });

    expect(third.added).toBe(true);
    expect(await getDb().select().from(messageReactions)).toHaveLength(1);
  });

  it("lets one member hold several different emoji at once", async () => {
    await caller(bob).message.react({ messageId: message, emoji: "👍" });
    await caller(bob).message.react({ messageId: message, emoji: "❤️" });

    const reactions = await reactionsInHistory(bob);
    expect(reactions.map((r) => r.emoji).sort()).toEqual(["❤️", "👍"]);
  });

  // ── Grouping ────────────────────────────────────────────────────────────
  it("groups several members on the same emoji into one count", async () => {
    await caller(bob).message.react({ messageId: message, emoji: "👍" });
    await caller(carol).message.react({ messageId: message, emoji: "👍" });

    const reactions = await reactionsInHistory(bob);
    expect(reactions).toHaveLength(1);
    expect(reactions[0]).toMatchObject({ emoji: "👍", count: 2 });
    expect(new Set(reactions[0].userIds)).toEqual(new Set([bob.id, carol.id]));
  });

  it("keeps different emoji as separate groups", async () => {
    await caller(bob).message.react({ messageId: message, emoji: "👍" });
    await caller(carol).message.react({ messageId: message, emoji: "😂" });

    const reactions = await reactionsInHistory(bob);
    expect(reactions).toHaveLength(2);
    expect(reactions.every((r) => r.count === 1)).toBe(true);
  });

  it("reports `mine` from the reader's own point of view", async () => {
    await caller(bob).message.react({ messageId: message, emoji: "👍" });

    expect((await reactionsInHistory(bob))[0].mine).toBe(true);
    expect((await reactionsInHistory(carol))[0].mine).toBe(false);
  });

  it("keeps one member's removal from clearing another's", async () => {
    await caller(bob).message.react({ messageId: message, emoji: "👍" });
    await caller(carol).message.react({ messageId: message, emoji: "👍" });
    await caller(bob).message.react({ messageId: message, emoji: "👍" });

    const reactions = await reactionsInHistory(carol);
    expect(reactions[0]).toMatchObject({ emoji: "👍", count: 1, mine: true });
  });

  it("attaches reactions to the right message on a page of several", async () => {
    const second = await createMessage(conversation, alice.id, "second");
    await caller(bob).message.react({ messageId: message, emoji: "👍" });
    await caller(bob).message.react({ messageId: second, emoji: "😂" });

    const rows = await caller(carol).message.listByConversation({
      conversationId: conversation,
    });
    expect(rows.find((r) => r.id === message)!.reactions[0].emoji).toBe("👍");
    expect(rows.find((r) => r.id === second)!.reactions[0].emoji).toBe("😂");
  });

  // ── Authorization and validation ────────────────────────────────────────
  it("refuses a reaction from someone outside the conversation", async () => {
    await expect(
      caller(mallory).message.react({ messageId: message, emoji: "👍" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await getDb().select().from(messageReactions)).toHaveLength(0);
  });

  it("refuses a reaction on a message that does not exist", async () => {
    await expect(
      caller(bob).message.react({ messageId: 999_999, emoji: "👍" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a reaction on a deleted message", async () => {
    await caller(alice).message.delete({ messageId: message });

    await expect(
      caller(bob).message.react({ messageId: message, emoji: "👍" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an emoji outside the palette, so a reaction cannot become text", async () => {
    await expect(
      caller(bob).message.react({
        messageId: message,
        emoji: "not an emoji" as never,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("cascades reactions away when the message row is removed", async () => {
    await caller(bob).message.react({ messageId: message, emoji: "👍" });
    await getDb().execute(
      // A hard delete, as an account purge would do — the soft delete keeps
      // the row and therefore keeps the reactions.
      (await import("drizzle-orm")).sql`DELETE FROM messages WHERE id = ${message}`
    );

    expect(await getDb().select().from(messageReactions)).toHaveLength(0);
  });

  // ── Live ────────────────────────────────────────────────────────────────
  it("reaches every open client in the conversation", async () => {
    const watcher = await connectAs(server.port, carol);
    open.push(watcher);
    watcher.emit("joinConversation", { conversationId: conversation });
    await settle(200);

    const seen = nextEvent<{
      messageId: number;
      added: boolean;
      reactions: { emoji: string; count: number }[];
    }>(watcher, "reactionUpdated");

    await caller(bob).message.react({ messageId: message, emoji: "🙏" });

    const event = await seen;
    expect(event.messageId).toBe(message);
    expect(event.added).toBe(true);
    expect(event.reactions[0]).toMatchObject({ emoji: "🙏", count: 1 });
  });

  it("announces the removal too, not only the addition", async () => {
    await caller(bob).message.react({ messageId: message, emoji: "👍" });

    const watcher = await connectAs(server.port, carol);
    open.push(watcher);
    watcher.emit("joinConversation", { conversationId: conversation });
    await settle(200);

    const seen = nextEvent<{ added: boolean; reactions: unknown[] }>(
      watcher,
      "reactionUpdated"
    );
    await caller(bob).message.react({ messageId: message, emoji: "👍" });

    await expect(seen).resolves.toMatchObject({ added: false, reactions: [] });
  });
});
