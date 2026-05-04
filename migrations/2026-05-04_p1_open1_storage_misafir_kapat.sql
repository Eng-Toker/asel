-- 2026-05-04 — Faz 1 OPEN-1: misafir_foto_okuma storage policy kapı
-- Audit: HANDOFF.md "Açık riskler #1"
-- Karar: 2026-05-04 → Kapı kapat (kod analizi)
--
-- Gerekçe (kod kanıtları):
--   1. Storage'a upload kodu YOK: ${SB}/storage/v1/object/${BKT} sadece
--      js/db.js:37'de DELETE için. Yeni hiçbir foto Storage'a yazılmıyor.
--   2. Yeni eklenen record_fotograflar satırları (record.js:82):
--      file_path: null, file_url: driveUrl. Storage path üretilmiyor.
--   3. Frontend foto görüntüleme (data.js:83, detail.js:120-127) doğrudan
--      file_url'i kullanıyor; tüm değerler Drive URL formatında (file_id
--      backfill regex'leri kanıt: ?id=, /file/d/, /d/).
--   4. P0 migration storage'da Public read/insert/delete drop etti ama
--      "misafir_foto_okuma" adlı anon SELECT policy spesifik olarak drop
--      edilmedi → hâlâ aktif olabilir.
--
-- Etki: Anon SELECT kapatılır. Bucket dead channel olduğu için UX kırılmaz.
-- Eğer Dashboard'dan bucket envanteri legacy dosya gösterirse, ayrıca
-- silinmeleri / Drive'a migrate edilmeleri P2 işi.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor.
-- IDEMPOTENT: Evet (drop if exists).
-- B34: Tüm DDL tek transaction içinde — yarı uygulama imkansız.
-- Dry-run için: aşağıdaki commit; → rollback; çevir, çalıştır, sonra geri al.

begin;

-- ── Bilinen anon SELECT policy adını drop et ───────────────────────────
drop policy if exists "misafir_foto_okuma"   on storage.objects;
drop policy if exists "Misafir foto okuma"   on storage.objects;
drop policy if exists "misafir foto okuma"   on storage.objects;
drop policy if exists "guest_photo_read"     on storage.objects;
drop policy if exists "anon_select"          on storage.objects;

-- ── Defansif: storage.objects üzerinde kalan tüm anon/public policy'leri
--    bulup drop et (ad bilinmeyen olası başka kalıntılar için)
do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and ('anon' = any(roles) or 'public' = any(roles))
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

commit;

-- ── Doğrulama sorguları ────────────────────────────────────────────────
-- 1) storage.objects'te anon/public policy kalmadı mı (zero satır olmalı)
-- select policyname, cmd, roles
-- from pg_policies
-- where schemaname='storage' and tablename='objects'
--   and ('anon'=any(roles) or 'public'=any(roles));

-- 2) Beklenen kalan policy'ler: santiye_fotolar_{select,insert,delete}
--    (P0 migration'dan, hepsi authenticated)
-- select policyname, cmd, roles
-- from pg_policies
-- where schemaname='storage' and tablename='objects'
-- order by policyname;

-- 3) Bucket envanter (opsiyonel — legacy dosya var mı tespit)
--    Eğer count > 0 ise, bu dosyalar artık misafire görünmeyecek.
--    Frontend onlara işaret eden file_url tutuyor mu kontrol et:
--      select count(*) from record_fotograflar
--      where file_url like '%storage/v1/object%';
--    Beklenen: 0 (kanıt: tüm file_url Drive formatında).
-- select count(*) from storage.objects where bucket_id = 'santiye-fotolar';
