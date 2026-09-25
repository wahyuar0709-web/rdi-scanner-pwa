/* BUG-01 (2026-09-25): daftar ekspor window.* tak sinkron dengan handler inline.
 * Setiap fungsi yang dipanggil dari atribut HTML inline (oninput/onblur/onclick
 * di index.html maupun string template render) HARUS tereksport ke window,
 * karena inline handler hanya melihat scope elemen → form → document → window.
 * Terkonfirmasi runtime CDP: ReferenceError acShowDebounced / updateSaldoPreview. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scanner = fs.readFileSync(path.join(ROOT, 'scanner.html'), 'utf8');
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const NEED = [
  'acShowDebounced',      // oninput scan-id-input L728 + hist-id-input L983
  'acShow',               // onmousedown tombol reload dropdown (template acShow)
  'acHide',               // onblur scan/hist input L731 + L986
  'collapseCameraOnType', // oninput scan/hist input L728 + L983
  'updateSaldoPreview',   // oninput qty-input L800
  'checkTransactionAnomaly', // oninput qty-input L800
  'markRakChipSelection', // oninput ketik rak manual L834
  'setRakFilter'          // onclick chip rak (template renderRakFilter)
];

for (const n of NEED) {
  t('BUG-01: window.' + n + ' diekspor (window.' + n + '=' + n + ')',
    new RegExp('window\\.' + n + '\\s*=\\s*' + n + '\\b').test(src),
    'export tidak ditemukan di index.html');
}

// sanity: tiap nama minimal dipanggil sekali selain deklarasinya (call site inline/template)
for (const n of NEED) {
  const calls = src.split(new RegExp(n + '\\s*\\(')).length - 1;
  const decls = src.split(new RegExp('function\\s+' + n + '\\s*\\(')).length - 1;
  t('BUG-01: ' + n + ' punya call site selain deklarasi', calls > decls,
    'calls=' + calls + ' decls=' + decls);
}

// scanner.html punya script lokal sendiri — closeScanner/toggleTorch wajib ada di sana
t('BUG-01: scanner.html mendefinisikan closeScanner lokal', /function closeScanner\s*\(/.test(scanner));
t('BUG-01: scanner.html mendefinisikan toggleTorch lokal', /function toggleTorch\s*\(/.test(scanner));

console.log('---- bug01_inline_exports: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
