// Cloudflare Worker — Drive Upload + AI Rapor (Gemini 2.5 Flash)
// Ortam değişkenleri:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//   DRIVE_KLASOR_ID            (foto kökü — "Şantiye Yedek")
//   GEMINI_API_KEY             (yeni — AI Studio key)

const DRIVE_FOY_KLASOR_ID = '1-xqiQMId4Xs6KrP6pqB6aZhmbBJXlve0';
const RAPOR_KOK_KLASOR_ADI = 'Şantiye Raporları';

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

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

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

// ─── Föy fuzzy match ─────────────────────────────────────────────────────────

function normalizeMalzeme(s) {
  return String(s || '')
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function foyEslestir(malzeme, pdfListesi) {
  const norm = normalizeMalzeme(malzeme);
  if (!norm) return { eslesme: 'none' };

  // ─── ÖN KONTROL: KÖSTER ürünü mü? ───
  // Tüm KÖSTER olmayan malzemeler için Drive'da föy zaten yok.
  // Sonradan internet fallback'i eklenecek.
  if (!norm.startsWith('koster')) {
    console.log("KÖSTER ürünü değil, Drive araması atlandı:", malzeme);
    return { eslesme: 'none', sebep: 'koster-degil' };
  }

  // ─── Tokenize: ≥3 karakter ───
  const tokenize = (s) => normalizeMalzeme(s)
    .replace(/[-_.,()\/]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);

  const malzemeTokens = tokenize(malzeme);
  if (malzemeTokens.length === 0) return { eslesme: 'none' };

  // ─── Stop-words: anlam taşımayan token'lar ───
  // Skoru dolduran ama belirleyici olmayan kelimeler.
  // Genel ürün adı, ölçü birimleri, belge tipi kodları, standart kodları.
  const stopWords = new Set([
    'koster', 'köster',
    'kg', 'lt', 'ml', 'gr',
    'gbf', 'tds', 'msds', 'pdf', 'rapor', 'test',
    'sivi', 'siv', 'toz', 'bilesen', 'bilese', 'set',
    'din', 'astm', 'iso', 'tse', 'cen',
    'pox', 'sps', 'sup', 'imo'
  ]);

  const malzemeKeyTokens = malzemeTokens.filter(t => !stopWords.has(t));

  console.log("Malzeme tokens:", malzemeTokens);
  console.log("Key tokens (stop word'süz):", malzemeKeyTokens);

  // Hiç anahtar token yoksa eşleştirme yapma
  if (malzemeKeyTokens.length === 0) {
    console.log("Anahtar token yok, eşleşme yapılmıyor");
    return { eslesme: 'none', sebep: 'anahtar-token-yok' };
  }

  // ─── 1. Exact match (uzantısız tam eşitlik) ───
  let m = pdfListesi.find(p => {
    const pdfNorm = normalizeMalzeme(p.name.replace(/\.pdf$/i, ''));
    return pdfNorm === norm;
  });
  if (m) return { eslesme: 'exact', id: m.id, name: m.name };

  // ─── 2. Token skorlama: SADECE tam eşitlik (===) ───
  let enIyi = null;
  let enIyiSkor = 0;

  for (const p of pdfListesi) {
    const pdfTokens = tokenize(p.name.replace(/\.pdf$/i, ''));
    let skor = 0;

    for (const kt of malzemeKeyTokens) {
      // SADECE tam eşitlik — includes kaldırıldı
      if (pdfTokens.some(pt => pt === kt)) {
        skor++;
      }
    }

    if (skor > enIyiSkor) {
      enIyiSkor = skor;
      enIyi = p;
    }
  }

  console.log("En iyi eşleşme:", enIyi?.name, "Skor:", enIyiSkor);

  // En az 1 ANAHTAR token tam eşleşmesi
  if (enIyi && enIyiSkor >= 1) {
    return {
      eslesme: enIyiSkor >= 2 ? 'token-strong' : 'token-weak',
      id: enIyi.id,
      name: enIyi.name,
      skor: enIyiSkor
    };
  }

  return { eslesme: 'none', sebep: 'eslesme-yok' };
}

// ─── Gemini AI çağrısı ───────────────────────────────────────────────────────

async function aiRaporUret(env, { yorum, malzeme, fotolar, santiye, alan }) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY tanımlı değil');

  const token = await getAccessToken(env);

  // 1) Föy klasörünü listele, fuzzy match ile bul
  let foyBulundu = false;
  let foyDosyaAdi = null;
  let foyBase64 = null;
  try {
    const foyListe = await drivePdfListele(token, DRIVE_FOY_KLASOR_ID);
    console.log("Toplam PDF sayısı:", foyListe.length);
    console.log("İlk 5 PDF adı:", foyListe.slice(0, 5).map(p => p.name));
    const eslesme = foyEslestir(malzeme, foyListe);
    console.log("Fuzzy match sonucu:", JSON.stringify(eslesme));
    console.log("Aranan malzeme:", malzeme);
    console.log("Normalize edilmiş malzeme:", malzeme.toLowerCase().replace(/[öÖ]/g,'o').replace(/[üÜ]/g,'u').replace(/[şŞ]/g,'s').replace(/[çÇ]/g,'c').replace(/[ğĞ]/g,'g').replace(/[ıİ]/g,'i'));
    if (eslesme.eslesme !== 'none') {
      foyBase64 = await driveDosyaIndir(token, eslesme.id);
      foyBulundu = true;
      foyDosyaAdi = eslesme.name;
    }
  } catch (e) {
    // Föy hatası raporu engellemez; sadece atla
    foyBulundu = false;
  }

  // 2) Bağlam metni
  const fotolarDizi = Array.isArray(fotolar) ? fotolar : [];
  const hasarSayisi = fotolarDizi.filter(f => f.type === 'hasar').length;
  const normalSayisi = fotolarDizi.filter(f => f.type !== 'hasar').length;

  const baglam = [
    `ŞANTİYE: ${santiye || '-'}`,
    `ALAN: ${alan || '-'}`,
    `MALZEME: ${malzeme || '-'}`,
    `FÖY DURUMU: ${foyBulundu ? `Ekte (${foyDosyaAdi})` : 'Bulunamadı'}`,
    `KULLANICI BEYANI: ${yorum || '-'}`,
    `HASAR FOTOĞRAFI: ${hasarSayisi} adet`,
    `NORMAL FOTOĞRAF: ${normalSayisi} adet`,
  ].join('\n');

  // 3) Gemini parts: bağlam + (varsa) föy PDF + fotoğraflar
  const parts = [{ text: baglam }];
  if (foyBase64) parts.push({ inline_data: { mime_type: 'application/pdf', data: foyBase64 } });
  for (const f of fotolarDizi) {
    if (f && f.data) parts.push({ inline_data: { mime_type: f.mimeType || 'image/jpeg', data: f.data } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEM_PROMPT }] },
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
    foyBulundu,
    foyDosyaAdi,
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
