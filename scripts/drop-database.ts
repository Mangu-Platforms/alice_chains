/**
 * Drop and recreate the schema named in DATABASE_URL (BUILD_PLAN P-TOOL-2).
 *
 * The SKIP_DB=1 half of `reset-dev.sh`, for someone running their own MySQL
 * where there is no volume to remove. Guarded by the same tested predicate as
 * everything else destructive here, so it is safe to invoke directly — the
 * shell script's confirmation is a courtesy, not the protection.
 */
import mysql from "mysql2/promise";
import { isLocalDatabase, databaseHost } from "./seed-guards";

const url = process.env.DATABASE_URL ?? "";

if (!isLocalDatabase(url)) {
  console.error(
    `Refusing to drop: DATABASE_URL points at "${databaseHost(url) || "an unparseable address"}".`
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to drop: NODE_ENV=production.");
  process.exit(1);
}

const parsed = new URL(url);
const database = parsed.pathname.slice(1);

if (!database) {
  console.error("Refusing to drop: DATABASE_URL names no database.");
  process.exit(1);
}

// Connect with no database selected, so DROP does not pull the connection out
// from under itself.
parsed.pathname = "/";

const connection = await mysql.createConnection(parsed.toString());

try {
  // The name comes from a connection string the operator wrote, and MySQL does
  // not parameterise identifiers. Backtick-quote it and reject a name that
  // contains a backtick, rather than interpolating whatever arrived.
  if (database.includes("`")) {
    console.error("Refusing to drop: the database name contains a backtick.");
    process.exit(1);
  }

  await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await connection.query(`CREATE DATABASE \`${database}\``);
  console.log(`Dropped and recreated \`${database}\`.`);
} finally {
  await connection.end();
}
