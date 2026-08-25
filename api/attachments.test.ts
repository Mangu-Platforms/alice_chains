/**
 * BUILD_PLAN F-4 — file and image attachments, end to end.
 *
 * The card's acceptance: a presigned upload → render round trip for an image
 * and a PDF, and oversize and forbidden types refused server-side. These run
 * against the `local` driver, which mimics presigned URLs exactly (a signed,
 * expiring token pinning key, type and size), so the same client flow is
 * exercised whichever driver a deployment uses. `sigv4.test.ts` covers the S3
 * signing separately.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { attachments } from "@db/schema";
import {
  createConversation,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import { anonymous, callerFor } from "../test/support/http";
import { getDb } from "./queries/connection";
import { appRouter } from "./router";
import { reapAbandonedUploads } from "./attachment-router";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n", "utf8");

describeIntegration("attachments (F-4)", () => {
  let alice: Row;
  let bob: Row;
  let mallory: Row;
  let conversation: number;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    mallory = await createUser({ name: "Mallory" });
    conversation = await createConversation([alice.id, bob.id]);
  });

  afterAll(async () => {
    await resetDatabase();
    await rm("./storage", { recursive: true, force: true });
  });

  /** The whole client flow: ask for a target, PUT the bytes, complete. */
  async function upload(
    user: Row,
    body: Buffer,
    fileName: string,
    mimeType: string,
    declaredSize = body.byteLength
  ) {
    const client = await callerFor(user);
    const target = await client.mutate<{
      attachmentId: number;
      uploadUrl: string;
      headers: Record<string, string>;
    }>("attachment.createUpload", {
      conversationId: conversation,
      fileName,
      mimeType,
      byteSize: declaredSize,
    });

    const put = await client.raw(target.uploadUrl, {
      method: "PUT",
      headers: target.headers,
      body: new Uint8Array(body),
    });

    return { ...target, putStatus: put.status, client };
  }

  // ── The round trip ──────────────────────────────────────────────────────
  it("round-trips an image: upload, attach, render", async () => {
    const { attachmentId, putStatus } = await upload(alice, PNG, "pixel.png", "image/png");
    expect(putStatus).toBe(200);

    await caller(alice).attachment.complete({ attachmentId });
    await caller(alice).message.send({
      conversationId: conversation,
      content: "look at this",
      attachmentIds: [attachmentId],
    });

    const [message] = await caller(bob).message.listByConversation({
      conversationId: conversation,
    });
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0]).toMatchObject({
      fileName: "pixel.png",
      mimeType: "image/png",
      isImage: true,
      byteSize: PNG.byteLength,
    });

    // The link works and returns the bytes that went in.
    const download = await (await callerFor(bob)).raw(message.attachments[0].url);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("image/png");
    expect(download.headers.get("content-disposition")).toContain("inline");
    expect(Buffer.from(await download.arrayBuffer())).toEqual(PNG);
  });

  it("round-trips a PDF, offered as a download rather than inline", async () => {
    const { attachmentId } = await upload(alice, PDF, "notes.pdf", "application/pdf");
    await caller(alice).attachment.complete({ attachmentId });
    await caller(alice).message.send({
      conversationId: conversation,
      content: "",
      attachmentIds: [attachmentId],
    });

    const [message] = await caller(bob).message.listByConversation({
      conversationId: conversation,
    });
    expect(message.attachments[0].isImage).toBe(false);

    const download = await (await callerFor(bob)).raw(message.attachments[0].url);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await download.arrayBuffer())).toEqual(PDF);
  });

  it("lets a message carry an attachment and no text", async () => {
    const { attachmentId } = await upload(alice, PNG, "pixel.png", "image/png");
    await caller(alice).attachment.complete({ attachmentId });

    await expect(
      caller(alice).message.send({
        conversationId: conversation,
        content: "",
        attachmentIds: [attachmentId],
      })
    ).resolves.toBeDefined();
  });

  it("refuses a message with neither text nor attachment", async () => {
    await expect(
      caller(alice).message.send({ conversationId: conversation, content: "   " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // ── Server-side limits ──────────────────────────────────────────────────
  it("refuses a forbidden MIME type at the request for a target", async () => {
    await expect(
      caller(alice).attachment.createUpload({
        conversationId: conversation,
        fileName: "payload.exe",
        mimeType: "application/x-msdownload" as never,
        byteSize: 100,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await getDb().select().from(attachments)).toHaveLength(0);
  });

  it("refuses a declared size over the cap", async () => {
    await expect(
      caller(alice).attachment.createUpload({
        conversationId: conversation,
        fileName: "huge.png",
        mimeType: "image/png",
        byteSize: 26 * 1024 * 1024,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses bytes larger than the token authorized, even if the cap allows", async () => {
    // Declare one byte, send the whole file: the token pins the size.
    const { putStatus } = await upload(alice, PNG, "pixel.png", "image/png", 1);
    expect(putStatus).toBe(413);
  });

  it("refuses a PUT whose Content-Type disagrees with the token", async () => {
    const client = await callerFor(alice);
    const target = await client.mutate<{ uploadUrl: string }>("attachment.createUpload", {
      conversationId: conversation,
      fileName: "pixel.png",
      mimeType: "image/png",
      byteSize: PNG.byteLength,
    });

    const put = await client.raw(target.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      body: new Uint8Array(PNG),
    });
    expect(put.status).toBe(400);
  });

  it("refuses an upload with a forged or missing token", async () => {
    expect(
      (await anonymous().raw("/api/files/upload?token=nonsense", { method: "PUT" })).status
    ).toBe(403);
    expect((await anonymous().raw("/api/files/upload", { method: "PUT" })).status).toBe(403);
  });

  it("refuses a download with a forged token", async () => {
    expect(
      (await anonymous().raw("/api/files/download?token=nonsense")).status
    ).toBe(403);
  });

  // ── Authorization ───────────────────────────────────────────────────────
  it("refuses an upload target for a conversation the caller is not in", async () => {
    await expect(
      caller(mallory).attachment.createUpload({
        conversationId: conversation,
        fileName: "sneaky.png",
        mimeType: "image/png",
        byteSize: 100,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to complete someone else's upload", async () => {
    const { attachmentId } = await upload(alice, PNG, "pixel.png", "image/png");

    await expect(
      caller(bob).attachment.complete({ attachmentId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to attach an upload that is not yours", async () => {
    const { attachmentId } = await upload(alice, PNG, "pixel.png", "image/png");
    await caller(alice).attachment.complete({ attachmentId });

    await expect(
      caller(bob).message.send({
        conversationId: conversation,
        content: "stolen",
        attachmentIds: [attachmentId],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses to attach an upload that never completed", async () => {
    const { attachmentId } = await upload(alice, PNG, "pixel.png", "image/png");

    await expect(
      caller(alice).message.send({
        conversationId: conversation,
        content: "premature",
        attachmentIds: [attachmentId],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses to reuse one upload on a second message", async () => {
    const { attachmentId } = await upload(alice, PNG, "pixel.png", "image/png");
    await caller(alice).attachment.complete({ attachmentId });
    await caller(alice).message.send({
      conversationId: conversation,
      content: "first",
      attachmentIds: [attachmentId],
    });

    const elsewhere = await createConversation([alice.id, mallory.id]);
    await expect(
      caller(alice).message.send({
        conversationId: elsewhere,
        content: "smuggled",
        attachmentIds: [attachmentId],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses to complete an upload whose bytes never arrived", async () => {
    const client = await callerFor(alice);
    const target = await client.mutate<{ attachmentId: number }>(
      "attachment.createUpload",
      {
        conversationId: conversation,
        fileName: "never.png",
        mimeType: "image/png",
        byteSize: 100,
      }
    );

    await expect(
      caller(alice).attachment.complete({ attachmentId: target.attachmentId })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // ── Housekeeping ────────────────────────────────────────────────────────
  it("records the real size, not the declared one", async () => {
    const client = await callerFor(alice);
    // Declare more than we send; `complete` reads the truth from storage.
    const target = await client.mutate<{
      attachmentId: number;
      uploadUrl: string;
      headers: Record<string, string>;
    }>("attachment.createUpload", {
      conversationId: conversation,
      fileName: "pixel.png",
      mimeType: "image/png",
      byteSize: 4096,
    });
    await client.raw(target.uploadUrl, {
      method: "PUT",
      headers: target.headers,
      body: new Uint8Array(PNG),
    });

    const result = await caller(alice).attachment.complete({
      attachmentId: target.attachmentId,
    });
    expect(result.byteSize).toBe(PNG.byteLength);
  });

  it("reaps an upload that never became a message", async () => {
    const { attachmentId } = await upload(alice, PNG, "orphan.png", "image/png");
    await caller(alice).attachment.complete({ attachmentId });

    expect(await reapAbandonedUploads()).toBe(0);

    // Age it past the TTL.
    await getDb()
      .update(attachments)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(attachments.id, attachmentId));

    expect(await reapAbandonedUploads()).toBe(1);
    expect(await getDb().select().from(attachments)).toHaveLength(0);
  });

  it("never reaps an upload that is attached to a message", async () => {
    const { attachmentId } = await upload(alice, PNG, "kept.png", "image/png");
    await caller(alice).attachment.complete({ attachmentId });
    await caller(alice).message.send({
      conversationId: conversation,
      content: "keep me",
      attachmentIds: [attachmentId],
    });

    await getDb()
      .update(attachments)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(attachments.id, attachmentId));

    expect(await reapAbandonedUploads()).toBe(0);
  });

  it("strips a path out of an uploaded file name", async () => {
    const { attachmentId } = await upload(
      alice,
      PNG,
      "../../etc/passwd.png",
      "image/png"
    );
    const [row] = await getDb()
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId));

    expect(row.fileName).toBe("passwd.png");
    expect(row.storageKey).not.toContain("..");
    expect(row.storageKey.startsWith(`${alice.id}/`)).toBe(true);
  });

  it("lists a conversation's media for its members only", async () => {
    const { attachmentId } = await upload(alice, PNG, "shared.png", "image/png");
    await caller(alice).attachment.complete({ attachmentId });
    await caller(alice).message.send({
      conversationId: conversation,
      content: "media",
      attachmentIds: [attachmentId],
    });

    const listed = await caller(bob).attachment.listForConversation({
      conversationId: conversation,
    });
    expect(listed).toHaveLength(1);

    // P-UX-4. The drawer jumps to the message an attachment arrived on, so
    // the id has to come back — and it renders images and files differently,
    // so `isImage` does too.
    expect(listed[0].messageId).toEqual(expect.any(Number));
    expect(listed[0].isImage).toBe(true);
    expect(listed[0].url).toBeTruthy();

    expect(
      await caller(mallory).attachment.listForConversation({ conversationId: conversation })
    ).toEqual([]);
  });
});
