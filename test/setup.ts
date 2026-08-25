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
