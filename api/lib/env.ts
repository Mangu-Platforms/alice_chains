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
  // H-7. Both of these are read on the server only — since S-4 the client
  // builds no provider URL at all (`src/pages/Login.tsx` links to
  // `/api/oauth/login` and reads nothing from `import.meta.env`) — so the
  // `VITE_` prefix has been misleading since then: it survived because
  // nothing forced the rename. `KIMI_AUTH_URL`/`KIMI_APP_ID` are the target
  // names; the `VITE_`-prefixed ones stay accepted, optional, and equivalent,
  // resolved below with the new name preferred. Both optional here so that
  // setting only one of a pair still parses; `assertAtLeastOneSet` enforces
  // that at least one actually is.
  KIMI_AUTH_URL: bareOrigin("KIMI_AUTH_URL").optional(),
  VITE_KIMI_AUTH_URL: bareOrigin("VITE_KIMI_AUTH_URL").optional(),
  KIMI_APP_ID: z.string().min(1).optional(),
  VITE_APP_ID: z.string().min(1).optional(),
  // S-17. Both accepted `min(1)`: a one-character HMAC key started the server
  // and every session in the deployment was forgeable by anyone who guessed it.
  // 32 bytes is the SHA-256 block-equivalent floor; below it the key is the
  // weakest part of the construction.
  APP_SECRET: secret("APP_SECRET"),
  // H-7 / ADR-002. `JWT_SECRET` names a JWT this codebase deliberately does
  // not use (docs/ADR.md ADR-002) — the token is a two-segment signed
  // envelope, not a three-segment JOSE structure. `SESSION_SECRET` is the
  // target name; `JWT_SECRET` stays accepted, optional, and equivalent.
  // `SESSION_SECRET_PREVIOUS` is verification-only — accepted alongside the
  // current key for a rotation window, never used to sign — so rotating the
  // secret does not sign every member out the moment it changes
  // (docs/SECURITY.md §10 item 4).
  SESSION_SECRET: secret("SESSION_SECRET").optional(),
  JWT_SECRET: secret("JWT_SECRET").optional(),
  SESSION_SECRET_PREVIOUS: secret("SESSION_SECRET_PREVIOUS").optional(),
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

  // ─── Attachment storage (F-4) ──────────────────────────────────────────
  // "local" writes to the filesystem and needs no infrastructure, which is why
  // it is the default: `npm run dev` and `docker compose up` both give a
  // working attachment flow out of the box. "s3" talks to MinIO or S3 and is
  // what a multi-node deployment must use, since local files live on one disk.
  // Whether X-Forwarded-For may be believed. Off by default: a client can set
  // that header freely, so trusting it without a proxy in front lets anyone
  // choose their own rate-limit bucket.
  // Comma-separated origins allowed to reach the API and open a socket.
  // Empty means "the app's own origin only", which is right for the
  // single-origin deployment this ships as.
  CORS_ORIGINS: z.string().default(""),

  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // MinIO serves path-style (http://host/bucket/key); AWS prefers virtual-host
  // style. Wrong choice here produces a signature mismatch, not a 404, so it
  // is explicit rather than guessed.
  // ─── Web push (F-6) ────────────────────────────────────────────────────
  // Generate a pair with `npm run generate-vapid`. With these unset the app
  // runs exactly as before and simply sends no notifications — push is opt-in,
  // not a startup requirement.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),

  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
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

/**
 * Every variable the schema declares (BUILD_PLAN P-TOOL-7).
 *
 * These names are never written as `process.env.X` anywhere — the schema
 * parses the whole object at once — so a scan of the source cannot find them.
 * `.env.example` is checked against this list, which is what stops a variable
 * being added here and never documented.
 */
export const declaredEnvKeys: readonly string[] = Object.keys(envSchema.shape);

export const env = envSchema.parse(process.env);

/**
 * Resolve a renamed variable that still accepts its old name (H-7, ADR-002).
 *
 * Throws when neither is set — there is no sensible default for an OAuth
 * origin, a client id, or a signing key. Warns once, at boot, when only the
 * legacy name is present, naming both names so the fix is one line to make;
 * says nothing when the current name is set, whether or not the legacy one
 * still lingers alongside it (the documented migration path sets both to the
 * same value for one release before the old one is dropped).
 *
 * A pure function over its arguments rather than reading `process.env`
 * itself, so the three call sites below are the only place that decides
 * which concrete variables this applies to — and so the resolution rule
 * itself is unit-testable without re-parsing the schema.
 */
export function resolveRenamedVar(
  current: string | undefined,
  legacy: string | undefined,
  currentName: string,
  legacyName: string
): string {
  if (current !== undefined) return current;
  if (legacy !== undefined) {
    console.warn(
      `[config.deprecated] ${legacyName} is set but ${currentName} is not. ` +
        `${legacyName} still works but will be removed in a future release — ` +
        `set ${currentName} to the same value.`
    );
    return legacy;
  }
  throw new Error(`Refusing to start: set ${currentName} (or the deprecated ${legacyName}).`);
}

/** The OAuth provider's origin — `KIMI_AUTH_URL`, falling back to `VITE_KIMI_AUTH_URL`. */
export const kimiAuthUrl = resolveRenamedVar(
  env.KIMI_AUTH_URL,
  env.VITE_KIMI_AUTH_URL,
  "KIMI_AUTH_URL",
  "VITE_KIMI_AUTH_URL"
);

/** The OAuth client id — `KIMI_APP_ID`, falling back to `VITE_APP_ID`. */
export const kimiAppId = resolveRenamedVar(
  env.KIMI_APP_ID,
  env.VITE_APP_ID,
  "KIMI_APP_ID",
  "VITE_APP_ID"
);

/**
 * The session-signing key — `SESSION_SECRET`, falling back to `JWT_SECRET`
 * (ADR-002). Used for signing; also the first key tried on verification.
 */
export const sessionSecret = resolveRenamedVar(
  env.SESSION_SECRET,
  env.JWT_SECRET,
  "SESSION_SECRET",
  "JWT_SECRET"
);

/**
 * A prior signing key, honoured for verification only, never for signing.
 * Unset outside a rotation window (docs/SECURITY.md §10 item 4).
 */
export const sessionSecretPrevious = env.SESSION_SECRET_PREVIOUS;

// Fail at boot rather than on the first upload: an operator who selects the s3
// driver and forgets a credential should learn immediately.
// Half a VAPID pair is a configuration mistake that would otherwise surface as
// notifications silently never arriving.
if (Boolean(env.VAPID_PUBLIC_KEY) !== Boolean(env.VAPID_PRIVATE_KEY)) {
  throw new Error(
    "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together. " +
      "Generate a pair with: npm run generate-vapid"
  );
}

if (env.STORAGE_DRIVER === "s3") {
  const missing = (
    ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const
  ).filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=s3 requires ${missing.join(", ")}. ` +
        `Set them, or use STORAGE_DRIVER=local for filesystem storage.`
    );
  }
}
export const isProduction = env.NODE_ENV === "production";

export function getPort() {
  return parseInt(env.PORT, 10);
}

export function getOwnerUnionId() {
  return env.OWNER_UNION_ID;
}

/**
 * Origins allowed to call the API and open a socket (S-15, SEC-C-18).
 *
 * Socket.IO's CORS was hard-coded to `http://localhost:3000` in development
 * and `false` in production, which is correct only for a deployment served from
 * exactly one origin and says so nowhere. This makes it configuration.
 */
export function allowedOrigins(): string[] {
  const configured = env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;
  if (env.PUBLIC_BASE_URL) return [env.PUBLIC_BASE_URL];
  // Development default: Vite serves the client here and proxies to the API.
  return isProduction ? [] : ["http://localhost:3000"];
}
