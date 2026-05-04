# ASEL — Güvenlik & Code Review Özeti (Grup 1-5)

**Tarih:** 2026-05-03
**Kapsam:** Faz 1 deploy öncesi tüm kritik/yüksek bulguları tek yerde topla.
**Mod:** Read-only inceleme; bu doküman bir backup'tır, fix patch'i içermez.
**Bağlam:** Vanilla ES Modules SPA + Supabase REST + Cloudflare Worker + Google Drive.

---

## GRUP 1-4 BULGULARI

### KRİTİK (14)

| # | ID | Dosya | Satır | Özet |
|---|---|---|---|---|
| 1 | A1 | `js/config.js` | hardcoded | Anon JWT key client'ta, decoded payload `exp:2090986298` (~2036), 10 yıllık ömür |
| 2 | A2 | `js/auth.js` | 91 | Misafir password `"ASEL2026"` client-side string compare; bundle'da plain |
| 3 | W1 | `cloudflare-worker.js` | 240, 175, 225, 268+ | **Tüm endpoint'lerde authentication YOK** (`/upload`, `/rapor`, `/raporPdf`, `/foyTest`, default) |
| 4 | W2 | `cloudflare-worker.js` | (foyTest endpoint) | `/foyTest` debug endpoint canlı, stack trace + OAuth response sızdırıyor |
| 5 | W3 | `cloudflare-worker.js` | 262, 904 | Drive uploads `role:'reader', type:'anyone'` → tüm dosyalar public + indekslenebilir |
| 6 | B1 | RLS policies | — | `record_fotograflar` INSERT/DELETE `for {public}` — anon misafir foto silebilir |
| 7 | B2 | RLS policies | — | `santiye_records` INSERT/UPDATE `for {anon, authenticated}` — anon kayıt yazabilir |
| 8 | B3 | RLS policies | — | `personeller` SELECT `for {anon}` — KVKK breach (39 personel adı +) |
| 9 | B4 | `migrations/2026-05-02_santiye_raporlar.sql` | RLS bloğu | `using(true)` + `with check(true)` — tamamen açık politika |
| 10 | B5 | Storage policies | — | `{public}` DELETE/INSERT policy'leri — bucket free-for-all |
| 11 | D1 | `js/db.js` | 39 | `storeDel` daima `Bearer KEY` (anon role) — admin oturumda bile silinen Storage objesi anon ile silinir |
| 12 | D2 | `js/db.js` | 39 (catch) | Sessiz fail `.catch(()=>{})` — silme hatası yutuluyor, audit izi yok |
| 13 | R1 | `js/router.js` | 62, popstate | `tabGec("ayarlar")` `_isMisafir()` kontrolü var **ama** `bnGo` dışında doğrudan çağrılan yollar guardsız; `popstate` handler tamamen guardsız → console bypass kanıtlandı |
| 14 | C1 | `.claude/settings.local.json` | wildcard | `Bash(node *)`, `Bash(awk *)`, `Bash(git push *)` — overly broad; `.gitignore` yok → repo'ya gidebilir |

### YÜKSEK (13)

| # | ID | Dosya | Satır | Özet |
|---|---|---|---|---|
| 1 | D5 | proje kökü | — | `.gitignore` dosyası yok; `.claude/`, `.env`, log, vendor, OS dosyaları korumasız |
| 2 | W4 | `cloudflare-worker.js` | 51-54 | CORS `Access-Control-Allow-Origin: *` — third-party origin'den tetiklenebilir |
| 3 | M1 | `js/main.js` ve modüller | 18 dosya | 65+ `window.*` global; en az 10'u write-triggering, çoğunda defansif `isMisafir` guard yok |
| 4 | S1 | `js/state.js` | 1-53 | `app` doğrudan mutable; `app.bolge="X"` console'dan 1 satırda override (3 satırda full bypass kanıtlandı) |
| 5 | A3 | `js/auth.js` | SESSION_SURE | 5dk idle timeout sadece `click/keydown/touchstart` — `mousemove`, `visibilitychange`, `focus` yok |
| 6 | M2 | `js/main.js` | init flow | Sayfa yüklenirken auth restore yok; tab kapat/aç sonrası state kaybı |
| 7 | R2 | `js/router.js` | 33-34 | UI gating yalnızca `style.display` toggle — DOM'da element duruyor, console'dan görünür yapılır |
| 8 | D3 | `js/data.js` | veriYukle | Misafir/admin tek path; role-based kolon redaction yok (PII export'unun temeli) |
| 9 | D4 | `js/data.js` | bolge filter | Tüm sorgular `app.bolge` ile filter ediliyor; tampering halinde başka bölge erişimi |
| 10 | S2 | `js/state.js` | DEF_P | 39 gerçek personel adı kod içinde (repo public olursa direkt sızıntı) |
| 11 | A4 | `js/auth.js` | logout | Misafir logout server-side hiçbir state temizlemiyor (zaten yok) — sadece `location.reload()` |
| 12 | M3 | `js/main.js` | side-effect imports | Modül yükleme sırası load-bearing; `router.js` `auth.js`'ten önce gerekli — kırılırsa sessiz fail |
| 13 | C2 | git config | — | Pre-existing `git config user.email` yok; commit'lerde per-command flag mecburiyeti |

### Anahtar dosya konum referansları (Grup 1-4'ten)

```
cloudflare-worker.js:51-54     → CORS *
cloudflare-worker.js:240-264   → /upload (auth=0, validation=0)
cloudflare-worker.js:262, 904  → Drive permissions: anyone reader
cloudflare-worker.js:175       → /rapor (Gemini, auth=0)
cloudflare-worker.js:225       → /raporPdf (Drive PDF, auth=0)
js/config.js:1-14              → KEY (anon JWT) hardcoded
js/auth.js:18                  → isMisafir() = _oturum?.rol === "guest"
js/auth.js:22                  → setIsMisafir(isMisafir) injection
js/auth.js:91                  → Misafir "ASEL2026" string compare
js/auth.js:101-115             → realtimeBaslat post-login
js/auth.js:123, 135-136        → realtimeDurdur on logout
js/db.js:39                    → storeDel: Bearer KEY (anon)
js/data.js                     → veriYukle: app.bolge filter, role-blind
js/router.js:11-12             → _isMisafir wrapper, late-binding
js/router.js:33-34             → UI gating via style.display
js/router.js:62                → ayarlar guard (sadece bnGo path'i)
js/state.js:1-53               → app mutable global
js/main.js                     → 18 side-effect imports + window expose
.claude/settings.local.json    → wildcard Bash perms
```

### AÇIK Sorular (Grup 1-4 + Grup 5 cevapları dahil)

**AÇIK-1:** Worker'da rate limiting var mı?
- **Cevap (Grup 2):** Yok. Cloudflare Worker default'unun ötesinde uygulama-içi limiter `cloudflare-worker.js` taramasında kanıtlanamadı. Misafir/anon abuse vektörü açık.

**AÇIK-2:** Realtime RLS davranışı (filter mı reject mi, audit izi var mı)?
- **Cevap (Grup 5 R4):** **Filter** (REJECT değil). Policy false dönerse event sessizce düşer; hata gelmez. `js/realtime.js:56` `ws.onerror = () => {};` — tamamen sessiz. Audit/log yok. Misafir kaçırdığını bilemez.

**AÇIK-3:** photo.js'te `isMisafir` guard'ı VAR mı YOK mu, satır numarası?
- **Cevap (Grup 5 P3):**
  - `kameraAc` (`js/photo.js:32-38`): **YOK**
  - `fotografEkle` (`js/photo.js:40-104`): **YOK**
  - `hasarFotoYukle` (`js/photo.js:106`): **VAR — satır 107**
  - Modal seviyesinde gating var (`record.js:347, 364, 413, 433`) ama Worker auth=0 → console bypass.

**AÇIK-4:** export.js PII export ediyor mu, hangi alanlar?
- **Cevap (Grup 5 E1):** Evet. Export edilen 10 kolondan **`Düzenleyen`** (admin/personel adı) ve **`Personel`** (personeller listesi) KVKK kapsamında. Şantiye orta-düzey lokasyon. Misafir guard yok (E2) → tek tıkla ihraç.

**AÇIK-5:** export.js client-side mı server-side mi authorize ediyor?
- **Cevap (Grup 5 E6):** Tamamen client-side. `app.logSatirlar.filter(...)`. Yeniden fetch yok. Authorization tek katmanda (`data.js::veriYukle` döndürdüğü).

---

## GRUP 5 BULGULARI

### JS/EXPORT.JS (E1-E7)

| ID | Dosya:Satır | Severity | Özet |
|---|---|---|---|
| **E1** | `js/export.js:31, 79-81` | YÜKSEK | Export 10 kolon: `Düzenleyen` + `Personel` PII (KVKK); tarih/bölge filtresi yok |
| **E2** | `js/export.js:18-99`, `index.html:459-460,533-534` | **KRİTİK** | Misafir guard yok; UI'da buton görünür; `window.logExcelIndir()` console'dan misafir oturumda çalışır |
| **E3** | `js/export.js:23` | YÜKSEK | `xlsx@0.18.5` jsdelivr CDN'den, **SRI hash YOK**, `crossOrigin` YOK. CVE-2023-30533 prototype pollution (≤0.19.2) — bu sürüm AÇIK |
| **E4** | `js/export.js:82-94` | **KRİTİK** | PDF template literal'larında `esc()` yok; `s.santiye/alan/malzeme/duzenleyen/personeller` raw string concat → `window.open` + `document.write` ile yeni context'te **stored XSS** mümkün |
| **E5** | `js/export.js:32-49` | YÜKSEK | `aoa_to_sheet`'e geçen string'lerde `=`, `+`, `-`, `@` apostrof prefix'i yok → Excel formula injection (HYPERLINK/DDE) |
| **E6** | `js/export.js:6-16` | ORTA | Tamamen client-side; yeniden fetch yok; auth `data.js`'in döndürdüğüne bağımlı |
| **E7** | `js/export.js:54, 61-96` | DÜŞÜK | Çıktı browser-local (XLSX.writeFile / window.print); Drive/Worker uğramaz |

### JS/PHOTO.JS (P1-P8)

| ID | Dosya:Satır | Severity | Özet |
|---|---|---|---|
| **P1** | `js/photo.js:32-38, 40-104, 106-154` | bilgi | Tek upload yolu: Cloudflare Worker (`DRIVE_URL`); Supabase Storage doğrudan kullanılmıyor |
| **P2** | `js/photo.js:83, 132, 137-140`; `cloudflare-worker.js:240-264` | YÜKSEK | `bolge` client'tan; Worker auth=0 → cross-bölge Drive yazma; `record_fotograflar`'da `uploaded_by` yok (audit boşluğu) |
| **P3** | `js/photo.js:32-38, 40-104` | **KRİTİK** | `kameraAc` & `fotografEkle` `isMisafir` guard YOK; modal gating bypass edilince console'dan Worker'a yükleme tamamlanır (Worker auth=0) |
| **P4** | `js/photo.js:34, 109`; `cloudflare-worker.js:240-264` | **KRİTİK** | File size, MIME whitelist, magic byte verification YOK (client'ta `accept="image/*"` UI hint'i, server'da hiç) → 100MB ZIP/EXE yüklenebilir |
| **P5** | `js/photo.js:21-25`; `cloudflare-worker.js:262` | ORTA | Canvas re-encode EXIF'i de-facto stripler ✓; ama console bypass + Drive `anyone reader` → orijinal EXIF yüklemesi mümkün |
| **P6** | `cloudflare-worker.js:51-54` | YÜKSEK | CORS `*`, Origin whitelist yok, CSRF token yok → cross-origin form ile saldırgan ziyaretçilerini Drive'a yükleme botuna çevirebilir |
| **P7** | `js/photo.js` | kanıtlanamadı | Photo.js Gemini'ye doğrudan göndermez; `aiRaporUret` Worker tarafında — bu dosyada bağ yok |
| **P8** | `js/photo.js:13, 24, 27, 88, 165` | DÜŞÜK | `revokeObjectURL` çoğunlukla doğru; ama `yeniFotoSil`'de Drive URL üzerine revoke (no-op); modal kapanışta `app.form` reset kanıtlanamadı → blob leak |

### JS/REALTIME.JS (R1-R8)

| ID | Dosya:Satır | Severity | Özet |
|---|---|---|---|
| **R1** | `js/realtime.js:8-14, 23-25` | DÜŞÜK | `createClient` değil raw WebSocket + Phoenix manuel; singleton ✓ |
| **R2** | `js/realtime.js:17-26` | YÜKSEK | 6 tablo, **filter YOK** (`bolge=eq.X` gibi) → tüm bölge event'leri WS'e düşer |
| **R3** | `js/realtime.js:12-13, 23` | **KRİTİK** | Misafir oturumda token = anon `KEY` (URL ve phx_join'de); misafir realtime'a anon role ile bağlanır → `for {public}` policy event'lerini görür |
| **R4** | `js/realtime.js:49-56` | ORTA | Realtime RLS = silent filter (REJECT değil); `ws.onerror=()=>{};` audit yok → kaçırılan event'i kullanıcı bilmez (bug, feature değil) |
| **R5** | `js/realtime.js:11, 60, 69`; `js/auth.js:101-136` | DÜŞÜK | Lifecycle çoğunlukla doğru; `setTimeout(realtimeBaslat, 5000)` re-entrance race'i mümkün ama frekans düşük |
| **R6** | `js/realtime.js:33-54` | DÜŞÜK | `debounce(500)` ✓; ama her event tüm 8 tabloyu yeniden çeker (N+1) |
| **R7** | `js/realtime.js:60` | ORTA | JWT expire handle edilmiyor; refresh token logic yok; 5sn fixed reconnect = exponential backoff yok |
| **R8** | `js/realtime.js` | N/A | Presence kullanılmıyor — leak yok |

### KRİTİK olarak yeniden etiketlenenler (Chained Exploits)

**Chain-1: E2 + E4 + E5 (PDF Stored XSS + Formula Injection)**
- Saldırgan `santiye_records.malzeme = '<img src=x onerror="fetch(...)">' veya `=HYPERLINK(...)` → anon INSERT (B2) ile yazar.
- Misafir veya admin `logPdfIndir()` çağırır → yeni window context'te XSS execute / Excel'de formula execute.
- E2 misafir guard yok + E4 `esc()` yok + E5 prefix yok = **tek payload üç kanaldan etki**.

**Chain-2: P3 + P4 (Console Bypass → Drive Botnet)**
- Misafir `app.form.asamalar=[{yeniFotolar:[]}]` → `window.fotografEkle(0, {files:[anyFile]})` → Worker'a fetch.
- Worker (W1, P4) auth=0 + size/MIME/magic byte kontrol=0 → **Drive'a 100MB EXE/ZIP/jpg-disguised-malware** yüklenir, `anyone reader` (W3) ile public dağıtılır.
- P3 misafir guard yok + P4 server validation yok = **Drive depolama abuse + malware hosting**.

**Chain-3: P3 + R3 (Misafir Surface)**
- Misafir hem Drive'a yazabilir (Chain-2) hem realtime'a anon ile bağlı (R3); başka bölgelerin event'lerini timing/sayım üzerinden görür.
- WebSocket ile sürekli bağlı + login akışında otomatik tetiklenir → pasif keşif kanalı.

**Chain-4: E4 + utils.js esc() errata**
- E4 zaten `esc()` çağrılmıyor (KRİTİK).
- Çağrılsaydı bile `esc()` (utils.js:6-11) tek tırnak `'` ve backtick `` ` `` encode etmiyor → attribute context (`onclick='${esc(x)}'`) hâlâ bypass edilebilir.
- E4 P0 fix'i sadece `${...}` → `${esc(...)}` değil; aynı zamanda `esc()` kendisi de güçlendirilmeli.

---

## ESC() ERRATA (Yeni — Grup 5+)

**Dosya:** `js/utils.js:6-11`

**Mevcut kod:**
```js
 6  export const esc = (s) =>
 7    String(s ?? "")
 8      .replace(/&/g, "&amp;")
 9      .replace(/</g, "&lt;")
10      .replace(/>/g, "&gt;")
11      .replace(/"/g, "&quot;");
```

**Eksik:** `'` (single quote) ve `` ` `` (backtick) encode edilmiyor.

**Sömürü vektörü:**
- HTML attribute context'te tek tırnak kullanan bir template (`<div onclick='handler(${esc(x)})'>` veya `<img alt='${esc(x)}'>`) varsa → `'` çıkışı bypass eder.
- Template literal context'te (`` `...${esc(x)}...` `` içinde dinamik HTML üretiliyorsa) → `` ` `` çıkışı template'i kırar.

**Etki kapsamı:**
- `utils.js`'de tek dahili kullanımı: `toast()` mesajı (`utils.js:67`) — toast HTML'i double-quote attribute kullandığı için bu özelinde güvenli.
- Ama `esc()` proje genelinde import ediliyor (`utils.js:6 export const esc` → birçok view/modal'da kullanım); attribute context'te kullanılan yerlerde **bypass riski**.

**Fix (önerilen, P0'a yükseltildi — Grup 5 E4 ile aynı patch'te):**
```js
export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
```

**Retroaktif severity:** ORTA (bireysel) → YÜKSEK (E4 ile birlikte chain).
**Faz 1 deploy listesi:** P0 (E4 fix'inde aynı patch ile).

---

## AÇIK SORULAR (Grup 6 öncesi)

| ID | Soru | Nereye bakılacak |
|---|---|---|
| **AÇIK-6** | `record_fotograflar` schema'sında `uploaded_by`, `created_by`, `created_at` benzeri audit kolonları var mı? Yoksa migration ile eklenmeli mi? | `migrations/2026-05-02_santiye_raporlar.sql` ve `record_fotograflar` tablosunun create migration'ı |
| **AÇIK-7** | `xlsx@0.18.5` ile `xlsx-style` veya stilli export uyumlu mu, yoksa SheetJS'in resmi paket migrasyon mesajı görmezden mi gelinmiş? | `js/export.js:23` ve npm/sheetjs.com sürüm notları |
| **AÇIK-8** | `auth.js` misafir login flow'unda `realtimeBaslat` çağrılıyor mu? (R3 etkisi misafire gerçekten ulaşıyor mu?) | `js/auth.js` misafir branch (muhtemelen `misafirGirisYap` benzeri fonksiyon) |
| **AÇIK-9** | `record.js::sbKaydet`'te `isMisafir` guard ilk satırda var mı? UI guard'lar (`record.js:347, 364, 413, 433`) civarında — ama save fonksiyonunun kendisi guarded mı? | `js/modals/record.js::sbKaydet` |
| **AÇIK-10** | `aiRaporUret` (`cloudflare-worker.js:692+`) Gemini'ye `fotolar` array'ini image-part olarak mı gönderiyor? Eğer evet, multimodal prompt injection yüzeyi var mı? `responseSchema` enforce ediyor ama saldırgan komut sızıntısı kalıyor mu? | `cloudflare-worker.js:692-...` aiRaporUret + Gemini API request body |

---

## FAZ 1 DEPLOY SIRASI

### P0 — Aynı gün (kritik, exploit'ten korunma)

| Sıra | ID | Fix özet | Tahmini süre |
|---|---|---|---|
| 1 | **E2** | `index.html:459-460, 533-534` butonlarına `${!isMisafir() ? ... : ""}` + `js/export.js:18, 58` fonksiyon başına `if (isMisafir()) { toast(...); return; }` | 10 dk |
| 2 | **P3** | `js/photo.js:32, 40` (`kameraAc`, `fotografEkle`) ilk satırına `if (isMisafir()) { toast(...); return; }` | 5 dk |
| 3 | **R3** | `js/realtime.js:10` `realtimeBaslat` ilk satırına `if (isMisafir()) return;` | 1 dk |
| 4 | **W1** (kısa-vade) | `cloudflare-worker.js` tüm endpoint'lere bir Bearer/HMAC paylaşılan-sır check; uygun pattern hazırken `/foyTest`'i kapat | 1 sa |
| 5 | **W2** | `/foyTest` endpoint'ini production worker'dan kaldır (veya env-gated yap) | 10 dk |
| 6 | **E4 + esc() errata** | `js/export.js:82-94` tüm `${...}` → `${esc(...)}` + `js/utils.js:6-11` esc()'ye `'` ve `` ` `` replace ekle | 30 dk |
| 7 | **E5** | `js/export.js`'e formula prefix helper: `String(v).replace(/^([=+\-@\t\r])/, "'$1")` + 8 metin kolonuna uygula | 30 dk |
| 8 | **B3** | `personeller` SELECT policy'sini `for {anon}` → `for {authenticated}` (KVKK) | 5 dk (SQL) |
| 9 | **B1** | `record_fotograflar` INSERT/DELETE `for {public}` → `for {authenticated}` | 5 dk |
| 10 | **B2** | `santiye_records` INSERT/UPDATE `for {anon, authenticated}` → `for {authenticated}` | 5 dk |
| 11 | **B5** | Storage `{public}` DELETE/INSERT policy'lerini revize | 10 dk |

**P0 toplam:** ~3 saat (dağıtık değişiklik, tek oturumda toparlanır).

### P1 — 24 saat (yüksek, exploit zorlaştırma)

| Sıra | ID | Fix özet |
|---|---|---|
| 1 | **E3** | xlsx CDN → SheetJS resmi (cdn.sheetjs.com) veya self-host; `integrity` SRI hash + `crossOrigin="anonymous"` |
| 2 | **P4** | Worker `/upload` body validation: size cap (≤10MB base64), MIME whitelist (image/jpeg|png|webp), ilk 12 byte magic number check, fileName uzantı whitelist |
| 3 | **P6** | Worker CORS `*` → Origin whitelist; (W1 fix'iyle birlikte uygulanır) |
| 4 | **R2** | Realtime topic'lere `:bolge=eq.${app.bolge}` filter ekle |
| 5 | **D1+D2** | `js/db.js:39` `storeDel` `H` (header) kullansın, sessiz `.catch` yerine toast + console.warn |
| 6 | **B4** | `migrations/2026-05-02_santiye_raporlar.sql` RLS `using(true)` + `with check(true)` → role/bolge kısıtlı |
| 7 | **W3** | Drive permission `anyone reader` → restricted; URL'leri kısa-ömürlü signed link ile sun (Worker proxy) |
| 8 | **R1 (config.js audit)** | Anon JWT key'i hâlâ public bundle'da olacak ama RLS sıkıştırıldıktan sonra etkisi sınırlı — ek bir Worker proxy düşün |
| 9 | **A2** | Misafir password hâlâ client-side gerekiyorsa: en azından bcrypt hash + WebCrypto karşılaştırma; Hash bile bypass edilebilir ama "sürtünme" eklenir |
| 10 | **R7** | Realtime reconnect: `auth.refreshSession()` + exponential backoff (5s → 60s, max 5dk) |

**P1 toplam:** ~1 iş günü.

### P2 — Sprint (mimari sıkılaştırma, debt)

| Sıra | ID | Fix özet |
|---|---|---|
| 1 | **D5 + C1** | `.gitignore` oluştur (`.claude/`, `.env`, `node_modules`, `*.log`, OS dosyaları); `.claude/settings.local.json` wildcard'ları daralt |
| 2 | **M1 + R2** | Window globals envanteri; gereksizleri kaldır; UI gating'i `style.display` yerine conditional render'a çevir |
| 3 | **S1** | `app` mutable global → `setState` pattern (immutable update) veya en azından `Object.freeze` proxy |
| 4 | **A3** | Idle timeout event listener'ları genişlet (`mousemove`, `visibilitychange`, `focus`, `blur`) |
| 5 | **R4** | Realtime audit log: `ws.onerror` boş yerine telemetry; periyodik full-reload safety net (5dk) |
| 6 | **R6** | Realtime event handling: tüm-yenile yerine tablo-spesifik diff |
| 7 | **D3** | `data.js` role-based kolon redaction (misafire `personeller`, `duzenleyen` maskele) |
| 8 | **S2** | `DEF_P` 39 gerçek isim — env'e veya seed migration'a taşı; bundle'dan kaldır |
| 9 | **AÇIK-6** | `record_fotograflar` schema'ya `uploaded_by`, `created_at server default` ekle |
| 10 | **C2 + A4** | Git config sabit değer; misafir logout'ta state temizleme; commit guard |

**P2 toplam:** 1-2 sprint.

---

## NOTLAR

- Bu doküman **Grup 5 sonu itibariyle** snapshot'tır. Grup 6 (henüz başlamadı) genellikle `js/views/*` ve `js/modals/note.js` + `rapor.js` derin inceleme + `migrations/*.sql` schema doğrulaması içerebilir.
- `js/modals/rapor.js` (733 satır) ve `js/modals/record.js` (453 satır) Grup 1-4'te yüzeysel referansla incelendi; tam line-by-line güvenlik review yapılmadı (büyük dosyalar). Grup 6'da öncelik aday'ı.
- `cloudflare-worker.js` (913 satır) Grup 2'de incelendi ama lazy lookup refactor sonrası (commit `338624b`) yeni eklenen `kosterFoyKategoriMap`, `kosterFoyMalzemeBul`, `kosterWebAra` fonksiyonları ayrıca cache poisoning / SSRF / regex-DoS açısından gözden geçirilmedi.
- `MODULES.md` ve `CLAUDE.md` developer dökümantasyonu — `MODULES.md` cycle breaking contract'larını anlatıyor; herhangi bir refactor (`storeDel` H'ye geç vs.) `MODULES.md`'yi güncellemek gerekir.

**Doküman sonu.**
