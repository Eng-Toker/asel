# MANUAL_TASKS.md

> Sıralı liste. Yukarıdan aşağı yapılmadan bir sonrakine geçilmez.
> Status: [ ] = bekliyor, [x] = tamamlandı (tarih ekle)

---

## M1 — P1-12 policy consolidation migration deploy
- **Tip:** SQL (Supabase Dashboard)
- **Önkoşul:** ilk task
- **Bloke ettiği:** P1-12 audit kapanışı, FAZ 1 doğrulama
- **Aksiyon:**
  1. Supabase Dashboard → SQL Editor aç
  2. `migrations/2026-05-04_p1_policy_consolidation.sql` içeriğini tek seferde çalıştır
  3. Çıktıda hata olmadığını doğrula
- **Doğrulama:** Aşağıdaki üç sorguyu ayrı ayrı çalıştır:
```sql
-- 1) Anon/public role açık policy (ZERO satır olmalı)
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and ('anon' = any(roles) or 'public' = any(roles));

-- 2) Çift policy taraması (ZERO satır olmalı)
select tablename, cmd, count(*) c, array_agg(policyname) policies
from pg_policies
where schemaname = 'public'
group by tablename, cmd
having count(*) > 1;

-- 3) Hedef tablolarda policy sayımı (her biri 4 olmalı)
select tablename, count(*) c
from pg_policies
where schemaname='public'
  and tablename in ('santiyeler','santiye_notlar','record_asamalar','santiye_log')
group by tablename
order by tablename;
```
- **Beklenen sonuç:** 1 ve 2 sıfır satır; 3 her tablo için 4.
- **Rollback:** Bu migration drop+create. Geri alınmak istenirse:
  - Önceki policy adlarını bilmek lazım (audit'teki `okuma` / `yazma` / `misafir_okuma` muhtemel adlar). El ile recreate gerekir; otomatik rollback YOK.
  - Pratikte: `do $$ … drop policy …` bloğu tekrar çalıştırılabilir, sonra eski snapshot'a göre eski adlarla create edilebilir.
- **Status:** [ ]

---

## [USER_DECISION_NEEDED] — P1-6 santiye_raporlar SELECT politikası
- **Bağlam:** ADIM 2 (P1-6) için RLS yazıyorum. INSERT sıkılaştırması net:
  `with check (hazirlayan_email = auth.jwt() ->> 'email')` — frontend zaten
  `oturum.email`'i yazıyor (`js/modals/rapor.js:687`), kullanıcı sadece kendi
  email'iyle yazabilir.
  Ama SELECT politikasında iki eşit-makul yaklaşım var. Codebase'de **şu an
  santiye_raporlar SELECT eden view YOK** (sadece INSERT var rapor.js:677'de).
  Yani etkin sonuç şu an sıfır — ama policy seçimi gelecek (rapor geçmişi view'ı
  eklendiğinde) UX'i belirler.

- **Seçenekler:**
  - **A) Sıkı sahiplik:** `using (hazirlayan_email = auth.jwt() ->> 'email')`
    - Sonuç: her admin sadece kendi ürettiği raporları görür.
    - Risk: future "rapor geçmişi" view eklenirse, admin B admin A'nın aynı
      şantiye için ürettiği raporu göremez. Multi-admin proje paylaşımı
      kapanır. Yeniden açmak için P2 `user_bolgeleri` tablosu (AUDIT §11.2)
      gerekir.
    - Uyum: audit'in "sahiplik kısıtlı" tavsiyesiyle %100 uyumlu.
  - **B) Authenticated tümü:** `using (true)` (mevcut, sadece scope authenticated)
    - Sonuç: her admin tüm raporları görebilir.
    - Risk: PII admin grubu içinde geniş paylaşımlı. Multi-tenant olursa
      bölgeler arası sızıntı.
    - Uyum: audit'in "sahiplik" tavsiyesini SELECT için uygulamaz; sadece INSERT
      sıkılaştırılır.
  - **C) Hibrit (gelecek):** Supabase JWT'ye custom `bolge` claim ekle (Auth
    Hook), `using (bolge = auth.jwt() ->> 'bolge')`.
    - Risk: kapsam genişler — Supabase Auth Hook setup, kullanıcı→bölge
      atamasının nereden geldiği kararı (DB'de yeni `user_bolgeleri` tablosu
      gerekir). Bu Faz 1 değil; P2/Faz 3 işi.

- **Önerim:** **A (sıkı sahiplik).** Şu an SELECT view yok, etki sıfır;
  audit önerisiyle %100 hizalı; gelecekte view eklenirse o noktada (yine bir
  policy migration'ı ile) genişletilebilir. B'yi seçmek için somut bir
  iş ihtiyacı (multi-admin rapor paylaşımı) bilmem gerek.

- **Bekleme noktası:** Commit 7b5b8d2 (P1-12 tamam). `migrations/2026-05-04_p1_santiye_raporlar_rls.sql`
  dosyası HENÜZ YAZILMADI — kararını alınca tek migration'la INSERT+SELECT
  birlikte yazılacak.

---
