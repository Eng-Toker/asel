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

async function havaCek(ad, lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weathercode,windspeed_10m&wind_speed_unit=ms&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Hava servisi hata: " + r.status);
  const j = await r.json();
  const c = j.current || {};
  app.havaDurumu[ad] = {
    ikon: WMO_EMOJI(c.weathercode),
    durum: WMO_DURUM(c.weathercode),
    sicaklik: Math.round(c.temperature_2m),
    nem: Math.round(c.relative_humidity_2m),
    ruzgar: Math.round((c.windspeed_10m || 0) * 3.6),
    son: Date.now(),
  };
}

function havaChipHTML(ad) {
  const h = app.havaDurumu[ad];
  if (h) {
    return `<span class="hava-chip" data-santiye="${esc(ad)}" data-hava='${esc(JSON.stringify(h))}' onclick="event.stopPropagation();havaTipToggle(this)">${h.ikon}</span>`;
  }
  return `<span class="hava-chip btn-gps" title="Konum belirle ve hava durumunu göster" onclick="event.stopPropagation();havaKonumAl('${esc(ad)}',this)">📍</span>`;
}

let _havaTipEl = null;

export function havaTipKapat() {
  if (_havaTipEl) { _havaTipEl.remove(); _havaTipEl = null; }
}

window.havaTipToggle = (chip) => {
  if (_havaTipEl && _havaTipEl._chip === chip) { havaTipKapat(); return; }
  havaTipKapat();
  let h;
  try { h = JSON.parse(chip.getAttribute("data-hava") || "{}"); } catch { return; }
  if (!h.durum) return;
  const tip = document.createElement("div");
  tip.className = "hava-tip";
  tip.innerHTML = `
    <div class="hava-tip-head">${esc(h.durum)}</div>
    <div class="hava-tip-row"><span>Sıcaklık</span><b>${h.sicaklik}°C</b></div>
    <div class="hava-tip-row"><span>Nem</span><b>%${h.nem}</b></div>
    <div class="hava-tip-row"><span>Rüzgar</span><b>${h.ruzgar} km/h</b></div>
  `;
  document.body.appendChild(tip);
  const r = chip.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  const vw = window.innerWidth, margin = 8;
  let left = r.left + r.width / 2 - tw / 2;
  if (left < margin) left = margin;
  if (left + tw > vw - margin) left = vw - tw - margin;
  let top = r.top - th - 10;
  let below = false;
  if (top < margin) { top = r.bottom + 10; below = true; }
  const arrowLeft = r.left + r.width / 2 - left;
  tip.style.left = left + "px";
  tip.style.top = top + "px";
  tip.style.setProperty("--arrow-left", arrowLeft + "px");
  if (below) tip.classList.add("below");
  requestAnimationFrame(() => tip.classList.add("show"));
  tip._chip = chip;
  _havaTipEl = tip;
};

document.addEventListener("click", (e) => {
  if (!_havaTipEl) return;
  if (_havaTipEl.contains(e.target)) return;
  if (_havaTipEl._chip && _havaTipEl._chip.contains(e.target)) return;
  havaTipKapat();
}, true);
window.addEventListener("scroll", havaTipKapat, true);
window.addEventListener("resize", havaTipKapat);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") havaTipKapat(); });

window.havaKonumAl = async (ad, btn) => {
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
  await Promise.allSettled(konumlu.map((k) => havaCek(k.ad, k.lat, k.lon)));
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
  el("view-projects").classList.toggle("hidden", !!app.secilenSantiye);
  el("view-detail").classList.toggle("hidden", !app.secilenSantiye);
  const fab = el("fab-add");
  if (fab) fab.style.display = "none";

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
