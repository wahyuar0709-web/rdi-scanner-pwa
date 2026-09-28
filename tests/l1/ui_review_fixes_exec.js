/* L1 suite: A1 (error UI), A2 (Alert Stok 0), A4 (label Kode), C1 (switchTab).
 *
 * Review 2026-09. A3 (ikon search) dan A5 (chip melebar di 320px) TIDAK masuk
 * sini karena probe membuktikan keduanya salah baca: jarak ikon ke teks 17px
 * (tanpa tumpang tindih), dan .chip-row memakai overflow-x:auto sehingga chip
 * di dalamnya boleh melewati viewport tanpa menggulirkan dokumen.
 *
 * Yang diuji:
 *   A1  exception runtime JS tidak boleh tampil ke operator; pesan server tetap utuh
 *   A2  kartu "Alert Stok" dengan nilai 0 tidak boleh memakai warna alarm
 *   A4  label "Kode : " tidak boleh pakai spasi sebelum titik dua
 *   C1  switchTab() dengan nama tak dikenal tidak boleh mengosongkan halaman
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const IDX = path.join(ROOT, 'index.html');
const UTIL = path.join(ROOT, 'js', 'util.js');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
};

const idx = fs.readFileSync(IDX, 'utf8');
const util = fs.readFileSync(UTIL, 'utf8');

/* ---------- A1: friendlyErr() ---------- */
ok('util.js mendefinisikan friendlyErr tepat sekali', (util.match(/function friendlyErr\(/g) || []).length === 1, (util.match(/function friendlyErr\(/g) || []).length);
ok('util.js punya _ERR_TEKNIKAL tepat sekali', (util.match(/var _ERR_TEKNIKAL=/g) || []).length === 1);
ok('friendlyErr dideklarasikan sebelum xe()', util.indexOf('function friendlyErr(') < util.indexOf('function xe('));

/* friendlyErr diuji dengan benar-benar menjalankannya, bukan mencocokkan string. */
const ctx = { console: { log() {}, warn() {}, error() {} } };
vm.createContext(ctx);
vm.runInContext(util, ctx, { filename: 'util.js' });
const friendlyErr = ctx.friendlyErr;

console.log('--- A1a: exception teknis HARUS disembunyikan ---');
const teknis = [
  new TypeError("Cannot read properties of undefined (reading 'map')"),
  new TypeError('x.map is not a function'),
  new ReferenceError('foo is not defined'),
  'SyntaxError: Unexpected token }',
  'RangeError: Maximum call stack size exceeded',
  'Permission denied',
  'Load failed',
  'NetworkError when attempting to fetch resource.',
];
for (const t of teknis) {
  const msg = typeof t === 'string' ? t : t.message;
  const out = friendlyErr(t, 'FALLBACK-KHUSUS');
  ok('teknis disembunyikan: ' + JSON.stringify(msg).slice(0, 52), out === 'FALLBACK-KHUSUS', out);
  ok('  ...tidak membocorkan teks asli', !/Cannot read|is not a function|is not defined|Unexpected token|stack size|Permission denied|Load failed|NetworkError/.test(out), out);
}

console.log('--- A1b: pesan server HARUS diteruskan utuh ---');
const server = [
  'Stok tidak cukup untuk item ini',
  'Password salah',
  'Item sudah dipakai di transaksi lain',
  'Sheet tidak ditemukan',
  'Gagal menyimpan: nama item wajib diisi',
];
for (const s of server) {
  ok('pesan server utuh: ' + s, friendlyErr(new Error(s)) === s, friendlyErr(new Error(s)));
}

console.log('--- A1c: kasus kosong / tanpa argumen ---');
ok('tanpa argumen -> pesan umum', friendlyErr(null) === 'Terjadi kesalahan. Silakan coba lagi.', friendlyErr(null));
ok('Error tanpa message -> pesan umum', friendlyErr(new Error('')) === 'Terjadi kesalahan. Silakan coba lagi.');
ok('fallback dipakai saat pesan kosong', friendlyErr(null, 'FALLBACK-UMUM') === 'FALLBACK-UMUM', friendlyErr(null, 'FALLBACK-UMUM'));
ok('string biasa diteruskan', friendlyErr('gagalTotal') === 'gagalTotal', friendlyErr('gagalTotal'));

console.log('--- A1d: tidak ada lagi call site yang bocor mentah ---');
ok('index.html tidak punya xe(err.message) lagi', idx.indexOf('xe(err.message)') < 0);
ok('index.html tidak punya xe(e.message) lagi', idx.indexOf('xe(e.message)') < 0);
const friendlyCalls = (idx.match(/friendlyErr\(/g) || []).length;
ok('friendlyErr dipakai di banyak call site (>20)', friendlyCalls > 20, friendlyCalls);

console.log('--- A2: Alert Stok ---');
ok('CSS status netral .is-clear ada', /\.dash-card\.navy\.is-clear \.dash-card-val\{color:var\(--text2\)\}/.test(idx));
ok('setDashAlert() ada', /function setDashAlert\(count\)/.test(idx));
ok('setDashAlert men-toggle is-clear saat 0', /classList\.toggle\('is-clear',parseInt\(count\|\|0,10\)===0\)/.test(idx));
ok('tidak ada lagi penulisan langsung ke dash-alert', idx.indexOf("document.getElementById('dash-alert').textContent=") < 0);
const setCalls = (idx.match(/setDashAlert\(/g) || []).length;
ok('semua titik isi Alert Stok lewat setDashAlert', setCalls >= 4, setCalls);

console.log('--- A4: label Kode ---');
ok('tidak ada "Kode : " lagi', idx.indexOf('Kode : ') < 0);
ok('ada "Kode: " yang benar', idx.indexOf('Kode: ') >= 0);

console.log('--- C1: switchTab menolak nama tak dikenal ---');
ok('switchTab punya guard nama tab', /function switchTab\(name,skipAutoScan\)\{if\(_tabHashNames\.indexOf\(name\)<0\)\{[^}]*console\.warn/.test(idx));
ok('guard muncul sebelum penghapusan .active', (function () {
  const g = idx.indexOf('_tabHashNames.indexOf(name)<0');
  const c = idx.indexOf("querySelectorAll('.page-section').forEach", idx.indexOf('function switchTab'));
  return g > 0 && c > g;
})());
ok('_tabHashNames berisi nama tab yang dipakai markup', (function () {
  const m = /var _tabHashNames=\[([^\]]+)\]/.exec(idx);
  if (!m) return false;
  const names = m[1].split(',').map((x) => x.replace(/'/g, ''));
  return ['scanner', 'dashboard', 'master', 'history', 'more', 'alert', 'cetak', 'rak', 'aset'].every((n) => names.indexOf(n) >= 0);
})());

console.log('PASS | ui_review_fixes_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
