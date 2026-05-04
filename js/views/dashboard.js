// views/dashboard.js — Genel istatistik özeti

import { app } from "../state.js";
import { el, esc, badgeCls, parseNum, tarihKisa } from "../utils.js";
import { registerRender } from "../router.js";
import { maskPIIBatch, maskCached } from "../mask.js";

// Legacy duzenleyen değerleri ham email/local-part içerebilir (P1-10
// öncesi yazımlar). Email gibi görünen veya yeni olmayan local-part
// formatlı değerleri tespit edip Worker'dan deterministic hash al.
// pii: ile başlayan değerler zaten maskeli, mapped isimler (Abdulrahman,
// Deniz) raw kalır.
const _MAPPED = new Set(["abdulrahman", "deniz"]);
function _piiAdayMi(s) {
  if (!s || typeof s !== "string") return false;
  if (s.startsWith("pii:")) return false;
  if (s === "—" || s === "Admin") return false;
  if (_MAPPED.has(s.toLowerCase())) return false;
  if (s.includes("@")) return true;          // ham email
  return false;                              // local-part fallback'i bilemeyiz; e-postadan emin olmadan dokunma
}

async function _piiPrefetch(values) {
  const adaylar = [...new Set(values.filter(_piiAdayMi))];
  if (adaylar.length) await maskPIIBatch(adaylar);
}

// Render-time getter: aday değer için cache hit ise hash, yoksa "Admin"
// hard-mask (Worker erişilmediyse ham email asla göstermez).
function _piiGoster(value) {
  const cached = maskCached(value);
  if (cached !== value) return cached;             // cache hit (pii:hash)
  if (_piiAdayMi(value)) return "Admin";           // aday + miss → hard-mask
  return value;                                    // mapped/sentinel (Abdulrahman, —)
}

export async function renderDashboard() {
  const container = el("dashboard-content");
  if (!container) return;
  const dbBolge = el("dashboard-bolge");
  if (dbBolge) dbBolge.textContent = app.bolge || "";

  const santiyeler = app.santiyeler.map((s) => (typeof s === "object" ? s.name : s));
  const tumKayitlar = app.kayitlar;
  const tumAsamalar = tumKayitlar.flatMap((r) => r.asamalar || []);
  const toplamAlan   = tumKayitlar.length;
  const toplamAsama  = tumAsamalar.length;
  const tamAsama     = tumAsamalar.filter((a) => a.durum === "Tamamlandı").length;
  const devamAsama   = tumAsamalar.filter((a) => a.durum === "Devam Ediyor").length;
  const bekAsama     = tumAsamalar.filter((a) => a.durum === "Beklemede").length;
  const tamamPct     = toplamAsama ? Math.round((tamAsama / toplamAsama) * 100) : 0;
  const toplamMetraj = tumAsamalar.reduce((s, a) => s + (parseNum(a.metraj) || 0), 0);
  const aktifSantiye = santiyeler.filter((sa) => tumKayitlar.some((r) => r.santiye === sa)).length;
  const sonLog       = app.logSatirlar.slice(0, 5);

  // PII preflight: ham email-like duzenleyen değerleri için Worker'dan
  // deterministic hash al. UI freeze yok — fetch async, hata-toleranslı.
  await _piiPrefetch(sonLog.map((s) => s.duzenleyen));

  let html = `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:18px">
    <div class="stat" style="text-align:center"><div class="stat-label">Aktif Şantiye</div><div class="stat-value">${aktifSantiye}<span style="font-size:13px;color:var(--muted);font-weight:500"> / ${santiyeler.length}</span></div></div>
    <div class="stat" style="text-align:center"><div class="stat-label">Uygulama Alanı</div><div class="stat-value">${toplamAlan}</div></div>
    <div class="stat" style="text-align:center"><div class="stat-label">Toplam Aşama</div><div class="stat-value">${toplamAsama}</div></div>
    <div class="stat" style="text-align:center"><div class="stat-label">Toplam Metraj</div><div class="stat-value">${toplamMetraj.toFixed(1)}<span style="font-size:13px;color:var(--muted);font-weight:500"> m²</span></div></div>
    <div class="stat" style="text-align:center"><div class="stat-label">Genel İlerleme</div><div class="stat-value" style="color:var(--accent-d)">${tamamPct}%</div>
      <div style="background:var(--border);border-radius:999px;height:6px;margin-top:8px;overflow:hidden"><div style="height:100%;background:var(--accent);border-radius:999px;width:${tamamPct}%;transition:width .5s"></div></div></div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
    <span class="badge badge-done">✓ ${tamAsama} Tamamlandı</span>
    <span class="badge badge-progress">▶ ${devamAsama} Devam Ediyor</span>
    <span class="badge badge-wait">○ ${bekAsama} Beklemede</span>
  </div>`;

  if (sonLog.length) {
    html += `<div class="section" style="margin-bottom:16px"><div class="section-title">🕐 Son Aktivite</div><div style="display:grid;gap:8px">`;
    for (const s of sonLog) {
      const d = s.tarih ? new Date(s.tarih) : null;
      html += `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 10px;background:#fff;border:1px solid var(--border);border-radius:8px;font-size:12px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(s.santiye)} · ${esc(s.alan)}</div>
          <div style="color:var(--muted);margin-top:2px">${esc(_piiGoster(s.duzenleyen))} · Aşama ${s.asama}${s.malzeme ? " · " + esc(s.malzeme) : ""}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <span class="badge ${badgeCls(s.durum)}">${esc(s.durum)}</span>
          <div style="color:var(--muted);font-size:11px;margin-top:2px">${d ? tarihKisa(d) : "—"}</div>
        </div>
      </div>`;
    }
    html += `</div></div>`;
  }

  html += `<div class="section-title" style="margin-bottom:10px">🏗 Şantiye Bazında İlerleme</div><div style="display:grid;gap:10px">`;
  let kartlar = 0;
  for (const santiye of santiyeler) {
    const kayitlar = tumKayitlar.filter((r) => r.santiye === santiye);
    if (!kayitlar.length) continue;
    kartlar++;
    const asamalar = kayitlar.flatMap((r) => r.asamalar || []);
    const tam   = asamalar.filter((a) => a.durum === "Tamamlandı").length;
    const devam = asamalar.filter((a) => a.durum === "Devam Ediyor").length;
    const bek   = asamalar.filter((a) => a.durum === "Beklemede").length;
    const pct   = asamalar.length ? Math.round((tam / asamalar.length) * 100) : 0;
    const metraj = asamalar.reduce((s, a) => s + (parseNum(a.metraj) || 0), 0);
    html += `
    <div class="card" style="padding:14px;cursor:pointer" onclick="santiyeSec('${esc(santiye)}')">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px">
        <div style="font-size:14px;font-weight:700;flex:1;min-width:0">${esc(santiye)}</div>
        <div style="font-size:12px;color:var(--muted);flex-shrink:0">${kayitlar.length} alan · ${metraj.toFixed(1)} m²</div>
      </div>
      <div style="background:var(--border);border-radius:999px;height:8px;overflow:hidden;margin-bottom:8px"><div style="height:100%;background:var(--accent);border-radius:999px;width:${pct}%;transition:width .5s"></div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11px;align-items:center">
        ${tam   ? `<span class="badge badge-done">✓ ${tam}</span>`         : ""}
        ${devam ? `<span class="badge badge-progress">▶ ${devam}</span>`   : ""}
        ${bek   ? `<span class="badge badge-wait">○ ${bek}</span>`         : ""}
        <span style="margin-left:auto;color:var(--accent-d);font-weight:700">${pct}%</span>
      </div>
    </div>`;
  }
  if (!kartlar) {
    html += `<div class="empty"><div class="empty-icon">📊</div><div class="empty-title">Henüz veri yok</div><div class="empty-desc">İlk şantiyenize girip uygulama alanı ekleyin.</div></div>`;
  }
  html += `</div>`;
  container.innerHTML = html;
}

registerRender("dashboard", renderDashboard);
