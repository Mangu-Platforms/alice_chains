/**
 * BUILD_PLAN S-4 — OAuth coherence, `state`, PKCE, and the redirect_uri
 * mismatch.
 *
 * Cases: TC-AUTH-17, TC-AUTH-21, TC-AUTH-27…TC-AUTH-33.
 *
 * These run against a mocked `fetch`, so no live provider is required — the
 * live round trip is documented in SETUP.md as the one manual step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertBareOrigin,
  InvalidOriginError,
  oauthEndpoints,
  oauthRedirectUri,
  OAuthCookies,
} from "@contracts/oauth";
import { createOAuthAttempt, deriveCodeChallenge, safeEqual } from "./pkce";
import { createOAuthCallbackHandler, createOAuthLoginHandler } from "./auth";

const AUTH_ORIGIN = "https://auth.example.com";
const PUBLIC_ORIGIN = "http://localhost:3000";

/** Minimal stand-in for the Hono context the handlers actually use. */
function ctx(url: string, headers: Record<string, string> = {}) {
  return {
    req: { raw: new Request(url, { headers }) },
    json: (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  };
}

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

function cookieValue(res: Response, name: string): string | undefined {
  const header = setCookies(res).find((c) => c.startsWith(`${name}=`));
  if (!header) return undefined;
  const value = header.slice(name.length + 1).split(";")[0];
  return value === "" ? undefined : value;
}

// ─── The endpoint contract ────────────────────────────────────────────────

describe("the OAuth endpoint contract (S-4)", () => {
  // TC-AUTH-27 — the shipped sample used to be a full authorize URL.
  it("refuses a base that carries a path", () => {
    expect(() => assertBareOrigin("https://auth.example.com/oauth/authorize", "X")).toThrow(
      InvalidOriginError
    );
  });

  it("names the corrected value in the refusal", () => {
    expect(() => assertBareOrigin("https://auth.example.com/oauth/authorize", "X")).toThrow(
      /Use "https:\/\/auth\.example\.com"/
    );
  });

  it("refuses a base with a query or a fragment", () => {
    expect(() => assertBareOrigin("https://a.example?x=1", "X")).toThrow(InvalidOriginError);
    expect(() => assertBareOrigin("https://a.example#f", "X")).toThrow(InvalidOriginError);
  });

  it("refuses a non-http scheme and a non-URL", () => {
    expect(() => assertBareOrigin("ftp://a.example", "X")).toThrow(InvalidOriginError);
    expect(() => assertBareOrigin("not a url", "X")).toThrow(InvalidOriginError);
  });

  it("accepts a bare origin with or without a trailing slash", () => {
    expect(assertBareOrigin("https://a.example", "X")).toBe("https://a.example");
    expect(assertBareOrigin("https://a.example/", "X")).toBe("https://a.example");
    expect(assertBareOrigin("http://localhost:3000", "X")).toBe("http://localhost:3000");
  });

  // TC-AUTH-28 — every endpoint derives from the one origin.
  it("derives all three provider endpoints from one origin", () => {
    expect(oauthEndpoints(AUTH_ORIGIN)).toEqual({
      authorizeUrl: "https://auth.example.com/oauth/authorize",
      tokenUrl: "https://auth.example.com/api/oauth/token",
      userinfoUrl: "https://auth.example.com/api/oauth/userinfo",
    });
  });

  it("builds the redirect_uri from the canonical public origin", () => {
    expect(oauthRedirectUri(PUBLIC_ORIGIN)).toBe("http://localhost:3000/api/oauth/callback");
  });
});

// ─── PKCE ─────────────────────────────────────────────────────────────────

describe("PKCE (S-4)", () => {
  it("derives an S256 challenge from the verifier", () => {
    // The RFC 7636 appendix B test vector.
    expect(deriveCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
  });

  it("issues a fresh state and verifier per attempt", () => {
    const a = createOAuthAttempt();
    const b = createOAuthAttempt();
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).toBe(deriveCodeChallenge(a.codeVerifier));
    expect(a.codeVerifier).toHaveLength(43);
  });

  it("compares in constant time without throwing on a length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual(undefined, "abc")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
  });
});

// ─── GET /api/oauth/login ─────────────────────────────────────────────────

describe("GET /api/oauth/login (S-4)", () => {
  const login = createOAuthLoginHandler();

  // TC-AUTH-29
  it("redirects to the provider with state and an S256 challenge", () => {
    const res = login(ctx("http://localhost:3001/api/oauth/login"));

    expect(res.status).toBe(302);
    const target = new URL(res.headers.get("Location")!);
    expect(target.origin + target.pathname).toBe("https://auth.example.com/oauth/authorize");
    expect(target.searchParams.get("response_type")).toBe("code");
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(target.searchParams.get("state")).toBeTruthy();
    expect(target.searchParams.get("code_challenge")).toBeTruthy();
  });

  // TC-AUTH-30 — the redirect_uri mismatch. The request arrives on :3001
  // behind the dev proxy; the browser used :3000.
  it("sends the canonical origin as redirect_uri, not the inbound one", () => {
    const res = login(ctx("http://localhost:3001/api/oauth/login"));
    const target = new URL(res.headers.get("Location")!);

    expect(target.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/oauth/callback"
    );
  });

  // TC-AUTH-31 — the verifier must never reach the page.
  it("keeps the verifier in an HttpOnly cookie and the challenge in the URL", () => {
    const res = login(ctx("http://localhost:3001/api/oauth/login"));
    const target = new URL(res.headers.get("Location")!);

    const verifier = cookieValue(res, OAuthCookies.verifier)!;
    expect(verifier).toBeTruthy();
    expect(target.searchParams.get("code_challenge")).toBe(deriveCodeChallenge(verifier));
    expect(target.toString()).not.toContain(verifier);

    for (const header of setCookies(res)) {
      expect(header).toContain("HttpOnly");
      expect(header).toContain("SameSite=Lax");
    }
  });

  it("binds the state in the URL to the state in the cookie", () => {
    const res = login(ctx("http://localhost:3001/api/oauth/login"));
    const target = new URL(res.headers.get("Location")!);

    expect(cookieValue(res, OAuthCookies.state)).toBe(target.searchParams.get("state"));
  });
});

// ─── GET /api/oauth/callback ──────────────────────────────────────────────

describe("GET /api/oauth/callback (S-4)", () => {
  const login = createOAuthLoginHandler();
  const callback = createOAuthCallbackHandler();

  /** Run the login leg and return the cookie header the browser would send. */
  function startAttempt() {
    const res = login(ctx("http://localhost:3001/api/oauth/login"));
    const target = new URL(res.headers.get("Location")!);
    const state = cookieValue(res, OAuthCookies.state)!;
    const verifier = cookieValue(res, OAuthCookies.verifier)!;
    return {
      state,
      verifier,
      challenge: target.searchParams.get("code_challenge")!,
      cookie: `${OAuthCookies.state}=${state}; ${OAuthCookies.verifier}=${verifier}`,
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TC-AUTH-32 — CSRF.
  it("rejects a callback with no state", async () => {
    const attempt = startAttempt();
    const res = await callback(
      ctx("http://localhost:3001/api/oauth/callback?code=abc", { cookie: attempt.cookie })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid or missing state" });
  });

  it("rejects a callback whose state does not match the cookie", async () => {
    const attempt = startAttempt();
    const res = await callback(
      ctx("http://localhost:3001/api/oauth/callback?code=abc&state=forged", {
        cookie: attempt.cookie,
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects a callback with a state but no cookie at all", async () => {
    const res = await callback(
      ctx("http://localhost:3001/api/oauth/callback?code=abc&state=anything")
    );

    expect(res.status).toBe(400);
  });

  it("rejects a callback with no code before anything else", async () => {
    const res = await callback(ctx("http://localhost:3001/api/oauth/callback"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Missing authorization code" });
  });

  // TC-AUTH-33 — both legs must send an identical redirect_uri, and the
  // verifier must accompany the exchange.
  it("exchanges with the verifier and the same redirect_uri as the authorize leg", async () => {
    const attempt = startAttempt();
    const calls: { url: string; body?: unknown }[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url.endsWith("/api/oauth/token")) {
          return new Response(JSON.stringify({ access_token: "at" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ unionId: "union-oauth", name: "Alice", email: "a@example.test" }),
          { status: 200 }
        );
      })
    );

    const res = await callback(
      ctx(`http://localhost:3001/api/oauth/callback?code=abc&state=${attempt.state}`, {
        cookie: attempt.cookie,
      })
    );

    const token = calls.find((c) => c.url.endsWith("/api/oauth/token"))!;
    expect(token.url).toBe("https://auth.example.com/api/oauth/token");
    expect(token.body).toMatchObject({
      code: "abc",
      grant_type: "authorization_code",
      code_verifier: attempt.verifier,
      redirect_uri: "http://localhost:3000/api/oauth/callback",
    });
    expect(deriveCodeChallenge(attempt.verifier)).toBe(attempt.challenge);

    expect(calls.some((c) => c.url.endsWith("/api/oauth/userinfo"))).toBe(true);
    // The DB write fails without a test database; the exchange itself is what
    // this case proves, so any non-redirect outcome after it is acceptable.
    expect([302, 500]).toContain(res.status);
  });

  it("never sends the client secret to the userinfo endpoint", async () => {
    const attempt = startAttempt();
    const calls: { url: string; body?: string }[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        calls.push({ url: String(input), body: init?.body ? String(init.body) : undefined });
        return new Response(JSON.stringify({ access_token: "at", unionId: "u" }), {
          status: 200,
        });
      })
    );

    await callback(
      ctx(`http://localhost:3001/api/oauth/callback?code=abc&state=${attempt.state}`, {
        cookie: attempt.cookie,
      })
    );

    const userinfo = calls.find((c) => c.url.endsWith("/api/oauth/userinfo"))!;
    expect(userinfo.body).toBeUndefined();
  });

  // TC-AUTH-21 — the attempt is single-use whatever the outcome.
  it("expires both attempt cookies on a rejected callback", async () => {
    const attempt = startAttempt();
    const res = await callback(
      ctx("http://localhost:3001/api/oauth/callback?code=abc&state=wrong", {
        cookie: attempt.cookie,
      })
    );

    const headers = setCookies(res);
    expect(headers.some((h) => h.startsWith(`${OAuthCookies.state}=;`))).toBe(true);
    expect(headers.some((h) => h.startsWith(`${OAuthCookies.verifier}=;`))).toBe(true);
  });

  it("surfaces a failed token exchange as a 400, not a redirect", async () => {
    const attempt = startAttempt();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));

    const res = await callback(
      ctx(`http://localhost:3001/api/oauth/callback?code=abc&state=${attempt.state}`, {
        cookie: attempt.cookie,
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Failed to exchange code" });
  });
});
