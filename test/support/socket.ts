/**
 * Socket.IO test support.
 *
 * Boots the real `initSocket` server on an ephemeral port and connects real
 * `socket.io-client` clients that carry a genuine signed session cookie, so
 * socket tests exercise the handshake middleware and the event handlers exactly
 * as production does. BUILD_PLAN S-7 grows this into the full harness.
 */
import { createServer, type Server as HttpServer } from "node:http";
import type { Server as SocketIOServer } from "socket.io";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { initSocket, stopSessionRecheck } from "../../api/socket";
import { startSession } from "../../api/kimi/session";
import { Session } from "@contracts/constants";

export interface TestServer {
  port: number;
  io: SocketIOServer;
  close: () => Promise<void>;
}

/** Start an HTTP server with the real Socket.IO wiring attached. */
export async function startSocketServer(): Promise<TestServer> {
  const http: HttpServer = createServer();
  const io = initSocket(http);

  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    // `io.close()` also closes the http server it was attached to, so closing
    // both would fail the second call with "Server is not running".
    io,
    close: () =>
      new Promise<void>((resolve) => {
        stopSessionRecheck();
        io.close(() => resolve());
      }),
  };
}

/**
 * A cookie header carrying a valid session for `user`.
 *
 * Goes through `startSession`, so a real `sessions` row backs it exactly as it
 * would in production — a hand-signed token with no row is rejected since S-17.
 */
export async function sessionCookieFor(user: {
  id: number;
  unionId: string;
  name: string | null;
}) {
  const token = await startSession({
    userId: user.id,
    unionId: user.unionId,
    name: user.name ?? "User",
  });
  return `${Session.cookieName}=${token}`;
}

/** Connect a client authenticated as `user`, resolving once connected. */
export async function connectAs(
  port: number,
  user: { id: number; unionId: string; name: string | null }
): Promise<ClientSocket> {
  return connectWithCookie(port, await sessionCookieFor(user));
}

/** Connect a client with an arbitrary cookie header. Rejects if refused. */
export function connectWithCookie(port: number, cookie: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = connect(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      extraHeaders: cookie ? { cookie } : {},
      reconnection: false,
      forceNew: true,
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });
}

/** Resolve with the first `event` payload, or reject after `ms`. */
export function nextEvent<T = unknown>(socket: ClientSocket, event: string, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for "${event}"`));
    }, ms);
    const handler = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

/** Resolve after `ms`, used to prove an event did NOT arrive. */
export function settle(ms = 300) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Disconnect a list of clients, ignoring already-closed ones. */
export function disconnectAll(...sockets: (ClientSocket | undefined)[]) {
  for (const s of sockets) s?.disconnect();
}
