// mask.js — PII maskeleme wrapper (P1-10)
// Worker /maskPII endpoint'ini sarmalar, in-session cache tutar.
// Pepper Worker'da; frontend asla görmez. Aynı değer için aynı çıktı.
// Format: "pii:<12 hex>" (48-bit identifier — display için yeterince unique).

import { DRIVE_URL } from "./config.js";
import { oturumYukle } from "./auth.js";

const _cache = new Map();

// Cache hit varsa maskeli değeri sync döndürür, yoksa input'un kendisi.
// Async fetch tetiklemez — render path'inde kullanmak için. Önce
// maskPIIBatch ile prefetch yap, sonra render içinde maskCached ile oku.
export function maskCached(value) {
  if (value == null || value === "") return value;
  return _cache.get(String(value)) ?? value;
}

// Tek değer maskele. Cache miss'te Worker'a fetch, cache hit'te anında döner.
// Hata durumunda input'u kendisi döndürür (defansif — UX kırılmasın).
export async function maskPII(value) {
  if (value == null || value === "") return value;
  const key = String(value);
  if (_cache.has(key)) return _cache.get(key);
  const arr = await maskPIIBatch([key]);
  return arr[0];
}

// Batch maskele. Cache'de olmayanları tek istekte gönderir.
// 100'den fazla yeni değer varsa parça parça gönderir (Worker limiti).
export async function maskPIIBatch(values) {
  if (!Array.isArray(values) || !values.length) return [];
  const sValues = values.map((v) => (v == null ? "" : String(v)));
  const missing = [...new Set(sValues.filter((v) => v && !_cache.has(v)))];

  if (missing.length) {
    const oturum = oturumYukle();
    const token = oturum?.token;
    if (!token) {
      // Auth yok → hash hesaplanamaz; cache'e koymadan input'ları dön.
      return sValues;
    }
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      try {
        const r = await fetch(`${DRIVE_URL}/maskPII`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ values: chunk }),
        });
        if (!r.ok) continue;
        const { masked } = await r.json();
        if (Array.isArray(masked)) {
          chunk.forEach((v, idx) => _cache.set(v, masked[idx] ?? v));
        }
      } catch {
        // Network/Worker hatası — cache'e koyma, sonraki çağrıda tekrar dene.
      }
    }
  }

  return sValues.map((v) => (v ? (_cache.get(v) ?? v) : v));
}
