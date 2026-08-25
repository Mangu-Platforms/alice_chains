# Alice Chains — Setup

Follow this top to bottom. It assumes you have never seen the repository. Every command is meant to be pasted as written.

---

## 0. The short version

```bash
git clone https://github.com/Mangu-Platforms/alice_chains.git
cd alice_chains
./scripts/dev.sh        # or: npm run dev:up
```

That checks your Node version, writes a `.env` with freshly generated secrets if
you have none, runs `npm ci`, brings MySQL up and waits for it to be genuinely
ready, applies migrations, and starts both dev servers. It is idempotent — run
it again any time. If you already have a MySQL 8 you would rather use, point
`DATABASE_URL` at it and run `SKIP_DB=1 ./scripts/dev.sh`.

Then, for something to look at without an OAuth provider:

```bash
npm run db:seed
```

The rest of this document is the same thing done by hand, plus everything the
script does not do.

---

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | **22.x** | CI pins 22 (`.github/workflows/ci.yml`); the project is ESM (`"type": "module"`) |
| npm | 10.x (ships with Node 22) | `package-lock.json` is committed — use `npm ci` |
| Docker + Docker Compose v2 | current | provides MySQL 8.4, and can run the whole app |
| A Kimi OAuth 2.0 client | — | client id + secret; sign-in is the only auth path |

Check: `node -v` → `v22.x`, `docker compose version` → `v2.x`.

---

## 2. Clone and install

```bash
git clone https://github.com/Mangu-Platforms/alice_chains.git
cd alice_chains
npm ci
```

**Use `npm ci`, never `npm install`.** The lockfile is committed and CI installs from it; `npm install` can silently re-resolve dependencies and produce a tree that differs from the one CI validates.

---

## 3. Configure the environment

```bash
cp .env.example .env
```

Then edit `.env`. `api/lib/env.ts` is the authoritative schema — it Zod-validates `process.env` at import time, so the server exits immediately with a readable error if anything is missing or malformed.

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | MySQL connection string used by the mysql2 pool and by drizzle-kit. Matches the compose defaults out of the box: `mysql://alice:alice_pw@localhost:3306/alice_chains` |
| `VITE_KIMI_AUTH_URL` | yes | The identity provider's **origin only** — scheme + host (+ port). No path, no query, no trailing slash. The app appends `/oauth/authorize`, `/api/oauth/token` and `/api/oauth/userinfo` itself. `VITE_`-prefixed, so Vite inlines it into the public client bundle: it is public, and must never hold a secret |
| `VITE_APP_ID` | yes | OAuth `client_id`. Public by definition (RFC 6749) and likewise inlined into the bundle |
| `APP_SECRET` | yes | OAuth **client secret**. Server-side only. Never rename it with a `VITE_` prefix |
| `JWT_SECRET` | yes | Key that signs the session cookie. Historical name — sessions are HMAC-SHA256 signed cookies, not JWTs (a rename to `SESSION_SECRET` is planned). Generate with `openssl rand -base64 32` |
| `PUBLIC_BASE_URL` | prod | The canonical origin users reach this deployment on, e.g. `http://localhost:3000` in dev. Required in production and behind any reverse proxy so the OAuth `redirect_uri` is identical on both legs of the exchange |
| `PORT` | no | Production port. Default `3000` |
| `API_PORT` | no | Dev-only API port; must match the Vite proxy target. Default `3001` |
| `NODE_ENV` | no | `development` \| `production` \| `test`. Default `development` |
| `OWNER_UNION_ID` | no | Union id of the instance owner. Parsed but not yet used by any feature |

> Rule: **never prefix a secret with `VITE_`.** Vite performs static text replacement on every `import.meta.env.VITE_*` at build time and the value is served to every visitor.

---

## 4. Start the database and apply migrations

```bash
docker compose up -d db     # MySQL 8.4 on :3306, with a healthcheck
npm run db:migrate          # apply the committed migrations in db/migrations/
```

Wait for the container to report healthy before migrating: `docker compose ps` should show `db` as `healthy` (it can take ~30 s on first boot while MySQL initialises the data directory).

`npm run db:migrate` is the canonical path. `npm run db:push` syncs the schema without writing a migration and is **scratch development only** — never use it against anything you care about. `npm run db:studio` opens Drizzle Studio if you want to browse the tables.

---

## 5. Run it in development

```bash
npm run dev
```

This runs two processes concurrently:

* **Vite** serves the React client on **http://localhost:3000** and proxies `/api` and `/socket.io` to the API;
* **`tsx watch --env-file-if-exists=.env api/boot.ts`** runs the Hono + tRPC + Socket.IO API on **http://localhost:3001**.

Open http://localhost:3000 and sign in.

**`.env` is loaded by Node itself**, through `--env-file-if-exists` on the
`dev:server` and `start` scripts. It used to be loaded by nothing at all: `tsx`
does not read `.env`, no `dotenv` call existed anywhere, and so §3's
`cp .env.example .env` was followed by a `ZodError` naming every required
variable — the file was written and never read. Vite reads `.env` on its own for
the client half, and drizzle-kit does the same for migrations, which is why
those two steps always appeared to work. Fixed in P-TOOL-1; `--env-file-if-exists`
needs Node 20.12 or newer, and this project already requires 22.

**This works now.** It did not used to: `api/boot.ts` created the HTTP server and attached Socket.IO only inside `if (NODE_ENV === "production")`, so in development nothing listened on `:3001` and every proxied request failed with `ECONNREFUSED`. The server now always binds except under `NODE_ENV=test` — dev binds `API_PORT` (3001), production binds `PORT` (3000) and additionally serves the built client.

Sanity check while `npm run dev` is running:

```bash
curl http://localhost:3001/api/trpc/ping     # -> {"result":{"data":{"json":{"ok":true,...}}}}
```

---

## 6. Run the whole stack in containers

```bash
docker compose up
```

That builds the image, starts MySQL, runs a one-shot `migrate` service that applies migrations and exits, then starts the app on **http://localhost:3000** in production mode (single process serving the client and the API).

Compose reads `.env` and **requires** `VITE_KIMI_AUTH_URL`, `VITE_APP_ID`, `APP_SECRET` and `JWT_SECRET` to be set — it fails fast with a named error if any is missing. The two `VITE_*` values are also build args, because they are baked into the client bundle at build time: **changing either requires a rebuild** (`docker compose up --build`), not just a restart.

---

## 7. The gate

```bash
npm run validate      # typecheck -> test -> lint -> build
```

`npm run validate` is the single gate. CI runs exactly it, and no task is finished until it exits 0. Individual steps if you need them: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.

---

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `EADDRINUSE :3000` or `:3001` | Something else holds the port. Find it with `lsof -i :3000` (macOS/Linux) and stop it, or set `PORT`/`API_PORT` in `.env` — if you change `API_PORT` you must also change the proxy targets in `vite.config.ts:16-26`, they are not derived from one another |
| `ECONNREFUSED 127.0.0.1:3001` in the Vite console | The API process is not up. Check the `dev:server` half of `npm run dev` for a crash — usually a Zod env error. This is *not* the old S-2 defect; the server binds in dev now |
| `ECONNREFUSED 127.0.0.1:3306` or `ER_ACCESS_DENIED` | MySQL is not up or `DATABASE_URL` is wrong. `docker compose ps` → is `db` `healthy`? First boot takes ~30 s; `npm run db:migrate` run too early fails on connection, not on schema. Just wait and re-run |
| Migrations run but tables are missing | You are pointed at a different database than the app. Compare the database name in `DATABASE_URL` with `MYSQL_DATABASE` in `docker-compose.yml` (default `alice_chains`) |
| Crash on start: `ZodError` listing env keys | `.env` is missing or malformed. Compare it against the table in §3; every "yes" row must be present and non-empty. Before P-TOOL-1 this happened even with a perfectly good `.env`, because nothing loaded it — if you see it on an older checkout, that is why |
| Sign-in redirects to `.../oauth/authorize/oauth/authorize` | `VITE_KIMI_AUTH_URL` holds a **full authorize URL** instead of an origin. It must be `https://auth.example.com`, not `https://auth.example.com/oauth/authorize` — the app derives all three endpoint paths from it |
| 400 at `/api/oauth/callback`, or the provider rejects the exchange | The `redirect_uri` differs between the two legs of the exchange. Set `PUBLIC_BASE_URL` to the origin users actually reach (`http://localhost:3000` in dev) and register exactly `{PUBLIC_BASE_URL}/api/oauth/callback` with the provider |
| Socket connects then immediately disconnects | The session cookie is missing or expired — sign in again. The handshake requires a valid `alice_session` cookie |
| `npm run lint` reports ~1900 errors after a build | That was the old failure mode: ESLint flat config only ignores `node_modules`/`.git` by default, so it linted the bundled `dist/boot.js`. `eslint.config.js:12` now ignores `dist/**`, `db/migrations/**` and `coverage/**`. If you see it again, that ignores block has been removed — restore it rather than deleting `dist/` |
| Tests hang and Vitest will not exit | The mysql2 pool is created at module import (`api/queries/connection.ts:6`) and has no exported close. Any test that issues a real query leaves sockets open — see [TEST_PLAN.md §3.4](TEST_PLAN.md) |
| `npm ci` fails with 403 from the registry | A registry-blocking proxy on your network. Install locally or in CI |

---

## 9. Where to go next

* [../CLAUDE.md](../CLAUDE.md) — the working agreement, read before changing anything.
* [BUILD_PLAN.md](BUILD_PLAN.md) — what to build next, in order, with acceptance criteria.
* [../CURRENT_STATUS.md](../CURRENT_STATUS.md) — what is known broken right now.
