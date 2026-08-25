/**
 * AWS Signature Version 4, query-string ("presigned URL") flavour.
 *
 * Written here rather than pulled in, because the alternative is an SDK
 * measured in megabytes for one algorithm that fits on a page — and the
 * repository's working agreement makes adding a dependency a decision, not a
 * side effect. It is exercised against the AWS published test vectors in
 * api/lib/storage/sigv4.test.ts.
 *
 * Reference: AWS SigV4 "Authenticating Requests: Using Query Parameters".
 */
import { createHash, createHmac } from "node:crypto";

const ALGORITHM = "AWS4-HMAC-SHA256";
/** Presigned URLs are signed over the payload literally named this. */
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

/**
 * Percent-encode per RFC 3986.
 *
 * `encodeURIComponent` leaves `!'()*` alone and AWS does not, so a key
 * containing any of them would sign correctly and then fail to match.
 */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const char of value) {
    if (/[A-Za-z0-9\-._~]/.test(char)) {
      out += char;
    } else if (char === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      out += [...Buffer.from(char, "utf8")]
        .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
        .join("");
    }
  }
  return out;
}

/** `20260825T193045Z` and `20260825`. */
export function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export interface PresignInput {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  /** Origin only, e.g. `http://localhost:9000`. */
  endpoint: string;
  /** Absolute path including the bucket when path-style, e.g. `/bucket/key`. */
  path: string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresIn: number;
  /** Extra query parameters to include in the signature. */
  query?: Record<string, string>;
  /** Headers to sign. `host` is added automatically. */
  headers?: Record<string, string>;
  now?: Date;
}

/** Build a presigned URL. */
export function presign(input: PresignInput): string {
  const {
    method,
    endpoint,
    path,
    region,
    service = "s3",
    accessKeyId,
    secretAccessKey,
    expiresIn,
    query = {},
    headers = {},
    now = new Date(),
  } = input;

  const url = new URL(endpoint);
  const { amzDate, dateStamp } = amzDates(now);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  const signedHeaders: Record<string, string> = { host: url.host, ...headers };
  const canonicalHeaderNames = Object.keys(signedHeaders)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders = canonicalHeaderNames
    .map((name) => {
      const value = Object.entries(signedHeaders).find(
        ([key]) => key.toLowerCase() === name
      )![1];
      return `${name}:${String(value).trim().replace(/\s+/g, " ")}\n`;
    })
    .join("");
  const signedHeaderList = canonicalHeaderNames.join(";");

  const queryParams: Record<string, string> = {
    ...query,
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaderList,
  };

  // Canonical query strings are sorted by encoded key, then encoded value.
  const canonicalQuery = Object.keys(queryParams)
    .map((key) => [uriEncode(key), uriEncode(queryParams[key])] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const canonicalRequest = [
    method,
    uriEncode(path, false),
    canonicalQuery,
    canonicalHeaders,
    signedHeaderList,
    UNSIGNED_PAYLOAD,
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(secretAccessKey, dateStamp, region, service)
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return `${url.origin}${uriEncode(path, false)}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
