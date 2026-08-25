/**
 * BUILD_PLAN S-15 — observability and transport hardening.
 *
 * Cases: TC-REG-15, TC-REG-17, TC-REG-20.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { increment, observe, render, resetMetrics, timed } from "./lib/metrics";
import { redact } from "./lib/logger";
import { allowedOrigins } from "./lib/env";
import { anonymous } from "../test/support/http";
import { describeIntegration, resetDatabase } from "../test/support/db";

// ── Redaction ─────────────────────────────────────────────────────────────

describe("log redaction (S-15)", () => {
  it("never lets a secret through, whatever it is called", () => {
    const redacted = redact({
      jwtSecret: "super-secret",
      accessToken: "abc123",
      password: "hunter2",
      cookie: "alice_session=xyz",
      authorization: "vapid t=...",
      p256dh: "key-material",
      apiKey: "k",
      credentials: "c",
    }) as Record<string, string>;

    for (const value of Object.values(redacted)) {
      expect(value).toBe("[redacted]");
    }
  });

  it("never logs message content", () => {
    const redacted = redact({
      content: "a private message",
      body: "another",
      message: "and another",
      email: "someone@example.test",
    }) as Record<string, string>;

    expect(JSON.stringify(redacted)).not.toContain("private message");
    expect(JSON.stringify(redacted)).not.toContain("example.test");
  });

  it("keeps the fields that make a log useful", () => {
    expect(
      redact({ requestId: "r1", userId: 7, status: 200, durationMs: 12, route: "/api/x" })
    ).toEqual({ requestId: "r1", userId: 7, status: 200, durationMs: 12, route: "/api/x" });
  });

  it("redacts inside nested structures", () => {
    const redacted = redact({ outer: { inner: { password: "p", id: 1 } } }) as never;
    expect(JSON.stringify(redacted)).not.toContain('"p"');
    expect(JSON.stringify(redacted)).toContain('"id":1');
  });

  it("bounds long strings, big arrays and deep objects", () => {
    expect(String(redact("x".repeat(1000)))).toContain("[truncated]");
    expect((redact(Array.from({ length: 100 }, (_, i) => i)) as unknown[]).length).toBe(21);

    let deep: Record<string, unknown> = { id: 1 };
    for (let i = 0; i < 12; i += 1) deep = { nested: deep };
    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
  });

  it("keeps an Error readable rather than serialising it to {}", () => {
    const result = redact(new Error("boom")) as { name: string; message: string };
    expect(result.name).toBe("Error");
    expect(result.message).toBe("boom");
  });
});

// ── Metrics ───────────────────────────────────────────────────────────────

describe("RED metrics (S-15)", () => {
  beforeEach(() => resetMetrics());

  it("counts and renders in Prometheus format", () => {
    increment("http_requests_total", { method: "GET", route: "/healthz", status: "200" });
    increment("http_requests_total", { method: "GET", route: "/healthz", status: "200" });

    expect(render()).toContain(
      'http_requests_total{method="GET",route="/healthz",status="200"} 2'
    );
  });

  it("renders a histogram with cumulative buckets, a sum and a count", () => {
    observe("http_request_duration_seconds", 30, { route: "/a" });
    observe("http_request_duration_seconds", 300, { route: "/a" });

    const output = render();
    // 30ms falls in the 50ms bucket and every larger one; 300ms only in 500ms up.
    expect(output).toContain('http_request_duration_seconds_bucket{route="/a",le="0.05"} 1');
    expect(output).toContain('http_request_duration_seconds_bucket{route="/a",le="0.5"} 2');
    expect(output).toContain('http_request_duration_seconds_bucket{route="/a",le="+Inf"} 2');
    expect(output).toContain('http_request_duration_seconds_count{route="/a"} 2');
  });

  it("labels a failure as an error and lets it propagate", async () => {
    await expect(
      timed("op_duration_seconds", { op: "x" }, async () => {
        throw new Error("nope");
      })
    ).rejects.toThrow("nope");

    expect(render()).toContain('outcome="error"');
  });

  it("escapes label values so one cannot break the format", () => {
    increment("weird_total", { label: 'has "quotes" and \\ backslash' });
    expect(render()).toContain('has \\"quotes\\" and \\\\ backslash');
  });
});

// ── Configuration ─────────────────────────────────────────────────────────

describe("the origin allowlist (S-15)", () => {
  it("falls back to the canonical public origin", () => {
    // test/setup.ts sets PUBLIC_BASE_URL.
    expect(allowedOrigins()).toContain("http://localhost:3000");
  });
});

// ── The endpoints ─────────────────────────────────────────────────────────

describeIntegration("health, metrics and headers (S-15)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  // TC-REG-17
  it("answers liveness without touching the database", async () => {
    const res = await anonymous().raw("/healthz");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("answers readiness only after reaching the database", async () => {
    const res = await anonymous().raw("/readyz");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; database: { ok: boolean } };
    expect(body.status).toBe("ready");
    expect(body.database.ok).toBe(true);
  });

  it("needs no session for either probe", async () => {
    expect((await anonymous().raw("/healthz")).status).toBe(200);
    expect((await anonymous().raw("/readyz")).status).toBe(200);
  });

  // TC-REG-20
  it("sets the security headers on every response", async () => {
    const res = await anonymous().raw("/healthz");

    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");

    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // No inline script: the bundle is the only script that should run.
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("does not send HSTS over plain http, which would lock a dev host out", async () => {
    expect((await anonymous().raw("/healthz")).headers.get("strict-transport-security")).toBeNull();
  });

  it("echoes a request id, and mints one when the caller sends none", async () => {
    const supplied = await anonymous().raw("/healthz", {
      headers: { "x-request-id": "trace-me-123" },
    });
    expect(supplied.headers.get("x-request-id")).toBe("trace-me-123");

    const minted = await anonymous().raw("/healthz");
    expect(minted.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("records the request it just served", async () => {
    resetMetrics();
    await anonymous().raw("/healthz");

    const output = render();
    expect(output).toContain("http_requests_total");
    expect(output).toContain("http_request_duration_seconds_count");
  });

  it("serves metrics in the format a scraper expects", async () => {
    const res = await anonymous().raw("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
  });
});
