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
