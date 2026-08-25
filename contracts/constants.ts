// The OAuth paths that used to live here now belong to the endpoint contract
// in contracts/oauth.ts, which derives every provider URL from one origin.

export const Session = {
  /** Cookie name in development, and the suffix of the production name. */
  cookieName: "alice_session",
  /**
   * Production name. The `__Host-` prefix is enforced by the browser: it only
   * accepts such a cookie when it carries `Secure`, `Path=/` and no `Domain`,
   * which makes it un-settable by a subdomain (SEC-C-07).
   */
  hostCookieName: "__Host-alice_session",
  /** Absolute lifetime, from issue. */
  maxAgeSeconds: 60 * 60 * 24 * 7,
  /** Idle lifetime, from last use. Whichever expires first wins. */
  idleMaxAgeSeconds: 60 * 60 * 24,
  /**
   * How stale `sessions.lastSeenAt` may get before a request refreshes it.
   * Without this an active session costs a write on every request.
   */
  lastSeenRefreshSeconds: 5 * 60,
  /**
   * Payload format version. Raising `minimumVersion` invalidates every token
   * issued under an older format without waiting out the absolute maximum.
   */
  payloadVersion: 1,
  minimumVersion: 1,
} as const;

/** How often an established socket re-checks that its session is still valid. */
export const SOCKET_SESSION_RECHECK_MS = 5 * 60 * 1000;

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

/**
 * Largest batch of message ids `message.markAsRead` will accept in one call
 * (tRPC and Socket.IO alike). A page of history is 100 messages, so this is
 * generous; the cap exists so a single call cannot ask the server to authorize
 * an unbounded id list.
 */
export const MAX_READ_RECEIPT_BATCH = 500;

/**
 * Largest number of members one conversation may hold, the creator included.
 * `conversation.createGroup` accepted an unbounded `participantIds` array
 * before S-9, so a single call could write an arbitrary number of rows.
 */
export const MAX_CONVERSATION_PARTICIPANTS = 256;

/**
 * Shortest accepted `contact.searchUsers` query. A single character used to be
 * enough to enumerate the whole user directory, e-mail addresses included.
 */
export const MIN_USER_SEARCH_LENGTH = 3;

/** Most rows `contact.searchUsers` will return for one query. */
export const USER_SEARCH_LIMIT = 20;

/**
 * Shortest accepted `APP_SECRET` / `JWT_SECRET`. `api/lib/env.ts` accepted a
 * single character until S-17, which made every session forgeable.
 */
export const MIN_SECRET_LENGTH = 32;

/** Most conversations one `conversation.list` call returns. */
export const CONVERSATION_LIST_LIMIT = 50;

/**
 * Longest message body accepted. Enforced on the tRPC path today; S-14 brings
 * the socket path — which is the one the UI actually uses — to the same cap.
 */
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * Largest JSON request body accepted. Was 50 MB, which let any caller buffer
 * 50 MB before a handler ran; no procedure this app exposes needs more than a
 * few kilobytes, and attachments never travel this path.
 */
export const MAX_JSON_BODY_BYTES = 256 * 1024;

/**
 * Shortest accepted message-search query.
 *
 * Two rather than three: below the FULLTEXT minimum the search falls back to a
 * bounded LIKE, so a short query still works — it is simply answered a
 * different way.
 */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/** Longest display name a member may set, matching `users.name`. */
export const MAX_DISPLAY_NAME_LENGTH = 255;

/** Longest status text, matching `users.status`. */
export const MAX_STATUS_LENGTH = 100;
