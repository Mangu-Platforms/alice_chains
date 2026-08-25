/**
 * BUILD_PLAN S-18 — administration, the audit trail, and data rights.
 *
 * Cases: TC-AUTH-15, TC-ADMIN-01…10.
 *
 * `OWNER_UNION_ID` was parsed into the env schema and exposed by a function
 * with zero call sites, so `users.role` was never written as anything but its
 * default: there was no administrator, no administrative procedure and no
 * audit record anywhere in the product.
 */
import { beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLogs, contacts, messages, users } from "@db/schema";
import {
  createConversation,
  createMessage,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import { getDb } from "./queries/connection";
import { appRouter } from "./router";
import { purgeDueAccounts, DELETION_GRACE_PERIOD_DAYS } from "./admin-router";
import { decodeSessionToken, startSession, verifySessionToken } from "./kimi/session";
import { authenticateRequest } from "./kimi/auth";
import { Session } from "@contracts/constants";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

/** Promote in the database, as `upsertUser` does from OWNER_UNION_ID. */
async function makeAdmin(user: Row): Promise<Row> {
  await getDb().update(users).set({ role: "admin" }).where(eq(users.id, user.id));
  const [row] = await getDb().select().from(users).where(eq(users.id, user.id));
  return row;
}

async function auditRows() {
  return getDb().select().from(auditLogs).orderBy(auditLogs.id);
}

describeIntegration("administration and data rights (S-18)", () => {
  let owner: Row;
  let member: Row;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser({ name: "Owner" });
    member = await createUser({ name: "Member" });
  });

  // ── The gate ────────────────────────────────────────────────────────────
  // TC-ADMIN-01
  it("refuses every administrative procedure to an ordinary member", async () => {
    await expect(caller(member).admin.listMembers({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller(member).admin.deactivateMember({ userId: owner.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(member).admin.auditLog({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  // TC-ADMIN-02 — the safe default.
  it("has no administrator at all when nobody has been promoted", async () => {
    // No OWNER_UNION_ID is configured in the test environment, so no account is
    // ever promoted and the whole surface is closed.
    await expect(caller(owner).admin.listMembers({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("admits the promoted account", async () => {
    const admin = await makeAdmin(owner);
    await expect(caller(admin).admin.listMembers({})).resolves.toHaveLength(2);
  });

  // ── The member list ─────────────────────────────────────────────────────
  it("lists members with the fields an administrator needs and no more", async () => {
    const admin = await makeAdmin(owner);
    const [row] = await caller(admin).admin.listMembers({ limit: 1 });

    expect(Object.keys(row).sort()).toEqual([
      "createdAt",
      "deactivatedAt",
      "deletionRequestedAt",
      "email",
      "id",
      "lastSignInAt",
      "name",
      "role",
    ]);
    // unionId is the provider's identifier for the account; it has no business
    // in a member list.
    expect(row).not.toHaveProperty("unionId");
  });

  // ── Deactivation ────────────────────────────────────────────────────────
  // TC-ADMIN-03
  it("deactivates a member and revokes their sessions", async () => {
    const admin = await makeAdmin(owner);
    const token = await startSession({
      userId: member.id,
      unionId: member.unionId,
      name: "Member",
    });
    await expect(verifySessionToken(token)).resolves.toBeDefined();

    await caller(admin).admin.deactivateMember({ userId: member.id });

    await expect(verifySessionToken(token)).resolves.toBeUndefined();
    const [row] = await getDb().select().from(users).where(eq(users.id, member.id));
    expect(row.deactivatedAt).not.toBeNull();
  });

  // TC-ADMIN-04 — checked on every request, not only at sign-in.
  it("stops authenticating a deactivated member even with a fresh token", async () => {
    const admin = await makeAdmin(owner);
    await caller(admin).admin.deactivateMember({ userId: member.id });

    // A token minted after the deactivation, with a live session row.
    const token = await startSession({
      userId: member.id,
      unionId: member.unionId,
      name: "Member",
    });
    const headers = new Headers({ cookie: `${Session.cookieName}=${token}` });

    await expect(authenticateRequest(headers)).resolves.toBeUndefined();
    expect(decodeSessionToken(token)).toBeDefined();
  });

  it("refuses to let an administrator deactivate themselves", async () => {
    const admin = await makeAdmin(owner);

    await expect(
      caller(admin).admin.deactivateMember({ userId: admin.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses to deactivate an account that does not exist", async () => {
    const admin = await makeAdmin(owner);
    await expect(
      caller(admin).admin.deactivateMember({ userId: 999_999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reactivates, and authentication works again", async () => {
    const admin = await makeAdmin(owner);
    await caller(admin).admin.deactivateMember({ userId: member.id });
    await caller(admin).admin.reactivateMember({ userId: member.id });

    const token = await startSession({
      userId: member.id,
      unionId: member.unionId,
      name: "Member",
    });
    const headers = new Headers({ cookie: `${Session.cookieName}=${token}` });
    await expect(authenticateRequest(headers)).resolves.toMatchObject({ id: member.id });
  });

  // ── The audit trail ─────────────────────────────────────────────────────
  // TC-ADMIN-05
  it("records exactly one row per administrative action", async () => {
    const admin = await makeAdmin(owner);
    await caller(admin).admin.listMembers({});
    await caller(admin).admin.deactivateMember({ userId: member.id });

    const rows = await auditRows();
    expect(rows.map((r) => r.action)).toEqual([
      "admin.member.list",
      "admin.member.deactivate",
    ]);
    expect(rows[1]).toMatchObject({
      actorId: admin.id,
      targetUserId: member.id,
      outcome: "success",
    });
  });

  // TC-ADMIN-06 — a refusal is as much a fact as a success.
  it("records a refused action as a failure, with the reason", async () => {
    const admin = await makeAdmin(owner);
    await expect(
      caller(admin).admin.deactivateMember({ userId: 999_999 })
    ).rejects.toThrow();

    const [row] = await auditRows();
    expect(row).toMatchObject({ action: "admin.member.deactivate", outcome: "failure" });
    expect(row.detail).toContain("No such member");
  });

  it("keeps the audit trail when the account it describes is purged", async () => {
    const admin = await makeAdmin(owner);
    await caller(admin).admin.deactivateMember({ userId: member.id });

    await getDb()
      .update(users)
      .set({
        deletionRequestedAt: new Date(
          Date.now() - (DELETION_GRACE_PERIOD_DAYS + 1) * 24 * 60 * 60 * 1000
        ),
      })
      .where(eq(users.id, member.id));

    expect(await purgeDueAccounts()).toBe(1);
    expect(await getDb().select().from(users).where(eq(users.id, member.id))).toHaveLength(0);

    // An audit trail that cascades away with the account is not an audit trail.
    const rows = await auditRows();
    expect(rows.some((r) => r.targetUserId === member.id)).toBe(true);
  });

  it("shows only an administrator the audit log", async () => {
    const admin = await makeAdmin(owner);
    await caller(admin).admin.listMembers({});

    await expect(caller(admin).admin.auditLog({})).resolves.not.toHaveLength(0);
    await expect(caller(member).admin.auditLog({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  // ── Export ──────────────────────────────────────────────────────────────
  // TC-ADMIN-08
  it("exports the member's own data and nothing belonging to anyone else", async () => {
    const conversation = await createConversation([member.id, owner.id]);
    await createMessage(conversation, member.id, "mine to export");
    await createMessage(conversation, owner.id, "not mine");
    await getDb()
      .insert(contacts)
      .values({ userId: member.id, contactUserId: owner.id, status: "accepted" });

    const dump = await caller(member).admin.exportMyData();
    const serialised = JSON.stringify(dump);

    expect(serialised).toContain("mine to export");
    // An export is not a way to obtain other people's messages.
    expect(serialised).not.toContain("not mine");
    expect(dump.memberships.map((m) => m.conversationId)).toContain(conversation);
    expect(dump.contacts).toHaveLength(1);
    expect(dump.account.id).toBe(member.id);
  });

  it("records the export", async () => {
    await caller(member).admin.exportMyData();
    expect((await auditRows())[0]).toMatchObject({
      action: "account.export",
      actorId: member.id,
      outcome: "success",
    });
  });

  // ── Erasure ─────────────────────────────────────────────────────────────
  // TC-ADMIN-09
  it("marks the account, revokes sessions, and does not purge immediately", async () => {
    const token = await startSession({
      userId: member.id,
      unionId: member.unionId,
      name: "Member",
    });

    const result = await caller(member).admin.requestDeletion();

    expect(result.graceDays).toBe(DELETION_GRACE_PERIOD_DAYS);
    await expect(verifySessionToken(token)).resolves.toBeUndefined();
    // Still there: the grace period is what makes this recoverable.
    expect(await getDb().select().from(users).where(eq(users.id, member.id))).toHaveLength(1);
    expect(await purgeDueAccounts()).toBe(0);
  });

  it("can be cancelled inside the grace period", async () => {
    await caller(member).admin.requestDeletion();
    await caller(member).admin.cancelDeletion();

    const [row] = await getDb().select().from(users).where(eq(users.id, member.id));
    expect(row.deletionRequestedAt).toBeNull();
    expect(await purgeDueAccounts()).toBe(0);
  });

  it("purges once the grace period has passed, keeping the other party's data", async () => {
    const conversation = await createConversation([member.id, owner.id]);
    await createMessage(conversation, member.id, "will be purged");
    await createMessage(conversation, owner.id, "belongs to the owner");

    await getDb()
      .update(users)
      .set({
        deletionRequestedAt: new Date(
          Date.now() - (DELETION_GRACE_PERIOD_DAYS + 1) * 24 * 60 * 60 * 1000
        ),
      })
      .where(eq(users.id, member.id));

    expect(await purgeDueAccounts()).toBe(1);

    expect(await getDb().select().from(users).where(eq(users.id, member.id))).toHaveLength(0);
    // The purged member's messages are gone; the other party's are not.
    // Erasing one account must not destroy someone else's copy of a
    // conversation they took part in.
    const remaining = await getDb().select().from(messages);
    expect(remaining.map((m) => m.content)).toEqual(["belongs to the owner"]);

    // The conversation survives, now owned by whoever is left in it.
    const [survivingConversation] = await getDb()
      .select()
      .from((await import("@db/schema")).conversations);
    expect(survivingConversation.createdBy).toBe(owner.id);
  });

  it("removes a direct conversation nobody is left in", async () => {
    const solo = await createConversation([member.id], { createdBy: member.id });
    await createMessage(solo, member.id, "alone");

    await getDb()
      .update(users)
      .set({
        deletionRequestedAt: new Date(
          Date.now() - (DELETION_GRACE_PERIOD_DAYS + 1) * 24 * 60 * 60 * 1000
        ),
      })
      .where(eq(users.id, member.id));

    expect(await purgeDueAccounts()).toBe(1);
    expect(
      await getDb().select().from((await import("@db/schema")).conversations)
    ).toHaveLength(0);
  });

  // TC-ADMIN-10 — the RESTRICT keys exist to force this decision.
  it("refuses to purge a member who still owns a group, and says why", async () => {
    await createConversation([member.id, owner.id], {
      type: "group",
      name: "Theirs",
      createdBy: member.id,
    });

    await getDb()
      .update(users)
      .set({
        deletionRequestedAt: new Date(
          Date.now() - (DELETION_GRACE_PERIOD_DAYS + 1) * 24 * 60 * 60 * 1000
        ),
      })
      .where(eq(users.id, member.id));

    expect(await purgeDueAccounts()).toBe(0);
    expect(await getDb().select().from(users).where(eq(users.id, member.id))).toHaveLength(1);

    const [record] = (await auditRows()).filter((r) => r.action === "account.purge");
    expect(record.outcome).toBe("failure");
    expect(record.detail).toContain("ownership must be transferred");
  });

  it("purges once ownership has been transferred", async () => {
    const group = await createConversation([member.id, owner.id], {
      type: "group",
      name: "Theirs",
      createdBy: member.id,
    });
    await caller(member).conversation.transferOwnership({
      conversationId: group,
      newOwnerId: owner.id,
    });

    await getDb()
      .update(users)
      .set({
        deletionRequestedAt: new Date(
          Date.now() - (DELETION_GRACE_PERIOD_DAYS + 1) * 24 * 60 * 60 * 1000
        ),
      })
      .where(eq(users.id, member.id));

    expect(await purgeDueAccounts()).toBe(1);
  });

  // ── auth.me ─────────────────────────────────────────────────────────────
  // TC-AUTH-15
  it("no longer returns unionId or the raw role from auth.me", async () => {
    const me = await caller(member).auth.me();

    expect(Object.keys(me).sort()).toEqual([
      "avatar",
      "email",
      "id",
      "isAdmin",
      "name",
      "status",
    ]);
    expect(me).not.toHaveProperty("unionId");
    expect(me).not.toHaveProperty("role");
    expect(me.isAdmin).toBe(false);
  });

  it("tells an administrator that they are one", async () => {
    const admin = await makeAdmin(owner);
    await expect(caller(admin).auth.me()).resolves.toMatchObject({ isAdmin: true });
  });
});
