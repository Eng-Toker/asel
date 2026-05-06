// export.js — Log dışa aktarma (Excel, PDF)

import { app } from "./state.js";
import { el, esc, toast } from "./utils.js";
import { isMisafir } from "./auth.js";
import { piiPrefetch, piiGoster } from "./pii-helpers.js";

function filtreliSatirlar() {
  const sF = el("log-filter-santiye")?.value || "";
  const dF = el("log-filter-durum")?.value || "";
  const aF = (el("log-filter-ara")?.value || "").toLowerCase();
  return app.logSatirlar.filter((s) => {
    if (sF && s.santiye !== sF) return false;
    if (dF && s.durum !== dF) return false;
    if (aF && !s.alan?.toLowerCase().includes(aF) && !s.malzeme?.toLowerCase().includes(aF)) return false;
    return true;
  });
}

const safeCell = (v) => {
  const s = String(v ?? "");
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
};

async function xlsxYukle() {
  if (window.XLSX) return true;
  toast("Excel kütüphanesi yükleniyor...", "info", 1500);
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.integrity = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";
    s.crossOrigin = "anonymous";
    s.referrerPolicy = "no-referrer";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  }).catch(() => toast("Excel kütüphanesi yüklenemedi", "err"));
  return !!window.XLSX;
}

window.logExcelIndir = async () => {
  if (isMisafir()) { toast("Misafir export edemez", "warn"); return; }
  if (!(await xlsxYukle())) return;
  const satirlar = filtreliSatirlar();
  if (!satirlar.length) { toast("Dışa aktarılacak kayıt yok", "warn"); return; }
  // B10: PII mask Excel export'unda da uygulanır.
  await piiPrefetch(satirlar.map((s) => s.duzenleyen));
  const basliklar = ["Tarih", "Saat", "Düzenleyen", "Şantiye", "Uygulama Alanı", "Aşama", "Malzeme", "Durum", "Metraj (m²)", "Personel"];
  const veri = [
    basliklar,
    ...satirlar.map((s) => {
      const d = s.tarih ? new Date(s.tarih) : null;
      return [
        d ? d.toLocaleDateString("tr-TR") : "",
        d ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "",
        safeCell(piiGoster(s.duzenleyen) || "—"),
        safeCell(s.santiye || ""),
        safeCell(s.alan || ""),
        "Aşama " + s.asama,
        safeCell(s.malzeme || ""),
        safeCell(s.durum || ""),
        s.metraj != null ? Number(s.metraj) : "",
        safeCell((s.personeller || []).join(", ")),
      ];
    }),
  ];
  const ws = XLSX.utils.aoa_to_sheet(veri);
  ws["!cols"] = [12, 8, 14, 20, 24, 8, 24, 14, 10, 36].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Log");
  XLSX.writeFile(wb, "santiye_log_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  toast("Excel indirildi", "ok");
};

window.logPdfIndir = async () => {
  if (isMisafir()) { toast("Misafir export edemez", "warn"); return; }
  const satirlar = filtreliSatirlar();
  if (!satirlar.length) { toast("Dışa aktarılacak kayıt yok", "warn"); return; }
  // B10: PII mask PDF export'unda da uygulanır.
  await piiPrefetch(satirlar.map((s) => s.duzenleyen));
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Şantiye Log</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
  h2{font-size:16px;margin-bottom:12px}
  .meta{font-size:10px;color:#666;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}
  th{background:#f1f5f9;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border:1px solid #d1d5db}
  td{padding:7px 8px;border:1px solid #e5e7eb;vertical-align:top}
  tr:nth-child(even) td{background:#f9fafb}
  .badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700}
  .wait{background:#f3f4f6;color:#4b5563}.progress{background:#fef3c7;color:#92400e}.done{background:#dcfce7;color:#166534}
  .giris{background:#dcfce7;color:#166534}.cikis{background:#fee2e2;color:#991b1b}
  @media print{body{margin:10px}}
</style></head><body>
<h2>Şantiye İş Takip — Log</h2>
<div class="meta">Oluşturma: ${esc(new Date().toLocaleString("tr-TR"))} · ${satirlar.length} kayıt</div>
<table><thead><tr>
  <th>Tarih</th><th>Saat</th><th>Düzenleyen</th><th>Şantiye</th><th>Uygulama Alanı</th><th>Aşama</th>
  <th>Malzeme</th><th>Durum</th><th>Metraj</th><th>Personel</th>
</tr></thead><tbody>
${satirlar.map((s) => {
    const d = s.tarih ? new Date(s.tarih) : null;
    const durumCls = s.durum === "Tamamlandı" ? "done" : s.durum === "Devam Ediyor" ? "progress" : "wait";
    return `<tr>
    <td>${d ? esc(d.toLocaleDateString("tr-TR")) : "—"}</td>
    <td>${d ? esc(d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })) : "—"}</td>
    <td><b>${esc(piiGoster(s.duzenleyen) || "—")}</b></td>
    <td>${esc(s.santiye || "")}</td><td>${esc(s.alan || "")}</td><td>Aşama ${esc(s.asama)}</td>
    <td>${esc(s.malzeme || "—")}</td>
    <td><span class="badge ${durumCls}">${esc(s.durum || "")}</span></td>
    <td>${s.metraj != null ? esc(s.metraj + " m²") : "—"}</td>
    <td>${esc((s.personeller || []).join(", ") || "—")}</td>
  </tr>`;
  }).join("")}
</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
</body></html>`);
  w.document.close();
};

// ── Stok > Envanter export ────────────────────────────────────────────────
function envanterSatirlari() {
  const q = (el("stok-ara")?.value || "").toLowerCase();
  const tum = app.malzemelerFull || [];
  const filtered = q ? tum.filter((m) => (m.name || "").toLowerCase().includes(q)) : tum;

  const stokMap = {};
  for (const s of (app.stok || [])) {
    if (s.bolge !== app.bolge) continue;
    stokMap[s.malzeme_id] = s;
  }
  const sahaNet = {};
  for (const h of (app.stokHareket || [])) {
    if (!h.santiye) continue;
    if (h.bolge !== app.bolge) continue;
    sahaNet[h.malzeme_id] = (sahaNet[h.malzeme_id] || 0) +
      (h.tip === "cikis" ? Number(h.miktar || 0) : -Number(h.miktar || 0));
  }

  return filtered.map((m) => {
    const stokRow = stokMap[m.id];
    const depo    = stokRow ? Number(stokRow.mevcut_stok ?? 0) : 0;
    const sahada  = sahaNet[m.id] || 0;
    return {
      ad: m.name || "",
      birim: m.birim || "",
      toplam: depo + sahada,
      depo,
      sahada,
      sonGuncelleme: stokRow?.updated_at || null,
    };
  });
}

window.stokEnvanterExcelIndir = async () => {
  if (isMisafir()) { toast("Misafir export edemez", "warn"); return; }
  if (!(await xlsxYukle())) return;
  const satirlar = envanterSatirlari();
  if (!satirlar.length) { toast("Dışa aktarılacak kayıt yok", "warn"); return; }

  const basliklar = ["Malzeme", "Birim", "Toplam (Elimizdeki)", "Depo", "Sahalarda", "Son Güncelleme"];
  const veri = [
    basliklar,
    ...satirlar.map((s) => [
      safeCell(s.ad),
      safeCell(s.birim),
      Number(s.toplam),
      Number(s.depo),
      Number(s.sahada),
      s.sonGuncelleme ? new Date(s.sonGuncelleme).toLocaleDateString("tr-TR") : "—",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(veri);
  ws["!cols"] = [28, 8, 18, 12, 12, 14].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Envanter");
  const bolgeSuffix = app.bolge ? "_" + app.bolge : "";
  XLSX.writeFile(wb, "stok_envanter" + bolgeSuffix + "_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  toast("Excel indirildi", "ok");
};

window.stokEnvanterPdfIndir = async () => {
  if (isMisafir()) { toast("Misafir export edemez", "warn"); return; }
  const satirlar = envanterSatirlari();
  if (!satirlar.length) { toast("Dışa aktarılacak kayıt yok", "warn"); return; }
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Stok Envanter</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
  h2{font-size:16px;margin-bottom:12px}
  .meta{font-size:10px;color:#666;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}
  th{background:#f1f5f9;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border:1px solid #d1d5db}
  td{padding:7px 8px;border:1px solid #e5e7eb;vertical-align:top}
  tr:nth-child(even) td{background:#f9fafb}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .neg{color:#991b1b;font-weight:700}
  .zero{color:#6b7280}
  @media print{body{margin:10px}}
</style></head><body>
<h2>Malzeme Stoğu — Envanter${app.bolge ? " · " + esc(app.bolge) : ""}</h2>
<div class="meta">Oluşturma: ${esc(new Date().toLocaleString("tr-TR"))} · ${satirlar.length} malzeme</div>
<table><thead><tr>
  <th>Malzeme</th><th>Birim</th>
  <th class="num">Toplam (Elimizdeki)</th><th class="num">Depo</th><th class="num">Sahalarda</th>
  <th>Son Güncelleme</th>
</tr></thead><tbody>
${satirlar.map((s) => {
    const depoCls = s.depo < 0 ? "num neg" : (s.depo === 0 ? "num zero" : "num");
    return `<tr>
    <td><b>${esc(s.ad)}</b></td>
    <td>${esc(s.birim || "—")}</td>
    <td class="num">${esc(s.toplam)}</td>
    <td class="${depoCls}">${esc(s.depo)}</td>
    <td class="num">${esc(s.sahada)}</td>
    <td>${s.sonGuncelleme ? esc(new Date(s.sonGuncelleme).toLocaleDateString("tr-TR")) : "—"}</td>
  </tr>`;
  }).join("")}
</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
</body></html>`);
  w.document.close();
};

// ── Stok > Hareket Geçmişi export ─────────────────────────────────────────
function hareketSatirlari() {
  const tipF = el("malzeme-log-tip")?.value || "";
  const sanF = el("malzeme-log-santiye")?.value || "";
  const arF  = (el("malzeme-log-ara")?.value || "").toLowerCase();
  return (app.stokHareket || []).filter((h) => {
    if (tipF && h.tip !== tipF) return false;
    if (sanF && (h.santiye || "") !== sanF) return false;
    if (arF) {
      const ad   = (h.malzemeler?.name || "").toLowerCase();
      const acik = (h.aciklama || "").toLowerCase();
      if (!ad.includes(arF) && !acik.includes(arF)) return false;
    }
    return true;
  });
}

window.stokGecmisExcelIndir = async () => {
  if (isMisafir()) { toast("Misafir export edemez", "warn"); return; }
  if (!(await xlsxYukle())) return;
  const satirlar = hareketSatirlari();
  if (!satirlar.length) { toast("Dışa aktarılacak kayıt yok", "warn"); return; }

  const basliklar = ["Tarih", "Saat", "Tip", "Malzeme", "Miktar", "Birim", "Şantiye", "Yapan", "Açıklama"];
  const veri = [
    basliklar,
    ...satirlar.map((h) => {
      const d = h.created_at ? new Date(h.created_at) : null;
      return [
        d ? d.toLocaleDateString("tr-TR") : "",
        d ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "",
        h.tip === "giris" ? "Depoya Dönüş" : "Depodan Çıkış",
        safeCell(h.malzemeler?.name || ""),
        h.miktar != null ? Number(h.miktar) : "",
        safeCell(h.malzemeler?.birim || ""),
        safeCell(h.santiye || ""),
        safeCell(h.yapan || ""),
        safeCell(h.aciklama || ""),
      ];
    }),
  ];
  const ws = XLSX.utils.aoa_to_sheet(veri);
  ws["!cols"] = [12, 8, 16, 24, 10, 8, 20, 16, 36].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hareket");
  const bolgeSuffix = app.bolge ? "_" + app.bolge : "";
  XLSX.writeFile(wb, "stok_hareket" + bolgeSuffix + "_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  toast("Excel indirildi", "ok");
};

window.stokGecmisPdfIndir = async () => {
  if (isMisafir()) { toast("Misafir export edemez", "warn"); return; }
  const satirlar = hareketSatirlari();
  if (!satirlar.length) { toast("Dışa aktarılacak kayıt yok", "warn"); return; }
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Stok Hareket Geçmişi</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
  h2{font-size:16px;margin-bottom:12px}
  .meta{font-size:10px;color:#666;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}
  th{background:#f1f5f9;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border:1px solid #d1d5db}
  td{padding:7px 8px;border:1px solid #e5e7eb;vertical-align:top}
  tr:nth-child(even) td{background:#f9fafb}
  .badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700}
  .giris{background:#dcfce7;color:#166534}.cikis{background:#fee2e2;color:#991b1b}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  @media print{body{margin:10px}}
</style></head><body>
<h2>Malzeme Stoğu — Hareket Geçmişi${app.bolge ? " · " + esc(app.bolge) : ""}</h2>
<div class="meta">Oluşturma: ${esc(new Date().toLocaleString("tr-TR"))} · ${satirlar.length} kayıt</div>
<table><thead><tr>
  <th>Tarih</th><th>Saat</th><th>Tip</th>
  <th>Malzeme</th><th class="num">Miktar</th>
  <th>Şantiye</th><th>Yapan</th><th>Açıklama</th>
</tr></thead><tbody>
${satirlar.map((h) => {
    const d = h.created_at ? new Date(h.created_at) : null;
    const tipCls  = h.tip === "giris" ? "giris" : "cikis";
    const tipText = h.tip === "giris" ? "↑ Depoya Dönüş" : "↓ Depodan Çıkış";
    const birim   = h.malzemeler?.birim || "";
    return `<tr>
    <td>${d ? esc(d.toLocaleDateString("tr-TR")) : "—"}</td>
    <td>${d ? esc(d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })) : "—"}</td>
    <td><span class="badge ${tipCls}">${tipText}</span></td>
    <td><b>${esc(h.malzemeler?.name || "—")}</b></td>
    <td class="num">${esc(h.miktar)}${birim ? " " + esc(birim) : ""}</td>
    <td>${esc(h.santiye || "—")}</td>
    <td>${esc(h.yapan || "—")}</td>
    <td>${esc(h.aciklama || "—")}</td>
  </tr>`;
  }).join("")}
</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
</body></html>`);
  w.document.close();
};
