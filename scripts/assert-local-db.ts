/**
 * Exit 0 if DATABASE_URL is local, 1 otherwise (BUILD_PLAN P-TOOL-2).
 *
 * A shell entry point onto the predicate `scripts/seed-guards.ts` already
 * defines and `scripts/seed-guards.test.ts` already pins. Re-implementing the
 * check in bash would give the destructive script a *second* definition of
 * "local", tested by nothing — which is how two guards come to disagree, and
 * why the one that matters is always the untested one.
 */
import { isLocalDatabase, databaseHost } from "./seed-guards";

/**
 * `DATABASE_URL` lives in `.env`, and `.env` is loaded by Node's own
 * `--env-file-if-exists` — nothing sources it into the calling shell. So the
 * shell script that invokes this cannot read `process.env.DATABASE_URL`
 * itself; this prints what it needs, host and database name, tab-separated,
 * on one stdout line.
 */
function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "") || "(none)";
  } catch {
    return "(unknown)";
  }
}

const url = process.env.DATABASE_URL ?? "";

if (!isLocalDatabase(url)) {
  const host = databaseHost(url) || "an address that could not be parsed";
  console.error(`DATABASE_URL points at "${host}", which is not a local database.`);
  process.exit(1);
}

console.log(`${databaseHost(url)}\t${databaseName(url)}`);
