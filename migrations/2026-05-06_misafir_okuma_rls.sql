-- 2026-05-06: Misafir (anon) için SELECT izni
--
-- Sorun: Misafir login'de _oturum.token = null. Supabase'e anon JWT ile
-- request atılıyor; tablolar "authenticated only" RLS olduğu için tüm
-- query'ler boş dönüyor → UI tamamen boş.
--
-- Çözüm: Read-only veri tabloları için anon'a SELECT ver. INSERT/UPDATE/
-- DELETE policy'leri DOKUNULMAZ (authenticated only kalır).
--
-- Hariç tutulan: personeller (KVKK — anon görmemeli),
--                santiye_raporlar (admin-only kalır)
--
-- Idempotent: DROP POLICY IF EXISTS ile tekrar çalıştırılabilir.

BEGIN;

-- Şantiyeler
DROP POLICY IF EXISTS "anon_select_santiyeler" ON public.santiyeler;
CREATE POLICY "anon_select_santiyeler"
  ON public.santiyeler FOR SELECT TO anon USING (true);

-- Şantiye notları
DROP POLICY IF EXISTS "anon_select_santiye_notlar" ON public.santiye_notlar;
CREATE POLICY "anon_select_santiye_notlar"
  ON public.santiye_notlar FOR SELECT TO anon USING (true);

-- Kayıtlar
DROP POLICY IF EXISTS "anon_select_santiye_records" ON public.santiye_records;
CREATE POLICY "anon_select_santiye_records"
  ON public.santiye_records FOR SELECT TO anon USING (true);

-- Aşamalar
DROP POLICY IF EXISTS "anon_select_record_asamalar" ON public.record_asamalar;
CREATE POLICY "anon_select_record_asamalar"
  ON public.record_asamalar FOR SELECT TO anon USING (true);

-- Fotoğraflar (sadece metadata, dosya değil)
DROP POLICY IF EXISTS "anon_select_record_fotograflar" ON public.record_fotograflar;
CREATE POLICY "anon_select_record_fotograflar"
  ON public.record_fotograflar FOR SELECT TO anon USING (true);

-- Aktivite log
DROP POLICY IF EXISTS "anon_select_santiye_log" ON public.santiye_log;
CREATE POLICY "anon_select_santiye_log"
  ON public.santiye_log FOR SELECT TO anon USING (true);

-- Malzeme tablosu (yeni stok feature)
DROP POLICY IF EXISTS "anon_select_malzemeler" ON public.malzemeler;
CREATE POLICY "anon_select_malzemeler"
  ON public.malzemeler FOR SELECT TO anon USING (true);

-- Malzeme stok (depo)
DROP POLICY IF EXISTS "anon_select_malzeme_stok" ON public.malzeme_stok;
CREATE POLICY "anon_select_malzeme_stok"
  ON public.malzeme_stok FOR SELECT TO anon USING (true);

-- Stok hareket geçmişi
DROP POLICY IF EXISTS "anon_select_stok_hareket" ON public.stok_hareket;
CREATE POLICY "anon_select_stok_hareket"
  ON public.stok_hareket FOR SELECT TO anon USING (true);

-- HARİÇ TUTULDU:
-- - personeller: KVKK (kişisel veri); misafir personel listesini görmesin.
-- - santiye_raporlar: admin-only; misafir AI raporlarını görmesin.

COMMIT;

-- DOĞRULAMA: misafir login → bölge seç → şantiye listesi dolmalı.
-- Eğer hâlâ boş gelirse Supabase Dashboard → Authentication → Policies'te
-- her tablonun "Enable RLS" açık ve yeni policy'lerin listede olduğunu kontrol et.
