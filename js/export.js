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

window.logExcelIndir = async () => {
  if (isMisafir()) { toast("Misafir export edemez", "warn"); return; }
  if (!window.XLSX) {
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
  }
  if (!window.XLSX) return;
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
