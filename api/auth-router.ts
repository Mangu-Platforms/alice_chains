import { createRouter, authedQuery } from "./middleware";

export const authRouter = createRouter({
  me: authedQuery.query(({ ctx }) => ctx.user),
});
