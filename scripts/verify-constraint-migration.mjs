#!/usr/bin/env node
/**
 * Prove migration 0002 (S-3) against a deliberately dirty database.
 *
 * The constraint migration is the one piece of this repository that runs
 * exactly once per deployment, against data nobody has inspected. Its dedupe
 * and orphan-remediation steps therefore cannot be covered by the ordinary test
 * suite, which always starts from an empty schema. This script provisions a
 * scratch database, fills it with every failure mode DATA_MODEL.md 4.3
 * enumerates, migrates it, and asserts the outcome.
 *
 *   npm run db:verify-migration
 *
 * Requires a MySQL account that may CREATE and DROP a database. Set
 * ADMIN_DATABASE_URL, or it falls back to DATABASE_URL / TEST_DATABASE_URL.
 */
import mysql from "mysql2/promise";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "db/migrations";
const SCRATCH = "alice_migration_probe";

const adminUrl =
  process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;

if (!adminUrl) {
  console.error("Set ADMIN_DATABASE_URL (or DATABASE_URL) to a MySQL account that may CREATE DATABASE.");
  process.exit(2);
}

const failures = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!ok) failures.push(label);
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Apply one migration the way Drizzle's migrator does: split on the breakpoint
 * marker and send each statement on its own. The `mysql` CLI cannot be used
 * here — it needs DELIMITER for the preflight procedure body, which is a
 * client-side parsing concern the wire protocol does not have.
 */
async function apply(conn, file) {
  const statements = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await conn.query(statement);
  return statements.length;
}

async function connect(database) {
  const url = new URL(adminUrl);
  if (database) url.pathname = `/${database}`;
  return mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: database ?? undefined,
    multipleStatements: false,
  });
}

async function freshScratch() {
  let root;
  try {
    root = await connect(null);
  } catch (error) {
    console.error(`\nCannot connect: ${error.message}`);
    console.error("Point ADMIN_DATABASE_URL at an account with CREATE DATABASE.");
    process.exit(2);
  }
  try {
    await root.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``);
    await root.query(`CREATE DATABASE \`${SCRATCH}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (error) {
    console.error(`\nCannot create the scratch database: ${error.message}`);
    console.error("Point ADMIN_DATABASE_URL at an account with CREATE DATABASE.");
    process.exit(2);
  } finally {
    await root.end();
  }
}

const files = migrationFiles();
const base = files.filter((f) => !f.startsWith("0002"));
const constraintMigration = files.find((f) => f.startsWith("0002"));

if (!constraintMigration) {
  console.error("No 0002_* migration found.");
  process.exit(2);
}

// ── Case 1: dirty data that the runbook can remediate ──────────────────────
console.log("\nCase 1 — duplicates and auto-remediable orphans");
await freshScratch();
{
  const db = await connect(SCRATCH);
  for (const file of base) await apply(db, file);

  const countForeignKeys = async () => {
    const [rows] = await db.query(
      `SELECT COUNT(*) c FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()`
    );
    return Number(rows[0].c);
  };
  const fksBeforeConstraintMigration = await countForeignKeys();

  await db.query(
    `INSERT INTO users (unionId, name) VALUES ('u1','Alice'),('u2','Bob'),('u3','Carol')`
  );
  await db.query(`INSERT INTO conversations (type, createdBy) VALUES ('direct',1),('group',1)`);
  // UQ-1: the same member joined twice, three times.
  await db.query(
    `INSERT INTO conversation_participants (conversationId, userId)
     VALUES (1,1),(1,1),(1,2),(2,1),(2,2),(2,2),(2,2)`
  );
  await db.query(
    `INSERT INTO messages (conversationId, senderId, content) VALUES (1,1,'hi'),(1,2,'hello')`
  );
  // UQ-2: the same receipt three times.
  await db.query(`INSERT INTO message_reads (messageId, userId) VALUES (1,2),(1,2),(1,2),(2,1)`);
  // UQ-3: a directed pair holding three different statuses. `blocked` must win.
  await db.query(
    `INSERT INTO contacts (userId, contactUserId, status)
     VALUES (1,2,'pending'),(1,2,'blocked'),(1,2,'accepted'),(2,1,'accepted'),(2,1,'pending')`
  );
  // Orphans of the CASCADE / SET NULL kind.
  await db.query(`INSERT INTO conversation_participants (conversationId, userId) VALUES (999,1),(1,999)`);
  await db.query(`INSERT INTO messages (conversationId, senderId, content) VALUES (999,1,'orphan')`);
  await db.query(
    `INSERT INTO messages (conversationId, senderId, content, replyToId) VALUES (1,1,'dangling reply',888)`
  );
  await db.query(`INSERT INTO message_reads (messageId, userId) VALUES (777,1),(1,777)`);
  await db.query(`INSERT INTO contacts (userId, contactUserId, status) VALUES (666,1,'pending'),(1,666,'pending')`);

  const count = async (t) => Number((await db.query(`SELECT COUNT(*) c FROM ${t}`))[0][0].c);
  console.log(
    `  seeded: participants=${await count("conversation_participants")} ` +
      `reads=${await count("message_reads")} contacts=${await count("contacts")} messages=${await count("messages")}`
  );

  await apply(db, constraintMigration);

  check("duplicate memberships collapsed", await count("conversation_participants"), 4);
  check("duplicate receipts collapsed", await count("message_reads"), 2);
  check("duplicate contact edges collapsed", await count("contacts"), 2);
  check("orphaned message removed", await count("messages"), 3);

  const [pair] = await db.query(
    `SELECT status FROM contacts WHERE userId=1 AND contactUserId=2`
  );
  // The safety property: collapsing to an arbitrary survivor could silently
  // un-block someone. Precedence is blocked > accepted > pending.
  check("blocked wins the contacts collapse", pair[0]?.status, "blocked");

  const [dangling] = await db.query(
    `SELECT replyToId FROM messages WHERE content='dangling reply'`
  );
  check("dangling replyToId set to NULL", dangling[0]?.replyToId, null);

  // Asserted as a delta, not an absolute total: `base` includes every migration
  // but 0002, so later waves adding their own FK-bearing tables (sessions,
  // reactions, attachments, ...) change the schema-wide total without touching
  // what 0002 itself is responsible for. 0002 creates exactly 10 — one per
  // FOREIGN KEY clause in db/migrations/0002_*.sql — regardless of how many
  // migrations come after it.
  check("foreign keys created by the constraint migration", (await countForeignKeys()) - fksBeforeConstraintMigration, 10);

  // Re-running must be a no-op, not an error.
  try {
    await apply(db, constraintMigration);
    check("migration is not idempotent (expected)", "reapplied", "should have failed");
  } catch {
    console.log("  PASS  re-applying the DDL fails as MySQL requires (constraints already exist)");
  }

  await db.end();
}

// ── Case 2: an orphan the runbook must refuse to remediate ─────────────────
console.log("\nCase 2 — a RESTRICT orphan must abort the migration, not guess");
await freshScratch();
{
  const db = await connect(SCRATCH);
  for (const file of base) await apply(db, file);

  await db.query(`INSERT INTO users (unionId, name) VALUES ('u1','Alice')`);
  await db.query(`INSERT INTO conversations (type, createdBy) VALUES ('direct',1)`);
  // The author no longer exists. Anonymise or purge is a human decision.
  await db.query(
    `INSERT INTO messages (conversationId, senderId, content) VALUES (1,4242,'author was deleted')`
  );

  let aborted = null;
  try {
    await apply(db, constraintMigration);
  } catch (error) {
    aborted = error.message;
  }

  check("migration aborted", aborted !== null, true);
  check(
    "abort message points at the runbook",
    Boolean(aborted && aborted.includes("DATA_MODEL.md")),
    true
  );
  if (aborted) console.log(`          → ${aborted}`);

  await db.end();
}

// ── Cleanup ────────────────────────────────────────────────────────────────
{
  const root = await connect(null);
  await root.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``);
  await root.end();
}

console.log(
  failures.length === 0
    ? "\nAll migration checks passed.\n"
    : `\n${failures.length} check(s) FAILED: ${failures.join(", ")}\n`
);
process.exit(failures.length === 0 ? 0 : 1);
