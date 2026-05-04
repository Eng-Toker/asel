# SESSION_CHECKPOINT.md

**Son güncelleme:** 2026-05-04
**Aktif faz:** **FAZ 2+3 + B1-B7 + AUDIT_REVIEW (sıfırdan tam audit) + 14 CFIX TAMAMLANDI**
**Aktif madde:** _yok — kullanıcı manuel deploy turuna hazır (M-1, M0, M1-M2.5-M3-...-M9)_

## AUDIT_REVIEW + Faz B/C/D fix turu (2026-05-04, ikinci audit)
- ✓ **Sıfırdan tam audit** (commit f2500c5) — 51 bulgu, 16 ÖNEMLİ + 35 NIT,
  4 USER_DECISION. Brief Section A-F tam coverage.
- ✓ S3 (B2) → A — login REDDET (commit c0f71c7)
- ✓ S4 (B14+B33) → "mail e göre isim belirleriz sonra" — mevcut raw email
  kabul + email→ad lookup P3 devir (commit 5a0777d doc-only)
- ✓ S6 (MIMARI.md) → C .gitignore (commit dae1d18)
- ✓ S1, S2 doğrulamaları kullanıcıdan beklenmekte (curl + Supabase SQL)

### CFIX commit'leri (14)
- ✓ CFIX-1 (commit 7e71636) — _redirects ile B38 mitigation
- ✓ CFIX-2 (commit dae1d18) — MIMARI.md .gitignore (S6)
- ✓ CFIX-3 (commit ddc8d7e) — B17 PBKDF2 iter upper-bound 1.5M
- ✓ CFIX-4 (commit 2641ccb) — B32 santiye_log immutable migration
- ✓ CFIX-5 (commit a4c2263) — B43 html2canvas + jspdf SRI hash
- ✓ CFIX-6 (commit a0013c1) — B42 PWA manifest icons kaldır
- ✓ CFIX-7 (commit 3c6afcc) — B34 5 migration BEGIN/COMMIT
- ✓ CFIX-8 (commit 3971ed9) — B47 smoke test 6 PBKDF2 timing assertion
- ✓ CFIX-9 (commit 02fadc9) — B1 storeDel HTTP error throw
- ✓ CFIX-10 (commit a4affd1) — B12 sbKaydet silent catch kaldır
- ✓ CFIX-11 (commit 7c30f81) — B10 PII mask helper paylaşılan modül
- ✓ CFIX-12 (commit 0e43dfa) — B18 /rapor rate limit binding
- ✓ CFIX-13 (commit c0f71c7) — B2 (S3=A) auth.js login REDDET
- ✓ CFIX-14 (commit 5a0777d) — B14 tradeoff doc AUDIT_FINAL §11.9
- ✓ MANUAL_TASKS güncel (commit 498bebf) — M2.5 + M9 RAPOR_RL

### Bekleyen kullanıcı doğrulamaları
- **S1 (B38 KOŞULLU BLOCKER):** `curl -I https://santiye-takipp.pages.dev/AUDIT_FINAL.md`
  - 200 → SIZINTI tespit, _redirects deploy zorunlu (CFIX-1 zaten kapsıyor)
  - 404 → İYİ, NIT'e düşer
- **S2 (B49):** `select count(*) from santiye_raporlar;` Supabase'de
  - 42P01 hatası → baseline migration (2026-05-02) eksik, M2'den önce çalıştır

## Deploy bloker'lar (2026-05-04, kullanıcı feedback)
- ✓ B1 (commit fc5681a) — M2 defansif DROP POLICY DO bloğu + dry-run talimatı
- ✓ B2 (commit 847f0a3) — auth.js _oturum atomic (race fix); mask.js H'dan token okur
- ✓ B3 (commit 8916644) — M0 pre-deploy check: legacy duzenleyen UX riski
- ✓ B4 (commit b42acda → REDO cd0d315) — Worker-native rate limit
  /misafirLogin (workers.dev'de WAF custom rule yok; wrangler.toml +
  binding + handler guard)
- ✓ B5 (commit b1231cb) — M6 PII_PEPPER rotation politikası + determinism test
- ✓ B6 (commit 76cbdc6) — M-1 default branch main rename pre-deploy task
- ✓ B7 (commit a76336c) — smoke.sh +3 case (RLS, CORS keskin, WS heartbeat)
- ✓ NIT'ler (commit 304b4d1) — B1 BEGIN/COMMIT, B3 3-tablo genişlet,
  B6 Pages adımı sil, B7 Test 8 sıkı + Test 10 ws precheck
- ✓ B4-NIT (commit ca7a31a) — Worker rate limit hijyeni:
  CF-Connecting-IP yoksa 400 (randomUUID önerisi REDDEDİLDİ — rate
  limit'i kırardı), console.warn JSON log, RETRY_AFTER const.
  M9 doğrulamaya UYARI + RUN_RL_TEST=1 opsiyonel flag pattern.

## Faz 3'te tamamlanan
- ✓ ADIM 9  / P2-1  (commit 353b534) — .gitignore + .cfignore + repo docs track
- ✓ ADIM 10 / P1-13 (commit bbe70d0) — .gitattributes line ending normalization
- ✓ ADIM 11 / errata (commit de4f471) — malzemeler policy consolidation SQL
- ✓ ADIM 12 / OPEN-2..6 (commit d4267a4) — AUDIT_FINAL §4.1 kapanış statüsü + MODULES Faz 2/3 changelog
- ✓ ADIM 13 (commit 641dc2a) — scripts/smoke.sh production smoke test
- ✓ ADIM 14 (commit BEKLENİYOR) — final pass + bu güncelleme

## Faz 2'de tamamlanan
- ✓ ADIM 1 / P1-1  (commit 46d6c84) — xlsx CDN pin + SRI hash
- ✓ ADIM 2 / P1-4  (commit 20e8f10) — realtime topic-suffix bolge filter
- ✓ ADIM 3 / P1-9  (commit b893e19) — realtime exp backoff + resync + visibility
- ✓ ADIM 4 / P1-5  (commit 8dcdb60) — storeDel header H'a hizalandı
- ✓ ADIM 5 / P1-8  (commit 5f6645b, docs 6a93e13) — misafir PBKDF2 600k (USER_DECISION → B)
- ✓ ADIM 6 / P1-10 (commit 23b2ddb) — log PII mask Worker /maskPII + frontend wrapper
- ✓ ADIM 7 / P1-14 (commit d406f60) — dashboard PII mask preflight + hard-mask fallback
- 🔴 ADIM 8 / P1-7 — **D+errata, P3-DEVİR** (USER_DECISION); kapanış commit 7479ecb
- ✓ chore cleanup (commit 3f9d347) — duplicate "Ertelenen / Reddedilen" header

## Faz 1'de tamamlanan (referans)
- ✓ P1-12 (commit 7b5b8d2) — çift policy konsolidasyonu migration'ı
- ✓ P1-6  (commit e90d193) — santiye_raporlar RLS sıkı sahiplik (USER_DECISION → A)
- ✓ OPEN-1 (commit ec8386c) — storage misafir SELECT kapı (kod kanıtıyla)
- ✓ P1-3  (commit 8c8324d) — Worker CORS Origin whitelist
- ✓ P1-11 (commit fc3f732) — SISTEM_PROMPT defansif madde
- ✓ P1-2  (commit 5d2dd58) — Worker /upload file validation

## Yarım kalan
_(yok)_

## P3'e devredilen
- 🔴 **P1-7** (W3) — Drive restricted + signed proxy. D+errata (Faz 1+2 sonu
  iki kez değerlendirildi). Resmi P3 maddesi. AUDIT_FINAL §4 #7 satırında
  devir notu. MANUAL_TASKS USER_DECISION bloğunda 4 seçenek + B3 HMAC
  short-lived token pattern referansta.

## Manuel deploy turu (kullanıcı, sırasıyla — bloker fix sonrası güncel)
1. **M-1** — GitHub default branch `main` rename + Cloudflare Pages branch sync
2. **M0**  — PRE-DEPLOY CHECK: SELECT DISTINCT duzenleyen FROM santiye_log (UX)
3. **M1**  — Supabase: migrations/2026-05-04_p1_policy_consolidation.sql
4. **M2**  — Supabase: migrations/2026-05-04_p1_santiye_raporlar_rls.sql
            (BEGIN; <SQL>; ROLLBACK; dry-run önce)
5. **M3**  — Supabase: migrations/2026-05-04_p1_open1_storage_misafir_kapat.sql
6. **M5**  — Supabase: migrations/2026-05-04_p3_malzemeler_consolidation.sql
7. **M6**  — Cloudflare: PII_PEPPER secret (`openssl rand -hex 32`)
            + determinism test (a@x 2 kez = aynı, a@x ≠ b@x)
8. **M7**  — Cloudflare: GUEST_PASSWORD_HASH secret
            (`node scripts/hash_misafir_pass.mjs "ASEL2026"`)
9. **M4+M8 birleşik** — Cloudflare Worker bundled deploy (FULL)
10. **M9** — Cloudflare WAF rule: /misafirLogin 5 req/min/IP (post-deploy)
11. **Smoke** — `bash scripts/smoke.sh <FE> <WORKER> <SUPABASE_URL> <ANON_KEY> <JWT>`
            10 test: frontend + 2× CORS + 2× /upload + /misafirLogin +
            /maskPII + RLS sanity + CORS keskin + WS heartbeat

Detaylar: MANUAL_TASKS.md.

## Toplam istatistik
- **P0 commit'ler:** 16 + 1 hotfix (P0-17) = 17 (Faz öncesi)
- **Faz 1 P1 commit'ler:** 6 (P1-12, P1-6, OPEN-1, P1-3, P1-11, P1-2) + meta
- **Faz 2 commit'ler:** 7 (P1-1, P1-4, P1-9, P1-5, P1-10, P1-14, P1-8) + 2 docs + meta
- **Faz 3 commit'ler:** 5 (P2-1, P1-13, errata, audit/modules, smoke) + meta
- **USER_DECISION sayısı:** 5 toplam (Faz 1: P1-6→A, OPEN-1→kod kanıtı, P1-7→D;
  Faz 2: P1-8→B+600k, P1-7→D+errata)
- **Manuel deploy task:** M1-M8 (4 SQL + 2 secret + 1 Worker bundle + smoke)
- **Branch:** `claude/refactor-code-cleanup-9HnhE` (tek branch, default)

## Compact sonrası ilk dört iş
1. Bu dosyayı oku (FAZ 2+3 TAMAMLANDI)
2. MANUAL_TASKS.md oku (M1-M8 deploy turu)
3. CHANGES_SUMMARY.md oku (3 faz tablosu + errata + ertelenen)
4. `git log --oneline -30` ve `git status` çalıştır → manuel deploy beklenir;
   yeni iş için kullanıcının brief'ini al (P3 / Faz 4 vb.).
