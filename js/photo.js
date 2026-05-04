// photo.js — Fotoğraf sıkıştırma, yükleme, silme

import { DRIVE_URL, H } from "./config.js";
import { app } from "./state.js";
import { el, toast } from "./utils.js";
import { isMisafir } from "./auth.js";
import { dbPost } from "./db.js";
import { veriYukle } from "./data.js";

export function sikistir(dosya) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(dosya);
    img.onload = () => {
      const MAX = 1400;
      let g = img.width, y = img.height;
      if (g > MAX || y > MAX) {
        if (g > y) { y = Math.round((y * MAX) / g); g = MAX; }
        else       { g = Math.round((g * MAX) / y); y = MAX; }
      }
      const c = document.createElement("canvas");
      c.width = g; c.height = y;
      c.getContext("2d").drawImage(img, 0, 0, g, y);
      URL.revokeObjectURL(url);
      c.toBlob((b) => resolve(b), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

window.kameraAc = (i) => {
  if (isMisafir()) { toast("Misafir foto yükleyemez", "warn"); return; }
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*";
  if (/Android|iPhone|iPad/i.test(navigator.userAgent)) input.capture = "environment";
  input.onchange = () => window.fotografEkle(i, input);
  input.click();
};

window.fotografEkle = async (i, input) => {
  if (isMisafir()) { toast("Misafir foto yükleyemez", "warn"); return; }
  const dosyalar = Array.from(input.files || []);
  if (!dosyalar.length) return;
  const a = app.form.asamalar[i];
  const santiye = app.secilenSantiye || "";
  const alan =
    el("f-alan")?.value.trim() ||
    (app.duzenlenenId ? app.kayitlar.find((r) => r.id === app.duzenlenenId)?.uygulamaAlani : "") ||
    "Yeni";

  const progressEl = el(`foto-progress-${i}`);
  const saveBtn = el("btn-save");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<span class="spinner"></span> Yükleniyor...'; }

  const toplam = dosyalar.length;
  let tamamlanan = 0, hatali = 0;

  const progressGuncelle = (yukleniyor, yuzde) => {
    if (!progressEl) return;
    progressEl.innerHTML = yukleniyor
      ? `<div class="progress-row">
          <div class="progress-text">${tamamlanan}/${toplam} tamamlandı${hatali ? ` · ${hatali} hata` : ""}</div>
          <div class="progress-bar"><div style="width:${yuzde}%"></div></div>
        </div>`
      : "";
  };

  progressGuncelle(true, 0);

  for (const [idx, dosya] of dosyalar.entries()) {
    const blob = await sikistir(dosya);
    if (!blob) { toast("İşlenemedi: " + dosya.name, "err"); hatali++; continue; }
    const base64 = await new Promise((res) => {
      const r = new FileReader(); r.onload = (e) => res(e.target.result); r.readAsDataURL(blob);
    });
    progressGuncelle(true, (idx / toplam) * 100);
    try {
      const resp = await fetch(DRIVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: H.Authorization },
        body: JSON.stringify({
          imageData: base64,
          fileName: Date.now() + "-" + dosya.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
          santiye, alan, bolge: app.bolge || "İskele",
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Yükleme hatası");
      a.yeniFotolar.push({ dosya, prev: data.fileUrl, driveUrl: data.fileUrl, driveId: data.fileId });
      tamamlanan++;
      progressGuncelle(true, (tamamlanan / toplam) * 100);
    } catch (err) {
      hatali++;
      toast("Foto yüklenemedi: " + err.message, "err");
    }
  }

  progressGuncelle(false, 100);
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Kaydet"; }
  input.value = "";
  if (tamamlanan) toast(`${tamamlanan} fotoğraf yüklendi`, "ok", 2000);
  // Dynamic import — record.js depends on photo.js window globals so we break the cycle here
  const { renderModal } = await import("./modals/record.js");
  renderModal();
};

window.hasarFotoYukle = async (recId, asamaSira) => {
  if (isMisafir()) { toast("Misafir hasar fotoğrafı ekleyemez", "warn"); return; }
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*"; input.multiple = true;
  input.onchange = async () => {
    const dosyalar = Array.from(input.files || []);
    if (!dosyalar.length) return;
    const rec = app.kayitlar.find((r) => r.id === recId);
    if (!rec) return;
    const santiye = rec.santiye;
    const alan = rec.uygulamaAlani + " [HASAR]";
    let yuklenen = 0;
    toast(`${dosyalar.length} hasar fotoğrafı yükleniyor...`, "info", 2000);
    for (const dosya of dosyalar) {
      const blob = await sikistir(dosya);
      if (!blob) continue;
      const base64 = await new Promise((res) => {
        const r = new FileReader(); r.onload = (e) => res(e.target.result); r.readAsDataURL(blob);
      });
      try {
        const resp = await fetch(DRIVE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: H.Authorization },
          body: JSON.stringify({
            imageData: base64,
            fileName: "HASAR-" + Date.now() + "-" + dosya.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
            santiye, alan, bolge: app.bolge || "İskele",
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error);
        await dbPost("record_fotograflar", {
          record_id: recId, asama_no: asamaSira,
          file_url: data.fileUrl, file_id: data.fileId, hasar: true,
        });
        yuklenen++;
      } catch (err) {
        toast("Yüklenemedi: " + err.message, "err");
      }
    }
    if (yuklenen > 0) {
      toast(`${yuklenen} hasar fotoğrafı yüklendi`, "ok");
      await veriYukle({ sessiz: true });
      const { renderDetay } = await import("./views/detail.js");
      renderDetay();
    }
  };
  input.click();
};

window.formFotoSil = async (i, fotoId, filePath) => {
  const a = app.form.asamalar[i];
  a.silinecek.push({ id: fotoId, file_path: filePath });
  a.fotograflar = a.fotograflar.filter((f) => f.id !== fotoId);
  const { renderModal } = await import("./modals/record.js");
  renderModal();
};

window.yeniFotoSil = async (i, fi) => {
  URL.revokeObjectURL(app.form.asamalar[i].yeniFotolar[fi].prev);
  app.form.asamalar[i].yeniFotolar.splice(fi, 1);
  const { renderModal } = await import("./modals/record.js");
  renderModal();
};

window.formFotoBak = (i, fi) => {
  const a = app.form.asamalar[i];
  import("./lightbox.js").then(({ lbAc }) =>
    lbAc(
      [...(a.fotograflar || []).map((f) => f.url), ...(a.yeniFotolar || []).map((f) => f.prev)],
      fi,
    )
  );
};
