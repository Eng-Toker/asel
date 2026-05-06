// modals/stok-santiye.js — Şantiye detay 📦 ikon → "Bu şantiyede mevcut
// malzemeler" + "Malzeme Gönder" / "Malzeme Geri Al" akışı.
//
// Model:
//   - Gönder = depo stoğu azalır, şantiye toplamı artar
//             (stok_hareket: tip='cikis', santiye=X)
//   - Geri al = depo stoğu artar, şantiye toplamı azalır
//             (stok_hareket: tip='giris', santiye=X)
//
// Şantiyede şu anki net = sum(cikis_to_X) - sum(giris_from_X).

import { app } from "../state.js";
import { el, esc, parseNum, toast, tarihKisa } from "../utils.js";
import { isMisafir, oturumYukle } from "../auth.js";
import { dbPost, dbPatch } from "../db.js";

const BIRIMLER = ["kg", "lt", "Adet", "Kova", "Paket", "Rulo", "Torba", "Çuval", "Koli", "m", "m2", "m3"];

let _formMode    = null;   // null | "gonder" | "geri"
let _secSantiye  = null;
let _formMalzeme = "";     // form içinde seçili malzeme uuid
let _formBirim   = "";     // malzemenin birimi yoksa user'ın seçtiği
let _formBirimManuel = false;
let _ozetEdit    = null;   // özet tablodaki edit modundaki malzeme uuid'si

// ── Modal: Aç/Kapat ────────────────────────────────────────────────────────
window.stokSantiyeAc = (santiye) => {
  if (!santiye) return;
  _secSantiye      = santiye;
  _formMode        = null;
  _formMalzeme     = "";
  _formBirim       = "";
  _formBirimManuel = false;
  _ozetEdit        = null;
  el("stok-santiye-title").textContent = "📦 " + santiye + " — Malzemeler";
  renderStokSantiyeBody();
  el("stok-santiye-modal-overlay").classList.add("open");
};

window.stokSantiyeKapat = () => {
  el("stok-santiye-modal-overlay").classList.remove("open");
  _secSantiye      = null;
  _formMode        = null;
  _formMalzeme     = "";
  _formBirim       = "";
  _formBirimManuel = false;
  _ozetEdit        = null;
};

// ── Yardımcı: bu şantiyenin malzeme net'i (cikis − giris) ─────────────────
function santiyeNetMap() {
  const m = {};
  for (const h of (app.stokHareket || [])) {
    if (h.santiye !== _secSantiye) continue;
    m[h.malzeme_id] = (m[h.malzeme_id] || 0) +
      (h.tip === "cikis" ? Number(h.miktar || 0) : -Number(h.miktar || 0));
  }
  return m;
}

// Bölge depo stok map'i
function depoStokMap() {
  const m = {};
  for (const s of (app.stok || [])) {
    if (s.bolge !== app.bolge) continue;
    m[s.malzeme_id] = Number(s.mevcut_stok || 0);
  }
  return m;
}

// ── Üst özet + form ──────────────────────────────────────────────────────
function renderStokSantiyeBody() {
  const santiye = _secSantiye;
  if (!santiye) return;

  const net = santiyeNetMap();
  const sonTarih = {};
  for (const h of (app.stokHareket || [])) {
    if (h.santiye !== santiye) continue;
    if (!sonTarih[h.malzeme_id] || new Date(h.created_at) > new Date(sonTarih[h.malzeme_id])) {
      sonTarih[h.malzeme_id] = h.created_at;
    }
  }

  const ozetSatirlari = Object.keys(net)
    .map((id) => {
      const m = (app.malzemelerFull || []).find((x) => x.id === id);
      return {
        id,
        ad: m?.name || "—",
        birim: m?.birim || "",
        net: net[id],
        son: sonTarih[id],
      };
    })
    .filter((s) => s.net !== 0)
    .sort((a, b) => b.net - a.net);

  const ozetHtml = ozetSatirlari.length
    ? `<div style="overflow-x:auto"><table class="log-table">
        <thead><tr><th>Malzeme</th><th>Şu an</th><th>Son hareket</th><th></th></tr></thead>
        <tbody>${ozetSatirlari.map((s) => {
          if (_ozetEdit === s.id && !isMisafir()) {
            return `<tr style="background:#fef9c3">
              <td>${esc(s.ad)}</td>
              <td><input class="form-input" id="ozet-edit-${esc(s.id)}" type="text" inputmode="decimal" value="${esc(s.net)}" style="height:32px;font-size:13px;width:100px" autofocus>${s.birim ? ` <span style="color:var(--muted)">${esc(s.birim)}</span>` : ""}</td>
              <td style="color:var(--muted);font-size:13px">— (kayıttan sonra)</td>
              <td style="white-space:nowrap">
                <button class="btn btn-primary btn-sm" onclick="santiyeOzetKaydet('${esc(s.id)}')">Kaydet</button>
                <button class="btn btn-sm" onclick="santiyeOzetIptal()">İptal</button>
              </td>
            </tr>`;
          }
          const negStil   = s.net < 0 ? "color:#991b1b" : "";
          const duzenleBtn = isMisafir()
            ? ""
            : `<button class="btn btn-sm" onclick="santiyeOzetDuzenleAc('${esc(s.id)}')">Düzenle</button>`;
          return `<tr>
            <td>${esc(s.ad)}</td>
            <td style="${negStil}"><strong>${esc(s.net)}</strong>${s.birim ? " " + esc(s.birim) : ""}</td>
            <td style="color:var(--muted);font-size:13px">${esc(tarihKisa(s.son))}</td>
            <td style="white-space:nowrap">${duzenleBtn}</td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>`
    : `<div class="empty" style="padding:18px">
        <div class="empty-icon">📭</div>
        <div class="empty-title">Bu şantiyede şu an malzeme yok</div>
      </div>`;

  let actionsHtml = "";
  if (!isMisafir()) {
    if (_formMode) {
      actionsHtml = `<div style="margin-top:8px">${formHtml(_formMode)}</div>`;
    } else {
      actionsHtml = `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
        <button class="btn btn-primary" onclick="stokSantiyeFormAc('gonder')">+ Malzeme Gönder</button>
        <button class="btn" onclick="stokSantiyeFormAc('geri')">↩ Malzeme Geri Al</button>
      </div>`;
    }
  }

  el("stok-santiye-body").innerHTML = ozetHtml + actionsHtml;
}

// ── Malzeme picker (form içi) ─────────────────────────────────────────────
function malzPickerHtml(mode, q = "") {
  const tum = app.malzemelerFull || [];
  const stokMap = depoStokMap();
  const netMap  = santiyeNetMap();

  const sirali = tum.slice().sort((a, b) => {
    if (mode === "geri") return (netMap[b.id] || 0) - (netMap[a.id] || 0);
    return (stokMap[b.id] ?? -Infinity) - (stokMap[a.id] ?? -Infinity);
  });
  const lst = q ? sirali.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())) : sirali;

  if (!lst.length) {
    return `<div style="padding:10px;color:var(--muted);text-align:center;font-size:13px">Eşleşen malzeme yok.</div>`;
  }

  return lst.map((m) => {
    let etk = "";
    if (mode === "gonder") {
      const stok = stokMap[m.id];
      if (stok != null) etk = ` <span style="color:var(--muted);font-size:12px">(depoda: ${esc(stok)}${m.birim ? " " + esc(m.birim) : ""})</span>`;
    } else {
      const sant = netMap[m.id] || 0;
      if (sant > 0) etk = ` <span style="color:var(--muted);font-size:12px">(şantiyede: ${esc(sant)}${m.birim ? " " + esc(m.birim) : ""})</span>`;
    }
    return `<label class="picker-item">
      <input type="radio" name="hareket-malz"
        onchange="stokHareketMalzSec('${esc(m.id)}','${esc(m.name)}')"
        ${_formMalzeme === m.id ? "checked" : ""}>
      ${esc(m.name)}${etk}
    </label>`;
  }).join("");
}

function birimPickerHtml(q = "") {
  const lst = q ? BIRIMLER.filter((b) => b.toLowerCase().includes(q.toLowerCase())) : BIRIMLER;
  const items = lst.map((b) =>
    `<label class="picker-item">
      <input type="radio" name="hareket-birim"
        onchange="hareketBirimSec('${esc(b)}')"
        ${_formBirim === b && !_formBirimManuel ? "checked" : ""}>
      ${esc(b)}
    </label>`
  ).join("");
  const digerSec = _formBirimManuel ? "checked" : "";
  return items + `<label class="picker-item">
    <input type="radio" name="hareket-birim" onchange="hareketBirimDigerAc()" ${digerSec}>
    ✏ Diğer (manuel gir)
  </label>
  <div id="hareket-birim-diger-wrap" style="${digerSec ? "" : "display:none"};padding:6px 8px">
    <input class="form-input" id="hareket-birim-diger-val"
      value="${digerSec ? esc(_formBirim) : ""}"
      placeholder="Birim adı gir..."
      oninput="hareketBirimManuelGir(this.value)"
      style="height:32px;font-size:13px"
      ${digerSec ? "" : 'readonly tabindex="-1"'}>
  </div>`;
}

function birimAlaniHtml() {
  const sec = (app.malzemelerFull || []).find((m) => m.id === _formMalzeme);
  if (!sec) {
    return `<input class="form-input" placeholder="Önce malzeme seç" readonly disabled style="background:#f9fafb">`;
  }
  if (sec.birim && !_formBirimManuel) {
    return `<input class="form-input" value="${esc(sec.birim)}" readonly style="background:#f9fafb">`;
  }
  return `<details class="picker-details">
    <summary id="hareket-birim-sum">${esc(_formBirim || "Birim seç / ara")}</summary>
    <div class="search-wrap">
      <input class="picker-search" id="hareket-birim-ara" placeholder="Birim ara..."
        oninput="hareketBirimAra(this.value);toggleClear('hareket-birim-clr',this.value)">
      <button class="search-clear" id="hareket-birim-clr"
        onclick="clearAra('hareket-birim-ara','hareket-birim-clr',()=>hareketBirimAra(''))">×</button>
    </div>
    <div class="picker-list" id="hareket-birim-list">${birimPickerHtml()}</div>
  </details>`;
}

function formHtml(mode) {
  const sec = (app.malzemelerFull || []).find((x) => x.id === _formMalzeme);
  const baslik   = mode === "gonder" ? "Malzeme Gönder (depodan şantiyeye)" : "Malzeme Geri Al (şantiyeden depoya)";
  const btnLabel = mode === "gonder" ? "Gönder" : "Geri Al";

  return `<div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:#fafafa;display:grid;gap:10px">
    <div style="font-weight:700;font-size:14px">${esc(baslik)}</div>

    <div class="form-group">
      <label class="form-label">Malzeme *</label>
      <details class="picker-details">
        <summary id="hareket-malz-sum">${esc(sec?.name || "Malzeme seç / ara")}</summary>
        <div class="search-wrap">
          <input class="picker-search" id="hareket-malz-ara" placeholder="Malzeme ara..."
            oninput="stokHareketMalzAra(this.value);toggleClear('hareket-malz-clr',this.value)">
          <button class="search-clear" id="hareket-malz-clr"
            onclick="clearAra('hareket-malz-ara','hareket-malz-clr',()=>stokHareketMalzAra(''))">×</button>
        </div>
        <div class="picker-list" id="hareket-malz-list">${malzPickerHtml(mode)}</div>
      </details>
    </div>

    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label">Birim *</label>
        <div id="hareket-birim-wrap">${birimAlaniHtml()}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Miktar *</label>
        <input class="form-input" id="hareket-miktar" type="text" inputmode="decimal" placeholder="örn: 3">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Açıklama</label>
      <input class="form-input" id="hareket-aciklama" placeholder="opsiyonel">
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">
      <span class="status" id="hareket-status"></span>
      <button class="btn" onclick="stokSantiyeFormKapat()">İptal</button>
      <button class="btn btn-primary" id="btn-hareket-kaydet" onclick="stokHareketKaydet()">${esc(btnLabel)}</button>
    </div>
  </div>`;
}

// ── Form aç/kapat ─────────────────────────────────────────────────────────
window.stokSantiyeFormAc = (mode) => {
  if (isMisafir()) { toast("Misafir bu işlemi yapamaz", "warn"); return; }
  if (mode !== "gonder" && mode !== "geri") return;
  _formMode    = mode;
  _formMalzeme = "";
  renderStokSantiyeBody();
};

window.stokSantiyeFormKapat = () => {
  _formMode    = null;
  _formMalzeme = "";
  renderStokSantiyeBody();
};

// Malzeme picker handler'ları
window.stokHareketMalzAra = (q) => {
  const l = el("hareket-malz-list");
  if (l) l.innerHTML = malzPickerHtml(_formMode, q);
};

window.stokHareketMalzSec = (id, ad) => {
  _formMalzeme     = id;
  _formBirim       = "";
  _formBirimManuel = false;
  const sumEl = el("hareket-malz-sum");
  if (sumEl) sumEl.textContent = ad || "Malzeme seç / ara";
  // Birim alanını yeni malzemeye göre yenile
  const wrap = el("hareket-birim-wrap");
  if (wrap) wrap.innerHTML = birimAlaniHtml();
  el("hareket-malz-list")?.closest("details")?.removeAttribute("open");
};

// Birim picker handler'ları (şantiye modal — distinct from stok.js)
window.hareketBirimAra = (q) => {
  const l = el("hareket-birim-list");
  if (l) l.innerHTML = birimPickerHtml(q);
};

window.hareketBirimSec = (b) => {
  _formBirim       = b;
  _formBirimManuel = false;
  const sumEl = el("hareket-birim-sum");
  if (sumEl) sumEl.textContent = b;
  const dw = el("hareket-birim-diger-wrap");
  if (dw) dw.style.display = "none";
  el("hareket-birim-list")?.closest("details")?.removeAttribute("open");
};

window.hareketBirimDigerAc = () => {
  _formBirimManuel = true;
  const dw = el("hareket-birim-diger-wrap");
  if (dw) {
    dw.style.display = "block";
    const inp = el("hareket-birim-diger-val");
    if (inp) {
      inp.removeAttribute("readonly");
      inp.removeAttribute("tabindex");
      inp.focus();
    }
  }
};

window.hareketBirimManuelGir = (v) => {
  _formBirim       = (v || "").trim();
  _formBirimManuel = true;
  const sumEl = el("hareket-birim-sum");
  if (sumEl) sumEl.textContent = _formBirim || "Birim seç / ara";
};

// ── Hareket kaydet (gonder veya geri) ─────────────────────────────────────
window.stokHareketKaydet = async () => {
  if (isMisafir()) { toast("Misafir bu işlemi yapamaz", "warn"); return; }

  const santiye   = _secSantiye;
  const mode      = _formMode;
  const malzemeId = _formMalzeme;
  const miktar    = parseNum(el("hareket-miktar")?.value);
  const aciklama  = el("hareket-aciklama")?.value?.trim() || null;

  const setStatus = (msg) => {
    const s = el("hareket-status");
    if (s) { s.textContent = msg; s.className = "status err"; }
  };

  if (!santiye)               { toast("Şantiye seçili değil", "err"); return; }
  if (!mode)                  { toast("Mod seçili değil", "err"); return; }
  if (!malzemeId)             { setStatus("Malzeme seçilmeli."); toast("Malzeme seçilmeli", "err"); return; }
  if (!miktar || miktar <= 0)  { setStatus("Miktar pozitif olmalı."); toast("Miktar pozitif olmalı", "err"); return; }

  const malzeme = (app.malzemelerFull || []).find((m) => m.id === malzemeId);
  if (!malzeme) { setStatus("Malzeme bulunamadı."); return; }

  // Birim: malzemenin DB'deki birimi öncelikli; yoksa kullanıcının seçtiği
  let birim = malzeme.birim;
  if (!birim) {
    birim = _formBirim;
    if (!birim) { setStatus("Birim seçilmeli."); toast("Birim seçilmeli", "err"); return; }
  }

  const mevcut = (app.stok || []).find(
    (s) => s.malzeme_id === malzemeId && s.bolge === app.bolge,
  );
  const mevcutStok = Number(mevcut?.mevcut_stok ?? 0);

  const tip       = mode === "gonder" ? "cikis" : "giris";
  const stokDelta = mode === "gonder" ? -miktar : miktar;
  const yeniStok  = mevcutStok + stokDelta;

  if (mode === "gonder" && yeniStok < 0) {
    const onay = confirm(
      `Stok yetersiz!\n\nMevcut: ${mevcutStok} ${birim}\nGönderilecek: ${miktar} ${birim}\n\nDevam edilirse depo stoğu ${yeniStok} ${birim} olacak (eksiye düşer).\n\nDevam edilsin mi?`,
    );
    if (!onay) return;
  }

  const btnSave = el("btn-hareket-kaydet");
  if (btnSave) { btnSave.disabled = true; btnSave.innerHTML = '<span class="spinner"></span> Kaydediliyor...'; }

  try {
    // Birim malzemeye kalıcı yaz (yoksa)
    if (!malzeme.birim) {
      await dbPatch("malzemeler", `id=eq.${encodeURIComponent(malzemeId)}`, { birim });
      malzeme.birim = birim;
    }

    if (mevcut) {
      await dbPatch("malzeme_stok", `id=eq.${encodeURIComponent(mevcut.id)}`, {
        mevcut_stok: yeniStok,
        updated_at: new Date().toISOString(),
      });
    } else {
      await dbPost("malzeme_stok", {
        malzeme_id: malzemeId,
        bolge: app.bolge || "İskele",
        mevcut_stok: yeniStok,
      });
    }

    await dbPost("stok_hareket", {
      malzeme_id: malzemeId,
      bolge: app.bolge || "İskele",
      tip,
      miktar,
      santiye,
      aciklama,
      yapan: oturumYukle()?.ad || "—",
    });

    const fiil = mode === "gonder" ? "→ " + santiye + "'ye gönderildi" : "← " + santiye + "'den geri alındı";
    toast(`${miktar} ${birim} ${malzeme.name} ${fiil}`, "ok");

    const { veriYukle } = await import("../data.js");
    await veriYukle({ sessiz: true });

    _formMode    = null;
    _formMalzeme = "";
    renderStokSantiyeBody();

    if (app.aktifView === "stok") {
      const { renderStok } = await import("../views/stok.js");
      renderStok();
    }
  } catch (err) {
    console.error(err);
    setStatus("Kaydedilemedi: " + (err.message || "Bağlantı hatası"));
    toast("Kaydedilemedi: " + (err.message || "Hata"), "err");
  } finally {
    if (btnSave) { btnSave.disabled = false; btnSave.textContent = mode === "gonder" ? "Gönder" : "Geri Al"; }
  }
};

// ── Özet tablosu satır düzenleme (şantiye-net manuel düzeltme) ───────────
window.santiyeOzetDuzenleAc = (malzemeId) => {
  if (isMisafir()) { toast("Misafir düzenleyemez", "warn"); return; }
  _ozetEdit = malzemeId;
  renderStokSantiyeBody();
};

window.santiyeOzetIptal = () => {
  _ozetEdit = null;
  renderStokSantiyeBody();
};

window.santiyeOzetKaydet = async (malzemeId) => {
  if (isMisafir()) return;

  const yeniRaw = el(`ozet-edit-${malzemeId}`)?.value || "";
  const yeniNet = parseNum(yeniRaw);
  if (yeniNet == null) { toast("Sayı olmalı", "err"); return; }

  const malzeme = (app.malzemelerFull || []).find((m) => m.id === malzemeId);
  if (!malzeme) { toast("Malzeme bulunamadı", "err"); return; }

  // Eski net (cikis − giris bu şantiye için)
  let eskiNet = 0;
  for (const h of (app.stokHareket || [])) {
    if (h.santiye !== _secSantiye) continue;
    if (h.malzeme_id !== malzemeId) continue;
    eskiNet += (h.tip === "cikis" ? Number(h.miktar || 0) : -Number(h.miktar || 0));
  }
  const delta = yeniNet - eskiNet;

  if (delta === 0) { _ozetEdit = null; renderStokSantiyeBody(); return; }

  // delta > 0: şantiyeye ekstra gönderildi (depo --, saha ++) → tip='cikis'
  // delta < 0: şantiyeden ekstra geri alındı (depo ++, saha --) → tip='giris'
  const tip       = delta > 0 ? "cikis" : "giris";
  const miktar    = Math.abs(delta);

  // Depo karşılığını da güncelle
  const mevcut    = (app.stok || []).find(
    (s) => s.malzeme_id === malzemeId && s.bolge === app.bolge,
  );
  const eskiDepo  = mevcut ? Number(mevcut.mevcut_stok || 0) : 0;
  const yeniDepo  = eskiDepo - delta; // delta > 0 → depo düşer; delta < 0 → depo artar
  const birim     = malzeme.birim || "";

  if (delta > 0 && yeniDepo < 0) {
    const onay = confirm(
      `Bu düzeltme depo stoğunu eksiye düşürecek!\n\n` +
      `Depo şu an: ${eskiDepo} ${birim}\n` +
      `Düzeltmeyle: ${yeniDepo} ${birim}\n\n` +
      `Devam edilsin mi?`,
    );
    if (!onay) return;
  }

  try {
    if (mevcut) {
      await dbPatch("malzeme_stok", `id=eq.${encodeURIComponent(mevcut.id)}`, {
        mevcut_stok: yeniDepo,
        updated_at: new Date().toISOString(),
      });
    } else {
      await dbPost("malzeme_stok", {
        malzeme_id: malzemeId,
        bolge: app.bolge || "İskele",
        mevcut_stok: yeniDepo,
      });
    }

    await dbPost("stok_hareket", {
      malzeme_id: malzemeId,
      bolge: app.bolge || "İskele",
      tip,
      miktar,
      santiye: _secSantiye,
      aciklama: "Manuel düzeltme",
      yapan: oturumYukle()?.ad || "—",
    });

    toast(`${malzeme.name}: ${_secSantiye}'de ${yeniNet} ${birim}`, "ok");
    _ozetEdit = null;

    const { veriYukle } = await import("../data.js");
    await veriYukle({ sessiz: true });
    renderStokSantiyeBody();

    if (app.aktifView === "stok") {
      const { renderStok } = await import("../views/stok.js");
      renderStok();
    }
  } catch (err) {
    console.error(err);
    toast("Kaydedilemedi: " + (err.message || "Hata"), "err");
  }
};

// ── Modal click-outside-to-close ──────────────────────────────────────────
const _santiyeOverlay = el("stok-santiye-modal-overlay");
if (_santiyeOverlay) {
  _santiyeOverlay.addEventListener("click", (e) => {
    if (e.target === _santiyeOverlay) window.stokSantiyeKapat();
  });
}
