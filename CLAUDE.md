# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step. Native ES Modules, served as static files.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

`type="module"` requires CORS — `file://` will not work, an HTTP server is mandatory. Deploy is also static (Cloudflare Pages or any HTTP host).

There is no test runner, linter, or package.json. CSS is split into six files in `css/` and loaded directly from `index.html`; JS is loaded via a single `<script type="module" src="js/main.js">`.

CSS load order is load-bearing: `layout.css` must be last (after `views.css`) so its responsive/topbar rules win the cascade — see commit `ea8210e`. Don't alphabetize the `<link rel="stylesheet">` tags in `index.html`.

## Backend

The app talks directly to a hosted Supabase project from the browser via REST and a single Realtime WebSocket. There is no server we control besides:

- Supabase (REST `/rest/v1/*`, Auth `/auth/v1/*`, Storage `/storage/v1/*`, Realtime `/realtime/v1/websocket`) — anon key, URL, and bucket name live in `js/config.js`.
- A Cloudflare Worker at `DRIVE_URL` (`drive-upload.eng-adtoker.workers.dev`) that receives base64 photos and writes them into a Google Drive folder; client posts `{ imageData, fileName, santiye, alan, bolge }` and gets back `{ fileUrl, fileId }` (see `js/photo.js`).

Tables consumed: `santiyeler`, `personeller`, `malzemeler`, `santiye_records`, `record_asamalar`, `record_fotograflar`, `santiye_notlar`, `santiye_log`. All queries scope by `bolge=eq.<region>` when a region is selected (see `js/data.js`). Realtime listens on these tables and triggers a debounced `veriYukle({sessiz:true})` + active-view re-render (`js/realtime.js`).

The `H` header object in `js/config.js` is mutated in place by `auth.js` after login (`Object.assign(H, tokenliHeader(...))`) so all `db.js` calls automatically use the user's access token. Resetting it on logout is also done by mutation, not reassignment — keep this contract intact.

## Architecture

Single-page app with one `index.html` shell that contains every view, every modal, and the lightbox as DOM that gets shown/hidden. State lives in a single mutable `app` object (`js/state.js`); there is no reactive framework. Re-rendering is explicit: callers invoke `renderSantiyeler()`, `renderDetay()`, `renderLog()`, etc. after they mutate `app`.

### Entry & module wiring

`js/main.js` is the single entry. It side-effect-imports every module (so their `window.*` registrations happen), then wires DOM event listeners and the intro animation. The order of side-effect imports matters: `auth.js` calls `setIsMisafir(...)` on `router.js`, and view modules call `registerRender(name, fn)` on `router.js` — so `router.js` must be imported before `auth.js` and the views.

### View routing

`js/router.js` owns view switching. View modules do **not** import the router's view list; instead each view module calls `registerRender("projects", renderSantiyeler)` (etc.) at module load. `tabGec(view)` toggles `.hidden` on the five `view-*` divs, updates `document.title`, pushes history state, and calls the registered render. URL shape: `/`, `/santiye/<encoded name>`, `/log`, `/ayarlar`, `/dashboard`. Popstate restores `app.secilenSantiye` from `history.state`.

### Inline handlers via `window.*`

The HTML uses `onclick="..."` and `oninput="..."` heavily. Functions referenced from HTML are exposed by assigning to `window.X` inside the relevant module (e.g. `window.kayitKaydet`, `window.havaTipToggle`, `window.modalKapat`). When you add a new inline handler in HTML, you must also add a `window.X = ...` somewhere. `main.js` re-exposes a few utility imports (`el`, `app`, `tabGec`, `renderDetay`, `toggleClear`, `clearAra`) on `window` for the same reason.

### Circular dependencies — must use dynamic `import()`

The module graph has cycles that are deliberately broken with runtime `import()`. **When adding cross-module calls, check `MODULES.md` first** and prefer dynamic imports for the same edges:

| Edge | How it's broken |
|---|---|
| `auth.js` ↔ `views/projects.js`, `realtime.js`, `data.js` | `bolgeSec`/`bolgeGeriDon`/`cikisYap` use dynamic `import()` |
| `router.js` ↔ `views/*` | `registerRender(name, fn)` registry pattern |
| `router.js` ↔ `auth.js` | `setIsMisafir(fn)` injection |
| `photo.js` → `modals/record.js` | dynamic `import()` of `renderModal` |
| `realtime.js` → all views | dynamic `import()` inside the debounced refresh |

`MODULES.md` is the source of truth for the module map and these contracts; update it when you change them.

### Auth & roles

Two login modes (`js/auth.js`):
- **Admin** — Supabase email+password; user record `_oturum = { email, ad, rol: "admin", token }`. The token is patched into the shared `H` headers.
- **Guest** — local-only password `ASEL2026`, no Supabase token, `rol: "guest"`. UI gates with `isMisafir()` (e.g., hides FAB, settings, "new record"; blocks `bnGo("ayarlar")`).

After login the user picks a `bolge` (region); `app.bolge` filters every subsequent query and is also written to every row created. There is a 5-minute idle timeout (`SESSION_SURE` in `auth.js`) reset by any click/keydown/touch.

Admin display names come from a hard-coded `KULLANICI_ADLARI` map at the top of `auth.js` keyed by email — when you add a new admin user in Supabase you must also add their email→name entry there, otherwise the UI falls back to the email prefix.

### Records & log

A "kayıt" (record) is `santiye_records` + N rows in `record_asamalar` (stages, 1–8) + photos in `record_fotograflar`. `data.js::satirToKayit` reassembles these into a single `kayit` object with `asamalar[]`. Saving in `modals/record.js::sbKaydet` deletes-then-reinserts all stages for the record (no diff/upsert), then writes log rows to `santiye_log` only for stages that actually changed (compared against the previous `app.kayitlar` snapshot).

### Log export

`js/export.js` exposes `window.logExcelIndir` and `window.logPdfIndir` for downloading the activity log. Both are inline-handler-only (no module API) and operate over the currently filtered `app.kayitlar` view — they don't re-query Supabase.

### Photos

`photo.js::sikistir` resizes to max 1400px and JPEG-encodes at 0.85 quality before upload. Uploads go to the Cloudflare Drive worker, **not** Supabase Storage. New photos are held on `app.form.asamalar[i].yeniFotolar` until save; existing ones marked for deletion are queued on `silinecek` and removed from Supabase Storage + the `record_fotograflar` table during `sbKaydet`. Hasar (damage) photos are an inline path that uploads + inserts directly without going through the modal form.

## Conventions

- **Language is Turkish.** Identifiers, comments, and UI strings are Turkish (`santiye`, `asama`, `malzeme`, `personeller`, `bolge`, `tabGec`, `kayitKaydet`). Keep new code consistent — don't rename to English.
- Files end with short lowercase Turkish names; the modal/view split mirrors `MODULES.md`.
- DOM access goes through `el(id)` from `utils.js`. HTML escaping goes through `esc()`. Numeric input parsing goes through `parseNum()` (handles comma decimals).
- Toasts are the standard user-feedback channel: `toast(msg, "ok"|"err"|"warn"|"info", durationMs)`.
- Don't add a build step or package manager unless explicitly asked — this codebase is intentionally tool-free.
