import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit configuration.
 *
 * Canonical schema workflow:
 *   npm run db:generate   # emit a versioned SQL migration into db/migrations
 *   npm run db:migrate    # apply pending migrations (use this in CI and prod)
 *   npm run db:push       # scratch-only: sync schema without a migration file
 */
export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
} satisfies Config;
