import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serve } from "@hono/node-server";
import type { HttpBindings } from "@hono/node-server";
import type { Server as HttpServer } from "http";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { clearSessionCookie, parseSessionToken } from "./lib/cookies";
import { decodeSessionToken, revokeSession } from "./kimi/session";
import { createOAuthCallbackHandler, createOAuthLoginHandler } from "./kimi/auth";
import { OAUTH_CALLBACK_PATH, OAUTH_LOGIN_PATH } from "@contracts/oauth";
import { initSocket } from "./socket";
import { consume, Limits, startRateLimitSweep } from "./lib/rate-limit";
import { Readable } from "node:stream";
import {
  readLocalObject,
  verifyStorageToken,
  writeLocalObject,
} from "./lib/storage/local";
import { sanitizeFileName } from "./lib/storage";
import { MAX_ATTACHMENT_BYTES } from "@contracts/attachments";
import { MAX_JSON_BODY_BYTES } from "@contracts/constants";
import { API_PORT, DEFAULT_PROD_PORT } from "@contracts/constants";

const app = new Hono<{ Bindings: HttpBindings }>();

// SEC-C-20. Was 50 MB, which let any request buffer 50 MB of memory before a
// single handler ran. No JSON endpoint this app serves needs more than a few
// kilobytes; attachments bypass this entirely by going straight to storage,
// and their own upload endpoint has its own cap.
app.use("/api/trpc/*", bodyLimit({ maxSize: MAX_JSON_BODY_BYTES }));
app.use("/api/files/upload", bodyLimit({ maxSize: MAX_ATTACHMENT_BYTES }));
/**
 * S-13. The unauthenticated paths are keyed by IP, because there is no session
 * yet. `X-Forwarded-For` is honoured only when a proxy is configured, since a
 * client can set it freely and would otherwise choose its own bucket.
 */
function clientAddress(c: { req: { raw: Request; header: (n: string) => string | undefined } }) {
  if (env.TRUST_PROXY) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
  }
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

function tooManyRequests(retryAfterMs: number) {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
    },
  });
}

app.get(OAUTH_LOGIN_PATH, (c) => {
  const limit = consume("oauth.login", clientAddress(c), Limits.oauthLogin);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);
  return createOAuthLoginHandler()(c);
});
app.get(OAUTH_CALLBACK_PATH, async (c) => {
  const limit = consume("oauth.callback", clientAddress(c), Limits.oauthCallback);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);
  return createOAuthCallbackHandler()(c);
});
/**
 * Logout revokes the server-side session BEFORE clearing the cookie, so a copy
 * of the cookie taken beforehand is dead everywhere — not merely absent from
 * this browser, which is all the previous implementation achieved.
 */
app.get("/api/logout", async (c) => {
  const headers = c.req.raw.headers;
  const token = parseSessionToken(headers);
  if (token) {
    const session = decodeSessionToken(token);
    if (session?.sid) await revokeSession(session.sid);
  }

  const responseHeaders = new Headers({ Location: "/login" });
  for (const cookie of clearSessionCookie(headers)) {
    responseHeaders.append("Set-Cookie", cookie);
  }
  return new Response(null, { status: 302, headers: responseHeaders });
});
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
/**
 * F-4 · the local storage driver's upload and download endpoints.
 *
 * These exist only for `STORAGE_DRIVER=local`. With `s3` the client PUTs and
 * GETs the object store directly and never reaches this process, which is the
 * point of presigned URLs — the bytes do not pass through Node either way.
 *
 * Authorization here is the signed token, not the session: the token pins the
 * key, the declared type, the declared size and an expiry, and was issued by a
 * procedure that already checked conversation membership. That is the same
 * bearer model a presigned S3 URL uses.
 */
app.put("/api/files/upload", async (c) => {
  const claims = verifyStorageToken(c.req.query("token") ?? "", "put");
  if (!claims) return c.json({ error: "Invalid or expired upload token" }, 403);

  const declaredType = c.req.header("content-type")?.split(";")[0]?.trim();
  if (declaredType !== claims.mimeType) {
    return c.json({ error: "Content-Type does not match the upload token" }, 400);
  }

  const body = Buffer.from(await c.req.raw.arrayBuffer());

  // The token's size is what the upload was authorized for. A client that
  // declares 1 KB and sends 100 MB is refused here, before anything is written.
  if (body.byteLength > claims.byteSize || body.byteLength > MAX_ATTACHMENT_BYTES) {
    return c.json({ error: "Upload is larger than declared" }, 413);
  }

  await writeLocalObject(claims.key, body);
  return c.json({ ok: true, byteSize: body.byteLength });
});

app.get("/api/files/download", async (c) => {
  const claims = verifyStorageToken(c.req.query("token") ?? "", "get");
  if (!claims) return c.json({ error: "Invalid or expired link" }, 403);

  const fileName = sanitizeFileName(c.req.query("name") ?? "file");
  const disposition = c.req.query("disposition") === "inline" ? "inline" : "attachment";

  try {
    const stream = readLocalObject(claims.key);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        // The recorded type, never one derived from the stored bytes or from a
        // client-supplied name.
        "Content-Type": claims.mimeType,
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        // Uploaded content is served from the app's own origin, so it is
        // sandboxed as tightly as a download can be.
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return c.json({ error: "Not Found" }, 404);
  }
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
  startRateLimitSweep();

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
