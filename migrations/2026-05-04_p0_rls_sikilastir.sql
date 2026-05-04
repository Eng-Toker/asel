-- 2026-05-04 — Faz 1 deploy P0 RLS sıkılaştırma
-- Audit: AUDIT_FINAL.md P0-1, P0-2, P0-3, P0-4
-- Çalıştırma: Supabase Dashboard → SQL Editor → tek seferde çalıştır
-- Etki: anonim/misafir tüm yazma yetkisi kapanır; authenticated user'a sıkı erişim.

-- ── P0-1: record_fotograflar (KRİTİK B1) ──────────────────────────────────
drop policy if exists "okuma"         on record_fotograflar;
drop policy if exists "misafir_okuma" on record_fotograflar;
drop policy if exists "yazma"         on record_fotograflar;
drop policy if exists "rf_select"     on record_fotograflar;
drop policy if exists "rf_insert"     on record_fotograflar;
drop policy if exists "rf_delete"     on record_fotograflar;

create policy "rf_select" on record_fotograflar for select to authenticated using (true);
create policy "rf_insert" on record_fotograflar for insert to authenticated with check (true);
create policy "rf_delete" on record_fotograflar for delete to authenticated using (true);

-- ── P0-2: santiye_records (KRİTİK B2) ─────────────────────────────────────
drop policy if exists "okuma"     on santiye_records;
drop policy if exists "yazma"     on santiye_records;
drop policy if exists "sr_select" on santiye_records;
drop policy if exists "sr_insert" on santiye_records;
drop policy if exists "sr_update" on santiye_records;
drop policy if exists "sr_delete" on santiye_records;

create policy "sr_select" on santiye_records for select to authenticated using (true);
create policy "sr_insert" on santiye_records for insert to authenticated with check (true);
create policy "sr_update" on santiye_records for update to authenticated using (true);
create policy "sr_delete" on santiye_records for delete to authenticated using (true);

-- ── P0-3: personeller — KVKK kapı (KRİTİK B3) ─────────────────────────────
drop policy if exists "okuma"    on personeller;
drop policy if exists "p_select" on personeller;

create policy "p_select" on personeller for select to authenticated using (true);

-- ── P0-4: Storage bucket public DELETE/INSERT kapı (KRİTİK B5) ────────────
-- Bucket: santiye-fotolar (config.js BKT)
-- Not: Storage policy'leri storage.objects tablosunda; bucket_id ile filter.
drop policy if exists "Public read"   on storage.objects;
drop policy if exists "Public insert" on storage.objects;
drop policy if exists "Public delete" on storage.objects;
drop policy if exists "santiye_fotolar_select" on storage.objects;
drop policy if exists "santiye_fotolar_insert" on storage.objects;
drop policy if exists "santiye_fotolar_delete" on storage.objects;

create policy "santiye_fotolar_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'santiye-fotolar');

create policy "santiye_fotolar_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'santiye-fotolar');

create policy "santiye_fotolar_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'santiye-fotolar');

-- ── Doğrulama sorguları ───────────────────────────────────────────────────
-- 1) Anon role'e açık politika kalmadı mı (sıfır satır olmalı)
-- select tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public'
--   and ('anon' = any(roles) or 'public' = any(roles));

-- 2) Storage public politika kalmadı mı
-- select policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'storage'
--   and ('anon' = any(roles) or 'public' = any(roles));
