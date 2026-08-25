/**
 * Driver selection. One place, so nothing else in the app knows or cares which
 * backend is configured.
 */
import { env } from "../env";
import { localDriver } from "./local";
import { s3Driver } from "./s3";
import type { StorageDriver } from "./types";

export function getStorage(): StorageDriver {
  return env.STORAGE_DRIVER === "s3" ? s3Driver : localDriver;
}

export * from "./types";
export { buildStorageKey, sanitizeFileName, isValidStorageKey } from "./keys";
