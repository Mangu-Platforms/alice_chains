/**
 * BUILD_PLAN P-PROF-1 — profile and account settings.
 *
 * Cases: TC-PROF-01…05. `users.name`, `avatar` and `status` were written once
 * at sign-in from the OAuth provider and could never be changed.
 */
import { beforeEach, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { attachments, users } from "@db/schema";
import {
  createConversation,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import { anonymous, callerFor } from "../test/support/http";
import { getDb } from "./queries/connection";
import { appRouter } from "./router";
import { startSession, verifySessionToken } from "./kimi/session";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Reload the row, since the caller context is a snapshot. */
async function reload(user: Row): Promise<Row> {
  const [row] = await getDb().select().from(users).where(eq(users.id, user.id));
  return row;
}

describeIntegration("profile settings (P-PROF-1)", () => {
  let alice: Row;
  let bob: Row;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice", avatar: "https://provider.test/a.png" });
    bob = await createUser({ name: "Bob" });
  });

  afterAll(async () => {
    await resetDatabase();
    await rm("./storage", { recursive: true, force: true });
  });

  // ── Name and status ─────────────────────────────────────────────────────
  it("changes the display name", async () => {
    await caller(alice).user.updateProfile({ name: "Alice Anderson" });
    expect((await reload(alice)).name).toBe("Alice Anderson");
  });

  it("changes the status text", async () => {
    await caller(alice).user.updateProfile({ status: "Out of office" });
    expect((await reload(alice)).status).toBe("Out of office");
  });

  it("changes one without clearing the other", async () => {
    await caller(alice).user.updateProfile({ name: "Renamed" });
    await caller(alice).user.updateProfile({ status: "Busy" });

    const row = await reload(alice);
    expect(row.name).toBe("Renamed");
    expect(row.status).toBe("Busy");
  });

  it("refuses an empty name, and a call that changes nothing", async () => {
    await expect(
      caller(alice).user.updateProfile({ name: "   " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(caller(alice).user.updateProfile({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("refuses a name or status past the column length", async () => {
    await expect(
      caller(alice).user.updateProfile({ name: "x".repeat(256) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller(alice).user.updateProfile({ status: "x".repeat(101) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("changes only the caller's own profile", async () => {
    await caller(alice).user.updateProfile({ name: "Alice Anderson" });
    expect((await reload(bob)).name).toBe("Bob");
  });

  it("shows the new name to everyone else, without a reload", async () => {
    const conversation = await createConversation([alice.id, bob.id]);
    await caller(alice).user.updateProfile({ name: "Alice Anderson" });

    const view = await caller(bob).conversation.getById({ id: conversation });
    expect(view?.participants.find((p) => p.userId === alice.id)?.userName).toBe(
      "Alice Anderson"
    );
  });

  // ── Avatar ──────────────────────────────────────────────────────────────
  async function uploadAvatar(user: Row, body = PNG) {
    const client = await callerFor(user);
    const target = await client.mutate<{
      attachmentId: number;
      uploadUrl: string;
      headers: Record<string, string>;
    }>("user.createAvatarUpload", {
      fileName: "me.png",
      mimeType: "image/png",
      byteSize: body.byteLength,
    });

    await client.raw(target.uploadUrl, {
      method: "PUT",
      headers: target.headers,
      body: new Uint8Array(body),
    });

    return { ...target, client };
  }

  // TC-PROF-03
  it("uploads an avatar and serves it from a stable URL", async () => {
    const { attachmentId, client } = await uploadAvatar(alice);
    const result = await caller(await reload(alice)).user.setAvatar({ attachmentId });

    expect(result.avatarUrl).toBe(`/api/avatar/${alice.id}`);

    const fetched = await client.raw(result.avatarUrl);
    expect(fetched.status).toBe(200);
    expect(Buffer.from(await fetched.arrayBuffer())).toEqual(PNG);
  });

  it("keeps the URL stable across a change, unlike a signed link", async () => {
    const first = await uploadAvatar(alice);
    const afterFirst = await caller(await reload(alice)).user.setAvatar({
      attachmentId: first.attachmentId,
    });

    const second = await uploadAvatar(await reload(alice));
    const afterSecond = await caller(await reload(alice)).user.setAvatar({
      attachmentId: second.attachmentId,
    });

    expect(afterSecond.avatarUrl).toBe(afterFirst.avatarUrl);
  });

  it("removes the previous image rather than accumulating orphans", async () => {
    const first = await uploadAvatar(alice);
    await caller(await reload(alice)).user.setAvatar({ attachmentId: first.attachmentId });

    const second = await uploadAvatar(await reload(alice));
    await caller(await reload(alice)).user.setAvatar({ attachmentId: second.attachmentId });

    expect(await getDb().select().from(attachments)).toHaveLength(1);
  });

  it("falls back to the provider's picture when the upload is cleared", async () => {
    const { attachmentId } = await uploadAvatar(alice);
    await caller(await reload(alice)).user.setAvatar({ attachmentId });

    const cleared = await caller(await reload(alice)).user.clearAvatar();

    expect(cleared.avatarUrl).toBe("https://provider.test/a.png");
    expect((await reload(alice)).avatarKey).toBeNull();
    expect(await getDb().select().from(attachments)).toHaveLength(0);
  });

  it("refuses an image past the avatar cap", async () => {
    await expect(
      caller(alice).user.createAvatarUpload({
        fileName: "huge.png",
        mimeType: "image/png",
        byteSize: 3 * 1024 * 1024,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a non-image as an avatar", async () => {
    await expect(
      caller(alice).user.createAvatarUpload({
        fileName: "notes.pdf",
        mimeType: "application/pdf" as never,
        byteSize: 100,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses to adopt someone else's upload", async () => {
    const { attachmentId } = await uploadAvatar(alice);

    await expect(
      caller(bob).user.setAvatar({ attachmentId })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses to adopt an upload whose bytes never arrived", async () => {
    const target = await caller(alice).user.createAvatarUpload({
      fileName: "never.png",
      mimeType: "image/png",
      byteSize: 100,
    });

    await expect(
      caller(alice).user.setAvatar({ attachmentId: target.attachmentId })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // TC-PROF-04 — an avatar is not public.
  it("serves an avatar to any signed-in member but not to a stranger", async () => {
    const { attachmentId } = await uploadAvatar(alice);
    await caller(await reload(alice)).user.setAvatar({ attachmentId });

    const asBob = await (await callerFor(bob)).raw(`/api/avatar/${alice.id}`);
    expect(asBob.status).toBe(200);

    const unauthenticated = await anonymous().raw(`/api/avatar/${alice.id}`);
    expect(unauthenticated.status).toBe(401);
  });

  it("404s an avatar nobody has uploaded", async () => {
    const res = await (await callerFor(bob)).raw(`/api/avatar/${alice.id}`);
    expect(res.status).toBe(404);
  });

  // ── Sign out everywhere ─────────────────────────────────────────────────
  // TC-PROF-05
  it("signs out every device", async () => {
    const phone = await startSession({
      userId: alice.id,
      unionId: alice.unionId,
      name: "Alice",
    });
    const laptop = await startSession({
      userId: alice.id,
      unionId: alice.unionId,
      name: "Alice",
    });

    await caller(alice).admin.revokeAllSessions();

    await expect(verifySessionToken(phone)).resolves.toBeUndefined();
    await expect(verifySessionToken(laptop)).resolves.toBeUndefined();
  });

  it("leaves other members signed in", async () => {
    const bobToken = await startSession({
      userId: bob.id,
      unionId: bob.unionId,
      name: "Bob",
    });

    await caller(alice).admin.revokeAllSessions();
    await expect(verifySessionToken(bobToken)).resolves.toBeDefined();
  });

  // ── The profile view ────────────────────────────────────────────────────
  it("reports which avatar is in use", async () => {
    const before = await caller(alice).user.myProfile();
    expect(before.hasUploadedAvatar).toBe(false);
    expect(before.avatarUrl).toBe("https://provider.test/a.png");

    const { attachmentId } = await uploadAvatar(alice);
    await caller(await reload(alice)).user.setAvatar({ attachmentId });

    const after = await caller(await reload(alice)).user.myProfile();
    expect(after.hasUploadedAvatar).toBe(true);
    expect(after.avatarUrl).toBe(`/api/avatar/${alice.id}`);
  });
});
