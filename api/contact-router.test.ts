/**
 * BUILD_PLAN S-10 — the user-directory enumeration leak.
 *
 * Cases: TC-AUTHZ-10, TC-CONT-13, TC-CONT-14, TC-CONT-15, TC-CONT-16,
 * TC-CONT-17, TC-CONT-20.
 */
import { beforeEach, expect, it } from "vitest";
import { createUser, describeIntegration, resetDatabase } from "../test/support/db";
import { appRouter } from "./router";
import { escapeLikePattern } from "./lib/sql";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

describeIntegration("contact.searchUsers hardening (S-10)", () => {
  let alice: Row;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice Anderson", email: "alice@example.test" });
    await createUser({ name: "Bob Brown", email: "bob@example.test" });
    await createUser({ name: "Carol Clark", email: "carol@example.test" });
    await createUser({ name: "100% Percent", email: "percent@example.test" });
    await createUser({ name: "A_B Underscore", email: "under@example.test" });
  });

  // TC-CONT-13 — the enumeration entry point.
  it("rejects a one-character query", async () => {
    await expect(
      caller(alice).contact.searchUsers({ query: "a" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a two-character query", async () => {
    await expect(
      caller(alice).contact.searchUsers({ query: "ab" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a query that is only whitespace once trimmed", async () => {
    await expect(
      caller(alice).contact.searchUsers({ query: "   " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts a three-character query", async () => {
    const rows = await caller(alice).contact.searchUsers({ query: "Bob" });
    expect(rows.map((r) => r.name)).toContain("Bob Brown");
  });

  // TC-CONT-14 / TC-AUTHZ-10 — no address ever leaves the server.
  it("never returns an email address", async () => {
    const rows = await caller(alice).contact.searchUsers({ query: "Bob" });

    expect(rows).not.toHaveLength(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty("email");
      expect(Object.keys(row).sort()).toEqual(["avatar", "id", "name"]);
    }
  });

  it("still matches on email so a known address finds the person", async () => {
    const rows = await caller(alice).contact.searchUsers({ query: "carol@example" });
    expect(rows.map((r) => r.name)).toEqual(["Carol Clark"]);
  });

  // TC-CONT-15 — an unescaped wildcard turned a lookup into a dump.
  it("treats % as a literal, not a wildcard", async () => {
    const everything = await caller(alice).contact.searchUsers({ query: "%%%" });
    expect(everything).toHaveLength(0);

    const literal = await caller(alice).contact.searchUsers({ query: "100%" });
    expect(literal.map((r) => r.name)).toEqual(["100% Percent"]);
  });

  it("treats _ as a literal, not a single-character wildcard", async () => {
    const wildcard = await caller(alice).contact.searchUsers({ query: "B_b" });
    expect(wildcard).toHaveLength(0);

    const literal = await caller(alice).contact.searchUsers({ query: "A_B" });
    expect(literal.map((r) => r.name)).toEqual(["A_B Underscore"]);
  });

  // TC-CONT-16
  it("never returns the caller themselves", async () => {
    const rows = await caller(alice).contact.searchUsers({ query: "Alice" });
    expect(rows.map((r) => r.id)).not.toContain(alice.id);
  });

  // TC-CONT-17
  it("caps how many rows one query can return", async () => {
    for (let i = 0; i < 25; i += 1) {
      await createUser({ name: `Zed Number ${i}`, email: `zed${i}@example.test` });
    }
    const rows = await caller(alice).contact.searchUsers({ query: "Zed" });
    expect(rows).toHaveLength(20);
  });

  it("rejects an over-long query rather than running it", async () => {
    await expect(
      caller(alice).contact.searchUsers({ query: "x".repeat(101) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

it("escapeLikePattern neutralises every LIKE metacharacter", () => {
  expect(escapeLikePattern("100%")).toBe("100\\%");
  expect(escapeLikePattern("a_b")).toBe("a\\_b");
  expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  expect(escapeLikePattern("%_\\")).toBe("\\%\\_\\\\");
  expect(escapeLikePattern("plain")).toBe("plain");
});
