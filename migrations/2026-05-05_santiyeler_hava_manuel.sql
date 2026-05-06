-- 2026-05-05 — santiyeler tablosuna manuel hava notu kolonu
--
-- Kullanıcı talebi: API'dan gelen hava durumu (parçalı bulutlu vs.)
-- bazen gerçeği yansıtmıyor (örn: API parçalı bulutlu der ama yağmur yağar).
-- Şantiye chip'i tıklanınca açılan tooltip'in altına "Manuel" alanı geliyor;
-- admin oraya serbest metin yazabilsin (örn: "Yağmur yağdı"), tüm ekip görsün.
-- Otomatik veriyi EZMEZ — yanına ek bilgi olarak gözükür.
--
-- Kolonlar:
--   hava_manuel_not text          — kullanıcının yazdığı serbest metin
--   hava_manuel_son timestamptz   — yazıldığı/güncellendiği an (UI'da relatif gösterim)
--
-- Not: santiye_log tablosuna YAZILMAZ. Bu sadece santiyeler row'undaki
-- ek bir alan; "kim ne yazmış" log'u tutulmaz (kullanıcı istemedi).
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor.
-- IDEMPOTENT: Evet (add column if not exists).
-- RLS: santiyeler tablosunun mevcut UPDATE policy'si bu kolonları da kapsar
--      (kolon-bazlı kısıt yok). Misafir hâlâ PATCH edemez.

begin;

alter table santiyeler
  add column if not exists hava_manuel_not text,
  add column if not exists hava_manuel_son timestamptz;

commit;

-- Doğrulama:
-- select column_name, data_type
-- from information_schema.columns
-- where table_name='santiyeler'
--   and column_name in ('hava_manuel_not','hava_manuel_son');
-- Beklenen: 2 satır.
