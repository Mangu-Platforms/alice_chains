/**
 * Filesystem storage driver.
 *
 * The default, so `docker compose up` and `npm run dev` both give a working
 * attachment flow with no object store to provision. It mimics presigned URLs
 * exactly: `createUploadTarget` returns an app endpoint carrying an HMAC-signed
 * token that pins the key, the declared type and the declared size, and expires
 * — so the client code is identical whether the bytes end up on disk or in
 * MinIO.
 *
 * Not for a multi-node deployment: the files live on one machine's disk. That
 * is what the `s3` driver is for, and `STORAGE_DRIVER` selects it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
} from "@contracts/attachments";
import { env } from "../env";
import { isValidStorageKey } from "./keys";
import type { StorageDriver, UploadTarget } from "./types";

const ROOT = resolve(env.STORAGE_LOCAL_DIR);

/**
 * Resolve a key to an absolute path, refusing anything that escapes the root.
 *
 * `isValidStorageKey` already rejects traversal, but a second check against the
 * resolved path costs nothing and means a future key format cannot silently
 * open a hole.
 */
function pathFor(key: string): string {
  if (!isValidStorageKey(key)) throw new Error("Invalid storage key");
  const full = resolve(join(ROOT, key));
  if (full !== ROOT && !full.startsWith(ROOT + "/")) {
    throw new Error("Invalid storage key");
  }
  return full;
}

interface TokenClaims {
  key: string;
  mimeType: string;
  byteSize: number;
  exp: number;
  op: "put" | "get";
}

function sign(claims: TokenClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

/** Verify a token. Returns the claims, or undefined for any failure. */
export function verifyStorageToken(token: string, op: "put" | "get"): TokenClaims | undefined {
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return undefined;

  const expected = createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;

  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return undefined;
  }

  if (claims.op !== op) return undefined;
  if (claims.exp * 1000 < Date.now()) return undefined;
  if (!isValidStorageKey(claims.key)) return undefined;

  return claims;
}

/** Write bytes for a key whose token has already been verified. */
export async function writeLocalObject(key: string, body: Buffer): Promise<void> {
  const path = pathFor(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

/** A readable stream for a key, or null when it is not there. */
export function readLocalObject(key: string) {
  return createReadStream(pathFor(key));
}

export const localDriver: StorageDriver = {
  name: "local",

  createUploadTarget({ key, mimeType, byteSize }): UploadTarget {
    const exp = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS;
    const token = sign({ key, mimeType, byteSize, exp, op: "put" });

    return {
      url: `/api/files/upload?token=${encodeURIComponent(token)}`,
      // Declared here so the client sends the same type the token pins, and the
      // upload endpoint can reject a mismatch.
      headers: { "content-type": mimeType },
      key,
      expiresAt: exp,
    };
  },

  createDownloadUrl({ key, fileName, mimeType, inline }): string {
    const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS;
    const token = sign({ key, mimeType, byteSize: 0, exp, op: "get" });
    const params = new URLSearchParams({
      token,
      name: fileName,
      disposition: inline ? "inline" : "attachment",
    });
    return `/api/files/download?${params.toString()}`;
  },

  async statObject(key) {
    try {
      const info = await stat(pathFor(key));
      return info.size;
    } catch {
      return null;
    }
  },

  async deleteObject(key) {
    await rm(pathFor(key), { force: true });
  },
};
