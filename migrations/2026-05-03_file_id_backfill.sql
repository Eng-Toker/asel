-- Migration: file_id backfill (opsiyonel)
-- Tarih: 2026-05-03
-- Amaç: Eski record_fotograflar satırlarında file_id null kalmış olabilir.
--       file_url'de Drive ID zaten gömülü; oradan parse edip doldurur.
--
-- BU MIGRATION'A İHTİYAÇ YOK eğer çalışıyor:
--   - Worker /fotoIndir endpoint'i fileUrl'den ID parse edebiliyor (KATMAN 1).
--   - Frontend hem file_id hem fileUrl gönderiyor.
-- Yine de DB'yi temiz tutmak için isteğe bağlı çalıştırılabilir.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor → çalıştır.
-- Idempotent: Birden fazla çalıştırılabilir (zaten dolu olanlara dokunmaz).
-- B34: Tüm UPDATE'ler tek transaction içinde — kısmi backfill imkansız.

begin;

-- 1) thumbnail formatı:  ...?id=XXX&sz=...   →  XXX
update record_fotograflar
set    file_id = substring(file_url from '[?&]id=([^&#]+)')
where  file_id is null
  and  file_url is not null
  and  file_url ~ '[?&]id=';

-- 2) /file/d/XXX/ formatı (varsa)
update record_fotograflar
set    file_id = substring(file_url from '/file/d/([^/?#]+)')
where  file_id is null
  and  file_url is not null
  and  file_url ~ '/file/d/';

-- 3) /d/XXX= formatı (lh3.googleusercontent.com/d/XXX=w1000)
update record_fotograflar
set    file_id = substring(file_url from '/d/([^/?#=]+)')
where  file_id is null
  and  file_url is not null
  and  file_url ~ '/d/';

commit;

-- Kontrol: kalan eksikler (sıfır olması beklenir)
-- select count(*) from record_fotograflar where file_id is null;
