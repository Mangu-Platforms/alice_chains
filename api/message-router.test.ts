/**
 * BUILD_PLAN S-8 — `message.markAsRead` authorization (tRPC door).
 *
 * Cases: TC-AUTHZ-08, TC-MSG-18, TC-MSG-19.
 * Before S-8 every assertion below that expects FORBIDDEN wrote a row instead.
 */
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { messageReads } from "@db/schema";
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
