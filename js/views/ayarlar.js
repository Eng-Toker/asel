// views/ayarlar.js — Şantiye yönetimi, hakkında modal

import { app } from "../state.js";
import { el, esc, toast } from "../utils.js";
import { isMisafir } from "../auth.js";
import { dbPatch, dbPost, dbDelete } from "../db.js";
import { registerRender } from "../router.js";
import { renderSantiyeler } from "./projects.js";

export function renderAyarlar() {
  const list = el("ayarlar-santiye-list");
  if (!list) return;
  if (isMisafir()) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><div class="empty-title">Yetkisiz</div><div class="empty-desc">Misafirler ayarlara erişemez.</div></div>';
    return;
  }
  if (!app.santiyeler.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📂</div><div class="empty-title">Şantiye yok</div><div class="empty-desc">Aşağıdan ilk şantiyenizi ekleyin.</div></div>';
    return;
  }
  list.innerHTML = app.santiyeler.map((s, i) => {
    const ad = typeof s === "object" ? s.name : s;
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--card2);border:1px solid var(--border);border-radius:10px">
      <span id="san-text-${i}" style="flex:1;font-size:14px">${esc(ad)}</span>
      <input id="san-input-${i}" class="form-input" value="${esc(ad)}" style="flex:1;height:32px;font-size:13px;display:none">
      <button class="btn btn-sm" onclick="santiyeDuzenle(${i})">✎</button>
      <button class="btn btn-sm btn-primary" id="san-kaydet-${i}" onclick="santiyeKaydet(${i})" style="display:none">✓</button>
      <button class="btn btn-sm btn-danger" onclick="santiyeSil(${i})">🗑</button>
    </div>`;
  }).join("");
}

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

window.santiyeEkle = async () => {
  if (isMisafir()) { toast("Misafir şantiye ekleyemez", "warn"); return; }
  const input = el("ayarlar-santiye-input");
  const ad = input?.value.trim();
  if (!ad) { toast("Şantiye adı boş olamaz", "warn"); return; }
  try {
    const res = await dbPost("santiyeler", { name: ad, active: true, sort_order: app.santiyeler.length, bolge: app.bolge || "İskele" });
    app.santiyeler.push({ id: res[0]?.id, name: ad });
    input.value = "";
    el("ayarlar-status").textContent = "";
    toast('"' + ad + '" eklendi', "ok");
    renderAyarlar();
    renderSantiyeler();
  } catch (e) {
    el("ayarlar-status").textContent = "Eklenemedi: " + e.message;
    toast("Eklenemedi: " + e.message, "err");
  }
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

registerRender("ayarlar", renderAyarlar);
