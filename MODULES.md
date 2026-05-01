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
    ├── router.js                tabGec, bnGo, registerRender, setIsMisafir, popstate
    ├── auth.js                  oturumYukle, isMisafir, isAdmin, rolGoster, timeoutSifirla
    │                            window: girisYap, misafirGiris, bolgeSec, bolgeGeriDon, cikisYap
    ├── data.js                  veriYukle, satirToKayit, mkAsama
    ├── realtime.js              realtimeBaslat, realtimeDurdur (Supabase WebSocket)
    ├── photo.js                 sikistir (export), window: kameraAc, fotografEkle, hasarFotoYukle,
    │                            formFotoSil, yeniFotoSil, formFotoBak
    ├── lightbox.js              lbAc, lbKapat, lbSon, lbOnc, lbReset, lbZoom + olay bağlayıcıları
    ├── export.js                window: logExcelIndir, logPdfIndir
    ├── views/
    │   ├── projects.js          renderSantiyeler, tumHavaYenile, havaTimerBaslat, stopHavaTimer,
    │   │                        havaTipKapat, window: havaKonumAl, havaTipToggle, onSantiyeAra
    │   ├── detail.js            renderDetay, window: onAlanAra, perToggleDetay
    │   ├── log.js               renderLog, window: logPerAc, logPerKapat, logFiltrele
    │   │                        registerRender("log", renderLog)
    │   ├── ayarlar.js           renderAyarlar, window: santiyeDuzenle, santiyeKaydet, santiyeEkle,
    │   │                        santiyeSil, hakkindaAc, hakkindaKapat
    │   │                        registerRender("ayarlar", renderAyarlar)
    │   └── dashboard.js         renderDashboard
    │                            registerRender("dashboard", renderDashboard)
    └── modals/
        ├── record.js            renderModal (export), sbKaydet, bosForm/bosAsama/asamaEsitle
        │                        window: kayitToggle, santiyeSec, kayitDuzenle, yeniKayitAc,
        │                        modalKapat, kayitKaydet, kayitSil, fotoSil, fotoBak,
        │                        asamaToggle, asamaGuncelle, asamaSayisiDegisti,
        │                        malzSec, malzDigerAc, malzAra, perToggle, perKaldir,
        │                        perAra, perDigerEkle, perHepsiniSil, dzDrag, dzDrop
        └── note.js              window: notModalAc, notModalKapat, notKaydet

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

## Deployment

Statik dosyalar: Cloudflare Pages veya herhangi bir HTTP sunucu.

```bash
# Yerel test
python3 -m http.server 8000
```

`type="module"` CORS gerektirir — `file://` protokolüyle çalışmaz, mutlaka HTTP sunucu kullanın.
