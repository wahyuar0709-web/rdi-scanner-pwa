// Kontrak: nol alert() blocking di kode kerja.
// Alasan (U-1, 2026-10-20): dialog blocking menghentikan operator di tengah alur scan
// dan tidak bisa dibaca ulang; umpan balik memakai notice in-app (cetakNotice: banner
// fixed bottom, role=status/alert, auto-hilang, aman reduced-motion).
// confirm() TETAP BOLEH untuk aksi destruktif/irreversibel (logout, hapus, import,
// arsip) — bukan bagian kontrak ini.
const fs = require('fs');
const path = require('path');

const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');
const FILES = [
  'index.html',
  'scanner.html',
  'js/util.js',
  'js/cetak.js',
  'js/outbox.js',
  'js/format.js',
  'js/importexcel.js',
];

let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok === true) { pass++; console.log('PASS | ' + name + (ev ? ' | ' + ev : '')); }
  else if (ok === false) { fail++; console.log('FAIL | ' + name + ' | ' + ev); }
  else console.log(ok + ' | ' + name + ' | ' + ev);
}

const hits = [];
for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { hits.push(rel + ': FILE HILANG'); continue; }
  const src = fs.readFileSync(abs, 'utf8');
  src.split('\n').forEach((line, i) => {
    if (/(^|[^.\w])alert\(/.test(line)) hits.push(rel + ':' + (i + 1) + ' ' + line.trim().slice(0, 80));
  });
}

t('nol alert() blocking di 7 file kode kerja', hits.length === 0, hits.length === 0 ? 'ok' : 'sisa=' + hits.length + ' -> ' + hits.slice(0, 5).join(' | '));

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail) process.exitCode = 1;
