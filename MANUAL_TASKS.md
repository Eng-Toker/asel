# MANUAL_TASKS.md

> Sıralı liste. Yukarıdan aşağı yapılmadan bir sonrakine geçilmez.
> Status: [ ] = bekliyor, [x] = tamamlandı (tarih ekle)

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
  2. `migrations/2026-05-04_p1_santiye_raporlar_rls.sql` içeriğini tek seferde çalıştır
  3. Çıktıda hata olmadığını doğrula
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

## [USER_DECISION_NEEDED] — P1-7 Drive restricted scope ve eski URL migration politikası

**[KARAR: D — ertelendi (2026-05-04). Faz 2 sonu yeniden değerlendirilecek. B3 (HMAC short-lived token) implementation pattern'i not olarak kalsın.]**

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
