/* L3 probe aksi Fase 1 (READ-ONLY/tanpa kredensial; tidak memanggil Gemini —
 * berhenti di gate auth). Memeriksa: aiBacaSJ & simpanKeyAI dikenali dispatch
 * (respons needLogin gate, BUKAN error akses edit/unknown), layaknya aksi standar. */
const https = require('https');
const EXEC = 'https://script.google.com/macros/s/AKfycbyuH7joUKm9aAxDkzrofrKjri0q4pkM9BqFALBgi8cOI7LhEGiu3d1da1WUl1OHZLwQbw/exec';

function call(method, target, body, hops) {
  return new Promise(res => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36', 'Accept': '*/*' };
    if (data) { headers['Content-Type'] = 'text/plain;charset=utf-8'; headers['Content-Length'] = Buffer.byteLength(data); }
    const r = https.request(target, { method, headers, timeout: 20000 }, resp => {
      const loc = resp.headers.location;
      if (resp.statusCode >= 300 && resp.statusCode < 400 && loc && (hops || 0) < 4) {
        resp.resume();
        const next = (/^30[23]$/.test(String(resp.statusCode))) ? 'GET' : method;
        return res(call(next, loc, next === 'GET' ? null : body, (hops || 0) + 1));
      }
      let out = '';
      resp.on('data', c => (out += c));
      resp.on('end', () => res({ http: resp.statusCode, body: out.slice(0, 400), hops: hops || 0 }));
    });
    r.on('timeout', () => { r.destroy(); res({ error: 'timeout' }); });
    r.on('error', e => res({ error: e.message, code: e.code }));
    if (data) r.write(data);
    r.end();
  });
}
function j(r) { try { return JSON.parse(r.body); } catch (e) { return null; } }

(async () => {
  let pass = 0, fail = 0;
  const rec = (n, ok, d) => { if (ok) { pass++; console.log('PASS | ' + n + (d ? ' | ' + d : '')); } else { fail++; console.log('FAIL | ' + n + (d ? ' | ' + d : '')); } };

  // 1) aksi Fase 1 TANPA kredensial: harus ditolak gate (needLogin), bukan "unknown"
  const a = j(await call('POST', EXEC, { action: 'aiBacaSJ', imageBase64: '' }));
  rec('aiBacaSJ tanpa kredensial dihentikan gate auth (needLogin, bukan unknown)',
    !!(a && a.needLogin === true), JSON.stringify(a));
  const b = j(await call('POST', EXEC, { action: 'simpanKeyAI', apiKey: '' }));
  rec('simpanKeyAI tanpa kredensial dihentikan gate auth (needLogin, bukan unknown)',
    !!(b && b.needLogin === true), JSON.stringify(b));

  // 2) pembanding: aksi lama berperilaku sama (gate seragam)
  const c = j(await call('POST', EXEC, { action: 'postTransaksi' }));
  rec('aksi standar postTransaksi juga needLogin (gate tidak melompet aksi baru)',
    !!(c && c.needLogin === true), JSON.stringify(c));

  console.log('---- Fase 1 dispatch probe: ' + pass + ' PASS / ' + fail + ' FAIL ----');
  process.exit(fail ? 1 : 0);
})();
