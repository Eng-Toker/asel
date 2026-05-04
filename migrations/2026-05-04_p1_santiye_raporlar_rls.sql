-- 2026-05-04 — Faz 1 P1-6 (B4): santiye_raporlar RLS sıkılaştır
-- Audit: AUDIT_FINAL.md §4 #6
-- Karar: USER_DECISION 2026-05-04 → Seçenek A (sıkı sahiplik)
--
-- Önceki durum (migrations/2026-05-02_santiye_raporlar.sql:38-49):
--   raporlar_read   → for select to authenticated using (true)
--   raporlar_write  → for insert to authenticated with check (true)
--   update / delete → policy YOK (immutable)
--
-- Yeni:
--   rap_select → using (hazirlayan_email = auth.jwt() ->> 'email')
--   rap_insert → with check (hazirlayan_email = auth.jwt() ->> 'email')
--   update / delete → policy YOK (immutable korunur)
--
-- Frontend zaten oturum.email yazıyor (js/modals/rapor.js:687), kullanıcı
-- sadece kendi email'iyle INSERT yapabilir ve sadece kendi raporlarını okur.
-- Future "rapor geçmişi" view'ı multi-admin görünürlüğü gerektirirse,
-- AUDIT_FINAL §11.2 user_bolgeleri pattern'iyle policy genişletilir.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor.
-- IDEMPOTENT: Evet (drop if exists + create).

-- ── ATOMİK GEÇİŞ: tüm DDL tek transaction içinde (NIT B1) ──────────────
-- PostgreSQL DDL transactional → BEGIN/COMMIT bloku içinde herhangi bir
-- adım fail olursa otomatik rollback (yarı-uygulanmış state imkansız).
-- Dry-run için: aşağıdaki COMMIT'i ROLLBACK ile değiştir, çalıştır,
-- sözdizimi/conflict tespit et, sonra geri çevir.
begin;

-- ── Eski policy'leri drop (bilinen ad varyantları) ─────────────────────
drop policy if exists "raporlar_read"   on santiye_raporlar;
drop policy if exists "raporlar_write"  on santiye_raporlar;
drop policy if exists "rap_select"      on santiye_raporlar;
drop policy if exists "rap_insert"      on santiye_raporlar;
drop policy if exists "Raporlar Read"   on santiye_raporlar;
drop policy if exists "Raporlar Write"  on santiye_raporlar;
drop policy if exists "santiye_raporlar_select" on santiye_raporlar;
drop policy if exists "santiye_raporlar_insert" on santiye_raporlar;

-- ── Defansif: santiye_raporlar üzerinde kalan TÜM policy'leri drop et
--    (bilinmeyen ad ya da legacy prod state için — P1-12 pattern'i)
do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'santiye_raporlar'
  loop
    execute format('drop policy if exists %I on santiye_raporlar', r.policyname);
  end loop;
end $$;

-- ── Yeni canonical policy'ler ──────────────────────────────────────────
create policy "rap_select" on santiye_raporlar
  for select to authenticated
  using (hazirlayan_email = (auth.jwt() ->> 'email'));

create policy "rap_insert" on santiye_raporlar
  for insert to authenticated
  with check (hazirlayan_email = (auth.jwt() ->> 'email'));

-- update / delete bilerek tanımlanmadı → satırlar immutable.

commit;

-- ── Doğrulama sorguları ────────────────────────────────────────────────
-- 1) Policy listesi (rap_select + rap_insert beklenir, başka yok)
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname='public' and tablename='santiye_raporlar'
-- order by policyname;

-- 2) Anon/public role kalmadı mı (zero satır)
-- select policyname, cmd, roles
-- from pg_policies
-- where schemaname='public' and tablename='santiye_raporlar'
--   and ('anon'=any(roles) or 'public'=any(roles));

-- 3) Davranış testi (kendi oturumunda):
--    insert into santiye_raporlar (...) → ✓ kendi email'in
--    insert into santiye_raporlar (..., hazirlayan_email='baska@x.com') → reddedilir
--    select * from santiye_raporlar → sadece kendi satırların
