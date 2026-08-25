import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { authenticateRequest } from "./kimi/auth";

export async function createContext({ req }: FetchCreateContextFnOptions) {
  return {
    user: await authenticateRequest(req.headers),
    // Stored as a hash on a push subscription, so a member can tell their
    // devices apart. Never persisted raw.
    userAgent: req.headers.get("user-agent"),
  };
}

/**
 * Declared rather than inferred, so `userAgent` is optional.
 *
 * Every in-process caller — tests, and any future server-side invocation —
 * builds a context by hand. Inferring the type would make each of them supply a
 * user agent they do not have, for the sake of one procedure that treats it as
 * a nice-to-have.
 */
export type Context = {
  user: Awaited<ReturnType<typeof authenticateRequest>>;
  userAgent?: string | null;
};
