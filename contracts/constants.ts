export const Paths = {
  oauthCallback: "/api/oauth/callback",
} as const;

export const Session = {
  cookieName: "alice_session",
  maxAgeSeconds: 60 * 60 * 24 * 7,
} as const;

/**
 * Port contract.
 *
 * Dev:  vite serves the client on CLIENT_PORT and proxies /api + /socket.io to
 *       API_PORT (see vite.config.ts). Both values must stay in sync here.
 * Prod: a single process serves client + API on PORT (default DEFAULT_PROD_PORT).
 */
export const CLIENT_PORT = 3000;
export const API_PORT = 3001;
export const DEFAULT_PROD_PORT = 3000;
