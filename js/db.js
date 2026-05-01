// db.js — Supabase REST API wrapper (dbGet, dbPost, dbPatch, dbDelete, storeDel)

import { SB, KEY, H, BKT } from "./config.js";

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
  await fetch(`${SB}/storage/v1/object/${BKT}`, {
    method: "DELETE",
    headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
}
