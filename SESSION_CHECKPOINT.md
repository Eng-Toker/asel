# SESSION_CHECKPOINT.md

**Son güncelleme:** 2026-05-04
**Aktif faz:** Faz 1 — Backend & Infrastructure
**Aktif madde:** ADIM 6 — P1-2 Worker file validation

## Bu fazda tamamlanan
- ✓ P1-12 (commit 7b5b8d2) — çift policy konsolidasyonu migration'ı
- ✓ P1-6 (commit e90d193) — santiye_raporlar RLS sıkı sahiplik (USER_DECISION → A)
- ✓ OPEN-1 (commit ec8386c) — storage misafir SELECT kapı (kod kanıtıyla)
- ✓ P1-3 (commit 8c8324d) — Worker CORS Origin whitelist
- ✓ P1-11 (commit _pending_) — SISTEM_PROMPT defansif madde

## Yarım kalan (varsa)
_(yok)_

## Bu fazda kalan
- ADIM 6 — P1-2 Worker file validation (size + MIME + magic + ext)
- ADIM 7 — P1-7 Drive restricted + signed proxy (USER_DECISION beklenen — eski URL migration politikası)
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
