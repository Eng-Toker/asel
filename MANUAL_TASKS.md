# MANUAL_TASKS.md

> Sıralı liste. Yukarıdan aşağı yapılmadan bir sonrakine geçilmez.
> Status: [ ] = bekliyor, [x] = tamamlandı (tarih ekle)

---

## M0 — PRE-DEPLOY CHECK: legacy duzenleyen değerleri (UX riski)
- **Tip:** SQL inceleme (Supabase Dashboard, write yok)
- **Önkoşul:** yok — TÜM M*'dan önce bu çalıştırılır
- **Bloke ettiği:** kullanıcı kararı (backfill gerekli mi)
- **Karar:** B3 deploy bloker (2026-05-04 user feedback). _MAPPED set
  (`["abdulrahman", "deniz"]`) dışında kalan adminlerin DB'deki legacy
  `duzenleyen` değerleri ham email veya email local-part olabilir; M8 deploy
  sonrası dashboard `_piiGoster` fallback'i bunları "Admin" sabit string'e
  döndürür → birden fazla kullanıcı aynı görünür (UX problemi, **security
  değil**).
- **Aksiyon:**
  1. Supabase Dashboard → SQL Editor:
  ```sql
  -- 1) Mevcut benzersiz duzenleyen değerleri (sayım + ilk 50)
  select duzenleyen, count(*) c
  from santiye_log
  where duzenleyen is not null and duzenleyen <> '—'
  group by duzenleyen
  order by c desc
  limit 50;
  ```
  2. Çıktıyı incele:
     - `Abdulrahman`, `Deniz`, `Misafir` → mapped/sentinel, **OK**.
     - `pii:<12 hex>` → P1-10 sonrası yazımlar, **OK**.
     - Diğer (örn. `user`, `ali`, `eng.adtoker@gmail.com`) → **legacy aday**.
  3. Legacy aday sayısı:
     - **0** → Aksiyon yok, deploy'a devam.
     - **1-3** → Manuel UPDATE ile dashboard'da gösterilecek görünür ad
       belirle (örn. `update santiye_log set duzenleyen = 'Ali Toker'
       where duzenleyen = 'eng.adtoker';`). KULLANICI_ADLARI map'ine
       de aynı kullanıcıyı ekle (auth.js, ayrı commit gerekir).
     - **>3** → Backfill migration gerekir (Worker /maskPII'a batch
       çağrısı + UPDATE — kapsam genişler, ayrı sprint adayı).
- **Doğrulama (post-deploy):**
  ```sql
  -- Dashboard'da "Admin" görünen sayım
  select count(distinct duzenleyen) c
  from santiye_log
  where duzenleyen is not null and duzenleyen <> '—'
    and duzenleyen not in ('Abdulrahman','Deniz','Misafir')
    and duzenleyen not like 'pii:%';
  -- 0 = ideal; >1 = dashboard "Admin" çoklu görünür
  ```
- **Status:** [ ]

---

## M1 — P1-12 policy consolidation migration deploy
- **Tip:** SQL (Supabase Dashboard)
- **Önkoşul:** ilk task
- **Bloke ettiği:** P1-12 audit kapanışı, FAZ 1 doğrulama
- **Aksiyon:**
  1. Supabase Dashboard → SQL Editor aç
  2. `migrations/2026-05-04_p1_policy_consolidation.sql` içeriğini tek seferde çalıştır
  3. Çıktıda hata olmadığını doğrula
- **Doğrulama:** Aşağıdaki üç sorguyu ayrı ayrı çalıştır:
```sql
-- 1) Anon/public role açık policy (ZERO satır olmalı)
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and ('anon' = any(roles) or 'public' = any(roles));

-- 2) Çift policy taraması (ZERO satır olmalı)
select tablename, cmd, count(*) c, array_agg(policyname) policies
from pg_policies
where schemaname = 'public'
group by tablename, cmd
having count(*) > 1;

-- 3) Hedef tablolarda policy sayımı (her biri 4 olmalı)
select tablename, count(*) c
from pg_policies
where schemaname='public'
  and tablename in ('santiyeler','santiye_notlar','record_asamalar','santiye_log')
group by tablename
order by tablename;
```
- **Beklenen sonuç:** 1 ve 2 sıfır satır; 3 her tablo için 4.
- **Rollback:** Bu migration drop+create. Geri alınmak istenirse:
  - Önceki policy adlarını bilmek lazım (audit'teki `okuma` / `yazma` / `misafir_okuma` muhtemel adlar). El ile recreate gerekir; otomatik rollback YOK.
  - Pratikte: `do $$ … drop policy …` bloğu tekrar çalıştırılabilir, sonra eski snapshot'a göre eski adlarla create edilebilir.
- **Status:** [ ]

---

## M2 — P1-6 santiye_raporlar RLS deploy
- **Tip:** SQL (Supabase Dashboard)
- **Önkoşul:** M1 (P1-12 deploy)
- **Bloke ettiği:** P1-6 audit kapanışı, FAZ 1 doğrulama
- **Karar:** USER_DECISION 2026-05-04 → **Seçenek A (sıkı sahiplik)**.
  Kullanıcı sadece kendi email'iyle INSERT yapabilir ve sadece kendi raporlarını
  okur. Future multi-admin görünürlüğü için P2 `user_bolgeleri` (AUDIT §11.2).
- **Aksiyon:**
  1. Supabase Dashboard → SQL Editor aç
  2. **DRY-RUN ÖNCE:** Tüm SQL'i `BEGIN; <SQL>; ROLLBACK;` ile sar ve çalıştır.
     Hata yok ise commit'sız geri dönüş — production state değişmez ama
     conflict / sözdizimi hatası şimdi tespit edilir.
  3. Dry-run temiz ise: `migrations/2026-05-04_p1_santiye_raporlar_rls.sql`
     içeriğini tek seferde çalıştır (BEGIN/ROLLBACK olmadan)
  4. Çıktıda hata olmadığını doğrula
- **Doğrulama:**
```sql
-- 1) Policy listesi (rap_select + rap_insert beklenir, başka yok)
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public' and tablename='santiye_raporlar'
order by policyname;

-- 2) Davranış testi (kendi auth oturumunda Supabase SQL Editor "run as" admin):
--    Kendi email'inle INSERT → ✓ başarılı
--    Başka email ile INSERT → 42501 new row violates row-level security
--    SELECT → sadece kendi satırların
```
- **Beklenen sonuç:** 1) iki satır (rap_select / rap_insert), her ikisi de
  `{authenticated}` role; 2) davranış testi tutarlı.
- **Rollback:** Eski açık policy'lere dönmek için:
```sql
drop policy if exists "rap_select" on santiye_raporlar;
drop policy if exists "rap_insert" on santiye_raporlar;
create policy "raporlar_read"  on santiye_raporlar for select to authenticated using (true);
create policy "raporlar_write" on santiye_raporlar for insert to authenticated with check (true);
```
- **Status:** [ ]

---

## M3 — OPEN-1 storage misafir SELECT policy kapı
- **Tip:** SQL (Supabase Dashboard) + opsiyonel doğrulama
- **Önkoşul:** M1, M2 (sırayla)
- **Bloke ettiği:** OPEN-1 audit kapanışı, FAZ 1 doğrulama
- **Karar:** 2026-05-04 → Kapı kapat. Gerekçe: kod analizi (Storage'a upload
  yok, frontend Drive URL kullanıyor, anon SELECT bırakmanın UX faydası yok).
- **Aksiyon:**
  1. Supabase Dashboard → SQL Editor aç
  2. `migrations/2026-05-04_p1_open1_storage_misafir_kapat.sql` çalıştır
  3. Çıktıda hata olmadığını doğrula
- **Doğrulama:**
```sql
-- 1) Anon/public storage policy kalmadı mı (ZERO satır)
select policyname, cmd, roles
from pg_policies
where schemaname='storage' and tablename='objects'
  and ('anon'=any(roles) or 'public'=any(roles));

-- 2) Beklenen kalan policy'ler (santiye_fotolar_{select,insert,delete})
select policyname, cmd, roles
from pg_policies
where schemaname='storage' and tablename='objects'
order by policyname;
```
- **Beklenen sonuç:** 1) zero; 2) sadece `santiye_fotolar_select` /
  `_insert` / `_delete` (hepsi `{authenticated}`).
- **Opsiyonel ek doğrulama (legacy dosya envanteri):**
```sql
-- Bucket içinde dosya var mı?
select count(*) from storage.objects where bucket_id='santiye-fotolar';

-- Frontend Storage URL'i tutuyor mu? (Beklenen: 0)
select count(*) from record_fotograflar
where file_url like '%storage/v1/object%';
```
  Eğer ikincisi > 0 ise bu satırlar misafire görünmeyecek demektir; o zaman
  ek karar gerekir (Worker'a Storage proxy ekle ya da Drive'a migrate).
- **Rollback:** Eski policy'yi yeniden oluşturmak için (önerilmez):
```sql
-- Sadece zorunlu rollback senaryosunda:
create policy "misafir_foto_okuma" on storage.objects
  for select to anon
  using (bucket_id='santiye-fotolar');
```
- **Status:** [ ]

---

## M4 — Worker bundled deploy (P1-3 + P1-11 + P1-2)
- **Tip:** Cloudflare Worker Direct Deploy (`drive-upload.eng-adtoker.workers.dev`)
- **Önkoşul:** M1, M2, M3 (sırayla — DB kapıları önce). DB tarafı ile Worker
  arasında doğrudan bağımlılık yok ama production'a sıralı çıkmak audit
  doğrulamasını kolaylaştırır.
- **Bloke ettiği:** Faz 1 deploy doğrulaması (CORS, validation, multimodal
  mitigation hepsi production'da aktif olmalı).
- **Kapsam (tek bundle):**
  - P1-3 (commit `8c8324d`): CORS Origin whitelist (`*` → santiye-takipp.pages.dev
    + preview pattern + localhost; izinsiz Origin'e Allow-Origin yazılmaz)
  - P1-11 (commit `fc3f732`): SISTEM_PROMPT KURALLAR'a multimodal injection
    mitigation maddesi
  - P1-2 (commit `5d2dd58`): /upload validation (size 10MB + MIME whitelist
    + magic byte sniff + ext whitelist + path traversal)
- **Aksiyon:**
  1. Cloudflare Dashboard → Workers & Pages → `drive-upload` Worker
  2. "Edit code" → mevcut `cloudflare-worker.js` içeriğini repo'daki son hâliyle
     değiştir (working tree HEAD = `885d025`)
  3. "Save and Deploy" → yeni version aktif
  4. Deploy log'unda hata olmadığını doğrula
- **Doğrulama (curl ile production'a):**
```bash
# 1) İzinsiz Origin → Allow-Origin header'ı YOK olmalı
curl -i -X OPTIONS https://drive-upload.eng-adtoker.workers.dev/ \
  -H "Origin: https://attacker.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
# Beklenen: response'ta "access-control-allow-origin" satırı YOK; "vary: origin" VAR.

# 2) İzinli Origin → Allow-Origin yansıtılır
curl -i -X OPTIONS https://drive-upload.eng-adtoker.workers.dev/ \
  -H "Origin: https://santiye-takipp.pages.dev" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
# Beklenen: "access-control-allow-origin: https://santiye-takipp.pages.dev"

# 3) /upload validation — boş gövde
curl -i -X POST https://drive-upload.eng-adtoker.workers.dev/ \
  -H "Authorization: Bearer <kendi_jwt>" \
  -H "Content-Type: application/json" \
  -d '{}'
# Beklenen: 400 + {"error":"Geçersiz veya eksik MIME tipi (jpeg/png/webp)"}

# 4) /upload validation — kötü uzantı
curl -i -X POST https://drive-upload.eng-adtoker.workers.dev/ \
  -H "Authorization: Bearer <kendi_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"imageData":"data:image/jpeg;base64,/9j/AAA=","fileName":"x.exe"}'
# Beklenen: 400 + {"error":"Geçersiz dosya uzantısı (jpg/jpeg/png/webp)"}

# 5) Smoke: gerçek küçük JPEG (frontend'den gönderilen mantıkla)
# (browser üzerinden uygulamada test daha hızlı)
```
- **Beklenen sonuç:** Yukarıdaki 4 curl tutarlı; uygulamada gerçek foto
  upload akışı (admin login → kayıt aç → fotoğraf ekle → kaydet) hâlâ çalışıyor.
- **Rollback:** Cloudflare Workers UI → Deployments → bir önceki version
  (P0-17 hotfix sonrası, commit `82cfcbb`'ye karşılık gelen) → "Rollback to
  this deployment".
- **Status:** [ ]

---

## M5 — Malzemeler errata policy konsolidasyonu (Faz 3 ADIM 11'de yazılacak)
- **Tip:** SQL (Supabase Dashboard)
- **Önkoşul:** M1, M2, M3 (DB tarafı sıralı)
- **Bloke ettiği:** Audit P1 closure (malzemeler errata)
- **Karar:** Faz 1 M1 doğrulamasında tespit edildi (3 SELECT policy, hepsi qual=true).
  Lookup tablosu (id/name/sort_order/active/created_at), hassas data yok → tek
  canonical policy `malzemeler_select for select to anon, authenticated using (true)`.
- **Aksiyon:**
  1. Supabase Dashboard → SQL Editor aç
  2. `migrations/2026-05-04_p3_malzemeler_consolidation.sql` (Faz 3 ADIM 11'de
     yazılacak) içeriğini tek seferde çalıştır
  3. Çıktıda hata olmadığını doğrula
- **Doğrulama:**
```sql
-- malzemeler tablosunda tek SELECT policy kalmalı
select policyname, cmd, roles
from pg_policies
where schemaname='public' and tablename='malzemeler'
order by policyname;
```
- **Beklenen sonuç:** Yalnızca `malzemeler_select` (anon+authenticated, using=true).
- **Status:** [ ] (Faz 3 ADIM 11 commit'inden sonra çalıştırılır)

---

## M6 — PII_PEPPER Worker secret (P1-10)
- **Tip:** Cloudflare Worker secret (`wrangler secret put` veya Dashboard UI)
- **Önkoşul:** M1, M2, M3, M5 (DB tarafı bitince)
- **Bloke ettiği:** Worker /maskPII endpoint çalışması — secret yoksa 500.
  M8 deploy'undan ÖNCE secret eklenmeli.
- **Karar:** Worker SHA-256 hash için server-side pepper. Frontend asla görmez.
  Bir kerelik üret. **Compromise olmadıkça rotate etme**; compromise durumunda
  yeni pepper üret + mevcut DB'deki `duzenleyen` hash'leri orphan kabul edilir
  (rotation aslında pseudo-anonymization'ı yeniler — eski hash'ler eşleşmez,
  yeni yazımlar yeni hash, log korelasyonu kesilir ama UX'te dashboard
  "Admin" hard-mask fallback devreye girer).
- **Aksiyon:**
  1. Lokalde 32+ karakter rastgele string üret (hex de olur):
     ```bash
     openssl rand -hex 32
     # veya
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
  2. Cloudflare Dashboard → Workers & Pages → `drive-upload` → Settings →
     Variables → "Add variable" → Encrypt → name: `PII_PEPPER`, value: yukarıdaki
     hex string. Save.
  3. (Alternatif) `wrangler secret put PII_PEPPER` → prompt'a yapıştır.
- **Doğrulama (M8 deploy'undan sonra):**
```bash
# Authenticated bir JWT ile (admin login + devtools network'ten kopyala)
JWT="<paste-here>"
URL="https://drive-upload.eng-adtoker.workers.dev/maskPII"

# 1) Tek değer hash format
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"values":["a@x.com"]}'
# Beklenen: {"masked":["pii:<12 hex>"]}

# 2) DETERMINISM — aynı input 2 kere = aynı hash
A1=$(curl -s -X POST "$URL" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"values":["a@x.com"]}')
A2=$(curl -s -X POST "$URL" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"values":["a@x.com"]}')
[ "$A1" = "$A2" ] && echo "✓ deterministic" || echo "✗ NOT deterministic ($A1 vs $A2)"

# 3) ANTI-COLLISION — farklı input = farklı hash
B=$(curl -s -X POST "$URL" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"values":["b@x.com"]}')
[ "$A1" != "$B" ] && echo "✓ a@x ≠ b@x" || echo "✗ COLLISION ($A1 == $B)"
```
- **Rollback:** Secret'ı sil → /maskPII 500 döner → frontend cache miss
  fallback'leri ("Admin" hard-mask) devreye girer (UX kırılmaz, sadece
  yeni DB yazımları "Admin" sabit string olur — duzenleyen unique olmaz).
- **Status:** [ ]

---

## M7 — GUEST_PASSWORD_HASH Worker secret (P1-8)
- **Tip:** Cloudflare Worker secret
- **Önkoşul:** M1, M2, M3, M5, M6 (sırayla)
- **Bloke ettiği:** Worker /misafirLogin endpoint çalışması — secret yoksa 500
  (giriş yapamaz). M8 deploy'undan ÖNCE secret eklenmeli.
- **Karar:** USER_DECISION 2026-05-04 → B (PBKDF2 SHA-256, 600k iter, 16-byte
  salt, 32-byte derived key). Mevcut "ASEL2026" parolası hash'lenir (rotation
  yapılmıyor — UX süreklilik).
- **Aksiyon:**
  1. Lokalde repo'da `scripts/hash_misafir_pass.mjs` çalıştır:
     ```bash
     node scripts/hash_misafir_pass.mjs "ASEL2026"
     # Çıktı: pbkdf2-sha256$600000$<base64-salt>$<base64-hash>
     ```
  2. Cloudflare Dashboard → Workers & Pages → `drive-upload` → Settings →
     Variables → "Add variable" → Encrypt → name: `GUEST_PASSWORD_HASH`,
     value: yukarıdaki tam string (pbkdf2-sha256$... ile başlayan). Save.
  3. (Alternatif) `wrangler secret put GUEST_PASSWORD_HASH` → prompt'a yapıştır.
- **Parola rotasyonu (gelecekte):** Yeni parola için aynı script'i farklı
  argümanla çalıştır → yeni hash → Dashboard'dan secret value'sunu güncelle.
  Aktif kullanıcılar etkilenmez (frontend hep aynı endpoint'e POST eder).
- **Doğrulama (M8 deploy'undan sonra):**
```bash
# Yanlış parola
curl -i -X POST https://drive-upload.eng-adtoker.workers.dev/misafirLogin \
  -H "Content-Type: application/json" \
  -d '{"password":"YANLIS"}'
# Beklenen: 401 + {"ok":false}

# Doğru parola
curl -i -X POST https://drive-upload.eng-adtoker.workers.dev/misafirLogin \
  -H "Content-Type: application/json" \
  -d '{"password":"ASEL2026"}'
# Beklenen: 200 + {"ok":true}
```
- **Rollback:** Secret'ı sil → /misafirLogin 500 → misafir girişi devre dışı.
  Geçici olarak: eski plaintext check'i geri al ve frontend'i revert (commit
  5f6645b'in tersi). Ancak production'da bunu yapmayın — bunun yerine yeni
  hash üretip secret'ı doğru değerle güncelleyin.
- **Status:** [ ]

---

## M8 — Faz 2 Worker bundle deploy (P1-10 + P1-8)
- **Tip:** Cloudflare Worker Direct Deploy
- **Önkoşul:** M1, M2, M3, M5, M6 (PII_PEPPER), M7 (GUEST_PASSWORD_HASH).
  Secret'lar deploy'dan ÖNCE eklenmeli; aksi halde yeni endpoint'ler 500 döner.
- **Bloke ettiği:** Faz 2 endpoint'lerinin (`/maskPII`, `/misafirLogin`)
  production'da aktif olması.
- **Kapsam (tek bundle, M4'ün üzerine):**
  - P1-10 (commit `23b2ddb`): maskPIIvalue helper + `/maskPII` endpoint
  - P1-8 (commit `5f6645b`): verifyMisafirParola helper + `/misafirLogin`
    endpoint (auth-OPEN, requireAuth gate'inden önce)
- **Birleştirme notu:** Eğer M4 zaten deploy edilmediyse, M4 + M8'in tek
  Worker deploy'unda bundle'lanması mümkün — `cloudflare-worker.js` working
  tree HEAD halihazırda Faz 1 + Faz 2 tüm Worker değişikliklerini içeriyor.
  Pratik olarak: M4 atlanabilir, M8 tek başına FULL bundle'dır. Ardışık
  iki deploy gereksiz.
- **Aksiyon:**
  1. Cloudflare Dashboard → Workers & Pages → `drive-upload` Worker
  2. "Edit code" → mevcut `cloudflare-worker.js` içeriğini repo'daki son hâliyle
     değiştir
  3. "Save and Deploy" → yeni version aktif
  4. Deploy log'unda hata olmadığını doğrula
- **Doğrulama:** Yukarıda M6 ve M7'deki curl testleri.
- **Rollback:** Cloudflare Workers UI → Deployments → bir önceki version →
  "Rollback to this deployment".
- **Status:** [ ]

---

## M9 — Cloudflare WAF / Rate Limiting Rule: /misafirLogin
- **Tip:** Cloudflare Dashboard (kod yok, tek tık)
- **Önkoşul:** M7 (GUEST_PASSWORD_HASH set), M4/M8 Worker bundle deploy
- **Bloke ettiği:** /misafirLogin endpoint'inin DoS koruması (PBKDF2 600k iter
  her istekte ~200-500ms Worker CPU; brute force = CPU sömürüsü).
- **Karar:** B4 deploy bloker (2026-05-04 user feedback). P3'e öteleme;
  deploy turunun parçası.
- **Aksiyon:**
  1. Cloudflare Dashboard → drive-upload Worker zone'u (workers.dev) →
     Security → WAF → "Custom rules" veya "Rate limiting rules" → "Create".
  2. Rule ayarları:
     - **Field:** URI Path
     - **Operator:** equals
     - **Value:** `/misafirLogin`
     - **Method:** POST
     - **Rate:** 5 requests / 1 minute / per IP
     - **Action:** Block (veya Challenge — block tercih edilir)
     - **Response:** 429 Too Many Requests
  3. Save & deploy.
- **Doğrulama:**
  ```bash
  # 6 ardışık istek (5'i geçer, 6.sı 429)
  for i in 1 2 3 4 5 6; do
    curl -o /dev/null -s -w "req $i: %{http_code}\n" \
      -X POST https://drive-upload.eng-adtoker.workers.dev/misafirLogin \
      -H "Content-Type: application/json" \
      -d '{"password":"X"}'
  done
  # Beklenen: ilk 5 → 401, 6. → 429
  ```
- **Rollback:** WAF rule'u devre dışı bırak veya sil.
- **Status:** [ ]

---

## [USER_DECISION_NEEDED] — P1-7 Drive restricted scope ve eski URL migration politikası

**[KARAR: D+errata — P3-DEVİR (2026-05-04 Faz 2 sonu USER_DECISION). Resmi olarak P3 maddesi. AUDIT_FINAL §4 #7 satırında P1 closure yarım değil — taşınmış item.]**

**Önceki karar:** D (2026-05-04 Faz 1 sonu, ertelendi → Faz 2 sonu yeniden değerlendirme).

**Faz 2 sonu yeniden değerlendirme:** Maliyet ölçümü yapıldı (Worker 2 endpoint kaldır + 2 yeni endpoint + HMAC helper + 4-5 frontend dosya = ~150 satır atomik). Faz 2'de gezilmesi beklenen frontend dosyaları (detail.js, lightbox.js, photo.js form preview) Faz 2 turunda DEĞİŞMEDİ — yalnız dashboard.js (P1-14) ve rapor.js (P1-10 defansif daraltma) dokunuldu. Yani brief'in "Faz 2 frontend turuyla birleştirme" gerekçesi tezahür etmedi. Threat profile düşük: 2 user, kapalı pool, unguessable Drive URL. P3 hijyen + ileri kapsam için uygun.

> Bu blok REFERANS amaçlı tutuluyor (silinmedi). P3'te tekrar açılırsa burada
> özetlenen 4 seçenek + B3 alternatifi yeniden değerlendirme zemini olur.

> Bu blok REFERANS amaçlı tutuluyor (silinmedi). P1-7 Faz 2 sonunda
> tekrar açılırsa burada özetlenen 4 seçenek + B3 alternatifi yeniden
> değerlendirme zemini olur.

- **Bağlam:** ADIM 7 başlatma noktasında. Audit P1-7 (W3) "Drive permission `anyone reader` → restricted; signed URL Worker proxy" diyor. İki bağlı karar var:
  1. Eski (mevcut) Drive dosyalarının `anyone reader` izinleri ne olacak (sıkılaştır mı, bırak mı)?
  2. Frontend foto/rapor URL'leri Worker proxy'ye geçecek mi (kapsam: detail.js, dashboard.js, lightbox.js, photo.js form preview, rapor.js sonuç ekranı)?

  **Mevcut durum (kanıt):**
  - `cloudflare-worker.js:176` (foto upload) ve `~821` (raporPdf upload) sonrası `permissions.create({type:'anyone',role:'reader'})`.
  - Foto fileUrl: `https://drive.google.com/thumbnail?id=<id>&sz=w1000` (line 279).
  - PDF fileUrl: `https://drive.google.com/file/d/<id>/view` (line 923).
  - Frontend tüm `<img src="${f.file_url}">` doğrudan Drive thumbnail; rapor sonuç ekranı `window.open(driveSonuc.fileUrl)` doğrudan Drive view.
  - /fotoIndir endpoint zaten authenticated + ownership (P0-7). Yani **proxy altyapısı kısmen var.** `/raporIndir` benzeri yok — eklemek gerek.

- **Seçenekler:**

  - **A) Sadece backend hazırlığı (yarım çözüm — DEPLOY ETMEYİN):**
    Worker'da `permissions.create` iki yeri kaldır + `/fotoSign` & `/raporSign` endpoint'leri ekle. Frontend DOKUNULMAZ.
    - Sonuç: yeni yüklenen fotolar/PDFlar restricted; mevcut frontend img src thumbnail URL ile çekemez → **kırık img**, **kırık PDF link**.
    - Deploy edilirse production kırılır. Bu seçenek anlamsız — atlamalı.

  - **B) Backend + Frontend (önerim):**
    Worker: `permissions.create` iki yeri kaldır + `/fotoSign` & `/raporSign` endpoint'leri ekle (auth + ownership; P0-7 pattern'iyle).
    Frontend: tüm foto img src'leri ve rapor open akışı Worker proxy üzerinden.
    - **Eski (mevcut) Drive dosyaları:** Drive'da hâlâ `anyone reader` izinli; proxy üzerinden de çekilebilir, doğrudan public URL ile de çekilebilir. Ama frontend artık her zaman proxy kullanır → tek tip akış.
    - **Yeni Drive dosyaları:** restricted, sadece proxy üzerinden okunur.
    - Kapsam: cloudflare-worker.js (Worker) + detail.js + dashboard.js + lightbox.js + photo.js (form preview) + rapor.js (sonuç ekranı open) — **5+ frontend dosyası**.
    - Atomik bir commit'te bunların hepsi gitmeli (yarısı kaldı kalmalı değil).
    - Deploy: Worker önce, frontend hemen sonra (Pages Direct Upload). Race condition riski düşük (1-2 saniye).
    - Risk: img src proxy authenticated header gerektiriyor → `<img>` tag basit GET ile auth header eklenemez → token query param gerek (`?token=...`) veya `<img>` yerine `fetch + URL.createObjectURL` pattern'i. **Bu seçim de yapılmalı:**
      - **B1)** Token query param: `<img src="${DRIVE_URL}/fotoSign?fileId=X&token=${userJWT}">` — basit ama JWT URL'de loglanır.
      - **B2)** Fetch + blob URL: render anında her foto için `fetch + Bearer header + URL.createObjectURL`. Daha güvenli ama re-render'da memory leak riski (URL.revokeObjectURL gerekir).
      - **B3) (USER ÖNERİSİ — implementasyon notu):** HMAC short-lived token. Worker bir endpoint'te `{userJwt, fileId} → HMAC(secret, "fileId|exp")` döndürür; frontend bu token'ı `<img src=".../fotoSign?fileId=X&t=...">`'e koyar; Worker doğrular. Avantaj: img src basit GET çalışır (B1 kolaylığı), JWT URL'de görünmez (B1 dezavantajı yok), B2'nin blob URL revoke karmaşası yok. Maliyet: Worker'da bir extra endpoint + HMAC secret env var.

  - **C) B + tüm mevcut Drive dosyalarını sıkılaştırma migration'ı:**
    B + bir kerelik admin işlem: tüm `record_fotograflar.file_id` ve `santiye_raporlar.drive_file_id` setindeki Drive dosyalarına `permissions.delete` çağrısı (anyone reader iznini iptal).
    - Sonuç: tek tip durum — hepsi restricted, hepsi proxy.
    - Migration nasıl koşar: Worker'a tek seferlik admin endpoint (env var ile gate'li) veya Apps Script. Kapsam genişler.
    - Risk: migration yarıda kalırsa karışık state (yarısı public, yarısı restricted, frontend her hâlükârda proxy → public dosyalar da proxy üzerinden çalışır → fonksiyonel sorun olmaz, ama izin durumu karışık kalır).

  - **D) P1-7'yi P2'ye ertele:** ✓ SEÇİLEN
    Faz 1'de YAPMA. Audit'e errata yaz: "P1-7 kapsam büyüklüğü Faz 1'de tek commit'le risksizce yapılamayacak; P2'ye taşındı."
    - Risk: Drive enumeration vektörü mevcut public URL'lere açık kalır. /fotoIndir P0-7 ownership ile kapı koydu ama doğrudan thumbnail URL'i bilen herkes görür.
    - Faz 1 daraltılır, deploy daha küçük blast radius.

- **Önerim (orijinal): B (B2 alt-seçeneğiyle).** Frontend tarafı genişlemiş ama atomik bir commit. B2 (fetch + blob URL) güvenlik açısından B1'den iyi; revoke pattern doğru kurulursa memory leak yok. Eski public dosyalara dokunulmaz (C ayrı bir Faz 3 işi olabilir, ya da hiç yapılmaz — frontend zaten hep proxy ile çekiyorsa fonksiyonel etkisi yok).

  D de geçerli — Faz 1'i hızlı kapatıp Faz 2'ye geçmek istiyorsan kabul edilebilir. Ama o zaman audit'in P1-7 kapanmamış olur.

- **Bekleme noktası (kapatıldı):** Karar D — Faz 1 6/7 ile kapatıldı, P1-7 Faz 2 sonu adayı.

---
