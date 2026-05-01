// views/detail.js — Şantiye detay ve kayıt kartları

import { app } from "../state.js";
import { el, esc, badgeCls, tarihKisa } from "../utils.js";
import { isMisafir } from "../auth.js";

export function renderDetay() {
  if (!app.secilenSantiye) return;
  const tumKayitlar = app.kayitlar.filter((r) => r.santiye === app.secilenSantiye);

  el("detail-title").textContent = app.secilenSantiye;
  const tumAsamalar = tumKayitlar.flatMap((r) => r.asamalar || []);
  const alanSayisi = tumKayitlar.length;
  const tamAlan = tumKayitlar.filter((r) => (r.asamalar || []).length && (r.asamalar || []).every((a) => a.durum === "Tamamlandı")).length;
  const devamAlan = tumKayitlar.filter((r) => (r.asamalar || []).some((a) => a.durum === "Devam Ediyor")).length;
  const bekAlan = alanSayisi - tamAlan - devamAlan;

  const tamAsama  = tumAsamalar.filter((a) => a.durum === "Tamamlandı").length;
  const devamAsama = tumAsamalar.filter((a) => a.durum === "Devam Ediyor").length;
  const bekAsama  = tumAsamalar.filter((a) => a.durum === "Beklemede").length;

  el("stat-areas").textContent  = alanSayisi;
  el("stat-stages").textContent = tumAsamalar.length;

  const statChip = (renk, metin) =>
    `<span style="background:${renk}15;color:${renk};border:1px solid ${renk}40;border-radius:999px;padding:2px 7px;font-weight:600;font-size:10px">${metin}</span>`;

  el("stat-areas-detail").innerHTML =
    (tamAlan   ? statChip("#16a34a", "✓ " + tamAlan)   : "") +
    (devamAlan ? statChip("#d97706", "▶ " + devamAlan) : "") +
    (bekAlan > 0 ? statChip("#6b7280", "○ " + bekAlan) : "");

  el("stat-stages-detail").innerHTML =
    (tamAsama   ? statChip("#16a34a", "✓ " + tamAsama)   : "") +
    (devamAsama ? statChip("#d97706", "▶ " + devamAsama) : "") +
    (bekAsama   ? statChip("#6b7280", "○ " + bekAsama)   : "");

  el("stat-notlar-preview").textContent = app.notlar?.[app.secilenSantiye] || "Not yok";

  const aF = (app.filtre.alanAra || "").toLowerCase();
  const dF = el("alan-durum-filtre")?.value || "";
  const kayitlar = tumKayitlar.filter((rec) => {
    if (aF) {
      if (!rec.uygulamaAlani?.toLowerCase().includes(aF) &&
          !(rec.asamalar || []).some((a) => a.malzeme?.toLowerCase().includes(aF))) return false;
    }
    if (dF && !(rec.asamalar || []).some((a) => a.durum === dF)) return false;
    return true;
  });

  if (!tumKayitlar.length) {
    el("records-grid").innerHTML = `<div class="empty">
      <div class="empty-icon">📋</div>
      <div class="empty-title">Henüz uygulama alanı yok</div>
      <div class="empty-desc">İlk uygulama alanını ekleyerek başlayın.</div>
      ${!isMisafir() ? '<button class="btn btn-primary" onclick="yeniKayitAc()">+ Uygulama Alanı Ekle</button>' : ""}
    </div>`;
    return;
  }

  if (!kayitlar.length) {
    el("records-grid").innerHTML = `<div class="empty">
      <div class="empty-icon">🔍</div>
      <div class="empty-title">Filtreye uyan kayıt yok</div>
      <div class="empty-desc">Filtreleri temizleyerek tüm kayıtları görebilirsiniz.</div>
      <button class="btn" onclick="el('alan-ara').value='';el('alan-durum-filtre').value='';app.filtre.alanAra='';renderDetay()">Filtreleri Temizle</button>
    </div>`;
    return;
  }

  const misafir = isMisafir();
  el("records-grid").innerHTML = kayitlar.map((rec) => {
    const asamalar = rec.asamalar || [];
    const sonGuncelleme = rec.updatedAt;
    const tam = asamalar.filter((a) => a.durum === "Tamamlandı").length;
    const pct = asamalar.length ? Math.round((tam / asamalar.length) * 100) : 0;
    return `<div class="record-card">
      <div class="record-card-head" id="rec-head-${rec.id}" onclick="kayitToggle('${rec.id}')">
        <div style="flex:1;min-width:0">
          <div style="font-size:10px;color:#92400e;font-weight:600;letter-spacing:.08em;text-transform:uppercase">Uygulama Alanı</div>
          <div class="record-title">${esc(rec.uygulamaAlani)}</div>
          <div class="record-meta">${asamalar.length} aşama · ${tarihKisa(sonGuncelleme)}</div>
          <div class="record-progress">
            <div class="record-progress-bar"><div style="width:${pct}%"></div></div>
            <span class="record-progress-text">${pct}%</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${misafir ? "" : `
            <button class="btn btn-sm" onclick="event.stopPropagation();kayitDuzenle('${rec.id}')" title="Düzenle">✎</button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();kayitSil('${rec.id}')" title="Sil">🗑</button>
          `}
          <span class="record-card-arrow" id="rec-arrow-${rec.id}" style="font-size:11px;font-weight:600;color:#92400e;white-space:nowrap;padding:4px 8px;border:1px solid #f59e0b;border-radius:8px;background:#fef9c3">Detay ▾</span>
        </div>
      </div>
      <div class="record-card-body closed" id="rec-body-${rec.id}">
        <div class="stages-grid" style="margin-top:14px">
          ${asamalar.map((a, idx) => {
            const rozetHtml = `<span class="badge ${badgeCls(a.durum)}">${esc(a.durum)}</span>`;
            const hasarFoto  = (a.fotograflar || []).filter((f) =>  f.hasar);
            const normalFoto = (a.fotograflar || []).filter((f) => !f.hasar);
            return `<div class="stage-card">
              <div class="stage-card-head">
                <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
                  <div class="stage-card-title">Aşama ${a.sira}</div>
                  ${!misafir ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5;font-size:10px;padding:1px 6px;height:22px" onclick="hasarFotoYukle('${rec.id}',${a.sira})" title="Hasar fotoğrafı ekle">⚠</button>` : ""}
                </div>
                ${rozetHtml}
              </div>
              <div class="field"><div class="field-label">Malzeme</div><div class="field-value">${esc(a.malzeme || "—")}</div></div>
              ${a.not    ? `<div class="field"><div class="field-label">Not</div><div class="field-value">${esc(a.not)}</div></div>` : ""}
              ${a.metraj ? `<div class="field"><div class="field-label">Metraj</div><div class="field-value">${esc(a.metraj)} m²</div></div>` : ""}
              ${a.personeller?.length ? `<div class="field"><div class="field-label">Personel (${a.personeller.length})</div><div class="chips" id="per-chips-${rec.id}-${a.sira}">
                ${a.personeller.slice(0, 3).map((p) => `<span class="chip">${esc(p)}</span>`).join("")}
                ${a.personeller.length > 3 ? `<button type="button" class="chip" style="cursor:pointer;background:var(--accent);border-color:var(--accent);font-weight:700" onclick="perToggleDetay('${rec.id}',${a.sira},this,false)">+${a.personeller.length - 3} kişi daha</button>` : ""}
              </div></div>` : ""}
              ${normalFoto.length ? `<div class="field"><div class="field-label">Fotoğraflar (${normalFoto.length})</div><div class="photo-grid">
                ${normalFoto.map((f, fi) => `<div class="photo-wrap">
                  <img class="photo-img" src="${esc(f.url)}" loading="lazy" onclick="fotoBak('${rec.id}',${a.sira},${fi},false)">
                  ${!misafir ? `<button class="photo-del" onclick="fotoSil('${f.id}','${esc(f.file_path || "")}','${rec.id}',${a.sira})">×</button>` : ""}
                </div>`).join("")}
              </div></div>` : ""}
              ${hasarFoto.length ? `<div class="field"><div class="field-label" style="color:var(--err)">⚠ Hasar Fotoğrafları (${hasarFoto.length})</div><div class="photo-grid">
                ${hasarFoto.map((f, fi) => `<div class="photo-wrap">
                  <img class="photo-img" src="${esc(f.url)}" loading="lazy" style="border-color:var(--err)" onclick="fotoBak('${rec.id}',${a.sira},${fi},true)">
                  ${!misafir ? `<button class="photo-del" onclick="fotoSil('${f.id}','${esc(f.file_path || "")}','${rec.id}',${a.sira})">×</button>` : ""}
                </div>`).join("")}
              </div></div>` : ""}
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>`;
  }).join("");
}

window.onAlanAra = (input) => {
  app.filtre.alanAra = input.value;
  el("alan-ara-clr").classList.toggle("show", !!input.value);
  renderDetay();
};

window.perToggleDetay = (recId, asamaSira, btn, kapali) => {
  const rec = app.kayitlar.find((r) => r.id === recId);
  const asama = rec?.asamalar?.find((a) => a.sira === asamaSira);
  if (!asama) return;
  const chips = btn.closest(".chips");
  if (kapali) {
    chips.innerHTML =
      asama.personeller.slice(0, 3).map((p) => `<span class="chip">${esc(p)}</span>`).join("") +
      (asama.personeller.length > 3
        ? `<button type="button" class="chip" style="cursor:pointer;background:var(--accent);border-color:var(--accent);font-weight:700" onclick="perToggleDetay('${recId}',${asamaSira},this,false)">+${asama.personeller.length - 3} kişi daha</button>`
        : "");
  } else {
    chips.innerHTML =
      asama.personeller.map((p) => `<span class="chip">${esc(p)}</span>`).join("") +
      `<button type="button" class="chip" style="cursor:pointer;background:#e5e7eb;border-color:var(--border);font-weight:700" onclick="perToggleDetay('${recId}',${asamaSira},this,true)">Gizle ▴</button>`;
  }
};
