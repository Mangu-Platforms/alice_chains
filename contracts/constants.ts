export const Paths = {
  oauthCallback: "/api/oauth/callback",
} as const;

export const Session = {
  cookieName: "alice_session",
  maxAgeSeconds: 60 * 60 * 24 * 7,
} as const;
