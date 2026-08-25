/**
 * Cookie emission — one place, so an attribute can never be set on one path and
 * forgotten on another.
 *
 * Two identical `getSessionCookieOptions` used to exist (`api/kimi/session.ts`
 * and here) and **neither was ever called**: the callback hand-wrote its
 * `Set-Cookie` string, and that string carried no `Secure` attribute, so the
 * session credential was transmissible over cleartext HTTP in production.
 * S-17 extends this module with the `__Host-` prefix, rotation and revocation.
 */
import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { OAuthCookies, OAUTH_ATTEMPT_MAX_AGE_SECONDS } from "@contracts/oauth";
import { env, isProduction } from "./env";

/**
 * True when the deployment is served over TLS.
 *
 * `PUBLIC_BASE_URL` is the canonical origin, so it — not the inbound Host —
 * decides. `x-forwarded-proto` is honoured as a fallback for a proxy that
 * terminates TLS without the variable being set.
 */
export function isSecureContext(headers?: Headers): boolean {
  if (env.PUBLIC_BASE_URL?.startsWith("https://")) return true;
  if (headers?.get("x-forwarded-proto") === "https") return true;
  return isProduction;
}

function baseAttributes(headers?: Headers) {
  return {
    httpOnly: true,
    secure: isSecureContext(headers),
    sameSite: "lax" as const,
    path: "/",
  };
}

/**
 * The session cookie's name for this deployment.
 *
 * Over TLS it carries the `__Host-` prefix, which the browser only accepts on a
 * cookie that is `Secure`, `Path=/` and has no `Domain` — so it cannot be
 * planted by a sibling subdomain (SEC-C-07). Over plain http the prefix is
 * dropped, because a browser would refuse the cookie outright and local
 * development would be unable to sign in.
 */
export function sessionCookieName(headers?: Headers): string {
  return isSecureContext(headers) ? Session.hostCookieName : Session.cookieName;
}

/** `Set-Cookie` for an established session. */
export function serializeSessionCookie(token: string, headers?: Headers): string {
  return cookie.serialize(sessionCookieName(headers), token, {
    ...baseAttributes(headers),
    maxAge: Session.maxAgeSeconds,
  });
}

/**
 * `Set-Cookie` that removes the session cookie.
 *
 * Both names are cleared: a deployment that gains TLS must still be able to
 * remove the cookie it issued beforehand, and a browser only matches on name.
 */
export function clearSessionCookie(headers?: Headers): string[] {
  const attributes = { ...baseAttributes(headers), maxAge: 0 };
  return [
    cookie.serialize(Session.hostCookieName, "", { ...attributes, secure: true }),
    cookie.serialize(Session.cookieName, "", attributes),
  ];
}

/**
 * `Set-Cookie` for one of the short-lived values that bind a sign-in attempt.
 * They must survive the cross-site redirect back from the provider, which
 * `SameSite=Lax` allows for a top-level GET navigation.
 */
export function serializeOAuthCookie(
  name: (typeof OAuthCookies)[keyof typeof OAuthCookies],
  value: string,
  headers?: Headers
): string {
  return cookie.serialize(name, value, {
    ...baseAttributes(headers),
    maxAge: OAUTH_ATTEMPT_MAX_AGE_SECONDS,
  });
}

/** `Set-Cookie` that removes a sign-in-attempt cookie once it has been used. */
export function clearOAuthCookie(
  name: (typeof OAuthCookies)[keyof typeof OAuthCookies],
  headers?: Headers
): string {
  return cookie.serialize(name, "", { ...baseAttributes(headers), maxAge: 0 });
}

/** Read one cookie from a request's `Cookie` header. */
export function readCookie(headers: Headers, name: string): string | undefined {
  const header = headers.get("cookie");
  if (!header) return undefined;
  return cookie.parse(header)[name] || undefined;
}

/**
 * Read the session cookie, preferring the `__Host-`-prefixed name.
 *
 * Both are accepted on the way in so a deployment that switches to TLS does not
 * sign everyone out mid-session.
 */
export function parseSessionToken(headers: Headers): string | undefined {
  return (
    readCookie(headers, Session.hostCookieName) ?? readCookie(headers, Session.cookieName)
  );
}
