import { eq } from "drizzle-orm";
import { users, type InsertUser } from "@db/schema";
import { getDb } from "./connection";
import { getOwnerUnionId } from "../lib/env";

export async function findUserByUnionId(unionId: string) {
  const [user] = await getDb().select().from(users).where(eq(users.unionId, unionId)).limit(1);
  return user;
}

export async function upsertUser(user: Pick<InsertUser, "unionId" | "name" | "email" | "avatar">) {
  // S-18. `OWNER_UNION_ID` was parsed into the env schema and exposed by
  // `getOwnerUnionId()`, which had zero call sites — so `users.role` was never
  // written as anything but its default and no administrator could exist. This
  // is the one place a role is decided, and it is decided from configuration
  // rather than from anything a member can influence.
  const owner = getOwnerUnionId();
  const role = owner && user.unionId === owner ? "admin" : "user";

  await getDb()
    .insert(users)
    .values({ ...user, role })
    .onDuplicateKeyUpdate({
      set: {
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        lastSignInAt: new Date(),
        // Re-asserted on every sign-in, so changing OWNER_UNION_ID moves the
        // administrator rather than adding a second one.
        role,
      },
    });
}
