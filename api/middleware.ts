import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import { consume, type BucketPolicy } from "./lib/rate-limit";

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const createRouter = t.router;
export const publicQuery = t.procedure;
export const authedQuery = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * S-13. Rate-limit an authenticated procedure, keyed by the caller.
 *
 * Applied as a middleware rather than inline at the top of each resolver, so a
 * procedure cannot be added later and quietly miss its limit — the policy is
 * visible in the procedure's own definition.
 */
export function rateLimited(surface: string, ...policies: BucketPolicy[]) {
  return authedQuery.use(({ ctx, next }) => {
    for (const [index, policy] of policies.entries()) {
      // Each policy gets its own bucket. Sharing one key across two policies
      // makes every call cost a token from each, so a surface with a burst
      // limit and a daily limit would refuse at half its stated burst.
      const result = consume(`${surface}#${index}`, ctx.user.id, policy);
      if (!result.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many requests. Try again in ${Math.ceil(
            result.retryAfterMs / 1000
          )}s.`,
        });
      }
    }
    return next();
  });
}
