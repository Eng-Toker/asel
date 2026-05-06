// views/projects.js — Şantiye listesi, hava durumu

import { app } from "../state.js";
import { el, esc, toast } from "../utils.js";
import { isAdmin, isMisafir } from "../auth.js";
import { dbPatch } from "../db.js";

// ── Hava Durumu ───────────────────────────────────────────────────────────────

const WMO_EMOJI = (c) => {
  if (c === 0) return "☀️";
  if (c === 1 || c === 2) return "🌤";
  if (c === 3) return "☁️";
  if (c >= 45 && c <= 48) return "🌫";
  if (c >= 51 && c <= 67) return "🌧";
  if (c >= 71 && c <= 77) return "🌨";
  if (c >= 80 && c <= 82) return "🌦";
  if (c >= 95 && c <= 99) return "⛈";
  return "🌡";
};

const WMO_DURUM = (c) => {
  if (c === 0) return "Açık";
  if (c === 1) return "Az bulutlu";
  if (c === 2) return "Parçalı bulutlu";
  if (c === 3) return "Kapalı";
  if (c >= 45 && c <= 48) return "Sisli";
  if (c === 51 || c === 53 || c === 55) return "Çisenti";
  if (c === 61 || c === 63 || c === 65) return "Yağmurlu";
  if (c === 66 || c === 67) return "Donan yağmur";
  if (c >= 71 && c <= 77) return "Karlı";
  if (c >= 80 && c <= 82) return "Sağanak";
  if (c >= 95) return "Fırtına";
  return "—";
};

let _havaTimer = null;

function _havaApply(ad, c) {
  app.havaDurumu[ad] = {
    ikon: WMO_EMOJI(c.weathercode),
    durum: WMO_DURUM(c.weathercode),
    sicaklik: Math.round(c.temperature_2m),
    nem: Math.round(c.relative_humidity_2m),
    ruzgar: Math.round((c.windspeed_10m || 0) * 3.6),
    son: Date.now(),
  };
  // Manuel not santiyeler tablosunda; havaDurumu sadece otomatik veriler.
}

// Manuel not + zaman damgası: santiyeler tablosundan oku
function _havaManuelOku(ad) {
  const sObj = app.santiyeler.find((s) => (typeof s === "object" ? s.name : s) === ad);
  if (!sObj || typeof sObj !== "object") return { not: null, son: null };
  return { not: sObj.hava_manuel_not || null, son: sObj.hava_manuel_son || null };
}

function _havaManuelSonFmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const ayniGun = d.toDateString() === new Date().toDateString();
  if (ayniGun) return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

async function havaCek(ad, lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weathercode,windspeed_10m&wind_speed_unit=ms&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Hava servisi hata: " + r.status);
  const j = await r.json();
  _havaApply(ad, j.current || {});
}

function havaChipHTML(ad) {
  const h = app.havaDurumu[ad];
  if (h) {
    const m = _havaManuelOku(ad);
    const ttl = m.not ? esc("Manuel: " + m.not) : "";
    return `<span class="hava-chip" data-santiye="${esc(ad)}" title="${ttl}" onclick="event.stopPropagation();havaTipToggle(this)">${h.ikon}</span>`;
  }
  // Konum yoksa 📍 ekleme butonu sadece admin'e gösterilir.
  if (isMisafir()) return "";
  return `<span class="hava-chip btn-gps" title="Konum belirle ve hava durumunu göster" onclick="event.stopPropagation();havaKonumAl('${esc(ad)}',this)">📍</span>`;
}

let _havaTipEl  = null;
let _manuelEdit = null;  // tooltip'te manuel düzenleme açık olan şantiye adı

export function havaTipKapat() {
  if (_havaTipEl) { _havaTipEl.remove(); _havaTipEl = null; }
  _manuelEdit = null;
}

function havaTipIcerikHTML(ad) {
  const h = app.havaDurumu[ad];
  if (!h || !h.durum) return "";

  let html = `
    <div class="hava-tip-head">${esc(h.durum)}</div>
    <div class="hava-tip-row"><span>Sıcaklık</span><b>${h.sicaklik}°C</b></div>
    <div class="hava-tip-row"><span>Nem</span><b>%${h.nem}</b></div>
    <div class="hava-tip-row"><span>Rüzgar</span><b>${h.ruzgar} km/h</b></div>
  `;

  const m = _havaManuelOku(ad);
  const baslikHtml = `<div style="font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px">Manuel</div>`;
  const ayraciAc   = `<div style="border-top:1px dashed var(--border); margin-top:8px; padding-top:8px">`;

  if (_manuelEdit === ad && !isMisafir()) {
    const v = m.not || "";
    html += ayraciAc + baslikHtml +
      `<input id="hava-manuel-input" class="form-input" value="${esc(v)}"
         placeholder="örn: Yağmur yağdı, fırtına vs."
         style="height:30px;font-size:13px;width:100%"
         onkeydown="if(event.key==='Enter'){havaManuelKaydet('${esc(ad)}')}else if(event.key==='Escape'){event.stopPropagation();havaManuelIptal()}">
       <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px">
         <button class="btn btn-sm" onclick="havaManuelIptal()">İptal</button>
         <button class="btn btn-primary btn-sm" onclick="havaManuelKaydet('${esc(ad)}')">Kaydet</button>
       </div>
      </div>`;
  } else if (m.not) {
    const aksiyon = isMisafir()
      ? ""
      : `<button onclick="havaManuelDuzenleAc('${esc(ad)}')" title="Düzenle"
           style="background:none;border:none;cursor:pointer;color:var(--accent-d);font-size:13px;padding:0 4px">✏</button>
         <button onclick="havaManuelSil('${esc(ad)}')" title="Sil"
           style="background:none;border:none;cursor:pointer;color:#991b1b;font-size:13px;padding:0 4px">×</button>`;
    const sonStr = _havaManuelSonFmt(m.son);
    const sonHtml = sonStr ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(sonStr)}</div>` : "";
    html += ayraciAc + baslikHtml +
      `<div style="display:flex;align-items:center;gap:6px;font-size:13px">
         <span style="flex:1">${esc(m.not)}</span>
         ${aksiyon}
       </div>
       ${sonHtml}
      </div>`;
  } else if (!isMisafir()) {
    html += ayraciAc + baslikHtml +
      `<button onclick="havaManuelDuzenleAc('${esc(ad)}')"
         style="background:none;border:1px dashed var(--border);border-radius:6px;cursor:pointer;color:var(--muted);font-size:12px;padding:4px 8px;width:100%">
         + Manuel not ekle
       </button>
      </div>`;
  }

  return html;
}

function havaTipYerlestir(chip) {
  if (!_havaTipEl) return;
  // İçerik değişince yeniden boyutlanmış olabilir — pozisyonu yeniden hesapla
  _havaTipEl.classList.remove("below");
  const r = chip.getBoundingClientRect();
  const tw = _havaTipEl.offsetWidth, th = _havaTipEl.offsetHeight;
  const vw = window.innerWidth, margin = 8;
  let left = r.left + r.width / 2 - tw / 2;
  if (left < margin) left = margin;
  if (left + tw > vw - margin) left = vw - tw - margin;
  let top = r.top - th - 10;
  let below = false;
  if (top < margin) { top = r.bottom + 10; below = true; }
  const arrowLeft = r.left + r.width / 2 - left;
  _havaTipEl.style.left = left + "px";
  _havaTipEl.style.top  = top  + "px";
  _havaTipEl.style.setProperty("--arrow-left", arrowLeft + "px");
  if (below) _havaTipEl.classList.add("below");
}

function havaTipYenile() {
  if (!_havaTipEl) return;
  const ad = _havaTipEl._santiye;
  _havaTipEl.innerHTML = havaTipIcerikHTML(ad);
  havaTipYerlestir(_havaTipEl._chip);
  if (_manuelEdit === ad) el("hava-manuel-input")?.focus();
}

window.havaTipToggle = (chip) => {
  if (_havaTipEl && _havaTipEl._chip === chip) { havaTipKapat(); return; }
  havaTipKapat();
  const ad = chip.getAttribute("data-santiye");
  if (!ad || !app.havaDurumu[ad]?.durum) return;
  const tip = document.createElement("div");
  tip.className = "hava-tip";
  tip.innerHTML = havaTipIcerikHTML(ad);
  document.body.appendChild(tip);
  tip._chip    = chip;
  tip._santiye = ad;
  _havaTipEl   = tip;
  havaTipYerlestir(chip);
  requestAnimationFrame(() => tip.classList.add("show"));
};

window.havaManuelDuzenleAc = (ad) => {
  if (isMisafir()) return;
  _manuelEdit = ad;
  havaTipYenile();
};

window.havaManuelIptal = () => {
  _manuelEdit = null;
  havaTipYenile();
};

async function _havaManuelYaz(ad, yeniNot) {
  const sObj = app.santiyeler.find((s) => (typeof s === "object" ? s.name : s) === ad);
  if (!sObj || typeof sObj !== "object") {
    toast("Şantiye bulunamadı", "err");
    return;
  }
  const yeniSon = yeniNot ? new Date().toISOString() : null;
  const eskiNot = sObj.hava_manuel_not;
  const eskiSon = sObj.hava_manuel_son;

  // Optimistic UI — DB hata verirse geri alacağız
  sObj.hava_manuel_not = yeniNot;
  sObj.hava_manuel_son = yeniSon;
  _manuelEdit = null;
  havaTipYenile();
  const chip = _havaTipEl?._chip;
  if (chip) chip.setAttribute("title", yeniNot ? "Manuel: " + yeniNot : "");

  try {
    const bolgeQ = app.bolge ? `&bolge=eq.${encodeURIComponent(app.bolge)}` : "";
    await dbPatch("santiyeler", `name=eq.${encodeURIComponent(ad)}${bolgeQ}`, {
      hava_manuel_not: yeniNot,
      hava_manuel_son: yeniSon,
    });
  } catch (err) {
    // Rollback
    sObj.hava_manuel_not = eskiNot;
    sObj.hava_manuel_son = eskiSon;
    havaTipYenile();
    if (chip) chip.setAttribute("title", eskiNot ? "Manuel: " + eskiNot : "");
    toast("Kaydedilemedi: " + (err.message || "Hata"), "err");
  }
}

window.havaManuelKaydet = (ad) => {
  if (isMisafir()) return;
  const v = (el("hava-manuel-input")?.value || "").trim();
  _havaManuelYaz(ad, v || null);
};

window.havaManuelSil = (ad) => {
  if (isMisafir()) return;
  _havaManuelYaz(ad, null);
};

document.addEventListener("click", (e) => {
  if (!_havaTipEl) return;
  if (_havaTipEl.contains(e.target)) return;
  if (_havaTipEl._chip && _havaTipEl._chip.contains(e.target)) return;
  havaTipKapat();
}, true);

// Manuel düzenleme açıkken mobil klavye scroll/resize tetikliyor —
// bu durumda kapatmak yerine pozisyonu yeniden hesapla.
function havaTipReposition() {
  if (!_havaTipEl) return;
  if (_manuelEdit) {
    havaTipYerlestir(_havaTipEl._chip);
  } else {
    havaTipKapat();
  }
}
window.addEventListener("scroll", havaTipReposition, true);
window.addEventListener("resize", havaTipReposition);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") havaTipKapat(); });

window.havaKonumAl = async (ad, btn) => {
  if (isMisafir()) { toast("Misafir konum kaydedemez", "warn"); return; }
  if (!navigator.geolocation) { toast("Bu cihazda konum servisi yok", "warn"); return; }
  if (!isAdmin()) { toast("Konum kaydı için admin girişi gerekli", "warn"); return; }
  if (btn) { btn.classList.add("loading"); btn.textContent = "⏳"; }
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }),
    );
    const { latitude: lat, longitude: lon } = pos.coords;
    const bolgeQ = app.bolge ? `&bolge=eq.${encodeURIComponent(app.bolge)}` : "";
    await dbPatch("santiyeler", `name=eq.${encodeURIComponent(ad)}${bolgeQ}`, { lat, lon });
    const sObj = app.santiyeler.find((s) => (typeof s === "object" ? s.name : s) === ad);
    if (sObj && typeof sObj === "object") { sObj.lat = lat; sObj.lon = lon; }
    await havaCek(ad, lat, lon);
    toast(`"${ad}" konumu kaydedildi`, "ok", 2000);
    renderSantiyeler();
    if (app.aktifView === "ayarlar") {
      import("./ayarlar.js").then(({ renderAyarlar }) => renderAyarlar());
    }
  } catch (e) {
    if (btn) { btn.classList.remove("loading"); btn.textContent = "📍"; }
    const msg = e.code === 1 ? "Konum izni reddedildi" : e.code === 2 ? "Konum alınamadı" : e.code === 3 ? "Zaman aşımı" : e.message || "Hata";
    toast("Konum: " + msg, "err");
  }
};

export async function tumHavaYenile() {
  const konumlu = app.santiyeler
    .filter((s) => typeof s === "object" && s.lat != null && s.lon != null)
    .map((s) => ({ ad: s.name, lat: Number(s.lat), lon: Number(s.lon) }));
  if (!konumlu.length) return;
  // open-meteo batch: tek request'te N koordinat (latitude=a,b,c&longitude=x,y,z),
  // response array'i sıralı dönüyor. 13+ santiye → 13 fetch yerine 1 fetch
  // (free tier ~10 req/min/IP rate limit'i koruma).
  const lats = konumlu.map((k) => k.lat).join(",");
  const lons = konumlu.map((k) => k.lon).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,weathercode,windspeed_10m&wind_speed_unit=ms&timezone=auto`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Hava servisi hata: " + r.status);
    const j = await r.json();
    // Tek koordinatta j.current, çoklu'da [{current},{current},...]
    const list = Array.isArray(j) ? j : [j];
    konumlu.forEach((k, i) => {
      const c = list[i]?.current;
      if (c) _havaApply(k.ad, c);
    });
  } catch {
    // Geçici servis hatası — sessiz geç (UX: ikon eksik kalır, kritik değil)
  }
  if (app.aktifView === "projects") renderSantiyeler();
}

export function havaTimerBaslat() {
  if (_havaTimer) clearInterval(_havaTimer);
  _havaTimer = setInterval(tumHavaYenile, 30 * 60 * 1000);
}

export function stopHavaTimer() {
  clearInterval(_havaTimer);
  _havaTimer = null;
}

// ── Render: Şantiyeler ────────────────────────────────────────────────────────

export function renderSantiyeler() {
  // View görünürlüğü tabGec (router) sorumluluğu; burada içerik doldur.
  const aramaMetni = (app.filtre.santiyeAra || "").toLowerCase();
  const filtered = app.santiyeler.filter((s) => {
    const ad = typeof s === "object" ? s.name : s;
    return !aramaMetni || ad.toLowerCase().includes(aramaMetni);
  });

  if (!app.santiyeler.length) {
    el("projects-grid").innerHTML = `<div class="empty">
      <div class="empty-icon">🏗</div>
      <div class="empty-title">Henüz şantiye yok</div>
      <div class="empty-desc">${isAdmin() ? "Ayarlardan ilk şantiyenizi ekleyin." : "Yetkili kullanıcı şantiye eklemeli."}</div>
      ${isAdmin() ? '<button class="btn btn-primary" onclick="bnGo(\'ayarlar\')">⚙ Ayarlara Git</button>' : ""}
    </div>`;
    return;
  }

  if (!filtered.length) {
    el("projects-grid").innerHTML = `<div class="empty">
      <div class="empty-icon">🔍</div>
      <div class="empty-title">"${esc(aramaMetni)}" için şantiye bulunamadı</div>
      <div class="empty-desc">Aramayı temizleyip tekrar deneyin.</div>
      <button class="btn" onclick="el('santiye-ara').value='';onSantiyeAra(el('santiye-ara'))">Aramayı Temizle</button>
    </div>`;
    return;
  }

  el("projects-grid").innerHTML = filtered.map((s) => {
    const ad = typeof s === "object" ? s.name : s;
    const kayitlar = app.kayitlar.filter((r) => r.santiye === ad);
    const tumAsamalar = kayitlar.flatMap((r) => r.asamalar || []);
    const tam = tumAsamalar.filter((a) => a.durum === "Tamamlandı").length;
    const pct = tumAsamalar.length ? Math.round((tam / tumAsamalar.length) * 100) : 0;
    const notVar = !!app.notlar[ad];
    return `<button class="card project-card" onclick="santiyeSec('${esc(ad)}')">
      <div class="project-name"><span>${esc(ad)}</span>${notVar ? '<span class="hava-chip" title="Not var">📝</span>' : ""}${havaChipHTML(ad)}</div>
      <div class="project-meta">
        <span>${kayitlar.length} alan</span><span>·</span><span>${tumAsamalar.length} aşama</span>
      </div>
      ${tumAsamalar.length
        ? `<div class="project-bar"><div style="width:${pct}%"></div></div><div class="project-pct">${pct}% tamamlandı</div>`
        : '<div style="font-size:11px;color:var(--muted);margin-top:8px">Henüz kayıt yok</div>'}
    </button>`;
  }).join("");
}

window.onSantiyeAra = (input) => {
  app.filtre.santiyeAra = input.value;
  el("santiye-ara-clr").classList.toggle("show", !!input.value);
  renderSantiyeler();
};
