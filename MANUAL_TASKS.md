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

## [USER_DECISION_NEEDED] — P1-7 Drive restricted scope ve eski URL migration politikası
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

  - **C) B + tüm mevcut Drive dosyalarını sıkılaştırma migration'ı:**
    B + bir kerelik admin işlem: tüm `record_fotograflar.file_id` ve `santiye_raporlar.drive_file_id` setindeki Drive dosyalarına `permissions.delete` çağrısı (anyone reader iznini iptal).
    - Sonuç: tek tip durum — hepsi restricted, hepsi proxy.
    - Migration nasıl koşar: Worker'a tek seferlik admin endpoint (env var ile gate'li) veya Apps Script. Kapsam genişler.
    - Risk: migration yarıda kalırsa karışık state (yarısı public, yarısı restricted, frontend her hâlükârda proxy → public dosyalar da proxy üzerinden çalışır → fonksiyonel sorun olmaz, ama izin durumu karışık kalır).

  - **D) P1-7'yi P2'ye ertele:**
    Faz 1'de YAPMA. Audit'e errata yaz: "P1-7 kapsam büyüklüğü Faz 1'de tek commit'le risksizce yapılamayacak; P2'ye taşındı."
    - Risk: Drive enumeration vektörü mevcut public URL'lere açık kalır. /fotoIndir P0-7 ownership ile kapı koydu ama doğrudan thumbnail URL'i bilen herkes görür.
    - Faz 1 daraltılır, deploy daha küçük blast radius.

- **Önerim: B (B2 alt-seçeneğiyle).** Frontend tarafı genişlemiş ama atomik bir commit. B2 (fetch + blob URL) güvenlik açısından B1'den iyi; revoke pattern doğru kurulursa memory leak yok. Eski public dosyalara dokunulmaz (C ayrı bir Faz 3 işi olabilir, ya da hiç yapılmaz — frontend zaten hep proxy ile çekiyorsa fonksiyonel etkisi yok).

  D de geçerli — Faz 1'i hızlı kapatıp Faz 2'ye geçmek istiyorsan kabul edilebilir. Ama o zaman audit'in P1-7 kapanmamış olur.

- **Bekleme noktası:** Commit 5d2dd58 (P1-2 tamam). cloudflare-worker.js'de `permissions.create` iki yer ve frontend img src'leri HENÜZ DEĞİŞMEDİ. Karar geldiğinde:
  - **B / B2** seçilirse: 1) Worker (permissions.create kaldır + 2 yeni endpoint), 2) frontend (5+ dosya, blob URL helper) iki ayrı commit; sonra MANUAL_TASKS.M5 (Worker bundled deploy) + M6 (Pages deploy).
  - **C** seçilirse: B'ye ek olarak Worker admin endpoint + MANUAL_TASKS migration task'ı.
  - **D** seçilirse: CHANGES_SUMMARY'ye "Ertelenen" kaydı, Faz 1 Worker bundled deploy task'ı sadece P1-3/P1-11/P1-2 için. ADIM 7 görevi atlanır.

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
