/*
 * FASE 1 POC — Foto SJ via Gemini (RDI Kartu Stok backend)
 * Cara pakai:
 *   1. Buka project Apps Script backend produksi (yang memuat Code.gs, nama API "RDI Kartu Stok").
 *   2. Buat file baru di editor, salin seluruh isi file ini ke sana (nama file bebas, mis. "Fase1_AI.js").
 *   3. Deploy → Manage deployments → ikon pensil (Edit) pada deployment AKfycbyuH7… →
 *      Version: "New version" → Deploy. URL /exec TIDAK berubah.
 *   4. Simpan API key (sekali, dari editor run logger):
 *      simpanKeyAI({ apiKey: '<GEMINI_API_KEY>' })
 *   5. Verifikasi: healthCheck (GET /exec?api=healthCheck) harus tetap balas ok —
 *      lalu uji Foto SJ dari HP.
 *
 * Kontrol perubahan: file ini HANYA menambah 2 fungsi proxy AI.
 * Logika transaksi/stok tidak disentuh. Versi repo: commit c06d930 / 489d553 (v15.38 / API_BUILD 2026-10-30.1).
 */

function simpanKeyAI(body) {
  try {
    var key = body && body.apiKey ? String(body.apiKey).trim() : '';
    if (!key) return { status: 'error', message: 'API key kosong.' };
    PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
    return { status: 'ok', message: 'Gemini API key tersimpan.' };
  } catch (err) {
    return { status: 'error', message: 'simpanKeyAI: ' + (err && err.message ? err.message : err) };
  }
}

function aiBacaSJ(body) {
  try {
    var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
    if (!key) {
      return { status: 'error', message: 'AI belum dikonfigurasi. Simpan Gemini API key di menu Admin terlebih dahulu.' };
    }
    var imageBase64 = body && body.imageBase64 ? String(body.imageBase64) : '';
    if (!imageBase64) {
      return { status: 'error', message: 'Foto Surat Jalan kosong.' };
    }
    var prompt = 'Baca dokumen Surat Jalan ini. Ekstrak: no surat jalan, tanggal dokumen, dan setiap baris item (kode/nomor item, nama material, spesifikasi, jumlah, satuan). Salin persis seperti tertulis. Kembalikan JSON sesuai skema.';
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    var payload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            no_surat_jalan: { type: 'STRING' },
            tanggal_dokumen: { type: 'STRING' },
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  kode: { type: 'STRING' },
                  nama: { type: 'STRING' },
                  spec: { type: 'STRING' },
                  qty: { type: 'STRING' },
                  satuan: { type: 'STRING' }
                },
                required: ['kode', 'nama', 'spec', 'qty', 'satuan']
              }
            }
          },
          required: ['no_surat_jalan', 'tanggal_dokumen', 'items']
        }
      }
    };
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      muteHttpExceptions: true,
      payload: JSON.stringify(payload)
    });
    var code = res.getResponseCode();
    if (code !== 200) {
      return { status: 'error', message: 'Gemini HTTP ' + code + ': ' + res.getContentText().slice(0, 300) };
    }
    var parsed = JSON.parse(res.getContentText());
    var parts = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts ? parsed.candidates[0].content.parts : [];
    var text = parts.map(function (p) { return p.text || ''; }).join('');
    var out;
    try { out = JSON.parse(text); } catch (e) {
      return { status: 'error', message: 'AI tidak mengembalikan JSON yang valid: ' + e.message + ' (awal: ' + text.slice(0, 120) + ')' };
    }
    return { status: 'ok', data: out };
  } catch (err) {
    return { status: 'error', message: 'aiBacaSJ: ' + (err && err.message ? err.message : err) };
  }
}

/*
 * Sisipkan 2 baris ini di dalam doPost(e) Code.gs, setelah dispatch importExcel:
 *
 *   // FASE 1 POC: proxy Gemini untuk baca Surat Jalan
 *   if (action === 'aiBacaSJ')      return corsOutput(aiBacaSJ(body));
 *   if (action === 'simpanKeyAI')   return corsOutput(simpanKeyAI(body));
 *
 * (cari baris: if (action === 'importExcel')   return corsOutput(importExcel(body)); )
 */
