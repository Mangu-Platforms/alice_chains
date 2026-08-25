/**
 * BUILD_PLAN P-TOOL-9 — the seed's refusals.
 *
 * Cases: TC-TOOL-04…06.
 *
 * `npm run db:seed` writes accounts and then prints working session cookies for
 * them. On a laptop that is the whole point; anywhere else it is a handout of
 * valid credentials. There is deliberately no override flag — a flag is
 * something a line in someone's shell history can pass — so this predicate is
 * the only thing standing between the two cases, and it is worth pinning.
 */
import { describe, expect, it } from "vitest";
import { databaseHost, isLocalDatabase, LOCAL_DATABASE_HOSTS } from "./seed-guards";

describe("where seeding is allowed (P-TOOL-9)", () => {
  it("allows the compose default and a plain localhost", () => {
    // TC-TOOL-04
    expect(isLocalDatabase("mysql://alice:pw@localhost:3306/alice_chains")).toBe(true);
    expect(isLocalDatabase("mysql://alice:pw@127.0.0.1:3306/alice_chains")).toBe(true);
  });

  it("allows the service name a compose network uses", () => {
    // Inside compose the database is reached as `db`, which is local in every
    // sense that matters even though the hostname does not say so.
    expect(isLocalDatabase("mysql://alice:pw@db:3306/alice_chains")).toBe(true);
  });

  it("refuses anything remote", () => {
    // TC-TOOL-05
    expect(isLocalDatabase("mysql://u:p@prod-db.internal:3306/alice")).toBe(false);
    expect(isLocalDatabase("mysql://u:p@10.0.4.12:3306/alice")).toBe(false);
    expect(isLocalDatabase("mysql://u:p@alice.abcdef.eu-west-1.rds.amazonaws.com/alice")).toBe(
      false
    );
  });

  it("is not fooled by a local-looking name on a remote host", () => {
    // The check is the hostname, not a substring of the URL — "localhost" in a
    // password or a database name must not open the door.
    expect(isLocalDatabase("mysql://localhost:pw@prod.example.com:3306/alice")).toBe(false);
    expect(isLocalDatabase("mysql://u:p@prod.example.com:3306/localhost")).toBe(false);
    expect(isLocalDatabase("mysql://u:p@notlocalhost.example.com:3306/alice")).toBe(false);
  });

  it("fails closed on a connection string it cannot parse", () => {
    // TC-TOOL-06 — a URL this cannot read is one whose target it cannot vouch
    // for, and the cost of guessing wrong is credentials on a real database.
    expect(isLocalDatabase("not a url at all")).toBe(false);
    expect(isLocalDatabase("")).toBe(false);
    expect(databaseHost("not a url at all")).toBe("");
  });

  it("strips the brackets from an IPv6 host", () => {
    expect(databaseHost("mysql://u:p@[::1]:3306/alice")).toBe("::1");
    expect(isLocalDatabase("mysql://u:p@[::1]:3306/alice")).toBe(true);
    expect(isLocalDatabase("mysql://u:p@[2001:db8::1]:3306/alice")).toBe(false);
  });

  it("lists every allowed host explicitly, so adding one is a visible decision", () => {
    expect(LOCAL_DATABASE_HOSTS).toContain("localhost");
    expect(LOCAL_DATABASE_HOSTS).not.toContain("");
  });
});
