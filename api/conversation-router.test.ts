/**
 * BUILD_PLAN S-9 — participant validation, blocking, the group cap, and the
 * `createDirect` idempotency bug.
 *
 * Cases: TC-CONV-01, TC-CONV-02, TC-CONV-11, TC-CONV-12, TC-CONV-13,
 * TC-CONV-15, TC-CONV-16, TC-CONT-24.
 */
import { beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { contacts, conversationParticipants, conversations } from "@db/schema";
import {
  createConversation,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import { getDb } from "./queries/connection";
import { appRouter } from "./router";

type Row = Awaited<ReturnType<typeof createUser>>;

const caller = (user: Row) => appRouter.createCaller({ user });

async function block(blocker: Row, blocked: Row) {
  await getDb().insert(contacts).values({
    userId: blocker.id,
    contactUserId: blocked.id,
    status: "blocked",
  });
}

async function membersOf(conversationId: number) {
  const rows = await getDb()
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));
  return new Set(rows.map((r) => r.userId));
}

describeIntegration("conversation creation validation (S-9)", () => {
  let alice: Row;
  let bob: Row;
  let carol: Row;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    carol = await createUser({ name: "Carol" });
  });

  // ── Existence ───────────────────────────────────────────────────────────
  // TC-CONV-11
  it("refuses a direct conversation with an id that does not exist", async () => {
    await expect(
      caller(alice).conversation.createDirect({ otherUserId: 987_654 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await getDb().select().from(conversations)).toHaveLength(0);
  });

  // TC-CONV-12
  it("refuses a group containing an id that does not exist, creating nothing", async () => {
    await expect(
      caller(alice).conversation.createGroup({
        name: "Ghosts",
        participantIds: [bob.id, 987_654],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await getDb().select().from(conversations)).toHaveLength(0);
    expect(await getDb().select().from(conversationParticipants)).toHaveLength(0);
  });

  it("refuses a direct conversation with yourself", async () => {
    await expect(
      caller(alice).conversation.createDirect({ otherUserId: alice.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a group whose only named member is the caller", async () => {
    await expect(
      caller(alice).conversation.createGroup({
        name: "Party of one",
        participantIds: [alice.id],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // ── Blocking ────────────────────────────────────────────────────────────
  // TC-CONV-13 / TC-CONT-24
  it("refuses a direct conversation with someone who has blocked the caller", async () => {
    await block(bob, alice);

    await expect(
      caller(alice).conversation.createDirect({ otherUserId: bob.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await getDb().select().from(conversations)).toHaveLength(0);
  });

  it("refuses a direct conversation with someone the caller has blocked", async () => {
    await block(alice, bob);

    await expect(
      caller(alice).conversation.createDirect({ otherUserId: bob.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to pull a blocked user into a group, creating nothing", async () => {
    await block(carol, alice);

    await expect(
      caller(alice).conversation.createGroup({
        name: "Uninvited",
        participantIds: [bob.id, carol.id],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await getDb().select().from(conversations)).toHaveLength(0);
  });

  it("names no id when refusing, so the caller cannot learn who blocked them", async () => {
    await block(carol, alice);

    await expect(
      caller(alice).conversation.createGroup({
        name: "Uninvited",
        participantIds: [bob.id, carol.id],
      })
    ).rejects.toMatchObject({
      message: expect.not.stringContaining(String(carol.id)),
    });
  });

  it("allows a group once an unrelated pair is blocked but the caller is not", async () => {
    await block(bob, carol);

    const group = await caller(alice).conversation.createGroup({
      name: "Fine",
      participantIds: [bob.id, carol.id],
    });

    expect(await membersOf(group.id)).toEqual(new Set([alice.id, bob.id, carol.id]));
  });

  // ── The group cap ───────────────────────────────────────────────────────
  // TC-CONV-16
  it("refuses a group larger than the documented cap", async () => {
    const tooMany = Array.from({ length: 256 }, (_, i) => i + 100);

    await expect(
      caller(alice).conversation.createGroup({ name: "Crowd", participantIds: tooMany })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await getDb().select().from(conversations)).toHaveLength(0);
  });

  // ── createDirect idempotency ────────────────────────────────────────────
  // TC-CONV-01
  it("returns the same conversation when a direct chat is opened twice", async () => {
    const first = await caller(alice).conversation.createDirect({ otherUserId: bob.id });
    const second = await caller(alice).conversation.createDirect({ otherUserId: bob.id });

    expect(second.id).toBe(first.id);
    expect(await getDb().select().from(conversations)).toHaveLength(1);
  });

  it("returns the same conversation when the other party opens it", async () => {
    const first = await caller(alice).conversation.createDirect({ otherUserId: bob.id });
    const second = await caller(bob).conversation.createDirect({ otherUserId: alice.id });

    expect(second.id).toBe(first.id);
    expect(await getDb().select().from(conversations)).toHaveLength(1);
  });

  // TC-CONV-02 — the actual regression: a shared group masked the existing DM.
  it("does not duplicate a DM when the pair also shares a group", async () => {
    // The group is created first, so it sorts ahead of the DM and is the row
    // the old lookup picked before filtering on type.
    await createConversation([alice.id, bob.id, carol.id], {
      type: "group",
      name: "Shared group",
      createdBy: alice.id,
    });
    const dm = await caller(alice).conversation.createDirect({ otherUserId: bob.id });

    const again = await caller(alice).conversation.createDirect({ otherUserId: bob.id });

    expect(again.id).toBe(dm.id);
    const directs = await getDb()
      .select()
      .from(conversations)
      .where(eq(conversations.type, "direct"));
    expect(directs).toHaveLength(1);
  });

  it("creates a direct conversation with exactly the two members", async () => {
    const conv = await caller(alice).conversation.createDirect({ otherUserId: bob.id });
    expect(await membersOf(conv.id)).toEqual(new Set([alice.id, bob.id]));
    expect(conv.type).toBe("direct");
  });

  it("deduplicates a repeated id rather than writing the member twice", async () => {
    const group = await caller(alice).conversation.createGroup({
      name: "Dupes",
      participantIds: [bob.id, bob.id, alice.id],
    });

    const rows = await getDb()
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, group.id));
    expect(rows).toHaveLength(2);
  });
});
