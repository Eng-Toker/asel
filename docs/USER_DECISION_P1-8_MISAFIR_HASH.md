# USER_DECISION_NEEDED — P1-8 Misafir password algoritma

**Kapsam:** Misafir parolasının bundle'dan çıkarılıp Worker'a taşınması.
**Durdurma noktası:** Faz 2 ADIM 5 (FAZ 2+3 birleşik brief).
**Tarih:** 2026-05-04.

---

## Mevcut durum (kanıt)

`js/auth.js:91`:
```js
if (sifre !== "ASEL2026") { ... return; }
_oturum = { email: "guest", ad: "Misafir", rol: "guest", token: null };
```

- Parola **plaintext** olarak public bundle'da. Devtools "View source" → görülür.
- Hash yok. Karşılaştırma direkt string.
- Login sonrası `_oturum` tamamen client-side; herhangi biri devtools'tan
  `_oturum = {rol:"guest"}` set ederek de bypass edebilir (ayrı sorun;
  bu maddede çözülmüyor — aşağıdaki "Sınır" notuna bak).

---

## Mimari değişikliği

Çözüm: parola bundle'dan tamamen çıkar, Worker'a yeni bir endpoint
(`/misafirLogin`) ekle. Frontend → Worker'a POST `{password}` → Worker
env var'daki hash ile doğrula → 200 OK / 401.

Hash, Cloudflare Worker secret olarak saklanır (env var). Manuel task
(M5 veya M6) ile kullanıcı dashboard üzerinden ekler.

---

## Algoritma seçenekleri

### A) bcrypt (`bcryptjs` npm paketi)

- **Artılar:** Endüstri standardı, geniş kabul.
- **Eksiler:**
  - npm install gerek (proje genelinde tool-free disiplini var; izin gerekir).
  - CF Worker'da JS bcrypt cost factor 10+ → cold start'ta 50-200ms CPU.
    Worker free plan CPU limiti 10ms (paid 50ms-30s). Cold start riski.
  - WASM bcrypt alternatifi var ama yine ekstra payload.

### B) Web Crypto API + PBKDF2 — **ÖNERİM**

- **Artılar:**
  - Native CF Worker (Web Crypto), npm yok.
  - Standart, NIST SP 800-132 onaylı.
  - Hızlı (10-30ms typical, 100k iteration / SHA-256).
- **Eksiler:**
  - bcrypt kadar "yavaş by default" değil — iteration sayısını manuel
    yüksek tutmak gerek.
- **Format önerisi:** Self-describing string
  `pbkdf2-sha256$100000$<salt_b64>$<hash_b64>`
  → ileride algoritma rotation kolay (prefix kontrol).
- **Parametre:** SHA-256, 100k iter, 16-byte random salt, 32-byte derived key.

### C) scrypt (WASM)

- **Artılar:** Memory-hard, GPU brute-force'a en dirençli.
- **Eksiler:** WASM payload, CPU + memory overhead, CF Worker'da overkill.
  Misafir parolası tek kullanıcı (paylaşımlı), uzun parola değil — scrypt
  fayda/maliyet oransız.

---

## Sınır (önemli — kullanıcının bilmesi gereken)

**Bu değişiklik sadece "parolayı bundle'da görme" vektörünü kapatır.**

Şunları KAPATMAZ:
- Devtools'tan `_oturum = {rol:"guest"}` set ederek misafir oturumu
  forge etme. Bu, misafir oturumunun tamamen client-side state olmasından
  kaynaklanıyor.
- Anon Supabase key kullanan tüm read sorguları (RLS bunlara izin veriyor
  — `okuma`/`misafir_okuma` policy'leri).

Tam çözüm için (P3 kapsamı):
- Worker `/misafirLogin` başarıyla parolayı doğrularsa, `rol:guest` claim'li
  short-lived JWT döndürür (Supabase JWT secret ile imzalı).
- Frontend bu JWT'yi Supabase isteklerinde Authorization header olarak
  kullanır (anon key yerine).
- RLS policy'leri `auth.jwt() ->> 'rol' = 'guest'` ile gate'ler.

Bu, mevcut `okuma`/`misafir_okuma` anon policy'lerini kaldırmayı gerektirir
ve P3'te yapılabilir.

**Bu maddede sadece A/B/C arası algoritma kararı + Worker endpoint kapsamı
seçilecek.** Tam JWT mimarisi (P3) sonra konuşulacak.

---

## Yan kararlar (algoritma kararı sonrası)

1. **Hash üretimi:** Kullanıcı parola değiştirmek için bir kerelik script
   çalıştırır (`scripts/hash_misafir_pass.js` veya browser console snippet).
   Çıktı `pbkdf2-sha256$100000$<salt>$<hash>` — bunu Cloudflare dashboard'dan
   `MISAFIR_HASH` env var olarak ekler.

2. **Worker endpoint:** `POST /misafirLogin` body `{password}` →
   200 `{ok:true}` veya 401. Rate-limit Faz 2 kapsamında DEĞİL (P3 kapsam,
   IP-based throttle Worker KV ile).

3. **Frontend:**
   - `auth.js::misafirGiris` async olur, Worker'a fetch atar.
   - Loading state ekler ("Doğrulanıyor...").
   - Hata mesajı genel ("Misafir şifresi hatalı.") — timing attack'a karşı
     Worker'da `crypto.subtle.timingSafeEqual` kullanılır.

4. **Parola rotasyonu:** Mevcut "ASEL2026" değişecek mi? Önerim: değişmez
   (UX süreklilik), ama hash sürümüne ilk geçişte env var set edilirken
   kullanıcı kararı.

---

## Bekleme noktası

DUR raporu ver. Karar gelene kadar `auth.js`'e dokunma, Worker'a yeni
endpoint ekleme. Diğer ADIM'lar (6, 7) algoritma kararından bağımsız —
karar gecikirse 6 ve 7'ye geçilebilir, 5'e geri dönülür.

**Karar formatı:** A / B / C — ve "ASEL2026 hash'lensin mi yoksa yeni
parola mı" sorusu için kullanıcı yanıtı.

---

## Önerim

**B (PBKDF2 SHA-256, 100k iter, 16-byte salt, self-describing format).**
Mevcut "ASEL2026" parolasını hash'le (rotasyon yapma — UX süreklilik).
