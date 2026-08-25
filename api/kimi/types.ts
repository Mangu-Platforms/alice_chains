export interface OAuthUserInfo {
  unionId: string;
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
}

export interface SessionData {
  userId: number;
  unionId: string;
  name: string;
  email?: string;
  /** Row id in `sessions` — the revocation handle (SEC-C-05). */
  sid: string;
  /** Payload format version (SEC-C-06). */
  v: number;
  iat: number;
}
