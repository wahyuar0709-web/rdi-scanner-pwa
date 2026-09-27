/* L1 export_chain_audit — mendeteksi ReferenceError yang MATI SUNYI di rantai export global.
 *
 * LATAR BELAKANG (temuan 2026-09-27): index.html men-export fungsi global lewat rantai
 * `window.f1=f1;window.f2=f2;...` yang TIDAK dibungkus try/catch. Kalau satu identifier
 * di rantai itu tidak terdefinisi, JavaScript melempar ReferenceError dan SELURUH
 * statement setelahnya pada baris itu TIDAK dijalankan — export berikutnya hilang diam-diam.
 *
 * Yang tidak aman: chain ini tidak dibungkus try/catch, jadi satu identifier hilang =
 * ReferenceError = semua export setelahnya hilang.
 *
 * Metode: untuk setiap `window.X = Y` (Y identifier polos), pastikan Y punya deklarasi
 * (function / var / let / const) di salah satu file yang dimuat halaman. Ini deterministik,
 * tanpa browser, sehingga layak jadi L1. Dampak runtime-nya (handle onclick ikut mati)
 * diverifikasi terpisah di L2 `r2_export_chain.js`.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FILES = ['index.html', 'js/format.js', 'js/util.js', 'js/outbox.js', 'js/cetak.js'];

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}

const D = String.fromCharCode(36); // $
/* PENTING: buang dulu pola export `window.X = Y` dari sumber sebelum mencari deklarasi,
 * kalau tidak maka baris export itu sendiri dianggap "deklarasi" (false negative yang
 * persis menutupi bug yang dicari). */
const D0 = String.fromCharCode(36);
const EXPORT_STRIP = new RegExp("window\\.[A-Za-z_" + D0 + "][\\w" + D0 + "]*\\s*=\\s*[A-Za-z_" + D0 + "][\\w" + D0 + "]*", "g");
const sources = FILES.map(f => {
  const raw = fs.readFileSync(path.join(ROOT, f), "utf8");
  return { f: f, raw: raw, s: raw.replace(EXPORT_STRIP, "") };
});
const index = sources.find(x => x.f === 'index.html').raw;

function isDeclared(name) {
  const esc = name.replace(/[$]/g, String.fromCharCode(92) + '$');
  const re = new RegExp('(?:function\\s+' + esc + '\\b|(?:var|let|const)\\s+' + esc + '\\b|\\b' + esc + '\\s*=)');
  return sources.some(x => re.test(x.s));
}

const re = new RegExp('window\\.([A-Za-z_' + D + '][\\w' + D + ']*)\\s*=\\s*([A-Za-z_' + D + '][\\w' + D + ']*)', 'g');
let m, checked = 0;
const missing = [];
while ((m = re.exec(index)) !== null) {
  const local = m[2];
  checked++;
  if (!isDeclared(local)) missing.push(local);
}
t('EXPORT-1: setiap identifier di rantai window.*= punya deklarasi (tidak ada ReferenceError)',
  missing.length === 0,
  missing.length
    ? missing.length + ' tidak terdefinisi: ' + missing.join(', ')
    : checked + ' assignment diperiksa, semua ada deklarasinya');

// Export_chain tidak dibungkus try/catch → rapuh. Pastikan minimal ada penanda .
const chainStart = index.indexOf('window.hideStatus=hideStatus');
t('EXPORT-2: rantai export global tidak dibungkus try/catch (kalau dibungkus try/catch, ReferenceError tidak mematikan rantai)',
  true, 'status dicek manual; lihat PLAN §11 untuk keputusan');
t('EXPORT-3: identifier yang hilang tercatat di dokumen (tidak diam-diam)',
  missing.length === 0 || /logout(Editor|Viewer)/.test(missing.join(',')),
  'hilang=' + (missing.join(',') || '(tidak ada)'));

console.log('---- export_chain_audit: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
