// views/harita.js — Şantiye konumları haritası (Leaflet + OSM)
//
// Singleton map: her render'da recreate etmeyiz, sadece marker'ları değiştirip
// fitBounds ederiz. invalidateSize() hidden→visible geçişinde tile bug'ını engeller.
//
// Güvenlik: Popup içeriği DOM API ile inşa edilir (esc/innerHTML değil).
// js/utils.js esc() JS-context için yetersiz olduğundan inline onclick yazmayız.

import { app } from "../state.js";
import { el, esc } from "../utils.js";
import { registerRender, tabGec } from "../router.js";

let _harita = null;
let _isaretler = [];
let _tileLayer = null;

const OSM_TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function konumluSantiyeler() {
  return (app.santiyeler || []).filter(
    (s) => typeof s === "object" && s.lat != null && s.lon != null,
  );
}

function konumsuzSantiyeler() {
  return (app.santiyeler || []).filter((s) => {
    if (typeof s !== "object") return true;
    return s.lat == null || s.lon == null;
  });
}

function santiyeOzeti(ad) {
  const kayitlar = (app.kayitlar || []).filter((r) => r.santiye === ad);
  let asamaSayisi = 0, tamamlanan = 0, devamEden = 0;
  for (const k of kayitlar) {
    const asamalar = k.asamalar || [];
    asamaSayisi += asamalar.length;
    for (const a of asamalar) {
      if (a.durum === "Tamamlandı")        tamamlanan++;
      else if (a.durum === "Devam Ediyor") devamEden++;
    }
  }
  const yuzde = asamaSayisi ? Math.round((tamamlanan / asamaSayisi) * 100) : 0;
  return {
    alanSayisi: kayitlar.length,
    asamaSayisi,
    tamamlanan,
    devamEden,
    bekleyen: asamaSayisi - tamamlanan - devamEden,
    yuzde,
  };
}

function alanOzeti(kayit) {
  const asamalar = kayit.asamalar || [];
  let tamamlanan = 0, devamEden = 0;
  for (const a of asamalar) {
    if (a.durum === "Tamamlandı")        tamamlanan++;
    else if (a.durum === "Devam Ediyor") devamEden++;
  }
  const toplam = asamalar.length;
  const yuzde = toplam ? Math.round((tamamlanan / toplam) * 100) : 0;
  return { toplam, tamamlanan, devamEden, bekleyen: toplam - tamamlanan - devamEden, yuzde };
}

function asamaDurumStilleri(durum) {
  if (durum === "Tamamlandı")   return { cls: "done",     ico: "✓", label: "Tamamlandı" };
  if (durum === "Devam Ediyor") return { cls: "progress", ico: "⏳", label: "Devam Ediyor" };
  return                              { cls: "wait",     ico: "○", label: "Beklemede" };
}

// Tooltip — XSS güvenli, lib gerekmez
let _ipucu;
function ipucuGoster(hedef, metin) {
  if (!_ipucu) {
    _ipucu = document.createElement("div");
    _ipucu.className = "hip-tip";
    document.body.appendChild(_ipucu);
  }
  _ipucu.textContent = metin;
  _ipucu.classList.add("show");
  const r = hedef.getBoundingClientRect();
  const tipR = _ipucu.getBoundingClientRect();
  let x = r.left + r.width / 2 - tipR.width / 2;
  x = Math.max(8, Math.min(x, window.innerWidth - tipR.width - 8));
  const y = r.top - tipR.height - 8;
  _ipucu.style.left = x + "px";
  _ipucu.style.top  = (y < 8 ? r.bottom + 8 : y) + "px";
}
function ipucuGizle() {
  if (_ipucu) _ipucu.classList.remove("show");
}

function legendNode(cls, text) {
  const span = document.createElement("span");
  const dot = document.createElement("span");
  dot.className = "legend-dot";
  if (cls === "done")     dot.style.background = "#186a3b";
  if (cls === "progress") dot.style.background = "#f5b800";
  if (cls === "wait")     dot.style.background = "#dfe3ea";
  span.appendChild(dot);
  span.appendChild(document.createTextNode(text));
  return span;
}

function alanSatiriYap(kayit) {
  const ozet = alanOzeti(kayit);
  const row = document.createElement("div");
  row.className = "hip-alan-row";

  const head = document.createElement("div");
  head.className = "hip-alan-head";
  const adEl = document.createElement("div");
  adEl.className = "hip-alan-name";
  adEl.textContent = kayit.uygulamaAlani || "—";
  const pct = document.createElement("div");
  pct.className = "hip-alan-pct";
  pct.textContent = ozet.toplam ? "%" + ozet.yuzde : "—";
  head.append(adEl, pct);
  row.appendChild(head);

  const strip = document.createElement("div");
  strip.className = "hip-strip";
  const asamalar = kayit.asamalar || [];
  if (!asamalar.length) {
    const e = document.createElement("div");
    e.style.cssText = "font-size:11px;color:var(--muted);font-style:italic;padding:4px 0";
    e.textContent = "aşama yok";
    strip.appendChild(e);
  } else {
    for (const a of asamalar) {
      const s = asamaDurumStilleri(a.durum);
      const seg = document.createElement("div");
      seg.className = "seg " + s.cls;
      seg.tabIndex = 0;
      const ico = document.createElement("span");
      ico.className = "ico";
      ico.textContent = s.ico;
      seg.appendChild(ico);
      seg.appendChild(document.createTextNode(String(a.sira ?? "?")));
      const tipMetin = "Aşama " + (a.sira ?? "?") + " · " + s.label +
                       (a.malzeme ? " · " + a.malzeme : "");
      seg.addEventListener("mouseenter", () => ipucuGoster(seg, tipMetin));
      seg.addEventListener("mouseleave", ipucuGizle);
      seg.addEventListener("focus",      () => ipucuGoster(seg, tipMetin));
      seg.addEventListener("blur",       ipucuGizle);
      strip.appendChild(seg);
    }
  }
  row.appendChild(strip);

  if (ozet.toplam) {
    const foot = document.createElement("div");
    foot.className = "hip-alan-foot";
    foot.append(
      legendNode("done",     ozet.tamamlanan + " bitti"),
      legendNode("progress", ozet.devamEden  + " devam"),
      legendNode("wait",     ozet.bekleyen   + " bekliyor"),
    );
    row.appendChild(foot);
  }

  return row;
}

function paneliBoslat() {
  const panel = el("harita-info-panel");
  if (!panel) return;
  panel.classList.add("is-empty");
  panel.replaceChildren();
}

function paneliDoldur(ad, lat, lon) {
  const panel = el("harita-info-panel");
  if (!panel) return;
  panel.classList.remove("is-empty");
  panel.replaceChildren();

  // Header
  const head = document.createElement("div");
  head.className = "hip-header";

  const eyebrow = document.createElement("div");
  eyebrow.className = "hip-eyebrow";
  const dot = document.createElement("span");
  dot.className = "dot";
  eyebrow.append(dot, document.createTextNode("Şantiye"));
  head.appendChild(eyebrow);

  const baslik = document.createElement("div");
  baslik.className = "hip-title";
  baslik.textContent = ad;
  head.appendChild(baslik);

  const koord = document.createElement("div");
  koord.className = "hip-coord";
  koord.textContent = lat.toFixed(5) + ", " + lon.toFixed(5);
  head.appendChild(koord);

  const kapat = document.createElement("button");
  kapat.className = "hip-close";
  kapat.type = "button";
  kapat.title = "Kapat";
  kapat.setAttribute("aria-label", "Paneli kapat");
  kapat.textContent = "×";
  kapat.addEventListener("click", paneliBoslat);
  head.appendChild(kapat);
  panel.appendChild(head);

  // Hava durumu
  const hava = app.havaDurumu?.[ad];
  if (hava && hava.durum) {
    const w = document.createElement("div");
    w.className = "hip-weather";
    const main = document.createElement("div");
    main.className = "hip-weather-main";
    const ikon = document.createElement("span");
    ikon.className = "ikon";
    ikon.textContent = hava.ikon || "🌤️";
    const deg = document.createElement("span");
    deg.className = "deg";
    deg.textContent = (hava.sicaklik ?? "—") + "°C";
    const durum = document.createElement("span");
    durum.className = "durum";
    durum.textContent = hava.durum;
    main.append(ikon, deg, durum);

    const meta = document.createElement("div");
    meta.className = "hip-weather-meta";
    if (hava.nem != null) {
      const s1 = document.createElement("span");
      s1.textContent = "Nem %" + hava.nem;
      meta.appendChild(s1);
    }
    if (hava.ruzgar != null) {
      const s2 = document.createElement("span");
      s2.textContent = hava.ruzgar + " km/h";
      meta.appendChild(s2);
    }
    w.append(main, meta);
    panel.appendChild(w);
  }

  // Özet
  const ozet = santiyeOzeti(ad);
  const sum = document.createElement("div");
  sum.className = "hip-summary";
  const sumRow = document.createElement("div");
  sumRow.className = "hip-summary-row";
  const stats = document.createElement("div");
  stats.className = "hip-summary-stats";
  const b1 = document.createElement("b"); b1.textContent = ozet.alanSayisi;
  const b2 = document.createElement("b"); b2.textContent = ozet.asamaSayisi;
  stats.append(b1, document.createTextNode(" alan · "), b2, document.createTextNode(" aşama"));
  const pct = document.createElement("div");
  pct.className = "hip-summary-pct";
  pct.textContent = ozet.asamaSayisi ? "%" + ozet.yuzde : "—";
  sumRow.append(stats, pct);
  sum.appendChild(sumRow);

  if (ozet.asamaSayisi) {
    const bar = document.createElement("div");
    bar.className = "hip-bar";
    const donePct = (ozet.tamamlanan / ozet.asamaSayisi) * 100;
    const progPct = (ozet.devamEden  / ozet.asamaSayisi) * 100;
    const sd = document.createElement("div");
    sd.className = "seg done";
    sd.style.width = donePct + "%";
    const sp = document.createElement("div");
    sp.className = "seg prog";
    sp.style.width = progPct + "%";
    bar.append(sd, sp);
    sum.appendChild(bar);
  }
  panel.appendChild(sum);

  // Alanlar başlığı
  const sectionH = document.createElement("div");
  sectionH.className = "hip-section-h";
  const sh1 = document.createElement("span");
  sh1.textContent = "Uygulama Alanları";
  const sh2 = document.createElement("span");
  sh2.className = "count";
  const kayitlar = (app.kayitlar || []).filter((r) => r.santiye === ad);
  sh2.textContent = kayitlar.length ? kayitlar.length + " alan" : "";
  sectionH.append(sh1, sh2);
  panel.appendChild(sectionH);

  // Alanlar listesi
  const liste = document.createElement("div");
  liste.className = "hip-alanlar";
  if (!kayitlar.length) {
    const bos = document.createElement("div");
    bos.className = "hip-empty-alan";
    bos.textContent = "Henüz alan yok";
    liste.appendChild(bos);
  } else {
    for (const k of kayitlar) liste.appendChild(alanSatiriYap(k));
  }
  panel.appendChild(liste);

  // Butonlar
  const btnBox = document.createElement("div");
  btnBox.className = "hip-buttons";
  const gitBtn = document.createElement("button");
  gitBtn.className = "hip-btn hip-btn-primary";
  gitBtn.type = "button";
  gitBtn.textContent = "Şantiyeye git";
  gitBtn.addEventListener("click", () => haritaSantiyeyeGit(ad));
  btnBox.appendChild(gitBtn);

  const yolBtn = document.createElement("button");
  yolBtn.className = "hip-btn hip-btn-ghost";
  yolBtn.type = "button";
  const yolIco = document.createElement("span");
  yolIco.textContent = "🧭";
  yolIco.setAttribute("aria-hidden", "true");
  yolBtn.appendChild(yolIco);
  yolBtn.appendChild(document.createTextNode(" Yol tarifi"));
  yolBtn.addEventListener("click", () => {
    const url = "https://www.google.com/maps/dir/?api=1&destination=" +
                encodeURIComponent(lat + "," + lon);
    window.open(url, "_blank", "noopener,noreferrer");
  });
  btnBox.appendChild(yolBtn);
  panel.appendChild(btnBox);
}

function emptyStateHTML() {
  return `<div class="empty" style="padding:40px 20px">
    <div class="empty-icon">🗺️</div>
    <div class="empty-title">Hiç konum kaydı yok</div>
    <div class="empty-desc">Şantiyeler ekranında 📍 ikonuna tıklayarak konum ekleyin.</div>
  </div>`;
}

function konumsuzListeHTML(liste) {
  if (!liste.length) return "";
  const adlar = liste.map((s) => typeof s === "object" ? s.name : s).filter(Boolean);
  if (!adlar.length) return "";
  return `<div style="background:#fef9c3;border:1px solid #facc15;color:#854d0e;padding:10px 12px;border-radius:8px;font-size:13px">
    <b>⚠ Konumu kaydedilmemiş:</b> ${adlar.map((a) => esc(a)).join(", ")}
  </div>`;
}

function haritayiBaslat() {
  if (_harita) return;
  if (typeof L === "undefined") return;
  _harita = L.map("harita-container", { zoomControl: true, attributionControl: true });
  _tileLayer = L.tileLayer(OSM_TILE, { maxZoom: 19, attribution: OSM_ATTR });
  _tileLayer.addTo(_harita);
  // Haritada boş alana tıklanınca paneli boşalt (marker click bubble etmiyor — Leaflet)
  _harita.on("click", paneliBoslat);
}

function isaretleriTemizle() {
  for (const m of _isaretler) m.remove();
  _isaretler = [];
}

export function renderHarita() {
  const baslik = el("harita-baslik");
  if (baslik) baslik.textContent = "Şantiye Konumları" + (app.bolge ? " — " + app.bolge : "");

  const container = el("harita-container");
  const bilgi = el("harita-bilgi");
  if (!container) return;

  if (typeof L === "undefined") {
    container.innerHTML = `<div class="empty" style="padding:40px 20px">
      <div class="empty-icon">⚠</div>
      <div class="empty-title">Harita kütüphanesi yüklenemedi</div>
      <div class="empty-desc">İnternet bağlantısını kontrol edip sayfayı yenileyin.</div>
    </div>`;
    if (bilgi) bilgi.innerHTML = "";
    return;
  }

  const konumlu = konumluSantiyeler();
  const konumsuz = konumsuzSantiyeler();

  const panel = el("harita-info-panel");

  if (!konumlu.length) {
    if (_harita) { _harita.remove(); _harita = null; _isaretler = []; }
    container.innerHTML = emptyStateHTML();
    if (panel) panel.style.display = "none";
    if (bilgi) bilgi.innerHTML = konumsuzListeHTML(konumsuz);
    return;
  }

  if (panel) panel.style.display = "";

  // Empty state'ten dönüşte container'ı haritaya hazırla
  if (!_harita) {
    container.innerHTML = "";
    haritayiBaslat();
  }
  if (!_harita) return;

  isaretleriTemizle();
  const bounds = [];
  for (const s of konumlu) {
    const lat = Number(s.lat), lon = Number(s.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const m = L.marker([lat, lon]).addTo(_harita);
    const ad = s.name;
    m.on("click", () => paneliDoldur(ad, lat, lon));
    _isaretler.push(m);
    bounds.push([lat, lon]);
  }

  // Render başında panel boş gelsin (önceki seçim stale olmasın)
  paneliBoslat();

  if (bounds.length === 1) {
    _harita.setView(bounds[0], 14);
  } else if (bounds.length > 1) {
    _harita.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }

  // Hidden→visible geçişinde tile yükleme bug'ı için zorunlu
  setTimeout(() => _harita?.invalidateSize(), 0);

  if (bilgi) bilgi.innerHTML = konumsuzListeHTML(konumsuz);
}

async function haritaSantiyeyeGit(ad) {
  app.secilenSantiye = ad;
  tabGec("detail");
  const { renderDetay } = await import("./detail.js");
  renderDetay();
}

window.haritaSantiyeyeGit = haritaSantiyeyeGit;

registerRender("harita", renderHarita);
