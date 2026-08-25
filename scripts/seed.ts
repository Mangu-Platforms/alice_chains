/**
 * Demo data for a development database (BUILD_PLAN P-TOOL-9).
 *
 *   npm run db:seed
 *
 * A new contributor's first run of this app is an empty screen behind a sign-in
 * page they cannot get through, because sign-in needs an OAuth client they have
 * not been given. This creates three members, a direct conversation, a group
 * and a pending contact request — and prints a real signed session cookie for
 * each of them, so the app can be used without a provider at all.
 *
 * Re-running is safe. Every insert is keyed on a stable demo union id and
 * skipped when the row is already there, so this adds a second conversation to
 * nobody.
 */
import { and, eq } from "drizzle-orm";
import { env } from "../api/lib/env";
import { getDb } from "../api/queries/connection";
import { startSession } from "../api/kimi/session";
import { Session } from "@contracts/constants";
import { databaseHost, isLocalDatabase } from "./seed-guards";
import {
  contacts,
  conversations,
  conversationParticipants,
  messages,
  users,
} from "@db/schema";

// ── Guards ──────────────────────────────────────────────────────────────────
//
// Seeding writes accounts whose session cookies this script then prints. That
// is exactly right for a laptop and catastrophic anywhere else, so the guard is
// a refusal rather than a prompt: there is no flag to override it, because a
// flag is something a script in someone's shell history can pass.

if (env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV=production.");
  console.error("This creates accounts and prints working session cookies for them.");
  process.exit(1);
}

if (!isLocalDatabase(env.DATABASE_URL)) {
  const host = databaseHost(env.DATABASE_URL) || "an address this could not parse";
  console.error(`Refusing to seed: DATABASE_URL points at "${host}", which is not local.`);
  console.error("Demo accounts with printed session cookies have no business on a shared database.");
  process.exit(1);
}

// ── The data ────────────────────────────────────────────────────────────────

interface DemoUser {
  unionId: string;
  name: string;
  email: string;
  status: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    unionId: "demo-alice",
    name: "Alice Demo",
    email: "alice@example.test",
    status: "Building the thing",
  },
  {
    unionId: "demo-bob",
    name: "Bob Demo",
    email: "bob@example.test",
    status: "Mostly here",
  },
  {
    unionId: "demo-carol",
    name: "Carol Demo",
    email: "carol@example.test",
    status: "Newly arrived",
  },
];

const DIRECT_MESSAGES: [string, string][] = [
  ["demo-alice", "Morning — did the migration finish?"],
  ["demo-bob", "It did. Took about forty seconds on the constraint step."],
  ["demo-alice", "Good. That one aborts rather than guessing if it finds an orphan."],
  ["demo-bob", "Noticed. The error names the runbook section, which was a nice touch."],
];

const GROUP_NAME = "Design review";
const GROUP_MESSAGES: [string, string][] = [
  ["demo-alice", "Putting the media drawer in front of you both this afternoon."],
  ["demo-carol", "Does it separate images from files, or is it one list?"],
  ["demo-alice", "Two groups. You look for a picture with your eyes and a document by name."],
  ["demo-bob", "Agreed. Newest first in both, I hope."],
];

const db = getDb();

async function findOrCreateUser(demo: DemoUser): Promise<number> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.unionId, demo.unionId));

  if (existing) return existing.id;

  const [result] = await db.insert(users).values({
    unionId: demo.unionId,
    name: demo.name,
    email: demo.email,
    status: demo.status,
  });

  return Number(result.insertId);
}

/** A conversation with exactly these members, created once. */
async function findOrCreateConversation(
  type: "direct" | "group",
  name: string | null,
  createdBy: number,
  memberIds: number[]
): Promise<{ id: number; created: boolean }> {
  const candidates = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.type, type), eq(conversations.createdBy, createdBy)));

  for (const candidate of candidates) {
    const members = await db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, candidate.id));

    const ids = members.map((m) => m.userId).sort();
    if (ids.length === memberIds.length && ids.every((id, i) => id === [...memberIds].sort()[i])) {
      return { id: candidate.id, created: false };
    }
  }

  const [result] = await db.insert(conversations).values({ type, name, createdBy });
  const id = Number(result.insertId);

  await db
    .insert(conversationParticipants)
    .values(memberIds.map((userId) => ({ conversationId: id, userId })));

  return { id, created: true };
}

async function seedMessages(conversationId: number, script: [string, string][], byUnionId: Map<string, number>) {
  for (const [unionId, content] of script) {
    const senderId = byUnionId.get(unionId)!;
    await db.insert(messages).values({ conversationId, senderId, content });
  }
  // `insertMessage` normally touches this; a direct insert has to do it too, or
  // the sidebar sorts the seeded conversations by creation time and looks wrong.
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

async function linkContacts(a: number, b: number, status: "accepted" | "pending") {
  const pairs: [number, number][] = status === "accepted" ? [[a, b], [b, a]] : [[a, b]];

  for (const [userId, contactUserId] of pairs) {
    const [existing] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), eq(contacts.contactUserId, contactUserId)));

    if (!existing) {
      await db.insert(contacts).values({ userId, contactUserId, status });
    }
  }
}

async function main() {
  console.log("Seeding a development database…\n");

  const byUnionId = new Map<string, number>();
  for (const demo of DEMO_USERS) {
    const id = await findOrCreateUser(demo);
    byUnionId.set(demo.unionId, id);
    console.log(`  user      ${demo.name} (#${id})`);
  }

  const alice = byUnionId.get("demo-alice")!;
  const bob = byUnionId.get("demo-bob")!;
  const carol = byUnionId.get("demo-carol")!;

  // Alice and Bob know each other; Carol has asked Alice and is waiting, so the
  // contact-request UI has something to show rather than an empty state.
  await linkContacts(alice, bob, "accepted");
  await linkContacts(carol, alice, "pending");
  console.log("  contacts  Alice ↔ Bob accepted, Carol → Alice pending");

  const direct = await findOrCreateConversation("direct", null, alice, [alice, bob]);
  if (direct.created) {
    await seedMessages(direct.id, DIRECT_MESSAGES, byUnionId);
    console.log(`  direct    Alice ↔ Bob (#${direct.id}), ${DIRECT_MESSAGES.length} messages`);
  } else {
    console.log(`  direct    Alice ↔ Bob (#${direct.id}) already seeded`);
  }

  const group = await findOrCreateConversation("group", GROUP_NAME, alice, [alice, bob, carol]);
  if (group.created) {
    await seedMessages(group.id, GROUP_MESSAGES, byUnionId);
    console.log(`  group     ${GROUP_NAME} (#${group.id}), ${GROUP_MESSAGES.length} messages`);
  } else {
    console.log(`  group     ${GROUP_NAME} (#${group.id}) already seeded`);
  }

  // ── Sign-in without a provider ────────────────────────────────────────────
  //
  // A session row plus a signed cookie is exactly what the OAuth callback
  // produces, so these are ordinary sessions: they expire, they can be revoked,
  // and `auth.me` treats them like any other. Nothing here weakens the server —
  // the script simply has the signing key, because it is running on the machine
  // that owns it.
  console.log("\nSign in as any of them by setting this cookie on http://localhost:3000");
  console.log("(devtools → Application → Cookies, or paste the JS into the console):\n");

  for (const demo of DEMO_USERS) {
    const userId = byUnionId.get(demo.unionId)!;
    const token = await startSession({
      userId,
      unionId: demo.unionId,
      name: demo.name,
      email: demo.email,
    });

    console.log(`  ${demo.name}`);
    console.log(`    document.cookie = "${Session.cookieName}=${token}; path=/"`);
    console.log("");
  }

  console.log(`Sessions last ${Session.maxAgeSeconds / 86400} days. Re-run this to mint new ones.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nSeeding failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
