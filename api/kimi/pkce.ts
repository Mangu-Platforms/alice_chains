/**
 * PKCE (RFC 7636) and CSRF `state` for the authorization-code flow.
 *
 * Before S-4 the flow had neither: the authorize URL was built in the browser
 * with no `state`, so a callback could be replayed against any signed-in
 * victim, and an intercepted `code` could be redeemed by anyone holding the
 * client id.
 *
 * The `code_verifier` must never reach the page, which is why the authorize
 * URL is built server-side behind `GET /api/oauth/login`: only the server can
 * set the HttpOnly cookie that carries it.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes → 43 base64url characters, the RFC 7636 recommended length. */
function randomBase64Url(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export interface OAuthAttempt {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

/** Start one sign-in attempt. */
export function createOAuthAttempt(): OAuthAttempt {
  const codeVerifier = randomBase64Url();
  return {
    state: randomBase64Url(),
    codeVerifier,
    codeChallenge: deriveCodeChallenge(codeVerifier),
  };
}

/** S256: base64url(SHA-256(ASCII(code_verifier))). */
export function deriveCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

/**
 * Constant-time string comparison.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself leak the
 * length, so the lengths are compared first and the result folded in.
 */
export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
