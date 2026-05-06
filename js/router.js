// router.js — View geçişleri, URL routing, popstate

import { app } from "./state.js";
import { el } from "./utils.js";

// View render fonksiyonları burada kayıt edilir (circular dep olmadan)
const _renders = {};
export function registerRender(name, fn) { _renders[name] = fn; }

// isMisafir auth.js'ten geç yüklenir; burada wrapper kullanıyoruz
let _isMisafir = () => false;
export function setIsMisafir(fn) { _isMisafir = fn; }

export function tabGec(view, pushHistory = true) {
  ["view-projects", "view-detail", "view-log", "view-ayarlar", "view-dashboard", "view-stok"]
    .forEach((id) => el(id)?.classList.add("hidden"));
  app.aktifView = view;
  const bolgeTag = app.bolge ? ` [${app.bolge}]` : "";
  const btnNewRecord = el("btn-new-record");
  const fab = el("fab-add");
  if (fab) fab.style.display = "";

  if (view === "projects") {
    el("view-projects").classList.remove("hidden");
    document.title = "Şantiye İş Takip" + bolgeTag;
    if (pushHistory) history.pushState({ view }, "", "/");
    if (fab) fab.style.display = "none";
  } else if (view === "detail") {
    el("view-detail").classList.remove("hidden");
    const ad = app.secilenSantiye || "";
    document.title = ad + " | Şantiye Takip" + bolgeTag;
    if (pushHistory) history.pushState({ view, santiye: ad }, "", "/santiye/" + encodeURIComponent(ad));
    if (btnNewRecord) btnNewRecord.style.display = _isMisafir() ? "none" : "";
    if (fab) fab.style.display = _isMisafir() ? "none" : "";
  } else if (view === "log") {
    el("view-log").classList.remove("hidden");
    document.title = "Log | Şantiye Takip" + bolgeTag;
    if (pushHistory) history.pushState({ view }, "", "/log");
    _renders.log?.();
    if (fab) fab.style.display = "none";
  } else if (view === "ayarlar") {
    el("view-ayarlar").classList.remove("hidden");
    document.title = "Ayarlar | Şantiye Takip" + bolgeTag;
    if (pushHistory) history.pushState({ view }, "", "/ayarlar");
    _renders.ayarlar?.();
    if (fab) fab.style.display = "none";
  } else if (view === "dashboard") {
    el("view-dashboard").classList.remove("hidden");
    document.title = "Dashboard | Şantiye Takip" + bolgeTag;
    if (pushHistory) history.pushState({ view }, "", "/dashboard");
    _renders.dashboard?.();
    if (fab) fab.style.display = "none";
  } else if (view === "stok") {
    el("view-stok").classList.remove("hidden");
    document.title = "Stok | Şantiye Takip" + bolgeTag;
    if (pushHistory) history.pushState({ view }, "", "/stok");
    _renders.stok?.();
    if (fab) fab.style.display = "none";
  }

  document.querySelectorAll(".bn-btn").forEach((b) => {
    b.classList.toggle("active",
      b.dataset.view === view || (view === "detail" && b.dataset.view === "projects"));
  });
}

window.bnGo = (view) => {
  if (view === "ayarlar" && _isMisafir()) {
    import("./utils.js").then(({ toast }) => toast("Misafirler ayarları görüntüleyemez", "warn"));
    return;
  }
  if (view === "projects") {
    app.secilenSantiye = null;
    tabGec("projects");
    _renders.projects?.();
    return;
  }
  tabGec(view);
};

// Popstate (geri/ileri tuşu)
window.addEventListener("popstate", async (e) => {
  const state = e.state;
  if (!state) {
    app.secilenSantiye = null;
    tabGec("projects", false);
    _renders.projects?.();
    return;
  }
  if (state.view === "projects") {
    app.secilenSantiye = null;
    tabGec("projects", false);
    _renders.projects?.();
  } else if (state.view === "detail" && state.santiye) {
    app.secilenSantiye = state.santiye;
    tabGec("detail", false);
    _renders.detail?.();
  } else if (state.view === "log") {
    tabGec("log", false);
  } else if (state.view === "ayarlar") {
    tabGec("ayarlar", false);
  } else if (state.view === "dashboard") {
    tabGec("dashboard", false);
  } else if (state.view === "stok") {
    tabGec("stok", false);
  }
});
