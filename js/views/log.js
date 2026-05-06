// views/log.js — Saha takip log tablosu (santiye_log).
// Stok hareketleri için: views/stok.js → "Hareket Geçmişi" tab'ı.

import { app } from "../state.js";
import { el, esc, badgeCls } from "../utils.js";
import { registerRender } from "../router.js";
import { piiPrefetch, piiGoster } from "../pii-helpers.js";

export function renderLog() {
  const filterEl = el("log-filter-santiye");
  if (filterEl) {
    const mevcut = filterEl.value;
    filterEl.innerHTML = '<option value="">Tüm Şantiyeler</option>' +
      app.santiyeler.map((s) => {
        const ad = typeof s === "object" ? s.name : s;
        return `<option ${ad === mevcut ? "selected" : ""}>${esc(ad)}</option>`;
      }).join("");
  }
  window.logFiltrele();
}

window.logPerAc = (id) => {
  el(id + "-more").style.display = "none";
  el(id + "-rest").style.display = "inline";
};
window.logPerKapat = (id) => {
  el(id + "-more").style.display = "inline";
  el(id + "-rest").style.display = "none";
};

window.logFiltrele = async () => {
  const sFiltre = el("log-filter-santiye")?.value || "";
  const dFiltre = el("log-filter-durum")?.value || "";
  const aFiltre = (el("log-filter-ara")?.value || "").toLowerCase();
  const satirlar = app.logSatirlar.filter((s) => {
    if (sFiltre && s.santiye !== sFiltre) return false;
    if (dFiltre && s.durum !== dFiltre) return false;
    if (aFiltre && !s.alan?.toLowerCase().includes(aFiltre) && !s.malzeme?.toLowerCase().includes(aFiltre)) return false;
    return true;
  });

  // B10: dashboard ile tutarlı PII mask. Ham email değerler için Worker'dan
  // deterministic hash al; cache miss + aday değer "Admin" hard-mask.
  await piiPrefetch(satirlar.map((s) => s.duzenleyen));

  // Desktop tablo
  el("log-tbody").innerHTML = satirlar.length
    ? satirlar.map((s) => {
        const d = s.tarih ? new Date(s.tarih) : null;
        const tarih = d ? d.toLocaleDateString("tr-TR") : "—";
        const saat  = d ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—";
        const id = "lp-" + Math.random().toString(36).slice(2, 7);
        const gorunen = (s.personeller || []).slice(0, 2).map((p) => `<span class="chip" style="margin:2px;display:inline-block">${esc(p)}</span>`).join("");
        const gizli   = (s.personeller || []).slice(2).map((p) => `<span class="chip" style="margin:2px;display:inline-block">${esc(p)}</span>`).join("");
        const perHtml = s.personeller?.length
          ? s.personeller.length > 2
            ? `${gorunen}<span id="${id}-more"> <button onclick="logPerAc('${id}')" style="background:none;border:none;cursor:pointer;color:var(--accent-d);font-weight:700;font-size:12px">+${s.personeller.length - 2} daha</button></span><span id="${id}-rest" style="display:none">${gizli} <button onclick="logPerKapat('${id}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12px">Gizle</button></span>`
            : gorunen
          : "—";
        return `<tr>
          <td>${tarih}</td><td>${saat}</td>
          <td><span style="font-weight:600">${esc(piiGoster(s.duzenleyen) || "—")}</span></td>
          <td>${esc(s.santiye)}</td><td>${esc(s.alan)}</td>
          <td>Aşama ${s.asama}</td><td>${esc(s.malzeme || "—")}</td>
          <td><span class="badge ${badgeCls(s.durum)}">${esc(s.durum)}</span></td>
          <td>${s.metraj != null ? esc(String(s.metraj)) + " m²" : "—"}</td>
          <td>${perHtml}</td>
        </tr>`;
      }).join("")
    : '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:24px">Kayıt bulunamadı.</td></tr>';

  // Mobile cards
  el("log-cards").innerHTML = satirlar.length
    ? satirlar.map((s) => {
        const d = s.tarih ? new Date(s.tarih) : null;
        const tarih = d
          ? d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
          : "—";
        return `<div class="log-card">
          <div class="log-card-head">
            <div>
              <div class="log-card-tarih">${tarih} · ${esc(piiGoster(s.duzenleyen) || "—")}</div>
              <div class="log-card-title">${esc(s.alan)}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(s.santiye)} · Aşama ${s.asama}</div>
            </div>
            <span class="badge ${badgeCls(s.durum)}">${esc(s.durum)}</span>
          </div>
          <div class="log-card-meta">
            ${s.malzeme ? `<b>Malzeme:</b> ${esc(s.malzeme)}<br>` : ""}
            ${s.metraj != null ? `<b>Metraj:</b> ${esc(String(s.metraj))} m²<br>` : ""}
            ${s.personeller?.length ? `<b>Personel (${s.personeller.length}):</b> ${s.personeller.slice(0, 3).map(esc).join(", ")}${s.personeller.length > 3 ? ` +${s.personeller.length - 3}` : ""}` : ""}
          </div>
        </div>`;
      }).join("")
    : '<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">Kayıt bulunamadı</div></div>';
};

registerRender("log", renderLog);
