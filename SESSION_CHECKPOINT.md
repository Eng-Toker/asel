# SESSION_CHECKPOINT.md

**Son güncelleme:** 2026-05-04
**Aktif faz:** Faz 1 — Backend & Infrastructure
**Aktif madde:** ADIM 2 — P1-6 santiye_raporlar RLS — **USER_DECISION_NEEDED (SELECT politikası)**

## Bu fazda tamamlanan
- ✓ P1-12 (commit 7b5b8d2) — çift policy konsolidasyonu migration'ı

## Yarım kalan (varsa)
- **ADIM 2 / P1-6** — SELECT policy seçimi için kullanıcı kararı bekleniyor.
  MANUAL_TASKS.md → `[USER_DECISION_NEEDED] — P1-6 santiye_raporlar SELECT
  politikası` bloğuna bak. INSERT sıkılaştırması (with check
  `hazirlayan_email = auth.jwt() ->> 'email'`) net; SELECT için A/B/C seçimi
  bekleniyor. Karar geldiğinde `migrations/2026-05-04_p1_santiye_raporlar_rls.sql`
  yazılıp commit edilecek.

## Bu fazda kalan
- ADIM 2 — P1-6 santiye_raporlar RLS bölge/sahiplik
- ADIM 3 — OPEN-1 misafir_foto_okuma analizi
- ADIM 4 — P1-3 Worker CORS Origin whitelist
- ADIM 5 — P1-11 SISTEM_PROMPT defansif cümle
- ADIM 6 — P1-2 Worker file validation
- ADIM 7 — P1-7 Drive restricted + signed proxy

## Kritik bağlam (compact sonrası unutulmaması gereken)
- Branch: `claude/refactor-code-cleanup-9HnhE` (tek branch, default).
- 16 P0 commit'i deploy edilmiş; HANDOFF.md kanıt.
- MANUAL_TASKS.M1: P1-12 SQL deploy bekliyor (kullanıcı manuel çalıştıracak).
- santiye_log immutable yapma kararı P2'ye atıldı (AUDIT_FINAL §11.7).
- Untracked dosyalar (devraldığım state): `.claude/`, `AUDIT_FINAL.md`, `AUDIT_GRUP1-5_OZET.md`, `HANDOFF.md`. Faz 3 P2-1'de `.gitignore`/`.cfignore` eklenecek; şimdi dokunulmuyor.

## Compact sonrası ilk altı iş
1. Bu dosyayı oku (SESSION_CHECKPOINT.md)
2. MANUAL_TASKS.md oku
3. CHANGES_SUMMARY.md oku
4. `git log --oneline -10` çalıştır
5. `git status` çalıştır
6. Aktif fazın kalan listesinden ilk maddeye, Plan Mode'a geç
