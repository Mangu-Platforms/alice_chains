import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@db/schema";
import { env } from "../lib/env";

const pool = mysql.createPool(env.DATABASE_URL);
const db = drizzle(pool, { schema, mode: "default" });

export function getDb() {
  return db;
}
