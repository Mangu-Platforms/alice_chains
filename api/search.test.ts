/**
 * BUILD_PLAN P-SEARCH-1 and P-SEARCH-2 — message search.
 *
 * Cases: TC-SEARCH-01…07. The chat header carried a search icon that did
 * nothing (S-20 removed it rather than leave it lying); there was no way to
 * find a message.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createConversation,
  createMessage,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import { appRouter } from "./router";
import { isFullTextEligible, minTokenSize, toBooleanQuery } from "./lib/search";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

describe("the boolean-mode query builder (P-SEARCH-1)", () => {
  it("makes every word a required prefix", () => {
    expect(toBooleanQuery("hello world")).toBe("+hello* +world*");
  });

  it("strips operator characters instead of escaping them", () => {
    // A leading `-` in BOOLEAN MODE excludes a term, so a member searching for
    // "-report" would exclude the word they typed. `*`, `"`, `(`, `~`, `<`,
    // `>` and `@` all change meaning the same way.
    expect(toBooleanQuery("-report")).toBe("+report*");
    expect(toBooleanQuery('+a -b *c "d" (e) ~f <g> @h')).toBe(
      "+a* +b* +c* +d* +e* +f* +g* +h*"
    );
  });

  it("bounds how many terms one query can carry", () => {
    const many = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    expect(toBooleanQuery(many).split(" ")).toHaveLength(10);
  });

  it("collapses to nothing when there is nothing to search for", () => {
    expect(toBooleanQuery("+++ --- ***")).toBe("");
  });
});

describeIntegration("message search (P-SEARCH)", () => {
  let alice: Row;
  let bob: Row;
  let stranger: Row;
  let conversation: number;
  let otherConversation: number;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    stranger = await createUser({ name: "Stranger" });

    conversation = await createConversation([alice.id, bob.id]);
    otherConversation = await createConversation([alice.id, bob.id], {
      type: "group",
      name: "Project group",
      createdBy: alice.id,
    });

    await createMessage(conversation, alice.id, "the quarterly report is ready");
    await createMessage(conversation, bob.id, "thanks for the report");
    await createMessage(conversation, alice.id, "unrelated chatter");
    await createMessage(otherConversation, alice.id, "another report, elsewhere");

    const theirs = await createConversation([stranger.id]);
    await createMessage(theirs, stranger.id, "a private report nobody else sees");
  });

  // ── P-SEARCH-1: within one conversation ─────────────────────────────────
  // TC-SEARCH-01
  it("finds messages in a conversation, whoever wrote them", async () => {
    const results = await caller(alice).message.search({
      query: "report",
      conversationId: conversation,
    });

    expect(results.map((r) => r.content).sort()).toEqual([
      "thanks for the report",
      "the quarterly report is ready",
    ]);
    expect(results.some((r) => r.senderId === bob.id)).toBe(true);
  });

  it("stays inside the conversation it was given", async () => {
    const results = await caller(alice).message.search({
      query: "report",
      conversationId: conversation,
    });

    expect(results.map((r) => r.content)).not.toContain("another report, elsewhere");
  });

  // TC-SEARCH-02
  it("returns nothing for a conversation the caller is not in", async () => {
    await expect(
      caller(stranger).message.search({ query: "report", conversationId: conversation })
    ).resolves.toEqual([]);
  });

  // TC-SEARCH-03
  it("never returns a deleted message", async () => {
    const doomed = await createMessage(conversation, alice.id, "report to be deleted");
    await caller(alice).message.delete({ messageId: doomed });

    const results = await caller(alice).message.search({
      query: "report",
      conversationId: conversation,
    });
    expect(results.map((r) => r.id)).not.toContain(doomed);
  });

  it("returns newest first", async () => {
    const results = await caller(alice).message.search({
      query: "report",
      conversationId: conversation,
    });
    const times = results.map((r) => new Date(r.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  // ── P-SEARCH-2: across conversations ────────────────────────────────────
  // TC-SEARCH-05
  it("searches every conversation the caller belongs to", async () => {
    const results = await caller(alice).message.search({ query: "report" });
    const conversations = new Set(results.map((r) => r.conversationId));

    expect(conversations).toEqual(new Set([conversation, otherConversation]));
  });

  // TC-SEARCH-06 — the authorization boundary, on the global path.
  it("never returns a message from a conversation the caller is not in", async () => {
    const results = await caller(alice).message.search({ query: "report" });

    expect(results.map((r) => r.content)).not.toContain(
      "a private report nobody else sees"
    );
  });

  it("returns nothing at all for a member of no conversations", async () => {
    const outsider = await createUser({ name: "Outsider" });
    await expect(caller(outsider).message.search({ query: "report" })).resolves.toEqual([]);
  });

  it("carries enough context to render and open a result", async () => {
    const [result] = await caller(alice).message.search({ query: "quarterly" });

    expect(result).toMatchObject({
      conversationId: conversation,
      senderId: alice.id,
      senderName: "Alice",
      conversationType: "direct",
    });
    expect(result.id).toBeGreaterThan(0);
  });

  it("names the group a result came from", async () => {
    const [result] = await caller(alice).message.search({ query: "elsewhere" });
    expect(result.conversationName).toBe("Project group");
  });

  // ── Matching behaviour ──────────────────────────────────────────────────
  it("matches on a prefix, so a half-typed word finds the message", async () => {
    const results = await caller(alice).message.search({ query: "quart" });
    expect(results.map((r) => r.content)).toContain("the quarterly report is ready");
  });

  it("requires every word, not any of them", async () => {
    await createMessage(conversation, alice.id, "the annual summary");

    const both = await caller(alice).message.search({ query: "quarterly report" });
    expect(both).toHaveLength(1);

    const neither = await caller(alice).message.search({ query: "quarterly summary" });
    expect(neither).toHaveLength(0);
  });

  // TC-SEARCH-04 — the fallback that stops a short query silently finding
  // nothing.
  it("still answers a query shorter than the FULLTEXT minimum", async () => {
    const minimum = await minTokenSize();
    await createMessage(conversation, alice.id, `a ${"z".repeat(minimum - 1)} marker`);

    const short = "z".repeat(minimum - 1);
    expect(await isFullTextEligible(short)).toBe(false);

    // FULLTEXT would return nothing here, indistinguishable from "no match".
    const results = await caller(alice).message.search({ query: short });
    expect(results.map((r) => r.content)).toContain(`a ${short} marker`);
  });

  it("treats a LIKE wildcard as a literal in the fallback path", async () => {
    await createMessage(conversation, alice.id, "100% certain");

    const everything = await caller(alice).message.search({ query: "%%" });
    expect(everything).toHaveLength(0);
  });

  it("refuses a query below the minimum length", async () => {
    await expect(
      caller(alice).message.search({ query: "a" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("caps how many results one search returns", async () => {
    for (let i = 0; i < 40; i += 1) {
      await createMessage(conversation, alice.id, `report number ${i}`);
    }

    const results = await caller(alice).message.search({ query: "report", limit: 10 });
    expect(results).toHaveLength(10);
  });
});
