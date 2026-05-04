// db.js — Supabase REST API wrapper (dbGet, dbPost, dbPatch, dbDelete, storeDel)

import { SB, H, BKT } from "./config.js";

export async function dbGet(t, q = "") {
  const r = await fetch(`${SB}/rest/v1/${t}${q ? "?" + q : ""}`, { headers: H });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
  return r.json();
}

export async function dbPost(t, d) {
  const r = await fetch(`${SB}/rest/v1/${t}`, {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify(d),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
  return r.json();
}

export async function dbPatch(t, q, d) {
  const r = await fetch(`${SB}/rest/v1/${t}?${q}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify(d),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
  return r.json();
}

export async function dbDelete(t, q) {
  const r = await fetch(`${SB}/rest/v1/${t}?${q}`, { method: "DELETE", headers: H });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
}

export async function storeDel(paths) {
  // B1: r.ok kontrolü ekli — Storage 4xx/5xx silent kabul edilirse
  // orphan dosya birikir, kullanıcı "silindi" toast'ı görür ama dosya kalır.
  const r = await fetch(`${SB}/storage/v1/object/${BKT}`, {
    method: "DELETE",
    headers: H,
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `Storage delete failed (${r.status})`);
  }
}
