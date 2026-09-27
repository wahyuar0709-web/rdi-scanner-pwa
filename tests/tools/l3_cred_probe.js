/* L3 credentialed probe — READ-ONLY by design.
 *
 * DESAIN KEAMANAN: rahasia TIDAK pernah ditulis ke file/repo. Script ini membaca dari
 * environment variable, jadi Anda bisa menjalankannya sendiri tanpa pernah menempelkan
 * sandi ke chat/repo:
 *   $env:RDI_EDITOR_KEY = '<kunci editor>'      # PowerShell
 *   $env:RDI_VIEWER_USER = '<username uji>'     # opsional (butuh juga RDI_VIEWER_PASS)
 *   $env:RDI_VIEWER_PASS = '<password uji>'
 *   node tests/tools/l3_cred_probe.js
 *
 * Yang DIJALANKAN script ini (semua read-only, tidak menulis ke spreadsheet):
 *   1) header X-Editor-Key (huruf besar)  → editor key dihormati via header
 *   2) header x-editor-key (huruf kecil)  → bukti fix BE-07 (GAS hanya memberi key lowercase)
 *   3) editorKey di body saja             → jalur body tetap jalan
 *   4) 1x kunci SALAH                     → bukti ditolak (hanya 1 percobaan; JANGAN diulang
 *                                           30x karena itu akan mengunci editor 10 menit)
 *   5) login viewer uji + read via token  → hanya bila RDI_VIEWER_USER/PASS diisi
 *   6) apakah respons memuat `nama`        → bukti akun editor per-orang aktif, atau masih
 *                                           memakai kunci tunggal bersama (fallback)
 *
 * TIDAK ada test mutasi (tidak ada transaksi/penghitungan ulang yang ditulis). Itu perlu
 * jendela uji tersendiri + item uji, karena akan menyentuh data produksi.
 */
const https = require('https');
const EXEC = process.env.RDI_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbyuH7joUKm9aAxDkzrofrKjri0q4pkM9BqFALBgi8cOI7LhEGiu3d1da1WUl1OHZLwQbw/exec';

const KEY = process.env.RDI_EDITOR_KEY || '';
const VUSER = process.env.RDI_VIEWER_USER || '';
const VPASS = process.env.RDI_VIEWER_PASS || '';

/* POST /exec → 302 → echo (GET, sesuai spec fetch). Header ikut diteruskan. */
function call(body, extraHeaders, hops, target) {
  return new Promise(res => {
    const url = target || EXEC;
    const isFirst = hops === undefined;
    const data = isFirst ? JSON.stringify(body) : null;
    const headers = Object.assign({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36',
      'Accept': '*/*',
    }, extraHeaders || {});
    if (isFirst) { headers['Content-Type'] = 'text/plain;charset=utf-8'; headers['Content-Length'] = Buffer.byteLength(data); }
    const r = https.request(url, { method: isFirst ? 'POST' : 'GET', headers, timeout: 25000 }, resp => {
      const loc = resp.headers.location;
      if (resp.statusCode >= 300 && resp.statusCode < 400 && loc && (hops || 0) < 4) {
        resp.resume();
        return res(call(body, extraHeaders, (hops || 0) + 1, loc));
      }
      let out = '';
      resp.on('data', c => (out += c));
      resp.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(out); } catch (e) { parsed = null; }
        res({ http: resp.statusCode, raw: out.slice(0, 200), j: parsed });
      });
    });
    r.on('timeout', () => { r.destroy(); res({ error: 'timeout' }); });
    r.on('error', e => res({ error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

let pass = 0, fail = 0, skip = 0;
function rec(id, ok, detail) {
  if (ok === 'SKIP') { skip++; console.log('SKIP | ' + id + (detail ? ' | ' + detail : '')); return; }
  if (ok) { pass++; console.log('PASS | ' + id + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + id + (detail ? ' | ' + detail : '')); }
}
const short = (j) => {
  if (!j) return '(bukan JSON)';
  if (j.status === 'error') return (j.message || '').slice(0, 90);
  if (j.status === 'ok') {
    const keys = Object.keys(j);
    const info = [];
    if (j.nama) info.push('nama=' + j.nama);
    if (j.role) info.push('role=' + j.role);
    ['items', 'rows', 'transaksi', 'stok', 'rak', 'aset', 'master'].forEach(k => {
      if (Array.isArray(j[k])) info.push(k + '[]=' + j[k].length);
      else if (j[k] && typeof j[k] === 'object') info.push(k + '{}=' + Object.keys(j[k]).length);
    });
    return 'keys=' + keys.slice(0, 8).join(',') + (info.length ? ' | ' + info.join(' ') : '');
  }
  return JSON.stringify(j).slice(0, 110);
};

(async () => {
  console.log('L3 CREDENTIALED (read-only) | target=' + EXEC.slice(8, 40) + '…');
  if (!KEY) {
    console.log('\nRDI_EDITOR_KEY belum di-set → tidak ada yang bisa diverifikasi. Set env var lalu ulangi.');
    process.exit(2);
  }
  console.log('Rahasia: dibaca dari env var, tidak dicetak, tidak disimpan.\n');

  // 1) header huruf besar
  let r = await call({ action: 'getData' }, { 'X-Editor-Key': KEY });
  rec('L3C-1: X-Editor-Key (huruf besar) → data terbaca', !!(r.j && r.j.status === 'ok'), short(r.j));

  // 2) header huruf kecil — bukti fix BE-07
  const r2 = await call({ action: 'getData' }, { 'x-editor-key': KEY });
  rec('L3C-2: x-editor-key (huruf kecil) → fix BE-07 hidup di produksi', !!(r2.j && r2.j.status === 'ok'), short(r2.j));

  // 3) body saja
  const r3 = await call({ action: 'getData', editorKey: KEY });
  rec('L3C-3: editorKey di body (tanpa header) → jalur body jalan', !!(r3.j && r3.j.status === 'ok'), short(r3.j));

  // 4) satu kunci salah (aman: 1 dari 10 per-key / 30 global)
  const r4 = await call({ action: 'getData' }, { 'X-Editor-Key': 'salah-untuk-uji' });
  rec('L3C-4: kunci salah ditolak (1 percobaan)', !!(r4.j && r4.j.needLogin === true), short(r4.j));

  // 5) info: akun per-orang vs kunci tunggal
  const nama = r.j && (r.j.nama || (r.j.user && r.j.user.nama) || '');
  if (nama) rec('L3C-5a: respons memuat `nama` → akun editor per-orang AKTIF (ada akun bertanggung jawab)', true, 'nama=' + nama);
  else rec('L3C-5a: respons TIDAK memuat `nama` → masih memakai kunci TUNGGAL bersama (fallback); field admin di transaksi tidak terikat orang', true, short(r.j));

  // 6) viewer
  if (VUSER && VPASS) {
    const lv = await call({ action: 'viewerLogin', username: VUSER, password: VPASS });
    const tok = lv.j && (lv.j.token || lv.j.viewerToken);
    rec('L3C-6a: login viewer uji berhasil', !!tok, tok ? 'token diterima (panjang ' + String(tok).length + ')' : short(lv.j));
    if (tok) {
      const rd = await call({ action: 'getData', viewerToken: tok });
      rec('L3C-6b: read dengan token viewer (tanpa editor key)', !!(rd.j && rd.j.status === 'ok'), short(rd.j));
      const role = rd.j && (rd.j.role || (rd.j.user && rd.j.user.role));
      if (role) rec('L3C-6c: role viewer (bukan editor)', String(role).toLowerCase() !== 'editor', 'role=' + role);
      else rec('L3C-6c: role tidak diekspos di respons read', 'SKIP', 'cek di UI/respons lain');
    }
  } else {
    rec('L3C-6: jalur viewer (login → token → read)', 'SKIP', 'butuh RDI_VIEWER_USER + RDI_VIEWER_PASS (akun uji khusus, jangan akun asli)');
  }

  console.log('---\nL3 credentialed: PASS=' + pass + ' FAIL=' + fail + ' SKIP=' + skip);
  console.log('CATATAN: mutasi (idempotensi, recalc, rate limit pada tulis) TIDAK diuji — butuh jendela uji + item uji.');
  process.exit(fail ? 1 : 0);
})();
