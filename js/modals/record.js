// modals/record.js — Kayıt modal (form, CRUD, aşama yönetimi)

import { app, DURUM } from "../state.js";
import { el, esc, badgeCls, parseNum, toast, asamaOzet, veriVarMi } from "../utils.js";
import { isMisafir, oturumYukle } from "../auth.js";
import { dbPost, dbPatch, dbDelete, storeDel } from "../db.js";
import { veriYukle } from "../data.js";
import { tabGec } from "../router.js";
import { renderDetay } from "../views/detail.js";
import { renderSantiyeler } from "../views/projects.js";

// ── Form yardımcıları ─────────────────────────────────────────────────────────

function bosAsama(sira) {
  return { sira, malzeme: "", not: "", metraj: "", durum: "Beklemede", personeller: [], fotograflar: [], yeniFotolar: [], silinecek: [], acik: false };
}

function bosForm() {
  return { uygulamaAlani: "", asamaSayisi: 1, asamalar: [bosAsama(1)] };
}

function asamaEsitle(sayi) {
  sayi = Math.max(1, Math.min(8, sayi));
  const mev = app.form.asamalar;
  app.form.asamalar = Array.from({ length: sayi }, (_, i) => mev[i] ? { ...mev[i], sira: i + 1 } : bosAsama(i + 1));
  app.form.asamaSayisi = sayi;
}

// ── Kayıt kaydetme ────────────────────────────────────────────────────────────

async function sbKaydet(form, duzId) {
  const as = form.asamalar;
  const satir = {
    santiye: app.secilenSantiye,
    uygulama_alani: form.uygulamaAlani,
    bolge: app.bolge || "İskele",
    personeller: as.flatMap((a) => a.personeller || []).filter((v, i, arr) => arr.indexOf(v) === i),
  };

  let recId;
  if (duzId) { const d = await dbPatch("santiye_records", `id=eq.${duzId}`, satir); recId = d[0].id; }
  else        { const d = await dbPost("santiye_records", satir); recId = d[0].id; }

  // B12: silent catch kaldırıldı — fail outer try-catch'e gider, kullanıcı
  // toast ile haberdar olur. Atomicity yok ama transparency var.
  await dbDelete("record_asamalar", `record_id=eq.${recId}`);
  if (as.length) {
    await dbPost("record_asamalar", as.map((a, i) => ({
      record_id: recId, sira_no: i + 1, malzeme: a.malzeme || null,
      uygulama_notu: a.not || null, metraj: parseNum(a.metraj),
      durum: a.durum || "Beklemede", personeller: a.personeller || [],
    })));
  }

  const eskiKayit = app.kayitlar.find((r) => r.id === recId);
  const logRows = as.filter(veriVarMi).filter((a) => {
    if (!duzId) return true;
    const eskiAsama = eskiKayit?.asamalar?.find((e) => e.sira === a.sira);
    if (!eskiAsama) return true;
    return (
      a.durum !== eskiAsama.durum || a.malzeme !== eskiAsama.malzeme ||
      parseNum(a.metraj) !== parseNum(eskiAsama.metraj) ||
      JSON.stringify(a.personeller || []) !== JSON.stringify(eskiAsama.personeller || [])
    );
  }).map((a) => ({
    record_id: recId, asama_no: a.sira, santiye: app.secilenSantiye,
    uygulama_alani: form.uygulamaAlani, malzeme: a.malzeme || null,
    durum: a.durum || "Beklemede", metraj: parseNum(a.metraj),
    personeller: a.personeller || [], duzenleyen: oturumYukle()?.ad || null,
    bolge: app.bolge || "İskele",
  }));
  // B12: log + foto silme silent catch kaldırıldı. Log fail = audit gap,
  // foto silme fail = orphan asset — ikisi de görünür olmalı.
  if (logRows.length) await dbPost("santiye_log", logRows);

  for (const a of as)
    for (const f of a.silinecek || []) {
      if (f.file_path) await storeDel([f.file_path]);
      await dbDelete("record_fotograflar", `id=eq.${f.id}`);
    }

  for (let i = 0; i < as.length; i++)
    for (const foto of as[i].yeniFotolar || []) {
      if (!foto.driveUrl) continue;
      await dbPost("record_fotograflar", {
        record_id: recId, asama_no: i + 1, file_path: null,
        file_url: foto.driveUrl, file_id: foto.driveId || null,
      });
    }

  return recId;
}

// ── HTML yardımcıları ────────────────────────────────────────────────────────

function malzHtml(idx, q = "") {
  const sec = app.form.asamalar[idx].malzeme;
  const lst = q ? app.malzemeler.filter((m) => m.toLowerCase().includes(q.toLowerCase())) : app.malzemeler;
  const items = lst.map((m) =>
    `<label class="picker-item"><input type="radio" name="malz-${idx}" onchange="malzSec(${idx},'${esc(m)}')" ${sec === m ? "checked" : ""}>${esc(m)}</label>`
  ).join("");
  const digerSec = !app.malzemeler.includes(sec) && sec ? "checked" : "";
  return items + `<label class="picker-item">
    <input type="radio" name="malz-${idx}" onchange="malzDigerAc(${idx})" ${digerSec}>
    ✏ Diğer (manuel gir)
  </label>
  <div id="malz-diger-input-${idx}" style="${digerSec ? "" : "display:none"};padding:6px 8px">
    <input class="form-input" id="malz-diger-val-${idx}" value="${digerSec ? esc(sec) : ""}" placeholder="Malzeme adı gir..." oninput="malzSec(${idx},this.value)" style="height:32px;font-size:13px" ${digerSec ? "" : 'readonly tabindex="-1"'}>
  </div>`;
}

function perHtml(idx, q = "") {
  const secliler = app.form.asamalar[idx].personeller;
  const lst = q ? app.personeller.filter((p) => p.toLowerCase().includes(q.toLowerCase())) : app.personeller;
  const items = lst.map((p) => {
    const secili = secliler.includes(p);
    const idx2 = secliler.indexOf(p);
    return `<label class="picker-item" style="justify-content:space-between">
      <span style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" onchange="perToggle(${idx},'${esc(p)}',this.checked)" ${secili ? "checked" : ""}>
        ${esc(p)}
      </span>
      ${secili ? `<button type="button" onclick="perKaldir(${idx},${idx2})" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:16px;padding:0 4px;line-height:1;flex-shrink:0">×</button>` : ""}
    </label>`;
  }).join("");
  return items + `<div style="padding:6px 8px;border-top:1px solid var(--border);margin-top:4px">
    <input class="form-input" id="per-diger-${idx}" placeholder="✏ Diğer — isim gir, Enter'a bas..." style="height:32px;font-size:13px"
      onkeydown="if(event.key==='Enter'){perDigerEkle(${idx});event.preventDefault()}">
  </div>`;
}

function stepperHtml() {
  const stages = app.form.asamalar;
  return `<div class="stepper">${stages.map((a, i) => {
    const tamam = a.durum === "Tamamlandı";
    const aktif = !tamam && (i === 0 || stages[i - 1].durum === "Tamamlandı");
    const cls   = tamam ? "done" : aktif ? "active" : "";
    return `${i > 0 ? '<div class="step-line"></div>' : ""}<div class="step ${cls}" title="Aşama ${i + 1}: ${esc(a.durum)}"><div class="step-dot">${i + 1}</div></div>`;
  }).join("")}</div>`;
}

export function renderModal() {
  const f = app.form;
  if (!f) return;
  el("modal-body").innerHTML = `
    <div class="section">
      <div class="section-title">📍 Genel Bilgi</div>
      <div class="form-grid-2">
        <div class="form-group"><label class="form-label">Uygulama Alanı *</label>
          <input class="form-input" id="f-alan" placeholder="Örn: Çiçeklik - Giriş Sağ" value="${esc(f.uygulamaAlani)}" oninput="el('f-alan').classList.remove('err')"></div>
        <div class="form-group"><label class="form-label">Aşama Sayısı</label>
          <select class="form-select" onchange="asamaSayisiDegisti(this.value)">
            ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}" ${f.asamaSayisi === n ? "selected" : ""}>${n} Aşama</option>`).join("")}
          </select></div>
      </div>
    </div>
    ${stepperHtml()}
    ${f.asamalar.map((a, i) => {
      const tumFoto = [
        ...(a.fotograflar || []).map((foto, fi) => ({ src: foto.url, sil: `formFotoSil(${i},'${foto.id}','${esc(foto.file_path || "")}')`, idx: fi })),
        ...(a.yeniFotolar || []).map((foto, fi) => ({ src: foto.prev, sil: `yeniFotoSil(${i},${fi})`, idx: (a.fotograflar?.length || 0) + fi })),
      ];
      return `<div class="stage-acc">
        <button type="button" class="stage-acc-head" onclick="asamaToggle(${i})">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
            <div class="step-dot ${a.durum === "Tamamlandı" ? "done" : "active"}" style="width:24px;height:24px;font-size:11px">${a.durum === "Tamamlandı" ? "✓" : i + 1}</div>
            <div style="flex:1;min-width:0">
              <div class="stage-acc-name">Aşama ${i + 1}</div>
              <div class="stage-acc-meta" id="acc-meta-${i}">${esc(asamaOzet(a))}</div>
            </div>
          </div>
          <span class="badge ${badgeCls(a.durum)}" style="margin-right:8px">${esc(a.durum)}</span>
          <span class="stage-acc-arrow" id="acc-arrow-${i}">${a.acik ? "▾" : "▸"}</span>
        </button>
        <div class="stage-acc-body ${a.acik ? "" : "closed"}" id="acc-body-${i}">
          <div class="form-grid-2">
            <div class="form-group"><label class="form-label">Malzeme</label>
              <details class="picker-details">
                <summary id="malz-sum-${i}">${esc(a.malzeme || "Malzeme seç / ara")}</summary>
                <div class="search-wrap">
                  <input class="picker-search" id="malz-ara-${i}" placeholder="Malzeme ara..."
                    oninput="malzAra(${i},this.value);toggleClear('malz-clr-${i}',this.value)">
                  <button class="search-clear" id="malz-clr-${i}" onclick="clearAra('malz-ara-${i}','malz-clr-${i}',()=>malzAra(${i},''))">×</button>
                </div>
                <div class="picker-list" id="malz-list-${i}">${malzHtml(i)}</div>
              </details></div>
            <div class="form-group"><label class="form-label">Durum</label>
              <select class="form-select" onchange="asamaGuncelle(${i},'durum',this.value)">
                ${DURUM.map((d) => `<option value="${d}" ${a.durum === d ? "selected" : ""}>${d}</option>`).join("")}
              </select></div>
          </div>
          <div class="form-group"><label class="form-label">Uygulama Notu</label>
            <input class="form-input" placeholder="Not gir (opsiyonel)" value="${esc(a.not)}" oninput="asamaGuncelle(${i},'not',this.value)"></div>
          <div class="form-group"><label class="form-label">Metraj (m²)</label>
            <input class="form-input" type="text" inputmode="decimal" placeholder="0.00" value="${esc(a.metraj)}" oninput="asamaGuncelle(${i},'metraj',this.value)"></div>
          <div class="form-group"><label class="form-label">Personel</label>
            <details class="picker-details">
              <summary id="per-sum-${i}" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                <span>${a.personeller?.length ? a.personeller.length + " kişi seçili" : "Personel seç / ara"}</span>
                ${a.personeller?.length ? `<button type="button" onclick="event.preventDefault();perHepsiniSil(${i})" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:12px;font-weight:700;padding:0 4px">✕ Temizle</button>` : ""}
              </summary>
              <div class="search-wrap">
                <input class="picker-search" id="per-ara-${i}" placeholder="İsim ara..."
                  oninput="perAra(${i},this.value);toggleClear('per-clr-${i}',this.value)">
                <button class="search-clear" id="per-clr-${i}" onclick="clearAra('per-ara-${i}','per-clr-${i}',()=>perAra(${i},''))">×</button>
              </div>
              <div class="picker-list" id="per-list-${i}">${perHtml(i)}</div>
            </details>
            ${a.personeller?.length ? `<div class="chips">${a.personeller.map((p, pi) => `<span class="chip">${esc(p)} <button type="button" onclick="perKaldir(${i},${pi})" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;padding:0 0 0 4px;line-height:1">×</button></span>`).join("")}</div>` : ""}
          </div>
          <div class="form-group">
            <label class="form-label">Fotoğraflar</label>
            <div class="dropzone" id="dz-${i}" ondragover="dzDrag(event,${i},true)" ondragleave="dzDrag(event,${i},false)" ondrop="dzDrop(event,${i})">
              <div class="dropzone-icon">📷</div>
              <div class="dropzone-text"><strong>Fotoğraf yüklemek için tıkla</strong><br>veya buraya sürükle bırak</div>
              <div class="dropzone-actions">
                <button type="button" class="btn btn-sm" onclick="el('foto-galeri-${i}').click()">📁 Galeri</button>
                <button type="button" class="btn btn-sm" onclick="kameraAc(${i})">📷 Kamera</button>
              </div>
              <input type="file" accept="image/*" multiple class="file-input-hidden" onchange="fotografEkle(${i},this)" id="foto-galeri-${i}">
            </div>
            <div id="foto-progress-${i}"></div>
            ${tumFoto.length ? `<div class="photo-grid" style="margin-top:10px">
              ${tumFoto.map((foto) => `<div class="photo-wrap">
                <img class="photo-img" src="${esc(foto.src)}" loading="lazy" onclick="formFotoBak(${i},${foto.idx})">
                <button class="photo-del" onclick="${foto.sil}">×</button>
              </div>`).join("")}
            </div>` : ""}
          </div>
        </div>
      </div>`;
    }).join("")}`;
}

// ── Form eylemleri ────────────────────────────────────────────────────────────

window.asamaToggle = (i) => {
  app.form.asamalar[i].acik = !app.form.asamalar[i].acik;
  el(`acc-body-${i}`).classList.toggle("closed", !app.form.asamalar[i].acik);
  el(`acc-arrow-${i}`).textContent = app.form.asamalar[i].acik ? "▾" : "▸";
};

window.asamaGuncelle = (i, alan, val) => {
  const alanInput = el("f-alan");
  if (alanInput) app.form.uygulamaAlani = alanInput.value;
  app.form.asamalar[i][alan] = val;
  if (alan === "durum") { renderModal(); return; }
  const m = el(`acc-meta-${i}`);
  if (m) m.textContent = asamaOzet(app.form.asamalar[i]);
};

window.asamaSayisiDegisti = (v) => {
  const alanInput = el("f-alan");
  if (alanInput) app.form.uygulamaAlani = alanInput.value;
  asamaEsitle(Number(v));
  renderModal();
};

window.malzDigerAc = (i) => {
  const inputDiv = el(`malz-diger-input-${i}`);
  if (inputDiv) {
    inputDiv.style.display = "block";
    const input = el(`malz-diger-val-${i}`);
    if (input) { input.removeAttribute("readonly"); input.removeAttribute("tabindex"); input.focus(); malzSec(i, input.value); }
  }
};

window.malzSec = (i, m) => {
  app.form.asamalar[i].malzeme = m;
  const s = el(`malz-sum-${i}`); if (s) s.textContent = m || "Malzeme seç / ara";
  const meta = el(`acc-meta-${i}`); if (meta) meta.textContent = asamaOzet(app.form.asamalar[i]);
  if (app.malzemeler.includes(m)) {
    const digerDiv = el(`malz-diger-input-${i}`); if (digerDiv) digerDiv.style.display = "none";
    const digerInput = el(`malz-diger-val-${i}`);
    if (digerInput) { digerInput.setAttribute("readonly", ""); digerInput.setAttribute("tabindex", "-1"); digerInput.value = ""; }
  }
};

window.malzAra = (i, q) => { const l = el(`malz-list-${i}`); if (l) l.innerHTML = malzHtml(i, q); };

window.perToggle = (i, ad, sec) => {
  const a = app.form.asamalar[i];
  if (sec && !a.personeller.includes(ad)) a.personeller.push(ad);
  else if (!sec) a.personeller = a.personeller.filter((p) => p !== ad);
  const araEl  = el(`per-ara-${i}`);
  const listEl = el(`per-list-${i}`);
  if (listEl) listEl.innerHTML = perHtml(i, araEl?.value || "");
  const sumEl = el(`per-sum-${i}`);
  if (sumEl) sumEl.firstElementChild.textContent = a.personeller.length ? a.personeller.length + " kişi seçili" : "Personel seç / ara";
  const detailsEl = listEl?.closest("details");
  if (detailsEl) {
    let chipsDiv = detailsEl.nextElementSibling;
    if (chipsDiv?.classList.contains("chips")) chipsDiv.remove();
    if (a.personeller.length) {
      const div = document.createElement("div");
      div.className = "chips";
      div.innerHTML = a.personeller.map((p, pi2) =>
        `<span class="chip">${esc(p)} <button type="button" onclick="perKaldir(${i},${pi2})" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:14px;padding:0 0 0 4px;line-height:1;vertical-align:middle">×</button></span>`
      ).join("");
      detailsEl.after(div);
    }
  }
};

window.perHepsiniSil = (i) => { app.form.asamalar[i].personeller = []; renderModal(); };

window.perKaldir = (i, pi) => { app.form.asamalar[i].personeller.splice(pi, 1); renderModal(); };

window.perAra = (i, q) => { const l = el(`per-list-${i}`); if (l) l.innerHTML = perHtml(i, q); };

window.perDigerEkle = (i) => {
  const input = el(`per-diger-${i}`);
  const ad = input?.value.trim();
  if (!ad) return;
  const a = app.form.asamalar[i];
  if (!a.personeller.includes(ad)) { a.personeller.push(ad); renderModal(); toast('"' + ad + '" eklendi', "ok", 1800); }
  if (input) input.value = "";
};

window.dzDrag = (e, i, on) => { e.preventDefault(); el("dz-" + i)?.classList.toggle("drag", on); };
window.dzDrop = (e, i) => {
  e.preventDefault();
  el("dz-" + i)?.classList.remove("drag");
  const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  const inp = el(`foto-galeri-${i}`);
  if (inp) { inp.files = dt.files; window.fotografEkle(i, inp); }
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

window.kayitToggle = (id) => {
  const body  = el("rec-body-" + id);
  const arrow = el("rec-arrow-" + id);
  const head  = el("rec-head-" + id);
  if (!body) return;
  const kapali = body.classList.toggle("closed");
  if (head)  head.classList.toggle("open", !kapali);
  if (arrow) arrow.textContent = kapali ? "Detay ▾" : "▴ Kapat";
};

window.santiyeSec = (ad) => {
  app.secilenSantiye = ad;
  tabGec("detail");
  renderDetay();
};

window.kayitDuzenle = (id) => {
  if (isMisafir()) { toast("Misafirler düzenleyemez", "warn"); return; }
  const rec = app.kayitlar.find((r) => r.id === id);
  if (!rec) return;
  app.duzenlenenId = id;
  app.form = {
    uygulamaAlani: rec.uygulamaAlani,
    asamaSayisi: rec.asamalar?.length || 1,
    asamalar: (rec.asamalar || [{ ...bosAsama(1) }]).map((a, i) => ({
      ...a, fotograflar: [...(a.fotograflar || [])], yeniFotolar: [], silinecek: [], personeller: [...(a.personeller || [])], acik: false,
    })),
  };
  el("modal-title").textContent = "Uygulama Alanını Düzenle";
  el("modal-overlay").classList.add("open");
  renderModal();
};

window.yeniKayitAc = () => {
  if (isMisafir()) { toast("Misafirler kayıt ekleyemez", "warn"); return; }
  app.duzenlenenId = null;
  app.form = bosForm();
  el("modal-title").textContent = "Yeni Uygulama Alanı";
  el("modal-overlay").classList.add("open");
  renderModal();
};

window.modalKapat = () => {
  for (const a of app.form?.asamalar || [])
    for (const f of a.yeniFotolar || []) URL.revokeObjectURL(f.prev);
  app.form = null;
  app.duzenlenenId = null;
  el("modal-overlay").classList.remove("open");
  el("modal-status").textContent = "";
  el("modal-status").className = "status";
};

window.kayitKaydet = async () => {
  if (isMisafir()) { toast("Misafir kayıt ekleyemez", "warn"); return; }
  const alanInput = el("f-alan");
  if (alanInput) app.form.uygulamaAlani = alanInput.value.trim();
  if (!app.form.uygulamaAlani) {
    if (alanInput) alanInput.classList.add("err");
    el("modal-status").textContent = "Uygulama alanı adı zorunlu.";
    el("modal-status").className = "status err";
    toast("Uygulama alanı adı boş olamaz", "err");
    return;
  }
  el("btn-save").disabled = true;
  el("btn-save").innerHTML = '<span class="spinner"></span> Kaydediliyor...';
  el("modal-status").textContent = "";
  try {
    await sbKaydet(app.form, app.duzenlenenId);
    await veriYukle({ sessiz: true });
    toast(app.duzenlenenId ? "Kayıt güncellendi" : "Yeni kayıt eklendi", "ok");
    window.modalKapat();
    renderDetay();
    renderSantiyeler();
  } catch (err) {
    el("modal-status").textContent = err.message || "Hata oluştu.";
    el("modal-status").className = "status err";
    toast("Kaydedilemedi: " + (err.message || ""), "err");
  } finally {
    el("btn-save").disabled = false;
    el("btn-save").textContent = "Kaydet";
  }
};

window.kayitSil = async (id) => {
  if (isMisafir()) { toast("Misafirler silemez", "warn"); return; }
  if (!confirm("Bu uygulama alanı ve tüm verisi silinsin mi?")) return;
  try {
    const rec = app.kayitlar.find((r) => r.id === id);
    const yollar = (rec?.asamalar || []).flatMap((a) => (a.fotograflar || []).map((f) => f.file_path).filter(Boolean));
    if (yollar.length) await storeDel(yollar).catch(() => {});
    await dbDelete("santiye_log",       `record_id=eq.${id}`).catch(() => {});
    await dbDelete("record_fotograflar", `record_id=eq.${id}`).catch(() => {});
    await dbDelete("record_asamalar",    `record_id=eq.${id}`).catch(() => {});
    await dbDelete("santiye_records",    `id=eq.${id}`);
    app.kayitlar = app.kayitlar.filter((r) => r.id !== id);
    toast("Kayıt silindi", "ok");
    renderDetay();
    renderSantiyeler();
  } catch (err) {
    toast("Silinemedi: " + (err.message || ""), "err");
  }
};

window.fotoSil = async (fotoId, filePath, recId, asamaSira) => {
  if (isMisafir()) { toast("Misafirler silemez", "warn"); return; }
  if (!confirm("Fotoğraf silinsin mi?")) return;
  try {
    if (filePath) await storeDel([filePath]).catch(() => {});
    await dbDelete("record_fotograflar", `id=eq.${fotoId}`);
    const rec   = app.kayitlar.find((r) => r.id === recId);
    const asama = rec?.asamalar?.find((a) => a.sira === asamaSira);
    if (asama) asama.fotograflar = asama.fotograflar.filter((f) => f.id !== fotoId);
    toast("Fotoğraf silindi", "ok", 1800);
    renderDetay();
  } catch (err) {
    toast("Silinemedi: " + (err.message || ""), "err");
  }
};

window.fotoBak = (recId, asamaSira, fi, hasar) => {
  const rec   = app.kayitlar.find((r) => r.id === recId);
  const asama = rec?.asamalar?.find((a) => a.sira === asamaSira);
  const fotolar = (asama?.fotograflar || []).filter((f) => !!f.hasar === !!hasar);
  import("../lightbox.js").then(({ lbAc }) => lbAc(fotolar.map((f) => f.url), fi));
};
