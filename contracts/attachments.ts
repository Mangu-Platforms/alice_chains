/**
 * The attachment contract, shared so the client offers exactly what the server
 * will accept.
 *
 * Every limit here is enforced on the server. The client copies are for
 * showing a useful message before a doomed upload starts, never for deciding
 * whether one is allowed.
 */

/** Types the app will store and render. Anything else is refused. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_FILE_TYPES,
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export function isImageMimeType(value: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Largest single upload, in bytes.
 *
 * Deliberately far below the 50 MB HTTP body limit the app shipped with:
 * S-13 lowers that to 256 KB, and attachments bypass it entirely by going
 * straight to storage.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** How long an upload target stays valid. */
/**
 * Avatars are much smaller than attachments, deliberately: one is rendered at
 * 40 pixels in a list of a hundred, and a 25 MB image there is a bad day for
 * whoever is on mobile data.
 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/** How long a download link stays valid. */
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

/**
 * How long an upload with no message may sit before it is reaped. A client
 * that crashes between "get a target" and "send the message" leaves one.
 */
export const ABANDONED_UPLOAD_TTL_SECONDS = 24 * 60 * 60;

/** Longest accepted file name, matching the column. */
export const MAX_FILE_NAME_LENGTH = 255;

/** Human-readable size, for messages the user actually reads. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
