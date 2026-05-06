/*!
 * Şantiye İş Takip
 * Copyright © 2025-2026 Ali Deniz Toker. Tüm hakları saklıdır. All rights reserved.
 *
 * PROPRIETARY SOFTWARE — bu yazılımın kaynak kodu kişisel mülkiyettir.
 * Yazılı izin olmaksızın kopyalanması, çoğaltılması, dağıtılması veya türev
 * eser oluşturulması yasaktır. ASEL Engineering'e yalnızca bedelsiz kullanım
 * hakkı (license to use) verilmiştir; mülkiyet devri yapılmamıştır.
 *
 * Detaylı lisans: bkz. LICENSE
 * İletişim: eng.adtoker@gmail.com
 */

// main.js — Uygulama giriş noktası

import "./config.js";
import "./state.js";
import "./db.js";
import "./utils.js";
import "./router.js";
import "./auth.js";
import "./data.js";
import "./realtime.js";
import "./photo.js";
import "./lightbox.js";
import "./export.js";
import "./views/projects.js";
import "./views/detail.js";
import "./views/log.js";
import "./views/ayarlar.js";
import "./views/dashboard.js";
import "./views/stok.js";
import "./views/harita.js";
import "./modals/record.js";
import "./modals/note.js";
import "./modals/rapor.js";
import "./modals/stok-santiye.js";

import { el, toggleClear, clearAra } from "./utils.js";
import { app } from "./state.js";
import { tabGec, registerRender } from "./router.js";
import { renderSantiyeler } from "./views/projects.js";
import { renderDetay } from "./views/detail.js";
import { veriYukle } from "./data.js";
import { renderLog } from "./views/log.js";
import { havaTipKapat } from "./views/projects.js";
import { lbKapat } from "./lightbox.js";

// Inline onclick/oninput handler'larının erişmesi için window'a aç
window.el                = el;
window.app               = app;
window.tabGec            = tabGec;
window.renderDetay       = renderDetay;
window.renderSantiyeler  = renderSantiyeler;
window.toggleClear       = toggleClear;
window.clearAra          = clearAra;

// ── Render kayıtları (router'ın inline çağırması için) ────────────────────────
registerRender("projects", renderSantiyeler);
registerRender("detail",   renderDetay);

// ── Buton bağlamaları ─────────────────────────────────────────────────────────

el("btn-back").addEventListener("click", () => {
  app.secilenSantiye = null;
  tabGec("projects");
  renderSantiyeler();
});

el("btn-log-back").addEventListener("click", () => {
  if (app.secilenSantiye) { tabGec("detail"); renderDetay(); }
  else                    { tabGec("projects"); renderSantiyeler(); }
});

el("btn-stok-back")?.addEventListener("click", () => {
  if (app.secilenSantiye) { tabGec("detail"); renderDetay(); }
  else                    { tabGec("projects"); renderSantiyeler(); }
});

el("btn-harita-back")?.addEventListener("click", () => {
  if (app.secilenSantiye) { tabGec("detail"); renderDetay(); }
  else                    { tabGec("projects"); renderSantiyeler(); }
});

el("btn-log-yenile").addEventListener("click", async () => {
  await veriYukle();
  renderLog();
  import("./utils.js").then(({ toast }) => toast("Log yenilendi", "ok", 1500));
});

el("btn-new-record")?.addEventListener("click", () => window.yeniKayitAc());
el("btn-modal-close").addEventListener("click", () => window.modalKapat());
el("btn-cancel").addEventListener("click", () => window.modalKapat());
el("btn-save").addEventListener("click", () => window.kayitKaydet());
el("modal-overlay").addEventListener("click", (e) => { if (e.target === el("modal-overlay")) window.modalKapat(); });

// ── Klavye kısayolları ────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (el("modal-overlay").classList.contains("open"))     window.modalKapat();
    if (el("not-modal-overlay").classList.contains("open")) window.notModalKapat();
    if (el("rapor-modal")?.classList.contains("open"))      window.raporModalKapat();
    if (el("stok-santiye-modal-overlay")?.classList.contains("open")) window.stokSantiyeKapat?.();
    lbKapat();
    havaTipKapat();
  }
});

// ── Intro animasyonu ──────────────────────────────────────────────────────────

(function introBaslat() {
  const scr = document.getElementById("intro-screen");
  if (!scr) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scr.style.display = "none";
    return;
  }

  let bitti = false;
  function bitir() {
    if (bitti) return;
    bitti = true;
    setTimeout(() => {
      scr.classList.add("intro-out");
      setTimeout(() => { scr.style.display = "none"; }, 550);
      setTimeout(() => { document.getElementById("login-user")?.focus(); }, 700);
    }, 100);
  }

  window.introAtla = bitir;
  setTimeout(bitir, 3500);
  document.addEventListener("keydown", function onKey(e) {
    if (bitti) return;
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      bitir();
      document.removeEventListener("keydown", onKey);
    }
  });
})();
