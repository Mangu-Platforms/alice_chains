/**
 * S3-compatible storage driver — MinIO locally, S3 or any compatible service
 * in production.
 *
 * Presigning is done in-process with `sigv4.ts`; the only network calls are
 * HEAD and DELETE, which are ordinary fetches. No SDK.
 */
import { createHash } from "node:crypto";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
} from "@contracts/attachments";
import { env } from "../env";
import { isValidStorageKey } from "./keys";
import { presign, uriEncode } from "./sigv4";
import type { StorageDriver, UploadTarget } from "./types";

function config() {
  return {
    endpoint: env.S3_ENDPOINT!,
    bucket: env.S3_BUCKET!,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
}

/** Path-style puts the bucket in the path; virtual-host style in the host. */
function objectPath(bucket: string, key: string, forcePathStyle: boolean): string {
  return forcePathStyle ? `/${bucket}/${key}` : `/${key}`;
}

function endpointFor(endpoint: string, bucket: string, forcePathStyle: boolean): string {
  if (forcePathStyle) return endpoint;
  const url = new URL(endpoint);
  return `${url.protocol}//${bucket}.${url.host}`;
}

function signedUrl(
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  key: string,
  expiresIn: number,
  query: Record<string, string> = {}
): string {
  if (!isValidStorageKey(key)) throw new Error("Invalid storage key");
  const c = config();
  return presign({
    method,
    endpoint: endpointFor(c.endpoint, c.bucket, c.forcePathStyle),
    path: objectPath(c.bucket, key, c.forcePathStyle),
    region: c.region,
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    expiresIn,
    query,
  });
}

export const s3Driver: StorageDriver = {
  name: "s3",

  createUploadTarget({ key, mimeType }): UploadTarget {
    return {
      url: signedUrl("PUT", key, UPLOAD_URL_TTL_SECONDS),
      // Content-Type is not signed, so the object is stored with whatever the
      // client sends. `attachment.complete` re-reads the size from storage and
      // the app serves its own recorded type on download, so a lie here changes
      // nothing about what anyone receives.
      headers: { "content-type": mimeType },
      key,
      expiresAt: Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS,
    };
  },

  createDownloadUrl({ key, fileName, mimeType, inline }): string {
    // Response-header overrides are signed, so the browser is told the type and
    // disposition this app recorded rather than whatever the object carries.
    return signedUrl("GET", key, DOWNLOAD_URL_TTL_SECONDS, {
      "response-content-type": mimeType,
      "response-content-disposition": `${inline ? "inline" : "attachment"}; filename="${uriEncode(
        fileName
      )}"`,
    });
  },

  async statObject(key) {
    const res = await fetch(signedUrl("HEAD", key, 60), { method: "HEAD" });
    if (!res.ok) return null;
    const length = res.headers.get("content-length");
    return length ? Number(length) : 0;
  },

  async deleteObject(key) {
    await fetch(signedUrl("DELETE", key, 60), { method: "DELETE" });
  },
};

/** Exposed for the setup check in SETUP.md. */
export function bucketChecksum(): string {
  return createHash("sha256").update(config().bucket).digest("hex").slice(0, 8);
}
