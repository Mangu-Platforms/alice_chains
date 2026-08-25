/**
 * BUILD_PLAN S-8 — `message.markAsRead` authorization (tRPC door).
 *
 * Cases: TC-AUTHZ-08, TC-MSG-18, TC-MSG-19.
 * Before S-8 every assertion below that expects FORBIDDEN wrote a row instead.
 */
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { conversationParticipants, messageReads } from "@db/schema";
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

async function receiptsFor(userId: number) {
  return getDb().select().from(messageReads).where(eq(messageReads.userId, userId));
}

describeIntegration("message.markAsRead authorization (S-8)", () => {
  let alice: Row;
  let bob: Row;
  let mallory: Row;
  let sharedConversation: number;
  let privateConversation: number;
  let sharedMessage: number;
  let privateMessage: number;

  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    mallory = await createUser({ name: "Mallory" });

    sharedConversation = await createConversation([alice.id, bob.id]);
    privateConversation = await createConversation([alice.id, bob.id]);

    sharedMessage = await createMessage(sharedConversation, alice.id, "in the shared thread");
    privateMessage = await createMessage(privateConversation, bob.id, "in the other thread");
  });

  afterAll(async () => {
    await resetDatabase();
  });

  // TC-MSG-18 — the happy path still works.
  it("lets a participant mark a message in their own conversation as read", async () => {
    await caller(bob).message.markAsRead({ messageIds: [sharedMessage] });

    const rows = await receiptsFor(bob.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].messageId).toBe(sharedMessage);
  });

  // TC-AUTHZ-08 — the critical defect. A stranger to the conversation.
  it("rejects a non-participant marking a foreign message and writes no row", async () => {
    await expect(
      caller(mallory).message.markAsRead({ messageIds: [sharedMessage] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await receiptsFor(mallory.id)).toHaveLength(0);
  });

  // TC-MSG-19 — a mixed batch must fail whole, not partially apply.
  it("rejects the whole batch when one id is foreign, writing nothing", async () => {
    const outsiderConversation = await createConversation([mallory.id]);
    const outsiderMessage = await createMessage(outsiderConversation, mallory.id, "not yours");

    await expect(
      caller(bob).message.markAsRead({ messageIds: [sharedMessage, outsiderMessage] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await receiptsFor(bob.id)).toHaveLength(0);
  });

  it("rejects an id that does not exist rather than revealing that it does not", async () => {
    await expect(
      caller(bob).message.markAsRead({ messageIds: [999_999] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await receiptsFor(bob.id)).toHaveLength(0);
  });

  it("treats an empty batch as a no-op", async () => {
    await expect(caller(bob).message.markAsRead({ messageIds: [] })).resolves.toEqual({
      success: true,
    });
    expect(await receiptsFor(bob.id)).toHaveLength(0);
  });

  it("writes one row per id even when the caller repeats one", async () => {
    await caller(bob).message.markAsRead({
      messageIds: [sharedMessage, sharedMessage, privateMessage],
    });

    const rows = await receiptsFor(bob.id);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.messageId))).toEqual(
      new Set([sharedMessage, privateMessage])
    );
  });

  it("refuses a batch larger than the documented cap", async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => i + 1);
    await expect(
      caller(bob).message.markAsRead({ messageIds: tooMany })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // message.send shares the extracted assertion.
  it("refuses message.send from a non-participant with FORBIDDEN", async () => {
    await expect(
      caller(mallory).message.send({
        conversationId: sharedConversation,
        content: "let me in",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns an empty history to a non-participant", async () => {
    await expect(
      caller(mallory).message.listByConversation({ conversationId: sharedConversation })
    ).resolves.toEqual([]);
  });
});

/**
 * BUILD_PLAN S-5 — read receipts came back for only the first message on every
 * page, because `IN (${ids.join(",")})` binds the joined string as one
 * parameter and MySQL coerces "11,12,13" to 11.
 *
 * Cases: TC-MSG-14, TC-MSG-15, TC-MSG-16, TC-REG-11.
 */
describeIntegration("read receipts on message history (S-5)", () => {
  let alice: Row;
  let bob: Row;
  let conversation: number;
  let messageIds: number[];

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    conversation = await createConversation([alice.id, bob.id]);

    messageIds = [];
    for (let i = 0; i < 8; i += 1) {
      messageIds.push(await createMessage(conversation, alice.id, `message ${i}`));
    }
  });

  // TC-MSG-14 — the regression itself.
  it("returns readBy for every message on the page, not just the first", async () => {
    await caller(bob).message.markAsRead({ messageIds });

    const page = await caller(alice).message.listByConversation({ conversationId: conversation });

    expect(page).toHaveLength(8);
    for (const message of page) {
      expect(message.readBy.map((r) => r.userId)).toEqual([bob.id]);
    }
  });

  // TC-MSG-15
  it("attributes each receipt to the message it belongs to", async () => {
    const [first, , third] = messageIds;
    await caller(bob).message.markAsRead({ messageIds: [first, third] });

    const page = await caller(alice).message.listByConversation({ conversationId: conversation });
    const readIds = page.filter((m) => m.readBy.length > 0).map((m) => m.id);

    expect(new Set(readIds)).toEqual(new Set([first, third]));
  });

  it("reports every reader of a message, not only one", async () => {
    const carol = await createUser({ name: "Carol" });
    await getDb()
      .insert(conversationParticipants)
      .values({ conversationId: conversation, userId: carol.id });

    await caller(bob).message.markAsRead({ messageIds: [messageIds[0]] });
    await caller(carol).message.markAsRead({ messageIds: [messageIds[0]] });

    const page = await caller(alice).message.listByConversation({ conversationId: conversation });
    const first = page.find((m) => m.id === messageIds[0])!;

    expect(new Set(first.readBy.map((r) => r.userId))).toEqual(new Set([bob.id, carol.id]));
  });

  // TC-MSG-16
  it("returns an empty readBy when nobody has read anything", async () => {
    const page = await caller(alice).message.listByConversation({ conversationId: conversation });
    for (const message of page) expect(message.readBy).toEqual([]);
  });

  // TC-REG-11 — marking twice must not double up.
  it("is idempotent: marking the same ids twice writes one row each", async () => {
    await caller(bob).message.markAsRead({ messageIds });
    await caller(bob).message.markAsRead({ messageIds });

    const rows = await getDb()
      .select()
      .from(messageReads)
      .where(eq(messageReads.userId, bob.id));
    expect(rows).toHaveLength(8);
  });

  it("adds only the ids that are new on a second, wider call", async () => {
    await caller(bob).message.markAsRead({ messageIds: messageIds.slice(0, 3) });
    await caller(bob).message.markAsRead({ messageIds });

    const rows = await getDb()
      .select()
      .from(messageReads)
      .where(eq(messageReads.userId, bob.id));
    expect(rows).toHaveLength(8);
  });

  it("keeps receipts per reader rather than per message", async () => {
    await caller(bob).message.markAsRead({ messageIds: [messageIds[0]] });
    await caller(alice).message.markAsRead({ messageIds: [messageIds[0]] });

    const rows = await getDb().select().from(messageReads);
    expect(rows).toHaveLength(2);
  });
});

describeIntegration("message history pagination (H-9)", () => {
  let alice: Awaited<ReturnType<typeof createUser>>;
  let bob: Awaited<ReturnType<typeof createUser>>;
  let conversation: number;
  // Oldest first, matching send order — the same order the API is expected
  // to return a full, unpaged history in.
  let messageIds: number[];

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    conversation = await createConversation([alice.id, bob.id]);

    messageIds = [];
    for (let i = 0; i < 12; i += 1) {
      messageIds.push(await createMessage(conversation, alice.id, `message ${i}`));
    }
  });

  // The gap this closes: the client asked for `limit: 50` and never moved it,
  // so a conversation past 50 messages was silently truncated with no way
  // back into its own history. The server side of the fix was already
  // correct and simply untested — these pin it.
  it("returns the newest page in oldest-first order", async () => {
    const page = await caller(alice).message.listByConversation({
      conversationId: conversation,
      limit: 5,
    });

    expect(page.map((m) => m.id)).toEqual(messageIds.slice(-5));
  });

  it("moves the window back with offset, and the two pages do not overlap", async () => {
    const newest = await caller(alice).message.listByConversation({
      conversationId: conversation,
      limit: 5,
      offset: 0,
    });
    const older = await caller(alice).message.listByConversation({
      conversationId: conversation,
      limit: 5,
      offset: 5,
    });

    expect(newest.map((m) => m.id)).toEqual(messageIds.slice(-5));
    expect(older.map((m) => m.id)).toEqual(messageIds.slice(-10, -5));

    const overlap = older.filter((m) => newest.some((n) => n.id === m.id));
    expect(overlap).toEqual([]);
  });

  it("increasing the limit alone reproduces the whole history in one page", async () => {
    // This is the shape the client actually uses: rather than walking pages
    // with offset, it re-requests a larger `limit` from offset 0 each time
    // "load older" is clicked.
    const page = await caller(alice).message.listByConversation({
      conversationId: conversation,
      limit: 100,
    });

    expect(page.map((m) => m.id)).toEqual(messageIds);
  });

  it("reports fewer rows than requested once the conversation's start is reached", async () => {
    const page = await caller(alice).message.listByConversation({
      conversationId: conversation,
      limit: 50,
    });

    // The client's `hasMoreOlderMessages` reads exactly this signal.
    expect(page.length).toBeLessThan(50);
    expect(page).toHaveLength(12);
  });

  it("returns nothing past the end of a shorter conversation", async () => {
    const page = await caller(alice).message.listByConversation({
      conversationId: conversation,
      limit: 5,
      offset: 12,
    });

    expect(page).toEqual([]);
  });
});
