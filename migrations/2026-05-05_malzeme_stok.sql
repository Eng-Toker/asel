-- 2026-05-05 — Faz 4: Malzeme stok takip sistemi
--
-- Yeni feature: bölge-bazlı malzeme stok takip. Mevcut "kayıt formu içindeki
-- malzeme + metraj" akışından TAMAMEN AYRI; iki sistem birbirine karışmaz.
--
-- Eklenenler:
--   - malzemeler.birim     : varolan tabloya kolon (CHECK ile bilinen birimler)
--   - malzeme_stok          : malzeme × bölge bazında mevcut stok (1 satır)
--   - stok_hareket          : her giriş/çıkış logu (audit trail, immutable)
--
-- RLS pattern'i:
--   - SELECT  → anon, authenticated (misafir okuyabilsin, ekran boş olmasın)
--   - INSERT  → authenticated (misafir yazamaz)
--   - UPDATE  → authenticated (sadece malzeme_stok)
--   - DELETE  → yok (stok kalemi immutable mantığı)
--   - stok_hareket UPDATE/DELETE yok → audit trail immutable
--     (santiye_raporlar + B32 santiye_log immutable pattern'i)
--
-- Misafir guard 3 katman:
--   1) UI gating (display:none — view modüllerinde isMisafir() kontrolü)
--   2) Handler-level guard (if (isMisafir()) return)
--   3) RLS (bu dosya — INSERT/UPDATE authenticated only)
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor → tek seferde.
-- IDEMPOTENT: Evet (CREATE TABLE IF NOT EXISTS + DO bloğu policy temizliği).
-- BAĞIMLILIK: Yok (yeni tablolar; malzemeler'e sadece kolon ekleme).
-- B34: Tüm DDL tek transaction içinde — yarı uygulama imkansız.
-- Dry-run için: aşağıdaki commit; → rollback; çevir, çalıştır, geri al.

begin;

-- ── 1) malzemeler tablosuna birim kolonu ───────────────────────────────
alter table malzemeler add column if not exists birim text;

alter table malzemeler drop constraint if exists malzemeler_birim_check;
alter table malzemeler add constraint malzemeler_birim_check
  check (
    birim is null
    or birim in ('kg','lt','adet','kova','m','m2','m3','paket','rulo')
  );

-- ── 2) malzeme_stok: malzeme × bölge bazında mevcut stok ──────────────
create table if not exists malzeme_stok (
  id            uuid primary key default gen_random_uuid(),
  malzeme_id    uuid not null references malzemeler(id) on delete cascade,
  bolge         text not null,
  mevcut_stok   numeric not null default 0,
  updated_at    timestamptz not null default now(),
  unique (malzeme_id, bolge)
);
create index if not exists idx_malzeme_stok_bolge   on malzeme_stok (bolge);
create index if not exists idx_malzeme_stok_malzeme on malzeme_stok (malzeme_id);

-- ── 3) stok_hareket: audit trail (immutable, log gibi) ────────────────
create table if not exists stok_hareket (
  id            uuid primary key default gen_random_uuid(),
  malzeme_id    uuid not null references malzemeler(id) on delete restrict,
  bolge         text not null,
  tip           text not null check (tip in ('giris','cikis')),
  miktar        numeric not null check (miktar > 0),
  santiye       text,                     -- sadece tip=cikis için dolu
  aciklama      text,
  yapan         text not null,            -- _oturum.ad (santiye_log.duzenleyen pattern'i)
  created_at    timestamptz not null default now()
);
create index if not exists idx_stok_hareket_bolge_tarih
  on stok_hareket (bolge, created_at desc);
create index if not exists idx_stok_hareket_malzeme
  on stok_hareket (malzeme_id);
create index if not exists idx_stok_hareket_santiye
  on stok_hareket (santiye)
  where santiye is not null;

-- ── 4) RLS aktif ──────────────────────────────────────────────────────
alter table malzeme_stok enable row level security;
alter table stok_hareket enable row level security;

-- ── 5) Defansif policy temizliği (idempotent rerun) ───────────────────
do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename in ('malzeme_stok','stok_hareket')
  loop
    execute format('drop policy if exists %I on public.%I',
      r.policyname, r.tablename);
  end loop;
end $$;

-- ── 6) Canonical policy'ler ───────────────────────────────────────────
-- malzeme_stok: SELECT anon+authenticated, INSERT/UPDATE authenticated.
-- DELETE yok (stok satırı bir kere yaratılır, yalnızca değer güncellenir).
create policy "ms_select" on malzeme_stok
  for select to anon, authenticated using (true);
create policy "ms_insert" on malzeme_stok
  for insert to authenticated with check (true);
create policy "ms_update" on malzeme_stok
  for update to authenticated using (true);

-- stok_hareket: SELECT anon+authenticated, INSERT authenticated.
-- UPDATE/DELETE yok → audit trail immutable
-- (santiye_raporlar + B32 santiye_log immutable pattern'i).
create policy "sh_select" on stok_hareket
  for select to anon, authenticated using (true);
create policy "sh_insert" on stok_hareket
  for insert to authenticated with check (true);

-- ── 7) Realtime publication ──────────────────────────────────────────
-- Başka cihazda yapılan stok değişikliği anlık görünsün.
-- ALTER PUBLICATION transactional (Postgres 14+).
alter publication supabase_realtime add table malzeme_stok;
alter publication supabase_realtime add table stok_hareket;

commit;

-- ── Doğrulama sorguları ──────────────────────────────────────────────
-- 1) Tabloların var olduğunu teyit
-- select tablename from pg_tables
--   where schemaname='public'
--     and tablename in ('malzeme_stok','stok_hareket');
-- Beklenen: 2 satır

-- 2) Policy listesi (5 satır beklenir: ms_* 3 + sh_* 2)
-- select tablename, policyname, cmd, roles
--   from pg_policies
--   where schemaname='public' and tablename in ('malzeme_stok','stok_hareket')
--   order by tablename, policyname;
-- Beklenen:
--   malzeme_stok | ms_insert | INSERT | {authenticated}
--   malzeme_stok | ms_select | SELECT | {anon,authenticated}
--   malzeme_stok | ms_update | UPDATE | {authenticated}
--   stok_hareket | sh_insert | INSERT | {authenticated}
--   stok_hareket | sh_select | SELECT | {anon,authenticated}

-- 3) public/anon write'ı kalmamış olmalı
-- select tablename, policyname, cmd, roles
--   from pg_policies
--   where schemaname='public'
--     and tablename in ('malzeme_stok','stok_hareket')
--     and cmd in ('INSERT','UPDATE','DELETE')
--     and ('anon'=any(roles) or 'public'=any(roles));
-- Beklenen: 0 satır

-- 4) malzemeler.birim kolonu eklenmiş mi
-- select column_name, data_type from information_schema.columns
--   where table_name='malzemeler' and column_name='birim';
-- Beklenen: 1 satır (birim, text)

-- 5) Realtime publication'a eklendi mi
-- select tablename from pg_publication_tables
--   where pubname='supabase_realtime'
--     and tablename in ('malzeme_stok','stok_hareket');
-- Beklenen: 2 satır

-- 6) Davranış testi (admin oturumda):
--   insert into malzeme_stok(malzeme_id, bolge, mevcut_stok)
--     values ('<gerçek malzeme uuid>', 'İskele', 50);
--   insert into stok_hareket(malzeme_id, bolge, tip, miktar, yapan)
--     values ('<aynı uuid>', 'İskele', 'giris', 50, 'Test');
-- Sonra anon role ile (frontend misafir):
--   - SELECT'ler dönmeli, INSERT'ler reject edilmeli.
-- Test sonrası: delete from stok_hareket where yapan='Test';
--               delete from malzeme_stok where bolge='İskele' and ...;
