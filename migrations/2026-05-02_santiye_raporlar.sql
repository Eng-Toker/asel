-- Migration: santiye_raporlar
-- Tarih: 2026-05-02
-- Amaç: Aşama bazlı AI teknik raporlar için audit-grade kayıt tablosu.
--       Her üretilen rapor için (Drive upload başarılı olduktan sonra)
--       frontend tarafından bir satır INSERT edilir.
--
-- Tasarım kararları:
--   - id: gen_random_uuid() (Supabase default uuid-ossp / pgcrypto)
--   - record_id ON DELETE SET NULL: Kayıt silinse de rapor izi kalır.
--   - ai_cevap_json: jsonb (text değil) — sonradan sorgulanabilir.
--   - hazirlayan_email: KULLANICI_ADLARI map'i değişse de audit bozulmasın.
--   - bolge: CLAUDE.md multi-tenant pattern; mevcut tablolarla uyumlu.
--   - RLS: select/insert authenticated; update/delete YOK → immutable
--          (santiye_log çizgisi).
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor → tek seferde çalıştır.
-- IDEMPOTENT DEĞİL: İki kere çalıştırma.

create table santiye_raporlar (
  id               uuid        primary key default gen_random_uuid(),
  record_id        uuid        references santiye_records(id) on delete set null,
  asama_no         int         not null,
  bolge            text,
  yorum            text        not null,
  ai_cevap_json    jsonb,
  foy_dosya_adi    text,
  drive_url        text        not null,
  drive_file_id    text        not null,
  hazirlayan       text        not null,
  hazirlayan_email text,
  created_at       timestamptz not null default now()
);

create index idx_raporlar_record       on santiye_raporlar (record_id, asama_no);
create index idx_raporlar_bolge_tarih  on santiye_raporlar (bolge, created_at desc);

alter table santiye_raporlar enable row level security;

create policy "raporlar_read"
  on santiye_raporlar
  for select
  to authenticated
  using (true);

create policy "raporlar_write"
  on santiye_raporlar
  for insert
  to authenticated
  with check (true);

-- update / delete policy bilerek tanımlanmadı → satırlar immutable.
