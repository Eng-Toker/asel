// modals/rapor.js — Aşama bazlı AI teknik rapor modali
// Bağımlılıklar: state, auth, utils, config, photo (sıkıştırma), db
// Akış: yorum → fotograflar hazırla → /rapor (Gemini) → PDF üret (html2pdf)
//        → /raporPdf (Drive) → santiye_raporlar INSERT → sonuc

import { app } from "../state.js";
import { el, esc, toast } from "../utils.js";
import { isMisafir, oturumYukle } from "../auth.js";
import { DRIVE_URL } from "../config.js";
import { sikistir } from "../photo.js";
import { dbPost } from "../db.js";
import { ASEL_LOGO, KOSTER_LOGO } from "./rapor-assets.js";

let aktifBaglam = null; // { kayitId, asamaSira, kayit, asama }

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function slugify(s) {
  return String(s || "")
    .trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tarihDamgaIso() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tarihTr(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      // data URL: "data:image/jpeg;base64,XXXX" → sadece XXXX
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error("Base64 dönüşüm hatası"));
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Drive thumbnail URL'leri CORS göndermediği için Worker proxy kullanılır.
// Eski kayıtlarda file_id null olabilir; bu durumda Worker file_url'den ID parse eder.
async function fotoWorkerProxyIle(fileId, fileUrl) {
  const r = await fetch(`${DRIVE_URL}/fotoIndir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: fileId || null, fileUrl: fileUrl || null }),
  });
  const d = await r.json().catch(() => null);
  if (!d || d.basarili === false) {
    throw new Error(d?.hata || "Fotoğraf indirilemedi (Worker)");
  }
  return base64ToBlob(d.data, d.mimeType || "image/jpeg");
}

// ─── Modal görünüm ───────────────────────────────────────────────────────────

function stepGoster(step) {
  const ov = el("rapor-modal");
  if (!ov) return;
  ov.querySelectorAll("[data-step]").forEach(d => {
    d.classList.toggle("hidden", d.getAttribute("data-step") !== step);
  });
}

function modalAc() {
  el("rapor-modal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function modalKapat() {
  el("rapor-modal").classList.remove("open");
  document.body.style.overflow = "";
  aktifBaglam = null;
  // Yorum textarea'sını boşalt
  const t = el("rapor-yorum");
  if (t) t.value = "";
  raporYorumKontrol();
}

window.raporModalKapat = modalKapat;

window.raporYorumKontrol = () => {
  const t = el("rapor-yorum");
  const btn = el("rapor-uret-btn");
  const sayac = el("rapor-yorum-sayac");
  if (!t || !btn) return;
  const len = t.value.trim().length;
  btn.disabled = len < 20;
  if (sayac) sayac.textContent = `${len} / min 20`;
};

window.raporModalAcTekrar = () => {
  stepGoster("yorum");
  raporYorumKontrol();
};

window.raporModalAc = (kayitId, asamaSira) => {
  if (isMisafir()) return;
  const kayit = app.kayitlar.find(k => k.id === kayitId);
  const asama = kayit?.asamalar?.find(a => a.sira === Number(asamaSira));
  if (!kayit || !asama) {
    toast("Aşama bulunamadı", "err");
    return;
  }
  const hasarVar = (asama.fotograflar || []).some(f => f.hasar);
  if (!hasarVar) {
    toast("Bu aşamada hasar fotoğrafı yok", "warn");
    return;
  }
  aktifBaglam = { kayitId, asamaSira: Number(asamaSira), kayit, asama };

  // Modal başlığı + foto özet
  const baslik = el("rapor-modal-baslik");
  if (baslik) baslik.textContent = `${kayit.uygulamaAlani} · Aşama ${asama.sira}`;

  const ozet = el("rapor-foto-ozet");
  if (ozet) {
    const normal = (asama.fotograflar || []).filter(f => !f.hasar).length;
    const hasar  = (asama.fotograflar || []).filter(f =>  f.hasar).length;
    const seciNormal = Math.min(normal, 3);
    const seciHasar  = Math.min(hasar, 1);
    ozet.textContent = `Mevcut: ${normal} normal + ${hasar} hasar · Rapora dahil: ${seciNormal} normal + ${seciHasar} hasar`;
  }

  stepGoster("yorum");
  modalAc();
  raporYorumKontrol();
  setTimeout(() => el("rapor-yorum")?.focus(), 50);
};

// ─── Foto seçimi ve hazırlama ────────────────────────────────────────────────

function fotograflariSec(asama) {
  const all = asama.fotograflar || [];
  // createdAt DESC (yeni en üste). createdAt yoksa orijinal sırayı koru (stable sort)
  const sirala = (a, b) => {
    if (a.createdAt && b.createdAt) return new Date(b.createdAt) - new Date(a.createdAt);
    if (a.createdAt) return -1;
    if (b.createdAt) return 1;
    return 0;
  };
  // Şablon (asel_teknik_rapor_editoru_v1_16.html) photo-grid count-2/3/4 destekler;
  // toplam max 4 foto (3 normal + 1 hasar). En güncel hasarı tek başına seç.
  const normal = all.filter(f => !f.hasar).slice().sort(sirala).slice(0, 3);
  const hasar  = all.filter(f =>  f.hasar).slice().sort(sirala).slice(0, 1);
  // PDF sırası: önce normal (saha), sonra hasar (problem)
  return [
    ...normal.map(f => ({ ...f, type: "normal" })),
    ...hasar .map(f => ({ ...f, type: "hasar"  })),
  ];
}

async function fotografHazirla(foto) {
  if (!foto.file_id && !foto.url) throw new Error("Fotoğrafın ne file_id'si ne URL'i var");
  const blob = await fotoWorkerProxyIle(foto.file_id, foto.url);
  const sikis = await sikistir(blob);
  const finalBlob = sikis || blob;
  const base64 = await blobToBase64(finalBlob);
  return {
    type: foto.type,
    mimeType: "image/jpeg",
    data: base64,
    dataUrl: `data:image/jpeg;base64,${base64}`,
    hasar: !!foto.hasar,
  };
}

// ─── PDF şablonu — asel_teknik_rapor_editoru_v1_16.html'in birebir taşınmasıdır
//     CSS class'ları, section başlıkları ve data-out alanları aynen korunur.
// ─────────────────────────────────────────────────────────────────────────────

function fotoGridHtml(fotolar) {
  const n = fotolar.length;
  const klass = n <= 2 ? "count-2" : n === 3 ? "count-3" : "count-4";
  return `<div id="photoGrid" class="photo-grid ${klass}">
    ${fotolar.map((f, i) => `
      <div class="photo-card">
        <div class="photo-frame"><img src="${esc(f.dataUrl)}" alt=""></div>
        <div class="photo-caption">
          <b>Foto ${i + 1}</b>
          <span>${f.hasar ? "Hasar tespiti" : "Saha görünümü"}</span>
        </div>
      </div>
    `).join("")}
  </div>`;
}

function pdfHtml({ kayit, asama, yorum, ai, foyDosyaAdi, foyBulundu, fotolar, hazirlayan, raporTarihi, raporNo }) {
  const malzeme = asama.malzeme || "—";
  const konum = app.bolge ? `${app.bolge} / KKTC` : "KKTC";
  const yorumHtml = esc(yorum).replace(/\n/g, "<br>");

  const foyDurumu = foyBulundu
    ? `<span style="color:#0d6e3f">✓ Bulundu (${esc(foyDosyaAdi || "")})</span>`
    : `<span style="color:#9a1616">Bulunamadı</span>`;

  const teknikRefMetin = ai.technicalReferences?.trim()
    || (foyBulundu ? "—" : "İlgili ürünün teknik föyü değerlendirmeye dahil edilememiştir.");

  return `
<style>
  /* Şablon: asel_teknik_rapor_editoru_v1_16.html — birebir taşındı, sadece
     rapor render'ı için gerekli class'lar (toolbar/panel/density atlandı). */
  .page{
    width:210mm; min-height:297mm;
    background:#fff; color:#142033;
    font-family:Arial,Helvetica,sans-serif;
    position:relative; padding:10mm 10mm 9mm; overflow:hidden;
    page-break-after:always; box-sizing:border-box;
  }
  .page:last-child{ page-break-after:auto; }
  .page::before{
    content:""; position:absolute; inset:0; pointer-events:none;
    background:
      radial-gradient(circle at 100% 0%, rgba(17,138,203,.08), transparent 25%),
      linear-gradient(180deg, rgba(8,38,74,.025), transparent 17%);
  }
  .report{
    position:relative; z-index:1; min-height:277mm;
    display:flex; flex-direction:column;
  }

  .report-header{
    display:grid; grid-template-columns:1fr 70mm; gap:6mm; align-items:start;
    border-bottom:2.2px solid #07254a; padding-bottom:4mm; flex:0 0 auto;
  }
  .logos{ display:flex; gap:4mm; align-items:center; min-height:22mm; flex-wrap:nowrap; }
  .logo-card{
    width:45mm; height:20mm;
    border:1px solid #e3e9f1; border-radius:9px; background:#fff;
    display:flex; align-items:center; justify-content:center;
    padding:2mm; overflow:hidden;
  }
  .logo-card img{ display:block; width:100%; height:100%; object-fit:contain; }
  .logo-asel img{ transform:scale(.96); }
  .logo-koster img{ transform:scale(.78); }

  .meta{ border:1px solid #d6e0eb; border-radius:10px; overflow:hidden; background:#fff; }
  .meta-row{
    display:grid; grid-template-columns:24mm 1fr;
    border-bottom:1px solid #d6e0eb; min-height:7.3mm;
  }
  .meta-row:last-child{ border-bottom:0; }
  .meta-label{
    background:#f1f5fb; color:#59677a; font-size:8px; font-weight:900;
    letter-spacing:.2px; padding:0 2.4mm; display:flex; align-items:center;
  }
  .meta-val{
    font-size:9px; font-weight:800; padding:1mm 2.4mm;
    color:#07254a; display:flex; align-items:center;
  }

  .title-band{
    margin:7mm 0 5mm; display:flex; justify-content:space-between;
    gap:6mm; align-items:flex-start; flex:0 0 auto;
  }
  .title-band h1{ margin:0; font-size:18px; line-height:1.08; letter-spacing:.15px; color:#a1a7b1; }
  .title-band p { margin:1.6mm 0 0; font-size:9.2px; color:#99a4b3; line-height:1.3; }
  .badge{ color:#07254a; font-size:8.8px; font-weight:900; white-space:nowrap; margin-top:6mm; }

  .grid-main{
    display:grid; grid-template-columns:75mm 1fr; gap:5mm;
    flex:1 1 auto; min-height:0;
  }
  .stack{ display:grid; gap:3.5mm; align-content:start; }
  .box{ border:1px solid #d6e0eb; border-radius:10px; background:#fff; overflow:hidden; }
  .box h3{
    margin:0; background:#fff; color:#07254a; font-size:9px;
    letter-spacing:.35px; padding:2.4mm 3mm; text-transform:uppercase;
    border-bottom:1px solid #d6e0eb;
  }
  .box .content{
    padding:3mm; font-size:9.5px; line-height:1.46; color:#263445;
    overflow:hidden;
    text-align:justify;
    hyphens:auto;
    -webkit-hyphens:auto;
    word-spacing:-0.02em;
  }
  .kv{ display:grid; grid-template-columns:25mm 1fr; gap:1mm 1.5mm; margin-bottom:1.5mm; }
  .kv b{ color:#07254a; }

  .photo-section .content{ padding:0; }
  .photo-grid{ display:grid; gap:4mm; padding:3mm; }
  .photo-grid.count-2{ grid-template-columns:1fr; }
  .photo-grid.count-3{ grid-template-columns:1fr 1fr; }
  .photo-grid.count-3 .photo-card:first-child{ grid-column:1 / 3; }
  .photo-grid.count-4{ grid-template-columns:1fr 1fr; }
  .photo-card{
    border:1px solid #d6e0eb; border-radius:10px; background:#fff;
    overflow:hidden; display:grid; grid-template-rows:1fr auto; min-height:0;
  }
  .photo-frame{
    height:52mm; background:#fbfdff; display:flex; align-items:center;
    justify-content:center; padding:2mm; overflow:hidden;
  }
  .photo-grid.count-2 .photo-frame{ height:82mm; }
  .photo-grid.count-3 .photo-card:first-child .photo-frame{ height:72mm; }
  .photo-grid.count-3 .photo-frame{ height:52mm; }
  .photo-grid.count-4 .photo-frame{ height:54mm; }
  .photo-frame img{
    width:100%; height:100%; object-fit:cover; object-position:center; display:block;
  }
  .photo-caption{ border-top:1px solid #d6e0eb; padding:2mm 2.2mm; background:#fff; }
  .photo-caption b   { display:block; color:#07254a; font-size:8.8px; margin-bottom:.7mm; }
  .photo-caption span{ display:block; color:#43546a; font-size:8.1px; line-height:1.25; }

  .page-note{
    margin-top:auto; border-top:1.8px solid #07254a; padding-top:2.3mm;
    font-size:8.3px; color:#64748b;
    display:flex; justify-content:space-between; gap:8mm;
  }

  .continuation-head{
    display:flex; justify-content:space-between; align-items:center;
    border-bottom:2.2px solid #07254a; padding-bottom:4mm; margin-bottom:7mm; flex:0 0 auto;
  }
  .continuation-head .mini-logos{ display:flex; gap:3mm; align-items:center; }
  .continuation-head .mini-logo{
    width:34mm; height:13mm; border:1px solid #e3e9f1; border-radius:8px;
    background:#fff; padding:1.2mm; display:flex; align-items:center; justify-content:center;
  }
  .continuation-head img{ width:100%; height:100%; object-fit:contain; }
  .continuation-head .mini-logo.asel-mini   img{ transform:scale(.96); }
  .continuation-head .mini-logo.koster-mini img{ transform:scale(.78); }
  .continuation-title    { text-align:right; }
  .continuation-title h2 { margin:0; color:#07254a; font-size:15px; letter-spacing:.3px; }
  .continuation-title p  { margin:1mm 0 0; color:#64748b; font-size:8.5px; }

  .wide{ display:grid; grid-template-columns:1fr; gap:6mm; flex:1 1 auto; align-content:start; }
  .analysis-row{ display:grid; grid-template-columns:1fr 1fr; gap:5mm; }
  .page-2 .box h3{ font-size:10px; padding:2.8mm 3.4mm; }
  .page-2 .box .content{
    font-size:11px; line-height:1.6; padding:4mm;
    text-align:justify;
    hyphens:auto;
    -webkit-hyphens:auto;
    word-spacing:-0.02em;
  }

  .conclusion{ border:1.8px solid #efb4b4; background:#fff; border-radius:12px; overflow:hidden; }
  .conclusion h3{
    margin:0; background:#fff; color:#b5a3a3; font-size:10px;
    letter-spacing:.35px; padding:2.8mm 3.4mm; text-transform:uppercase; border-bottom:0;
  }
  .conclusion .content{
    padding:4mm; font-size:11.2px; line-height:1.58; font-weight:700; color:#1d2634; overflow:hidden;
    text-align:justify;
    hyphens:auto;
    -webkit-hyphens:auto;
  }

  .signatures{ margin-top:auto; display:grid; grid-template-columns:1fr 1fr 1fr; gap:4mm; }
  .sign{ border:1px solid #d6e0eb; border-radius:10px; min-height:25mm; background:#fff; overflow:hidden; }
  .sign b{
    display:block; padding:2.5mm 3mm; font-size:8.8px;
    color:#07254a; border-bottom:1px solid #d6e0eb;
  }
  .sign span{ display:block; padding:3mm; font-size:9px; color:#263445; }

  .footer{
    margin-top:5mm; border-top:2px solid #07254a; padding-top:3mm;
    display:grid; grid-template-columns:1.35fr 1fr .95fr; gap:4mm;
  }
  .footer div{
    border:1px solid #d6e0eb; border-radius:10px; padding:3mm;
    font-size:8.2px; color:#334155; line-height:1.35; background:#fff;
  }
  .footer b{ display:block; color:#07254a; font-size:8.8px; margin-bottom:1mm; }
</style>

<!-- ── SAYFA 1 ───────────────────────────────────────────────────────────── -->
<article class="page page-1">
  <div class="report">
    <header class="report-header">
      <div class="logos">
        <div class="logo-card logo-asel"><img src="${ASEL_LOGO}" alt="ASEL Group"></div>
        <div class="logo-card logo-koster"><img src="${KOSTER_LOGO}" alt="KÖSTER Waterproofing Systems"></div>
      </div>
      <div class="meta">
        <div class="meta-row"><div class="meta-label">RAPOR NO</div><div class="meta-val">${esc(raporNo)}</div></div>
        <div class="meta-row"><div class="meta-label">TARİH</div><div class="meta-val">${esc(tarihTr(raporTarihi))}</div></div>
        <div class="meta-row"><div class="meta-label">PROJE</div><div class="meta-val">${esc(kayit.santiye)}</div></div>
        <div class="meta-row"><div class="meta-label">HAZIRLAYAN</div><div class="meta-val">${esc(hazirlayan)}</div></div>
      </div>
    </header>

    <section class="title-band">
      <div>
        <h1>TEKNİK TESPİT VE DEĞERLENDİRME RAPORU</h1>
        <p>Ürün teknik föyü, saha fotoğrafları ve kullanıcı beyanı esas alınarak hazırlanmıştır.</p>
      </div>
      <div class="badge">${esc(konum)}</div>
    </section>

    <section class="grid-main">
      <div class="stack">
        <div class="box">
          <h3>1. Proje Bilgileri</h3>
          <div class="content">
            <div class="kv"><b>Proje:</b><span>${esc(kayit.santiye)}</span></div>
            <div class="kv"><b>Konum:</b><span>${esc(konum)}</span></div>
            <div class="kv"><b>Alan:</b><span>${esc(kayit.uygulamaAlani)}</span></div>
            <div class="kv"><b>Aşama:</b><span>${esc(asama.sira)} / ${esc((kayit.asamalar || []).length)}</span></div>
            <div class="kv"><b>Rapor Tarihi:</b><span>${esc(tarihTr(raporTarihi))}</span></div>
          </div>
        </div>

        <div class="box">
          <h3>2. Kullanıcı Beyanı / Olay Açıklaması</h3>
          <div class="content">${yorumHtml}</div>
        </div>

        <div class="box">
          <h3>3. Kullanılan Malzeme</h3>
          <div class="content">
            <div class="kv"><b>Ürün:</b><span>${esc(malzeme)}</span></div>
            <div class="kv"><b>Föy:</b><span>${foyDurumu}</span></div>
            <div style="margin-top:1.5mm">${esc(ai.materialDescription || "—")}</div>
          </div>
        </div>

        <div class="box">
          <h3>4. Uygulama Özeti</h3>
          <div class="content">${esc(ai.applicationSummary || "—")}</div>
        </div>
      </div>

      <div class="stack">
        <div class="box">
          <h3>5. Saha Gözlemi</h3>
          <div class="content">${esc(ai.fieldObservation || "—")}</div>
        </div>

        <div class="box photo-section">
          <h3>Fotoğraf Kanıtları</h3>
          <div class="content">${fotoGridHtml(fotolar)}</div>
        </div>
      </div>
    </section>

    <footer class="page-note">
      <span>Madde 1–5: saha beyanı, malzeme ve görsel tespit alanıdır.</span>
      <span>Sayfa 1 / 2</span>
    </footer>
  </div>
</article>

<!-- ── SAYFA 2 ───────────────────────────────────────────────────────────── -->
<article class="page page-2">
  <div class="report">
    <header class="continuation-head">
      <div class="mini-logos">
        <div class="mini-logo asel-mini"><img src="${ASEL_LOGO}" alt="ASEL Group"></div>
        <div class="mini-logo koster-mini"><img src="${KOSTER_LOGO}" alt="KÖSTER Waterproofing Systems"></div>
      </div>
      <div class="continuation-title">
        <h2>TEKNİK DEĞERLENDİRME DEVAMI</h2>
        <p>${esc(raporNo)} · ${esc(tarihTr(raporTarihi))} · ${esc(konum)}</p>
      </div>
    </header>

    <section class="wide">
      <div class="analysis-row">
        <div class="box">
          <h3>6. Hasar / Uygunsuzluk Analizi</h3>
          <div class="content">${esc(ai.damageAnalysis || "—")}</div>
        </div>
        <div class="box">
          <h3>7. İlgili Teknik Kaynaklar / Föy Bilgileri</h3>
          <div class="content">${esc(teknikRefMetin)}</div>
        </div>
      </div>

      <section class="conclusion">
        <h3>8. Sonuç ve Sorumluluk</h3>
        <div class="content">${esc(ai.conclusionText || "—")}</div>
      </section>
    </section>

    <section class="signatures">
      <div class="sign"><b>Hazırlayan</b><span>${esc(hazirlayan)}</span></div>
      <div class="sign"><b>Kontrol</b><span>Teknik Kontrol</span></div>
      <div class="sign"><b>Onay</b><span>Yetkili Onay</span></div>
    </section>

    <footer class="footer">
      <div><b>Adres</b>Organize Sanayi Bölgesi 7.Sokak, No:16, Lefkoşa / KKTC</div>
      <div><b>E-Mail</b>bilgi@aselgroup.com</div>
      <div><b>Telefon</b>+90 392 225 29 04</div>
    </footer>
  </div>
</article>
`;
}

// ─── Ana akış: rapor üret ────────────────────────────────────────────────────

window.raporUret = async () => {
  if (!aktifBaglam) return;
  const yorumEl = el("rapor-yorum");
  const yorum = (yorumEl?.value || "").trim();
  if (yorum.length < 20) { toast("Yorum en az 20 karakter olmalı", "warn"); return; }

  const { kayit, asama } = aktifBaglam;
  const oturum = oturumYukle();
  if (!oturum) { toast("Oturum kapalı", "err"); return; }

  stepGoster("yukleniyor");
  yukleniyorMesaj("Fotoğraflar hazırlanıyor…", 1, 3);

  try {
    // 1) Foto seçimi + sıkıştırma + base64 (paralel)
    const seciliFotolar = fotograflariSec(asama);
    if (!seciliFotolar.length) throw new Error("Bu aşamada fotoğraf yok");

    yukleniyorMesaj(`Fotoğraflar hazırlanıyor… (${seciliFotolar.length} adet, paralel)`, 1, 3);
    const hazirlananlar = await Promise.all(seciliFotolar.map(fotografHazirla));

    // 2) /rapor — Gemini çağrısı
    yukleniyorMesaj("AI değerlendirmesi yapılıyor…", 2, 3);
    const aiCevabi = await fetch(`${DRIVE_URL}/rapor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        yorum,
        malzeme: asama.malzeme || "",
        santiye: kayit.santiye,
        alan: kayit.uygulamaAlani,
        fotolar: hazirlananlar.map(f => ({
          type: f.type, mimeType: f.mimeType, data: f.data,
        })),
      }),
    }).then(r => r.json());

    if (!aiCevabi || aiCevabi.basarili === false) {
      throw new Error(aiCevabi?.hata || "AI cevabı alınamadı");
    }

    // 3) PDF üretimi
    yukleniyorMesaj("PDF oluşturuluyor…", 3, 3);

    const raporTarihi = new Date().toISOString();
    const raporNo = `ASEL-TR-${kayit.id.slice(0, 8).toUpperCase()}-${asama.sira}`;
    const hazirlayan = oturum.ad || oturum.email || "ASEL Group";

    const html = pdfHtml({
      kayit, asama, yorum,
      ai: aiCevabi.rapor,
      foyBulundu: !!aiCevabi.foyBulundu,
      foyDosyaAdi: aiCevabi.foyDosyaAdi,
      fotolar: hazirlananlar,
      hazirlayan, raporTarihi, raporNo,
    });

    const tmpl = el("rapor-template-container");
    tmpl.innerHTML = html;
    tmpl.style.visibility = "visible"; // html2canvas için aç
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 300));

    const rect = tmpl.getBoundingClientRect();
    console.log("Container ölçü:", rect.width, "x", rect.height);

    try {
      // Her .page elementini ayrı ayrı render et
      const pages = tmpl.querySelectorAll(".page");
      console.log("Sayfa sayısı:", pages.length);

      if (!window.html2canvas) throw new Error("html2canvas yüklenmedi");
      if (!window.jspdf) throw new Error("jsPDF yüklenmedi");

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pRect = page.getBoundingClientRect();
        console.log(`Sayfa ${i + 1} ölçü: ${pRect.width} x ${pRect.height}`);

        const canvas = await window.html2canvas(page, {
          scale: 3,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: true,
          width: pRect.width,
          height: pRect.height,
          windowWidth: pRect.width,
          windowHeight: pRect.height,
          x: 0,
          y: 0,
          scrollX: 0,
          scrollY: 0,
        });

        const imgData = canvas.toDataURL("image/png");
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
      }

      const pdfBlob = pdf.output("blob");
      const pdfBase64 = await blobToBase64(pdfBlob);

      // 4) /raporPdf — Drive'a yükle
      yukleniyorMesaj("Drive'a yükleniyor…", 3, 3);

      const dosyaAdi =
        `${slugify(kayit.santiye)}_${slugify(kayit.uygulamaAlani)}_Asama-${asama.sira}_${tarihDamgaIso()}.pdf`;

      const driveSonuc = await fetch(`${DRIVE_URL}/raporPdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          santiye: kayit.santiye,
          alan: kayit.uygulamaAlani,
          asama: asama.sira,
          dosyaAdi,
        }),
      }).then(r => r.json());

      if (!driveSonuc || driveSonuc.basarili === false) {
        throw new Error(driveSonuc?.hata || "PDF Drive'a yüklenemedi");
      }

      // 5) Supabase INSERT (audit) — başarısızsa kullanıcıyı uyar ama linki göster
      let auditNot = "";
      try {
        await dbPost("santiye_raporlar", {
          record_id:        kayit.id,
          asama_no:         asama.sira,
          bolge:            app.bolge || null,
          yorum:            yorum,
          ai_cevap_json:    aiCevabi.rapor,
          foy_dosya_adi:    aiCevabi.foyBulundu ? (aiCevabi.foyDosyaAdi || null) : null,
          drive_url:        driveSonuc.fileUrl,
          drive_file_id:    driveSonuc.fileId,
          hazirlayan:       hazirlayan,
          hazirlayan_email: oturum.email || null,
        });
      } catch (e) {
        console.warn("santiye_raporlar INSERT başarısız", e);
        auditNot = "Rapor üretildi ve Drive'a yüklendi, ancak rapor geçmişine kaydedilemedi.";
        toast(auditNot, "warn", 6000);
      }

      // 6) Sonuç ekranı
      sonucGoster(driveSonuc.fileUrl, driveSonuc.fileName, auditNot);
      tmpl.innerHTML = "";
    } finally {
      tmpl.style.visibility = "hidden"; // her durumda kapat
    }

  } catch (err) {
    console.error("Rapor üretim hatası", err);
    hataGoster(err.message || "Beklenmeyen hata");
  }
};

function yukleniyorMesaj(text, adim, toplam) {
  const t = el("rapor-yukleniyor-text");
  if (t) t.textContent = text;
  const s = el("rapor-yukleniyor-step");
  if (s) s.textContent = `Adım ${adim} / ${toplam}`;
}

function sonucGoster(url, ad, not) {
  stepGoster("sonuc");
  const linkEl = el("rapor-sonuc-link");
  if (linkEl) {
    linkEl.href = url;
    linkEl.textContent = ad || "Raporu Aç";
  }
  const notEl = el("rapor-sonuc-not");
  if (notEl) {
    notEl.textContent = not || "";
    notEl.style.display = not ? "block" : "none";
  }
}

function hataGoster(mesaj) {
  stepGoster("hata");
  const m = el("rapor-hata-text");
  if (m) m.textContent = mesaj;
}
