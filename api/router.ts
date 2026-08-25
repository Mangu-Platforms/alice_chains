import { authRouter } from "./auth-router";
import { conversationRouter } from "./conversation-router";
import { messageRouter } from "./message-router";
import { contactRouter } from "./contact-router";
import { attachmentRouter } from "./attachment-router";
import { pushRouter } from "./push-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  conversation: conversationRouter,
  message: messageRouter,
  contact: contactRouter,
  attachment: attachmentRouter,
  push: pushRouter,
});

export type AppRouter = typeof appRouter;
