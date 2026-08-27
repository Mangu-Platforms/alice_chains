# Test harness

Built by [BUILD_PLAN S-7](../docs/BUILD_PLAN.md#s-7). The repository had one
test before it; the case catalogue lives in [TEST_PLAN.md](../docs/TEST_PLAN.md).

## Running

```bash
npm test                      # unit tests only; integration suites skip
TEST_DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm test
```

Without `TEST_DATABASE_URL` every suite wrapped in `describeIntegration` is
skipped rather than failed, so `npm run validate` is green on a machine with no
database. CI always sets it — see `.github/workflows/ci.yml`.

Point it at a **dedicated** database. `resetDatabase()` truncates every table
between tests.

```bash
docker compose up -d db
DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm run db:migrate
```

`docker compose up -d db` creates `alice_chains_test` itself, via
`db/init/01-create-test-database.sql` — but only on a fresh volume, since MySQL
runs that script once, at first boot. Before it existed, the command above
failed on a clean checkout with `ER_BAD_DB_ERROR: Unknown database
'alice_chains_test'`, because nothing had ever created it (P-TOOL-6); an
existing volume from before this fix needs the one-off statement in
[README.md](../README.md#tests).

## What each layer is for

| Layer | Module | Use it when |
|---|---|---|
| **Fixtures** | `test/support/db.ts` | Any test that needs rows. `createUser`, `createConversation`, `createMessage(s)`, `befriend`, `blockUser`, `requestContact`, `resetDatabase`. |
| **In-process router** | `appRouter.createCaller({ user })` | Testing a procedure's own logic. Fastest; skips HTTP. |
| **HTTP** | `test/support/http.ts` | Anything touching auth, cookies, superjson or error codes. Drives the real Hono app via `app.fetch`, so context creation and tRPC's error mapping are exercised. `callerFor(user)`, `anonymous()`, `callerWithCookie(...)`. |
| **Socket.IO** | `test/support/socket.ts` | Realtime behaviour. Boots the real `initSocket` server on an ephemeral port and connects real clients carrying genuine signed session cookies. `startSocketServer`, `connectAs`, `connectWithCookie`, `nextEvent`, `settle`, `disconnectAll`. |

## Conventions that matter

- **Prove the absence of an event, not just its presence.** A leak test asserts
  that `nextEvent(...)` *rejects* with a timeout. Asserting only that the right
  client got the message would pass even if every client got it.
- **`fileParallelism` is off** (`vitest.config.ts`). Suites share one database
  and truncate between tests, so files must not run concurrently against it.
- **MySQL `TIMESTAMP` has one-second resolution.** Any test that depends on
  ordering by time must sleep ~1.1 s between the writes it is ordering.
- **Red-proof a guard before trusting its test.** Every behavioural fix in
  Waves 1–2 was verified by disabling the guard and confirming the test fails.
- **`npm run db:verify-migration`** covers what the suite cannot: the constraint
  migration's dedupe and orphan handling, against a deliberately dirty scratch
  database.
