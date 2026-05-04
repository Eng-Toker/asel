# Modül Haritası

Bu proje native ES Modules kullanır. Build aracı yoktur.

## Dosya Yapısı

```
asel/
├── index.html                   Ana uygulama (yalnızca HTML + CSS linkleri + module script)
├── asel-logo-animation.html     Logo animasyonu (iframe ile yüklenir)
├── manifest.json                PWA manifest
├── css/
│   ├── base.css                 :root değişkenleri, reset, tipografi
│   ├── layout.css               .wrap, .topbar, bottom nav, FAB, medya sorguları
│   ├── components.css           Butonlar, kart, durum rozetleri, toast, arama, chip, fotoğraf
│   ├── modals.css               Modal overlay, form elemanları, stepper, aşama accordion, picker
│   ├── lightbox.css             Tam ekran görüntüleyici
│   └── views.css                Şantiye grid, kayıt kartları, log, dashboard, giriş ekranı
└── js/
    ├── main.js                  Giriş noktası — tüm modülleri içe aktarır, olay bağlayıcıları, intro
    ├── config.js                SB, KEY, BKT, DRIVE_URL, H (mutable header nesnesi)
    ├── state.js                 app nesnesi (global durum), DURUM, DEF_S/P/M
    ├── utils.js                 el, uid, esc, badgeCls, parseNum, tarihFmt/Kisa, debounce, toast, vb.
    ├── db.js                    dbGet, dbPost, dbPatch, dbDelete, storeDel
    │                            (P1-5: storeDel artık shared H header — login JWT)
    ├── router.js                tabGec, bnGo, registerRender, setIsMisafir, popstate
    ├── mask.js                  PII maskeleme wrapper (P1-10)
    │                            export: maskPII, maskPIIBatch, maskCached
    │                            Worker /maskPII'a fetch + in-session Map cache.
    ├── auth.js                  oturumYukle, isMisafir, isAdmin, rolGoster, timeoutSifirla
    │                            window: girisYap, misafirGiris, bolgeSec, bolgeGeriDon, cikisYap
    │                            P1-8: misafirGiris async, parolayı Worker
    │                            /misafirLogin'e POST eder (PBKDF2 600k verify).
    │                            P1-10: girisYap'ta KULLANICI_ADLARI map miss →
    │                            email yerine Worker /maskPII'dan deterministic
    │                            pii: hash alınır (DB writes hashlenir).
    ├── data.js                  veriYukle, satirToKayit, mkAsama
    ├── realtime.js              realtimeBaslat, realtimeDurdur (Supabase WebSocket)
    │                            P1-4: bolge sütunlu tablolar için topic-suffix
    │                            server-side filter (realtime:public:T:bolge=eq.<x>).
    │                            P1-9: exponential backoff (1s→max 30s),
    │                            visibility hook (tab visible → reconnect),
    │                            state resync (refresh on reconnect open).
    ├── photo.js                 sikistir (export), window: kameraAc, fotografEkle, hasarFotoYukle,
    │                            formFotoSil, yeniFotoSil, formFotoBak
    ├── lightbox.js              lbAc, lbKapat, lbSon, lbOnc, lbReset, lbZoom + olay bağlayıcıları
    ├── export.js                window: logExcelIndir, logPdfIndir
    │                            P1-1: xlsx@0.20.3 SheetJS resmi CDN +
    │                            integrity SRI (sha384) + crossOrigin.
    ├── views/
    │   ├── projects.js          renderSantiyeler, tumHavaYenile, havaTimerBaslat, stopHavaTimer,
    │   │                        havaTipKapat, window: havaKonumAl, havaTipToggle, onSantiyeAra
    │   ├── detail.js            renderDetay, window: onAlanAra, perToggleDetay
    │   ├── log.js               renderLog, window: logPerAc, logPerKapat, logFiltrele
    │   │                        registerRender("log", renderLog)
    │   ├── ayarlar.js           renderAyarlar, window: santiyeDuzenle, santiyeKaydet, santiyeEkle,
    │   │                        santiyeSil, hakkindaAc, hakkindaKapat
    │   │                        registerRender("ayarlar", renderAyarlar)
    │   └── dashboard.js         renderDashboard (async — P1-14)
    │                            registerRender("dashboard", renderDashboard)
    │                            P1-14: PII preflight (mask.maskPIIBatch),
    │                            _piiGoster() render-time getter; ham
    │                            email-like değer cache miss → "Admin"
    │                            hard-mask fallback.
    └── modals/
        ├── record.js            renderModal (export), sbKaydet, bosForm/bosAsama/asamaEsitle
        │                        window: kayitToggle, santiyeSec, kayitDuzenle, yeniKayitAc,
        │                        modalKapat, kayitKaydet, kayitSil, fotoSil, fotoBak,
        │                        asamaToggle, asamaGuncelle, asamaSayisiDegisti,
        │                        malzSec, malzDigerAc, malzAra, perToggle, perKaldir,
        │                        perAra, perDigerEkle, perHepsiniSil, dzDrag, dzDrop
        ├── note.js              window: notModalAc, notModalKapat, notKaydet
        ├── rapor.js             Aşama bazlı AI teknik rapor (Gemini 2.5 Flash → html2canvas + jsPDF
        │                        → Drive → santiye_raporlar INSERT). PDF şablonu inline; layout ve
        │                        CSS asel_teknik_rapor_editoru_v1_16.html'den birebir taşınmıştır.
        │                        Sayfa sayfa render: her .page elementi window.html2canvas ile
        │                        canvas'a çekilip jsPDF.addPage ile birleştirilir (scale=3, PNG).
        │                        Hizalama: text-align:justify + hyphens:auto. Container
        │                        position:fixed + visibility toggle ile gizlenir.
        │                        window: raporModalAc, raporModalKapat, raporUret,
        │                        raporYorumKontrol, raporModalAcTekrar
        └── rapor-assets.js      ASEL + KÖSTER logo base64'leri (rapor.js okunabilirliği için ayrı
                                 dosya). export: ASEL_LOGO, KOSTER_LOGO.

```

## Circular Dependency Çözümleri

| Sorun | Çözüm |
|---|---|
| `auth.js` ↔ `views/projects.js` | `auth.js`'te `bolgeSec/bolgeGeriDon` dinamik `import()` kullanır |
| `auth.js` ↔ `realtime.js` | `auth.js`'te `cikisYap/bolgeGeriDon` dinamik `import()` kullanır |
| `router.js` ↔ `views/*.js` | `registerRender(name, fn)` kayıt paterni; router view'ları içe aktarmaz |
| `router.js` ↔ `auth.js` | `setIsMisafir(fn)` köprüsü; auth modülü yüklenince enjekte eder |
| `photo.js` → `modals/record.js` | Dinamik `import()` (renderModal için) |
| `realtime.js` → tüm view'lar | Dinamik `import()` (refresh debounce içinde) |
| `auth.js` → `mask.js` | Dinamik `import()` — login flow'da KULLANICI_ADLARI miss durumunda PII hash al |
| `mask.js` → `auth.js` | `oturumYukle()` import — Worker fetch için Bearer token okunur (login event'in kendisi öncesi mask çağrısı yok) |

## Deployment

Statik dosyalar: Cloudflare Pages veya herhangi bir HTTP sunucu.

```bash
# Yerel test
python3 -m http.server 8000
```

`type="module"` CORS gerektirir — `file://` protokolüyle çalışmaz, mutlaka HTTP sunucu kullanın.

## Faz 2 modül değişiklikleri (2026-05-04)

| Madde | Modül | Değişiklik |
|---|---|---|
| P1-1  | export.js                  | xlsx CDN + SRI |
| P1-4  | realtime.js                | bolge topic-suffix |
| P1-9  | realtime.js                | exp backoff + visibility hook |
| P1-5  | db.js                      | storeDel header H |
| P1-10 | mask.js (yeni)             | maskPII / maskPIIBatch / maskCached |
| P1-10 | cloudflare-worker.js       | maskPIIvalue + /maskPII endpoint |
| P1-10 | auth.js                    | login flow → maskPII for unmapped emails |
| P1-10 | modals/rapor.js            | console.warn defansif daraltma |
| P1-14 | views/dashboard.js         | async preflight + _piiGoster fallback |
| P1-8  | cloudflare-worker.js       | verifyMisafirParola + /misafirLogin |
| P1-8  | auth.js                    | misafirGiris async, plaintext check silindi |
| P1-8  | scripts/hash_misafir_pass.mjs (yeni) | PBKDF2-SHA256 600k hash üretici |
| P1-8  | index.html                 | btn-misafir id eklendi (loading state) |

## Faz 3 modül değişiklikleri (2026-05-04)

| Madde | Modül | Değişiklik |
|---|---|---|
| P2-1  | .gitignore (yeni)          | Standart Node/web ignore + .claude/ |
| P2-1  | .cfignore (yeni)           | Cloudflare Pages deploy exclude |
| P1-13 | .gitattributes (yeni)      | Line ending normalization (LF) |
| errata | migrations/2026-05-04_p3_malzemeler_consolidation.sql (yeni) | Tek canonical SELECT policy |
