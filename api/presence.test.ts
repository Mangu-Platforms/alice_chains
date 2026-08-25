/**
 * BUILD_PLAN S-10 — presence is scoped to people the member has a
 * relationship with, instead of broadcast to every connected socket.
 *
 * Cases: TC-SOCK-17, plus the multi-socket presence rule.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import { contacts } from "@db/schema";
import {
  createConversation,
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

type Row = Awaited<ReturnType<typeof createUser>>;

describeIntegration("presence scoping (S-10)", () => {
  let server: TestServer;
  let alice: Row;
  let bob: Row;
  let stranger: Row;
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
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    stranger = await createUser({ name: "Stranger" });
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(150);
  });

  async function client(user: Row) {
    const socket = await connectAs(server.port, user);
    open.push(socket);
    return socket;
  }

  async function befriend(a: Row, b: Row) {
    await getDb()
      .insert(contacts)
      .values([
        { userId: a.id, contactUserId: b.id, status: "accepted" },
        { userId: b.id, contactUserId: a.id, status: "accepted" },
      ]);
  }

  // TC-SOCK-17 — the leak. A stranger must learn nothing.
  it("does not tell a stranger that someone came online", async () => {
    const watcher = await client(stranger);
    await settle();

    const leaked = nextEvent(watcher, "userOnline", 800);
    await client(alice);

    await expect(leaked).rejects.toThrow(/timed out/);
  });

  it("tells an accepted contact that someone came online", async () => {
    await befriend(alice, bob);
    const watcher = await client(bob);
    await settle();

    const seen = nextEvent<{ userId: number }>(watcher, "userOnline");
    await client(alice);

    await expect(seen).resolves.toEqual({ userId: alice.id });
  });

  it("tells a co-participant that someone came online", async () => {
    await createConversation([alice.id, bob.id]);
    const watcher = await client(bob);
    await settle();

    const seen = nextEvent<{ userId: number }>(watcher, "userOnline");
    await client(alice);

    await expect(seen).resolves.toEqual({ userId: alice.id });
  });

  it("does not tell a stranger that someone went offline", async () => {
    const watcher = await client(stranger);
    const leaving = await client(alice);
    await settle();

    const leaked = nextEvent(watcher, "userOffline", 800);
    leaving.disconnect();

    await expect(leaked).rejects.toThrow(/timed out/);
  });

  it("tells a contact that someone went offline", async () => {
    await befriend(alice, bob);
    const watcher = await client(bob);
    const leaving = await client(alice);
    await settle();

    const seen = nextEvent<{ userId: number }>(watcher, "userOffline");
    leaving.disconnect();

    await expect(seen).resolves.toEqual({ userId: alice.id });
  });

  it("omits unrelated members from the initial online snapshot", async () => {
    await befriend(alice, bob);
    await client(alice);
    await client(stranger);
    await settle();

    const snapshot = nextEvent<number[]>(await connectSnapshot(bob), "onlineUsers");
    await expect(snapshot).resolves.toEqual([alice.id]);
  });

  it("sends an empty snapshot to a member with no relationships", async () => {
    await client(alice);
    await client(bob);
    await settle();

    const snapshot = nextEvent<number[]>(await connectSnapshot(stranger), "onlineUsers");
    await expect(snapshot).resolves.toEqual([]);
  });

  // Multi-device: only the last socket takes a member offline.
  it("stays online while a second tab is still connected", async () => {
    await befriend(alice, bob);
    const watcher = await client(bob);
    const tabOne = await client(alice);
    await client(alice);
    await settle();

    const premature = nextEvent(watcher, "userOffline", 800);
    tabOne.disconnect();

    await expect(premature).rejects.toThrow(/timed out/);
  });

  /** Connect without awaiting the snapshot, so the listener is attached first. */
  async function connectSnapshot(user: Row) {
    const socket = await connectAs(server.port, user);
    open.push(socket);
    return socket;
  }
});
