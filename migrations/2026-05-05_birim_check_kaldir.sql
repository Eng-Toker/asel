-- 2026-05-05 — malzemeler.birim CHECK constraint'ini kaldır
--
-- Kullanıcı talebi: Stok Ekle modalında "manuel birim gir" seçeneği olsun.
-- "Torba", "Çuval", "Koli" gibi standart dışı birimler de kabul edilsin.
-- CHECK listesi sınırlı tuttuğu için PATCH malzemeler SET birim='Torba'
-- başarısız oluyor → 23514 violates check constraint.
--
-- Önceki state:
--   CHECK (birim is null OR birim in (
--     'kg','lt','adet','kova','m','m2','m3','paket','rulo'
--   ))
--
-- Yeni state:
--   Constraint yok. birim text serbest. Frontend default options sunar
--   ama manuel girişe açık.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor.
-- IDEMPOTENT: Evet (drop if exists).
-- BAĞIMLILIK: 2026-05-05_malzeme_stok.sql (constraint orada eklendi).

begin;

alter table malzemeler drop constraint if exists malzemeler_birim_check;

commit;

-- Doğrulama:
-- select pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname='malzemeler_birim_check';
-- Beklenen: 0 satır (constraint düşmüş)
