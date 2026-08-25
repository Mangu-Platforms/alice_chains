/**
 * Integration-test database support.
 *
 * Opt in by exporting `TEST_DATABASE_URL` (see SETUP.md). Without it every
 * suite that calls `describeIntegration` is skipped, so the gate stays green on
 * a machine with no MySQL. The harness proper — fixture factories for every
 * table, socket clients, and the CI service container — is BUILD_PLAN S-7/S-12;
 * this file is the minimum those cards will grow from.
 */
import { describe } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../../api/queries/connection";
import {
  contacts,
  conversationParticipants,
  conversations,
  messageReads,
  messages,
  sessions,
  users,
} from "@db/schema";

export const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);

/** `describe` that becomes `describe.skip` when no test database is configured. */
export const describeIntegration = hasTestDatabase ? describe : describe.skip;

/** Every table, in an order that is safe to truncate once S-3 adds the FKs. */
const ALL_TABLES = [
  messageReads,
  messages,
  conversationParticipants,
  conversations,
  contacts,
  sessions,
  users,
];

/** Empty every table. Called between tests so each starts from a known state. */
export async function resetDatabase() {
  const db = getDb();
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of ALL_TABLES) {
    await db.execute(sql`TRUNCATE TABLE ${table}`);
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
}

let seq = 0;

/** Insert a user and return the full row. */
export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const db = getDb();
  seq += 1;
  const unionId = overrides.unionId ?? `union-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(users).values({
    unionId,
    name: overrides.name ?? `User ${seq}`,
    email: overrides.email ?? `user${seq}@example.test`,
    ...overrides,
  });
  const [row] = await db.select().from(users).where(sql`${users.unionId} = ${unionId}`).limit(1);
  return row;
}

/** Insert a conversation plus its participant rows. */
export async function createConversation(
  memberIds: number[],
  overrides: Partial<typeof conversations.$inferInsert> = {}
) {
  const db = getDb();
  const [res] = await db.insert(conversations).values({
    type: overrides.type ?? (memberIds.length > 2 ? "group" : "direct"),
    createdBy: overrides.createdBy ?? memberIds[0],
    ...overrides,
  });
  const id = Number(res.insertId);
  if (memberIds.length > 0) {
    await db
      .insert(conversationParticipants)
      .values(memberIds.map((userId) => ({ conversationId: id, userId })));
  }
  return id;
}

/** Insert a message and return its id. */
export async function createMessage(
  conversationId: number,
  senderId: number,
  content = "hello"
) {
  const db = getDb();
  const [res] = await db
    .insert(messages)
    .values({ conversationId, senderId, content });
  return Number(res.insertId);
}

/** Insert several messages in order and return their ids. */
export async function createMessages(
  conversationId: number,
  senderId: number,
  count: number,
  prefix = "message"
) {
  const ids: number[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(await createMessage(conversationId, senderId, `${prefix} ${i}`));
  }
  return ids;
}

/** Make two users accepted contacts of one another. */
export async function befriend(a: { id: number }, b: { id: number }) {
  await getDb()
    .insert(contacts)
    .values([
      { userId: a.id, contactUserId: b.id, status: "accepted" },
      { userId: b.id, contactUserId: a.id, status: "accepted" },
    ]);
}

/** Record `blocker` blocking `blocked`. Blocking takes effect both ways. */
export async function blockUser(blocker: { id: number }, blocked: { id: number }) {
  await getDb()
    .insert(contacts)
    .values({ userId: blocker.id, contactUserId: blocked.id, status: "blocked" })
    .onDuplicateKeyUpdate({ set: { status: "blocked" } });
}

/** A pending contact request from `requester` to `target`. */
export async function requestContact(
  requester: { id: number },
  target: { id: number }
) {
  await getDb()
    .insert(contacts)
    .values([
      { userId: requester.id, contactUserId: target.id, status: "pending" },
      { userId: target.id, contactUserId: requester.id, status: "pending" },
    ]);
}

/** Create `count` users in one go. */
export async function createUsers(count: number) {
  const rows = [];
  for (let i = 0; i < count; i += 1) rows.push(await createUser());
  return rows;
}
