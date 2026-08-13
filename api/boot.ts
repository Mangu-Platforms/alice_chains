import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serve } from "@hono/node-server";
import type { HttpBindings } from "@hono/node-server";
import type { Server as HttpServer } from "http";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { initSocket } from "./socket";
import { API_PORT, DEFAULT_PROD_PORT } from "@contracts/constants";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.get("/api/logout", () => new Response(null, {
  status: 302,
  headers: { Location: "/login", "Set-Cookie": "alice_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" },
}));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

/**
 * Server bootstrap.
 *
 * Production: one process serves the built client (dist/public) *and* the API
 * on PORT (default 3000).
 *
 * Development: Vite owns the client on :3000 and proxies /api and /socket.io to
 * this process on API_PORT (default 3001). Previously this block was gated on
 * NODE_ENV === "production", so `npm run dev` started an API that never bound a
 * port and every proxied request failed with ECONNREFUSED.
 *
 * Tests never bind a port.
 */
if (env.NODE_ENV !== "test") {
  const isProd = env.NODE_ENV === "production";

  if (isProd) {
    const { serveStaticFiles } = await import("./lib/vite");
    serveStaticFiles(app);
  }

  // Use the validated env object rather than raw process.env so the Zod schema
  // is the single source of truth. DEFAULT_PROD_PORT/API_PORT are the contract
  // defaults; env.PORT/env.API_PORT carry the schema defaults.
  const port = isProd
    ? parseInt(env.PORT || String(DEFAULT_PROD_PORT), 10)
    : parseInt(env.API_PORT || String(API_PORT), 10);

  // @hono/node-server returns a real Node http.Server, which Socket.IO attaches
  // to. The previous implementation hand-rolled createServer() and passed Node's
  // IncomingMessage directly into app.fetch() as if it were a fetch Request,
  // which is not a valid conversion.
  const server = serve({ fetch: app.fetch, port }, (info) => {
    const what = isProd ? "Alice Chains" : "Alice Chains API";
    console.log(`${what} listening on http://localhost:${info.port}/`);
    if (!isProd) {
      console.log("Client dev server: http://localhost:3000/ (vite)");
    }
  });

  initSocket(server as unknown as HttpServer);
}
