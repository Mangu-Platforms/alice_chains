import { eq } from "drizzle-orm";
import { users, type InsertUser } from "@db/schema";
import { getDb } from "./connection";

export async function findUserByUnionId(unionId: string) {
  const [user] = await getDb().select().from(users).where(eq(users.unionId, unionId)).limit(1);
  return user;
}

export async function upsertUser(user: Pick<InsertUser, "unionId" | "name" | "email" | "avatar">) {
  await getDb().insert(users).values(user).onDuplicateKeyUpdate({
    set: { name: user.name, email: user.email, avatar: user.avatar, lastSignInAt: new Date() },
  });
}
