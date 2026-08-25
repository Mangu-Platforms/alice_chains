/**
 * BUILD_PLAN S-8 — `markAsRead` authorization (Socket.IO door), plus the
 * handshake and membership guards the same helper now backs.
 *
 * Cases: TC-SOCK-11, TC-SOCK-12.
 * Before S-8 the handler checked conversation membership and then wrote a
 * receipt for whatever ids it was handed, including ids from another thread.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Socket as ClientSocket } from "socket.io-client";
import { messageReads } from "@db/schema";
import {
  createConversation,
  createMessage,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import {
  connectAs,
  connectWithCookie,
  disconnectAll,
  nextEvent,
  sessionCookieFor,
  settle,
  startSocketServer,
  type TestServer,
} from "../test/support/socket";
import { revalidateSockets } from "./socket";
import {
  decodeSessionToken,
  revokeAllSessionsForUser,
  revokeSession,
} from "./kimi/session";
import { getDb } from "./queries/connection";

type Row = Awaited<ReturnType<typeof createUser>>;

async function receiptsFor(userId: number) {
  return getDb().select().from(messageReads).where(eq(messageReads.userId, userId));
}

describeIntegration("socket markAsRead authorization (S-8)", () => {
  let server: TestServer;
  let alice: Row;
  let bob: Row;
  let mallory: Row;
  let shared: number;
  let other: number;
  let sharedMessage: number;
  let otherMessage: number;
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
    mallory = await createUser({ name: "Mallory" });

    shared = await createConversation([alice.id, bob.id]);
    other = await createConversation([alice.id, mallory.id]);

    sharedMessage = await createMessage(shared, alice.id, "shared");
    otherMessage = await createMessage(other, alice.id, "other");
  });

  afterEach(() => {
    disconnectAll(...open.splice(0));
  });

  async function client(user: Row) {
    const socket = await connectAs(server.port, user);
    open.push(socket);
    return socket;
  }

  it("rejects a handshake with no session cookie", async () => {
    await expect(connectWithCookie(server.port, "")).rejects.toThrow(/unauthorized/i);
  });

  it("rejects a handshake whose session cookie is forged", async () => {
    await expect(
      connectWithCookie(server.port, "alice_session=not.a.real.token")
    ).rejects.toThrow(/unauthorized/i);
  });

  // TC-SOCK-11 — a member of the conversation, but the ids belong elsewhere.
  it("ignores markAsRead ids that belong to a different conversation", async () => {
    const socket = await client(bob);

    socket.emit("markAsRead", { messageIds: [otherMessage], conversationId: shared });
    await settle();

    expect(await receiptsFor(bob.id)).toHaveLength(0);
  });

  // TC-SOCK-12 — a non-participant of the named conversation.
  it("ignores markAsRead from a non-participant of the named conversation", async () => {
    const socket = await client(mallory);

    socket.emit("markAsRead", { messageIds: [sharedMessage], conversationId: shared });
    await settle();

    expect(await receiptsFor(mallory.id)).toHaveLength(0);
  });

  it("rejects a mixed batch whole rather than writing the legitimate half", async () => {
    const alsoShared = await createMessage(shared, alice.id, "second");
    const socket = await client(bob);

    socket.emit("markAsRead", {
      messageIds: [alsoShared, otherMessage],
      conversationId: shared,
    });
    await settle();

    expect(await receiptsFor(bob.id)).toHaveLength(0);
  });

  it("still records a legitimate read and tells the other member", async () => {
    const reader = await client(bob);
    const watcher = await client(alice);

    reader.emit("joinConversation", { conversationId: shared });
    watcher.emit("joinConversation", { conversationId: shared });
    await settle();

    const seen = nextEvent<{ messageIds: number[]; userId: number }>(watcher, "messagesRead");
    reader.emit("markAsRead", { messageIds: [sharedMessage], conversationId: shared });

    await expect(seen).resolves.toMatchObject({
      messageIds: [sharedMessage],
      userId: bob.id,
    });
    expect(await receiptsFor(bob.id)).toHaveLength(1);
  });

  it("ignores a malformed payload without disconnecting the socket", async () => {
    const socket = await client(bob);

    socket.emit("markAsRead", { messageIds: "not-an-array", conversationId: shared });
    socket.emit("markAsRead", {});
    socket.emit("markAsRead", { messageIds: [-1, 0], conversationId: shared });
    await settle();

    expect(socket.connected).toBe(true);
    expect(await receiptsFor(bob.id)).toHaveLength(0);
  });

  it("does not join a conversation the caller is not a member of", async () => {
    const intruder = await client(mallory);
    const member = await client(bob);

    intruder.emit("joinConversation", { conversationId: shared });
    member.emit("joinConversation", { conversationId: shared });
    await settle();

    const leaked = nextEvent(intruder, "newMessage", 600);
    member.emit("sendMessage", { conversationId: shared, content: "members only" });

    await expect(leaked).rejects.toThrow(/timed out/);
  });

  it("refuses to persist a message from a non-participant", async () => {
    const intruder = await client(mallory);

    intruder.emit("sendMessage", { conversationId: shared, content: "let me in" });
    await settle();

    const rows = await getDb().select().from(messageReads);
    expect(rows).toHaveLength(0);
  });
});

/**
 * BUILD_PLAN S-17 step 5 — an established socket re-checks its session.
 *
 * Case: TC-SOCK-24. A socket used to be authorized once at handshake and then
 * trusted for its whole life, so signing out on one device left every open
 * socket on every other device alive and receiving messages.
 */
describeIntegration("socket session re-validation (S-17)", () => {
  let server: TestServer;
  let alice: Row;
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
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(150);
  });

  it("leaves a socket alone while its session is live", async () => {
    const socket = await connectAs(server.port, alice);
    open.push(socket);
    await settle();

    await expect(revalidateSockets(server.io)).resolves.toBe(0);
    expect(socket.connected).toBe(true);
  });

  // TC-SOCK-24
  it("disconnects a socket whose session was revoked, telling it why", async () => {
    const cookie = await sessionCookieFor(alice);
    const socket = await connectWithCookie(server.port, cookie);
    open.push(socket);
    await settle();

    const token = cookie.split("=").slice(1).join("=");
    await revokeSession(decodeSessionToken(token)!.sid);

    // `sessionExpired` carries no payload, so arrival is what is asserted:
    // nextEvent rejects on timeout, and resolves with undefined on delivery.
    const notified = nextEvent(socket, "sessionExpired");
    await expect(revalidateSockets(server.io)).resolves.toBe(1);
    await expect(notified).resolves.toBeUndefined();

    await settle(200);
    expect(socket.connected).toBe(false);
  });

  it("drops every device when the member signs out everywhere", async () => {
    const phone = await connectWithCookie(server.port, await sessionCookieFor(alice));
    const laptop = await connectWithCookie(server.port, await sessionCookieFor(alice));
    open.push(phone, laptop);
    await settle();

    await revokeAllSessionsForUser(alice.id);

    await expect(revalidateSockets(server.io)).resolves.toBe(2);
    await settle(200);
    expect(phone.connected).toBe(false);
    expect(laptop.connected).toBe(false);
  });
});
