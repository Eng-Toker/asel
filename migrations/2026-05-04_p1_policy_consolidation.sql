-- 2026-05-04 — Faz 1 P1-12: çift policy konsolidasyonu
-- Audit: AUDIT_FINAL.md §2.3, §4 #12
--
-- Amaç: P0 migration'da kapsanmayan tablolarda muhtemel redundant
--       policy'leri temizle; her (tablo, cmd) için tek canonical policy bırak.
--       record_fotograflar / santiye_records / personeller P0 migration'da
--       zaten konsolide edildi.
--       santiye_raporlar ADIM 2 (P1-6) için ayrılmıştır — bu migration'da
--       bilerek atlanmıştır.
--
-- Yaklaşım: DO bloku ile hedef tablolardaki TÜM mevcut policy'leri (ad bilinsin
-- bilinmesin) drop et, sonra canonical per-cmd policy'leri oluştur.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor → tek seferde.
-- IDEMPOTENT: Evet (DO bloku mevcut policy adlarını dinamik bulur).
-- B34: Tüm DDL tek transaction içinde — yarı uygulama imkansız.
-- Dry-run için: aşağıdaki commit; → rollback; çevir, çalıştır, sonra geri al.

begin;

-- ── 1) Tüm mevcut policy'leri dynamic drop ─────────────────────────────
do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'santiyeler',
        'santiye_notlar',
        'record_asamalar',
        'santiye_log'
      )
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── 2) Canonical per-cmd policy'leri oluştur ───────────────────────────

-- santiyeler — admin CRUD; bölge filtresi client tarafında (app.bolge)
create policy "s_select" on santiyeler for select to authenticated using (true);
create policy "s_insert" on santiyeler for insert to authenticated with check (true);
create policy "s_update" on santiyeler for update to authenticated using (true);
create policy "s_delete" on santiyeler for delete to authenticated using (true);

-- santiye_notlar — admin CRUD
create policy "n_select" on santiye_notlar for select to authenticated using (true);
create policy "n_insert" on santiye_notlar for insert to authenticated with check (true);
create policy "n_update" on santiye_notlar for update to authenticated using (true);
create policy "n_delete" on santiye_notlar for delete to authenticated using (true);

-- record_asamalar — record altı, sbKaydet delete-then-insert pattern kullanır
create policy "ra_select" on record_asamalar for select to authenticated using (true);
create policy "ra_insert" on record_asamalar for insert to authenticated with check (true);
create policy "ra_update" on record_asamalar for update to authenticated using (true);
create policy "ra_delete" on record_asamalar for delete to authenticated using (true);

-- santiye_log — audit log; mevcut davranışı koru (4 op açık)
-- Not: P2'de immutable yapılması önerilir (AUDIT_FINAL §11.7).
create policy "l_select" on santiye_log for select to authenticated using (true);
create policy "l_insert" on santiye_log for insert to authenticated with check (true);
create policy "l_update" on santiye_log for update to authenticated using (true);
create policy "l_delete" on santiye_log for delete to authenticated using (true);
-- NOT: l_update + l_delete B32 ile drop ediliyor (immutable). Bu migration'dan
--      sonra B32 migration'ı çalıştır.

commit;

-- ── 3) Doğrulama sorguları ─────────────────────────────────────────────
-- Aşağıdakileri ayrı çalıştır, her biri ZERO satır dönmeli.

-- 3.1) Anon/public role'e açık politika kalmadı mı (sıfır satır olmalı)
-- select tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public'
--   and ('anon' = any(roles) or 'public' = any(roles));

-- 3.2) Çift policy taraması — her (tablo, cmd) için count > 1 sıfır olmalı
-- select tablename, cmd, count(*) c, array_agg(policyname) policies
-- from pg_policies
-- where schemaname = 'public'
-- group by tablename, cmd
-- having count(*) > 1;

-- 3.3) Bu migration'ın hedef tabloları için canonical policy sayısı
-- santiyeler/notlar/asamalar/log her biri 4 policy, ra/n/s_ prefix'li olmalı
-- select tablename, count(*) c
-- from pg_policies
-- where schemaname='public'
--   and tablename in ('santiyeler','santiye_notlar','record_asamalar','santiye_log')
-- group by tablename
-- order by tablename;
-- Beklenen: 4 / 4 / 4 / 4
