import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { initSocket } from "./socket";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.get("/api/logout", (c) => new Response(null, {
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

if (env.NODE_ENV === "production") {
  const { serveStaticFiles } = await import("./lib/vite");
  const { createServer } = await import("http");

  // Create HTTP server manually for Socket.IO compatibility
  const server = createServer((req, res) => {
    Promise.resolve(app.fetch(req as unknown as Request))
      .then((response: Response) => {
        if (!response) {
          res.statusCode = 404;
          res.end("Not Found");
          return;
        }
        res.statusCode = response.status;
        response.headers.forEach((value: string, key: string) => {
          res.setHeader(key, value);
        });
        return response.arrayBuffer();
      })
      .then((buffer: ArrayBuffer | undefined) => {
        if (buffer) {
          res.end(Buffer.from(buffer));
        }
      })
      .catch((err: Error) => {
        console.error(err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      });
  });

  // Initialize Socket.IO
  initSocket(server);

  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
