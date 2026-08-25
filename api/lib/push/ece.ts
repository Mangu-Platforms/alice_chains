/**
 * Message Encryption for Web Push — RFC 8291, `aes128gcm` content coding
 * (RFC 8188).
 *
 * Implemented here rather than pulled in: the whole algorithm is one page of
 * `node:crypto` calls, and the repository's working agreement makes adding a
 * dependency a decision rather than a side effect. It is checked against the
 * worked example in RFC 8291 §5, which is the only way to be confident — a
 * mistake produces ciphertext the browser silently discards, with no error
 * anywhere on the server.
 *
 * The shape, for anyone reading this later:
 *
 *   ECDH(serverPrivate, clientP256dh)                        -> shared secret
 *   HKDF(salt=auth, ikm=shared, info="WebPush: info"||keys)  -> IKM
 *   HKDF(salt=random, ikm=IKM, info="Content-Encoding: aes128gcm")  -> CEK
 *   HKDF(salt=random, ikm=IKM, info="Content-Encoding: nonce")      -> nonce
 *   header = salt || recordSize(4) || keyIdLen(1) || serverPublicKey
 *   body   = AES-128-GCM(CEK, nonce, plaintext || 0x02)
 */
import { createCipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

const AUTH_INFO = Buffer.from("WebPush: info\0", "utf8");
const CEK_INFO = Buffer.from("Content-Encoding: aes128gcm\0", "utf8");
const NONCE_INFO = Buffer.from("Content-Encoding: nonce\0", "utf8");

/** Default record size. One record is enough for any notification we send. */
export const RECORD_SIZE = 4096;

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, length));
}

export interface EncryptInput {
  /** The subscription's `p256dh`, base64url. */
  clientPublicKey: string;
  /** The subscription's `auth` secret, base64url. */
  clientAuthSecret: string;
  payload: Buffer;
  /** Fixed values, for reproducing a published test vector. */
  serverPrivateKey?: Buffer;
  salt?: Buffer;
}

/**
 * Produce the body of a Web Push request: header, then one encrypted record.
 */
export function encryptPayload(input: EncryptInput): Buffer {
  const clientPublic = Buffer.from(input.clientPublicKey, "base64url");
  const authSecret = Buffer.from(input.clientAuthSecret, "base64url");
  const salt = input.salt ?? randomBytes(16);

  const ecdh = createECDH("prime256v1");
  if (input.serverPrivateKey) {
    ecdh.setPrivateKey(input.serverPrivateKey);
  } else {
    ecdh.generateKeys();
  }
  const serverPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(clientPublic);

  // The key-derivation info binds both public keys, so a record encrypted for
  // one subscription cannot be replayed at another.
  const keyInfo = Buffer.concat([AUTH_INFO, clientPublic, serverPublic]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  const contentEncryptionKey = hkdf(salt, ikm, CEK_INFO, 16);
  const nonce = hkdf(salt, ikm, NONCE_INFO, 12);

  // RFC 8188 padding: the last record ends with 0x02, earlier ones with 0x01.
  // We always send exactly one record, so it is always 0x02.
  const padded = Buffer.concat([input.payload, Buffer.from([0x02])]);

  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(RECORD_SIZE, 0);

  const header = Buffer.concat([
    salt,
    recordSize,
    Buffer.from([serverPublic.length]),
    serverPublic,
  ]);

  return Buffer.concat([header, ciphertext]);
}
