import { z } from "zod";
import { assertBareOrigin, InvalidOriginError } from "@contracts/oauth";
import { MIN_SECRET_LENGTH } from "@contracts/constants";

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
  // S-17. Both accepted `min(1)`: a one-character HMAC key started the server
  // and every session in the deployment was forgeable by anyone who guessed it.
  // 32 bytes is the SHA-256 block-equivalent floor; below it the key is the
  // weakest part of the construction.
  APP_SECRET: secret("APP_SECRET"),
  JWT_SECRET: secret("JWT_SECRET"),
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

/**
 * A secret of at least 32 characters, with a message that says how to make one.
 */
function secret(label: string) {
  return z.string().min(MIN_SECRET_LENGTH, {
    message:
      `${label} must be at least ${MIN_SECRET_LENGTH} characters. ` +
      `Generate one with: openssl rand -base64 32`,
  });
}

/**
 * SEC-C-24. Vite inlines every `VITE_*` variable into the public client bundle,
 * so a secret that acquires the prefix is published to every visitor. Checked
 * at import time — before the server can bind a port — rather than left to code
 * review.
 *
 * `VITE_APP_ID` is a public OAuth client identifier and `VITE_KIMI_AUTH_URL` a
 * public origin; neither matches the pattern.
 */
const SECRET_NAME_PATTERN = /SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIAL/i;

export function findLeakedSecretNames(source: Record<string, unknown>): string[] {
  return Object.keys(source).filter(
    (name) => name.startsWith("VITE_") && SECRET_NAME_PATTERN.test(name.slice("VITE_".length))
  );
}

function assertNoLeakedSecrets(source: Record<string, unknown>) {
  const leaked = findLeakedSecretNames(source);
  if (leaked.length > 0) {
    throw new Error(
      `Refusing to start: ${leaked.join(", ")} carries a VITE_ prefix. ` +
        `Vite inlines every VITE_* variable into the public client bundle, so this ` +
        `value would be published to every visitor. Drop the prefix.`
    );
  }
}

assertNoLeakedSecrets(process.env);

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";

export function getPort() {
  return parseInt(env.PORT, 10);
}

export function getOwnerUnionId() {
  return env.OWNER_UNION_ID;
}
