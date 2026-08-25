/**
 * HTTP-level test support.
 *
 * Router tests that call `appRouter.createCaller` skip everything between the
 * socket and the procedure: cookie parsing, session verification, context
 * creation, superjson encoding and tRPC's error mapping. This module drives the
 * real Hono app with real `Request` objects instead, so those layers are
 * exercised too.
 *
 * `api/boot.ts` only binds a port when NODE_ENV is not "test", so importing it
 * here starts no listener — `app.fetch` is called directly.
 */
import superjson from "superjson";
import app from "../../api/boot";
import { startSession } from "../../api/kimi/session";
import { Session } from "@contracts/constants";

const ORIGIN = "http://localhost:3000";

export interface Caller {
  cookie: string;
  query<T = unknown>(path: string, input?: unknown): Promise<T>;
  mutate<T = unknown>(path: string, input?: unknown): Promise<T>;
  raw(path: string, init?: RequestInit): Promise<Response>;
}

/** An error carrying the tRPC code, so tests can assert on it. */
export class TrpcHttpError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string
  ) {
    super(message);
    this.name = "TrpcHttpError";
  }
}

function unwrap(body: unknown, status: number) {
  const envelope = body as {
    result?: { data?: unknown };
    error?: { json?: { message?: string; data?: { code?: string } } };
  };

  if (envelope.error) {
    const json = envelope.error.json ?? {};
    throw new TrpcHttpError(
      json.data?.code ?? "UNKNOWN",
      status,
      json.message ?? "request failed"
    );
  }

  // superjson wraps every payload; deserialize rather than reaching for .json.
  return superjson.deserialize(envelope.result?.data as never);
}

/** Build a caller authenticated as `user`, with a genuine signed session. */
export async function callerFor(user: {
  id: number;
  unionId: string;
  name: string | null;
}): Promise<Caller> {
  const token = await startSession({
    userId: user.id,
    unionId: user.unionId,
    name: user.name ?? "User",
  });
  return callerWithCookie(`${Session.cookieName}=${token}`);
}

/** Build a caller with an arbitrary cookie header — including none at all. */
export function callerWithCookie(cookie: string): Caller {
  const headers = (): Record<string, string> => (cookie ? { cookie } : {});

  async function query<T>(path: string, input?: unknown): Promise<T> {
    const url = new URL(`/api/trpc/${path}`, ORIGIN);
    if (input !== undefined) {
      url.searchParams.set("input", JSON.stringify(superjson.serialize(input)));
    }
    const res = await Promise.resolve(app.fetch(new Request(url, { headers: headers() })));
    return unwrap(await res.json(), res.status) as T;
  }

  async function mutate<T>(path: string, input?: unknown): Promise<T> {
    const res = await Promise.resolve(
      app.fetch(
        new Request(new URL(`/api/trpc/${path}`, ORIGIN), {
          method: "POST",
          headers: { ...headers(), "content-type": "application/json" },
          body: JSON.stringify(superjson.serialize(input ?? {})),
        })
      )
    );
    return unwrap(await res.json(), res.status) as T;
  }

  return {
    cookie,
    query,
    mutate,
    // `app.fetch` is typed as sync-or-async; normalise so callers always await
    // a promise.
    raw: (path, init) =>
      Promise.resolve(
        app.fetch(new Request(new URL(path, ORIGIN), { headers: headers(), ...init }))
      ),
  };
}

/** A caller carrying no session at all. */
export const anonymous = () => callerWithCookie("");
