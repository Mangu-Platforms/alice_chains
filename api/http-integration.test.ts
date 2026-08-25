/**
 * BUILD_PLAN S-7 — router integration through the real Hono app.
 *
 * Everything else in the suite calls `appRouter.createCaller`, which skips
 * cookie parsing, session verification, context creation, superjson encoding
 * and tRPC's error mapping. These drive `app.fetch` with real Request objects,
 * so a break in any of those layers is caught here rather than in production.
 */
import { beforeEach, expect, it } from "vitest";
import { Session } from "@contracts/constants";
import {
  blockUser,
  createConversation,
  createMessage,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import { anonymous, callerFor, TrpcHttpError } from "../test/support/http";
import { revokeAllSessionsForUser, signSessionToken } from "./kimi/session";

type Row = Awaited<ReturnType<typeof createUser>>;

describeIntegration("tRPC over HTTP (S-7)", () => {
  let alice: Row;
  let bob: Row;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
  });

  // ── The public surface ──────────────────────────────────────────────────
  it("answers ping without a session", async () => {
    await expect(anonymous().query("ping")).resolves.toMatchObject({ ok: true });
  });

  it("404s an unknown /api path", async () => {
    const res = await anonymous().raw("/api/definitely-not-a-route");
    expect(res.status).toBe(404);
  });

  // ── Authentication ──────────────────────────────────────────────────────
  it("refuses an authenticated procedure with no cookie", async () => {
    await expect(anonymous().query("conversation.list")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("refuses a forged session cookie", async () => {
    const { callerWithCookie } = await import("../test/support/http");
    await expect(
      callerWithCookie(`${Session.cookieName}=not.a.real.token`).query("conversation.list")
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses a correctly signed token with no session row", async () => {
    const { callerWithCookie } = await import("../test/support/http");
    const orphan = signSessionToken({
      userId: alice.id,
      unionId: alice.unionId,
      name: "Alice",
      sid: "never-opened",
    });

    await expect(
      callerWithCookie(`${Session.cookieName}=${orphan}`).query("conversation.list")
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("stops accepting a cookie once its session is revoked", async () => {
    const caller = await callerFor(alice);
    await expect(caller.query("conversation.list")).resolves.toEqual([]);

    await revokeAllSessionsForUser(alice.id);

    await expect(caller.query("conversation.list")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("identifies the caller from the cookie, never from the payload", async () => {
    const caller = await callerFor(alice);
    await expect(caller.query("auth.me")).resolves.toMatchObject({ id: alice.id });
  });

  // ── A whole conversation, end to end over HTTP ──────────────────────────
  it("creates, sends, lists and reads across the full stack", async () => {
    const aliceCaller = await callerFor(alice);
    const bobCaller = await callerFor(bob);

    const conv = await aliceCaller.mutate<{ id: number }>("conversation.createDirect", {
      otherUserId: bob.id,
    });
    expect(conv.id).toBeGreaterThan(0);

    await aliceCaller.mutate("message.send", {
      conversationId: conv.id,
      content: "over http",
    });

    const history = await bobCaller.query<{ content: string; isMine: boolean }[]>(
      "message.listByConversation",
      { conversationId: conv.id }
    );
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe("over http");
    expect(history[0].isMine).toBe(false);

    const list = await bobCaller.query<{ id: number; unreadCount: number }[]>(
      "conversation.list"
    );
    expect(list[0].id).toBe(conv.id);
    expect(list[0].unreadCount).toBe(1);
  });

  it("round-trips Date through superjson rather than flattening it to a string", async () => {
    const conv = await createConversation([alice.id, bob.id]);
    await createMessage(conv, bob.id, "dated");

    const history = await (
      await callerFor(alice)
    ).query<{ createdAt: Date }[]>("message.listByConversation", { conversationId: conv });

    expect(history[0].createdAt).toBeInstanceOf(Date);
  });

  // ── Errors map to the right codes over the wire ─────────────────────────
  it("maps a non-participant send to FORBIDDEN, not 500", async () => {
    const mallory = await createUser({ name: "Mallory" });
    const conv = await createConversation([alice.id, bob.id]);

    const error = await (await callerFor(mallory))
      .mutate("message.send", { conversationId: conv, content: "let me in" })
      .catch((e) => e as TrpcHttpError);

    expect(error).toBeInstanceOf(TrpcHttpError);
    expect((error as TrpcHttpError).code).toBe("FORBIDDEN");
    expect((error as TrpcHttpError).httpStatus).toBe(403);
  });

  it("maps a failed input validation to BAD_REQUEST", async () => {
    const error = await (await callerFor(alice))
      .query("contact.searchUsers", { query: "a" })
      .catch((e) => e as TrpcHttpError);

    expect((error as TrpcHttpError).code).toBe("BAD_REQUEST");
    expect((error as TrpcHttpError).httpStatus).toBe(400);
  });

  it("enforces blocking over HTTP as well as in-process", async () => {
    await blockUser(bob, alice);

    await expect(
      (await callerFor(alice)).mutate("conversation.createDirect", { otherUserId: bob.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ── Logout ──────────────────────────────────────────────────────────────
  it("logs out, clearing both cookie names and killing the session", async () => {
    const caller = await callerFor(alice);
    await expect(caller.query("conversation.list")).resolves.toEqual([]);

    const res = await caller.raw("/api/logout");
    expect(res.status).toBe(302);

    const cleared = res.headers.getSetCookie();
    expect(cleared.some((c) => c.startsWith(`${Session.cookieName}=;`))).toBe(true);
    expect(cleared.some((c) => c.startsWith(`${Session.hostCookieName}=;`))).toBe(true);

    // The captured cookie is dead server-side, not merely absent from a browser.
    await expect(caller.query("conversation.list")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("starts a sign-in with state and a PKCE challenge", async () => {
    const res = await anonymous().raw("/api/oauth/login");
    expect(res.status).toBe(302);

    const target = new URL(res.headers.get("location")!);
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(target.searchParams.get("state")).toBeTruthy();
  });
});
