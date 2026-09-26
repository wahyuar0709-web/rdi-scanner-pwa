/* L3 baseline probe (READ-ONLY, tanpa kredensial) — versi benar.
 * PENTING (temuan 2026-09-27): flow Apps Script /exec =
 *   POST /exec → HTTP 302 → https://script.googleusercontent.com/macros/echo?user_content_key=…
 *   lalu browser fetch melakukan GET ke URL echo itu (spec fetch: 302/303 mengubah POST→GET).
 *   Endpoint echo MENOLAK POST (405) — makanya probe harus GET setelah redirect.
 *   Ini juga alasan app di browser tetap jalan (fetch otomatis mengikuti aturan ini). */
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
        // sesuai spec fetch: setelah 302/303, metode menjadi GET dan body dibuang.
        // PENTING: res(promise) — tanpa itu promise luar tidak pernah resolve (probe diam).
        const next = (/^30[23]$/.test(String(resp.statusCode))) ? 'GET' : method;
        return res(call(next, loc, next === 'GET' ? null : body, (hops || 0) + 1));
      }
      let out = '';
      resp.on('data', c => (out += c));
      resp.on('end', () => res({ http: resp.statusCode, body: out.slice(0, 500), hops: hops || 0 }));
    });
    r.on('timeout', () => { r.destroy(); res({ error: 'timeout' }); });
    r.on('error', e => res({ error: e.message, code: e.code }));
    if (data) r.write(data);
    r.end();
  });
}
function j(r) { try { return JSON.parse(r.body); } catch (e) { return null; } }

(async () => {
  console.log('L3 BASELINE (read-only, tanpa kredensial) →', EXEC.slice(8, 40) + '…');
  let pass = 0, fail = 0, other = 0;
  const rec = (n, ok, d) => { if (ok === true) { pass++; console.log('PASS | ' + n + (d ? ' | ' + d : '')); } else if (ok === 'OTHER') { other++; console.log('NOT TESTED | ' + n + (d ? ' | ' + d : '')); } else { fail++; console.log('FAIL | ' + n + (d ? ' | ' + d : '')); } };

  const h = await call('POST', EXEC, { action: 'healthCheck' });
  if (h.error) { rec('L3Baseline: jaringan', 'OTHER', h.error); process.exit(2); }
  const hj = j(h);
  rec('L3-1: endpoint healthCheck ada (verifikasi versi deploy)', !!(hj && hj.status === 'ok' && hj.version), hj ? JSON.stringify(hj).slice(0, 160) : 'HTTP ' + h.http + ' body=' + String(h.body).slice(0, 100));

  const g = await call('POST', EXEC, { action: 'getData' });
  const gj = j(g);
  rec('L3-2: gate auth aktif (getData tanpa kredensial ditolak)', !!(gj && gj.needLogin === true), gj ? JSON.stringify(gj).slice(0, 160) : 'HTTP ' + g.http + ' body=' + String(g.body).replace(/\s+/g, ' ').slice(0, 120));

  const u = await call('POST', EXEC, { action: '___tidak_ada___' });
  const uj = j(u);
  rec('L3-3: action tak dikenal ditolak (tidak ada endpoint liar)', !!(uj && uj.status === 'error'), uj ? JSON.stringify(uj).slice(0, 120) : 'HTTP ' + u.http);

  console.log('---');
  console.log('L3 baseline: PASS=' + pass + ' FAIL=' + fail + ' NOT TESTED=' + other);
  if (pass > 0 && fail > 0) {
    console.log('CATATAN: healthCheck belum ada = perubahan Code.gs BELUM di-deploy (diharapkan sebelum deploy).');
  }
  process.exit(fail ? 1 : 0);
})();
