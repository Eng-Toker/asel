// cloudflare-worker.js — drive-upload Worker
// Routes:
//   POST /         → mevcut foto upload (Drive)
//   POST /rapor    → AI teknik rapor metni (Gemini 2.5 Flash)
//   POST /raporPdf → PDF'i Drive'a yükle (Şantiye Raporları/[Şantiye]/...)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/rapor' && request.method === 'POST') {
      return handleRapor(request, env);
    }
    if (url.pathname === '/raporPdf' && request.method === 'POST') {
      return handleRaporPdf(request, env);
    }

    if (request.method === 'POST') {
      return handleFotoUpload(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

// ─────────────────────────────────────────────────────
// CORS helper
// ─────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ─────────────────────────────────────────────────────
// OAuth token (Drive API)
// ─────────────────────────────────────────────────────
async function getAccessToken(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error('OAuth hatası: ' + JSON.stringify(d));
  return d.access_token;
}

// ─────────────────────────────────────────────────────
// Klasör bul veya oluştur (Drive)
// ─────────────────────────────────────────────────────
async function klasorBulVeyaOlustur(token, parentId, klasorAdi) {
  const safeAd = klasorAdi.replace(/'/g, "\\'");
  const q = `name='${safeAd}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const sUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
  const sRes = await fetch(sUrl, { headers: { Authorization: `Bearer ${token}` } });
  const sData = await sRes.json();
  if (sData.files && sData.files.length) return sData.files[0].id;

  const cRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: klasorAdi,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  const cData = await cRes.json();
  if (!cRes.ok) throw new Error('Klasör oluşturulamadı: ' + JSON.stringify(cData));
  return cData.id;
}

// ─────────────────────────────────────────────────────
// HANDLER: foto upload (mevcut)
// ─────────────────────────────────────────────────────
async function handleFotoUpload(request, env) {
  try {
    const body = await request.json();
    const { imageData, fileName, santiye, alan, bolge } = body;
    if (!imageData || !fileName) {
      return new Response(JSON.stringify({ error: 'imageData ve fileName zorunludur' }),
        { status: 400, headers: corsHeaders });
    }

    const token = await getAccessToken(env);
    const kokId = env.DRIVE_KLASOR_ID;
    const bolgeKlasorId = bolge ? await klasorBulVeyaOlustur(token, kokId, bolge) : kokId;
    const santiyeKlasorId = santiye ? await klasorBulVeyaOlustur(token, bolgeKlasorId, santiye) : bolgeKlasorId;
    const hedefId = alan ? await klasorBulVeyaOlustur(token, santiyeKlasorId, alan) : santiyeKlasorId;

    const base64 = imageData.split(',')[1] || imageData;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const boundary = '-------314159265358979323846';
    const meta = JSON.stringify({ name: fileName, parents: [hedefId], mimeType: 'image/jpeg' });
    const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`;
    const post = `\r\n--${boundary}--`;
    const preBytes = new TextEncoder().encode(pre);
    const postBytes = new TextEncoder().encode(post);

    const reqBody = new Uint8Array(preBytes.length + bytes.length + postBytes.length);
    reqBody.set(preBytes, 0);
    reqBody.set(bytes, preBytes.length);
    reqBody.set(postBytes, preBytes.length + bytes.length);

    const upRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: reqBody,
    });
    const upData = await upRes.json();
    if (!upRes.ok) throw new Error('Drive upload hatası: ' + JSON.stringify(upData));

    await fetch(`https://www.googleapis.com/drive/v3/files/${upData.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return new Response(JSON.stringify({
      fileId: upData.id,
      fileUrl: `https://drive.google.com/thumbnail?id=${upData.id}&sz=w1000`,
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: corsHeaders });
  }
}

// ─────────────────────────────────────────────────────
// HANDLER: /rapor — AI rapor metni üret
// ─────────────────────────────────────────────────────
async function handleRapor(request, env) {
  try {
    const body = await request.json();
    const { yorum, malzeme, fotolar, santiye, alan } = body;

    if (!yorum || yorum.trim().length < 20) {
      return new Response(JSON.stringify({ hata: 'Yorum en az 20 karakter olmalı.' }),
        { status: 400, headers: corsHeaders });
    }
    if (!malzeme) {
      return new Response(JSON.stringify({ hata: 'Malzeme adı boş.' }),
        { status: 400, headers: corsHeaders });
    }

    const token = await getAccessToken(env);

    const foyKlasorId = '1-xqiQMId4Xs6KrP6pqB6aZhmbBJXlve0';
    const foyData = await foyBulFuzzy(token, foyKlasorId, malzeme);

    const geminiResult = await callGemini(env, {
      yorum,
      malzeme,
      fotolar: (fotolar || []).slice(0, 5),
      foyData,
      santiye,
      alan,
    });

    return new Response(JSON.stringify({
      basarili: true,
      rapor: geminiResult.rapor,
      foyBulundu: !!foyData,
      foyDosyaAdi: foyData ? foyData.fileName : null,
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({
      hata: 'Rapor üretiminde hata: ' + (err.message || String(err)),
      detay: err.stack ? err.stack.slice(0, 500) : null,
    }), { status: 500, headers: corsHeaders });
  }
}

// ─────────────────────────────────────────────────────
// HANDLER: /raporPdf — PDF'i Drive'a yükle
// ─────────────────────────────────────────────────────
async function handleRaporPdf(request, env) {
  try {
    const body = await request.json();
    const { pdfBase64, santiye, alan, asama } = body;

    if (!pdfBase64) {
      return new Response(JSON.stringify({ hata: 'PDF verisi boş.' }),
        { status: 400, headers: corsHeaders });
    }

    const token = await getAccessToken(env);

    const raporKokId = await klasorBulVeyaOlustur(token, 'root', 'Şantiye Raporları');
    const santiyeKlasorId = await klasorBulVeyaOlustur(token, raporKokId, santiye || 'Bilinmeyen');

    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const tarihStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
    const safeAlan = (alan || 'Alan').replace(/[/\\:*?"<>|]/g, '_');
    const fileName = `${safeAlan}_Aşama-${asama || '?'}_${tarihStr}.pdf`;

    const result = await pdfYukle(token, santiyeKlasorId, fileName, pdfBase64);

    return new Response(JSON.stringify({
      basarili: true,
      fileUrl: result.fileUrl,
      fileId: result.fileId,
      fileName,
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({
      hata: 'PDF yükleme hatası: ' + (err.message || String(err)),
    }), { status: 500, headers: corsHeaders });
  }
}

// ─────────────────────────────────────────────────────
// FUZZY FÖY EŞLEŞME
// ─────────────────────────────────────────────────────
async function foyBulFuzzy(token, klasorId, malzemeAdi) {
  const listUrl = `https://www.googleapis.com/drive/v3/files?q='${klasorId}'+in+parents+and+mimeType='application/pdf'+and+trashed=false&fields=files(id,name)&pageSize=100`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) return null;
  const listData = await listRes.json();
  const files = listData.files || [];
  if (!files.length) return null;

  const norm = (s) => String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9çğıöşü]+/gi, '')
    .trim();

  const target = norm(malzemeAdi);
  if (!target) return null;

  let match = files.find((f) => norm(f.name) === target);
  if (!match) {
    match = files.find((f) => {
      const n = norm(f.name);
      return n.includes(target) || target.includes(n);
    });
  }
  if (!match) return null;

  const dlUrl = `https://www.googleapis.com/drive/v3/files/${match.id}?alt=media`;
  const dlRes = await fetch(dlUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!dlRes.ok) return null;

  const buf = await dlRes.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);

  return { fileName: match.name, pdfBase64: base64 };
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ─────────────────────────────────────────────────────
// GEMINI ÇAĞRISI
// ─────────────────────────────────────────────────────
async function callGemini(env, ctx) {
  const { yorum, malzeme, fotolar, foyData, santiye, alan } = ctx;
  const parts = [];

  parts.push({
    text: `Sen ASEL Engineering şirketinin deneyimli bir izolasyon uygulama uzmanısın ve profesyonel teknik raporlar/tutanaklar hazırlarsın. Saha fotoğraflarını analiz eder, kullanılan malzemenin teknik föyüyle karşılaştırır ve hasar/uygunsuzluk tespitlerini ölçülü, sorumluluk dilinde yazarsın.

GÖREV: Aşağıdaki bilgileri inceleyerek 6 bölümlük bir teknik rapor hazırla. ÇIKTIYI MUTLAKA AŞAĞIDAKİ JSON ŞEMASINA UYAN GEÇERLİ JSON OLARAK VER:

{
  "materialDescription": "Kullanılan malzemenin teknik föy bilgilerine göre kısa açıklaması ve kullanım amacı. 2-4 cümle.",
  "applicationSummary": "Uygulama alanı ve şartları, kullanıcı beyanı ve fotoğraf kanıtları birlikte değerlendirilerek uygulama sürecinin özeti. 3-5 cümle.",
  "fieldObservation": "Saha fotoğraflarında görülen mevcut durum, yüzey koşulları, uygulama izleri, sonradan müdahale belirtileri. NORMAL ve HASAR fotoğraflarını karşılaştır. 4-6 cümle.",
  "damageAnalysis": "Föy şartları, kullanıcı beyanı ve görsel kanıtlar karşılaştırılarak hasar veya uygunsuzluk değerlendirmesi. Hasarın nedeni ne olabilir, sorumluluk kim de olabilir. 4-7 cümle.",
  "technicalReferences": "Föyden çıkarılabilen ilgili uygulama şartları, sınırlamalar, sistem bileşenleri. 3-5 cümle. Föy yoksa: 'Bu malzeme için Drive föy kütüphanesinde teknik föy bulunamamıştır; değerlendirme kullanıcı beyanı ve görsel kanıtlar üzerinden yapılmıştır.'",
  "conclusionText": "Teknik kanaat ve sorumluluk değerlendirmesi. Açık, ölçülü, rapor diline uygun. 3-5 cümle. Spekülasyondan kaçın, fotoğrafta görülmeyen iddiaları yazma."
}

KURALLAR:
- Yalnızca JSON döndür, başka hiçbir şey yazma. Markdown bloğu, açıklama, hiçbir şey yok.
- Türkçe yaz, resmi-teknik dil kullan.
- Föy varsa ona dayan, yoksa açıkça belirt.
- HASAR fotoğraflarına özellikle dikkat et, ne tür hasar olduğunu (mekanik, kesik, sıyrık, su sızıntısı, vs.) tanımla.
- Suçlama yapma, "olası", "görülmektedir", "tespit edilmiştir" gibi ölçülü ifadeler kullan.`,
  });

  parts.push({
    text: `\n\n--- BAĞLAM ---
Şantiye: ${santiye || '—'}
Uygulama Alanı: ${alan || '—'}
Malzeme: ${malzeme}
Föy bulundu: ${foyData ? 'EVET (aşağıda PDF olarak)' : 'HAYIR'}
Toplam fotoğraf: ${fotolar.length} (${fotolar.filter((f) => f.type === 'hasar').length} hasar, ${fotolar.filter((f) => f.type !== 'hasar').length} normal)`,
  });

  if (foyData) {
    parts.push({
      inline_data: {
        mime_type: 'application/pdf',
        data: foyData.pdfBase64,
      },
    });
    parts.push({ text: `\n[YUKARIDA: ${malzeme} malzemesinin Drive'daki teknik föyü]` });
  }

  fotolar.forEach((f, i) => {
    parts.push({
      inline_data: {
        mime_type: f.mimeType || 'image/jpeg',
        data: f.data,
      },
    });
    parts.push({
      text: `[Fotoğraf ${i + 1} — ${f.type === 'hasar' ? '⚠ HASAR FOTOĞRAFI' : 'Normal saha fotoğrafı'}]`,
    });
  });

  parts.push({
    text: `\n\n--- KULLANICI YORUMU / OLAY BEYANI ---\n${yorum}\n\n--- ÇIKTI: SADECE JSON ---`,
  });

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API hatası: ${res.status} — ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error('Gemini boş cevap döndü');

  let parsed;
  try {
    parsed = JSON.parse(txt);
  } catch (e) {
    throw new Error('Gemini JSON parse hatası: ' + txt.slice(0, 200));
  }

  const required = [
    'materialDescription',
    'applicationSummary',
    'fieldObservation',
    'damageAnalysis',
    'technicalReferences',
    'conclusionText',
  ];
  for (const k of required) {
    if (typeof parsed[k] !== 'string' || !parsed[k].trim()) {
      parsed[k] = '(Bu bölüm için yeterli veri üretilemedi)';
    }
  }

  return { rapor: parsed };
}

// ─────────────────────────────────────────────────────
// PDF YÜKLEME
// ─────────────────────────────────────────────────────
async function pdfYukle(token, parentId, fileName, pdfBase64) {
  const boundary = '-------314159265358979323846';
  const meta = JSON.stringify({
    name: fileName,
    parents: [parentId],
    mimeType: 'application/pdf',
  });

  const binary = atob(pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const preBytes = new TextEncoder().encode(pre);
  const postBytes = new TextEncoder().encode(post);

  const body = new Uint8Array(preBytes.length + bytes.length + postBytes.length);
  body.set(preBytes, 0);
  body.set(bytes, preBytes.length);
  body.set(postBytes, preBytes.length + bytes.length);

  const upUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const upRes = await fetch(upUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!upRes.ok) {
    const errTxt = await upRes.text();
    throw new Error(`Drive upload hatası: ${upRes.status} — ${errTxt.slice(0, 300)}`);
  }
  const upData = await upRes.json();

  await fetch(`https://www.googleapis.com/drive/v3/files/${upData.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return {
    fileId: upData.id,
    fileUrl: `https://drive.google.com/file/d/${upData.id}/view`,
  };
}
