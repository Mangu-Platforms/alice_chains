#!/usr/bin/env bash
#
# ── DESTRUCTIVE ──────────────────────────────────────────────────────────────
#
# Throw away the local database and start again (BUILD_PLAN P-TOOL-2).
#
#   ./scripts/reset-dev.sh          ask first, then destroy and re-migrate
#   ./scripts/reset-dev.sh --yes    skip the prompt (for a script that already asked)
#   SKIP_DB=1 ./scripts/reset-dev.sh   drop and recreate the schema in a MySQL you run
#
# This exists because the alternative — an operator improvising `docker compose
# down -v` — takes the attachment volume with it without mentioning that it is
# going to. This says what it will destroy, by name, before it destroys any of
# it.

set -euo pipefail

cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
step() { printf "%s→ %s%s\n" "$BOLD" "$1" "$RESET"; }
ok()   { printf "%s  ✓ %s%s\n" "$GREEN" "$1" "$RESET"; }
note() { printf "%s    %s%s\n" "$DIM" "$1" "$RESET"; }
die()  { printf "%s✗ %s%s\n" "$RED" "$1" "$RESET" >&2; exit 1; }

ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    *) die "Unknown argument: $arg (only --yes is accepted)" ;;
  esac
done

# ── Guards ───────────────────────────────────────────────────────────────────
#
# Both refusals come before anything is printed about what would be destroyed,
# so a run against the wrong database ends without ever having shown a prompt
# somebody might reflexively confirm.

if [ "${NODE_ENV:-development}" = "production" ]; then
  die "Refusing to run with NODE_ENV=production."
fi

# The predicate is the tested one in scripts/seed-guards.ts, reached through a
# tiny entry point — not a second definition of "local" written in bash.
# `.env` is loaded by that Node process alone, not by this shell, so it also
# hands back the host and database name for the message below rather than
# leaving this script to re-read DATABASE_URL from an environment it was
# never exported into.
if ! DB_INFO=$(npx tsx --env-file-if-exists=.env scripts/assert-local-db.ts 2>&1); then
  printf "%s✗ Refusing to reset.%s\n" "$RED" "$RESET" >&2
  printf "  %s\n" "$DB_INFO" >&2
  printf "  This script destroys data. It runs against a local database or not at all.\n" >&2
  exit 1
fi

DB_HOST=$(printf '%s' "$DB_INFO" | cut -f1)
DB_NAME=$(printf '%s' "$DB_INFO" | cut -f2)

# ── Say what will go ─────────────────────────────────────────────────────────
printf "\n%s%s This destroys data.%s\n\n" "$YELLOW" "$BOLD" "$RESET"

if [ "${SKIP_DB:-}" = "1" ]; then
  printf "  Schema %s%s%s on %s%s%s will be DROPPED and recreated empty.\n" \
    "$BOLD" "$DB_NAME" "$RESET" "$BOLD" "$DB_HOST" "$RESET"
  printf "  Every message, account, contact and attachment record in it is gone.\n"
else
  printf "  These Docker volumes will be REMOVED:\n"
  printf "    %sdb_data%s        every message, account and contact\n" "$BOLD" "$RESET"
  printf "    %sattachments%s    every uploaded file (the local storage driver)\n" "$BOLD" "$RESET"
  printf "    %sminio_data%s     the S3-profile bucket, if you ever started it\n" "$BOLD" "$RESET"
  printf "\n  Files under %s./storage%s stay — this does not touch your working tree.\n" "$BOLD" "$RESET"
fi

printf "\n  Nothing outside this machine is affected: the database is on %s%s%s.\n\n" "$BOLD" "$DB_HOST" "$RESET"

if [ "$ASSUME_YES" != "1" ]; then
  # A typed word, not a keypress. `y` is muscle memory; `reset` is a decision.
  printf "%sType 'reset' to continue: %s" "$BOLD" "$RESET"
  read -r CONFIRM
  if [ "$CONFIRM" != "reset" ]; then
    printf "\nNothing was destroyed.\n"
    exit 0
  fi
  printf "\n"
fi

# ── Destroy ──────────────────────────────────────────────────────────────────
if [ "${SKIP_DB:-}" = "1" ]; then
  step "Dropping and recreating $DB_NAME"
  npx tsx --env-file-if-exists=.env scripts/drop-database.ts
  ok "Schema is empty"
else
  step "Removing containers and volumes"
  command -v docker >/dev/null || die "Docker is not installed. Use SKIP_DB=1 with your own MySQL."
  docker info >/dev/null 2>&1 || die "Docker's daemon is not reachable. Start it, or use SKIP_DB=1."

  # --volumes is the whole point; --remove-orphans clears services that a
  # previous compose file defined and this one no longer does.
  docker compose down --volumes --remove-orphans
  ok "Volumes removed"

  step "Starting MySQL again"
  docker compose up -d db

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
    die "MySQL did not come back in two minutes. \`docker compose logs db\` will say why."
  fi
fi

# ── Rebuild ──────────────────────────────────────────────────────────────────
step "Applying migrations"
npm run db:migrate --silent
ok "Schema is up to date"

printf "\n"
note "Empty again. \`npm run db:seed\` puts the demo data back."
