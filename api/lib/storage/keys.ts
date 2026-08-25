/**
 * Storage keys.
 *
 * `{uploaderId}/{yyyy-mm}/{random}{ext}` — scoped by uploader so a bucket
 * policy can be written per member, partitioned by month so a listing stays
 * usable, and named randomly because the original file name is untrusted input
 * that must never reach a filesystem path.
 */
import { randomBytes } from "node:crypto";
import { extname } from "node:path";
import { MAX_FILE_NAME_LENGTH } from "@contracts/attachments";

/**
 * Reduce an uploaded name to something safe to store and echo back.
 *
 * Path separators, traversal sequences, control characters and leading dots
 * are all removed. The result is only ever used as a display label and as the
 * `filename` in a Content-Disposition header — never as a path.
 */
export function sanitizeFileName(input: string): string {
  const withoutPath = input.split(/[\\/]/).pop() ?? "file";
  const cleaned = withoutPath
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\.+/, "")
    .replace(/["\\]/g, "")
    .trim();

  return (cleaned || "file").slice(0, MAX_FILE_NAME_LENGTH);
}

/** Only an extension made of safe characters survives into the key. */
function safeExtension(fileName: string): string {
  const ext = extname(sanitizeFileName(fileName)).toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(ext) ? ext : "";
}

export function buildStorageKey(uploaderId: number, fileName: string): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${uploaderId}/${month}/${randomBytes(16).toString("hex")}${safeExtension(fileName)}`;
}

/** Keys this app generates, and nothing else. Guards every driver's path use. */
export function isValidStorageKey(key: string): boolean {
  return /^[0-9]+\/[0-9]{4}-[0-9]{2}\/[a-f0-9]{32}(\.[a-z0-9]{1,12})?$/.test(key);
}
