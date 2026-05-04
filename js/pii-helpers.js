// pii-helpers.js — Ortak PII mask davranışı (B10)
// dashboard.js, log.js, export.js bu modülü paylaşır.
//
// Akış:
//   1. _piiAdayMi(s)     → ham email mi? (P1-10 öncesi legacy değer)
//   2. piiPrefetch(arr)  → render öncesi Worker'dan deterministic hash al
//   3. piiGoster(value)  → render-time getter: cache hit pii: hash, miss + aday "Admin"

import { maskPIIBatch, maskCached } from "./mask.js";

const _MAPPED = new Set(["abdulrahman", "deniz"]);

export function _piiAdayMi(s) {
  if (!s || typeof s !== "string") return false;
  if (s.startsWith("pii:")) return false;
  if (s === "—" || s === "Admin") return false;
  if (_MAPPED.has(s.toLowerCase())) return false;
  if (s.includes("@")) return true;          // ham email → aday
  return false;                              // local-part fallback'i bilemeyiz
}

export async function piiPrefetch(values) {
  const adaylar = [...new Set(values.filter(_piiAdayMi))];
  if (adaylar.length) await maskPIIBatch(adaylar);
}

export function piiGoster(value) {
  const cached = maskCached(value);
  if (cached !== value) return cached;             // cache hit (pii:hash)
  if (_piiAdayMi(value)) return "Admin";           // aday + miss → hard-mask
  return value;                                    // mapped/sentinel
}
