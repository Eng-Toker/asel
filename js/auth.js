// auth.js — Login, logout, misafir modu, bölge seçimi, session timeout
// Bağımlılıklar: config.js, utils.js, state.js, router.js
// (data.js, realtime.js, views/projects.js çalışma zamanında çözülür)

import { SB, KEY, H } from "./config.js";
import { app } from "./state.js";
import { el, toast } from "./utils.js";
import { tabGec, setIsMisafir } from "./router.js";

const KULLANICI_ADLARI = {
  "abdulrahman@asel.com": "Abdulrahman",
  "deniz@asel.com": "Deniz",
};

let _oturum = null;

export function oturumYukle() { return _oturum; }
export const isMisafir = () => _oturum?.rol === "guest";
export const isAdmin   = () => _oturum?.rol === "admin";

// router.js'e isMisafir fonksiyonunu bildir
setIsMisafir(isMisafir);

async function supabaseGiris(email, sifre) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: sifre }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.msg || "Giriş başarısız.");
  return d;
}

async function supabaseCikis(accessToken) {
  await fetch(`${SB}/auth/v1/logout`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: "Bearer " + accessToken },
  }).catch(() => {});
}

function tokenliHeader(accessToken) {
  return { apikey: KEY, Authorization: "Bearer " + accessToken, "Content-Type": "application/json" };
}

export function rolGoster() {
  const ov = el("loading-overlay");
  if (ov) ov.style.display = "none";
  const o = oturumYukle();
  if (!o) return;
  const text = o.rol === "guest" ? "👁 Misafir" : "✏ " + o.ad;
  const cls  = "role-badge " + (o.rol === "guest" ? "guest" : "admin");
  ["topbar-role", "topbar-role-m"].forEach((id) => {
    const b = el(id);
    if (b) { b.textContent = text; b.className = cls; }
  });
  const ayarlarBtn = el("btn-ayarlar");
  if (ayarlarBtn) ayarlarBtn.style.display = o.rol === "guest" ? "none" : "";
  const hint    = el("notlar-tikla-hint");
  const notCard = el("stat-notlar-card");
  if (hint)    hint.textContent       = o.rol === "guest" ? "" : "● Tıkla";
  if (notCard) notCard.style.cursor   = o.rol === "guest" ? "default" : "pointer";
}

window.girisYap = async () => {
  const email = el("login-user")?.value.trim();
  const sifre = el("login-pass")?.value;
  el("login-err").textContent = "";
  if (!email || !sifre) { el("login-err").textContent = "E-posta ve şifre zorunludur."; return; }
  const btn = el("btn-giris");
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Giriş yapılıyor...'; }
  try {
    const data = await supabaseGiris(email, sifre);
    const ad = KULLANICI_ADLARI[email] || email.split("@")[0];
    _oturum = { email, ad, rol: "admin", token: data.access_token };
    Object.assign(H, tokenliHeader(data.access_token));
    el("login-screen").style.display = "none";
    el("bolge-screen").style.display = "flex";
  } catch (err) {
    el("login-err").textContent =
      err.message.includes("Invalid") || err.message.includes("credentials")
        ? "E-posta veya şifre hatalı."
        : err.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Giriş Yap"; }
  }
};

window.misafirGiris = () => {
  const sifre = el("misafir-pass")?.value;
  if (sifre !== "ASEL2026") { const e = el("login-err"); if (e) e.textContent = "Misafir şifresi hatalı."; return; }
  _oturum = { email: "guest", ad: "Misafir", rol: "guest", token: null };
  el("login-screen").style.display = "none";
  el("bolge-screen").style.display = "flex";
};

window.bolgeSec = async (bolge) => {
  // Çalışma zamanı importları (circular dep'ten kaçınmak için)
  const { veriYukle }        = await import("./data.js");
  const { renderSantiyeler, tumHavaYenile, havaTimerBaslat } = await import("./views/projects.js");
  const { realtimeBaslat }   = await import("./realtime.js");

  app.bolge = bolge;
  el("bolge-screen").style.display = "none";
  const text = "📍 " + bolge;
  ["bolge-badge", "bolge-badge-m"].forEach((id) => {
    const b = el(id);
    if (b) { b.innerHTML = text + ' <span style="font-size:9px;opacity:.7;margin-left:2px">▼</span>'; b.style.display = ""; }
  });
  const eb = el("eyebrow-bolge");
  if (eb) eb.textContent = bolge;
  await veriYukle();
  renderSantiyeler();
  rolGoster();
  realtimeBaslat();
  timeoutSifirla();
  toast(`${bolge} bölgesine giriş yapıldı`, "ok", 2000);
  tumHavaYenile().catch(() => {});
  havaTimerBaslat();
};

window.bolgeGeriDon = () => {
  import("./realtime.js").then(({ realtimeDurdur }) => realtimeDurdur());
  import("./views/projects.js").then(({ stopHavaTimer }) => stopHavaTimer());
  app.bolge = null;
  app.secilenSantiye = null;
  app.kayitlar = [];
  app.logSatirlar = [];
  app.notlar = {};
  el("bolge-screen").style.display = "flex";
  tabGec("projects", false);
};

window.cikisYap = async () => {
  const { realtimeDurdur } = await import("./realtime.js");
  realtimeDurdur();
  if (_oturum?.token) await supabaseCikis(_oturum.token);
  _oturum = null;
  Object.assign(H, { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" });
  location.reload();
};

// ── Session timeout (5 dk) ────────────────────────────────────────────────────
let _timeoutId = null;
const SESSION_SURE = 5 * 60 * 1000;

export function timeoutSifirla() {
  clearTimeout(_timeoutId);
  if (!_oturum) return;
  _timeoutId = setTimeout(() => {
    toast("Oturum süresi doldu", "warn");
    window.cikisYap();
  }, SESSION_SURE);
}

["click", "keydown", "touchstart"].forEach((ev) =>
  document.addEventListener(ev, () => { if (_oturum) timeoutSifirla(); }, { passive: true }),
);

document.addEventListener("keydown", (e) => {
  if (el("login-screen")?.style.display !== "none" && e.key === "Enter")
    window.girisYap();
});
