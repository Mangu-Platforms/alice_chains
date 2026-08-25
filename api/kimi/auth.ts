import { getSessionToken, startSession, verifySessionToken } from "./session";
import { findUserByUnionId, upsertUser } from "../queries/users";
import { createOAuthAttempt, safeEqual } from "./pkce";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import {
  clearOAuthCookie,
  readCookie,
  serializeOAuthCookie,
  serializeSessionCookie,
} from "../lib/cookies";
import {
  OAuthCookies,
  oauthEndpoints,
  oauthRedirectUri,
} from "@contracts/oauth";

export async function authenticateRequest(headers: Headers) {
  const sessionToken = getSessionToken(headers);
  if (!sessionToken) {
    return undefined;
  }

  try {
    const sessionData = await verifySessionToken(sessionToken);

    if (sessionData?.unionId) {
      const user = await findUserByUnionId(sessionData.unionId);
      return user || undefined;
    }
  } catch {
    // Invalid token
  }

  return undefined;
}

/**
 * The canonical public origin.
 *
 * `PUBLIC_BASE_URL` when set — it is the only value that is correct behind a
 * proxy. Otherwise the inbound origin, which is right for a direct single-port
 * deployment and wrong behind the dev proxy; that is why `.env.example` sets
 * it and SETUP.md explains why.
 */
function publicBaseUrl(requestUrl: URL): string {
  return env.PUBLIC_BASE_URL ?? requestUrl.origin;
}

type HonoLike = {
  req: { raw: Request };
  json: (data: unknown, status?: number) => Response;
};

/**
 * `GET /api/oauth/login` — start a sign-in.
 *
 * The authorize URL is built here rather than in `Login.tsx` because PKCE
 * requires the `code_verifier` to be kept from the page, and only the server
 * can set an HttpOnly cookie. The client just follows a link.
 */
export function createOAuthLoginHandler() {
  return (c: HonoLike) => {
    const requestUrl = new URL(c.req.raw.url);
    const headers = c.req.raw.headers;

    let authorizeUrl: URL;
    let redirectUri: string;
    try {
      authorizeUrl = new URL(oauthEndpoints(env.VITE_KIMI_AUTH_URL).authorizeUrl);
      redirectUri = oauthRedirectUri(publicBaseUrl(requestUrl));
    } catch (error) {
      // A misconfigured origin is an operator error, not a user error. Say so
      // plainly in the log and give the browser nothing to act on.
      log.error("OAuth configuration is invalid", { error });
      return c.json({ error: "OAuth is not configured correctly" }, 500);
    }

    const attempt = createOAuthAttempt();

    authorizeUrl.searchParams.set("client_id", env.VITE_APP_ID);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", attempt.state);
    authorizeUrl.searchParams.set("code_challenge", attempt.codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const responseHeaders = new Headers({ Location: authorizeUrl.toString() });
    responseHeaders.append(
      "Set-Cookie",
      serializeOAuthCookie(OAuthCookies.state, attempt.state, headers)
    );
    responseHeaders.append(
      "Set-Cookie",
      serializeOAuthCookie(OAuthCookies.verifier, attempt.codeVerifier, headers)
    );

    return new Response(null, { status: 302, headers: responseHeaders });
  };
}

export function createOAuthCallbackHandler() {
  return async (c: HonoLike) => {
    const url = new URL(c.req.raw.url);
    const headers = c.req.raw.headers;
    const code = url.searchParams.get("code");

    // Cookies from the attempt are single-use whatever the outcome, so a failed
    // attempt cannot be retried with the same state.
    const expiredCookies = [
      clearOAuthCookie(OAuthCookies.state, headers),
      clearOAuthCookie(OAuthCookies.verifier, headers),
    ];
    const fail = (message: string, status: number) => {
      const responseHeaders = new Headers({ "Content-Type": "application/json" });
      for (const cookie of expiredCookies) responseHeaders.append("Set-Cookie", cookie);
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: responseHeaders,
      });
    };

    if (!code) {
      return fail("Missing authorization code", 400);
    }

    // CSRF. Without this an attacker can complete a flow of their own choosing
    // in the victim's browser and bind the victim's session to their account.
    const suppliedState = url.searchParams.get("state");
    const expectedState = readCookie(headers, OAuthCookies.state);
    if (!safeEqual(suppliedState ?? undefined, expectedState)) {
      return fail("Invalid or missing state", 400);
    }

    const codeVerifier = readCookie(headers, OAuthCookies.verifier);
    if (!codeVerifier) {
      return fail("Missing PKCE verifier", 400);
    }

    let endpoints;
    let redirectUri: string;
    try {
      endpoints = oauthEndpoints(env.VITE_KIMI_AUTH_URL);
      redirectUri = oauthRedirectUri(publicBaseUrl(url));
    } catch (error) {
      log.error("OAuth configuration is invalid", { error });
      return fail("OAuth is not configured correctly", 500);
    }

    try {
      // The same `redirect_uri` the authorize leg sent, byte for byte. It comes
      // from the canonical origin, not from `url.origin` — behind the dev proxy
      // the inbound origin is :3001 and the browser used :3000.
      const tokenResponse = await fetch(endpoints.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          client_id: env.VITE_APP_ID,
          client_secret: env.APP_SECRET,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });

      if (!tokenResponse.ok) {
        return fail("Failed to exchange code", 400);
      }

      const tokenData = await tokenResponse.json();

      const userResponse = await fetch(endpoints.userinfoUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userResponse.ok) {
        return fail("Failed to get user info", 400);
      }

      const userData = await userResponse.json();
      const unionId = userData.unionId || userData.id;
      if (!unionId) {
        return fail("Provider returned no user identifier", 400);
      }

      await upsertUser({
        unionId,
        name: userData.name || userData.nickname || "User",
        email: userData.email || null,
        avatar: userData.avatar || null,
      });

      const user = await findUserByUnionId(unionId);
      if (!user) {
        return fail("Failed to create user", 500);
      }

      // A fresh session row, and therefore a fresh `sid`, on every sign-in:
      // signing in again never revives a token that was revoked.
      const sessionToken = await startSession(
        {
          userId: user.id,
          unionId: user.unionId,
          name: user.name || "User",
          email: user.email || undefined,
        },
        { userAgent: headers.get("user-agent") }
      );

      const responseHeaders = new Headers({ Location: "/" });
      for (const cookie of expiredCookies) responseHeaders.append("Set-Cookie", cookie);
      responseHeaders.append("Set-Cookie", serializeSessionCookie(sessionToken, headers));

      return new Response(null, { status: 302, headers: responseHeaders });
    } catch (error) {
      log.error("OAuth callback failed", { error });
      return fail("Authentication failed", 500);
    }
  };
}
