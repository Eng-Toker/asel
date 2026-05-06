-- 2026-05-05 — record_fotograflar.asama_no CHECK constraint 3 → 8 genişletme
--
-- Bug raporu (telefonda saha kullanımı, 2026-05-05):
--   Yeni Uygulama Alanı formunda 4 aşama seçilip stage 4'e foto eklenip
--   kaydedilince:
--     "new row for relation 'record_fotograflar' violates check constraint
--      'record_fotograflar_asama_no_check'"
--   Stage 1-3 sorunsuz, stage 4+ fail.
--
-- Önceki state:
--   record_fotograflar.asama_no üzerinde CHECK constraint
--   (asama_no BETWEEN 1 AND 3) — eski 3-aşamalı şemadan kalma.
--   js/data.js:71-75'teki asama1/2/3_* kolon fallback'i bu legacy şemayı
--   kanıtlıyor. record_asamalar tablosu ve frontend 8 aşamaya çıkarken
--   foto constraint'i geride kalmış.
--
-- Yeni state:
--   asama_no BETWEEN 1 AND 8.
--   App tarafı zaten Math.min(8, ...) ile clamp ediyor
--   (js/modals/record.js:23, asamaEsitle); 8 üst sınır UI ile hizalı.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor → tek seferde.
-- IDEMPOTENT: Evet (drop if exists + add).
-- BAĞIMLILIK: Yok.

begin;

alter table record_fotograflar
  drop constraint if exists record_fotograflar_asama_no_check;

alter table record_fotograflar
  add constraint record_fotograflar_asama_no_check
    check (asama_no between 1 and 8);

commit;

-- ── Doğrulama sorguları ────────────────────────────────────────────────
-- 1) Constraint tanımı 1-8 aralığını göstermeli:
-- select pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname = 'record_fotograflar_asama_no_check';
-- Beklenen: CHECK ((asama_no >= 1) AND (asama_no <= 8))
--
-- 2) Davranış testi (kendi oturumunda, geçici kayıt üzerinde):
-- insert into record_fotograflar(record_id, asama_no, file_url)
--   values ('<mevcut_record_uuid>', 8, 'https://test'); → kabul
-- insert into record_fotograflar(record_id, asama_no, file_url)
--   values ('<mevcut_record_uuid>', 9, 'https://test'); → reddedilir
-- (Test sonrası test satırlarını silmeyi unutma.)
