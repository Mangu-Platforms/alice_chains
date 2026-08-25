/**
 * BUILD_PLAN F-6 — the Web Push encryption, checked against RFC 8291's own
 * worked example.
 *
 * This is the only meaningful way to test it. A mistake here does not raise
 * anything: the push service accepts the request, the browser fails to decrypt,
 * and the notification simply never appears — with nothing in any server log to
 * say why.
 */
import { describe, expect, it } from "vitest";
import { encryptPayload } from "./ece";

/**
 * RFC 8291 §5, "Push Message Encryption Example". Every value below is copied
 * from the RFC.
 */
const VECTOR = {
  plaintext: "When I grow up, I want to be a watermelon",
  // The subscription's public key and auth secret.
  p256dh:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  // The server's ephemeral key pair and salt, fixed so the output is
  // reproducible.
  serverPrivateKey: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  // The expected body, base64url, header included.
  expectedBody:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("Web Push payload encryption (RFC 8291)", () => {
  it("reproduces the RFC's worked example byte for byte", () => {
    const body = encryptPayload({
      clientPublicKey: VECTOR.p256dh,
      clientAuthSecret: VECTOR.auth,
      payload: Buffer.from(VECTOR.plaintext, "utf8"),
      serverPrivateKey: Buffer.from(VECTOR.serverPrivateKey, "base64url"),
      salt: Buffer.from(VECTOR.salt, "base64url"),
    });

    expect(body.toString("base64url")).toBe(VECTOR.expectedBody);
  });

  it("lays the header out as RFC 8188 requires", () => {
    const body = encryptPayload({
      clientPublicKey: VECTOR.p256dh,
      clientAuthSecret: VECTOR.auth,
      payload: Buffer.from("hello", "utf8"),
    });

    // salt(16) | recordSize(4) | keyIdLength(1) | serverPublicKey(65)
    expect(body.subarray(16, 20).readUInt32BE(0)).toBe(4096);
    expect(body[20]).toBe(65);
    // An uncompressed P-256 point starts with 0x04.
    expect(body[21]).toBe(0x04);
    expect(body.length).toBeGreaterThan(86);
  });

  it("produces different ciphertext each time, from a fresh key and salt", () => {
    const once = encryptPayload({
      clientPublicKey: VECTOR.p256dh,
      clientAuthSecret: VECTOR.auth,
      payload: Buffer.from("hello", "utf8"),
    });
    const twice = encryptPayload({
      clientPublicKey: VECTOR.p256dh,
      clientAuthSecret: VECTOR.auth,
      payload: Buffer.from("hello", "utf8"),
    });

    expect(once.toString("base64url")).not.toBe(twice.toString("base64url"));
  });

  it("grows with the payload, so nothing is silently truncated", () => {
    const short = encryptPayload({
      clientPublicKey: VECTOR.p256dh,
      clientAuthSecret: VECTOR.auth,
      payload: Buffer.from("a", "utf8"),
      serverPrivateKey: Buffer.from(VECTOR.serverPrivateKey, "base64url"),
      salt: Buffer.from(VECTOR.salt, "base64url"),
    });
    const long = encryptPayload({
      clientPublicKey: VECTOR.p256dh,
      clientAuthSecret: VECTOR.auth,
      payload: Buffer.from("a".repeat(500), "utf8"),
      serverPrivateKey: Buffer.from(VECTOR.serverPrivateKey, "base64url"),
      salt: Buffer.from(VECTOR.salt, "base64url"),
    });

    expect(long.length - short.length).toBe(499);
  });
});
