// rapor.js — AI Teknik Rapor (Gemini + Drive PDF)
// Akış:
//   1. raporModalAc(recId, asamaSira) → modal aç
//   2. Kullanıcı yorum yazar → raporUret()
//   3. Worker /rapor → metin
//   4. html2pdf ile PDF üret
//   5. Worker /raporPdf → Drive'a yükle, link göster

import { DRIVE_URL } from "./config.js";
import { app } from "./state.js";
import { el, esc, toast } from "./utils.js";

const raporState = {
  recordId: null,
  asamaSira: null,
  santiye: null,
  alan: null,
  malzeme: null,
};

window.raporModalAc = (recordId, asamaSira) => {
  const rec = app.kayitlar.find((r) => r.id === recordId);
  if (!rec) return;
  const asama = (rec.asamalar || []).find((a) => a.sira === asamaSira);
  if (!asama) return;

  raporState.recordId = recordId;
  raporState.asamaSira = asamaSira;
  raporState.santiye = rec.santiye;
  raporState.alan = rec.uygulamaAlani;
  raporState.malzeme = asama.malzeme || "";

  el("rapor-modal-title").textContent =
    `${rec.santiye} → ${rec.uygulamaAlani} → Aşama ${asamaSira}`;
  el("rapor-yorum").value = "";
  el("rapor-yorum-karakter").textContent = "0 / 20";
  el("rapor-uret-btn").disabled = true;

  el("rapor-step-yorum").style.display = "";
  el("rapor-step-yukleniyor").style.display = "none";
  el("rapor-step-sonuc").style.display = "none";
  el("rapor-step-hata").style.display = "none";

  el("rapor-modal").style.display = "flex";
};

window.raporModalKapat = () => {
  el("rapor-modal").style.display = "none";
};

window.raporModalAcTekrar = () => {
  el("rapor-step-yorum").style.display = "";
  el("rapor-step-hata").style.display = "none";
};

window.raporYorumKontrol = () => {
  const v = el("rapor-yorum").value;
  el("rapor-yorum-karakter").textContent = `${v.length} / 20`;
  el("rapor-uret-btn").disabled = v.trim().length < 20;
};

window.raporUret = async () => {
  const yorum = el("rapor-yorum").value.trim();
  if (yorum.length < 20) return;

  el("rapor-step-yorum").style.display = "none";
  el("rapor-step-yukleniyor").style.display = "";

  try {
    if (typeof window.html2pdf !== "function") {
      throw new Error("PDF kütüphanesi yüklenemedi (html2pdf). Sayfayı yenileyin.");
    }

    const rec = app.kayitlar.find((r) => r.id === raporState.recordId);
    const asama = (rec.asamalar || []).find((a) => a.sira === raporState.asamaSira);
    const tumFoto = asama.fotograflar || [];
    const hasar = tumFoto.filter((f) => f.hasar).slice(-2);
    const normal = tumFoto.filter((f) => !f.hasar).slice(-3);

    el("rapor-yukleniyor-metin").textContent = "Fotoğraflar hazırlanıyor...";
    const fotoPaketi = [];
    for (const f of normal) {
      const b64 = await drivedenBase64Cek(f.url);
      if (b64) fotoPaketi.push({ type: "normal", data: b64, mimeType: "image/jpeg" });
    }
    for (const f of hasar) {
      const b64 = await drivedenBase64Cek(f.url);
      if (b64) fotoPaketi.push({ type: "hasar", data: b64, mimeType: "image/jpeg" });
    }

    el("rapor-yukleniyor-metin").textContent =
      "AI rapor üretiyor (föy + foto inceleniyor)...";
    const r1 = await fetch(`${DRIVE_URL}/rapor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        yorum,
        malzeme: raporState.malzeme,
        santiye: raporState.santiye,
        alan: raporState.alan,
        fotolar: fotoPaketi,
      }),
    });
    const d1 = await r1.json();
    if (!d1.basarili) throw new Error(d1.hata || "Bilinmeyen Worker hatası");

    el("rapor-yukleniyor-metin").textContent = "PDF üretiliyor...";
    const pdfBase64 = await raporPdfUret(d1.rapor, fotoPaketi, d1.foyBulundu, d1.foyDosyaAdi);

    el("rapor-yukleniyor-metin").textContent = "Drive'a yükleniyor...";
    const r2 = await fetch(`${DRIVE_URL}/raporPdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfBase64,
        santiye: raporState.santiye,
        alan: raporState.alan,
        asama: raporState.asamaSira,
      }),
    });
    const d2 = await r2.json();
    if (!d2.basarili) throw new Error(d2.hata || "PDF yükleme hatası");

    el("rapor-step-yukleniyor").style.display = "none";
    el("rapor-step-sonuc").style.display = "";
    el("rapor-foy-durum").textContent = d1.foyBulundu
      ? `Föy bulundu: ${d1.foyDosyaAdi}`
      : "Bu malzeme için Drive'da föy bulunamadı; rapor kullanıcı beyanı + fotoğraflarla üretildi.";
    el("rapor-drive-link").href = d2.fileUrl;
    el("rapor-drive-link").textContent = `📎 ${d2.fileName}`;
    toast("Rapor oluşturuldu", "ok");
  } catch (err) {
    console.error("Rapor üretim hatası:", err);
    el("rapor-step-yukleniyor").style.display = "none";
    el("rapor-step-hata").style.display = "";
    el("rapor-hata-metni").textContent = err.message || String(err);
  }
};

async function drivedenBase64Cek(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Foto çekilemedi:", url, e);
    return null;
  }
}

async function raporPdfUret(rapor, fotoPaketi, foyBulundu, foyDosyaAdi) {
  const tarih = new Date().toLocaleDateString("tr-TR");
  const reportNo = `R-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const fotoHTML = fotoPaketi.map((f, i) => `
    <div style="page-break-inside:avoid;margin:12px 0">
      <img src="data:${f.mimeType};base64,${f.data}"
           style="max-width:100%;max-height:240px;display:block;border:1px solid #ddd" />
      <div style="font-size:10px;color:#666;margin-top:4px">
        Fotoğraf ${i + 1} — ${f.type === "hasar" ? "⚠ HASAR" : "Normal saha"}
      </div>
    </div>
  `).join("");

  const html = `
    <div style="font-family:'Helvetica',Arial,sans-serif;color:#111;width:794px;padding:48px 56px;box-sizing:border-box;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1e40af;padding-bottom:14px;margin-bottom:24px">
        <div>
          <div style="font-size:22px;font-weight:800;color:#1e40af">ASEL ENGINEERING</div>
          <div style="font-size:11px;color:#666;margin-top:2px">Su Yalıtımı ve İzolasyon Teknik Raporu</div>
        </div>
        <div style="text-align:right;font-size:11px;color:#666">
          <div><b>Rapor No:</b> ${reportNo}</div>
          <div><b>Tarih:</b> ${tarih}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
        <tr><td style="padding:6px;background:#f3f4f6;font-weight:600;width:140px">Şantiye</td><td style="padding:6px;border-bottom:1px solid #eee">${esc(raporState.santiye)}</td></tr>
        <tr><td style="padding:6px;background:#f3f4f6;font-weight:600">Uygulama Alanı</td><td style="padding:6px;border-bottom:1px solid #eee">${esc(raporState.alan)}</td></tr>
        <tr><td style="padding:6px;background:#f3f4f6;font-weight:600">Aşama</td><td style="padding:6px;border-bottom:1px solid #eee">${raporState.asamaSira}</td></tr>
        <tr><td style="padding:6px;background:#f3f4f6;font-weight:600">Malzeme</td><td style="padding:6px;border-bottom:1px solid #eee">${esc(raporState.malzeme)}</td></tr>
        <tr><td style="padding:6px;background:#f3f4f6;font-weight:600">Föy Kaynağı</td><td style="padding:6px;border-bottom:1px solid #eee">${foyBulundu ? esc(foyDosyaAdi) : "Bulunamadı (kullanıcı beyanı + foto üzerinden)"}</td></tr>
      </table>

      <h3 style="font-size:13px;color:#1e40af;border-bottom:1px solid #1e40af;padding-bottom:4px">1. Malzeme Açıklaması</h3>
      <div style="font-size:12px;line-height:1.6;margin:8px 0 18px">${esc(rapor.materialDescription).replace(/\n/g, "<br>")}</div>

      <h3 style="font-size:13px;color:#1e40af;border-bottom:1px solid #1e40af;padding-bottom:4px">2. Uygulama Özeti</h3>
      <div style="font-size:12px;line-height:1.6;margin:8px 0 18px">${esc(rapor.applicationSummary).replace(/\n/g, "<br>")}</div>

      <h3 style="font-size:13px;color:#1e40af;border-bottom:1px solid #1e40af;padding-bottom:4px">3. Saha Gözlemi</h3>
      <div style="font-size:12px;line-height:1.6;margin:8px 0 18px">${esc(rapor.fieldObservation).replace(/\n/g, "<br>")}</div>

      <h3 style="font-size:13px;color:#1e40af;border-bottom:1px solid #1e40af;padding-bottom:4px">4. Hasar / Uygunsuzluk Analizi</h3>
      <div style="font-size:12px;line-height:1.6;margin:8px 0 18px">${esc(rapor.damageAnalysis).replace(/\n/g, "<br>")}</div>

      <h3 style="font-size:13px;color:#1e40af;border-bottom:1px solid #1e40af;padding-bottom:4px">5. Teknik Kaynaklar</h3>
      <div style="font-size:12px;line-height:1.6;margin:8px 0 18px">${esc(rapor.technicalReferences).replace(/\n/g, "<br>")}</div>

      <h3 style="font-size:13px;color:#1e40af;border-bottom:1px solid #1e40af;padding-bottom:4px">6. Saha Fotoğrafları</h3>
      <div style="margin:8px 0 18px">${fotoHTML}</div>

      <h3 style="font-size:13px;color:#1e40af;border-bottom:1px solid #1e40af;padding-bottom:4px">7. Sonuç ve Sorumluluk</h3>
      <div style="font-size:12px;line-height:1.6;margin:8px 0 18px">${esc(rapor.conclusionText).replace(/\n/g, "<br>")}</div>

      <div style="margin-top:48px;padding-top:14px;border-top:1px solid #ccc;font-size:10px;color:#666;text-align:center">
        ASEL Engineering · Organize Sanayi Bölgesi 7.Sokak No:16, Lefkoşa / KKTC · bilgi@aselgroup.com · +90 392 225 29 04<br>
        <i>Bu rapor AI destekli olarak üretilmiştir. Yetkili kişinin gözden geçirmesi gerekir.</i>
      </div>
    </div>
  `;

  const container = el("rapor-template-container");
  container.innerHTML = html;

  const opt = {
    margin: 0,
    filename: "rapor.pdf",
    image: { type: "jpeg", quality: 0.92 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#fff" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };

  const blob = await window.html2pdf().set(opt).from(container.firstElementChild).outputPdf("blob");
  container.innerHTML = "";

  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
