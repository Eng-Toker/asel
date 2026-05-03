// Cloudflare Worker — Drive Upload + AI Rapor (Gemini 2.5 Flash)
// Ortam değişkenleri:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//   DRIVE_KLASOR_ID            (foto kökü — "Şantiye Yedek")
//   GEMINI_API_KEY             (yeni — AI Studio key)

const DRIVE_FOY_KLASOR_ID = '1-xqiQMId4Xs6KrP6pqB6aZhmbBJXlve0';
const RAPOR_KOK_KLASOR_ADI = 'Şantiye Raporları';

// Föy index cache key — Worker'ın kendi hostname'i (caches.default şartı).
const FOY_INDEX_CACHE_URL = 'https://drive-upload.eng-adtoker.workers.dev/__cache/koster-foy-index-v3';

const SISTEM_PROMPT = `Sen ASEL Group bünyesinde çalışan kıdemli bir su yalıtım ve izolasyon
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
- conclusionText: Sonuç, teknik kanaat ve sorumluluk değerlendirmesi.`;

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── /foyTest ─ Geçici test endpoint (GET veya POST). Onay sonrası silinecek. ──
    if (path === '/foyTest') {
      try {
        const tA = Date.now();
        const token = await getAccessToken(env);
        const tB = Date.now();
        const { index, cached, buildMs } = await kosterFoyIndexYukle(token);
        const tC = Date.now();

        const testCases = [
          { input: 'KÖSTER KBE Flüssigfolie',     expect: 'drive-tf' },
          { input: 'KÖSTER NB 2000',              expect: 'drive-tf' },
          { input: 'KÖSTER BDM / BDM Powder',     expect: 'drive-tf' },
          { input: 'KÖSTER KB-Pur IN',            expect: 'drive-tf' },
          { input: 'KÖSTER Polysil TG 500',       expect: 'drive-tf' },
          { input: 'KÖSTER TPO Aqua U15',         expect: 'tf-yok'   },
          { input: 'Fondolin',                    expect: 'none'     },
          { input: 'KÖSTER Asla Var Olmayan X',   expect: 'none'     },
        ];
        const tests = testCases.map(tc => {
          const actual = foyEslestir(tc.input, index);
          return {
            input:        tc.input,
            normalized:   normalizeKlasorAdi(tc.input),
            expected:     tc.expect,
            actual:       actual.kaynak,
            klasorAdi:    actual.klasorAdi || null,
            tfDosyasi:    actual.file?.fileName || null,
            sebep:        actual.sebep || null,
            pass:         actual.kaynak === tc.expect,
          };
        });

        const kategoriDagilimi = {};
        const tfYokListesi = [];
        for (const [key, val] of Object.entries(index)) {
          const kat = val.kategori || '(yok)';
          kategoriDagilimi[kat] = (kategoriDagilimi[kat] || 0) + 1;
          if (val.tfYok) tfYokListesi.push({ key, klasorAdi: val.klasorAdi, kategori: val.kategori });
        }

        // KÖSTER web fallback testleri (paralel)
        const webGirdileri = [
          'KÖSTER TPO Aqua U15',          // Drive'da TF yok, web'de bulunmalı
          'KÖSTER KBE Flüssigfolie',      // web kontrol
          'KÖSTER NB 2000',               // web kontrol
          'KÖSTER Asla Var Olmayan X',    // web-yok bekleniyor
        ];
        const tD = Date.now();
        const kosterWebTest = await Promise.all(webGirdileri.map(async input => {
          const ti = Date.now();
          const r = await kosterWebAra(input);
          const tj = Date.now();
          return {
            input,
            query:            r.query || null,
            kaynak:           r.kaynak,
            url:              r.url || null,
            baslik:           r.baslik || null,
            icerik_uzunluk:   r.icerik?.length || 0,
            icerik_baslangic: r.icerik ? r.icerik.slice(0, 200) : null,
            sebep:            r.sebep || null,
            adim:             r.adim || null,
            error:            r.error || null,
            ms:               tj - ti,
          };
        }));
        const tE = Date.now();

        return new Response(JSON.stringify({
          timings: {
            token_ms:        tB - tA,
            index_lookup_ms: tC - tB,
            build_ms:        cached ? null : buildMs,
            cached,
            web_test_ms:     tE - tD,
          },
          ozet: {
            toplam_urun:        Object.keys(index).length,
            kategori_dagilimi:  kategoriDagilimi,
            tf_yok_sayisi:      tfYokListesi.length,
            tf_yok_listesi:     tfYokListesi,
          },
          tests,
          kosterWebTest,
          tum_anahtarlar: Object.keys(index).sort(),
        }, null, 2), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // ── /rapor ─ AI ile teknik rapor 6 alanı üret (Gemini 2.5 Flash) ──────────
    if (path === '/rapor') {
      try {
        const { yorum, malzeme, fotolar, santiye, alan } = await request.json();
        const sonuc = await aiRaporUret(env, { yorum, malzeme, fotolar, santiye, alan });
        return new Response(JSON.stringify(sonuc), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ basarili: false, hata: err.message }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── /fotoIndir ─ Drive fotoğrafını base64 olarak proxyle (CORS bypass) ──
    // Kabul edilen body: { fileId } veya { fileUrl } (eski kayıtlar için).
    if (path === '/fotoIndir') {
      try {
        const { fileId: gelenId, fileUrl } = await request.json();
        const id = gelenId || driveUrlIdCikar(fileUrl);
        if (!id) throw new Error('fileId/fileUrl her ikisi de boş veya çözülemedi');

        const token = await getAccessToken(env);

        const metaR = await fetch(
          `https://www.googleapis.com/drive/v3/files/${id}?fields=mimeType`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const meta = await metaR.json();
        if (!metaR.ok) throw new Error('Foto metadata alınamadı: ' + JSON.stringify(meta));

        const data = await driveDosyaIndir(token, id);
        return new Response(JSON.stringify({
          basarili: true,
          data,
          mimeType: meta.mimeType || 'image/jpeg',
          fileId: id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ basarili: false, hata: err.message }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── /raporPdf ─ Üretilen PDF'i Drive'a yükle ─────────────────────────────
    if (path === '/raporPdf') {
      try {
        const { pdfBase64, santiye, alan, asama, dosyaAdi } = await request.json();
        const sonuc = await pdfRaporYukle(env, { pdfBase64, santiye, alan, asama, dosyaAdi });
        return new Response(JSON.stringify(sonuc), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ basarili: false, hata: err.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Varsayılan ─ fotoğraf yükleme (mevcut akış, DOKUNULMADI) ──────────────
    try {
      const { imageData, fileName, santiye, alan, bolge } = await request.json();
      const accessToken = await getAccessToken(env);

      const bugun = new Date().toLocaleDateString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        timeZone: 'Europe/Istanbul'
      }).replace(/\./g, '-');

      const bolgeAdi = bolge || 'İskele';
      const bolgeId   = await klasorBulVeyaOlustur(accessToken, env.DRIVE_KLASOR_ID, bolgeAdi);
      const santiyeId = await klasorBulVeyaOlustur(accessToken, bolgeId, santiye);
      const tarihId   = await klasorBulVeyaOlustur(accessToken, santiyeId, bugun);
      const alanId    = await klasorBulVeyaOlustur(accessToken, tarihId, alan);

      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const binary = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      const fileId = await driveMultipartYukle(accessToken, alanId, fileName, 'image/jpeg', binary);

      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      });

      const fileUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;

      return new Response(JSON.stringify({ fileUrl, fileId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};

// ─── Google Auth (mevcut) ────────────────────────────────────────────────────

async function getAccessToken(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token alınamadı: ' + JSON.stringify(data));
  return data.access_token;
}

// ─── Drive klasör/dosya yardımcıları ──────────────────────────────────────────

async function klasorBulVeyaOlustur(token, parentId, name) {
  if (!parentId) throw new Error('parentId eksik (name: ' + name + ')');
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const listData = await listRes.json();
  if (listData.files?.length > 0) return listData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const createData = await createRes.json();
  if (!createData.id) throw new Error('Klasör oluşturulamadı (' + name + '): ' + JSON.stringify(createData));
  return createData.id;
}

async function klasorBulVeyaOlusturRoot(token, name) {
  const q = `name='${name.replace(/'/g, "\\'")}' and 'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const listData = await listRes.json();
  if (listData.files?.length > 0) return listData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const createData = await createRes.json();
  if (!createData.id) throw new Error('Kök klasör oluşturulamadı (' + name + '): ' + JSON.stringify(createData));
  return createData.id;
}

async function driveMultipartYukle(token, parentId, fileName, mimeType, binary) {
  const boundary = '-------CloudflareWorkerBoundary';
  const metadata = JSON.stringify({ name: fileName, parents: [parentId] });

  const encoder = new TextEncoder();
  const part1 = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`);
  const part2 = encoder.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const part3 = encoder.encode(`\r\n--${boundary}--`);

  const combined = new Uint8Array(part1.length + part2.length + binary.length + part3.length);
  combined.set(part1, 0);
  combined.set(part2, part1.length);
  combined.set(binary, part1.length + part2.length);
  combined.set(part3, part1.length + part2.length + binary.length);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: combined,
    }
  );
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.id) throw new Error('Drive yükleme hatası: ' + JSON.stringify(uploadData));
  return uploadData.id;
}

function driveUrlIdCikar(url) {
  if (!url) return null;
  const s = String(url);
  // 1) thumbnail / open?id formatı: ?id=XXX veya &id=XXX
  let m = s.match(/[?&]id=([^&#]+)/);
  if (m) return m[1];
  // 2) /file/d/XXX/ veya /file/d/XXX (view, edit, vb.)
  m = s.match(/\/file\/d\/([^/?#]+)/);
  if (m) return m[1];
  // 3) lh3.googleusercontent.com/d/XXX=w...
  m = s.match(/\/d\/([^/?#=]+)/);
  if (m) return m[1];
  return null;
}

// Bir klasörün doğrudan altındaki tüm öğeleri (klasör + dosya) listeler.
async function driveListele(token, klasorId) {
  const q = `'${klasorId}' in parents and trashed=false`;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=200`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const d = await r.json();
  return d.files || [];
}

// Recursive: kategori klasörlerinin altına 1 seviye iner, tüm PDF'leri toplar.
async function drivePdfListele(token, klasorId) {
  const oge = await driveListele(token, klasorId);
  const pdfler = [];
  for (const o of oge) {
    if (o.mimeType === 'application/vnd.google-apps.folder') {
      const altPdfler = await drivePdfListele(token, o.id);
      pdfler.push(...altPdfler);
    } else if (o.mimeType === 'application/pdf') {
      pdfler.push(o);
    }
  }
  return pdfler;
}

async function driveDosyaIndir(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!r.ok) throw new Error('Föy indirilemedi: ' + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  // Worker Cloudflare ortamında base64 encode için manuel
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

async function dosyaAdiCakismaCoz(token, parentId, fileName) {
  for (let i = 0; i < 5; i++) {
    const aday = i === 0 ? fileName : suffixEkle(fileName, i);
    const q = `name='${aday.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const d = await r.json();
    if (!d.files?.length) return aday;
  }
  // 5 deneme sonrası bile çakışma — son aday'ı dön
  return suffixEkle(fileName, 5);
}

function suffixEkle(fileName, denemeNo) {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  let suffix = `_${pad(d.getHours())}${pad(d.getMinutes())}`;
  if (denemeNo >= 2) suffix += pad(d.getSeconds());
  if (denemeNo >= 3) suffix += denemeNo;
  return fileName.replace(/\.pdf$/i, `${suffix}.pdf`);
}

// ─── Föy klasör-eşleme (v3) ──────────────────────────────────────────────────
// Drive yapısı: root → 9 kategori → 35 ürün (leaf) klasörü → PDF'ler.
// Her leaf klasör adı app'teki malzeme adıyla 1:1 eşleşir (TR karakter +
// boşluk + slash normalizasyonu sonrası). TF dosyası leaf içinde aranır.

function normalizeKlasorAdi(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/\//g, '')             // "BDM / BDM Powder" → "BDM  BDM Powder"
    .replace(/\s+/g, ' ')           // çift boşluk tek boşluğa
    .normalize('NFD')               // diakritik ayrıştırması
    .replace(/[̀-ͯ]/g, '') // combining mark'leri at
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .toLowerCase()
    .trim();
}

function foyEslestir(malzeme, index) {
  const key = normalizeKlasorAdi(malzeme);
  if (!key) return { kaynak: 'none', sebep: 'malzeme-bos' };
  const hit = index[key];
  if (!hit) return { kaynak: 'none', sebep: 'malzeme-listede-yok' };
  if (hit.tfYok) {
    return {
      kaynak:    'tf-yok',
      sebep:     'klasor-var-tf-eksik',
      klasorAdi: hit.klasorAdi,
      kategori:  hit.kategori,
    };
  }
  return {
    kaynak:    'drive-tf',
    file:      { fileId: hit.fileId, fileName: hit.fileName },
    klasorAdi: hit.klasorAdi,
    kategori:  hit.kategori,
  };
}

// Recursive: leaf klasörlere kadar in, leaf'leri index'e koy.
// Root'tan ilk seviye = kategori adı (kategori parametresine yazılır).
async function foyIndexBuildRecursive(token, folderId, folderName, kategori) {
  const items = await driveListele(token, folderId);
  const subFolders = items.filter(o => o.mimeType === 'application/vnd.google-apps.folder');
  const pdfs       = items.filter(o => o.mimeType === 'application/pdf');

  // Alt klasör varsa: bu seviye leaf değil, paralel olarak in.
  if (subFolders.length > 0) {
    const subResults = await Promise.all(
      subFolders.map(f => foyIndexBuildRecursive(
        token,
        f.id,
        f.name,
        // Root → 1. seviye: kategori = f.name. Daha derin: kategori değişmez.
        kategori === null ? f.name : kategori
      ))
    );
    return Object.assign({}, ...subResults);
  }

  // Leaf klasör. folderName boşsa (root düz PDF içeriyorsa) atla.
  if (!folderName) return {};

  const tf = pdfs.find(p => /-TF(-\d+)?\.pdf$/i.test(p.name));
  const key = normalizeKlasorAdi(folderName);
  if (tf) {
    return { [key]: { fileId: tf.id, fileName: tf.name, klasorAdi: folderName, kategori } };
  }
  return { [key]: { tfYok: true, klasorAdi: folderName, kategori } };
}

async function kosterFoyIndexYukle(token) {
  const cacheKey = new Request(FOY_INDEX_CACHE_URL);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const index = await cached.json();
    return { index, cached: true, buildMs: 0 };
  }

  const t0 = Date.now();
  const index = await foyIndexBuildRecursive(token, DRIVE_FOY_KLASOR_ID, null, null);
  const buildMs = Date.now() - t0;

  await caches.default.put(cacheKey, new Response(JSON.stringify(index), {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 's-maxage=3600',
    },
  }));

  return { index, cached: false, buildMs };
}

// ─── KÖSTER web fallback (koster.com.tr/ara → /<slug>/) ──────────────────────
// SADECE KÖSTER ürünleri için çağrılır. Çağıran taraf bu kuralı uygular;
// fonksiyon kendi içinde de defensive double-check yapar.

async function kosterWebAra(malzeme) {
  // Defensive: KÖSTER değilse hiç deneme
  const norm = normalizeKlasorAdi(malzeme);
  if (!norm.startsWith('koster')) {
    return { kaynak: 'web-yok', sebep: 'koster-degil' };
  }

  const query = kosterQueryHazirla(malzeme);
  if (!query) {
    return { kaynak: 'web-yok', sebep: 'sorgu-bos' };
  }

  // 1) Site arama
  const aramaUrl = `https://koster.com.tr/ara/?q=${encodeURIComponent(query)}`;
  let aramaHtml;
  try {
    aramaHtml = await kosterFetch(aramaUrl);
  } catch (e) {
    return { kaynak: 'web-yok', sebep: 'fetch-hatasi', adim: 'arama', query, error: e.message };
  }

  // 2) İlk ürün anchor'ını bul (attribute sırasına tolerant)
  const anchorIciYakala = (re) => aramaHtml.match(re);
  let anchorMatch =
    anchorIciYakala(/<a\s[^>]*\bhref="([^"]+)"[^>]*\bclass="[^"]*\blist-group-item-action\b[^"]*"[^>]*>([\s\S]*?)<\/a>/) ||
    anchorIciYakala(/<a\s[^>]*\bclass="[^"]*\blist-group-item-action\b[^"]*"[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  if (!anchorMatch) {
    return { kaynak: 'web-yok', sebep: 'arama-sonucsuz', query };
  }
  const detayUrl = anchorMatch[1];
  const anchorIci = anchorMatch[2];

  const strongMatch = anchorIci.match(/<strong>([\s\S]*?)<\/strong>/);
  const baslikRaw = strongMatch ? stripHtmlTags(strongMatch[1]) : '';

  // 3) Detay sayfayı çek
  let detayHtml;
  try {
    detayHtml = await kosterFetch(detayUrl);
  } catch (e) {
    return { kaynak: 'web-yok', sebep: 'fetch-hatasi', adim: 'detay', query, url: detayUrl, error: e.message };
  }

  // 4) Ana içerik bloğu: col-md-7 başlangıcından ilk "addtional" div'ine kadar
  const blokStart = detayHtml.indexOf('<div class="col-12 col-md-7">');
  if (blokStart === -1) {
    return { kaynak: 'web-yok', sebep: 'parse-hatasi', adim: 'col-md-7-yok', query, url: detayUrl };
  }
  const additionalIdx = detayHtml.indexOf('<div class="addtional', blokStart);
  const blokEnd = additionalIdx === -1 ? detayHtml.length : additionalIdx;
  const blok = detayHtml.slice(blokStart, blokEnd);

  // 5) h1, h2, p text'lerini sırayla çek
  const parcalar = [];
  const tagRegex = /<(h1|h2|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let tm;
  while ((tm = tagRegex.exec(blok)) !== null) {
    const inner = stripHtmlTags(tm[2]).replace(/\s+/g, ' ').trim();
    if (inner) parcalar.push(inner);
  }
  if (parcalar.length === 0) {
    return { kaynak: 'web-yok', sebep: 'icerik-bos', query, url: detayUrl };
  }

  let icerik = decodeKosterEntities(parcalar.join('\n\n')).trim();
  if (icerik.length > 5000) icerik = icerik.slice(0, 5000) + '…';

  return {
    kaynak: 'koster-web',
    url: detayUrl,
    baslik: decodeKosterEntities(baslikRaw).trim(),
    icerik,
    query,
  };
}

function kosterQueryHazirla(malzeme) {
  const stopWords = new Set([
    '2k', '25', '50', '110', '120', '214', '500', '560', '002',
    'kg', 'lt', 'ml', 'gr',
    'set', 'in', 'beyaz',
  ]);
  const norm = normalizeKlasorAdi(malzeme);
  const tokens = norm
    .split(/[\s\-_]+/)
    .filter(t => t && t !== 'koster' && !stopWords.has(t));
  return tokens.slice(0, 3).join(' ');
}

async function kosterFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

function stripHtmlTags(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '');
}

function decodeKosterEntities(s) {
  const ents = {
    '&Ouml;': 'Ö', '&ouml;': 'ö',
    '&Uuml;': 'Ü', '&uuml;': 'ü',
    '&Ccedil;': 'Ç', '&ccedil;': 'ç',
    '&Auml;': 'Ä', '&auml;': 'ä',
    '&szlig;': 'ß',
    '&amp;': '&', '&quot;': '"', '&nbsp;': ' ',
    '&#39;': "'", '&apos;': "'",
  };
  let out = String(s || '');
  for (const [k, v] of Object.entries(ents)) {
    out = out.split(k).join(v);
  }
  return out;
}

// ─── Gemini AI çağrısı ───────────────────────────────────────────────────────

async function aiRaporUret(env, { yorum, malzeme, fotolar, santiye, alan }) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY tanımlı değil');

  const token = await getAccessToken(env);

  // 1) Drive föy lookup (klasör-eşleme)
  // foyBulundu semantiği: "AI'ya teknik kaynak iliştirildi mi" — drive-tf VE
  // koster-web durumlarında true. foyDosyaAdi sadece drive-tf'te dolu çünkü
  // santiye_raporlar.foy_dosya_adi DB kolonu Drive PDF dosya adına özel.
  let foyBulundu   = false;
  let foyDosyaAdi  = null;
  let foyBase64    = null;
  let foyKaynak    = 'none';   // drive-tf | tf-yok | none | koster-web | web-yok | ai-general
  let foyKlasor    = null;
  let foyWebUrl    = null;
  let foyWebBaslik = null;
  let foyWebIcerik = null;     // sadece prompt için, response'a girmiyor
  try {
    const { index, cached, buildMs } = await kosterFoyIndexYukle(token);
    const eslesme = foyEslestir(malzeme, index);
    console.log("[KAYNAK] Drive eşleşme:", JSON.stringify(eslesme), "cache:", cached, "build_ms:", buildMs);
    foyKaynak = eslesme.kaynak;
    foyKlasor = eslesme.klasorAdi || null;
    if (eslesme.kaynak === 'drive-tf') {
      foyBase64 = await driveDosyaIndir(token, eslesme.file.fileId);
      foyBulundu = true;
      foyDosyaAdi = eslesme.file.fileName;
      console.log("[KAYNAK] drive-tf → PDF Gemini'ye yükleniyor:", foyDosyaAdi);
    }
  } catch (e) {
    // Föy hatası raporu engellemez; sadece atla
    console.error("[KAYNAK] Drive index/eşleşme hatası:", e.message);
    foyKaynak = 'none';
  }

  // 2) Drive bulunamadıysa → KÖSTER web fallback (yalnız KÖSTER ürünleri)
  if (foyKaynak === 'tf-yok' || foyKaynak === 'none') {
    const isKoster = normalizeKlasorAdi(malzeme).startsWith('koster');
    if (isKoster) {
      console.log("[KAYNAK]", foyKaynak, "→ KÖSTER web aranıyor");
      try {
        const web = await kosterWebAra(malzeme);
        if (web.kaynak === 'koster-web') {
          foyKaynak    = 'koster-web';
          foyBulundu   = true;          // AI'ya kaynak iliştirildi (text part)
          foyWebUrl    = web.url;
          foyWebBaslik = web.baslik;
          foyWebIcerik = web.icerik;
          console.log("[KAYNAK] koster-web başarılı:", web.url);
        } else {
          foyKaynak = 'web-yok';
          console.log("[KAYNAK] web-yok:", web.sebep);
        }
      } catch (e) {
        foyKaynak = 'web-yok';
        console.error("[KAYNAK] kosterWebAra hatası:", e.message);
      }
    } else {
      foyKaynak = 'ai-general';
      console.log("[KAYNAK] KÖSTER ürünü değil → ai-general");
    }
  }

  // 3) Bağlam metni — kaynağa göre dinamik FÖY DURUMU satırı
  const fotolarDizi = Array.isArray(fotolar) ? fotolar : [];
  const hasarSayisi = fotolarDizi.filter(f => f.type === 'hasar').length;
  const normalSayisi = fotolarDizi.filter(f => f.type !== 'hasar').length;

  const foyDurumuMetni = (() => {
    if (foyKaynak === 'drive-tf')   return `Ekte (Drive teknik föyü: ${foyDosyaAdi})`;
    if (foyKaynak === 'koster-web') return `KÖSTER resmi web sitesinden alındı (${foyWebUrl})`;
    if (foyKaynak === 'tf-yok')     return `Drive klasörü mevcut ama TF dosyası yok (${foyKlasor})`;
    if (foyKaynak === 'web-yok')    return `Bulunamadı (KÖSTER, hiçbir kaynakta yok)`;
    if (foyKaynak === 'ai-general') return `Kaynak yok (KÖSTER dışı)`;
    return 'Bulunamadı';
  })();

  const baglam = [
    `ŞANTİYE: ${santiye || '-'}`,
    `ALAN: ${alan || '-'}`,
    `MALZEME: ${malzeme || '-'}`,
    `FÖY DURUMU: ${foyDurumuMetni}`,
    `KULLANICI BEYANI: ${yorum || '-'}`,
    `HASAR FOTOĞRAFI: ${hasarSayisi} adet`,
    `NORMAL FOTOĞRAF: ${normalSayisi} adet`,
  ].join('\n');

  // 4) Gemini parts: bağlam + (drive-tf) PDF VEYA (koster-web) text + fotoğraflar
  const parts = [{ text: baglam }];
  if (foyBase64) {
    parts.push({ inline_data: { mime_type: 'application/pdf', data: foyBase64 } });
  } else if (foyKaynak === 'koster-web' && foyWebIcerik) {
    parts.push({ text:
      `\n\nTEKNİK FÖY (web kaynağı)\n` +
      `Başlık: ${foyWebBaslik || '-'}\n` +
      `URL: ${foyWebUrl}\n` +
      `Bu bilgi KÖSTER resmi web sitesinden alınmıştır.\n\n` +
      foyWebIcerik
    });
  }
  for (const f of fotolarDizi) {
    if (f && f.data) parts.push({ inline_data: { mime_type: f.mimeType || 'image/jpeg', data: f.data } });
  }

  // 5) System prompt extension — kaynak türünü AI raporda belirtsin
  // SABİT SISTEM_PROMPT constant'ına dokunulmuyor; sadece request'te append.
  // (Geçici yaklaşım — sonraki adımda final wording yapılacak.)
  const kaynakAciklama = ({
    'drive-tf':   'Drive teknik föyü (PDF, ekte)',
    'koster-web': 'KÖSTER resmi web sitesi içeriği (metin, ekte)',
    'tf-yok':     'Kaynak yok (Drive klasör var, TF eksik)',
    'web-yok':    'Kaynak yok (Drive ve web aramada bulunamadı)',
    'ai-general': 'Kaynak yok (KÖSTER dışı ürün)',
    'none':       'Kaynak yok',
  })[foyKaynak] || 'Kaynak bilinmiyor';

  const sistemPromptEk =
    `\n\nBU RAPOR İÇİN KAYNAK: ${kaynakAciklama}\n` +
    `Raporun "technicalReferences" alanında kullanılan kaynak türünü açıkça belirt. ` +
    `Web kaynağı kullanıldıysa "KÖSTER resmi web sitesi" ifadesini geçir.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEM_PROMPT + sistemPromptEk }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          required: [
            'materialDescription', 'applicationSummary', 'fieldObservation',
            'damageAnalysis', 'technicalReferences', 'conclusionText'
          ],
          properties: {
            materialDescription: { type: 'string' },
            applicationSummary:  { type: 'string' },
            fieldObservation:    { type: 'string' },
            damageAnalysis:      { type: 'string' },
            technicalReferences: { type: 'string' },
            conclusionText:      { type: 'string' },
          },
        },
      },
    }),
  });

  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`AI sağlayıcı hatası ${r.status}: ${errText.slice(0, 500)}`);
  }

  const data = await r.json();
  const metin = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!metin) throw new Error('AI cevabı boş geldi');

  let rapor;
  try {
    rapor = JSON.parse(metin);
  } catch {
    throw new Error('AI cevabı geçerli JSON değil');
  }

  // Eksik alanı boş string'e karşıla
  const alanlar = ['materialDescription', 'applicationSummary', 'fieldObservation',
                   'damageAnalysis', 'technicalReferences', 'conclusionText'];
  for (const k of alanlar) if (typeof rapor[k] !== 'string') rapor[k] = '';

  return {
    basarili: true,
    rapor,
    foyBulundu,    // true: drive-tf VEYA koster-web (AI'ya kaynak iliştirildi)
    foyDosyaAdi,   // sadece drive-tf'te dolu (DB foy_dosya_adi kolonuna gider)
    foyKaynak,     // drive-tf | tf-yok | none | koster-web | web-yok | ai-general
    foyKlasor,     // tf-yok diagnostiği için
    foyWebUrl,     // koster-web ise dolu
    foyWebBaslik,  // koster-web ise dolu
  };
}

// ─── PDF Drive'a yükle ───────────────────────────────────────────────────────

async function pdfRaporYukle(env, { pdfBase64, santiye, alan, asama, dosyaAdi }) {
  if (!pdfBase64) throw new Error('pdfBase64 boş');
  if (!santiye)   throw new Error('santiye boş');
  if (!dosyaAdi)  throw new Error('dosyaAdi boş');

  const token = await getAccessToken(env);

  const kokId     = await klasorBulVeyaOlusturRoot(token, RAPOR_KOK_KLASOR_ADI);
  const santiyeId = await klasorBulVeyaOlustur(token, kokId, santiye);

  const finalAd = await dosyaAdiCakismaCoz(token, santiyeId, dosyaAdi);

  // base64 → binary
  const temizBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
  const binary = Uint8Array.from(atob(temizBase64), c => c.charCodeAt(0));

  const fileId = await driveMultipartYukle(token, santiyeId, finalAd, 'application/pdf', binary);

  // Public read
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return {
    basarili: true,
    fileUrl: `https://drive.google.com/file/d/${fileId}/view`,
    fileId,
    fileName: finalAd,
  };
}
