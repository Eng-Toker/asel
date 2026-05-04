-- 2026-05-04 — Faz 3 errata: malzemeler tek canonical SELECT policy
-- Audit: M1 doğrulama bulgusu (Faz 1 sonu, 2026-05-04)
-- Karar: 2026-05-04 — kod analizi (USER_DECISION değil)
--
-- Gerekçe (kanıt):
--   1. malzemeler tablosu lookup tablosu: id, name, sort_order, active,
--      created_at. Hassas data YOK.
--   2. Frontend (js/data.js:15) anon olarak çekiyor:
--        dbGet("malzemeler", "select=name&active=eq.true&order=sort_order,name")
--      Misafir + admin her ikisi için açık olmalı (UI dropdown).
--   3. Mevcut state: 3 SELECT policy ("okuma", "misafir_okuma",
--      "read malzemeler"), hepsi qual=true → davranış aynı,
--      yalnızca sayım fazlalığı.
--
-- Etki: Davranış değişmez (using=true / anon+authenticated). Sadece çift
-- policy temizliği — pg_policies sayımı M1 doğrulama sorgusu (2) için
-- temiz çıkar.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor.
-- IDEMPOTENT: Evet (drop if exists + DO bloğu defansif tarama).
-- BLOKE EDEN: M1, M2, M3 (DB tarafı sıralı; secret/Worker'dan bağımsız).

-- ── Bilinen ad varyantlarını drop et ───────────────────────────────────
drop policy if exists "okuma"            on malzemeler;
drop policy if exists "misafir_okuma"    on malzemeler;
drop policy if exists "read malzemeler"  on malzemeler;
drop policy if exists "Misafir okuma"    on malzemeler;
drop policy if exists "MISAFIR_OKUMA"    on malzemeler;
drop policy if exists "malzemeler_select" on malzemeler;

-- ── Defansif: malzemeler üzerinde kalan tüm SELECT policy'leri drop et
do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'malzemeler'
      and cmd        = 'SELECT'
  loop
    execute format('drop policy if exists %I on malzemeler', r.policyname);
  end loop;
end $$;

-- ── Tek canonical SELECT policy: anon + authenticated, açık ────────────
create policy "malzemeler_select" on malzemeler
  for select to anon, authenticated
  using (true);

-- ── Doğrulama sorguları ────────────────────────────────────────────────
-- 1) malzemeler'de yalnızca tek SELECT policy kalmalı
-- select policyname, cmd, roles, qual
-- from pg_policies
-- where schemaname='public' and tablename='malzemeler'
-- order by policyname;
-- Beklenen: tek satır, malzemeler_select / SELECT / {anon,authenticated} / true

-- 2) Davranış teyit (frontend anon select hâlâ çalışıyor mu)
-- select count(*) from malzemeler where active = true;
-- Beklenen: > 0 (lookup verisi)
