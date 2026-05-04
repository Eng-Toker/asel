# CHANGES_SUMMARY.md

## Faz 1 — Backend & Infrastructure
| Madde | Status | Commit | Dosyalar | Risk/Karar Notu |
|---|---|---|---|---|
| P1-12 | ✓ kod | 7b5b8d2 | migrations/2026-05-04_p1_policy_consolidation.sql | DO bloku ile dynamic drop; santiyeler / santiye_notlar / record_asamalar / santiye_log per-cmd canonical policy. santiye_raporlar bilerek atlandı (P1-6 ayrı). santiye_log mevcut ALL davranışı korundu — immutable revize P2 (AUDIT_FINAL §11.7). |
| P1-6 | 🟡 BLOCKED | — | — | USER_DECISION_NEEDED — SELECT politikası (A/B/C). MANUAL_TASKS.md'ye blok açıldı. INSERT sıkılaştırması net, SELECT için kullanıcı kararı bekleniyor. |
| OPEN-1 | ⬜ | — | — | — |
| P1-7 | ⬜ | — | — | — |
| P1-2 | ⬜ | — | — | — |
| P1-3 | ⬜ | — | — | — |
| P1-11 | ⬜ | — | — | — |

## Faz 2 — Frontend & Realtime
_(başlamadı)_

## Faz 3 — Hygiene + Docs + Tests
_(başlamadı)_

## Yeni Riskler / Errata
_(yok)_

## Ertelenen / Reddedilen
_(yok)_
