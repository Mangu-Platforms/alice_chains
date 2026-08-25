-- Runs once, on the mysql image's first boot against an empty data
-- directory (docker-entrypoint-initdb.d convention). BUILD_PLAN P-TOOL-6.
--
-- `MYSQL_DATABASE` provisions exactly one schema and grants the app user
-- rights on it — the dev database, `alice_chains`. A stranger following
-- README.md/test/README.md's documented test command,
--
--   TEST_DATABASE_URL=mysql://alice:alice_pw@127.0.0.1:3306/alice_chains_test npm test
--
-- got `ER_BAD_DB_ERROR: Unknown database 'alice_chains_test'` from a database
-- `docker compose up -d db` — the exact command Quick Start documents — never
-- created. It went unnoticed all session because this sandbox's MySQL was
-- provisioned by hand at the very start, before either database name existed
-- in a script anywhere; a real stranger's compose volume has no such history.
--
-- This creates the second database and grants the same app user access to it,
-- so the documented commands work verbatim from a clean `docker compose up -d
-- db`. It has no effect on an existing volume — MySQL only runs
-- docker-entrypoint-initdb.d scripts the first time a data directory is
-- initialized — so an existing checkout needs one manual statement, which the
-- docs now give directly.
CREATE DATABASE IF NOT EXISTS `alice_chains_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- `MYSQL_USER`'s automatic grant covers only `MYSQL_DATABASE`; without this the
-- database exists but the app's own user cannot reach it.
GRANT ALL PRIVILEGES ON `alice_chains_test`.* TO 'alice'@'%';
FLUSH PRIVILEGES;
