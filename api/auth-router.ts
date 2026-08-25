import { createRouter, authedQuery } from "./middleware";

export const authRouter = createRouter({
  /**
   * S-18. Narrowed from the whole user row.
   *
   * It returned `unionId` — the provider's identifier for the member, which is
   * what an OAuth flow keys on — along with `role` and every timestamp. None of
   * that is needed to render the app, and `unionId` in particular has no
   * business leaving the server.
   */
  me: authedQuery.query(({ ctx }) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    avatar: ctx.user.avatar,
    status: ctx.user.status,
    // Not the role itself: whether the account may see administrative controls
    // is all the client needs, and it is re-checked on every call anyway.
    isAdmin: ctx.user.role === "admin",
  })),
});
