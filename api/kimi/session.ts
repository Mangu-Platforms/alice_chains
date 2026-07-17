import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../lib/env";
import type { SessionData } from "./types";

export function getSessionToken(headers: Headers): string | undefined {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return undefined;

  const cookies = cookie.parse(cookieHeader);
  return cookies[Session.cookieName] || undefined;
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signature(payload: string) {
  return createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
}

export function createSessionToken(session: Omit<SessionData, "iat">) {
  const payload = encode(JSON.stringify({ ...session, iat: Date.now() }));
  return `${payload}.${signature(payload)}`;
}

export function verifySessionToken(token: string): SessionData | undefined {
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return undefined;
  const expected = signature(payload);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionData;
  if (!session.unionId || Date.now() - session.iat > Session.maxAgeSeconds * 1000) return undefined;
  return session;
}

export function getSessionCookieOptions(headers: Headers) {
  const isSecure = headers.get("x-forwarded-proto") === "https";
  const origin = headers.get("origin");

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: (origin ? "lax" : "none") as "lax" | "none",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}
