/**
 * BUILD_PLAN S-3 — foreign keys, unique constraints and indexes.
 *
 * Cases: TC-DATA-01…TC-DATA-10, TC-CONT-11, TC-CONT-18, TC-MSG-19.
 *
 * These assert against the *live* schema, so they fail if a future migration
 * drops a constraint — which is the only way the guarantees below can regress.
 */
import { beforeEach, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  contacts,
  conversationParticipants,
  conversations,
  messageReads,
  messages,
  users,
} from "@db/schema";
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

async function foreignKeys() {
  const [rows] = (await getDb().execute(sql`
    SELECT rc.TABLE_NAME AS tbl, rc.CONSTRAINT_NAME AS name, rc.DELETE_RULE AS onDelete
    FROM information_schema.REFERENTIAL_CONSTRAINTS rc
    WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
  `)) as unknown as [{ tbl: string; name: string; onDelete: string }[]];
  return new Map(rows.map((r) => [r.name, r]));
}

async function indexNames() {
  const [rows] = (await getDb().execute(sql`
    SELECT DISTINCT INDEX_NAME AS name, NON_UNIQUE AS nonUnique
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
  `)) as unknown as [{ name: string; nonUnique: number }[]];
  return rows;
}

describeIntegration("schema constraints (S-3)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  // ── Foreign keys: TC-DATA-01 ────────────────────────────────────────────
  it("declares all ten foreign keys with the specified ON DELETE rules", async () => {
    const fks = await foreignKeys();

    const expected: Record<string, string> = {
      cp_conversationId_conversations_id_fk: "CASCADE", // FK-1
      cp_userId_users_id_fk: "CASCADE", // FK-2
      messages_conversationId_conversations_id_fk: "CASCADE", // FK-3
      messages_senderId_users_id_fk: "RESTRICT", // FK-4
      messages_replyToId_messages_id_fk: "SET NULL", // FK-5
      message_reads_messageId_messages_id_fk: "CASCADE", // FK-6
      message_reads_userId_users_id_fk: "CASCADE", // FK-7
      contacts_userId_users_id_fk: "CASCADE", // FK-8
      contacts_contactUserId_users_id_fk: "CASCADE", // FK-9
      conversations_createdBy_users_id_fk: "RESTRICT", // FK-10
    };

    for (const [name, rule] of Object.entries(expected)) {
      expect(fks.get(name), `${name} is missing`).toBeDefined();
      expect(fks.get(name)!.onDelete, `${name} ON DELETE`).toBe(rule);
    }
  });

  it("declares the six indexes the hot paths need", async () => {
    const names = new Set((await indexNames()).map((r) => r.name));
    for (const name of [
      "messages_conversation_created_idx", // IX-1
      "cp_user_idx", // IX-2
      "contacts_contactUser_status_idx", // IX-3
      "contacts_user_status_idx", // IX-4
      "messages_sender_idx", // IX-6
      "conversations_createdBy_idx",
    ]) {
      expect(names, `${name} is missing`).toContain(name);
    }
  });

  it("declares the three unique constraints", async () => {
    const unique = new Set(
      (await indexNames()).filter((r) => Number(r.nonUnique) === 0).map((r) => r.name)
    );
    expect(unique).toContain("cp_conversation_user_uq"); // UQ-1
    expect(unique).toContain("message_reads_message_user_uq"); // UQ-2
    expect(unique).toContain("contacts_user_contact_uq"); // UQ-3
  });

  // ── Referential integrity: TC-DATA-02…05 ────────────────────────────────
  it("refuses a membership row naming a conversation that does not exist", async () => {
    const alice = await createUser();
    await expect(
      getDb()
        .insert(conversationParticipants)
        .values({ conversationId: 999_999, userId: alice.id })
    ).rejects.toThrow(/foreign key/i);
  });

  it("refuses a message naming a sender that does not exist", async () => {
    const alice = await createUser();
    const conv = await createConversation([alice.id]);
    await expect(
      getDb()
        .insert(messages)
        .values({ conversationId: conv, senderId: 999_999, content: "x" })
    ).rejects.toThrow(/foreign key/i);
  });

  it("cascades a deleted conversation through its memberships and messages", async () => {
    const alice = await createUser();
    const conv = await createConversation([alice.id]);
    await createMessage(conv, alice.id);

    await getDb().delete(conversations).where(sql`${conversations.id} = ${conv}`);

    expect(await getDb().select().from(conversationParticipants)).toHaveLength(0);
    expect(await getDb().select().from(messages)).toHaveLength(0);
  });

  it("cascades a deleted message through its read receipts", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const conv = await createConversation([alice.id, bob.id]);
    const msg = await createMessage(conv, alice.id);
    await caller(bob).message.markAsRead({ messageIds: [msg] });

    await getDb().delete(messages).where(sql`${messages.id} = ${msg}`);
    expect(await getDb().select().from(messageReads)).toHaveLength(0);
  });

  // FK-4 / FK-10 are RESTRICT on purpose.
  it("refuses to delete a user who still authors messages", async () => {
    const alice = await createUser();
    const conv = await createConversation([alice.id]);
    await createMessage(conv, alice.id);

    await expect(
      getDb().delete(users).where(sql`${users.id} = ${alice.id}`)
    ).rejects.toThrow(/foreign key/i);
  });

  it("degrades a reply to a normal message when its parent is deleted", async () => {
    const alice = await createUser();
    const conv = await createConversation([alice.id]);
    const parent = await createMessage(conv, alice.id, "parent");
    const [res] = await getDb()
      .insert(messages)
      .values({ conversationId: conv, senderId: alice.id, content: "reply", replyToId: parent });
    const replyId = Number(res.insertId);

    await getDb().delete(messages).where(sql`${messages.id} = ${parent}`);

    const [reply] = await getDb().select().from(messages).where(sql`${messages.id} = ${replyId}`);
    expect(reply).toBeDefined();
    expect(reply.replyToId).toBeNull();
  });

  // ── Uniqueness: TC-DATA-06…08, TC-CONT-11, TC-CONT-18, TC-MSG-19 ────────
  it("refuses a duplicate membership row", async () => {
    const alice = await createUser();
    const conv = await createConversation([alice.id]);
    await expect(
      getDb().insert(conversationParticipants).values({ conversationId: conv, userId: alice.id })
    ).rejects.toThrow(/duplicate/i);
  });

  it("refuses a duplicate read receipt", async () => {
    const alice = await createUser();
    const conv = await createConversation([alice.id]);
    const msg = await createMessage(conv, alice.id);
    await getDb().insert(messageReads).values({ messageId: msg, userId: alice.id });

    await expect(
      getDb().insert(messageReads).values({ messageId: msg, userId: alice.id })
    ).rejects.toThrow(/duplicate/i);
  });

  it("refuses a duplicate contact edge", async () => {
    const alice = await createUser();
    const bob = await createUser();
    await getDb().insert(contacts).values({ userId: alice.id, contactUserId: bob.id });

    await expect(
      getDb().insert(contacts).values({ userId: alice.id, contactUserId: bob.id })
    ).rejects.toThrow(/duplicate/i);
  });

  // ── The routers now rely on the constraints instead of try/catch ─────────
  it("marks the same messages read twice without raising or double-writing", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const conv = await createConversation([alice.id, bob.id]);
    const ids = [
      await createMessage(conv, alice.id, "a"),
      await createMessage(conv, alice.id, "b"),
    ];

    await caller(bob).message.markAsRead({ messageIds: ids });
    await caller(bob).message.markAsRead({ messageIds: ids });

    expect(await getDb().select().from(messageReads)).toHaveLength(2);
  });

  // TC-CONT-18 — the TOCTOU race the check-then-insert could not win.
  it("cannot duplicate a contact under concurrent adds", async () => {
    const alice = await createUser();
    const bob = await createUser();

    await Promise.all([
      caller(alice).contact.add({ contactUserId: bob.id }),
      caller(alice).contact.add({ contactUserId: bob.id }),
      caller(alice).contact.add({ contactUserId: bob.id }),
    ]);

    const rows = await getDb().select().from(contacts);
    // One row per direction, and no more.
    expect(rows).toHaveLength(2);
  });

  // TC-CONT-11 — re-adding must never weaken an existing state.
  it("does not reset an accepted contact to pending when re-added", async () => {
    const alice = await createUser();
    const bob = await createUser();

    await caller(alice).contact.add({ contactUserId: bob.id });
    await caller(bob).contact.accept({ contactId: alice.id });
    await caller(alice).contact.add({ contactUserId: bob.id });

    const rows = await getDb().select().from(contacts);
    expect(rows.every((r) => r.status === "accepted")).toBe(true);
  });

  it("does not un-block someone by re-adding them", async () => {
    const alice = await createUser();
    const bob = await createUser();
    await getDb()
      .insert(contacts)
      .values({ userId: alice.id, contactUserId: bob.id, status: "blocked" });

    await caller(alice).contact.add({ contactUserId: bob.id });

    const [row] = await getDb()
      .select()
      .from(contacts)
      .where(sql`${contacts.userId} = ${alice.id} AND ${contacts.contactUserId} = ${bob.id}`);
    expect(row.status).toBe("blocked");
  });

  // TC-DATA-09 — the index the history query depends on is actually chosen.
  it("uses the (conversationId, createdAt) index for message history", async () => {
    const alice = await createUser();
    const conv = await createConversation([alice.id]);
    for (let i = 0; i < 5; i += 1) await createMessage(conv, alice.id, `m${i}`);

    const [plan] = (await getDb().execute(sql`
      EXPLAIN SELECT * FROM messages
      WHERE conversationId = ${conv} ORDER BY createdAt DESC LIMIT 50
    `)) as unknown as [{ key: string | null }[]];

    expect(plan[0].key).toBe("messages_conversation_created_idx");
  });
});
