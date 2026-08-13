import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  VITE_KIMI_AUTH_URL: z.string().url(),
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
  PUBLIC_BASE_URL: z.string().url().optional(),
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
