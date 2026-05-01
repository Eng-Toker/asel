// config.js — Supabase bağlantı sabitleri ve ortak HTTP başlıkları

export const SB       = "https://ecassmluvjskywibbkuv.supabase.co";
export const KEY      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYXNzbWx1dmpza3l3aWJia3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTAyOTgsImV4cCI6MjA5MDk4NjI5OH0.yJ1UMEtZUPbDqEWTQD1qbF7kqf93T0eb1CpS887Ws1Y";
export const BKT      = "santiye-fotolar";
export const DRIVE_URL = "https://drive-upload.eng-adtoker.workers.dev";

// Object.assign ile güncellenebildiği için const obje (referans sabit, içerik mutable)
export const H = {
  apikey: KEY,
  Authorization: "Bearer " + KEY,
  "Content-Type": "application/json",
};
