# RAPOR_SPEC.md

**Özellik:** Aşama Bazlı AI Teknik Rapor
**Hedef sürüm:** Şantiye İş Takip — sonraki minor
**Yazım tarihi:** 2026-05-02
**Statü:** Onay bekliyor (implementasyona geçilmedi)

---

## 0) TL;DR

Aşama kartında hasar fotoğrafı varsa admin için **📄 Rapor** butonu görünür. Kullanıcı min 20 karakter yorum girer → Cloudflare Worker, Gemini 2.5 Flash'a (vision + PDF) çağrı atar → Drive'daki teknik föy fuzzy match ile bulunur (varsa rapora dahil) → AI 6 kilitli alanı doldurur → frontend `html2pdf.js` ile A4 PDF üretir → Worker `Şantiye Raporları/[Şantiye]/` altına yükler → kullanıcıya link gösterilir.

Maliyet: **0 TL** (Gemini 2.5 Flash ücretsiz katmanı, 250 RPD).

---

## 1) Amaç ve Tetikleyici

- Aşama kartında **SADECE** en az bir hasar fotoğrafı varsa (`a.fotograflar.some(f => f.hasar)`) "📄 Rapor" butonu render edilir.
- **Misafir kullanıcıda buton yok** — `isMisafir()` true ise render atlanır.
- Buton, AI ile teknik rapor üretip Drive'a PDF olarak kaydeder ve kullanıcıya açılabilir bir link döner.

---

## 2) Alınmış Kararlar

| Konu | Karar |
|---|---|
| AI modeli | **Gemini 2.5 Flash** (ücretsiz, 250 RPD, vision + PDF native) |
| Maliyet | **0 TL** |
| Foto limiti | Maks **3 normal + 1 hasar = 4 foto** (en sonuncular); şablon `count-2/3/4` desteklediği için bu üst sınır |
| Kullanıcı yorumu | **Min 20 karakter** zorunlu |
| Föy klasörü (Drive) | `1-xqiQMId4Xs6KrP6pqB6aZhmbBJXlve0` |
| Föy eşleşme | **Token-bazlı match v2** (2026-05-03): KÖSTER ön kontrol → tokenize ≥3 char → stop word filtre → exact + token `===` eşitlik. Drive listeleme recursive (kategori klasörlerine 1 seviye iniyor, 78 PDF). |
| Föy bulunamazsa | Rapor yine üretilir; "Föy: bulunamadı" notu rapora basılır |
| Rapor şablonu | Referans repodaki **8 bölümlü 2-sayfa A4** düzeni (mantık aynı, kod kopyalanmaz) |
| AI çıktı şeması | Referans repodaki `aiLockedFieldsToFill` **6 alan, birebir aynı** |
| PDF üretimi | **Frontend** — `html2pdf.js` (CDN) |
| Drive klasörü | `Şantiye Raporları/[Şantiye]/` — Worker ilk çağrıda otomatik açar |
| Dosya adı | `<Santiye>_<Alan>_Asama-<N>_<YYYY-MM-DD>.pdf` (ASCII-safe, `slugify`'lı) |
| Versiyon politikası | Tarih damgası ile **ayrı dosya**; üzerine yazma yok |
| Foto sıralama | `record_fotograflar.created_at DESC` (kolon mevcut, doğrulandı: `js/data.js:27`) |
| Dil | Türkçe (identifier + UI + AI çıktısı); dosya adı ASCII |
| Temperature | 0.3 (deterministik teknik dile yakın) |
| Modül konumu | `js/modals/rapor.js` (mevcut `modals/` konvansiyonuna uyum) |
| Rapor geçmişi DB | `santiye_raporlar` tablosu — **immutable** (update/delete policy yok), audit-grade. DDL: `migrations/2026-05-02_santiye_raporlar.sql` |
| INSERT yazıcı | **Frontend** (`dbPost("santiye_raporlar", ...)`); Worker DB'ye dokunmaz |
| Rapor Geçmişi UI | **Bu sürümde yok**; tablo dolar, UI sonradan eklenir (audit önceliği) |

---

## 3) Worker (cloudflare-worker.js, mevcut tek dosya)

### 3.1 Korunacak (DOKUNULMAZ)

- `getAccessToken()` — Google service-account OAuth token üretimi
- `klasorBulVeyaOlustur(ad, parentId, env)` — Drive klasör helper'ı
- `POST /upload` — mevcut foto yükleme yolu (`js/photo.js` ile sözleşme)

### 3.2 Silinecek

- Varsa eski **OpenAI** tabanlı `/rapor` endpoint kodu ve `OPENAI_API_KEY` referansları.

### 3.3 Env Değişiklikleri

- **YENİ:** `GEMINI_API_KEY` (Encrypt)
- **SİL:** `OPENAI_API_KEY`

### 3.4 Yeni Endpoint: `POST /rapor`

**Input:**
```json
{
  "yorum": "Kullanıcı beyanı (min 20 char)",
  "malzeme": "KÖSTER NB Elastik 2K",
  "fotolar": [
    { "type": "normal" | "hasar", "data": "<base64>", "mimeType": "image/jpeg" }
  ],
  "santiye": "Şantiye adı",
  "alan": "Alan / detay bölgesi"
}
```

**Akış:**
1. OAuth access token al (`getAccessToken`).
2. Drive föy klasöründe (`1-xqiQMId4Xs6KrP6pqB6aZhmbBJXlve0`) `files.list` ile PDF listesi çek.
3. `foyEslestir(malzeme, liste)` ile fuzzy match (§3.4.2).
4. Eşleşen PDF varsa `files.get?alt=media` ile indir → base64 encode (`foyBase64`).
5. Gemini 2.5 Flash'a tek çağrı (sistem prompt + bağlam metni + föy PDF inline + fotolar inline) — §3.4.3.
6. `responseMimeType: "application/json"` + `responseSchema` ile yapısal JSON al, `temperature: 0.3`.
7. Cevabı doğrula (6 alan dolu mu?), eksik alan varsa boş string ile karşıla.

**Output:**
```json
{
  "basarili": true,
  "rapor": {
    "materialDescription": "...",
    "applicationSummary": "...",
    "fieldObservation": "...",
    "damageAnalysis": "...",
    "technicalReferences": "...",
    "conclusionText": "..."
  },
  "foyBulundu": true,
  "foyDosyaAdi": "KÖSTER NB Elastik 2K.pdf"
}
```

#### 3.4.1 Sistem Prompt'u (Türkçe)

Worker içinde `SISTEM_PROMPT` sabiti olarak tutulur:

```
Sen ASEL Group bünyesinde çalışan kıdemli bir su yalıtım ve izolasyon
teknik uzmanısın. Görevin; saha mühendisinin yorumu, ekteki ürün teknik
föyü (varsa) ve hasar fotoğraflarını birlikte değerlendirerek teknik
tespit ve değerlendirme raporu üretmektir.

KURALLAR
- Yalnızca verilen verilerden çıkarsanan bilgileri yaz; varsayım,
  spekülasyon veya genel internet bilgisi kullanma.
- Dil ölçülü, mesleki ve resmi olsun. Subjektif yorum, duygu ifadesi,
  abartılı sıfat kullanma.
- Üretici, müşteri veya üçüncü tarafları doğrudan suçlama; teknik tespit
  dilini kullan ("uygulamada uygunsuzluk gözlenmiştir", "föy şartları
  ile saha durumu arasında uyumsuzluk tespit edilmiştir" gibi).
- Ürün adlarını teknik föyde geçen şekliyle yaz; teknik veri uydurma.
  Föy yoksa malzeme adıyla sınırlı kal, "föy üzerinden doğrulanmalıdır"
  notu düş.
- Ölçü birimlerini standart yaz (mm, kg/m², MPa). Kısaltma açıklamasız
  kullanma.
- Tüm çıktı Türkçe olacak.

ÇIKTI BİÇİMİ
Aşağıdaki JSON şemasına BİREBİR uy. Markdown, başlık, açıklama veya
kod bloğu ekleme. Yalnızca geçerli JSON döndür.

ALANLAR
- materialDescription: Seçilen ürünün teknik tanımı ve kullanım amacı.
- applicationSummary: Saha bağlamında uygulama sürecinin teknik özeti.
- fieldObservation: Fotoğraflardan ve kullanıcı beyanından çıkan saha
  gözlemi.
- damageAnalysis: Hasar/uygunsuzluk teknik analizi (neden-sonuç ilişkisi).
- technicalReferences: Teknik föyden doğrulanabilir kaynak/şart bilgisi.
  Föy yoksa "İlgili ürünün teknik föyü değerlendirmeye dahil edilememiştir"
  ifadesi.
- conclusionText: Sonuç, teknik kanaat ve sorumluluk değerlendirmesi.
```

#### 3.4.2 Fuzzy Match (`foyEslestir`) — v2 (2026-05-03)

**v1'den v2'ye geçiş sebepleri:**

| Sorun | v1 davranışı | v2 davranışı |
|---|---|---|
| KÖSTER olmayan ürünler | substring ile yanlış eşleşme yapabiliyor (örn. `Fondolin` → rastgele bir KÖSTER PDF'i) | norm `koster` ile başlamıyorsa direkt `none, sebep:'koster-degil'` |
| Token bağı | substring `includes` her iki yönde — kısa string'ler büyük string'lerin içine sığıyor | sadece tam eşitlik (`pt === kt`); 3 karakterden kısa token'lar atılır |
| Stop word'ler | yok | `koster, kg, lt, ml, gr, gbf, tds, msds, pdf, rapor, test, sivi, siv, toz, bilesen, bilese, set, din, astm, iso, tse, cen, pox, sps, sup, imo` |
| Drive klasör derinliği | tek seviye (üst klasörde PDF aranıyordu) | recursive — kategori klasörlerinin içine de iniyor (78 PDF, 9 alt kategori) |

**Algoritma:**

```js
function foyEslestir(malzeme, pdfListesi) {
  const norm = normalizeMalzeme(malzeme);
  if (!norm) return { eslesme: 'none' };

  // ÖN KONTROL: KÖSTER ürünü değilse Drive araması atla
  if (!norm.startsWith('koster')) {
    return { eslesme: 'none', sebep: 'koster-degil' };
  }

  // Tokenize: ≥3 karakter, harf+rakam grupları
  const tokenize = (s) => normalizeMalzeme(s)
    .replace(/[-_.,()\/]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);

  const malzemeTokens = tokenize(malzeme);
  const stopWords = new Set([
    'koster', 'köster', 'kg', 'lt', 'ml', 'gr',
    'gbf', 'tds', 'msds', 'pdf', 'rapor', 'test',
    'sivi', 'siv', 'toz', 'bilesen', 'bilese', 'set',
    'din', 'astm', 'iso', 'tse', 'cen',
    'pox', 'sps', 'sup', 'imo',
  ]);
  const malzemeKeyTokens = malzemeTokens.filter(t => !stopWords.has(t));
  if (malzemeKeyTokens.length === 0) {
    return { eslesme: 'none', sebep: 'anahtar-token-yok' };
  }

  // 1) exact (uzantısız tam eşitlik)
  let m = pdfListesi.find(p =>
    normalizeMalzeme(p.name.replace(/\.pdf$/i, '')) === norm
  );
  if (m) return { eslesme: 'exact', id: m.id, name: m.name };

  // 2) token skorlama — SADECE pt === kt (includes kaldırıldı)
  let enIyi = null, enIyiSkor = 0;
  for (const p of pdfListesi) {
    const pdfTokens = tokenize(p.name.replace(/\.pdf$/i, ''));
    let skor = 0;
    for (const kt of malzemeKeyTokens) {
      if (pdfTokens.some(pt => pt === kt)) skor++;
    }
    if (skor > enIyiSkor) { enIyiSkor = skor; enIyi = p; }
  }

  if (enIyi && enIyiSkor >= 1) {
    return {
      eslesme: enIyiSkor >= 2 ? 'token-strong' : 'token-weak',
      id: enIyi.id,
      name: enIyi.name,
      skor: enIyiSkor,
    };
  }
  return { eslesme: 'none', sebep: 'eslesme-yok' };
}
```

**Recursive Drive listeleme** (`drivePdfListele`): kök klasörün altındaki tüm öğeler `mimeType` filtresi olmadan listelenir; klasörler için kendisini çağırır, PDF'ler birikitirilir. Sonuç: 78 PDF flat liste.

**Test sonuçları (2026-05-03):**

- `KÖSTER KBE Flüssigfolie` → `0300-KOSTER-KBE-GBF.pdf` (`token-weak`, skor=1) ✓
- `Fondolin` → `none, sebep:'koster-degil'` ✓ (eskiden yanlış eşleşme yapıyordu)

#### 3.4.3 Gemini API Çağrı Formatı

```js
const url = `https://generativelanguage.googleapis.com/v1beta/models/`
          + `gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

const baglamMetni = [
  `ŞANTİYE: ${santiye}`,
  `ALAN: ${alan}`,
  `MALZEME: ${malzeme}`,
  `FÖY DURUMU: ${foyBulundu ? "Ekte (PDF)" : "Bulunamadı"}`,
  `KULLANICI BEYANI: ${yorum}`,
  `HASAR FOTOĞRAFI: ${hasarSayisi} adet`,
  `NORMAL FOTOĞRAF: ${normalSayisi} adet`,
].join("\n");

const parts = [{ text: baglamMetni }];
if (foyBase64) {
  parts.push({ inline_data: { mime_type: "application/pdf", data: foyBase64 } });
}
fotolar.forEach(f => {
  parts.push({ inline_data: { mime_type: f.mimeType, data: f.data } });
});

const cevap = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    systemInstruction: { parts: [{ text: SISTEM_PROMPT }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        required: [
          "materialDescription", "applicationSummary", "fieldObservation",
          "damageAnalysis", "technicalReferences", "conclusionText"
        ],
        properties: {
          materialDescription: { type: "string" },
          applicationSummary:  { type: "string" },
          fieldObservation:    { type: "string" },
          damageAnalysis:      { type: "string" },
          technicalReferences: { type: "string" },
          conclusionText:      { type: "string" }
        }
      }
    }
  })
});
```

#### 3.4.4 Hata Yönetimi

| Durum | Davranış |
|---|---|
| `GEMINI_API_KEY` yok | 500 + `{basarili:false, hata:"GEMINI_API_KEY tanımlı değil"}` |
| Gemini 4xx | 502 + `{basarili:false, hata:"AI sağlayıcı hatası: <kod>"}` |
| Gemini 5xx / timeout | 502 + retry **yok** (frontend "Tekrar Dene" butonuyla) |
| JSON parse hatası | 502 + `{basarili:false, hata:"AI cevabı geçerli JSON değil"}` |
| Föy klasörü erişilemez | İşleme devam et; `foyBulundu:false` |
| 6 alandan biri eksik | Eksik alanı `""` ile karşıla; `basarili:true` |

### 3.5 Yeni Endpoint: `POST /raporPdf`

**Input:**
```json
{
  "pdfBase64": "...",
  "santiye": "Şantiye adı",
  "alan": "Alan adı",
  "asama": 3
}
```

**Akış:**
1. OAuth token al.
2. `klasorBulVeyaOlustur("Şantiye Raporları", null, env)` → kök klasör.
3. `klasorBulVeyaOlustur(santiye, kokId, env)` → şantiye alt klasörü.
4. Multipart Drive upload (`uploadType=multipart`) — metadata + binary.
5. Permission: `{role:"reader", type:"anyone"}` ile public-read.
6. `webViewLink` döndür.

**Output:**
```json
{
  "basarili": true,
  "fileUrl": "https://drive.google.com/file/d/<id>/view",
  "fileId": "<id>",
  "fileName": "Bodrum_Aşama-3_02-05-2026_14-30.pdf"
}
```

---

## 4) Frontend (Modüler ES Modules)

CLAUDE.md kurallarına uyar: dinamik `import()` ile circular dep kırılır, `H` header objesi mutate edilir (reassign yok), `app.bolge` filtresi her query'de geçer, identifier'lar Türkçe.

### 4.1 Yeni Modül: `js/modals/rapor.js`

**Pattern notu:** Bu modül bir **view değil**, modal — `js/modals/note.js` ve `js/modals/record.js` ile aynı katmanda. `registerRender(...)` çağrısı **yapılmaz** (router kayıt sistemi sadece `view-*` div'leri için). CLAUDE.md kuralı: HTML'deki `onclick` handler'ları `window.*` üzerinden expose edilir.

**Export'lar:** Yok (side-effect modül; `main.js` bunu side-effect-import eder).

**`window.*` registrasyonları:**
```js
window.raporModalAc       = raporModalAc;       // (kayitId, asamaSira) — modali aç
window.raporModalKapat    = raporModalKapat;    // modali kapat
window.raporUret          = raporUret;          // "Üret" butonunun ana akışı
window.raporYorumKontrol  = raporYorumKontrol;  // textarea oninput — buton aktif/pasif
window.raporModalAcTekrar = raporModalAcTekrar; // hata ekranından "Tekrar Dene"
```

**İmport bağımlılıkları:** `state.js` (app), `auth.js` (isMisafir), `utils.js` (el, esc, toast), `config.js` (DRIVE_URL), `photo.js` (sikistir).

**Akış (`raporUret`):**
1. Yorum < 20 char → erken çık.
2. Aşamadaki fotoları `created_at DESC` ile sırala, ilk 3 normal + ilk 2 hasarı seç (en güncel olanlar). UUID v4 random olduğu için `id`'ye göre sıralama yapılmaz.
3. Her fotoyu `sikistir` ile küçült (mevcut 1400px / 0.85 JPEG kuralı).
4. Modali "yukleniyor" adımına geçir, "Fotolar hazırlanıyor…" yaz.
5. `fetch(${DRIVE_URL}/rapor, {...})` → 6 AI alanı + föy durumu.
6. "AI cevabı alındı, PDF üretiliyor…" yaz.
7. Hidden template container'ı `#rapor-template-container` doldur (§5).
8. `html2pdf().set(opts).from(container).outputPdf("blob")` → Blob → base64.
9. `fetch(${DRIVE_URL}/raporPdf, {...})` → Drive linki.
10. **Supabase INSERT** (`dbPost("santiye_raporlar", {...})`) — Drive başarısı sonrası audit kaydı yazılır. Ayrıntı: §4.6.
11. "sonuc" adımına geç, link göster (yeni sekme).
12. Hata → "hata" adımına geç, mesaj + "Tekrar Dene".

**Kayıt/aşama lookup:** `app.kayitlar.find(k => k.id === kayitId)` → `kayit.asamalar.find(a => a.sira === asamaSira)`.

### 4.2 `index.html` Değişiklikleri

**`<head>`:**
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js" defer></script>
```

**`<body>`** (mevcut modal kümesinin yanına):
```html
<div id="rapor-modal" class="modal hidden" onclick="raporModalKapat()">
  <div class="modal-icerik" onclick="event.stopPropagation()">
    <!-- Step 1: yorum -->
    <div data-step="yorum">...</div>
    <!-- Step 2: yukleniyor -->
    <div data-step="yukleniyor" class="hidden">...</div>
    <!-- Step 3: sonuc -->
    <div data-step="sonuc" class="hidden">...</div>
    <!-- Step 4: hata -->
    <div data-step="hata" class="hidden">...</div>
  </div>
</div>

<!-- Gizli PDF üretim alanı (ekrandan görünmez, html2pdf rasterize eder) -->
<div id="rapor-template-container" style="position:absolute;left:-99999px;top:0;"></div>
```

### 4.3 `js/main.js` Değişikliği

Side-effect import sırasına eklenecek (auth.js'ten sonra, view'lardan önce sıralama önemli değil bu modül için):

```js
import "./modals/rapor.js";
```

### 4.4 Aşama Kartı Render (mevcut: `js/views/detail.js`)

Aşama kartı HTML üretiminde hasar foto kontrolü ve buton render'ı eklenecek:

```js
const hasarFotoVar = (a.fotograflar || []).some(f => f.hasar);
const raporBtnHtml = (hasarFotoVar && !isMisafir())
  ? `<button class="rapor-btn" onclick="event.stopPropagation();raporModalAc('${esc(rec.id)}',${a.sira})">📄 Rapor</button>`
  : "";
```

`isMisafir` `auth.js`'ten import edilir (zaten import edilmişse tekrar eklenmez).

### 4.5 `MODULES.md` Güncellemesi

`modals/` ağacına yeni satır:
```
├── modals/
│   ├── record.js           ...
│   ├── note.js             ...
│   └── rapor.js            renderRaporModal, raporUretAkis, html2pdf + Drive entegrasyonu
│                           window: raporModalAc, raporModalKapat, raporUret,
│                                   raporYorumKontrol, raporModalAcTekrar
```

Circular dependency tablosuna gerek yok (`modals/rapor.js` view'lara veya kritik döngülere girmiyor; sadece `state`, `auth`, `utils`, `config`, `photo`, `db` import eder).

### 4.6 Veritabanı INSERT Akışı (`santiye_raporlar`)

**Sıra önemli — Drive yazma başarısı önce.** Drive upload başarısızsa DB'ye yazılmaz (orphan kayıt yok). Drive başarılı + DB başarısız nadir senaryosunda kullanıcıya açık mesaj verilir, link gösterilir; manuel reconcile sonradan yapılabilir (`drive_file_id` zaten dosya adında).

**Yetki:** `dbPost` mevcut `H` headers'ı kullanır — kullanıcının access token'ı zaten ekli (CLAUDE.md: `H` mutate-in-place sözleşmesi). Worker'a service-role key vermeye gerek yok.

**INSERT payload:**
```js
await dbPost("santiye_raporlar", {
  record_id:        kayitId,              // uuid
  asama_no:         asamaSira,            // 1–8
  bolge:            app.bolge,            // CLAUDE.md multi-tenant pattern
  yorum:            yorum.trim(),
  ai_cevap_json:    aiCevap,              // 6 alanlık obje (jsonb)
  foy_dosya_adi:    foyBulundu ? foyDosyaAdi : null,
  drive_url:        driveUrl,
  drive_file_id:    driveFileId,
  hazirlayan:       _oturum.ad || _oturum.email,
  hazirlayan_email: _oturum.email
  // created_at: DB default now()
});
```

**Hata yönetimi:**

| Durum | Davranış |
|---|---|
| INSERT başarısız (4xx/5xx) | "sonuc" adımı yine de gösterilir + uyarı toast: `"Rapor üretildi ama geçmiş kaydedilemedi, link: <drive_url>"`. Veri kaybı (rapor) yok; audit kaybı var. |
| RLS reddi | Yukarıdakiyle aynı (kullanıcı `authenticated` sayılmıyorsa misafir, ama misafire buton zaten render olmuyor — bu noktaya gelmemeli). Loga not düş. |

**Tablo özet:** Detay DDL ayrı dosyada (`migrations/2026-05-02_santiye_raporlar.sql`). Önemli özellikler:
- `id uuid pk default gen_random_uuid()`
- `record_id` → `santiye_records(id) ON DELETE SET NULL` (kayıt silinse de rapor izi kalır)
- `ai_cevap_json jsonb` (sorgulanabilir)
- `bolge text` (multi-tenant filtreleme için)
- **RLS:** `select`/`insert` `authenticated` rolüne açık, `update`/`delete` policy **yok** → immutable audit log (mevcut `santiye_log` çizgisi).
- Index: `(record_id, asama_no)` ve `(bolge, created_at desc)`.

---

## 5) PDF Şablonu (rapor.js içinde inline HTML)

**Şablon kaynağı:** `asel_teknik_rapor_editoru_v1_16.html` (kullanıcının önceden hazırladığı 8 bölümlü 2-sayfa A4 editör şablonu) **birebir taşınır**: aynı CSS class'ları (`.page, .report, .report-header, .logos, .meta, .title-band, .grid-main, .stack, .box, .kv, .photo-section, .photo-grid.count-2/3/4, .photo-card, .photo-frame, .photo-caption, .page-note, .continuation-head, .mini-logo, .continuation-title, .wide, .analysis-row, .conclusion, .signatures, .sign, .footer`), aynı section başlıkları, aynı `data-out`/`id` mantığıyla AI cevabı eşleştirmesi. Toolbar/panel/density/print medya kuralları taşınmaz (rapor render'ı için gereksiz).

**Logo dosyası:** `js/modals/rapor-assets.js` — şablondaki ASEL JPEG (~9.3 KB) + KÖSTER PNG (~5.5 KB) base64'leri ayrı dosyada tutulur ki `rapor.js` okunabilir kalsın. `pdfHtml` bunları `import`'la alır, `<img src="${ASEL_LOGO}">` olarak gömer.

### 5.1 Sayfa 1

- `report-header`: ASEL logo + meta tablosu — **Rapor No, Rapor Tarihi (bugün), Proje, Hazırlayan**
- `title-band`: "TEKNİK TESPİT VE DEĞERLENDİRME RAPORU" + konum rozeti
- `grid-main` (75mm sol stack + 1fr sağ stack):
  - Sol: §1 Proje Bilgileri (içinde **"Aşama Oluşturulma Tarihi"** = aşama `created_at`'i; "Rapor Tarihi"nden ayrı), §2 Kullanıcı Beyanı, §3 Kullanılan Malzeme + **`Föy: bulundu (DOSYA.pdf) | bulunamadı`** satırı, §4 Uygulama Özeti
  - Sağ: §5 Saha Gözlemi, **Fotoğraf Kanıtları** (`#photoGrid`)
- Footer: "Sayfa 1 / 2"

**İki tarih ayrımı (audit trail):**
| Alan | Kaynak | Anlamı |
|---|---|---|
| Rapor Tarihi | `new Date()` (bugün) | Raporun üretim/snapshot tarihi — yeniden üretildiğinde yenilenir |
| Aşama Oluşturulma Tarihi | `record_asamalar.created_at` (veya `santiye_records.created_at` aşamada yoksa) | Verinin orijinal tarihi — sabit kalır |

### 5.2 Sayfa 2

- `continuation-head`: mini logo + rapor no · tarih · konum
- `analysis-row` (2 kolon): §6 Hasar Analizi · §7 Teknik Kaynaklar
- `conclusion`: §8 Sonuç ve Sorumluluk
- `signatures`: Hazırlayan / Kontrol / Onay (3 kolon)
- ASEL footer (3 kart):
  - **Adres:** Organize Sanayi Bölgesi 7.Sokak, No:16, Lefkoşa / KKTC
  - **E-Mail:** bilgi@aselgroup.com
  - **Telefon:** +90 392 225 29 04

### 5.3 Foto Grid (Sayfa 1)

| Foto sayısı | Class | Düzen |
|---|---|---|
| 2 | `count-2` | Tek kolon, frame 82mm |
| 3 | `count-3` | 2 kolon; **ilk kart `grid-column:1/3`**, frame 72mm; diğerleri 52mm |
| 4 | `count-4` | 2×2, frame 54mm |

(Şablon 5 foto desteklemediği için max 4 foto: 3 normal + 1 hasar.)

Sıralama: önce normal, sonra hasar (kullanıcı önce sahayı, sonra problemi görsün). `object-fit: cover; object-position: center`.

### 5.4 Sayfa Sonu / `@page` CSS

```css
@page { size: A4; margin: 0; }
.rapor-sayfa { width: 210mm; min-height: 297mm; padding: 10mm; page-break-after: always; }
.rapor-sayfa:last-child { page-break-after: auto; }
```

### 5.5 6 AI Alanının Yerleşimi

| Alan | Sayfa | Bölüm |
|---|---|---|
| `materialDescription` | 1 | §3 Kullanılan Malzeme — açıklama satırı |
| `applicationSummary` | 1 | §4 Uygulama Özeti |
| `fieldObservation` | 1 | §5 Saha Gözlemi |
| `damageAnalysis` | 2 | §6 Hasar / Uygunsuzluk Analizi |
| `technicalReferences` | 2 | §7 Teknik Kaynaklar (föy bulunamadıysa "İlgili ürünün teknik föyü değerlendirmeye dahil edilememiştir" basılır) |
| `conclusionText` | 2 | §8 Sonuç ve Sorumluluk |

### 5.6 PDF Üretimi — html2canvas + jsPDF (v2)

**Not (2026-05-03):** İlk implementasyon `html2pdf.bundle` kullanıyordu, ancak clone'lanan container'da `height=0` ve `x=251` offset kayması bug'ları PDF'i bozdu (sayfa 1'de sadece sağ kolon, sayfa 2-3 boş). Çözüm: `html2pdf` bağımlılığı kaldırıldı; `html2canvas (1.4.1)` + `jsPDF (2.5.1)` ayrı CDN'leri ile her `.page` elementi tek tek canvas'a render edilip `jsPDF.addPage` ile birleştiriliyor.

```js
// Container görünür yap (visibility:hidden layout korur, ama html2canvas
// clone'unda layout düzgün hesaplansın diye render anında "visible"e çekilir)
tmpl.style.visibility = "visible";
await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
await new Promise(r => setTimeout(r, 300));

try {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pRect = page.getBoundingClientRect();
    const canvas = await window.html2canvas(page, {
      scale: 3,                              // 2 → 3 (kalite artışı)
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: true,
      width: pRect.width,
      height: pRect.height,
      windowWidth: pRect.width,
      windowHeight: pRect.height,
      x: 0, y: 0, scrollX: 0, scrollY: 0,
    });
    const imgData = canvas.toDataURL("image/png");  // jpeg → png
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
  }
  const pdfBlob = pdf.output("blob");
} finally {
  tmpl.style.visibility = "hidden";  // her durumda kapat
}
```

**Hizalama (CSS — 2026-05-03):** `.box .content`, `.page-2 .box .content`, `.conclusion .content` selector'larına Word görünümü için `text-align: justify; hyphens: auto; -webkit-hyphens: auto; word-spacing: -0.02em` eklendi. `.kv` (key-value satırları) ve `.photo-caption` justify almaz.

**`#rapor-template-container` CSS:** `position: fixed; left: 0; top: 0; width: 210mm; background: #fff; z-index: 99999; visibility: hidden; pointer-events: none`. Render anında `visibility = "visible"` (kullanıcı 1-1.5 sn flash görüyor, kabul edilebilir).

**Sonuç:** ~3-4 MB PDF, daha keskin metin (önceki ~1 MB JPEG/scale-2 yerine).

### 5.7 Dosya Adı Üretimi (ASCII-safe)

PDF **içeriği** tam Türkçe; ama **dosya adı** ASCII. Sebep: WhatsApp / e-posta paylaşımında, eski Windows download'larında, bazı mobil OS'lerde Türkçe karakterli dosya adları bozulabiliyor (`Aşama` → `A_ama` / `A?ama`). Drive klasör yapısı (`Şantiye Raporları/...`) Türkçe kalır — orası web view'da açılıyor, dosya adı problemi oluşturmuyor.

```js
function slugify(s) {
  return String(s || "")
    .trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tarihDamga() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

const dosyaAdi =
  `${slugify(santiye)}_${slugify(alan)}_Asama-${asama}_${tarihDamga()}.pdf`;
// Örnek: Noyanlar-Bellagio_Ciceklik-Sag_Asama-3_2026-05-02.pdf
```

**Aynı gün aynı aşamadan ikinci rapor:** `YYYY-MM-DD` aynı kalır; çakışmayı önlemek için Worker upload'unda mevcut isim varsa sonuna `_HHmm` eklenir (`..._2026-05-02_1430.pdf`). Bu mantık `/raporPdf` endpoint'inde uygulanır, frontend dosya adını çakışmadan habersiz gönderir.

---

## 6) Test Akışı (10 adım)

| # | Adım | Beklenen |
|---|---|---|
| 1 | Hasar fotolu aşamayı aç | "📄 Rapor" butonu görünür |
| 2 | Hasarsız aşama | Buton **görünmez** |
| 3 | Misafir oturum | Buton **görünmez** (hasar foto olsa bile) |
| 4 | Yorum textarea'ya 19 char | "Üret" butonu **pasif** |
| 5 | Yorum 20+ char | "Üret" butonu aktif |
| 6 | "Üret" tıkla | 20–40 sn loading: "Fotolar hazırlanıyor…" → "AI değerlendiriyor…" → "PDF üretiliyor…" |
| 7 | Sonuç ekranındaki linki tıkla | PDF yeni sekmede açılır |
| 8 | Drive'da konum | `Şantiye Raporları/[Şantiye]/<Santiye>_<Alan>_Asama-N_YYYY-MM-DD.pdf` (ASCII) |
| 9 | Aynı aşamadan 2. rapor üret (aynı gün) | İkinci dosya `_HHmm` suffix'iyle çakışmadan kaçınır; ilki silinmez |
| 10 | Worker bilerek hata fırlat | Hata ekranı + mesaj + "Tekrar Dene" butonu modali yorum adımına döndürür |

---

## 7) Rollback

| Adım | Yöntem |
|---|---|
| Worker eski sürüme dön | Cloudflare Dashboard → Worker → Deployments → Rollback |
| Frontend butonunu kapat | `js/modals/record.js` içinde `raporBtnHtml` üretimini yorum satırına al — modülün geri kalanı yüklü kalır, başka akış etkilenmez |
| AI'yi devre dışı bırak | Cloudflare → Variables → `GEMINI_API_KEY` sil; Worker `/rapor` 500 döner; uygulamanın geri kalanı çalışmaya devam eder |
| Tüm modülü sil | `js/rapor.js` dosyasını sil + `main.js`'teki `import "./rapor.js"` satırını sil + `index.html`'deki `#rapor-modal` ve `html2pdf` CDN satırlarını sil + `MODULES.md`'den ilgili satırı çıkar |

---

## 8) Kullanıcı Yapacak (Deploy Öncesi)

1. **Supabase migration:** `migrations/2026-05-02_santiye_raporlar.sql` içeriğini Supabase Dashboard → SQL Editor'a yapıştır + çalıştır. Tablo, index'ler ve RLS policy'leri tek seferde kurulur. (Idempotent değil; iki kere çalıştırma.)
2. **Drive föy klasörünü** (`1-xqiQMId4Xs6KrP6pqB6aZhmbBJXlve0`) Worker'ın service-account hesabıyla **Editor** yetkisinde paylaş — alternatif olarak `eng.adtoker@gmail.com` ile paylaş ve service-account zaten o hesapla bağlıysa yeterli.
3. **Gemini API key al:** https://aistudio.google.com/app/apikey
4. **Cloudflare Worker → Settings → Variables and Secrets:**
   - **Add:** `GEMINI_API_KEY` (Encrypt seçili)
   - **Delete:** `OPENAI_API_KEY` (varsa)
5. Drive'da **`Şantiye Raporları`** kök klasörü Worker tarafından otomatik açılır; manuel açmaya gerek yok.

---

## 9) Kabul Kriterleri

- [ ] Hasar fotosu olmayan aşamada buton render edilmiyor.
- [ ] Misafir oturumda hiçbir aşamada buton render edilmiyor.
- [ ] 20 karakter altında yorumla "Üret" tıklanamıyor (HTML `disabled` + JS guard).
- [ ] Föy bulunduğunda PDF'in §7'sinde dosya adı geçiyor.
- [ ] Föy bulunmadığında §7'de "değerlendirmeye dahil edilememiştir" notu var, rapor yine üretiliyor.
- [ ] PDF tam olarak 2 sayfa A4 (210×297mm) ve `@page margin:0`.
- [ ] Aynı aşamadan ikinci rapor, ilkini silmiyor.
- [ ] Worker `/upload` mevcut akışı bozulmamış (regresyon: bir hasar fotosu yükle, modal foto akışı çalışıyor mu?).
- [ ] CLAUDE.md kuralları korundu: `H` mutate, `app.bolge` filtresi, identifier Türkçe, `el()`/`esc()`/`toast()` kullanımı.
- [ ] `MODULES.md` güncel.

---

## 10) Riskler ve Notlar

| # | Konu | Not |
|---|---|---|
| 1 | Gemini 2.5 Flash 250 RPD limiti | Tek kullanıcı için bol; yine de quota tükenirse Worker 429 → frontend "Günlük limit" mesajı. Spec'e dahil değil, isterseniz ekleriz. |
| 2 | Drive base64 yükleme limiti | Worker request body Cloudflare ücretsiz planda 100 MB. 5 fotoğraf + 2-sayfa PDF + föy PDF (~5–10 MB) toplamı güvenli; sınır aşılırsa stream upload'a geçilir. |
| 3 | `html2pdf` ile özel font | Şu an Arial; kurumsal font isterseniz CSS `@font-face` + base64. Spec'te yok. |
| 4 | Aşama `created_at` kaynağı | Aşama oluşturulma tarihi `record_asamalar.created_at`'ten gelmeli; ancak `js/data.js::satirToKayit` aşama nesnesine bunu propagate ediyor mu, implementasyon sırasında doğrulanacak. Yoksa fallback: `santiye_records.created_at`. |
| 5 | Hazırlayan alanı | `_oturum.ad` — `KULLANICI_ADLARI` map'inden geliyor (CLAUDE.md). Yeni admin eklenirse map güncellenir. `hazirlayan_email` ek alanı audit için map'ten bağımsız kesin değer tutar. |
| 6 | Drive ↔ DB tutarsızlığı | Drive yazıldı + INSERT başarısız nadir senaryo. Frontend toast ile bildirir, kullanıcı görür. Cron tabanlı reconcile eklenmedi (gereksiz overhead). |

---

## 11) Dosya Değişiklik Listesi (implementasyon kapsamı)

| Dosya | Değişiklik |
|---|---|
| `migrations/2026-05-02_santiye_raporlar.sql` | **YENİ** — DDL + RLS + index'ler |
| `cloudflare-worker.js` | `/rapor` ve `/raporPdf` eklenir; eski OpenAI varsa silinir |
| `js/modals/rapor.js` | **YENİ** — Drive upload sonrası `santiye_raporlar` INSERT'ü dahil; PDF şablonu `asel_teknik_rapor_editoru_v1_16.html` birebir taşınmış |
| `js/modals/rapor-assets.js` | **YENİ** — şablondaki ASEL + KÖSTER logo base64'leri (rapor.js okunabilirliği için ayrı dosya) |
| `js/main.js` | `import "./modals/rapor.js"` eklenir |
| `js/views/detail.js` | Aşama kartı render'ına `raporBtnHtml` koşullu eklenir |
| `js/data.js` | `record_asamalar.created_at` ve `record_fotograflar.created_at` aşama/foto objelerine propagate edilir (foto sıralama + aşama tarihi için) |
| `index.html` | `html2canvas` + `jspdf` CDN script'leri (eski `html2pdf` bundle kaldırıldı, 2026-05-03), `#rapor-modal`, `#rapor-template-container` (`position:fixed; visibility:hidden`), `<base href="/">` SPA path fix |
| `MODULES.md` | Yeni modül satırı |
| `css/modals.css` (veya `components.css`) | `.rapor-btn` küçük stil ekleme |
| Supabase | Migration SQL'i Dashboard'dan çalıştırılır |
| Cloudflare Worker env | `GEMINI_API_KEY` ekle / `OPENAI_API_KEY` sil |

---

**SPEC FİNAL.** Tüm açık noktalar kapandı. Implementasyona geçilebilir.
