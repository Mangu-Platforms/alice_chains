import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  VITE_KIMI_AUTH_URL: z.string().url(),
  VITE_APP_ID: z.string().min(1),
  APP_SECRET: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  OWNER_UNION_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";

export function getPort() {
  return parseInt(env.PORT, 10);
}

export function getOwnerUnionId() {
  return env.OWNER_UNION_ID;
}
