import { z } from "zod";
import { assertBareOrigin, InvalidOriginError } from "@contracts/oauth";

/**
 * Zod refinement that accepts only a bare `scheme://host[:port]`.
 *
 * Applied at import time, so a deployment configured with a full authorize URL
 * (which is what `.env.example` used to ship) fails at boot with a message that
 * names the fix, rather than silently building `.../oauth/authorize/oauth/authorize`
 * and failing every sign-in.
 */
const bareOrigin = (label: string) =>
  z.string().superRefine((value, ctx) => {
    try {
      assertBareOrigin(value, label);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof InvalidOriginError ? error.message : String(error),
      });
    }
  });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  VITE_KIMI_AUTH_URL: bareOrigin("VITE_KIMI_AUTH_URL"),
  VITE_APP_ID: z.string().min(1),
  APP_SECRET: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  PORT: z.string().default("3000"),
  // Dev-only: the port the API binds while Vite serves the client on 3000 and
  // proxies /api + /socket.io here. Must match CLIENT_PORT/API_PORT in
  // contracts/constants.ts and the proxy target in vite.config.ts.
  API_PORT: z.string().default("3001"),
  // Canonical externally-reachable origin. Required so the OAuth redirect_uri
  // the client sends and the one the server exchanges are identical; behind the
  // Vite dev proxy (changeOrigin) or any reverse proxy the inbound Host is not
  // the public one. See TECH_SPEC.md 8b.
  PUBLIC_BASE_URL: bareOrigin("PUBLIC_BASE_URL").optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  OWNER_UNION_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";

export function getPort() {
  return parseInt(env.PORT, 10);
}

export function getOwnerUnionId() {
  return env.OWNER_UNION_ID;
}
