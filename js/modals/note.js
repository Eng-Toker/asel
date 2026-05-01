// modals/note.js — Şantiye notları modal

import { app } from "../state.js";
import { el, toast } from "../utils.js";
import { isMisafir } from "../auth.js";
import { dbGet, dbPatch, dbPost, dbDelete } from "../db.js";

window.notModalAc = () => {
  if (!app.secilenSantiye) return;
  if (isMisafir()) { toast("Misafirler not düzenleyemez", "warn"); return; }
  el("not-modal-title").textContent = app.secilenSantiye;
  el("not-textarea").value = app.notlar[app.secilenSantiye] || "";
  el("not-status").textContent = "";
  el("not-modal-overlay").classList.add("open");
  setTimeout(() => el("not-textarea").focus(), 100);
};

window.notModalKapat = () => {
  el("not-modal-overlay").classList.remove("open");
};

window.notKaydet = async () => {
  const metin   = el("not-textarea").value.trim();
  const santiye = app.secilenSantiye;
  el("not-status").textContent = "Kaydediliyor...";
  el("not-status").className = "status";
  try {
    const bolgeQ = app.bolge ? `&bolge=eq.${encodeURIComponent(app.bolge)}` : "";
    const mevcut = await dbGet("santiye_notlar", `select=id&santiye=eq.${encodeURIComponent(santiye)}${bolgeQ}`).catch(() => []);
    if (mevcut.length) {
      if (metin) await dbPatch("santiye_notlar", `santiye=eq.${encodeURIComponent(santiye)}${bolgeQ}`, { not_metni: metin, updated_at: new Date().toISOString() });
      else       await dbDelete("santiye_notlar", `santiye=eq.${encodeURIComponent(santiye)}${bolgeQ}`);
    } else if (metin) {
      await dbPost("santiye_notlar", { santiye, not_metni: metin, bolge: app.bolge || "İskele" });
    }
    app.notlar[santiye] = metin || undefined;
    el("stat-notlar-preview").textContent = metin || "Not yok";
    window.notModalKapat();
    toast(metin ? "Not kaydedildi" : "Not silindi", "ok");
  } catch (err) {
    el("not-status").textContent = err.message || "Kaydedilemedi.";
    el("not-status").className = "status err";
    toast("Kaydedilemedi: " + (err.message || ""), "err");
  }
};

el("not-modal-overlay").addEventListener("click", (e) => {
  if (e.target === el("not-modal-overlay")) window.notModalKapat();
});
