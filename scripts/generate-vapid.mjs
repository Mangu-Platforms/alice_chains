#!/usr/bin/env node
/**
 * Generate a VAPID key pair for local development (BUILD_PLAN F-6).
 *
 * Web push needs an application-server key pair. There is no account to sign up
 * for and no vendor dashboard to click — the keys are generated here and the
 * browser subscribes with the public half.
 *
 *   npm run generate-vapid
 *
 * Paste the output into .env. Rotating the pair invalidates every existing
 * subscription: browsers hold the old public key and the push service will
 * reject a token signed by the new private one, so the rows are pruned on
 * their first 403 and members re-subscribe on next load.
 */
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });

const publicPoint = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(pub.x, "base64url"),
  Buffer.from(pub.y, "base64url"),
]).toString("base64url");

console.log(`
# Web push (F-6). Generated ${new Date().toISOString()}.
# VAPID_PRIVATE_KEY is a secret: it authorises sending notifications to every
# subscriber. Never prefix it with VITE_ - the server refuses to start if you do.
VAPID_PUBLIC_KEY=${publicPoint}
VAPID_PRIVATE_KEY=${priv.d}
VAPID_SUBJECT=mailto:admin@example.com
`);
