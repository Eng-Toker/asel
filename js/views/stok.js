// views/stok.js — Genel stok ekranı: 2 tab (Envanter + Hareket Geçmişi).
//
// Model:
//   - Envanter: depo görünümü, satır bazlı inline edit (Toplam editable, Mevcut auto).
//   - Hareket Geçmişi: stok_hareket log'u (filtre+arama).
//   - "+ Stok Ekle" butonu YOK; depo serbest düzenlenebilir.

import { app } from "../state.js";
import { el, esc, parseNum, toast } from "../utils.js";
import { isMisafir, oturumYukle } from "../auth.js";
import { dbPost, dbPatch } from "../db.js";
import { registerRender } from "../router.js";

const BIRIMLER = ["kg", "lt", "Adet", "Kova", "Paket", "Rulo", "Torba", "Çuval", "Koli", "m", "m2", "m3"];

let _stokAraQ = "";
let _duzenlenen = null; // edit modunda olan malzeme uuid'si
let _stokTab = "envanter"; // "envanter" | "gecmis" | "aletler"

// ── Tab switcher ──────────────────────────────────────────────────────────
window.stokTabDegistir = (tab) => {
  if (tab !== "envanter" && tab !== "gecmis" && tab !== "aletler") return;
  _stokTab = tab;
  renderStok();
};

// ── Ana render: tab visibility + aktif tab içeriği ───────────────────────
export function renderStok() {
  const baslik = el("stok-baslik");
  if (baslik) baslik.textContent = "Malzeme Stoğu" + (app.bolge ? " — " + app.bolge : "");

  el("tab-stok-envanter")?.classList.toggle("btn-primary", _stokTab === "envanter");
  el("tab-stok-gecmis")?.classList.toggle("btn-primary", _stokTab === "gecmis");
  el("tab-stok-aletler")?.classList.toggle("btn-primary", _stokTab === "aletler");
  el("stok-envanter-content")?.classList.toggle("hidden", _stokTab !== "envanter");
  el("stok-gecmis-content")?.classList.toggle("hidden", _stokTab !== "gecmis");
  el("stok-aletler-content")?.classList.toggle("hidden", _stokTab !== "aletler");

  if      (_stokTab === "envanter") renderEnvanter();
  else if (_stokTab === "gecmis")   renderGecmis();
  // aletler: HTML'deki statik placeholder yeterli, JS render'a gerek yok.
}

function renderEnvanter() {
  const grid = el("stok-grid");
  if (!grid) return;

  const tum = app.malzemelerFull || [];
  const q = _stokAraQ.toLowerCase();
  const filtered = q ? tum.filter((m) => (m.name || "").toLowerCase().includes(q)) : tum;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty">
      <div class="empty-icon">📦</div>
      <div class="empty-title">${q ? "Eşleşen malzeme yok" : "Malzeme listesi boş"}</div>
      <div class="empty-desc">${q ? "Aramanı değiştir." : "Ayarlar → Malzemeler'den ekleyin."}</div>
    </div>`;
    return;
  }

  // Birim önerileri için datalist
  const datalist = `<datalist id="birim-onerileri">${BIRIMLER.map((b) => `<option value="${esc(b)}">`).join("")}</datalist>`;

  const stokMap = {};
  for (const s of (app.stok || [])) {
    if (s.bolge !== app.bolge) continue;
    stokMap[s.malzeme_id] = s;
  }

  // Sahalardaki net (cikis − giris), bu bölge'deki tüm şantiyeler için toplam
  const sahaNet = {};
  for (const h of (app.stokHareket || [])) {
    if (!h.santiye) continue;        // depo intake'i atla
    if (h.bolge !== app.bolge) continue;
    sahaNet[h.malzeme_id] = (sahaNet[h.malzeme_id] || 0) +
      (h.tip === "cikis" ? Number(h.miktar || 0) : -Number(h.miktar || 0));
  }

  const rows = filtered.map((m) => {
    const stokRow = stokMap[m.id];
    const stok    = stokRow ? Number(stokRow.mevcut_stok ?? 0) : 0;     // depo
    const sahada  = sahaNet[m.id] || 0;                                  // şantiyelerde net
    const toplam  = stok + sahada;                                       // total (elimizdeki)
    const editing = _duzenlenen === m.id && !isMisafir();

    if (editing) {
      const birimHucresi = m.birim
        ? `<span style="color:var(--muted)">${esc(m.birim)}</span>`
        : `<input class="form-input" id="edit-birim-${esc(m.id)}" list="birim-onerileri" placeholder="Birim..." style="height:32px;font-size:13px">`;
      return `<tr style="background:#fef9c3">
        <td>${esc(m.name)}</td>
        <td style="text-align:center">${birimHucresi}</td>
        <td><input class="form-input" id="edit-toplam-${esc(m.id)}" type="text" inputmode="decimal" value="${esc(toplam)}" style="height:32px;font-size:13px;width:110px" autofocus></td>
        <td style="color:var(--muted);font-size:13px">— (otomatik)</td>
        <td style="white-space:nowrap">
          <button class="btn btn-primary btn-sm" onclick="stokDuzenleKaydet('${esc(m.id)}')">Kaydet</button>
          <button class="btn btn-sm" onclick="stokDuzenleIptal()">İptal</button>
        </td>
      </tr>`;
    }

    let badge = "";
    if (stok < 0)        badge = ` <span class="badge" style="background:#7f1d1d;color:#fff;margin-left:6px">EKSİDE</span>`;
    else if (stok === 0) badge = ` <span class="badge" style="background:#fee2e2;color:#991b1b;margin-left:6px">TÜKENDİ</span>`;
    const tarih = stokRow?.updated_at ? new Date(stokRow.updated_at).toLocaleDateString("tr-TR") : "—";
    const duzenleBtn = isMisafir()
      ? ""
      : `<button class="btn btn-sm" onclick="stokDuzenleAc('${esc(m.id)}')">Düzenle</button>`;

    const toplamCell = sahada !== 0
      ? `<strong>${esc(toplam)}</strong> <span style="color:var(--muted);font-size:11px">(${esc(stok)} depoda + ${esc(sahada)} sahada)</span>`
      : `<strong>${esc(toplam)}</strong>`;

    return `<tr>
      <td>${esc(m.name)}</td>
      <td style="text-align:center">${esc(m.birim || "—")}</td>
      <td>${toplamCell}</td>
      <td style="color:var(--muted)"><strong>${esc(stok)}</strong>${badge} <span style="font-size:12px">· son: ${esc(tarih)}</span></td>
      <td style="white-space:nowrap">${duzenleBtn}</td>
    </tr>`;
  }).join("");

  grid.innerHTML = datalist + `<div style="overflow-x:auto"><table class="log-table">
    <thead><tr>
      <th>Malzeme</th>
      <th style="text-align:center">Birim</th>
      <th>Toplam <span style="font-weight:400;color:var(--muted);font-size:11px">(elimizdeki, düzenlenebilir)</span></th>
      <th>Mevcut Stok <span style="font-weight:400;color:var(--muted);font-size:11px">(depo, otomatik)</span></th>
      <th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ── Hareket geçmişi tab (eski malzeme log) ──────────────────────────────
function renderGecmis() {
  // Şantiye dropdown doldur
  const filterEl = el("malzeme-log-santiye");
  if (filterEl) {
    const mevcut = filterEl.value;
    filterEl.innerHTML = '<option value="">Tüm Şantiyeler</option>' +
      (app.santiyeler || []).map((s) => {
        const ad = typeof s === "object" ? s.name : s;
        return `<option ${ad === mevcut ? "selected" : ""}>${esc(ad)}</option>`;
      }).join("");
  }
  window.malzemeLogFiltrele();
}

window.malzemeLogFiltrele = () => {
  const tipF = el("malzeme-log-tip")?.value || "";
  const sanF = el("malzeme-log-santiye")?.value || "";
  const arF  = (el("malzeme-log-ara")?.value || "").toLowerCase();

  const satirlar = (app.stokHareket || []).filter((h) => {
    if (tipF && h.tip !== tipF) return false;
    if (sanF && (h.santiye || "") !== sanF) return false;
    if (arF) {
      const ad   = (h.malzemeler?.name || "").toLowerCase();
      const acik = (h.aciklama || "").toLowerCase();
      if (!ad.includes(arF) && !acik.includes(arF)) return false;
    }
    return true;
  });

  const tbody = el("malzeme-log-tbody");
  if (tbody) {
    tbody.innerHTML = satirlar.length
      ? satirlar.map((h) => {
          const d = h.created_at ? new Date(h.created_at) : null;
          const tarih = d ? d.toLocaleDateString("tr-TR") : "—";
          const saat  = d ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—";
          const tipBadge = h.tip === "giris"
            ? '<span class="badge" style="background:#dcfce7;color:#166534" title="Şantiyeden depoya geri döndü">↑ Depoya Dönüş</span>'
            : '<span class="badge" style="background:#fee2e2;color:#991b1b" title="Depodan şantiyeye gönderildi">↓ Depodan Çıkış</span>';
          const ad    = h.malzemeler?.name || "—";
          const birim = h.malzemeler?.birim || "";
          return `<tr>
            <td>${esc(tarih)}</td><td>${esc(saat)}</td>
            <td>${tipBadge}</td>
            <td>${esc(ad)}</td>
            <td><strong>${esc(h.miktar)}</strong>${birim ? " " + esc(birim) : ""}</td>
            <td>${esc(h.santiye || "—")}</td>
            <td>${esc(h.yapan || "—")}</td>
            <td style="color:var(--muted);font-size:13px">${esc(h.aciklama || "—")}</td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">Hareket bulunamadı.</td></tr>';
  }

  const cards = el("malzeme-log-cards");
  if (cards) {
    cards.innerHTML = satirlar.length
      ? satirlar.map((h) => {
          const d = h.created_at ? new Date(h.created_at) : null;
          const tarih = d
            ? d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
            : "—";
          const tipText  = h.tip === "giris" ? "↑ Depoya Dönüş" : "↓ Depodan Çıkış";
          const tipBg    = h.tip === "giris" ? "#dcfce7" : "#fee2e2";
          const tipColor = h.tip === "giris" ? "#166534" : "#991b1b";
          const ad       = h.malzemeler?.name || "—";
          const birim    = h.malzemeler?.birim || "";
          return `<div class="log-card">
            <div class="log-card-head">
              <div>
                <div class="log-card-tarih">${esc(tarih)} · ${esc(h.yapan || "—")}</div>
                <div class="log-card-title">${esc(ad)}</div>
                <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(h.santiye || "Genel depo")}</div>
              </div>
              <span class="badge" style="background:${tipBg};color:${tipColor}">${tipText}</span>
            </div>
            <div class="log-card-meta">
              <b>Miktar:</b> ${esc(h.miktar)}${birim ? " " + esc(birim) : ""}<br>
              ${h.aciklama ? `<b>Açıklama:</b> ${esc(h.aciklama)}` : ""}
            </div>
          </div>`;
        }).join("")
      : '<div class="empty"><div class="empty-icon">📦</div><div class="empty-title">Hareket bulunamadı</div></div>';
  }
};

registerRender("stok", renderStok);

// ── Arama ─────────────────────────────────────────────────────────────────
window.stokAra = (q) => {
  _stokAraQ = q || "";
  // Edit modundayken arama yapılırsa edit'i koru — basit yaklaşım: kapat
  _duzenlenen = null;
  renderStok();
};

// ── Inline edit handler'ları ─────────────────────────────────────────────
window.stokDuzenleAc = (id) => {
  if (isMisafir()) { toast("Misafir düzenleyemez", "warn"); return; }
  _duzenlenen = id;
  renderStok();
  // Stok input'u otomatik fokusla
  const inp = el(`edit-stok-${id}`);
  if (inp) { inp.focus(); inp.select(); }
};

window.stokDuzenleIptal = () => {
  _duzenlenen = null;
  renderStok();
};

window.stokDuzenleKaydet = async (id) => {
  if (isMisafir()) return;

  const malzeme = (app.malzemelerFull || []).find((m) => m.id === id);
  if (!malzeme) { toast("Malzeme bulunamadı", "err"); return; }

  const yeniToplamRaw = el(`edit-toplam-${id}`)?.value || "";
  const yeniToplam = parseNum(yeniToplamRaw);
  if (yeniToplam == null) { toast("Toplam değeri sayı olmalı", "err"); return; }

  let birim = malzeme.birim;
  if (!birim) {
    birim = (el(`edit-birim-${id}`)?.value || "").trim();
    if (!birim) { toast("Birim girilmeli", "err"); return; }
  }

  // Sahalardaki net (bu bölge için)
  let sahada = 0;
  for (const h of (app.stokHareket || [])) {
    if (!h.santiye) continue;
    if (h.bolge !== app.bolge) continue;
    if (h.malzeme_id !== id) continue;
    sahada += (h.tip === "cikis" ? Number(h.miktar || 0) : -Number(h.miktar || 0));
  }

  // Yeni depo = yeni toplam − sahalardaki net
  const yeniDepo = yeniToplam - sahada;
  const mevcut = (app.stok || []).find(
    (s) => s.malzeme_id === id && s.bolge === app.bolge,
  );
  const eskiDepo = mevcut ? Number(mevcut.mevcut_stok || 0) : 0;
  const delta    = yeniDepo - eskiDepo;

  // Yeni depo eksiye düşerse onay iste
  if (yeniDepo < 0) {
    const onay = confirm(
      `Hesaplanan depo stoğu negatif olacak!\n\n` +
      `Yeni toplam:  ${yeniToplam} ${birim}\n` +
      `Sahalarda:    ${sahada} ${birim}\n` +
      `Depoda:       ${yeniDepo} ${birim}  ← eksiye düşüyor\n\n` +
      `Devam edilsin mi?`,
    );
    if (!onay) return;
  }

  // Hiç değişmemişse atla (birim ilk kez giriliyorsa devam)
  if (delta === 0 && malzeme.birim) {
    _duzenlenen = null;
    renderStok();
    return;
  }

  try {
    // 1) Birim ilk kez set ediliyorsa malzeme'ye yaz
    if (!malzeme.birim) {
      await dbPatch("malzemeler", `id=eq.${encodeURIComponent(id)}`, { birim });
      malzeme.birim = birim;
    }

    // 2) malzeme_stok PATCH/INSERT — yeni depo absolute
    if (mevcut) {
      await dbPatch("malzeme_stok", `id=eq.${encodeURIComponent(mevcut.id)}`, {
        mevcut_stok: yeniDepo,
        updated_at: new Date().toISOString(),
      });
    } else {
      await dbPost("malzeme_stok", {
        malzeme_id: id,
        bolge: app.bolge || "İskele",
        mevcut_stok: yeniDepo,
      });
    }

    // 3) Audit log
    if (delta !== 0) {
      await dbPost("stok_hareket", {
        malzeme_id: id,
        bolge: app.bolge || "İskele",
        tip: delta > 0 ? "giris" : "cikis",
        miktar: Math.abs(delta),
        santiye: null,
        aciklama: "Manuel düzeltme (toplam)",
        yapan: oturumYukle()?.ad || "—",
      });
    }

    toast(`${malzeme.name}: toplam ${yeniToplam} ${birim}`, "ok");
    _duzenlenen = null;
    const { veriYukle } = await import("../data.js");
    await veriYukle({ sessiz: true });
    renderStok();
  } catch (err) {
    console.error(err);
    toast("Kaydedilemedi: " + (err.message || "Hata"), "err");
  }
};
