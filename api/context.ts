import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { authenticateRequest } from "./kimi/auth";

export async function createContext({ req }: FetchCreateContextFnOptions) {
  return { user: await authenticateRequest(req.headers) };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
