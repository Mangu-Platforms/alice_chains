/**
 * BUILD_PLAN F-7 — group management.
 *
 * Cases: TC-CONV-17, TC-CONV-18. A group could be created and then never
 * administered: no rename, no avatar, no add or remove, no leave, and
 * `conversations.createdBy` was written once and never read, so there was no
 * owner check to make.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Socket as ClientSocket } from "socket.io-client";
import { conversationParticipants, conversations } from "@db/schema";
import {
  blockUser,
  createConversation,
  createMessage,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import {
  connectAs,
  disconnectAll,
  nextEvent,
  settle,
  startSocketServer,
  type TestServer,
} from "../test/support/socket";
import { getDb } from "./queries/connection";
import { appRouter } from "./router";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

describeIntegration("group management (F-7)", () => {
  let server: TestServer;
  let owner: Row;
  let member: Row;
  let other: Row;
  let stranger: Row;
  let group: number;
  const open: ClientSocket[] = [];

  beforeAll(async () => {
    await resetDatabase();
    server = await startSocketServer();
  });

  afterAll(async () => {
    await server.close();
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser({ name: "Owner" });
    member = await createUser({ name: "Member" });
    other = await createUser({ name: "Other" });
    stranger = await createUser({ name: "Stranger" });
    group = await createConversation([owner.id, member.id], {
      type: "group",
      name: "Original name",
      createdBy: owner.id,
    });
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(150);
  });

  async function membersOf(id = group) {
    const rows = await getDb()
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, id));
    return new Set(rows.map((r) => r.userId));
  }

  async function ownerOf(id = group) {
    const [row] = await getDb()
      .select({ createdBy: conversations.createdBy })
      .from(conversations)
      .where(eq(conversations.id, id));
    return row.createdBy;
  }

  // ── Rename ──────────────────────────────────────────────────────────────
  it("lets the owner rename the group", async () => {
    await caller(owner).conversation.rename({ conversationId: group, name: "New name" });

    const view = await caller(member).conversation.getById({ id: group });
    expect(view?.name).toBe("New name");
  });

  it("refuses a rename from a member who does not own it", async () => {
    await expect(
      caller(member).conversation.rename({ conversationId: group, name: "Hijacked" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a rename from someone outside the group", async () => {
    await expect(
      caller(stranger).conversation.rename({ conversationId: group, name: "Hijacked" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an empty name", async () => {
    await expect(
      caller(owner).conversation.rename({ conversationId: group, name: "   " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses to administer a direct conversation", async () => {
    const direct = await createConversation([owner.id, member.id]);

    await expect(
      caller(owner).conversation.rename({ conversationId: direct, name: "Nope" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // ── Avatar ──────────────────────────────────────────────────────────────
  it("sets and clears the group avatar", async () => {
    await caller(owner).conversation.setAvatar({
      conversationId: group,
      avatar: "https://example.test/a.png",
    });
    expect((await caller(member).conversation.getById({ id: group }))?.avatar).toBe(
      "https://example.test/a.png"
    );

    await caller(owner).conversation.setAvatar({ conversationId: group, avatar: null });
    expect((await caller(member).conversation.getById({ id: group }))?.avatar).toBeNull();
  });

  // ── Add ─────────────────────────────────────────────────────────────────
  it("lets the owner add a member", async () => {
    const result = await caller(owner).conversation.addParticipants({
      conversationId: group,
      userIds: [other.id],
    });

    expect(result.added).toEqual([other.id]);
    expect(await membersOf()).toEqual(new Set([owner.id, member.id, other.id]));
  });

  it("ignores someone who is already a member rather than duplicating them", async () => {
    const result = await caller(owner).conversation.addParticipants({
      conversationId: group,
      userIds: [member.id],
    });

    expect(result.added).toEqual([]);
    expect(await membersOf()).toEqual(new Set([owner.id, member.id]));
  });

  it("refuses an add from a non-owner", async () => {
    await expect(
      caller(member).conversation.addParticipants({
        conversationId: group,
        userIds: [other.id],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reuses the creation-time validation: unknown ids and blocking", async () => {
    await expect(
      caller(owner).conversation.addParticipants({
        conversationId: group,
        userIds: [999_999],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await blockUser(other, owner);
    await expect(
      caller(owner).conversation.addParticipants({
        conversationId: group,
        userIds: [other.id],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await membersOf()).toEqual(new Set([owner.id, member.id]));
  });

  // ── Remove ──────────────────────────────────────────────────────────────
  it("lets the owner remove a member, who then stops seeing the group", async () => {
    await createMessage(group, owner.id, "members only");

    await caller(owner).conversation.removeParticipant({
      conversationId: group,
      userId: member.id,
    });

    expect(await membersOf()).toEqual(new Set([owner.id]));
    expect((await caller(member).conversation.list()).map((c) => c.id)).not.toContain(group);
    await expect(
      caller(member).message.listByConversation({ conversationId: group })
    ).resolves.toEqual([]);
  });

  it("refuses a removal from a non-owner", async () => {
    await expect(
      caller(member).conversation.removeParticipant({
        conversationId: group,
        userId: owner.id,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses the owner removing themselves — that is leaving", async () => {
    await expect(
      caller(owner).conversation.removeParticipant({
        conversationId: group,
        userId: owner.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // ── Leave ───────────────────────────────────────────────────────────────
  it("lets a member leave and drops the group from their list", async () => {
    await caller(member).conversation.leave({ conversationId: group });

    expect(await membersOf()).toEqual(new Set([owner.id]));
    expect((await caller(member).conversation.list()).map((c) => c.id)).not.toContain(group);
  });

  it("stops delivering messages to someone who left", async () => {
    const leaver = await connectAs(server.port, member);
    open.push(leaver);
    leaver.emit("joinConversation", { conversationId: group });
    await settle(200);

    await caller(member).conversation.leave({ conversationId: group });

    const leaked = nextEvent(leaver, "newMessage", 800);
    await caller(owner).message.send({ conversationId: group, content: "after you left" });

    await expect(leaked).rejects.toThrow(/timed out/);
  });

  it("refuses to let the owner walk out while others remain", async () => {
    await expect(
      caller(owner).conversation.leave({ conversationId: group })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await membersOf()).toContain(owner.id);
  });

  it("lets the last member leave, even if they own it", async () => {
    await caller(member).conversation.leave({ conversationId: group });
    await caller(owner).conversation.leave({ conversationId: group });

    expect(await membersOf()).toEqual(new Set());
  });

  // ── Ownership transfer ──────────────────────────────────────────────────
  // TC-CONV-18
  it("transfers ownership to another member", async () => {
    await caller(owner).conversation.transferOwnership({
      conversationId: group,
      newOwnerId: member.id,
    });

    expect(await ownerOf()).toBe(member.id);

    // The new owner can administer; the old one cannot.
    await expect(
      caller(member).conversation.rename({ conversationId: group, name: "Mine now" })
    ).resolves.toBeDefined();
    await expect(
      caller(owner).conversation.rename({ conversationId: group, name: "Still mine" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets the previous owner leave once ownership has moved", async () => {
    await caller(owner).conversation.transferOwnership({
      conversationId: group,
      newOwnerId: member.id,
    });

    await expect(
      caller(owner).conversation.leave({ conversationId: group })
    ).resolves.toBeDefined();
    expect(await membersOf()).toEqual(new Set([member.id]));
  });

  it("refuses to transfer to someone who is not a member", async () => {
    await expect(
      caller(owner).conversation.transferOwnership({
        conversationId: group,
        newOwnerId: stranger.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await ownerOf()).toBe(owner.id);
  });

  it("refuses a transfer from a non-owner", async () => {
    await expect(
      caller(member).conversation.transferOwnership({
        conversationId: group,
        newOwnerId: member.id,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ── Every change reaches open clients ───────────────────────────────────
  it("tells an open client about a rename without a refetch", async () => {
    const watcher = await connectAs(server.port, member);
    open.push(watcher);
    await settle(200);

    const seen = nextEvent<{ conversationId: number }>(watcher, "conversationUpdated");
    await caller(owner).conversation.rename({ conversationId: group, name: "Renamed live" });

    await expect(seen).resolves.toMatchObject({ conversationId: group });
  });

  it("tells the member being removed, while they can still hear it", async () => {
    const watcher = await connectAs(server.port, member);
    open.push(watcher);
    await settle(200);

    const seen = nextEvent<{ conversationId: number }>(watcher, "conversationUpdated");
    await caller(owner).conversation.removeParticipant({
      conversationId: group,
      userId: member.id,
    });

    await expect(seen).resolves.toMatchObject({ conversationId: group });
  });
});
