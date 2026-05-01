// data.js — Supabase'den tüm verileri çek, app state'e yaz

import { app, DEF_S, DEF_P } from "./state.js";
import { el, parseNum } from "./utils.js";
import { dbGet, dbPost } from "./db.js";

export async function veriYukle({ sessiz = false } = {}) {
  const ov = el("loading-overlay");
  if (!sessiz && ov) ov.style.display = "flex";
  const bolgeFiltre = app.bolge ? `&bolge=eq.${encodeURIComponent(app.bolge)}` : "";
  try {
    const [sD, pD, mD] = await Promise.all([
      dbGet("santiyeler", `select=id,name,lat,lon&active=eq.true&order=sort_order,name${bolgeFiltre}`).catch(() => null),
      dbGet("personeller", `select=name&active=eq.true&order=sort_order,name${bolgeFiltre}`).catch(() => null),
      dbGet("malzemeler",  "select=name&active=eq.true&order=sort_order,name").catch(() => null),
    ]);
    if (sD?.length) app.santiyeler = sD.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon }));
    else if (sD) app.santiyeler = [];
    if (pD?.length) app.personeller = pD.map((x) => x.name);
    else if (pD) app.personeller = [];
    if (mD?.length) app.malzemeler = mD.map((x) => x.name);

    const recFilter = app.bolge ? `&bolge=eq.${encodeURIComponent(app.bolge)}` : "";
    const [rD, aD, fD] = await Promise.all([
      dbGet("santiye_records",  `select=*&order=updated_at.desc.nullslast${recFilter}`),
      dbGet("record_asamalar",  "select=*&order=record_id,sira_no").catch(() => []),
      dbGet("record_fotograflar","select=*&order=record_id,asama_no,created_at").catch(() => []),
    ]);

    const aMap = {}, fMap = {};
    for (const a of aD) (aMap[a.record_id] ||= []).push(a);
    for (const f of fD) (fMap[f.record_id] ||= []).push(f);
    app.kayitlar = rD.map((row) => satirToKayit(row, aMap[row.id] || [], fMap[row.id] || []));

    const notFilter = app.bolge ? `bolge=eq.${encodeURIComponent(app.bolge)}&` : "";
    const notD = await dbGet("santiye_notlar", `select=*&${notFilter}`.replace(/&$/, "")).catch(() => []);
    app.notlar = {};
    for (const n of notD) app.notlar[n.santiye] = n.not_metni;

    const logFilter = app.bolge ? `&bolge=eq.${encodeURIComponent(app.bolge)}` : "";
    const logD = await dbGet("santiye_log", `select=*&order=created_at.desc${logFilter}`).catch(() => []);
    app.logSatirlar = logD.map((s) => ({
      tarih: s.created_at, santiye: s.santiye, alan: s.uygulama_alani,
      asama: s.asama_no, malzeme: s.malzeme, durum: s.durum, metraj: s.metraj,
      personeller: Array.isArray(s.personeller) ? s.personeller : [],
      duzenleyen: s.duzenleyen || "—",
    }));
  } catch (err) {
    console.error(err);
    if (!sessiz) {
      const { toast } = await import("./utils.js");
      toast("Veri yüklenemedi: " + (err.message || "Bağlantı hatası"), "err", 5000);
    }
  } finally {
    if (!sessiz && ov) ov.style.display = "none";
  }
}

export function satirToKayit(row, aRows, fRows) {
  let asamalar = aRows.length
    ? aRows.map((r) => mkAsama({
        malzeme: r.malzeme || "", not: r.uygulama_notu || "",
        metraj: r.metraj != null ? String(r.metraj) : "",
        durum: r.durum || "Beklemede",
        personeller: Array.isArray(r.personeller) ? r.personeller : [],
      }, r.sira_no))
    : [1, 2, 3].map((n) => mkAsama({
        malzeme: row[`asama${n}_malzeme`] || "", not: row[`asama${n}_not`] || "",
        metraj: row[`asama${n}_metraj`] != null ? String(row[`asama${n}_metraj`]) : "",
        durum: row[`asama${n}_durum`] || "Beklemede", personeller: [],
      }, n)).filter((a) => !!(a.malzeme || a.not || a.metraj || a.personeller?.length));

  if (!asamalar.length) asamalar = [mkAsama({}, 1)];

  for (const f of fRows) {
    const no = Number(f.asama_no || 1);
    while (asamalar.length < no) asamalar.push(mkAsama({}, asamalar.length + 1));
    asamalar[no - 1].fotograflar.push({ id: f.id, url: f.file_url, file_path: f.file_path, file_id: f.file_id, hasar: !!f.hasar });
  }

  return {
    id: row.id, santiye: row.santiye, uygulamaAlani: row.uygulama_alani,
    bolge: row.bolge, personeller: row.personeller || [],
    asamalar, updatedAt: row.updated_at,
  };
}

export function mkAsama(src, sira) {
  return {
    sira: sira || 1,
    malzeme: src.malzeme || "",
    not: src.not || "",
    metraj: src.metraj || "",
    durum: src.durum || "Beklemede",
    personeller: Array.isArray(src.personeller) ? [...src.personeller] : [],
    fotograflar: [],
    yeniFotolar: [],
    silinecek: [],
    acik: sira <= 3,
  };
}
