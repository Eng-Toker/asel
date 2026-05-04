// hash_misafir_pass.mjs — PBKDF2-SHA256 hash üretici (P1-8)
// Kullanım:
//   node scripts/hash_misafir_pass.mjs "ASEL2026"
// Çıktıyı Cloudflare Worker'da GUEST_PASSWORD_HASH secret olarak ekleyin:
//   wrangler secret put GUEST_PASSWORD_HASH
//   (prompt'a yapıştırın)
//
// Format: pbkdf2-sha256$600000$<base64-salt>$<base64-hash>
// Parametreler (P1-8 USER_DECISION 2026-05-04):
//   - PBKDF2 / SHA-256
//   - 600,000 iteration (OWASP 2023 minimum)
//   - 16-byte random salt
//   - 32-byte derived key

import { webcrypto } from "node:crypto";

const ITER = 600000;
const KEY_LEN = 32;
const SALT_LEN = 16;

function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error("Kullanım: node scripts/hash_misafir_pass.mjs <password>");
    process.exit(1);
  }
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_LEN));
  const enc  = new TextEncoder();
  const key  = await webcrypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    key,
    KEY_LEN * 8
  );
  const hash = `pbkdf2-sha256$${ITER}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
  console.log(hash);
}

main().catch((e) => { console.error(e); process.exit(1); });
