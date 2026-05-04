-- 2026-05-04 — B32: santiye_log immutable (UPDATE+DELETE policy drop)
-- Audit: AUDIT_REVIEW.md §2.3 B32, §3.2
--
-- Önceki state (migrations/2026-05-04_p1_policy_consolidation.sql:60-61):
--   l_update → for update to authenticated using (true)
--   l_delete → for delete to authenticated using (true)
-- → Admin log satırlarını silebilir/değiştirebilir → audit trail mutable.
--
-- Yeni state:
--   l_select + l_insert korunur (yazma + okuma açık)
--   l_update + l_delete YOK → satırlar immutable
--   santiye_raporlar pattern'iyle hizalı.
--
-- Compliance/iç denetim için audit trail integrity zorunlu.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor → tek seferde.
-- IDEMPOTENT: Evet (drop if exists).
-- BAĞIMLILIK: M1 (p1_policy_consolidation) çalıştırılmış olmalı (l_update/
--             l_delete'i o yarattı).

begin;

drop policy if exists "l_update" on santiye_log;
drop policy if exists "l_delete" on santiye_log;

commit;

-- ── Doğrulama sorguları ────────────────────────────────────────────────
-- 1) santiye_log'da update ve delete policy YOK olmalı
-- select policyname, cmd, roles
-- from pg_policies
-- where schemaname='public' and tablename='santiye_log'
-- order by policyname;
-- Beklenen: yalnızca l_select (SELECT) ve l_insert (INSERT)

-- 2) Davranış testi (kendi oturumunda):
-- update santiye_log set durum='X' where id=...; → policy yok → reddedilir
-- delete from santiye_log where id=...; → policy yok → reddedilir
