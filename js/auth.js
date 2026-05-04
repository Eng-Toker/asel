// auth.js — Login, logout, misafir modu, bölge seçimi, session timeout
// Bağımlılıklar: config.js, utils.js, state.js, router.js
// (data.js, realtime.js, views/projects.js çalışma zamanında çözülür)

import { SB, KEY, H, DRIVE_URL } from "./config.js";
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
    // Token'ı önce H'a yaz — maskPII fetch'i bu header'ı kullanır.
    // _oturum atomik atanır: ad hesaplanmadan _oturum SET EDİLMEZ
    // (ara durumda "Admin" placeholder okunup DB'ye yazılma race'i önlenir).
    Object.assign(H, tokenliHeader(data.access_token));
    let ad = KULLANICI_ADLARI[email];
    if (!ad) {
      // B2 (S3=A — login REDDET): Map miss durumunda Worker /maskPII'ya
      // sor, BAŞARISIZ ise login engelle. "Admin" hard-mask collision riski
      // kabul edilmiyor (audit trail integrity). Yeni admin için:
      //   1. Supabase Auth'a kullanıcı ekle
      //   2. js/auth.js KULLANICI_ADLARI map'ine email→ad satırı ekle
      //   3. Worker secret PII_PEPPER set + binding deploy
      let masked;
      try {
        const { maskPII } = await import("./mask.js");
        masked = await maskPII(email);
      } catch {
        // Worker veya import erişilemez — H reset, login engelle.
        Object.assign(H, { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" });
        throw new Error("PII servisi erişilemez. Login engellendi — yöneticiyle iletişime geçin.");
      }
      if (typeof masked === "string" && masked.startsWith("pii:")) {
        ad = masked;
      } else {
        // /maskPII responded ama pepper yok / format hatalı → engelle.
        Object.assign(H, { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" });
        throw new Error("Bu kullanıcı için ad yapılandırılmamış. Yöneticiyle iletişim (KULLANICI_ADLARI map'ine eklenmeli).");
      }
    }
    _oturum = { email, ad, rol: "admin", token: data.access_token };
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

window.misafirGiris = async () => {
  const sifre = el("misafir-pass")?.value;
  const errEl = el("login-err");
  const btn = el("btn-misafir");
  if (errEl) errEl.textContent = "";
  if (!sifre) { if (errEl) errEl.textContent = "Misafir şifresi zorunludur."; return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Doğrulanıyor...'; }
  try {
    // P1-8: parola Worker'da PBKDF2 ile doğrulanır. Bundle'da plaintext yok.
    const r = await fetch(`${DRIVE_URL}/misafirLogin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: sifre }),
    });
    const ok = r.ok && (await r.json().catch(() => ({}))).ok === true;
    if (!ok) { if (errEl) errEl.textContent = "Misafir şifresi hatalı."; return; }
    _oturum = { email: "guest", ad: "Misafir", rol: "guest", token: null };
    el("login-screen").style.display = "none";
    el("bolge-screen").style.display = "flex";
  } catch {
    if (errEl) errEl.textContent = "Misafir doğrulaması başarısız. Bağlantınızı kontrol edin.";
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = "👁 Misafir Olarak Görüntüle"; }
  }
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
