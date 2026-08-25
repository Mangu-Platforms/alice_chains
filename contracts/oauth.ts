/**
 * The OAuth endpoint contract, defined once.
 *
 * `VITE_KIMI_AUTH_URL` is a bare **origin**. Every endpoint is derived from it
 * here so no other module ever concatenates a provider URL.
 *
 * Before S-4 the client built `${authUrl}/oauth/authorize` while the server
 * exchanged at `${authUrl}/api/oauth/token`, and `.env.example` shipped a full
 * authorize URL as the base — which produced
 * `.../oauth/authorize/oauth/authorize` and a sign-in that could never work.
 */

/** Paths the provider exposes, relative to its origin. */
export const OAuthPaths = {
  authorize: "/oauth/authorize",
  token: "/api/oauth/token",
  userinfo: "/api/oauth/userinfo",
} as const;

/** The path on *this* app the provider redirects back to. */
export const OAUTH_CALLBACK_PATH = "/api/oauth/callback";

/** The path on *this* app that starts a sign-in. */
export const OAUTH_LOGIN_PATH = "/api/oauth/login";

/** Cookie names for the single-use values that bind one sign-in attempt. */
export const OAuthCookies = {
  state: "alice_oauth_state",
  verifier: "alice_oauth_verifier",
} as const;

/** How long an in-flight sign-in attempt stays valid. */
export const OAUTH_ATTEMPT_MAX_AGE_SECONDS = 10 * 60;

export class InvalidOriginError extends Error {}

/**
 * Reject anything that is not a bare `scheme://host[:port]`.
 *
 * A trailing slash, a path, a query or a fragment all mean the operator has
 * pasted the wrong value, and every derived URL would be silently wrong.
 */
export function assertBareOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidOriginError(`${label} must be an absolute URL, got "${value}"`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidOriginError(`${label} must be http or https, got "${url.protocol}"`);
  }

  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new InvalidOriginError(
      `${label} must be an origin with no path, query or fragment — got "${value}". ` +
        `Use "${url.origin}".`
    );
  }

  // `new URL("https://x").pathname` is "/", so an input of "https://x/" and one
  // of "https://x" both land here; `origin` normalises them to the same string.
  return url.origin;
}

export interface OAuthEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
}

/** Derive every provider endpoint from the one configured origin. */
export function oauthEndpoints(authOrigin: string): OAuthEndpoints {
  const origin = assertBareOrigin(authOrigin, "VITE_KIMI_AUTH_URL");
  return {
    authorizeUrl: `${origin}${OAuthPaths.authorize}`,
    tokenUrl: `${origin}${OAuthPaths.token}`,
    userinfoUrl: `${origin}${OAuthPaths.userinfo}`,
  };
}

/**
 * The `redirect_uri` both legs of the exchange must send, byte for byte.
 *
 * It is derived from the canonical public origin rather than from the inbound
 * request: behind the Vite dev proxy (`changeOrigin: true`) or any reverse
 * proxy the inbound Host is `:3001`, not the `:3000` the browser used, so the
 * two legs disagreed and a conformant provider rejected the exchange.
 */
export function oauthRedirectUri(publicBaseUrl: string): string {
  return `${assertBareOrigin(publicBaseUrl, "PUBLIC_BASE_URL")}${OAUTH_CALLBACK_PATH}`;
}
