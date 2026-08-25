/**
 * BUILD_PLAN F-2 — message editing and soft deletion.
 *
 * Cases: TC-MSG-26, TC-MSG-27, and FR-MSG-11 (deterministic ordering), which
 * shares the ORDER BY this card had to change.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Socket as ClientSocket } from "socket.io-client";
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
import { appRouter } from "./router";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

describeIntegration("message edit and delete (F-2)", () => {
  let server: TestServer;
  let alice: Row;
  let bob: Row;
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
    mallory = await createUser({ name: "Mallory" });
    conversation = await createConversation([alice.id, bob.id]);
    message = await createMessage(conversation, alice.id, "original");
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(150);
  });

  async function joinedClient(user: Row) {
    const socket = await connectAs(server.port, user);
    open.push(socket);
    socket.emit("joinConversation", { conversationId: conversation });
    await settle(200);
    return socket;
  }

  async function history(user: Row) {
    return caller(user).message.listByConversation({ conversationId: conversation });
  }

  // ── Editing ─────────────────────────────────────────────────────────────
  // TC-MSG-26
  it("lets the author edit their own message and marks it edited", async () => {
    await caller(alice).message.edit({ messageId: message, content: "revised" });

    const [row] = await history(bob);
    expect(row.content).toBe("revised");
    expect(row.isEdited).toBe(true);
  });

  it("refuses an edit from another member of the conversation", async () => {
    await expect(
      caller(bob).message.edit({ messageId: message, content: "not yours" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect((await history(bob))[0].content).toBe("original");
  });

  it("refuses an edit from someone outside the conversation", async () => {
    await expect(
      caller(mallory).message.edit({ messageId: message, content: "hijacked" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an edit of a message that does not exist, the same way", async () => {
    await expect(
      caller(alice).message.edit({ messageId: 999_999, content: "ghost" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an empty edit and one past the length cap", async () => {
    await expect(
      caller(alice).message.edit({ messageId: message, content: "   " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller(alice).message.edit({ messageId: message, content: "x".repeat(4001) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("reaches an open client live", async () => {
    const watcher = await joinedClient(bob);

    const seen = nextEvent<{ id: number; content: string; isEdited: boolean }>(
      watcher,
      "messageUpdated"
    );
    await caller(alice).message.edit({ messageId: message, content: "live edit" });

    await expect(seen).resolves.toMatchObject({
      id: message,
      content: "live edit",
      isEdited: true,
    });
  });

  // ── Deleting ────────────────────────────────────────────────────────────
  // TC-MSG-27
  it("soft-deletes: the row survives as a tombstone with no content", async () => {
    await caller(alice).message.delete({ messageId: message });

    const [stored] = await getDb().select().from(messages).where(eq(messages.id, message));
    expect(stored).toBeDefined();
    expect(stored.content).toBe("");
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.deletedBy).toBe(alice.id);
  });

  it("returns the tombstone in history so a thread keeps its shape", async () => {
    const before = await createMessage(conversation, bob.id, "before");
    const after = await createMessage(conversation, bob.id, "after");
    await caller(alice).message.delete({ messageId: message });

    const rows = await history(bob);
    expect(rows.map((r) => r.id)).toEqual([message, before, after]);

    const tombstone = rows.find((r) => r.id === message)!;
    expect(tombstone.content).toBe("");
    expect(tombstone.deletedAt).not.toBeNull();
  });

  it("never returns the deleted body to anyone", async () => {
    await caller(alice).message.delete({ messageId: message });

    for (const reader of [alice, bob]) {
      const rows = await history(reader);
      expect(JSON.stringify(rows)).not.toContain("original");
    }
  });

  it("refuses a delete from another member", async () => {
    await expect(
      caller(bob).message.delete({ messageId: message })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const [stored] = await getDb().select().from(messages).where(eq(messages.id, message));
    expect(stored.deletedAt).toBeNull();
  });

  it("refuses to edit or re-delete a message that is already deleted", async () => {
    await caller(alice).message.delete({ messageId: message });

    await expect(
      caller(alice).message.edit({ messageId: message, content: "back from the dead" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller(alice).message.delete({ messageId: message })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reaches an open client live", async () => {
    const watcher = await joinedClient(bob);

    const seen = nextEvent<{ id: number }>(watcher, "messageDeleted");
    await caller(alice).message.delete({ messageId: message });

    await expect(seen).resolves.toMatchObject({ id: message });
  });

  // ── The sidebar must not show a tombstone ───────────────────────────────
  it("falls back to the previous message in the sidebar preview", async () => {
    await createMessage(conversation, bob.id, "the one before");
    const newest = await createMessage(conversation, alice.id, "the newest");

    await caller(alice).message.delete({ messageId: newest });

    const [row] = await caller(bob).conversation.list();
    expect(row.latestMessage?.content).toBe("the one before");
  });

  it("shows no preview when every message has been deleted", async () => {
    await caller(alice).message.delete({ messageId: message });

    const [row] = await caller(bob).conversation.list();
    expect(row.latestMessage).toBeNull();
  });

  it("stops counting a deleted message as unread", async () => {
    expect((await caller(bob).conversation.list())[0].unreadCount).toBe(1);

    await caller(alice).message.delete({ messageId: message });

    expect((await caller(bob).conversation.list())[0].unreadCount).toBe(0);
  });

  // ── FR-MSG-11, the ordering this card had to touch ──────────────────────
  it("orders messages deterministically within the same second", async () => {
    // MySQL TIMESTAMP here has one-second resolution, so these all share a
    // createdAt. Without the id tiebreaker the order was arbitrary and could
    // differ between two fetches of the same page.
    const ids = [message];
    for (const text of ["b", "c", "d", "e", "f"]) {
      ids.push(await createMessage(conversation, alice.id, text));
    }

    const first = (await history(bob)).map((r) => r.id);
    const second = (await history(bob)).map((r) => r.id);

    expect(first).toEqual(ids);
    expect(second).toEqual(ids);
  });
});
