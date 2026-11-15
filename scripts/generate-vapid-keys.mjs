#!/usr/bin/env node
// Generates a VAPID key pair for Web Push (docs/specs/M6.md).
//
// The encodings match webpush-webcrypto's ApplicationServerKeys.toJSON()
// exactly (verified against the installed dist):
//   publicKey  = base64url(raw export of the ECDSA P-256 public key)
//   privateKey = base64url(PKCS#8 export of the ECDSA P-256 private key)
// so ApplicationServerKeys.fromJSON() accepts them as-is. Implemented with
// Node's built-in WebCrypto — no import from apps/worker needed.

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
]);

const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString(
  "base64url",
);
const privateKey = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString(
  "base64url",
);

console.log("VAPID key pair (docs/specs/M6.md)\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}\n`);
console.log("Staging setup:");
console.log("  1. corepack pnpm exec wrangler secret put VAPID_PRIVATE_KEY --env staging");
console.log("     (paste the private key above)");
console.log("  2. Put VAPID_PUBLIC_KEY in wrangler.jsonc env.staging vars.");
console.log("  3. Put VAPID_SUBJECT in wrangler.jsonc env.staging vars, e.g.");
console.log('     "VAPID_SUBJECT": "mailto:ngeran@gmail.com"');
console.log("  4. Commit + deploy — secrets/vars take effect on the next deploy.");
