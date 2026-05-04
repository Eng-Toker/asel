# CHANGES_SUMMARY.md

## Faz 1 — Backend & Infrastructure
| Madde | Status | Commit | Dosyalar | Risk/Karar Notu |
|---|---|---|---|---|
| P1-12 | ✓ kod | 7b5b8d2 | migrations/2026-05-04_p1_policy_consolidation.sql | DO bloku ile dynamic drop; santiyeler / santiye_notlar / record_asamalar / santiye_log per-cmd canonical policy. santiye_raporlar bilerek atlandı (P1-6 ayrı). santiye_log mevcut ALL davranışı korundu — immutable revize P2 (AUDIT_FINAL §11.7). |
| P1-6 | ✓ kod | e90d193 | migrations/2026-05-04_p1_santiye_raporlar_rls.sql | USER_DECISION → Seçenek A (sıkı sahiplik). SELECT/INSERT both filter `hazirlayan_email = auth.jwt() ->> 'email'`. UPDATE/DELETE yok (immutable korunur). Future multi-admin görünürlüğü için P2 user_bolgeleri (AUDIT §11.2). |
| OPEN-1 | ✓ kod | _pending_ | migrations/2026-05-04_p1_open1_storage_misafir_kapat.sql | Kararı kod analizi verdi (USER_DECISION değil): Storage upload kodu yok, frontend Drive URL kullanıyor → anon SELECT policy kapatılabilir, UX kırılmaz. Defansif DO bloku ile storage.objects'te kalan tüm anon/public policy'leri drop ediyor. M3 ek doğrulama: bucket envanter + record_fotograflar.file_url Storage formatında olmadığını teyit. |
| P1-7 | ⬜ | — | — | — |
| P1-2 | ⬜ | — | — | — |
| P1-3 | ✓ kod | _pending_ | cloudflare-worker.js (corsHeadersFor + whitelist) | Static set + preview pattern (`*.santiye-takipp.pages.dev`) + localhost. İzinsiz Origin için Allow-Origin yazılmaz (browser bloklar). Vary:Origin cache poisoning koruması. P0-17 Authorization preflight izni KORUNDU. |
| P1-11 | ⬜ | — | — | — |

## Faz 2 — Frontend & Realtime
_(başlamadı)_

## Faz 3 — Hygiene + Docs + Tests
_(başlamadı)_

## Yeni Riskler / Errata
- **2026-05-04 OPEN-1 yan-bulgu:** P0 migration storage'da `Public read/insert/delete`
  drop etti ama `misafir_foto_okuma` adlı anon SELECT policy spesifik olarak
  drop edilmedi. OPEN-1 migration'ında defansif DO bloku ile tüm anon/public
  storage policy'leri kapatıldı. P0 commit'lerine dokunulmadı (brief §2 kuralı).

## Ertelenen / Reddedilen
_(yok)_
