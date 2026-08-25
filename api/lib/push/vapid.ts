/**
 * VAPID — Voluntary Application Server Identification, RFC 8292.
 *
 * The push service needs to know who is asking it to deliver. Each request
 * carries a short-lived ES256 JWT signed with the application server's private
 * key, and the matching public key is what the browser subscribed with.
 */
import { createECDH, createPrivateKey, createSign, generateKeyPairSync } from "node:crypto";

/** How long a VAPID JWT is valid. RFC 8292 caps this at 24 hours. */
const JWT_TTL_SECONDS = 12 * 60 * 60;

export interface VapidKeyPair {
  /** Uncompressed P-256 point, base64url — what the browser subscribes with. */
  publicKey: string;
  /** Raw 32-byte scalar, base64url. */
  privateKey: string;
}

/** Generate a fresh pair. Used by `npm run generate-vapid`. */
export function generateVapidKeys(): VapidKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

  // Node exports JWK, which carries the raw coordinates; the wire format is the
  // uncompressed point 0x04 || x || y.
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const privateJwk = privateKey.export({ format: "jwk" }) as { d: string };

  return {
    publicKey: Buffer.concat([
      Buffer.from([0x04]),
      Buffer.from(jwk.x, "base64url"),
      Buffer.from(jwk.y, "base64url"),
    ]).toString("base64url"),
    privateKey: privateJwk.d,
  };
}

/** Rebuild a signing key from the stored raw scalar and public point. */
function privateKeyFrom(publicKey: string, privateKey: string) {
  const point = Buffer.from(publicKey, "base64url");
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY must be an uncompressed P-256 point (65 bytes)");
  }

  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: privateKey,
      x: point.subarray(1, 33).toString("base64url"),
      y: point.subarray(33, 65).toString("base64url"),
    },
    format: "jwk",
  });
}

/**
 * Confirm a configured pair actually belongs together.
 *
 * The public key is derived from the private scalar with ECDH rather than read
 * back out of a JWK built from both halves — that would compare the supplied
 * public key with itself and pass for any mismatched pair.
 */
export function assertKeyPairMatches(keys: VapidKeyPair): void {
  let derived: string;
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(keys.privateKey, "base64url"));
    derived = ecdh.getPublicKey().toString("base64url");
  } catch {
    throw new Error("VAPID_PRIVATE_KEY is not a valid P-256 private key");
  }

  if (derived !== keys.publicKey) {
    throw new Error("VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY");
  }
}

/**
 * The `Authorization` header value for one push request.
 *
 * `aud` is the push service's origin — a token minted for one service is not
 * valid at another — and `sub` is a contact address the service can use if the
 * application server misbehaves.
 */
export function buildVapidHeader(input: {
  audience: string;
  subject: string;
  keys: VapidKeyPair;
  now?: Date;
}): string {
  const issuedAt = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);

  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: input.audience,
    exp: issuedAt + JWT_TTL_SECONDS,
    sub: input.subject,
  };

  const signingInput = `${Buffer.from(JSON.stringify(header)).toString(
    "base64url"
  )}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;

  // ES256 signatures must be the raw 64-byte r||s pair, not the DER encoding
  // Node produces by default. `dsaEncoding` asks for the right one; getting
  // this wrong yields a JWT every push service rejects as malformed.
  const signature = createSign("SHA256")
    .update(signingInput)
    .sign({
      key: privateKeyFrom(input.keys.publicKey, input.keys.privateKey),
      dsaEncoding: "ieee-p1363",
    })
    .toString("base64url");

  return `vapid t=${signingInput}.${signature}, k=${input.keys.publicKey}`;
}

/** The origin of a push endpoint, which is what `aud` must be. */
export function audienceFor(endpoint: string): string {
  return new URL(endpoint).origin;
}
