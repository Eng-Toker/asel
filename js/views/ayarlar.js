// views/ayarlar.js — Şantiye yönetimi, hakkında modal

import { app } from "../state.js";
import { el, esc, toast } from "../utils.js";
import { isMisafir } from "../auth.js";
import { dbPatch, dbPost, dbDelete } from "../db.js";
import { registerRender } from "../router.js";
import { renderSantiyeler } from "./projects.js";

let _ayarlarTab = "santiyeler"; // "santiyeler" | "malzemeler" | "personel"

window.ayarlarTabDegistir = (tab) => {
  if (tab !== "santiyeler" && tab !== "malzemeler" && tab !== "personel") return;
  _ayarlarTab = tab;
  renderAyarlar();
};

export function renderAyarlar() {
  // Tab visibility
  el("tab-ayarlar-santiyeler")?.classList.toggle("btn-primary", _ayarlarTab === "santiyeler");
  el("tab-ayarlar-malzemeler")?.classList.toggle("btn-primary", _ayarlarTab === "malzemeler");
  el("tab-ayarlar-personel")?.classList.toggle("btn-primary", _ayarlarTab === "personel");
  el("ayarlar-santiyeler-content")?.classList.toggle("hidden", _ayarlarTab !== "santiyeler");
  el("ayarlar-malzemeler-content")?.classList.toggle("hidden", _ayarlarTab !== "malzemeler");
  el("ayarlar-personel-content")?.classList.toggle("hidden", _ayarlarTab !== "personel");

  if (_ayarlarTab === "personel")   { renderPersonel();   return; }
  if (_ayarlarTab === "malzemeler") { renderMalzemeler(); return; }

  // Devamı: Şantiyeler tab'ı içeriği

  const list = el("ayarlar-santiye-list");
  if (!list) return;
  if (isMisafir()) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><div class="empty-title">Yetkisiz</div><div class="empty-desc">Misafirler ayarlara erişemez.</div></div>';
    return;
  }
  if (!app.santiyeler.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📂</div><div class="empty-title">Şantiye yok</div><div class="empty-desc">Ana ekrandaki + butonu ile ekleyin.</div></div>';
    return;
  }
  const son = app.santiyeler.length - 1;
  list.innerHTML = app.santiyeler.map((s, i) => {
    const ad = typeof s === "object" ? s.name : s;
    const sObj = typeof s === "object" ? s : null;
    const konumVar = sObj && sObj.lat != null && sObj.lon != null;
    const yukDis = i === 0   ? "disabled style=\"opacity:.35;cursor:not-allowed\"" : "";
    const asaDis = i === son ? "disabled style=\"opacity:.35;cursor:not-allowed\"" : "";
    let konumBtn = "";
    if (sObj) {
      konumBtn = konumVar
        ? `<button class="btn btn-sm" title="Konum kayıtlı (${sObj.lat.toFixed(4)}, ${sObj.lon.toFixed(4)}) — silmek için tıkla" onclick="santiyeKonumSil('${esc(sObj.id)}','${esc(ad)}')" style="color:#16a34a">📍</button>`
        : `<button class="btn btn-sm" title="Konum ekle (cihaz konumu alınır)" onclick="havaKonumAl('${esc(ad)}',this)" style="opacity:.5">📍</button>`;
    }
    return `<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--card2);border:1px solid var(--border);border-radius:10px">
      <span id="san-text-${i}" style="flex:1;font-size:14px">${esc(ad)}</span>
      <input id="san-input-${i}" class="form-input" value="${esc(ad)}" style="flex:1;height:32px;font-size:13px;display:none">
      ${konumBtn}
      <button class="btn btn-sm" title="Yukarı taşı" onclick="santiyeYukari(${i})" ${yukDis}>↑</button>
      <button class="btn btn-sm" title="Aşağı taşı" onclick="santiyeAsagi(${i})" ${asaDis}>↓</button>
      <button class="btn btn-sm" title="Adı düzenle" onclick="santiyeDuzenle(${i})">✎</button>
      <button class="btn btn-sm btn-primary" id="san-kaydet-${i}" onclick="santiyeKaydet(${i})" style="display:none">✓</button>
      <button class="btn btn-sm btn-danger" title="Sil" onclick="santiyeSil(${i})">🗑</button>
    </div>`;
  }).join("");
}

window.santiyeKonumSil = async (id, ad) => {
  if (isMisafir()) { toast("Misafir konum silemez", "warn"); return; }
  if (!confirm(`"${ad}" şantiyesinin konumu silinsin mi?\n\nKonum tekrar eklenmek istenirse cihazın bulunduğu yerden alınır.`)) return;
  try {
    await dbPatch("santiyeler", `id=eq.${encodeURIComponent(id)}`, { lat: null, lon: null });
    const sObj = app.santiyeler.find((s) => typeof s === "object" && s.id === id);
    if (sObj) { sObj.lat = null; sObj.lon = null; }
    if (app.havaDurumu) delete app.havaDurumu[ad];
    toast("Konum silindi", "ok");
    renderAyarlar();
    renderSantiyeler();
  } catch (e) {
    toast("Silinemedi: " + e.message, "err");
  }
};

async function _siralamaYaz(idx1, idx2) {
  // İki şantiyenin sort_order'ını swap et
  const a = app.santiyeler[idx1];
  const b = app.santiyeler[idx2];
  if (!a || !b) return;
  const adA = typeof a === "object" ? a.name : a;
  const adB = typeof b === "object" ? b.name : b;
  const idA = typeof a === "object" ? a.id   : null;
  const idB = typeof b === "object" ? b.id   : null;
  // sort_order'ı index'e bağlamayalım (eski kayıtlarda boş olabilir).
  // Sadece swap edip iki güncelleme atalım.
  try {
    const setA = { sort_order: idx2 };
    const setB = { sort_order: idx1 };
    if (idA) await dbPatch("santiyeler", `id=eq.${idA}`, setA);
    else     await dbPatch("santiyeler", `name=eq.${encodeURIComponent(adA)}`, setA);
    if (idB) await dbPatch("santiyeler", `id=eq.${idB}`, setB);
    else     await dbPatch("santiyeler", `name=eq.${encodeURIComponent(adB)}`, setB);
    // Local swap
    app.santiyeler[idx1] = b;
    app.santiyeler[idx2] = a;
    renderAyarlar();
    renderSantiyeler();
  } catch (e) {
    el("ayarlar-status").textContent = "Sıralanamadı: " + e.message;
    toast("Sıralanamadı: " + e.message, "err");
  }
}

window.santiyeYukari = (i) => {
  if (isMisafir()) { toast("Misafir sıralayamaz", "warn"); return; }
  if (i <= 0) return;
  _siralamaYaz(i, i - 1);
};

window.santiyeAsagi = (i) => {
  if (isMisafir()) { toast("Misafir sıralayamaz", "warn"); return; }
  if (i >= app.santiyeler.length - 1) return;
  _siralamaYaz(i, i + 1);
};

window.santiyeDuzenle = (i) => {
  el(`san-text-${i}`).style.display = "none";
  el(`san-input-${i}`).style.display = "block";
  el(`san-kaydet-${i}`).style.display = "block";
  el(`san-input-${i}`).focus();
};

window.santiyeKaydet = async (i) => {
  if (isMisafir()) { toast("Misafir şantiye düzenleyemez", "warn"); return; }
  const s = app.santiyeler[i];
  const eskiAd = typeof s === "object" ? s.name : s;
  const id     = typeof s === "object" ? s.id   : null;
  const yeniAd = el(`san-input-${i}`)?.value.trim();
  if (!yeniAd || yeniAd === eskiAd) { renderAyarlar(); return; }
  try {
    if (id) await dbPatch("santiyeler", `id=eq.${id}`, { name: yeniAd });
    else    await dbPatch("santiyeler", `name=eq.${encodeURIComponent(eskiAd)}`, { name: yeniAd });
    app.santiyeler[i] = { id, name: yeniAd };
    el("ayarlar-status").textContent = "";
    toast("Güncellendi", "ok");
    renderAyarlar();
    renderSantiyeler();
  } catch (e) {
    el("ayarlar-status").textContent = "Güncellenemedi: " + e.message;
    toast("Hata: " + e.message, "err");
  }
};

window.santiyeEkle = async (yeniAd) => {
  if (isMisafir()) { toast("Misafir şantiye ekleyemez", "warn"); return; }
  // Parametre verilmediyse eski input'tan oku (geriye uyumluluk)
  const ad = (yeniAd ?? el("ayarlar-santiye-input")?.value ?? "").trim();
  if (!ad) { toast("Şantiye adı boş olamaz", "warn"); return; }
  try {
    const res = await dbPost("santiyeler", { name: ad, active: true, sort_order: app.santiyeler.length, bolge: app.bolge || "İskele" });
    app.santiyeler.push({ id: res[0]?.id, name: ad });
    const input = el("ayarlar-santiye-input");
    if (input) input.value = "";
    const status = el("ayarlar-status");
    if (status) status.textContent = "";
    toast('"' + ad + '" eklendi', "ok");
    renderAyarlar();
    renderSantiyeler();
  } catch (e) {
    const status = el("ayarlar-status");
    if (status) status.textContent = "Eklenemedi: " + e.message;
    toast("Eklenemedi: " + e.message, "err");
  }
};

window.santiyeEkleSor = () => {
  if (isMisafir()) { toast("Misafir şantiye ekleyemez", "warn"); return; }
  const ad = (prompt("Yeni şantiye adı:") || "").trim();
  if (!ad) return;
  window.santiyeEkle(ad);
};

window.santiyeSil = async (i) => {
  if (isMisafir()) { toast("Misafir şantiye silemez", "warn"); return; }
  const s  = app.santiyeler[i];
  const ad = typeof s === "object" ? s.name : s;
  const id = typeof s === "object" ? s.id   : null;
  if (!confirm(`"${ad}" silinsin mi?`)) return;
  try {
    if (id) await dbDelete("santiyeler", `id=eq.${id}`);
    else    await dbDelete("santiyeler", `name=eq.${encodeURIComponent(ad)}`);
    app.santiyeler.splice(i, 1);
    toast("Silindi", "ok");
    renderAyarlar();
    renderSantiyeler();
  } catch (e) {
    el("ayarlar-status").textContent = "Silinemedi: " + e.message;
    toast("Silinemedi: " + e.message, "err");
  }
};

window.hakkindaAc = () => { const m = el("hakkinda-modal"); if (m) m.style.display = "flex"; };
window.hakkindaKapat = () => { const m = el("hakkinda-modal"); if (m) m.style.display = "none"; };

// ── Personel tab ──────────────────────────────────────────────────────────

let _personelDuzenlenen = null; // edit modunda olan personel id'si

function renderPersonel() {
  const list = el("ayarlar-personel-list");
  if (!list) return;
  if (isMisafir()) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><div class="empty-title">Yetkisiz</div></div>';
    return;
  }
  const personeller = app.personellerFull || [];
  if (!personeller.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">👷</div><div class="empty-title">Personel yok</div><div class="empty-desc">Yukarıdan ilk personeli ekleyin.</div></div>';
    return;
  }
  const son = personeller.length - 1;
  list.innerHTML = personeller.map((p, i) => {
    const editing = _personelDuzenlenen === p.id;
    const yukDis = i === 0   ? "disabled style=\"opacity:.35;cursor:not-allowed\"" : "";
    const asaDis = i === son ? "disabled style=\"opacity:.35;cursor:not-allowed\"" : "";
    if (editing) {
      return `<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:#fef9c3;border:1px solid var(--border);border-radius:10px">
        <input class="form-input" id="per-input-${esc(p.id)}" value="${esc(p.name)}" style="flex:1;height:32px;font-size:13px" autofocus
          onkeydown="if(event.key==='Enter') personelKaydet('${esc(p.id)}'); else if(event.key==='Escape') personelDuzenleIptal();">
        <button class="btn btn-sm btn-primary" onclick="personelKaydet('${esc(p.id)}')">✓</button>
        <button class="btn btn-sm" onclick="personelDuzenleIptal()">×</button>
      </div>`;
    }
    return `<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--card2);border:1px solid var(--border);border-radius:10px">
      <span style="flex:1;font-size:14px">${esc(p.name)}</span>
      <button class="btn btn-sm" title="Yukarı" onclick="personelYukari(${i})" ${yukDis}>↑</button>
      <button class="btn btn-sm" title="Aşağı" onclick="personelAsagi(${i})" ${asaDis}>↓</button>
      <button class="btn btn-sm" title="Düzenle" onclick="personelDuzenleAc('${esc(p.id)}')">✎</button>
      <button class="btn btn-sm btn-danger" title="Sil" onclick="personelSil('${esc(p.id)}')">🗑</button>
    </div>`;
  }).join("");
}

window.personelEkle = async () => {
  if (isMisafir()) { toast("Misafir personel ekleyemez", "warn"); return; }
  const input = el("personel-yeni-input");
  const ad = (input?.value || "").trim();
  if (!ad) { toast("Personel adı boş olamaz", "warn"); return; }
  try {
    const res = await dbPost("personeller", {
      name: ad,
      active: true,
      sort_order: (app.personellerFull || []).length,
      bolge: app.bolge || "İskele",
    });
    const yeni = { id: res[0]?.id, name: ad };
    (app.personellerFull ||= []).push(yeni);
    (app.personeller    ||= []).push(ad);
    if (input) input.value = "";
    toast('"' + ad + '" eklendi', "ok");
    renderPersonel();
  } catch (e) {
    toast("Eklenemedi: " + e.message, "err");
  }
};

window.personelDuzenleAc = (id) => {
  if (isMisafir()) return;
  _personelDuzenlenen = id;
  renderPersonel();
};

window.personelDuzenleIptal = () => {
  _personelDuzenlenen = null;
  renderPersonel();
};

window.personelKaydet = async (id) => {
  if (isMisafir()) return;
  const yeniAd = (el(`per-input-${id}`)?.value || "").trim();
  if (!yeniAd) { toast("Ad boş olamaz", "warn"); return; }
  const p = (app.personellerFull || []).find((x) => x.id === id);
  if (!p) return;
  if (yeniAd === p.name) { _personelDuzenlenen = null; renderPersonel(); return; }
  try {
    await dbPatch("personeller", `id=eq.${encodeURIComponent(id)}`, { name: yeniAd });
    const eskiAd = p.name;
    p.name = yeniAd;
    // app.personeller (string array) eski ad'ı yenisiyle değiştir
    const idx = (app.personeller || []).indexOf(eskiAd);
    if (idx >= 0) app.personeller[idx] = yeniAd;
    _personelDuzenlenen = null;
    toast("Güncellendi", "ok");
    renderPersonel();
  } catch (e) {
    toast("Güncellenemedi: " + e.message, "err");
  }
};

window.personelSil = async (id) => {
  if (isMisafir()) return;
  const p = (app.personellerFull || []).find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`"${p.name}" silinsin mi?`)) return;
  try {
    await dbDelete("personeller", `id=eq.${encodeURIComponent(id)}`);
    app.personellerFull = (app.personellerFull || []).filter((x) => x.id !== id);
    app.personeller     = (app.personeller     || []).filter((n) => n !== p.name);
    toast("Silindi", "ok");
    renderPersonel();
  } catch (e) {
    toast("Silinemedi: " + e.message, "err");
  }
};

async function _personelSwap(idx1, idx2) {
  const a = app.personellerFull[idx1];
  const b = app.personellerFull[idx2];
  if (!a || !b) return;
  try {
    await dbPatch("personeller", `id=eq.${encodeURIComponent(a.id)}`, { sort_order: idx2 });
    await dbPatch("personeller", `id=eq.${encodeURIComponent(b.id)}`, { sort_order: idx1 });
    app.personellerFull[idx1] = b;
    app.personellerFull[idx2] = a;
    // String array'i de yeniden senkronize et
    app.personeller = app.personellerFull.map((x) => x.name);
    renderPersonel();
  } catch (e) {
    toast("Sıralanamadı: " + e.message, "err");
  }
}

window.personelYukari = (i) => {
  if (isMisafir()) return;
  if (i <= 0) return;
  _personelSwap(i, i - 1);
};

window.personelAsagi = (i) => {
  if (isMisafir()) return;
  if (i >= (app.personellerFull || []).length - 1) return;
  _personelSwap(i, i + 1);
};

// ── Malzemeler tab ────────────────────────────────────────────────────────

let _malzemeDuzenlenen = null; // edit modunda olan malzeme id'si

function renderMalzemeler() {
  const list = el("ayarlar-malzeme-list");
  if (!list) return;
  if (isMisafir()) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><div class="empty-title">Yetkisiz</div></div>';
    return;
  }
  const malzemeler = app.malzemelerFull || [];
  if (!malzemeler.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📦</div><div class="empty-title">Malzeme yok</div><div class="empty-desc">Yukarıdan ilk malzemeyi ekleyin.</div></div>';
    return;
  }
  const son = malzemeler.length - 1;
  list.innerHTML = malzemeler.map((m, i) => {
    const editing = _malzemeDuzenlenen === m.id;
    const yukDis = i === 0   ? "disabled style=\"opacity:.35;cursor:not-allowed\"" : "";
    const asaDis = i === son ? "disabled style=\"opacity:.35;cursor:not-allowed\"" : "";
    if (editing) {
      return `<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:#fef9c3;border:1px solid var(--border);border-radius:10px;flex-wrap:wrap">
        <input class="form-input" id="mal-ad-${esc(m.id)}" value="${esc(m.name)}" style="flex:2;min-width:140px;height:32px;font-size:13px" autofocus
          onkeydown="if(event.key==='Enter') malzemeKaydet('${esc(m.id)}'); else if(event.key==='Escape') malzemeDuzenleIptal();">
        <input class="form-input" id="mal-birim-${esc(m.id)}" list="ayarlar-birim-onerileri" value="${esc(m.birim || "")}" placeholder="Birim..." style="flex:1;min-width:80px;height:32px;font-size:13px"
          onkeydown="if(event.key==='Enter') malzemeKaydet('${esc(m.id)}'); else if(event.key==='Escape') malzemeDuzenleIptal();">
        <button class="btn btn-sm btn-primary" onclick="malzemeKaydet('${esc(m.id)}')">✓</button>
        <button class="btn btn-sm" onclick="malzemeDuzenleIptal()">×</button>
      </div>`;
    }
    return `<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--card2);border:1px solid var(--border);border-radius:10px">
      <span style="flex:2;min-width:0;font-size:14px">${esc(m.name)}</span>
      <span style="flex:1;min-width:60px;font-size:12px;color:var(--muted)">${esc(m.birim || "—")}</span>
      <button class="btn btn-sm" title="Yukarı" onclick="malzemeYukari(${i})" ${yukDis}>↑</button>
      <button class="btn btn-sm" title="Aşağı" onclick="malzemeAsagi(${i})" ${asaDis}>↓</button>
      <button class="btn btn-sm" title="Düzenle" onclick="malzemeDuzenleAc('${esc(m.id)}')">✎</button>
      <button class="btn btn-sm btn-danger" title="Sil" onclick="malzemeSil('${esc(m.id)}')">🗑</button>
    </div>`;
  }).join("");
}

window.malzemeEkle = async () => {
  if (isMisafir()) { toast("Misafir malzeme ekleyemez", "warn"); return; }
  const adInp    = el("malzeme-yeni-ad");
  const birimInp = el("malzeme-yeni-birim");
  const ad    = (adInp?.value    || "").trim();
  const birim = (birimInp?.value || "").trim();
  if (!ad)    { toast("Malzeme adı boş olamaz", "warn"); return; }
  if (!birim) { toast("Birim boş olamaz", "warn"); return; }
  try {
    const res = await dbPost("malzemeler", {
      name: ad,
      birim,
      active: true,
      sort_order: (app.malzemelerFull || []).length,
    });
    const yeni = { id: res[0]?.id, name: ad, birim };
    (app.malzemelerFull ||= []).push(yeni);
    (app.malzemeler     ||= []).push(ad);
    if (adInp) adInp.value = "";
    if (birimInp) birimInp.value = "";
    toast('"' + ad + '" eklendi', "ok");
    renderMalzemeler();
  } catch (e) {
    toast("Eklenemedi: " + e.message, "err");
  }
};

window.malzemeDuzenleAc = (id) => {
  if (isMisafir()) return;
  _malzemeDuzenlenen = id;
  renderMalzemeler();
};

window.malzemeDuzenleIptal = () => {
  _malzemeDuzenlenen = null;
  renderMalzemeler();
};

window.malzemeKaydet = async (id) => {
  if (isMisafir()) return;
  const yeniAd    = (el(`mal-ad-${id}`)?.value    || "").trim();
  const yeniBirim = (el(`mal-birim-${id}`)?.value || "").trim();
  if (!yeniAd)    { toast("Ad boş olamaz", "warn"); return; }
  if (!yeniBirim) { toast("Birim boş olamaz", "warn"); return; }
  const m = (app.malzemelerFull || []).find((x) => x.id === id);
  if (!m) return;
  if (yeniAd === m.name && yeniBirim === (m.birim || "")) {
    _malzemeDuzenlenen = null; renderMalzemeler(); return;
  }
  try {
    await dbPatch("malzemeler", `id=eq.${encodeURIComponent(id)}`, { name: yeniAd, birim: yeniBirim });
    const eskiAd = m.name;
    m.name  = yeniAd;
    m.birim = yeniBirim;
    const idx = (app.malzemeler || []).indexOf(eskiAd);
    if (idx >= 0) app.malzemeler[idx] = yeniAd;
    _malzemeDuzenlenen = null;
    toast("Güncellendi", "ok");
    renderMalzemeler();
  } catch (e) {
    toast("Güncellenemedi: " + e.message, "err");
  }
};

window.malzemeSil = async (id) => {
  if (isMisafir()) return;
  const m = (app.malzemelerFull || []).find((x) => x.id === id);
  if (!m) return;
  if (!confirm(`"${m.name}" silinsin mi?`)) return;
  try {
    await dbDelete("malzemeler", `id=eq.${encodeURIComponent(id)}`);
    app.malzemelerFull = (app.malzemelerFull || []).filter((x) => x.id !== id);
    app.malzemeler     = (app.malzemeler     || []).filter((n) => n !== m.name);
    toast("Silindi", "ok");
    renderMalzemeler();
  } catch (e) {
    toast("Silinemedi: " + e.message, "err");
  }
};

async function _malzemeSwap(idx1, idx2) {
  const a = app.malzemelerFull[idx1];
  const b = app.malzemelerFull[idx2];
  if (!a || !b) return;
  try {
    await dbPatch("malzemeler", `id=eq.${encodeURIComponent(a.id)}`, { sort_order: idx2 });
    await dbPatch("malzemeler", `id=eq.${encodeURIComponent(b.id)}`, { sort_order: idx1 });
    app.malzemelerFull[idx1] = b;
    app.malzemelerFull[idx2] = a;
    app.malzemeler = app.malzemelerFull.map((x) => x.name);
    renderMalzemeler();
  } catch (e) {
    toast("Sıralanamadı: " + e.message, "err");
  }
}

window.malzemeYukari = (i) => {
  if (isMisafir()) return;
  if (i <= 0) return;
  _malzemeSwap(i, i - 1);
};

window.malzemeAsagi = (i) => {
  if (isMisafir()) return;
  if (i >= (app.malzemelerFull || []).length - 1) return;
  _malzemeSwap(i, i + 1);
};

registerRender("ayarlar", renderAyarlar);
