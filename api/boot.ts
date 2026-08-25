import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serve } from "@hono/node-server";
import type { HttpBindings } from "@hono/node-server";
import type { Server as HttpServer } from "http";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { secureHeaders } from "hono/secure-headers";
import { sql } from "drizzle-orm";
import { env, isProduction } from "./lib/env";
import { log, requestId } from "./lib/logger";
import { increment, observe, render } from "./lib/metrics";
import { getDb } from "./queries/connection";
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

/**
 * S-15 · security headers on every response.
 *
 * The app shipped none. `frameAncestors: none` is what stops it being framed
 * for clickjacking; `nosniff` stops an attachment being re-interpreted as
 * something executable; and the referrer policy stops a conversation id
 * leaking to every link a member follows out of a message.
 *
 * The CSP allows inline styles because Tailwind emits them, but no inline
 * script — the bundle is the only script that runs. `connect-src` includes
 * ws/wss for the socket.
 */
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    // Only meaningful over TLS, and actively harmful on a plain-http
    // development host, where a browser would refuse to reach it again.
    strictTransportSecurity: isProduction
      ? "max-age=31536000; includeSubDomains"
      : false,
    xContentTypeOptions: "nosniff",
    xFrameOptions: "DENY",
    referrerPolicy: "strict-origin-when-cross-origin",
    crossOriginOpenerPolicy: "same-origin",
    xDnsPrefetchControl: false,
    xDownloadOptions: false,
    xPermittedCrossDomainPolicies: false,
  })
);

/**
 * S-15 / P-TOOL-4 · a request id and one structured line per request.
 *
 * The id is taken from the inbound `x-request-id` when a proxy set one, so a
 * trace spans the whole hop, and echoed back so a member can quote it in a bug
 * report. Method, path, status and duration are recorded; nothing from the
 * body or the query string is, because those carry message content.
 */
app.use("*", async (c, next) => {
  const id = requestId(c.req.raw.headers);
  const started = performance.now();

  await next();

  const durationMs = performance.now() - started;
  // The route pattern, not the URL: `/api/trpc/message.send` is a useful
  // metric label, whereas a path with ids in it is unbounded cardinality.
  const route = c.req.routePath ?? "unmatched";

  increment("http_requests_total", {
    method: c.req.method,
    route,
    status: String(c.res.status),
  });
  observe("http_request_duration_seconds", durationMs, { method: c.req.method, route });

  c.res.headers.set("x-request-id", id);

  log[c.res.status >= 500 ? "error" : "info"]("request", {
    requestId: id,
    method: c.req.method,
    route,
    status: c.res.status,
    durationMs: Math.round(durationMs),
  });
});

/**
 * S-15 / P-TOOL-3 · liveness. Answers if the process is running, and asks
 * nothing else — a liveness probe that depends on the database restarts the
 * app during a database outage, which helps nobody.
 */
app.get("/healthz", (c) => c.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) }));

/**
 * Readiness. Touches MySQL, because "ready" means ready to serve requests and
 * every request this app answers needs the database. A load balancer should
 * take this instance out of rotation when it cannot.
 */
app.get("/readyz", async (c) => {
  const started = performance.now();
  try {
    await getDb().execute(sql`SELECT 1`);
    return c.json({
      status: "ready",
      database: { ok: true, latencyMs: Math.round(performance.now() - started) },
    });
  } catch (error) {
    log.error("readiness check failed", { error });
    return c.json({ status: "not_ready", database: { ok: false } }, 503);
  }
});

/**
 * Metrics, in Prometheus text format. Not exposed publicly in a real
 * deployment — bind it to an internal interface or put it behind the proxy.
 */
app.get("/metrics", (c) =>
  c.text(render(), 200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" })
);

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
    log.info("listening", {
      port: info.port,
      mode: isProd ? "production" : "development",
      storageDriver: env.STORAGE_DRIVER,
      pushEnabled: Boolean(env.VAPID_PUBLIC_KEY),
      clientDevServer: isProd ? undefined : "http://localhost:3000/",
    });
  });

  initSocket(server as unknown as HttpServer);
}
