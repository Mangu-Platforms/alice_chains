/**
 * Global test setup — runs before any test module is imported.
 *
 * `api/lib/env.ts` parses `process.env` at import time and `api/queries/
 * connection.ts` builds its pool at import time, so these values must be in
 * place before the first import of anything under `api/`. A `beforeAll` inside
 * a test file is too late unless that file uses dynamic imports.
 *
 * `TEST_DATABASE_URL` opts a run into the integration suites. When it is unset
 * those suites skip rather than fail, so `npm run validate` stays green on a
 * machine with no database. See test/support/db.ts.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "mysql://user:pass@127.0.0.1:3306/alice_test";
process.env.VITE_KIMI_AUTH_URL ??= "https://auth.example.com";
process.env.VITE_APP_ID ??= "test-app";
process.env.APP_SECRET ??= "test-app-secret-at-least-32-bytes-long!!";
process.env.JWT_SECRET ??= "test-signing-secret-at-least-32-bytes!!";
process.env.PUBLIC_BASE_URL ??= "http://localhost:3000";

/**
 * A VAPID pair for the push suite.
 *
 * `api/lib/env.ts` parses `process.env` at import time, so setting these in a
 * `beforeEach` is too late — `pushIsConfigured()` would already have decided
 * push was off and every delivery test would silently pass by doing nothing.
 * Generated per run rather than hard-coded, so nothing here resembles a key
 * anyone might paste into a real deployment.
 */
const { createECDH } = await import("node:crypto");
const vapid = createECDH("prime256v1");
vapid.generateKeys();
process.env.VAPID_PUBLIC_KEY ??= vapid.getPublicKey().toString("base64url");
process.env.VAPID_PRIVATE_KEY ??= vapid.getPrivateKey().toString("base64url");
process.env.VAPID_SUBJECT ??= "mailto:test@example.test";

/**
 * A fresh rate limiter for every test.
 *
 * S-13's buckets are process-global, so without this one suite's twentieth
 * search would refuse the next suite's first. That is real behaviour in
 * production — the limits are per process — but in a test it produces a
 * failure that points at the feature under test rather than at the shared
 * state, which is exactly what happened when S-13 first landed.
 */
const { beforeEach } = await import("vitest");
const { resetRateLimits } = await import("../api/lib/rate-limit");

beforeEach(() => {
  resetRateLimits();
});
