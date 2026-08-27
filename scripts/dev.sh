#!/usr/bin/env bash
#
# One command from a clean clone to a running app (BUILD_PLAN P-TOOL-1).
#
#   ./scripts/dev.sh          bring the database up, migrate, run the dev servers
#   SKIP_DB=1 ./scripts/dev.sh   use a MySQL you already have running
#
# Everything here is idempotent, so running it twice is not a mistake — the
# second run notices what is already true and moves on. That matters more than
# it sounds: a setup script that only works from a pristine state is one people
# stop trusting after the first failure halfway through.

set -euo pipefail

cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; RESET=$'\033[0m'
step()  { printf "%s→ %s%s\n" "$BOLD" "$1" "$RESET"; }
ok()    { printf "%s  ✓ %s%s\n" "$GREEN" "$1" "$RESET"; }
note()  { printf "%s    %s%s\n" "$DIM" "$1" "$RESET"; }
die()   { printf "%s✗ %s%s\n" "$RED" "$1" "$RESET" >&2; exit 1; }

# ── 1 · Prerequisites ────────────────────────────────────────────────────────
step "Checking prerequisites"

command -v node >/dev/null || die "Node is not installed. This project needs Node 22 or newer."

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  die "Node $(node --version) is too old. package.json requires >=22 — .env loading uses --env-file-if-exists, which landed in 20.12."
fi
ok "Node $(node --version)"

# ── 2 · Configuration ────────────────────────────────────────────────────────
step "Checking .env"

if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created .env from .env.example"

  # Real secrets rather than the placeholder. The placeholder is long enough to
  # pass the 32-character check, which is exactly what makes leaving it in
  # place dangerous: nothing complains, and every developer's instance shares
  # one signing key.
  if command -v openssl >/dev/null; then
    APP=$(openssl rand -base64 32)
    SESSION=$(openssl rand -base64 32)
    # `|` as the delimiter: base64 contains `/` but never `|`.
    sed -i.bak "s|^APP_SECRET=.*|APP_SECRET=${APP}|; s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION}|" .env
    rm -f .env.bak
    ok "Generated APP_SECRET and SESSION_SECRET"
  else
    note "openssl not found — set APP_SECRET and SESSION_SECRET yourself:"
    note "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
  fi

  note "Sign-in needs VITE_KIMI_AUTH_URL and VITE_APP_ID from your OAuth provider."
  note "Without them the server still boots; only sign-in fails. \`npm run db:seed\`"
  note "gives you a signed-in demo account with no provider at all."
else
  ok ".env exists — leaving it alone"
fi

# ── 3 · Dependencies ─────────────────────────────────────────────────────────
step "Checking dependencies"

if [ ! -d node_modules ]; then
  # `npm ci`, never `npm install`: the lockfile is the decision of record, and
  # `install` would silently rewrite it.
  npm ci
  ok "Installed from package-lock.json"
else
  ok "node_modules present"
fi

# ── 4 · Database ─────────────────────────────────────────────────────────────
if [ "${SKIP_DB:-}" = "1" ]; then
  step "Skipping the database (SKIP_DB=1) — using DATABASE_URL as configured"
else
  step "Starting MySQL"

  if ! command -v docker >/dev/null; then
    die "Docker is not installed. Either install it, or point DATABASE_URL at your own MySQL 8 and re-run with SKIP_DB=1."
  fi
  if ! docker info >/dev/null 2>&1; then
    die "Docker is installed but its daemon is not reachable. Start Docker, or use SKIP_DB=1 with your own MySQL 8."
  fi

  docker compose up -d db

  # `up -d` returns as soon as the container is created, which is a long way
  # before MySQL is accepting connections. Migrating too early fails with
  # ECONNREFUSED, which reads like a configuration error and is not one.
  printf "%s    waiting for MySQL to accept connections%s" "$DIM" "$RESET"
  for _ in $(seq 1 60); do
    if [ "$(docker compose ps --format '{{.Health}}' db 2>/dev/null)" = "healthy" ]; then
      printf "\n"; ok "MySQL is healthy"
      break
    fi
    printf "."
    sleep 2
  done

  if [ "$(docker compose ps --format '{{.Health}}' db 2>/dev/null)" != "healthy" ]; then
    printf "\n"
    die "MySQL did not become healthy in two minutes. \`docker compose logs db\` will say why."
  fi
fi

# ── 5 · Schema ───────────────────────────────────────────────────────────────
step "Applying migrations"
npm run db:migrate --silent
ok "Schema is up to date"

# ── 6 · Run ──────────────────────────────────────────────────────────────────
step "Starting the app"
note "client  http://localhost:3000"
note "api     http://localhost:3001"
note "seed    npm run db:seed   (demo users, a DM and a group, no OAuth needed)"
printf "\n"

exec npm run dev
