/**
 * The refusals that keep `npm run db:seed` off anything that matters
 * (BUILD_PLAN P-TOOL-9).
 *
 * Separate from `seed.ts` because that module runs on import — it has to, to be
 * a script — and a guard nothing can test is a guard nobody should trust.
 */

/**
 * Hosts a demo database may live on.
 *
 * `db` and `mysql` are here because that is what the database is called inside
 * a compose network, where "local" means the same machine even though the
 * hostname does not say so.
 */
export const LOCAL_DATABASE_HOSTS: readonly string[] = [
  "localhost",
  "127.0.0.1",
  "::1",
  "db",
  "mysql",
  "host.docker.internal",
];

/** The hostname in a MySQL connection string, or "" if it is unparseable. */
export function databaseHost(url: string): string {
  try {
    // `mysql://` is not a scheme `URL` special-cases, but it parses; IPv6 hosts
    // come back wrapped in brackets, which are not part of the name.
    return new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return "";
  }
}

/**
 * Whether seeding this database is safe.
 *
 * Unparseable fails closed. A connection string this cannot read is one whose
 * target it cannot vouch for, and the cost of being wrong is demo accounts with
 * printed session cookies on somebody's real database.
 */
export function isLocalDatabase(url: string): boolean {
  const host = databaseHost(url);
  return host !== "" && LOCAL_DATABASE_HOSTS.includes(host);
}
