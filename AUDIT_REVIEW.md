# AUDIT_REVIEW.md

**Audit tarihi:** 2026-05-04
**Audit kapsamı:** ASEL Şantiye Takip — kök dizin tamamı (sıfırdan, bugünkü standartla)
**Branch:** `claude/refactor-code-cleanup-9HnhE` (38 commit ahead of origin)
**Audit sahibi:** Claude Code (Opus 4.7, 1M context)
**Çıktı:** Bu dosya. Mevcut hiçbir kaynak/meta dosyaya dokunulmuyor.

---

## 0. Audit metodolojisi

### 0.1 Tetikleyici
Faz 2+3 boyunca verilen bazı önerilerin hatalı çıktığı tespit edildi (B4-NIT'te `crypto.randomUUID()` önerisi rate limit'i tamamen kıracaktı). Bu single-point hata olabilir, olmayabilir. Sıfırdan, acelesiz, **bugünkü standartla** review.

### 0.2 Çalışma prensibi
- Her dosya tek tek baştan sona okunur.
- Önceki turlarda "kapanmış" ya da "kabul edilmiş" olsa bile sıfırdan sorgulanır.
- "OK" demek için 1-2 cümle somut kanıt zorunlu — yüzeysel "temiz" yasak.
- **Fix yok, sadece envanter.** Bulgular kaydedilir; düzeltme ayrı tur (kullanıcı izni ile).
- USER_DECISION gereken her durakta sorgu §9'a yazılır, kullanıcı yanıtına kadar fix önerilmez.

### 0.3 Faz sıralaması
1. **Frontend JS** (20 dosya, bağımlılık zinciri sırasıyla)
2. **Worker** (1 dosya, endpoint başına ayrı tetkik)
3. **Migrations** (6 SQL, 2026-05-02 → 2026-05-04 sırasıyla)
4. **Config + Scripts + HTML/CSS** (12 dosya)
5. **Cross-cutting senaryolar** (10 senaryo, brief Section C)
6. **USER_DECISION yeniden değerlendirme** (5 karar, brief Section D)
7. **SQL/Deploy bütünlüğü** (brief Section E)
8. **Smoke test review** (brief Section F)
9. **Sınıflandırma + aksiyon planı + açık sorular**

### 0.4 Bulgu sınıflandırma kriterleri
- 🔴 **BLOCKER** — deploy öncesi MUTLAKA fix. Auth bypass, RLS sızıntı, secret leak, DoS vektörü, data loss riski, çalışmaz kod.
- 🟡 **ÖNEMLİ** — fix önerilir, gerekçeli skip kabul. UX hatası, defansif eksik, log gürültüsü, edge-case bug.
- 🟢 **NIT** — hijyen, post-deploy/P3. Kod stili, comment, dead code, micro-optimizasyon.

### 0.5 Bulgu şablonu
```
### B# — [Kısa başlık]
**Sınıf:** 🔴/🟡/🟢
**Kapsam:** [dosya:satır]
**Bulgu:** [ne]
**Niye problem:** [neden]
**Düzeltme önerisi:** [nasıl]
**Alternatif:** [varsa]
**Önceki tur'da yakalanmamış mıydı?:** [evet/hayır + ne zaman]
```

### 0.6 Compact stratejisi
Context %75'e ulaşırsa bu dosyaya `## İlerleme Durumu` başlığı altında nereye kaldığım yazılır → `/compact` → kalan yerden devam. Yarım fix yok, yarım not olabilir.

---

## 1. Dosya envanteri

### 1.1 Tracked dosyalar (45 in-scope + 12 meta)

| Dosya | LoC | Son commit | Tarih |
|---|---:|---|---|
| **Worker** | | | |
| cloudflare-worker.js | 1127 | ca7a31a | 2026-05-04 |
| **Frontend JS — root (12)** | | | |
| js/auth.js | 193 | 847f0a3 | 2026-05-04 |
| js/config.js | 13 | 5ab2d67 | 2026-05-01 |
| js/data.js | 109 | 09196f4 | 2026-05-03 |
| js/db.js | 42 | 8dcdb60 | 2026-05-04 |
| js/export.js | 111 | 46d6c84 | 2026-05-04 |
| js/lightbox.js | 137 | 5ab2d67 | 2026-05-01 |
| js/main.js | 112 | 09196f4 | 2026-05-03 |
| js/mask.js | 63 | 847f0a3 | 2026-05-04 |
| js/photo.js | 181 | 73acc12 | 2026-05-04 |
| js/realtime.js | 119 | b893e19 | 2026-05-04 |
| js/router.js | 99 | 5ab2d67 | 2026-05-01 |
| js/state.js | 53 | 5ab2d67 | 2026-05-01 |
| js/utils.js | 83 | f1efc11 | 2026-05-04 |
| **Frontend JS — views (5)** | | | |
| js/views/ayarlar.js | 102 | d86f2d9 | 2026-05-04 |
| js/views/dashboard.js | 127 | d406f60 | 2026-05-04 |
| js/views/detail.js | 160 | 09196f4 | 2026-05-03 |
| js/views/log.js | 91 | 5ab2d67 | 2026-05-01 |
| js/views/projects.js | 212 | 5ab2d67 | 2026-05-01 |
| **Frontend JS — modals (4)** | | | |
| js/modals/note.js | 50 | 1c7569b | 2026-05-04 |
| js/modals/rapor-assets.js | 5 | 09196f4 | 2026-05-03 |
| js/modals/rapor.js | 735 | 23b2ddb | 2026-05-04 |
| js/modals/record.js | 454 | 944d5f6 | 2026-05-04 |
| **Migrations (7)** | | | |
| migrations/2026-05-02_santiye_raporlar.sql | 51 | 09196f4 | 2026-05-03 |
| migrations/2026-05-03_file_id_backfill.sql | 36 | 09196f4 | 2026-05-03 |
| migrations/2026-05-04_p0_rls_sikilastir.sql | 70 | 1479ca5 | 2026-05-04 |
| migrations/2026-05-04_p1_policy_consolidation.sql | 87 | 7b5b8d2 | 2026-05-04 |
| migrations/2026-05-04_p1_santiye_raporlar_rls.sql | 84 | 304b4d1 | 2026-05-04 |
| migrations/2026-05-04_p1_open1_storage_misafir_kapat.sql | 67 | ec8386c | 2026-05-04 |
| migrations/2026-05-04_p3_malzemeler_consolidation.sql | 61 | de4f471 | 2026-05-04 |
| **Config (4)** | | | |
| wrangler.toml | 37 | cd0d315 | 2026-05-04 |
| .gitignore | 54 | 353b534 | 2026-05-04 |
| .cfignore | 39 | 353b534 | 2026-05-04 |
| .gitattributes | 41 | bbe70d0 | 2026-05-04 |
| **Scripts (2)** | | | |
| scripts/hash_misafir_pass.mjs | 49 | 5f6645b | 2026-05-04 |
| scripts/smoke.sh | 268 | 304b4d1 | 2026-05-04 |
| **HTML / CSS / Manifest (9)** | | | |
| index.html | 1054 | 5f6645b | 2026-05-04 |
| asel-logo-animation.html | 306 | cfdc128 | 2026-04-30 |
| manifest.json | 24 | ecb1f2e | 2026-05-01 |
| css/base.css | 71 | 5ab2d67 | 2026-05-01 |
| css/components.css | 442 | 09196f4 | 2026-05-03 |
| css/layout.css | 151 | 5ab2d67 | 2026-05-01 |
| css/lightbox.css | 111 | 5ab2d67 | 2026-05-01 |
| css/modals.css | 402 | 5ab2d67 | 2026-05-01 |
| css/views.css | 925 | 5ab2d67 | 2026-05-01 |
| **Toplam (in-scope)** | **8808** | | |

### 1.2 Meta dokümanlar (audit kapsamı dışında, referans için)
| Dosya | LoC | Açıklama |
|---|---:|---|
| AUDIT_FINAL.md | 704 | Önceki audit raporu (Faz 1+2+3 sonuç) |
| AUDIT_GRUP1-5_OZET.md | 275 | Önceki audit özeti |
| HANDOFF.md | 65 | Devir notları |
| MANUAL_TASKS.md | 589 | Deploy turu (M-1..M9) |
| CHANGES_SUMMARY.md | 49 | Faz tablosu |
| SESSION_CHECKPOINT.md | 95 | Çalışma checkpoint'i |
| MODULES.md | 138 | Modül haritası |
| RAPOR_SPEC.md | 695 | Gemini rapor sözleşmesi |
| CLAUDE.md | 89 | Codebase rehberi |
| docs/USER_DECISION_P1-8_MISAFIR_HASH.md | 133 | P1-8 karar dökümanı |
| docs/session-2026-05-03.md | 129 | Eski session log |

### 1.3 Untracked / beklenmedik dosya

| Dosya | LoC | Statü | Aksiyon |
|---|---:|---|---|
| **MIMARI.md** | 457 | UNTRACKED, git ls-files'da yok | §4'te içerik incelenecek; track et / sil / .gitignore kararı için §9'da soru |

### 1.4 .claude/ klasörü
- Brief diyor ki: "CC'nin kendi config'i, audit dışı ama varlığını doğrula (.gitignore'da olmalı, accidental commit yok mu?)"
- `git status` çıktısında `.claude/` görünmüyor → ya tracked (kötü) ya da ignored (iyi). `.gitignore` dosyası §2.4'te incelenecek.

### 1.5 Tehlikeli dosya taraması
Brief'te belirtilen tehlikeli pattern'lar (`.env`, `*.bak`, `*.old`, `_eski_*`, `_draft_*`, `node_modules/`, secrets) — `git ls-files` ve untracked listesinde **YOK**. Türkçe karakter (ş/ı/ğ) içeren dosya adı — yok.

### 1.6 Brief A listesi vs gerçek envanter farkları
Brief Section A listesinde **bulunmayan** (ama audit kapsamına alınan) dosyalar:
- `js/modals/note.js`, `js/modals/rapor-assets.js` — brief sadece "modals/photo.js (varsa)" demiş, modal listesi eksik
- 6× CSS, `manifest.json`, `asel-logo-animation.html` — brief'te yok ama deploy edilen statik asset
- `migrations/2026-05-02_santiye_raporlar.sql`, `migrations/2026-05-03_file_id_backfill.sql` — brief sadece "tüm P0 migration'ları" diyor; bunlar P0 öncesi baseline

Brief Section A listesinde **olup gerçekte olmayan** dosyalar:
- `js/modals/photo.js` — yok, brief "varsa" diyor, foto upload mantığı `js/photo.js` ve `js/modals/record.js` arasında dağılmış

---

## 2. Kod katmanı bulguları

_(Faz 1-4 boyunca buraya yazılacak. Şu an boş — audit henüz başlamadı.)_

### 2.1 Frontend (js/*)

**Genel kanı:** XSS hijyeni güçlü (her DOM yazımında `esc()` kullanılıyor), formula injection (Excel) mitigation `safeCell` ile çözülmüş (export.js:19-22 — **mükemmel** — birçok proje bunu unutur), encodeURIComponent ile URL injection korumalı, misafir guard her mutating action'da var. Ana zayıflık: **silent error handling pattern** — birçok kritik DB operasyonu `.catch(() => {})` ile yutuyor, kullanıcı failure'dan haberdar olmuyor, atomicity garantisi yok.

#### B1 — `storeDel` HTTP hata kontrolü yok (silent fail)
**Sınıf:** 🟡 ÖNEMLİ
**Kapsam:** `js/db.js:36-42`
**Bulgu:** `storeDel` fetch DELETE çağrısında `r.ok` kontrolü yok. Storage 4xx/5xx dönerse silent başarılı sayılır.
**Niye problem:** Foto silme `await storeDel([...])` ile çağrılıyor (record.js:74, 419, 437) — Storage delete fail ederse caller "silindi" toast'ı atar ama dosya hâlâ Storage'da. Orphan asset birikir, kullanıcı yanılır.
**Düzeltme önerisi:** `if (!r.ok) throw new Error(...)` ekle, caller `.catch` ile yakalar.
**Alternatif:** Resp body içindeki `error` alanını parse edip ayrı toast.
**Önceki tur'da yakalanmamış mıydı?:** P1-5 commit `8dcdb60` sadece header düzeltmiş, error handling değiştirmemiş.

#### B2 — `KULLANICI_ADLARI` miss → "Admin" hard-mask kollizyonu
**Sınıf:** 🟡 ÖNEMLİ (USER_DECISION gerekli)
**Kapsam:** `js/auth.js:78-87`
**Bulgu:** Yeni admin login → email map'te yok → `maskPII(email)` çağrılır. Worker secret OK ise `pii:hash`, Worker erişilemezse veya başka hata `ad = "Admin"` hard-mask. 2+ farklı admin "Admin" olarak DB'ye yazılır → log/dashboard'da ayırt edilemez.
**Niye problem:** Brief Senaryo 1: yeni admin `KULLANICI_ADLARI`'ya eklenmemişse + Worker erişilemiyorsa, log'da `duzenleyen = "Admin"` 2+ farklı kişi için aynı görünür. Audit trail bütünlüğü kaybolur.
**Düzeltme önerisi:**
- A) Map miss + Worker miss durumunda login REDDET (sıkı): "Admin map'te değil ve PII servis erişilemez, login engelleniyor".
- B) `_oturum.ad = "Admin#" + last4(emailHash)` deterministik 4-hex suffix → en azından ayırt edilebilir.
- C) Mevcut davranış kabul (CLAUDE.md'ye doc ekle).
**Alternatif:** Worker'a `/whoami` endpoint ekle → admin map'i Worker'da tut → frontend'e dönsün.
**Önceki tur'da yakalanmamış mıydı?:** Bilinçli tradeoff olarak duruyor (auth.js:79-86 yorum); brief Senaryo 1'de açıkça soruluyor, daha önce karara bağlanmamış. **§9 USER_DECISION**.

#### B3 — `supabaseCikis` silent catch — logout fail kullanıcıya yansımıyor
**Sınıf:** 🟢 NIT
**Kapsam:** `js/auth.js:35-40`
**Bulgu:** `supabaseCikis` POST `/auth/v1/logout` `.catch(() => {})`. Logout fail = token revoke edilmemiş; client local state silinir ama Supabase'de session aktif kalır (token süresi boyunca).
**Niye problem:** Kullanıcı "çıkış yaptım" sanır, ama JWT TTL boyunca (default Supabase 1h) eski token hâlâ geçerli. Token bir yere sızmışsa pencere açık.
**Düzeltme önerisi:** `.catch((e) => console.warn("logout fail:", e.message))` + toast `"Sunucu logout cevap vermedi, oturum local olarak kapatıldı"`.
**Önceki tur'da yakalanmamış mıydı?:** Hayır. Kabul edilebilir riskti, ama transparency adına NIT.

#### B4 — Session timeout: scroll/wheel coverage yok
**Sınıf:** 🟢 NIT
**Kapsam:** `js/auth.js:186-188`
**Bulgu:** `["click", "keydown", "touchstart"]` listener — kullanıcı bir sayfayı sadece okuyor (scroll/wheel) ise 5dk sonra logout edilir.
**Niye problem:** UX — uzun rapor okunurken oturum düşer.
**Düzeltme önerisi:** `["click", "keydown", "touchstart", "wheel", "scroll", "mousemove"]` (mousemove'ı throttle ile, çünkü çok sık tetiklenir).
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B5 — Misafir oturumunda `maskPII` Worker'a anon JWT ile gider
**Sınıf:** 🟢 NIT
**Kapsam:** `js/mask.js:39-42` + Worker /maskPII auth gate
**Bulgu:** `H.Authorization` her zaman `Bearer <token>` formatında (anon KEY veya user JWT). Misafir oturumda `H.Authorization = "Bearer <anonKEY>"` → startsWith("Bearer ") TRUE → fetch tetiklenir → Worker JWT verify fail → 401 → `if (!r.ok) continue;` → cache yok → input plain return.
**Niye problem:** Gereksiz Worker çağrısı, gereksiz log gürültüsü, sessiz failure (geliştirici görmez). Şu an misafir dashboard'a gitmiyor (router guard yok ama UI'da link yok), ama defansif olarak fail-fast iyi.
**Düzeltme önerisi:** `auth.startsWith("Bearer ") && !H.Authorization.endsWith(KEY)` veya `oturumYukle()?.token` kontrolü ekle. (auth.js'ten import circular değil — mask.js bağımsız.)
**Alternatif:** `import { isMisafir } from "./auth.js"` + `if (isMisafir()) return sValues`.
**Önceki tur'da yakalanmamış mıydı?:** B2 race fix sonrası `H.Authorization`'a geçildi; misafir kornesi düşünülmemiş.

#### B6 — Realtime child tablolarda bolge filter YOK → cross-region metadata leak
**Sınıf:** 🟢 NIT
**Kapsam:** `js/realtime.js:70-83`
**Bulgu:** `record_asamalar` ve `record_fotograflar` tablolarında `bolge` kolonu yok → topic-suffix bolge filter eklenmemiş → Realtime stream tüm bölgelerin event'lerini gönderir.
**Niye problem:**
- Bandwidth waste (event sayısı ölçeklenince),
- Privacy leak: başka bölgenin row'ları (record_id, asama_no, fotograf URL'i) WS payload'unda görünür. Veriyi RLS reddetmiyor (Realtime CDC RLS uygular ama child tablolarda bolge yok).
- ÖZELLİKLE record_fotograflar.file_url (Drive public URL) görünür → başka bölgenin fotoğraflarına linkten erişim mümkün (URL guess-able değil ama leak'lenmiş URL artık erişilebilir).
**Düzeltme önerisi:** Child tablolara `bolge` denormalize et (FK upsert + parent record'tan kopyala) → topic suffix uygula. Veya: subscription'ı parent record_id list'iyle sınırla (server-side filter dinamik bina).
**Alternatif:** Mevcut davranış kabul + AUDIT_FINAL'e doc ekle.
**Önceki tur'da yakalanmamış mıydı?:** P1-4 commit `20e8f10` parent tablolar için filter ekledi, child'lar için "bolge yok, atla" dedi. Bu envanter NIT olarak işaretliyor.

#### B7 — `ws.onerror = () => {}` sessiz
**Sınıf:** 🟢 NIT
**Kapsam:** `js/realtime.js:101`
**Bulgu:** WS error handler boş; debug için console.warn yok.
**Niye problem:** Production'da realtime kopuşları teşhis edilemez. (onclose tetiklendiği için reconnect çalışır, ama hata sebebi görünmez.)
**Düzeltme önerisi:** `ws.onerror = (e) => console.warn("realtime ws error:", e.type)`.
**Önceki tur'da yakalanmamış mıydı?:** P1-9 commit `b893e19` reconnect/backoff ekledi, error transparency atlandı.

#### B8 — `hasarFotoYukle` Drive upload + DB insert arası orphan riski
**Sınıf:** 🟢 NIT
**Kapsam:** `js/photo.js:127-146`
**Bulgu:** Drive'a upload başarılı + `dbPost("record_fotograflar", ...)` fail → toast "Yüklenemedi" — ama Drive'da dosya kaldı. Compensating delete yok.
**Niye problem:** Drive'da orphan dosya birikir. Quota dolar, manuel temizlik gerekir.
**Düzeltme önerisi:** `try/catch` içinde dbPost fail durumunda Worker'a `/fotoSil?fileId=X` çağır. Veya: önce DB rekorunu insert et (placeholder URL ile), sonra Drive upload, sonra UPDATE — ama bu daha karmaşık.
**Alternatif:** Cron job ile orphan tespiti (deploy dışı).
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B9 — `fotografEkle` / `hasarFotoYukle` `resp.json()` catch yok
**Sınıf:** 🟢 NIT
**Kapsam:** `js/photo.js:88, 137`
**Bulgu:** `const data = await resp.json();` — Worker 401/500 + body geçersiz JSON ise exception. Outer try-catch yakalar, ama mesaj `"Unexpected token < in JSON"` gibi cryptic olur.
**Düzeltme önerisi:** `await resp.json().catch(() => ({}))` + `if (!resp.ok) throw new Error(data.error || "HTTP " + resp.status)`.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B10 — `views/log.js` PII fallback YOK — `dashboard.js` ile tutarsız
**Sınıf:** 🟡 ÖNEMLİ
**Kapsam:** `js/views/log.js:55, 75` vs `js/views/dashboard.js:30-35` (`_piiGoster`)
**Bulgu:** Dashboard `_piiGoster` ham email'i "Admin" hard-mask'lar (Worker erişilemezse). Log view aynı satırları gösteriyor ama mask uygulamıyor — `esc(s.duzenleyen || "—")` doğrudan yazıyor.
**Niye problem:** Legacy DB satırları (P1-10 öncesi) `duzenleyen` kolonunda raw email içeriyorsa, log view'da plain görünür. M0 pre-deploy SELECT DISTINCT bu satırları temizleyecek (kullanıcı manuel) ama her ihtimale karşı runtime defansif gerekli. Tutarsızlık → bug-prone.
**Düzeltme önerisi:** Dashboard'daki `_piiAdayMi/_piiPrefetch/_piiGoster` üçlüsünü ortak `js/mask-helpers.js`'e taşı, log.js + export.js + dashboard.js paylaşsın. log.js render path'inde `await _piiPrefetch(satirlar.map(s => s.duzenleyen))`, sonra `_piiGoster` ile render.
**Alternatif:** M0 pre-deploy check'in 100% temizlik garantisine güven (kabul = NIT'e düşer).
**Önceki tur'da yakalanmamış mıydı?:** P1-14 dashboard mask ekledi, log view'a uygulanmamış.

#### B11 — `dashboard.js _piiPrefetch render path'inde await`
**Sınıf:** 🟢 NIT
**Kapsam:** `js/views/dashboard.js:58`
**Bulgu:** `await _piiPrefetch(...)` render fonksiyonu içinde — fetch 100-500ms sürer → dashboard görünene kadar boş ekran.
**Niye problem:** UX — kullanıcı dashboard'a tıklayınca anında görünmez.
**Düzeltme önerisi:** Önce render et (raw veya placeholder), sonra _piiPrefetch + ikinci render. Ya da skeleton loader.
**Alternatif:** Mevcut kabul (görünür gecikme küçük).
**Önceki tur'da yakalanmamış mıydı?:** P1-14 commit'te seçilmiş tradeoff (race önleyen).

#### B12 — `record.js sbKaydet` silent `.catch(() => {})` (4 yerde)
**Sınıf:** 🟡 ÖNEMLİ
**Kapsam:** `js/modals/record.js:44, 50, 70, 74-75`
**Bulgu:**
- L44: `dbDelete("record_asamalar", ...).catch(() => {})` — eski aşamaları sil
- L50: `dbPost("record_asamalar", ...).catch(() => {})` — yeni aşamaları yaz
- L70: `dbPost("santiye_log", logRows).catch(() => {})` — log yaz
- L74-75: `storeDel(...).catch(() => {})` + `dbDelete("record_fotograflar", ...).catch(() => {})`
**Niye problem:** Senaryo: dbDelete asama fail (RLS hatası, network) → dbPost asama success → DB'de eski + yeni aşamalar yan yana, **sıra ID çakışır**. Ya da dbPost log fail → kayıt başarılı toast'ı ama log eksik (audit trail yarım).
**Düzeltme önerisi:** Bu noktada silent catch'i kaldır (throw'a izin ver) → outer try-catch (kayitKaydet) zaten var, `toast("Kaydedilemedi: ...", "err")` atar. Atomicity sağlanmaz ama en azından kullanıcı haberdar olur.
**Alternatif:** Server-side transaction (Supabase RPC fonksiyonu) → tek atomic call. Daha büyük refactor.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B13 — `record.js kayitSil` cascade silent — orphan riski
**Sınıf:** 🟢 NIT
**Kapsam:** `js/modals/record.js:419-423`
**Bulgu:** Silme zincirinde 4 dependent + 1 main delete. Dependent'lar `.catch(() => {})`. Eğer dependent fail + main success → orphan child rows. Eğer main fail → kullanıcı "silinemedi" görür ama dependent'ler silinmiş olabilir (partial state).
**Düzeltme önerisi:** FK ON DELETE CASCADE yerleştir (DB tarafı) → main delete tek atomic. Veya RPC.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B14 — `santiye_raporlar.hazirlayan_email` RAW EMAIL kaydediliyor
**Sınıf:** 🟡 ÖNEMLİ (USER_DECISION gerekli)
**Kapsam:** `js/modals/rapor.js:687` + migration `2026-05-04_p1_santiye_raporlar_rls.sql:58`
**Bulgu:** Raporlar tablosuna `hazirlayan_email: oturum.email || null` raw email yazılıyor. RLS policy `hazirlayan_email = auth.jwt() ->> 'email'` ile filter ediyor — yani **email tablo kolonunda bilinçli ham**.
**Niye problem:** P1-10 ile log'da PII mask edildi (duzenleyen "Admin" / "pii:hash"). Raporlar'da raw email **kabul edilmiş bir tradeoff** ama tradeoff'un belgelendiği yer yok (audit trail eksik). Future audit'te "neden burada email plain?" sorusuna cevap için doc lazım.
**Düzeltme önerisi:**
- A) Hiçbir değişiklik, AUDIT_FINAL.md'ye "tradeoff: RLS için email kolon zorunlu, mask hash kullanılırsa policy bozulur" yorumu ekle.
- B) `auth.uid()` UUID-bazlı RLS'e geç (P1-6 alternatifiydi) → user_id kolonu, email kaldır.
- C) `hazirlayan_email_hash` ekle (deterministic SHA256) → RLS bunu match etsin, raw email kaldır. Worker /maskPII'daki pepper'ı kullan.
**Önceki tur'da yakalanmamış mıydı?:** P1-6 USER_DECISION → A (email-bazlı). Bu sonradan PII envanteri açısından sorgulanmamıştı. **§9 USER_DECISION**.

#### B15 — `rapor.js` debug `console.log` çıktıları kalmış
**Sınıf:** 🟢 NIT
**Kapsam:** `js/modals/rapor.js:611, 616, 627`
**Bulgu:** "Container ölçü:", "Sayfa sayısı:", "Sayfa N ölçü:" debug log'ları production'da çıktı veriyor.
**Düzeltme önerisi:** Sil veya `if (window.DEBUG)` flag arkasına al.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B16 — `rapor.js html2canvas scale: 3` mobilde CPU yüksek
**Sınıf:** 🟢 NIT
**Kapsam:** `js/modals/rapor.js:630`
**Bulgu:** `scale: 3` her sayfa için 9× pixel. 2 sayfa, A4 600dpi → ~14M pixel. Mobil CPU 5-15s donar.
**Düzeltme önerisi:** `scale: 2` (4× pixel, 6M, hâlâ keskin) → 2-3× hızlı. Veya devicePixelRatio'ya göre dinamik.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### Frontend katmanında **temiz** olarak doğrulanan dosyalar (kanıt)
- **`utils.js`**: `esc()` 6 karakter (`& < > " ' \``) escape — kapsamlı XSS guard. `parseNum()` virgül desteği. `toast` `esc(msg)` kullanımı OK.
- **`state.js`**: Sadece sabit listeler + tek mutable obje `app`. Güvenlik etkisi yok.
- **`config.js`**: Anon KEY public — bilinçli (Supabase mimarisi). H mutable obje contract'ı CLAUDE.md'de doc'lu.
- **`router.js`**: 5 view switch, popstate handler, misafir guard ayarlar için. URL injection yok (encodeURIComponent).
- **`main.js`**: Side-effect import sırası doğru. Inline handler bağlama complete.
- **`data.js`**: encodeURIComponent her query param'da. `select=*` kullanımı acceptable (RLS scope).
- **`lightbox.js`**: Salt UI, güvenlik etkisi yok.
- **`export.js`**: ⊕ `safeCell` formula injection mitigation — birçok proje atlar, burada doğru.
- **`views/projects.js`**: Tüm interpolation `esc()`, isAdmin guard geolocation'da.
- **`views/detail.js`**: Render fonksiyonu güvenli, misafir guard butonlarda.
- **`views/log.js`**: XSS güvenli (B10 hariç PII tutarlılığı).
- **`views/ayarlar.js`**: Misafir guard her mutating action'da.
- **`views/dashboard.js`**: PII pattern (_piiAdayMi/_piiPrefetch/_piiGoster) iyi tasarlanmış (B10/B11 dışında).
- **`modals/note.js`**: Misafir guard ✓, encodeURIComponent ✓.
- **`modals/rapor-assets.js`**: Sadece base64 logo data. Güvenlik etkisi yok.

### 2.2 Worker (cloudflare-worker.js)

**Genel kanı:** Auth, CORS, file validation katmanları **çok güçlü**. PBKDF2 + constant-time compare doğru implement, Supabase JWT verify HS256+role+sub kontrolüyle sıkı, /upload 6-katmanlı (size + declared MIME + ext + magic + match + path traversal), /fotoIndir ownership check ile yetki sızıntı kapısı kapatılmış, rate limit /misafirLogin'de doğru pattern (CF-Connecting-IP zorunluluğu + Retry-After + log). Ana zayıflık: **rate limit ve cost-vector kapsama** — /rapor (Gemini paralı API) ve /maskPII rate limit yok. İkincil: error mesajları generic değil, debug `console.log` çıktıları kalmış.

#### B17 — `verifyMisafirParola` PBKDF2 iter upper-bound yok
**Sınıf:** 🟡 ÖNEMLİ
**Kapsam:** `cloudflare-worker.js:134-135`
**Bulgu:** `iter = parseInt(parts[1], 10); if (!Number.isFinite(iter) || iter < 1) return false;` — alt sınır var, üst sınır yok. GUEST_PASSWORD_HASH secret yanlış set edilirse (örn. `pbkdf2-sha256$999999999$...`) Worker her login isteğinde 999M iter PBKDF2 hesaplar → CPU exhaust → tüm endpoint'ler donar.
**Niye problem:** Wrangler secret manuel olarak set ediliyor → typo riski. Üst sınır olmadan defansif değil. CF Worker free tier 50ms CPU, paid 30s. 999M iter SHA-256 ~saniyeler → invocation kill, ama her istek yeni invocation → effective DoS.
**Düzeltme önerisi:** `if (iter < 1 || iter > 1_500_000) return false;` (1.5M = 600k × 2.5 emniyet payı, OWASP 2025 recommended max).
**Alternatif:** Iter'i Worker constant olarak hardcode et, hash format'ında gönderme.
**Önceki tur'da yakalanmamış mıydı?:** P1-8 commit `5f6645b` PBKDF2 verify ekledi, üst sınır düşünülmemiş.

#### B18 — `/rapor` rate limit YOK — Gemini cost attack vektörü
**Sınıf:** 🟡 ÖNEMLİ
**Kapsam:** `cloudflare-worker.js:289-303`
**Bulgu:** `/rapor` endpoint authenticated user'a açık, rate limit guard yok. Her çağrı Gemini 2.5 Flash API → ~$0.001-0.005 (multimodal — PDF + foto). Ek olarak Drive API + KÖSTER web scraping → CPU + bandwidth.
**Niye problem:** Authenticated admin kötü niyetli olursa (veya hesap ele geçirilirse), 1000 istek = $1-5 + bandwidth + CPU. Quota exhaustion / cost bomb.
**Düzeltme önerisi:**
- A) `/misafirLogin` pattern'iyle ikinci `[[unsafe.bindings]]` ekle: `RAPOR_RL` (key: user.sub, limit: 5/dk veya 50/saat).
- B) DB-side counter (santiye_raporlar.created_by son 1h aggregate) → throttle.
**Alternatif:** Mevcut kabul (admin pool kapalı, threat düşük) — AUDIT_FINAL'e doc.
**Önceki tur'da yakalanmamış mıydı?:** Hayır. /misafirLogin'de odaklanılmış, /rapor unutulmuş.

#### B19 — `/maskPII` rate limit YOK — minor enumeration
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:260-287`
**Bulgu:** Authenticated user'a açık, rate limit yok. Her istek 100 değer SHA-256+pepper. Worker stateless, in-memory cache yok.
**Niye problem:** Pepper bilinmeden offline lookup imkansız (asıl koruma çalışıyor). Ama brute force CPU exhaustion mümkün — SHA-256 hızlı (microsec) ama ölçek artarsa fark eder. Authenticated pool dar olduğu için NIT.
**Düzeltme önerisi:** Aynı `RAPOR_RL` pattern (limit: 100 req/dk/user).
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B20 — Endpoint catch'leri `err.message` frontend'e dönüyor
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:283, 297-301, 343-347, 359-364, 443-448`
**Bulgu:** Tüm endpoint catch bloklarında `err.message` doğrudan response body'ye yazılıyor. Drive API hata mesajları içerik içerebilir (`JSON.stringify(uploadData)` line 535).
**Niye problem:** Internal detay leak (Drive API error code'ları, rate limit info, schema bilgileri). Bilgi savaşı saldırganı için reconnaissance. Token leak riski yok (Drive 4xx response token içermez), ama defansif değil.
**Düzeltme önerisi:** Generic mesaj dön (`{ error: "İşlem başarısız" }`), detayı `console.error` ile Worker logs'a yaz.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B21 — `/upload` path traversal check `..` over-restrictive
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:379`
**Bulgu:** `fileName.includes('..')` — `report..2026.jpg` (geçerli isim) reddedilir.
**Niye problem:** False positive. Asıl path traversal `../` veya `..\` kombinasyonu. Salt `..` zararsız.
**Düzeltme önerisi:** `fileName.includes('../') || fileName.includes('..\\')` — daha precise.
**Önceki tur'da yakalanmamış mıydı?:** P1-2 commit `5d2dd58` ekledi, edge case düşünülmemiş.

#### B22 — `klasorBulVeyaOlustur` name escape sadece `'`, backslash escape yok
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:474, 493`
**Bulgu:** `name.replace(/'/g, "\\'")` — Drive query string `q=name='X' and ...` formatında. `'` escape var, ama `\` (backslash) escape yok. Drive API query syntax dokümantasyonu ne diyor, test edilmemiş.
**Niye problem:** Klasör adında `\` varsa (örn. user input "şantiye\test"), query bozulabilir veya unintended match.
**Düzeltme önerisi:** `name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")` — backslash önce escape.
**Alternatif:** Drive API `q` parameter validation Drive tarafında handle edebilir, test gerek.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B23 — `driveMultipartYukle` hardcoded boundary collision riski
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:512`
**Bulgu:** `boundary = '-------CloudflareWorkerBoundary'`. Image binary'de tam aynı 30-byte string olsa multipart parse bozulur. ~10^-72 olasılık ama mevcut.
**Düzeltme önerisi:** `crypto.randomUUID()` ile dinamik boundary.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B24 — Worker `console.log` debug çıktıları production'da
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:883-927` (aiRaporUret içi 8+ log)
**Bulgu:** `[KAYNAK]` debug log'ları her /rapor çağrısında Cloudflare Logs'a gidiyor (~30 gün retention). PII değil (malzeme adı, klasör adı), ama bandwidth + storage cost.
**Düzeltme önerisi:** `if (env.DEBUG)` flag arkasına al veya sil.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B25 — `kosterWebAra` HTML scraping fragility (kabul edilen risk)
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:732-806`
**Bulgu:** Regex tabanlı HTML parse. koster.com.tr DOM yapısı değişirse fail. Defansif fallback'ler var → "web-yok" dön → AI rapor `ai-general` mode → çalışır ama föy referansı eksik.
**Düzeltme önerisi:** Mevcut kabul edilebilir — alternatif `cheerio` Worker'da yok. Belki HTML değişiklik tetikleyici test (smoke.sh içinde). Düşük öncelik.
**Önceki tur'da yakalanmamış mıydı?:** Bilinen tradeoff.

#### B26 — `kosterFetch redirect: 'follow'` cross-domain riski
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:830`
**Bulgu:** kosterFetch URL'si: 1) `koster.com.tr/ara/?q=...` (sabit), 2) `detayUrl` (anchorMatch[1] HTML'den parse). Eğer koster.com.tr saldırgan kontrolünde olsa, redirect ile cross-domain. Trusted upstream varsayımı.
**Düzeltme önerisi:** `redirect: 'manual'` + Location header host whitelist (`koster.com.tr`).
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B27 — `klasorBulVeyaOlustur` paralel yarış → duplicate folder
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:472-490`
**Bulgu:** Aynı bölge/santiye/tarih için aynı anda 2 upload gelirse: list (not found) → create paralel → Drive'da 2 aynı isimli klasör. Subsequent upload'lar 2 farklı klasöre dağılabilir.
**Niye problem:** Foto organizasyonu bozulur, kullanıcı klasörde "yarısı eksik" görür.
**Düzeltme önerisi:** Drive API tarafında atomic upsert yok → uygulama seviyesinde idempotency key veya retry-after-list pattern. Veya: foldercache (KV/cache) ile ön-belleğe al.
**Alternatif:** Mevcut kabul (admin sayısı az, paralel upload nadiren).
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B28 — `verifyJwt` `iat`/`nbf`/`aud`/`iss` kontrol edilmiyor
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:1096-1119`
**Bulgu:** Sadece `exp` (expire) check. `iat`, `nbf`, `aud`, `iss` claim'ler validate edilmiyor.
**Niye problem:** HS256 secret unique olduğu sürece başka project'in token'ı reject olur. Ama defansif daha iyi:
- `iat > Date.now() + skew` → clock skew attack
- `nbf > Date.now()` → not-yet-valid token replay
- `aud` mismatch → token reuse cross-app
**Düzeltme önerisi:** `aud === 'authenticated'` + `iss === SUPABASE_URL+'/auth/v1'` + `iat <= now + 60s` + `nbf <= now`.
**Alternatif:** Mevcut kabul, secret-based isolation güveniyor.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B29 — Hardcoded hostname `KOSTER_KATEGORI_CACHE_URL`
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:12`
**Bulgu:** `'https://drive-upload.eng-adtoker.workers.dev/__cache/koster-kategori-v3'` — Worker custom domain'e taşınırsa cache key uyumsuz olur (yeniden inşa edilir, fonksiyonel etki yok ama gereksiz overhead).
**Düzeltme önerisi:** `request.url`'den dinamik veya `env.WORKER_HOSTNAME` ile parametrize.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B30 — `/misafirLogin` GUEST_PASSWORD_HASH yokluğu mesajı public
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:230`
**Bulgu:** Eğer M7 deploy edilmediyse 500 + `'GUEST_PASSWORD_HASH yapılandırılmadı'` — saldırgana "secret eksik, brute force gereksiz" sinyali.
**Düzeltme önerisi:** Generic 500 + `'Sunucu hatası'`. Worker logs'a sebep yaz.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B31 — `requireAuth` Authorization parsing tekrarı `/fotoIndir`'da
**Sınıf:** 🟢 NIT
**Kapsam:** `cloudflare-worker.js:315` (vs `requireAuth:1124`)
**Bulgu:** `requireAuth` token'ı parse edip payload dönüyor, ama `/fotoIndir` userToken'ı yeniden header'dan slice ediyor. DRY ihlali, future-bug riski.
**Düzeltme önerisi:** `requireAuth` `{ payload, token }` dön. /fotoIndir `user.token` kullansın.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### Worker katmanında **temiz** olarak doğrulanan akışlar (kanıt)
- **Constants/SISTEM_PROMPT (1-54):** P1-11 multimodal injection mitigation (line 33-39) doğru — fotoğraflardaki yazılı talimat reddedilmesi explicit.
- **CORS (88-106):** Whitelist + regex pattern (preview deploys) + Vary: Origin (cache poisoning kapalı). Authorization+apikey header allowed (P0-17 hotfix).
- **PBKDF2 verify (130-154):** Format parse defansif, `_b64decode` try-catch'li, constant-time compare (manuel XOR loop, early-return yok). Doğru implement (B17 dışında).
- **maskPIIvalue (161-168):** SHA-256 + pepper (server-only) + 12 hex slice. Frontend asla pepper görmez.
- **/misafirLogin (193-249):** Rate limit ÖNCE (CPU bomb engelle), CF-Connecting-IP zorunlu, GUEST_PASSWORD_HASH yoksa 500, PBKDF2 timing-safe, başarısız hep `{ ok: false }` 401 (mesajsız → enumeration zor).
- **requireAuth (252-255 + 1121-1127):** HS256 verify + role='authenticated' + payload.sub var. **Çok sıkı.**
- **/maskPII (260-287):** PII_PEPPER yoksa 500, values array değilse 400, length>100 reject (DoS koruması).
- **/fotoIndir (307-349):** ⊕ Ownership check `record_fotograflar.file_id` SELECT → kullanıcının kendi bölgesi/sahipliği RLS ile filter. P0-7 doğru implement.
- **/upload (367-448):** ⊕ 6-katmanlı validation (declared MIME → fileName format → ext → base64 decode → size → magic MIME → declared==magic). Mükemmel — birçok proje bu kadarını yapmaz.
- **getAccessToken (454-468):** OAuth refresh token flow standart.
- **kosterFoyKategoriMap (641-676):** Lazy lookup + caches.default + s-maxage=3600. Cache miss = 10 fetch, cache hit = 0 fetch. İyi optimizasyon.
- **aiRaporUret (864-1050):** systemInstruction + responseSchema (JSON mode) → AI çıktı şekli garantili. PDF/web/no-source 3 mode düzgün ayrıştırılmış.
- **pdfRaporYukle (1054-1085):** Klasör hierarchy + isim çakışma çözümü (`dosyaAdiCakismaCoz` 5 deneme).
- **verifyJwt (1096-1119):** HS256 doğrulama + exp check + try-catch envelope. (B28 minor improvements).

### 2.3 Migrations (migrations/*.sql)

**Genel kanı:** RLS sıkılaştırma (P0 → P1) doğru pattern: dynamic DROP defansif (DO bloğu pg_policies tarayan) + canonical create. P1-6 atomic BEGIN/COMMIT örnek alınmalı diğerlerine. Storage public anon kapısı kapalı. Lookup tablosu (malzemeler) anon+authenticated düz açık. Ana kapı zayıflıkları: **santiye_log update/delete açık** (audit trail mutable), **email-bazlı RLS rotation senaryosu**, çoğu migration `BEGIN/COMMIT` zarflanmamış.

#### B32 — `santiye_log` UPDATE+DELETE policy açık → audit trail mutable
**Sınıf:** 🟡 ÖNEMLİ
**Kapsam:** `migrations/2026-05-04_p1_policy_consolidation.sql:60-61`
**Bulgu:** `l_update` ve `l_delete` policy'leri `for update/delete to authenticated using (true)` — herhangi bir admin log satırlarını silebilir/değiştirebilir. Audit trail integrity bozuk.
**Niye problem:** Audit log'un anlamı **immutable** olmasıdır (compliance, KVKK, iç denetim). Admin "yanlış kayıt" sebebiyle log'u modifiye edebilirse audit'in değeri sıfır.
**Düzeltme önerisi:** `drop policy "l_update" on santiye_log; drop policy "l_delete" on santiye_log;` (santiye_raporlar pattern'i — UPDATE/DELETE bilerek tanımlanmaz → immutable).
**Alternatif:** Mevcut kabul (yorum line 57 "P2'de immutable yapılması önerilir" — yani bilinen tradeoff). AUDIT_FINAL §11.7'de doc'lu. **Yine de production deploy önce kapatılması doğru olur.**
**Önceki tur'da yakalanmamış mıydı?:** P1-12 commit'te bilinen tradeoff (yorum). Bu envanter "deploy öncesi kapat" diye yeniden raporluyor.

#### B33 — Email rotation senaryosu — `santiye_raporlar` recovery yolu yok
**Sınıf:** 🟡 ÖNEMLİ (USER_DECISION gerekli)
**Kapsam:** `migrations/2026-05-04_p1_santiye_raporlar_rls.sql:56-62` + `js/modals/rapor.js:687`
**Bulgu:** RLS `hazirlayan_email = auth.jwt() ->> 'email'`. Eğer admin email'ini değiştirirse (Supabase Auth Dashboard → user.email update), eski email ile yazılmış raporlar artık o admin tarafından okunamaz (sadece sahip görür kuralı).
**Niye problem:** Brief Senaryo 10. Recovery yolu:
- A) Yeni admin diye yeni hesap aç + eski email arşivde tut → kullanıcı raporları "kaybetti".
- B) DB direct UPDATE santiye_raporlar SET hazirlayan_email = 'yeni@x' WHERE hazirlayan_email='eski@x' → manuel SQL gerekir.
- C) Auth uid()-bazlı RLS'e geç → email değişikliği etkilemez (P1-6 alternatif B'ydi).
**Düzeltme önerisi:** `hazirlayan_user_id uuid references auth.users(id)` kolonu ekle, RLS bu kolonu match etsin. Email metadata olarak kalabilir. Veya: hazirlayan_email mutation prosedürü (Supabase Edge Function) tanımlı olsun.
**Önceki tur'da yakalanmamış mıydı?:** P1-6 USER_DECISION → A (email-bazlı). Senaryo 10 audit'in yeni keşfi. **§9 USER_DECISION**.

#### B34 — Migrations çoğunda `BEGIN/COMMIT` eksik (atomicity garantisi yok)
**Sınıf:** 🟡 ÖNEMLİ
**Kapsam:** `migrations/2026-05-02_santiye_raporlar.sql`, `2026-05-03_file_id_backfill.sql`, `2026-05-04_p0_rls_sikilastir.sql`, `p1_policy_consolidation.sql`, `p1_open1_storage_misafir_kapat.sql`, `p3_malzemeler_consolidation.sql`
**Bulgu:** Sadece `p1_santiye_raporlar_rls.sql` BEGIN/COMMIT içinde (B1 NIT sonrası eklendi). Diğer 6 migration düz statement listesi → her statement autocommit → yarı uygulanmış state mümkün.
**Niye problem:**
- 2026-05-02: 5 statement (CREATE TABLE + 2 INDEX + ALTER + 2 POLICY). Index create fail (örn. tablo locked) → tablo + ALTER kaldı, indexler eksik.
- p0_rls_sikilastir: 12+12+3+9 = ~36 statement. 30. statement fail (örn. policy ad çakışması) → 29 policy yeniden yazılmış, 7 eski hâlâ aktif.
- p1_policy_consolidation: DO blok atomic ama sonraki 16 CREATE POLICY autocommit → yarı uygulama mümkün.
**Düzeltme önerisi:** Her migration başına `begin;`, sonuna `commit;` ekle. Dry-run için `commit;` → `rollback;`.
**Alternatif:** Supabase Dashboard SQL Editor "Run as transaction" toggle (varsa).
**Önceki tur'da yakalanmamış mıydı?:** B1 NIT sadece p1_santiye_raporlar_rls için uygulandı; geri kalan 6 dosyaya yayılmamış.

#### B35 — `santiye_raporlar.bolge` nullable
**Sınıf:** 🟢 NIT
**Kapsam:** `migrations/2026-05-02_santiye_raporlar.sql:23`
**Bulgu:** `bolge text` (NULL kabul). Diğer tablolarda bolge default+filter beklentisi var. NULL bolge'lu raporlar bolge filter (`bolge=eq.X`) ile dönmez.
**Niye problem:** Frontend `js/modals/rapor.js:680`: `bolge: app.bolge || null` — bolge null bırakabilir → liste boyu kaçırılır.
**Düzeltme önerisi:** `bolge text not null default 'İskele'` veya `app.bolge` zorunluluğu frontend'de.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B36 — `malzemeler` policy'si `anon` role gereksiz açık
**Sınıf:** 🟢 NIT
**Kapsam:** `migrations/2026-05-04_p3_malzemeler_consolidation.sql:48`
**Bulgu:** `for select to anon, authenticated using (true)`. Frontend (js/data.js:15) `H` header ile çağırıyor — H ya anon KEY ya user JWT (her durumda kabul edilir). Anon role kullanım yok → gereksiz attack surface.
**Niye problem:** Anon endpoint'ten malzeme listesi çekmek mümkün → reconnaissance (rakip firma KÖSTER ürün portföyünü görür). Pratikte kamuoyuna açık ürünler ama defansif değil.
**Düzeltme önerisi:** `to authenticated` (anon kaldır). Frontend zaten authenticated, behavior değişmez.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### B37 — `record_fotograflar` UPDATE policy yok (gelecek limitation)
**Sınıf:** 🟢 NIT
**Kapsam:** `migrations/2026-05-04_p0_rls_sikilastir.sql:14-16`
**Bulgu:** rf_select + rf_insert + rf_delete var, rf_update YOK. Şu an mevcut feature kullanmıyor (foto immutable insert/delete pattern). Ama ileride "hasar bayrağı toggle" feature'ı gerekirse → blocked.
**Düzeltme önerisi:** Mevcut kabul. Future feature gelirse policy eklensin.
**Önceki tur'da yakalanmamış mıydı?:** Bilinçli karar.

#### Migrations katmanında **temiz** olarak doğrulanan akışlar (kanıt)
- **`2026-05-02_santiye_raporlar.sql`:** Schema sağlam (FK ON DELETE SET NULL → audit trail kalır), index'ler sorgu pattern'lerine uygun, RLS enable + policy. P1-6 ile sıkılaşacağı bilindiği için update/delete YOK pattern doğru.
- **`2026-05-03_file_id_backfill.sql`:** 3 regex pattern (`?id=`, `/file/d/`, `/d/`) Worker `driveUrlIdCikar` ile aynı kapsamda. Idempotent (`where file_id is null`).
- **`2026-05-04_p0_rls_sikilastir.sql`:** 4 tablonun anon/public policy'leri kapatıldı. Storage bucket-scoped policy'ler ✓. Doğrulama sorguları comment'te.
- **`2026-05-04_p1_policy_consolidation.sql`:** DO bloğu pattern (dynamic drop) → unknown ad varyantları yakalar. 4 tablo × 4 cmd = 16 canonical policy. (B32 hariç tasarım sağlam.)
- **`2026-05-04_p1_santiye_raporlar_rls.sql`:** ⊕ BEGIN/COMMIT atomic ✓, defansif DROP (8 known + DO blok) → legacy state'e dirençli. Email-bazlı RLS frontend ile hizalı (B33 dışında).
- **`2026-05-04_p1_open1_storage_misafir_kapat.sql`:** Defansif anon/public scan + drop → bilinmeyen kalıntıları yakalar. Doğrulama sorguları net.
- **`2026-05-04_p3_malzemeler_consolidation.sql`:** Errata pattern (3 redundant SELECT → 1 canonical). DO blok + 6 known drop. (B36 hariç doğru.)

### 2.4 Config (wrangler.toml, .gitignore, .gitattributes, .cfignore)

**Genel kanı:** `.gitignore` ve `.gitattributes` standart, kapsamlı. `wrangler.toml` rate limit binding net. `.cfignore` ise **Cloudflare Pages tarafından native olarak desteklenmiyor olabilir** (test edilmemiş) — sadece Wrangler'da `_routes.json`/`_headers` standartlar var.

#### B38 — `.cfignore` non-standard, Cloudflare Pages destek belirsiz
**Sınıf:** 🟡 ÖNEMLİ
**Kapsam:** `.cfignore`
**Bulgu:** Cloudflare Pages dökümantasyonu `.cfignore` formatından bahsetmiyor. Pages Git Integration mode'da otomatik exclude yok; Direct Upload mode'da deploy script `.cfignore` parser'a sahip olmalı.
**Niye problem:** Eğer `.cfignore` görmezden geliniyorsa, audit dökümanları (AUDIT_FINAL.md, MANUAL_TASKS.md, SESSION_CHECKPOINT.md), migrations/, scripts/ → public Pages domain'ine deploy ediliyor. **Public bir saldırgan `https://santiye-takipp.pages.dev/AUDIT_FINAL.md` ile audit içeriğine ulaşabilir** → tüm güvenlik tradeoff'ları, iç ip envanteri, secret listesi ifşa.
**Düzeltme önerisi:**
- A) Hemen test: `curl -I https://santiye-takipp.pages.dev/AUDIT_FINAL.md` — 404 olmalı, 200 ise SİZINTI.
- B) Cloudflare Pages `_routes.json` + `_headers` ile path-based exclusion.
- C) Repo'yu iki çatala böl (frontend-only public repo + backend/docs private).
- D) Pages "Build output" ayarında `frontend/` subfolder'ını root yap, geri kalan dosyalar build context dışında.
**Önceki tur'da yakalanmamış mıydı?:** P2-1 commit `353b534` `.cfignore` ekledi varsayım: Cloudflare destekliyor. **Doğrulanmamış**.

#### B39 — `wrangler.toml` `namespace_id = "1001"` hardcoded
**Sınıf:** 🟢 NIT
**Kapsam:** `wrangler.toml:29`
**Bulgu:** namespace_id Cloudflare hesabı içinde unique olmalı. "1001" prod hesap için Wrangler/Dashboard tarafından ilk deploy'da atanır → toml'daki "1001" placeholder, gerçek değerle override edilmeli.
**Düzeltme önerisi:** İlk deploy sonrası gerçek namespace_id'yi toml'a yansıt veya `WRANGLER_RL_NAMESPACE_ID` env var'a parametrize et.
**Önceki tur'da yakalanmamış mıydı?:** B4 commit `cd0d315` ilk implementasyon — placeholder bilinçli.

#### B40 — `wrangler.toml` `compatibility_date = "2025-01-01"` eski
**Sınıf:** 🟢 NIT
**Kapsam:** `wrangler.toml:17`
**Bulgu:** Cloudflare Workers compatibility_date Worker davranışını sabitler. 2025-01-01 → bazı yeni özellikler (örn. fetch behavior change'leri) kapalı.
**Düzeltme önerisi:** 2026-05-04 veya en yeni stabil. Riski: davranış değişikliği — manuel deploy sonrası smoke test gerek.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### Config katmanında **temiz** olarak doğrulanan:
- **`.gitignore` (54 LoC):** node_modules, dist, .env, OS, editor, logs, coverage, .wrangler/, .claude/ — kapsamlı. Tehlikeli pattern (`.env`, `*.bak`, secrets) hepsi cover.
- **`.gitattributes` (41 LoC):** LF normalization tüm text dosyalar; binary explicit. P1-13 commit `bbe70d0` eklendi. ✓
- **`wrangler.toml` (37 LoC):** Rate limit binding doğru, secret listesi comment'te explicit (yazılmamış).

---

### 2.5 Scripts (scripts/*.{sh,mjs})

**Genel kanı:** Hash generator script PBKDF2 doğru implement, smoke.sh 10 test kapsamlı (Faz 8'de detaylı incelenecek).

#### B41 — `hash_misafir_pass.mjs` `process.argv[2]` shell history leak
**Sınıf:** 🟢 NIT
**Kapsam:** `scripts/hash_misafir_pass.mjs:26`
**Bulgu:** `node scripts/hash_misafir_pass.mjs "ASEL2026"` — parola komut satırında, shell history (~/.bash_history, ~/.zsh_history) + process listesi (`ps auxf`) → diskte+ramda kalır.
**Niye problem:** Hash secret'ı set ettikten sonra ASEL2026 parolası history'de duruyor → yetkisiz lokal erişim → parola ifşa.
**Düzeltme önerisi:**
```js
import { createInterface } from 'node:readline';
const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question('Misafir parolası: ', (password) => { ... });
```
veya stdin pipe: `echo "ASEL2026" | node hash_misafir_pass.mjs` + `process.argv` kaldır.
**Önceki tur'da yakalanmamış mıydı?:** P1-8 commit `5f6645b`. Operasyonel security gözden kaçmış.

#### Scripts katmanında **temiz** olarak doğrulanan:
- **`hash_misafir_pass.mjs` (49 LoC):** PBKDF2 600k iter (OWASP 2023 minimum), 16-byte salt, 32-byte key, format Worker verify ile match. webcrypto API kullanımı doğru.
- **`smoke.sh` (268 LoC):** Detaylı review §6 (Faz 8) — 10 test, RLS sanity dahil.

---

### 2.6 Index/HTML/CSS/Manifest

**Genel kanı:** index.html'de XSS vektörü taraması temiz (`eval`, `document.write`, dangerous inline kod yok). CSS hijyenik (external CDN/expression yok). **iki kritik bulgu:** PWA manifest icons eksik, iki CDN script SRI'sız.

#### B42 — `manifest.json` icons/ klasörü REPO'DA YOK
**Sınıf:** 🟡 ÖNEMLİ
**Kapsam:** `manifest.json:11-22` + repo root
**Bulgu:** Manifest `/icons/icon-192.png` ve `/icons/icon-512.png` referans veriyor. `ls icons/` → klasör yok. PWA install denemesi 404 → install başarısız (Lighthouse uyarısı, mobile "Add to Home Screen" bozuk).
**Düzeltme önerisi:** `icons/` klasörü oluştur, 192px + 512px (purpose="any maskable") PNG ekle. Veya manifest'ten icon referansları çıkar (PWA install özelliği kapanır).
**Önceki tur'da yakalanmamış mıydı?:** Hayır. Manifest commit `ecb1f2e` 2026-05-01 — icon'lar hiç eklenmemiş veya silinmiş.

#### B43 — `index.html` html2canvas + jspdf CDN script'leri SRI YOK
**Sınıf:** 🟡 ÖNEMLİ
**Kapsam:** `index.html:30-36`
**Bulgu:** `<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" defer></script>` ve jspdf — `integrity=` attribute yok, `crossorigin=` yok.
**Niye problem:** P1-1 commit `46d6c84` xlsx için SRI ekledi (export.js dynamic load). Bu iki CDN ile aynı supply chain riski:
- cdnjs compromise → arbitrary JS execute → tüm `_oturum` token, form içeriği saldırgana gider.
- 1.4.1 versiyonu pinned ✓ ama hash yok = bütünlük garanti yok.
**Düzeltme önerisi:**
```html
<script
  src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
  integrity="sha384-<resmi-hash>"
  crossorigin="anonymous"
  defer
></script>
```
SRI hash: `curl https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js | openssl dgst -sha384 -binary | openssl base64 -A`.
**Önceki tur'da yakalanmamış mıydı?:** P1-1 sadece xlsx için. html2canvas/jspdf ana index.html'de yer alıyor, atlanmış.

#### B44 — Token in-memory only (`_oturum`) — refresh = relogin
**Sınıf:** 🟢 NIT (info)
**Kapsam:** `js/auth.js:15`, sayfa refresh davranışı
**Bulgu:** Token `localStorage`/`sessionStorage`/`cookie` HİÇBİR YERE persist edilmiyor — kasıtlı güvenlik kararı. Ama UX: kullanıcı "Şantiye İş Takip" tab'ını yanlışlıkla refresh ederse oturumu kaybeder.
**Niye değer:** Brief Section B madde 13 sorgusu — token leak yok. Bu kanıt.
**Düzeltme önerisi:** Mevcut **doğru karar**. Sayfa refresh sonrası login dialogu otomatik açılırsa UX iyileşir (mevcut: zaten login screen geri gelir).
**Önceki tur'da yakalanmamış mıydı?:** Bilinçli karar.

#### B45 — `index.html` intro-frame iframe `src` JavaScript ile set
**Sınıf:** 🟢 NIT
**Kapsam:** `index.html:84-86`
**Bulgu:** `<iframe id="intro-frame">` static, sonra `<script>document.getElementById("intro-frame").src = "asel-logo-animation.html"</script>` ile src set.
**Niye problem:** CSP nonce uygulanırsa inline `<script>` block'lanır → iframe boş kalır. Ayrıca gereksiz JS — `<iframe src="asel-logo-animation.html">` direkt çalışır.
**Düzeltme önerisi:** Static `src` HTML attribute'ünde.
**Önceki tur'da yakalanmamış mıydı?:** Hayır.

#### Index/HTML/CSS/Manifest katmanında **temiz** olarak doğrulanan:
- **`index.html` (1054 LoC):** XSS pattern taraması temiz (eval, document.write, dangerous inline JS yok). Sadece 2 external CDN (B43). Inline handler 50+ — proje pattern'i (window.* registration). CSS load order layout son ✓ (CLAUDE.md kontratı).
- **`asel-logo-animation.html` (306 LoC):** Salt CSS animasyon, JS yok, güvenlik etkisi yok.
- **`manifest.json` (24 LoC):** PWA standartları doğru (B42 hariç). Theme color, display:standalone, orientation set.
- **CSS (6 dosya, 2102 LoC toplam):** External URL, `expression()`, `behavior:`, `javascript:` pattern → **YOK**. Pure styling. Güvenlik etkisi yok.
- **`MIMARI.md` (457 LoC, untracked):** Sistem mimari döküman — repo'ya track edilmesi makul (kaynak dokümantasyon). **§9'da S0 olarak soru.**

---

## 3. Mimari bulgular (cross-cutting)

_(Faz 5 sonrası buraya synthesize edilecek.)_

### 3.1 Auth flow integrity

**Akış:** Login (admin Supabase email/şifre + misafir Worker PBKDF2) → token in-memory `_oturum` → H header mutation → her DB/Worker fetch otomatik authenticated → 5 dakika idle timeout → cikisYap (Supabase logout + reload).

**Güçlü tarafları:**
- Misafir parola Worker-side PBKDF2-SHA256 600k iter + constant-time compare + rate limit (B17 dışında doğru).
- Token persist edilmez (localStorage/cookie YOK — XSS token theft imkansız, B44 kanıtı).
- requireAuth HS256 + role + sub (Worker:1121-1127) sıkı.
- B2 race fix sonrası `_oturum` atomic (girisYap'ta H önce, sonra ad hesap, sonra atomic atama).

**Zayıf noktalar:** B2 (yeni admin "Admin" hard-mask collision), B3 (logout silent catch), B4 (timeout scroll/wheel coverage yok), B17 (PBKDF2 iter upper-bound yok).

**Senaryo 1 (yeni admin) yürütüldü** → B2 doğrulandı. **Senaryo 2 (6× yanlış parola)** → B46 (UI mesajı yanıltıcı).

### 3.2 RLS coverage

**Tablo başına policy envanteri (post-deploy):**
| Tablo | SELECT | INSERT | UPDATE | DELETE | Sahiplik |
|---|:-:|:-:|:-:|:-:|---|
| santiyeler | s_select | s_insert | s_update | s_delete | authenticated/açık |
| santiye_records | sr_select | sr_insert | sr_update | sr_delete | authenticated/açık |
| record_asamalar | ra_select | ra_insert | ra_update | ra_delete | authenticated/açık |
| record_fotograflar | rf_select | rf_insert | — | rf_delete | authenticated/açık (B37: UPDATE yok) |
| santiye_notlar | n_select | n_insert | n_update | n_delete | authenticated/açık |
| santiye_log | l_select | l_insert | **l_update** | **l_delete** | **B32: audit mutable** |
| santiye_raporlar | rap_select | rap_insert | — | — | **email-bazlı sahiplik** (B33 rotation) |
| personeller | p_select | — | — | — | KVKK kapı, sadece okuma |
| malzemeler | malzemeler_select | — | — | — | **B36: anon+auth açık** |
| storage.objects (santiye_fotolar) | santiye_fotolar_select | santiye_fotolar_insert | — | santiye_fotolar_delete | bucket-scoped, authenticated |

**Ana zayıflık:** Çoğu tablo `using (true)` — bölge filtreleme **client-side** (frontend `bolge=eq.X` query). Eğer kötü niyetli admin `bolge=` filter kaldırırsa **tüm bölgelerin verisini görür**. Threat profile düşük (admin pool kapalı), ama defansif değil.
- **🟡 POTANSIYEL**: Sahiplik check'ler (auth.jwt() ->> 'email' veya bolge match) sadece santiye_raporlar'da. Diğer 9 tablo "authenticated tüm satırlar" → bölge isolation şartlı.

### 3.3 PII data flow

**Pipeline:**
- **Input**: Admin email (Supabase Auth), misafir parola (frontend → Worker), saha personel isimleri (frontend forms).
- **Mask point**: `auth.js:84` `maskPII(email)` ekle login'de → `_oturum.ad = "pii:<hash>"` → DB'ye yazılır.
- **Storage**: `santiye_log.duzenleyen` = pii: veya mapped name; `santiye_raporlar.hazirlayan_email` = **RAW EMAIL** (B14 doc gap).
- **Display**: dashboard.js `_piiGoster` cache hit → pii:hash; miss + aday → "Admin"; mapped → raw isim. log.js bu pattern'i kullanmıyor (B10 tutarsızlık).

**Pepper güvenliği:** Worker secret PII_PEPPER, frontend asla görmez. SHA-256 + pepper = lookup-resistant ✓. 12 hex (48 bit) yeterli mi? 2-3 admin için kollizyon riski neredeyse 0.

**Zayıflıklar:** B10 (log.js mask yok), B14 (santiye_raporlar.hazirlayan_email raw, doc gap), B33 (email rotation), B5 (misafir maskPII anon Bearer fail).

### 3.4 Realtime/WebSocket lifecycle

**Akış:** bolgeSec → realtimeBaslat → WS open → 6 topic phx_join (4 bolge-filtered, 2 unfiltered) → INSERT/UPDATE/DELETE event → debounced refresh (500ms) → veriYukle + render. Kapatma: bolgeGeriDon/cikisYap → realtimeDurdur.

**Senaryo 3 (bolge değişikliği)** → bolgeGeriDon doğru durdurur, bolgeSec yeniden başlatır. ✓ Çift WS yok.
**Senaryo 4 (tab uyku)** → visibility hook (realtime.js:43) ws kapalıysa otomatik restart. ✓
**Senaryo 5 (2 tab)** → her tab kendi WS, kendi state. Idempotent refresh, çakışma yok. ✓

**Zayıflık:** B6 (child tablolar bolge filter yok = cross-region metadata leak), B7 (ws.onerror sessiz).

### 3.5 Worker endpoint surface

**Endpoint envanteri:**
| Endpoint | Auth | Rate Limit | Cost | Notlar |
|---|---|---|---|---|
| OPTIONS | N/A | yok | 0 | Tüm preflight için |
| /misafirLogin | open | **5/60s** | yüksek (PBKDF2) | B17 iter bound |
| /maskPII | authenticated | **yok** | düşük (SHA-256) | B19 |
| /rapor | authenticated | **yok** | **YÜKSEK ($)** | B18 — Gemini API |
| /fotoIndir | authenticated + ownership | yok | orta (Drive bandwidth) | B31 token tekrar |
| /raporPdf | authenticated | yok | orta (Drive multipart) | — |
| / (default /upload) | authenticated | yok | orta | 6-katmanlı validation ✓ |

**Zayıflık:** B18 (/rapor cost vector), B19 (/maskPII enumeration), B30 (GUEST_PASSWORD_HASH yokluğu mesajı sızıntı), B47 (M9 atlanırsa /misafirLogin korumasız).
**Senaryo 8** → B47 işaretlendi.

### 3.6 Error handling consistency

**Pattern envanteri:**
- **Strong (toast'a çıkar):** `kayitKaydet`, `kayitSil`, `fotoSil`, `notKaydet`, `santiyeKaydet/Ekle/Sil`, `havaKonumAl`, `raporUret`, `fotografEkle`, `hasarFotoYukle`.
- **Silent .catch(() => {}):** `storeDel`, `dbDelete record_asamalar`, `dbPost record_asamalar`, `dbPost santiye_log`, `dbDelete cascade kayitSil`, `supabaseCikis`.
- **Worker err.message direkt frontend'e:** /maskPII, /rapor, /fotoIndir, /raporPdf, /upload (B20).

**Tutarsızlık:** Bazı hatalar kullanıcıya yansır, bazıları sessiz. Atomicity garantisi yok. B12 (sbKaydet 4× silent catch) en kritik.

### 3.7 Defansif programlama tutarlılığı

**Güçlü:**
- esc() her DOM yazımında (XSS).
- safeCell() Excel formula injection (export.js).
- encodeURIComponent her URL param'da.
- 6-katmanlı /upload validation.
- magic byte verify, declared/actual MIME match.
- BEGIN/COMMIT atomic (ama sadece p1_santiye_raporlar_rls).
- Ownership check (/fotoIndir).
- Constant-time compare (PBKDF2).
- Rate limit + CF-Connecting-IP zorunlu (/misafirLogin).
- requireAuth role + sub.

**Zayıf:**
- Migration BEGIN/COMMIT 6 dosyada eksik (B34).
- Worker error mesajları leak (B20).
- Token bazlı rate limit /maskPII + /rapor'da yok (B18, B19).
- Cache-Control header yok (B48 — Senaryo 9).

**Senaryo 6 (M2 OK, M3 fail)** → M3 atomicity yok (B34) — yarı uygulama mümkün → manuel rollback prosedürü gerek.
**Senaryo 7 (PII_PEPPER yanlış)** → /maskPII 500 → frontend hard-mask "Admin" (B2 ile aynı son durum).
**Senaryo 9 (Cache 401)** → B48 işaretlendi (defansif).
**Senaryo 10 (email rotation)** → B33 işaretlendi.

---

## 4. Faz 2+3 commit'lerinin yeniden değerlendirmesi

### 4.1 Geçmiş USER_DECISION'ların bugünkü değerlendirmesi

#### **P1-6 → A (email-bazlı RLS)** — yeniden sorgu
- **Karar:** `santiye_raporlar` RLS `hazirlayan_email = auth.jwt() ->> 'email'`.
- **Bugünkü kanı:** Senaryo 10 (email rotation) **gerçek bir risk** — admin email'i değişirse eski raporlar erişilemez. 2-3 admin'de bile yıllar içinde değişiklik olabilir.
- **Alternatif değerlendirme (UUID-bazlı):** `auth.uid()` UUID kalıcı, email değişiminden etkilenmez. Frontend zaten `oturum.email` dışında `oturum.email`'i de tutabilir (her ikisi `auth.jwt()`'te var). DB schema:
  ```sql
  alter table santiye_raporlar
    add column hazirlayan_user_id uuid references auth.users(id);
  -- backfill: hazirlayan_email → auth.users.id lookup
  -- RLS: hazirlayan_user_id = auth.uid()
  ```
- **Regresyon:** Backfill SQL gerekir + RLS policy değişir + frontend'de oturum.user_id eklenir. Orta efor (1-2 saat).
- **Verdiğim öneri:** P3'te UUID'ye migrate. Şimdilik B33 USER_DECISION olarak §9'da tut.

#### **OPEN-1 → kod kanıtı (storage anon SELECT kapalı)** — yeniden sorgu
- **Karar:** Frontend Drive URL kullanıyor, Supabase Storage upload yok → anon SELECT policy drop kararı.
- **Bugünkü kanı:** Doğrulama yaptım:
  - `js/db.js:36-42` `storeDel` → Storage **DELETE** var (foto silme). Upload YOK.
  - `js/photo.js:79, 128` → `fetch(DRIVE_URL, ...)` Worker'a gidiyor, Storage'a değil.
  - `js/data.js:33-38` → `record_fotograflar.file_url` field okunuyor; data.js'de file_url Supabase Storage URL formatında ÇEKİLEBİLİR (legacy data) ama yeni yazımlar Drive URL.
  - `migrations/2026-05-04_p1_open1_storage_misafir_kapat.sql` doğrulama sorgusu:
    `select count(*) from record_fotograflar where file_url like '%storage/v1/object%';` — kullanıcı M3 sonrası bunu sorgulayacak. Beklenen 0.
- **Risk:** Eğer count > 0 ise, eski foto'lar misafire artık görünmeyecek (anon SELECT kapatıldı) → render kırılır. M3 doğrulama opsiyonel ama önerilir.
- **Verdiğim öneri:** Doğrulama sorgusunu MANUAL_TASKS M3'e ekle (zaten comment'te var, prosedüre çıkar).

#### **P1-7 → D+errata (Drive scope P3-DEVİR)** — yeniden sorgu
- **Karar:** Drive klasörü `role: anyone reader` (public link). P3 turunda restricted scope + signed proxy çalışılacak.
- **Threat profile değişti mi?**:
  - Kullanıcı sayısı: hâlâ 2-3 admin (KULLANICI_ADLARI map değişmedi).
  - URL guess-able değil (Google Drive ID 30+ char random).
  - Misafir foto upload edemez (B43 ownership), yine misafir foto'ları görüyor (Drive public).
- **Bugünkü kanı:** P3-DEVİR kararı **hâlâ geçerli**. Atomik kapsam Faz 3 hijyenine sığmıyor, B33 (HMAC short-lived token) pattern referansı MANUAL_TASKS'ta saklı.
- **AMA**: Eğer audit dökümanları (B38) public Pages'e sızıyorsa → Drive folder ID'leri `cloudflare-worker.js:7` `DRIVE_FOY_KLASOR_ID = '1-xqi...'` görülür → restricted klasör enumeration başlangıcı. **B38 düzeltilmeden P1-7 P3-DEVİR riski yükselir.**
- **Verdiğim öneri:** B38 BLOCKER fix önce. Sonra P1-7 hâlâ P3-DEVİR.

#### **P1-8 → B+600k iter (PBKDF2-SHA256)** — yeniden sorgu
- **Karar:** Misafir parola Worker-side PBKDF2 600k iter.
- **Worker CPU ölçümü hipotezi:** Cloudflare Worker free tier 10ms CPU, paid 30s CPU. PBKDF2 600k SHA-256 ~ Node.js benchmark ~200-500ms (Worker V8 isolate ~250-600ms). 
  - **Free tier**: timeout — Worker reject. Paid tier (Workers Paid plan): OK.
  - Mevcut deploy paid mi? wrangler.toml'da `[[unsafe.bindings]]` rate limit kullanılıyor — bu özellik Workers Paid plan'da. ✓ Plan paid varsayılır.
- **Bugünkü kanı:** **Production ölçüm M9 sonrası şart.** Smoke test 6 (`/misafirLogin yanlış parola`) PBKDF2 hesabı tetikler — yanıt süresi <600ms olmalı. Eğer >1000ms ise iter'i 300k'ya düşür (OWASP min 100k, B5 Faz 2 USER_DECISION'da 600k'yı seçti).
- **Verdiğim öneri:** Smoke test 6'ya yanıt süresi ölçümü ekle. M9 sonrası kullanıcı sürekli timeout görüyorsa iter düşür.

#### **PII_PEPPER 12 hex (48 bit)** — yeniden sorgu
- **Karar:** Worker maskPIIvalue `pii:` + ilk 12 hex (= 48 bit identifier).
- **Doğum günü saldırı kapsamı:** 48 bit identifier için kollizyon olasılığı √(2^48) ≈ 16.7M unique input sonrası. 2-3 admin için 16M input = imkansız. KÖSTER personel listesi 40 kişi. Toplam unique PII < 100. Kollizyon olasılığı **0**.
- **Future scale:** Şirket 1000 kullanıcıya çıkarsa 48 bit hâlâ yeterli (kollizyon ~%0.001). 1M+ kullanıcı için 64 bit (16 hex) öneririm.
- **Bugünkü kanı:** **Mevcut karar doğru.** Future-proof için 16 hex'e çıkmak ucuz değişiklik (1 satır frontend regex değişir mi? Hayır, sadece görsel).
- **Verdiğim öneri:** Mevcut tut, P3'te 64-bit'e (16 hex) çık.

### 4.2 Faz 2+3 commit'lerinin tek tek değerlendirmesi

| Commit | Karar/Doğruluk | Regresyon? | Alternatif |
|---|---|---|---|
| 46d6c84 P1-1 (xlsx CDN+SRI) | ✓ doğru | yok | html2canvas/jspdf için aynı yapılmadı (B43) |
| 20e8f10 P1-4 (realtime bolge filter) | ⚠ child tablolar atlanmış | B6 | child tablolara bolge denormalize |
| b893e19 P1-9 (realtime exp backoff) | ✓ doğru | yok | — |
| 8dcdb60 P1-5 (storeDel header) | ⚠ error handling eksik | B1 | r.ok check ekle |
| 5f6645b P1-8 (PBKDF2 600k) | ✓ doğru | yok | iter upper-bound (B17) |
| 23b2ddb P1-10 (Worker /maskPII) | ✓ doğru | yok | rate limit (B19) |
| d406f60 P1-14 (dashboard mask) | ⚠ log.js'e yayılmamış | B10 | mask helper ortak modül |
| 7479ecb P1-7 P3-DEVİR | ✓ doğru karar | yok | B38 düzeltilmeden risk artar |
| 353b534 P2-1 (.gitignore + .cfignore) | ⚠ .cfignore non-standard | B38 | Pages destek doğrulanmalı |
| bbe70d0 P1-13 (.gitattributes) | ✓ doğru | yok | — |
| de4f471 errata (malzemeler) | ✓ doğru | yok | anon kaldır (B36) |
| d4267a4 audit/modules docs | ✓ doğru | yok | — |
| 641dc2a smoke.sh | ⚠ test 6 RL süre yok | B47 | M9 doğrulama açık |
| fc5681a B1 (M2 BEGIN/COMMIT) | ✓ doğru | yok | diğer migration'lara yay (B34) |
| 847f0a3 B2 (race fix) | ✓ doğru | yok | — |
| 8916644 B3 (M0 3-tablo) | ✓ doğru | yok | — |
| cd0d315 B4 (Worker rate limit) | ✓ doğru | yok | namespace_id (B39) |
| b1231cb B5 (PII rotation) | ✓ doğru | yok | — |
| 76cbdc6 B6 (M-1 main rename) | ✓ doğru | yok | — |
| a76336c B7 (smoke +3 case) | ⚠ test 6 yetersiz | B47 | RL test optional flag |
| 304b4d1 NIT'ler (B1+B3+B6+B7) | ✓ doğru | yok | — |
| ca7a31a B4-NIT (RL hijyen) | ✓ doğru — randomUUID reddedildi | yok | doğru karar |

**Genel kanı:** 22 commit'in 16'sı temiz doğru, 6'sı cross-cutting eksiklik veya minor regresyon barındırıyor. Kritik regresyon yok. Ana eksikler **policy/cross-pattern yayılım** (mask, BEGIN/COMMIT, SRI).

---

## 5. Deploy/SQL bulguları

### 5.1 Migration order assumptions

MANUAL_TASKS deploy turu: **M-1** (branch rename) → **M0** (pre-deploy DISTINCT check) → **M1** (p1_policy_consolidation) → **M2** (p1_santiye_raporlar_rls) → **M3** (p1_open1_storage_misafir_kapat) → **M5** (p3_malzemeler_consolidation) → **M6** (PII_PEPPER secret) → **M7** (GUEST_PASSWORD_HASH secret) → **M4+M8** (Worker bundle) → **M9** (RL binding) → **smoke**.

**Bağımlılık zinciri:**
- M2 → `santiye_raporlar` tablosu var olmalı → **2026-05-02_santiye_raporlar.sql baseline migration ZORUNLU** (yeni env'de). MANUAL_TASKS'ta görünür mü? (kullanıcı doğrulamalı.)
- M3 → `storage.objects` var (Supabase default) ✓
- M4+M8 (Worker bundle) → secrets M6+M7 set olmalı (yoksa /misafirLogin 500, /maskPII 500).
- M9 → Worker bundle deploy edilmiş olmalı (binding referans veriyor).

**🟡 RİSK (B49):** Baseline migration (2026-05-02 + 2026-05-03) MANUAL_TASKS'ta listelenmemiş olabilir. Yeni env deploy'da `santiye_raporlar` tablosu yok → M2 fail. **§9'da soru.**

### 5.2 Idempotency

| Migration | İdempotent? | Sebep |
|---|:-:|---|
| 2026-05-02 baseline | ❌ | CREATE TABLE — yorum line 17 explicit |
| 2026-05-03 backfill | ✅ | `where file_id is null` |
| P0 RLS | ✅ | drop if exists + create canonical |
| M1 (consolidation) | ✅ | DO blok dynamic drop + create |
| M2 (raporlar RLS) | ✅ | atomic + DO blok defansif |
| M3 (storage misafir) | ✅ | drop if exists + DO blok |
| M5 (malzemeler) | ✅ | drop if exists + DO blok |

Sadece baseline non-idempotent → ilk kurulumdan sonra geri çalıştırılmaz.

### 5.3 Rollback senaryoları

**M2 (atomic ✓):** dry-run pattern doğru (`commit;` → `rollback;`). Production fail = otomatik rollback.

**Diğer migration'lar (BEGIN/COMMIT yok, B34):** Yarı uygulama state'i mümkün. **Manuel rollback playbook YOK.**

**🟡 RİSK (B50):** Senaryo 6 (M2 OK, M3 fail) → manuel kurtarma prosedürü dokümante değil. Önerim:
- Her migration için "geri alma SQL'i" ek dosya (örn. `2026-05-04_p3_malzemeler_consolidation.rollback.sql`).
- Veya: Supabase Dashboard "SQL Editor → Transaction" toggle (run as transaction).

### 5.4 Secret management

| Secret | Kim | Nereye | Rotation |
|---|---|---|---|
| GOOGLE_CLIENT_ID/SECRET | Worker | Wrangler / Dashboard | manuel |
| GOOGLE_REFRESH_TOKEN | Worker | aynı | OAuth flow yeniden |
| DRIVE_KLASOR_ID | Worker | aynı | nadiren |
| GEMINI_API_KEY | Worker | aynı | manuel |
| SUPABASE_URL/ANON_KEY | Worker | aynı | Supabase project değişirse |
| SUPABASE_JWT_SECRET | Worker | aynı | **kritik — JWT kontrol** |
| **PII_PEPPER** (M6) | Worker | aynı | rotation = tüm `pii:` cache invalid (B5 doc) |
| **GUEST_PASSWORD_HASH** (M7) | Worker | aynı | misafir parola değişiminde yeniden hash |

**Pepper rotation senaryosu:** B1231bc commit'in B5 NIT'i bu senaryoyu doc'a aldı:
- Pepper değişirse → mevcut DB'deki `pii:hash` değerleri eski pepper ile hesaplanmıştı → yeni pepper ile mask → cache key uyumsuz → tüm `duzenleyen` "Admin" hard-mask'e düşer.
- **Önerilen prosedür:** Rotation öncesi DB DECRYPT/RECOMPUTE migration: SELECT DISTINCT duzenleyen → eski pepper ile reverse lookup imkansız (one-way) → kullanıcı her satır için manuel admin map'i kullanmalı.
- Yani **PII_PEPPER rotation = veri kaybı** (mask integrity bozulur). Doc'ta bu açık.

### 5.5 Worker bundle deploy edge case'leri

**M9 atlama (B47):** Worker handler defansif `if (env.MISAFIR_LOGIN_RL) { ... }`. Binding eksikse rate limit kapalı, endpoint çalışır → brute force kapısı. Smoke test bunu yakalamıyor (test 6 sadece tek yanlış parola).

**Compatibility date 2025-01-01 (B40):** Yeni Worker özellikleri kapalı. Mevcut çalışıyor.

**Wrangler vs Dashboard deploy:** Mevcut süreç Dashboard ("Edit code → Save and Deploy"). Bu yöntem `wrangler.toml` binding'lerini OTOMATİK uygulamaz — Dashboard'dan ayrı eklenmeli. **🟢 NIT (B51):** Deploy yöntemi belirsizliği — Dashboard mı Wrangler mı, hangisi seçildi MANUAL_TASKS'ta net olmalı.

---

## 6. Smoke test kapsam analizi

### 6.1 Mevcut 10 test review

| # | Test | Doğru mu? | Yorum |
|:-:|---|:-:|---|
| 1 | Frontend GET /  | ⚠ | Sadece status code; HTML içerik kontrolü yok. 404 sayfası 200 dönerse false positive (B52). |
| 2 | Worker CORS izinsiz Origin | ✓ | Allow-Origin yazılmamalı + Vary kontrolü ✓ |
| 3 | Worker CORS izinli Origin | ✓ | Allow-Origin reflect ✓ |
| 4 | /upload unauth | ✓ | 401 ✓ |
| 5 | /upload auth + boş body | ✓ | 400 ✓ (JWT gerekli) |
| 6 | /misafirLogin yanlış parola | ⚠ | 401 ✓ ama yanıt SÜRESİ ölçümü yok — PBKDF2 çalıştığı doğrulanmıyor (B53). |
| 7 | /maskPII auth tek değer | ✓ | `pii:<hex>` regex ✓ |
| 8 | RLS sanity anon SELECT santiye_raporlar | ✓ | Case branching net (200+boş / 401 / 403 PASS, 200+non-empty FAIL) |
| 9 | CORS actual POST malicious Origin | ✓ | Allow-Origin yansımamalı ✓ |
| 10 | WS connect + 30s heartbeat | ✓ | Node+ws precheck ile defansif skip ✓ |

### 6.2 Eksik test alanları

- **B47:** /misafirLogin rate limit doğrulama opt-in flag arkasında (RUN_RL_TEST=1) — kullanıcı flag'i kullanmazsa M9 düzgün deploy edildiği KANITLANMIYOR. Otomatize edilemez (kullanıcı kendi IP'sini 60s bloklar) ama prosedürel önemli.
- **B54:** /rapor endpoint smoke YOK — auth yok testi (401) bile eklenmiş değil. En az bir 401 test eklenmeli (Gemini call tetiklemeden).
- **B55:** /fotoIndir endpoint smoke YOK — auth yok 401 test eklenmeli.
- **B56:** /raporPdf endpoint smoke YOK — auth yok 401 test eklenmeli.
- **B57:** PII determinism test YOK — M6 doğrulama manuel/MANUAL_TASKS'ta. Smoke'a entegre edilebilir: `aynı email 2 kez → aynı pii:hash`.
- **B58:** Cache-Control header test YOK — Senaryo 9 (B48) için. /misafirLogin response'unda `Cache-Control: no-store` beklenir.
- **B59:** Index/main JS load test YOK — Test 1 200 dönüyor ama `js/main.js` dosyası gerçekten erişilebilir mi? Pages routing bozulursa fark edilmez.
- **B60:** SRI hash drift test YOK — html2canvas/jspdf SRI eklenirse, CDN versiyon değişikliği fail eder. Smoke'da `<script integrity=` regex check.

### 6.3 False positive/negative riski

- **Test 1 false positive** (B52): Pages 404 catch-all sayfası 200 dönebilir.
- **Test 6 false negative** (B53): PBKDF2 atlanıp constant-time fail dönülürse smoke geçer ama brute force kapısı açık.
- **Test 8 false positive**: Anon SELECT 401 dönerse PASS — ama 401'in sebebi RLS değil, başka bir auth fail olabilir (örn. apikey eksik). Mevcut test bu farkı ayırt etmez. **🟢 NIT (B61):** RLS deny vs auth fail ayrı assert.

---

## 7. Sınıflandırılmış bulgu listesi

### 7.1 🔴 BLOCKER (deploy öncesi MUTLAKA fix)

**Bu turdan KESİN BLOCKER YOK.** Aşağıdaki ÖNEMLİ bulgular `B38` ve `B43` koşula bağlı BLOCKER:

- **B38 → KOŞULLU BLOCKER:** Eğer `curl -I https://santiye-takipp.pages.dev/AUDIT_FINAL.md` 200 dönerse → audit dökümanları PUBLIC SIZIYOR → DERHAL fix (Pages routing veya repo split). Eğer 404 → ÖNEMLİ NIT seviyesine düşer.
- **B43 → KOŞULLU BLOCKER:** html2canvas + jspdf SRI yokluğu. cdnjs trusted ama supply chain audit politikası varsa BLOCKER. Yoksa ÖNEMLİ.

### 7.2 🟡 ÖNEMLİ (fix önerilir, gerekçeli skip kabul)

| ID | Konu | Kapsam | USER_DECISION? |
|---|---|---|:-:|
| **B1** | storeDel error handling | db.js | |
| **B2** | KULLANICI_ADLARI miss → "Admin" collision | auth.js | ✓ |
| **B10** | log.js PII fallback yok (dashboard'la tutarsız) | views/log.js | |
| **B12** | sbKaydet 4× silent .catch | modals/record.js | |
| **B14** | santiye_raporlar.hazirlayan_email RAW EMAIL | rapor.js + migration | ✓ |
| **B17** | PBKDF2 verify iter upper-bound yok | cloudflare-worker.js | |
| **B18** | /rapor rate limit yok — Gemini cost vector | cloudflare-worker.js | |
| **B32** | santiye_log UPDATE+DELETE policy açık | migration p1_policy | |
| **B33** | Email rotation recovery yok | migration p1_raporlar_rls | ✓ |
| **B34** | Migration BEGIN/COMMIT eksik (6 dosya) | migrations/* | |
| **B38** | .cfignore non-standard, Pages destek belirsiz | .cfignore | |
| **B42** | manifest.json icons/ klasörü yok | manifest.json | |
| **B43** | html2canvas + jspdf SRI yok | index.html | |
| **B47** | M9 atlanırsa /misafirLogin korumasız + smoke yakalamıyor | smoke.sh + Worker | |
| **B49** | Baseline migration MANUAL_TASKS'ta yok olabilir | MANUAL_TASKS.md | ✓ |
| **B50** | Rollback playbook yok (BEGIN/COMMIT eksiği için) | docs | |

**Toplam ÖNEMLİ: 16** (4'ü USER_DECISION).

### 7.3 🟢 NIT (hijyen, post-deploy/P3)

| ID | Konu |
|---|---|
| B3 | supabaseCikis silent catch |
| B4 | Session timeout scroll/wheel coverage yok |
| B5 | Misafir mask anon Bearer fail |
| B6 | Realtime child tablolar bolge filter yok |
| B7 | ws.onerror sessiz |
| B8 | hasarFotoYukle Drive→DB orphan |
| B9 | photo.js resp.json catch yok |
| B11 | dashboard.js _piiPrefetch render await |
| B13 | record.js kayitSil cascade silent |
| B15 | rapor.js console.log debug |
| B16 | rapor.js html2canvas scale 3 mobile |
| B19 | /maskPII rate limit yok (minor) |
| B20 | Worker err.message frontend leak |
| B21 | /upload `..` over-restrictive |
| B22 | klasorBulVeyaOlustur backslash escape yok |
| B23 | driveMultipartYukle hardcoded boundary |
| B24 | Worker console.log [KAYNAK] debug |
| B25 | kosterWebAra HTML scraping fragility |
| B26 | kosterFetch redirect:'follow' cross-domain |
| B27 | Drive klasör paralel yarış |
| B28 | verifyJwt iat/nbf/aud/iss eksik |
| B29 | Hardcoded hostname kategori cache |
| B30 | GUEST_PASSWORD_HASH yokluğu mesajı leak |
| B31 | requireAuth token tekrar parse |
| B35 | santiye_raporlar.bolge nullable |
| B36 | malzemeler anon role gereksiz açık |
| B37 | record_fotograflar UPDATE policy yok |
| B39 | wrangler.toml namespace_id "1001" |
| B40 | wrangler.toml compatibility_date eski |
| B41 | hash_misafir_pass.mjs argv shell history |
| B44 | Token in-memory only (info, kasıtlı) |
| B45 | index.html iframe src JS ile set |
| B46 | /misafirLogin 429 UI mesajı yanıltıcı |
| B48 | Worker response Cache-Control yok |
| B51 | Wrangler vs Dashboard deploy belirsiz |
| B52 | Smoke test 1 HTML body verify yok |
| B53 | Smoke test 6 PBKDF2 yanıt süresi ölçüm yok |
| B54 | /rapor smoke yok |
| B55 | /fotoIndir smoke yok |
| B56 | /raporPdf smoke yok |
| B57 | PII determinism smoke yok |
| B58 | Cache-Control smoke yok |
| B59 | js/main.js load smoke yok |
| B60 | SRI drift smoke yok |
| B61 | RLS deny vs auth fail ayrımı yok |

**Toplam NIT: 35.**

### 7.4 Bulgu özet sayımı

- 🔴 **BLOCKER:** 0 (B38 + B43 koşullu — kullanıcı doğrulamasıyla netleşir)
- 🟡 **ÖNEMLİ:** 16 (4 USER_DECISION)
- 🟢 **NIT:** 35
- **TOPLAM:** 51

---

## 8. Aksiyon planı

### 8.1 Faz A — KOŞUL DOĞRULAMA (HEMEN, kullanıcı yapar, ~5 dk)

1. **B38 doğrulama:** `curl -I https://santiye-takipp.pages.dev/AUDIT_FINAL.md`
   - 200 → KÖTÜ → BLOCKER → Faz B atla, doğrudan Faz B'ye git.
   - 404 → İYİ → B38 NIT'e düşer.
2. **B49 doğrulama:** `git log --all --oneline migrations/2026-05-02_santiye_raporlar.sql` — kullanıcı bu migration'ın deploy edildiğini hatırlıyor mu? MANUAL_TASKS.md'de M0 öncesi referans var mı?

### 8.2 Faz B — BLOCKER fix (varsa, 1-3 saat)

1. Eğer B38 BLOCKER: `_routes.json` veya `_headers` ile path-based exclude (Cloudflare Pages docs).
2. Eğer B43 BLOCKER: html2canvas + jspdf SRI hash hesapla, index.html'e ekle.

### 8.3 Faz C — ÖNEMLİ fix (deploy öncesi tercih, 4-6 saat)

| Sıra | ID | Efor | Sebep |
|:-:|---|---|---|
| 1 | B17 | 5 dk | PBKDF2 iter upper-bound — küçük tek satır ama kritik DoS önleme |
| 2 | B32 | 5 dk | santiye_log immutable yap (drop policy) — audit integrity |
| 3 | B42 | 30 dk | PWA icons ekle (192px+512px PNG üret) |
| 4 | B34 | 30 dk | 6 migration'a BEGIN/COMMIT ekle |
| 5 | B47 | 15 dk | Smoke test 6'ya yanıt süresi assertion + M9 prosedürü dokümante |
| 6 | B1 | 10 dk | storeDel r.ok check |
| 7 | B12 | 30 dk | sbKaydet 4× silent catch kaldır (throw'a izin) |
| 8 | B10 | 60 dk | log.js PII mask helper kullansın (paylaşılan modül) |
| 9 | B18 | 45 dk | /rapor rate limit binding ekle |
| 10 | B50 | 90 dk | Rollback playbook dosyaları yaz |

**Toplam: ~5 saat efor, deploy bloker engelleme yok.**

### 8.4 Faz D — USER_DECISION'lar (kullanıcı kararı, fix kapsam değişebilir)

- **B2** (yeni admin "Admin" hard-mask): A/B/C seçenekleri §2.1
- **B14** (santiye_raporlar.hazirlayan_email raw): A/B/C §2.1
- **B33** (email rotation): UUID-bazlı RLS migration (P3 önerim)
- **B49** (baseline migration durumu): kullanıcı doğrulamasından sonra karar

### 8.5 Faz E — NIT'ler (post-deploy, P3)

35 NIT — düzeltme sırası önemsiz, hijyen çalışmaları. Toplam ~8-12 saat efor (hepsi).

### 8.6 Önerilen deploy akışı (audit sonrası)

```
1. Faz A — koşul doğrulama (kullanıcı, 5 dk)
2. Faz B — eğer BLOCKER varsa fix (1-3 saat)
3. Faz D — USER_DECISION'lar netleştir (toplam 30 dk istişare)
4. Faz C — ÖNEMLİ fix'ler (5 saat)
5. M-1 → M0 → ... → smoke (mevcut MANUAL_TASKS prosedürü)
6. Production smoke geçince → P3 turuna geç (Faz E NIT'ler + USER_DECISION sonuçları)
```

---

## 9. AÇIK SORULAR / USER_DECISION_NEEDED

Kullanıcı yanıtı bekleyen sorular (numaralandırılmış, prioritize edilmiş):

### S1 — B38 doğrulama (KOŞUL — HEMEN)
**Soru:** `curl -I https://santiye-takipp.pages.dev/AUDIT_FINAL.md` çalıştır. Sonuç 200 mi, 404 mü?
**Niye önemli:** Cloudflare Pages `.cfignore` desteklemiyorsa audit dökümanları (içinde tüm güvenlik tradeoff'ları, secret listesi) PUBLIC. Acil BLOCKER tetikleyici.
**Eğer 200:** Faz B (BLOCKER fix) — _routes.json veya repo split.
**Eğer 404:** B38 NIT'e düşer, devam.

### S2 — B49 doğrulama (KOŞUL)
**Soru:** Mevcut Supabase project'te `santiye_raporlar` tablosu var mı? Kullanıcı 2026-05-02 baseline migration'ı çalıştırmış mı?
**Doğrulama SQL:** `select count(*) from santiye_raporlar;` → satır sayısı (0 olabilir, ama 42P01 "table does not exist" hatası BLOCKER).
**Eğer tablo yok:** Baseline migration'ı MANUAL_TASKS'a ekle, M2 öncesi çalıştır.

### S3 — B2 (yeni admin "Admin" hard-mask) USER_DECISION
**Soru:** Yeni admin Supabase'de oluşturulup `KULLANICI_ADLARI` map'ine eklenmediğinde + Worker erişilemez ise:
- A) Login REDDET (sıkı — UX maliyeti)
- B) `Admin#abcd` deterministik suffix (orta — log'da ayırt edilebilir)
- C) Mevcut "Admin" hard-mask kabul + CLAUDE.md'ye doc

### S4 — B14 (santiye_raporlar.hazirlayan_email RAW EMAIL) USER_DECISION
**Soru:** Raporlar tablosunda email kolonunu nasıl tutuyoruz?
- A) Mevcut (raw email + RLS) + AUDIT_FINAL.md'ye tradeoff doc
- B) UUID-bazlı RLS (auth.uid() — B33 ile birleşik fix)
- C) hazirlayan_email_hash kolonu (SHA256 + pepper, RLS hash match)

### S5 — B33 (email rotation senaryosu) USER_DECISION
**Soru:** Admin email değişikliği gerçek bir senaryo mu?
- A) UUID-bazlı RLS (P3 — orta efor, future-proof)
- B) Email değişikliği prosedürü (manuel SQL UPDATE + doc)
- C) Mevcut kabul (admin email değişmez varsayımı)

### S6 — MIMARI.md (untracked dosya)
**Soru:** `MIMARI.md` (457 LoC, untracked) ne yapılsın?
- A) `git add MIMARI.md` + commit (sistem dokümantasyonu)
- B) Sil (gereksiz)
- C) `.gitignore` ekle (kişisel notlar)

### S7 — Faz B+C+D fix turu onayı
**Soru:** Faz B (BLOCKER), C (ÖNEMLİ), D (USER_DECISION) sıralamasıyla fix turu başlatılsın mı?
- A) Evet, hepsi → tahmini 6-9 saat (USER_DECISION süreleri hariç)
- B) Sadece BLOCKER + USER_DECISION → 2-4 saat (sonra deploy, NIT'ler P3)
- C) Hiç fix yapma, doğrudan deploy (mevcut state ile, riskleri kabul et)

---

## 10. Audit kapanış notu

**Audit kapsamı:** 45 in-scope dosya + 12 meta = 8808 satır kod taraması.
**Süre:** Tek session.
**Yöntem:** Manuel sıralı el-okuma (her dosya baştan sona) + cross-cutting senaryolar + USER_DECISION yeniden değerlendirme + brief Section A-F tam coverage.
**Tespit edilen bulgu:** 51 (0 kesin BLOCKER, 16 ÖNEMLİ, 35 NIT).
**KOŞUL BLOCKER potansiyeli:** B38 (kullanıcı testiyle netleşir).
**USER_DECISION bekleyen:** 4 (S3, S4, S5, S6) + 3 doğrulama sorusu (S1, S2, S7).

**Sonuç:** Repo deploy-edilebilir state'te ama **B38 doğrulaması yapılmadan production push önerilmez**. Önemli audit trail integrity boşluğu (B32) ve pasif PII storage tradeoff'u (B14) kullanıcı kararıyla netleşmeli. Kalan ÖNEMLİ bulgular (B1, B10, B12, B17, B34, B42, B43, B47, B50) deploy öncesi 5 saatlik fix turuyla kapatılabilir.

**Bir sonraki adım:** Kullanıcı S1 (B38 doğrulama) sonucunu paylaşır + Faz D USER_DECISION'larını cevaplar → fix turu başlatılır.

---

<!-- §6 §7 §8 §9 §10 yukarıda — bu eski placeholder'lar §5 sonrası iskeletinde doğru yerlerinde. -->
<!-- Bu satırların altında ek içerik yok; tüm bölümler §5'in sonunda yazıldı. -->
