// utils.js — Genel yardımcı fonksiyonlar ve toast

// DOM yardımcıları
export const el = (id) => document.getElementById(id);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const badgeCls = (d) =>
  d === "Tamamlandı" ? "badge-done" : d === "Devam Ediyor" ? "badge-progress" : "badge-wait";

export const parseNum = (v) => {
  const n = parseFloat(String(v || "").replace(",", "."));
  return isFinite(n) ? n : null;
};

export const tarihFmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};

export const tarihKisa = (d) => {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  const bugun = new Date();
  if (date.toDateString() === bugun.toDateString())
    return "Bugün " + date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const dun = new Date(bugun);
  dun.setDate(dun.getDate() - 1);
  if (date.toDateString() === dun.toDateString())
    return "Dün " + date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("tr-TR");
};

export const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export function asamaOzet(a) {
  const p = [];
  if (a.malzeme) p.push(a.malzeme);
  if (a.durum && a.durum !== "Beklemede") p.push(a.durum);
  if (a.personeller?.length) p.push(a.personeller.length + " kişi");
  if (a.fotograflar?.length) p.push(a.fotograflar.length + " foto");
  return p.join(" · ") || "Detay girilmedi";
}

export function veriVarMi(a) {
  return !!(a.malzeme || a.not || a.metraj || (a.personeller && a.personeller.length));
}

export function gDurum() {} // legacy no-op

// ── Toast bildirimi ──────────────────────────────────────────────────────────
export function toast(msg, tip = "ok", sure = 3500) {
  const host = el("toast-host");
  if (!host) return;
  const icons = { ok: "✓", err: "✕", warn: "⚠", info: "ℹ" };
  const t = document.createElement("div");
  t.className = "toast " + tip;
  t.innerHTML = `<span class="toast-icon">${icons[tip] || "ℹ"}</span><span class="toast-msg">${esc(msg)}</span><button class="toast-close" aria-label="Kapat">✕</button>`;
  t.querySelector(".toast-close").onclick = () => t.remove();
  host.appendChild(t);
  setTimeout(() => t.remove(), sure);
}

export function toggleClear(id, val) {
  const c = document.getElementById(id);
  if (c) c.classList.toggle("show", !!val);
}

export function clearAra(inId, clrId, cb) {
  const inp = el(inId);
  if (inp) { inp.value = ""; toggleClear(clrId, false); cb(""); }
}
