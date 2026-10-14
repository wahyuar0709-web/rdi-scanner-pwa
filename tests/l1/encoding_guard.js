// ENC-01 encoding & line-ending guard
// Alasan ada: insiden §15.6 merusak repo DUA kali tanpatertangkap gate mana pun
// (1) Set-Content -Encoding UTF8 menghasilkan mojibake di ~135 baris Code.gs,
// (2) skrip normalisasi EOL menyisipkan CR setelah LF (\n\r\n) di 14 berkas.
// Keduanya lolos L1 yang berisi 1271 assert. Gate ini menutup lubang itu.
//
// Yang diperiksa, per berkas sumber repo:
//   1. U+FFFD (replacement character) -> tanda decoding rusak
//   2. CJK / Hangul / huruf fullwidth -> proyek ini berbahasa Indonesia; karakter
//      itu hampir selalu sampah nyasar. Contoh nyata yang ditemukan 2026-10-14:
//      r2_ui_quality_gate.js L204, ditemukan 2026-10-14.
//   3. EOL campur dalam satu berkas -> insiden §15.6 #2
//   4. BOM UTF-8 -> .gitattributes sudah menandai berkas vendor sebagai -text,
//      jadi BOM pada berkas sumber hanya tanda kesalahan
//
// Dikecualikan: Backup/** (snapshot historis), *.min.js (vendor biner), dan
// berkas hasil (tests/results/**).
const fs = require('fs');
const path = require('path');

const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');
let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok === true) { pass++; console.log('PASS | ' + name + (ev ? ' | ' + ev : '')); }
  else if (ok === false) { fail++; console.log('FAIL | ' + name + ' | ' + ev); }
  else console.log(ok + ' | ' + name + ' | ' + ev);
}

const SKIP_DIRS = new Set(['Backup', 'node_modules', 'results', '.git', '.github', '.opencode', 'tools']);
const SKIP_FILE = /\.min\.js$|\.png$|\.ico$|~$|\.bak$/i;

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else {
      if (SKIP_FILE.test(e.name)) continue;
      if (!/\.(html|js|gs|json|md|css|txt|yml|yaml)$/i.test(e.name)) continue;
      out.push(rel);
    }
  }
  return out;
}

const files = walk(ROOT, []);
console.log('ENCODING GUARD | memindai ' + files.length + ' berkas sumber');

// --- 1. U+FFFD ---
const fffd = [];
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (s.indexOf('\uFFFD') >= 0) fffd.push(f);
}
t('ENC-1a: tidak ada U+FFFD (tanda decode rusak)', fffd.length === 0, fffd.length ? fffd.join(', ') : '0 dari ' + files.length + ' berkas');

// --- 2. CJK / Hangul / fullwidth ---
const CJK = /[\u3000-\u9FFF\uFF00-\uFFEF\uAC00-\uD7AF]/;
const cjk = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/);
  const hits = [];
  lines.forEach((l, i) => { if (CJK.test(l)) hits.push('L' + (i + 1)); });
  if (hits.length) cjk.push(f + ' [' + hits.slice(0, 3).join(',') + ']');
}
t('ENC-1b: tidak ada CJK/Hangul/fullwidth di sumber', cjk.length === 0, cjk.length ? cjk.join(' ; ') : 'bersih di ' + files.length + ' berkas');

// --- 3. EOL campur ---
const mixed = [];
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const crlf = (s.match(/\r\n/g) || []).length;
  const lone = (s.match(/(?<!\r)\n/g) || []).length;
  if (crlf > 0 && lone > 0) mixed.push(f + ' (CRLF=' + crlf + ' LF=' + lone + ')');
}
t('ENC-1c: tidak ada EOL campur dalam satu berkas (insiden §15.6 #2)', mixed.length === 0, mixed.length ? mixed.join(' ; ') : 'homogen di ' + files.length + ' berkas');

// --- 4. BOM ---
const bom = [];
for (const f of files) {
  const b = fs.readFileSync(path.join(ROOT, f));
  if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) bom.push(f);
}
t('ENC-1d: tidak ada BOM UTF-8 di berkas sumber', bom.length === 0, bom.length ? bom.join(', ') : '0 BOM');

// --- 5. Anti-vacuum: guard harus benar-benar menyaring ---
// Kalau daftar berkasnya kosong, semua check di atas akan hijau tanpa memeriksa
// apa pun - persis gate bohong yang sudah dua kali terjadi sesi ini.
t('ENC-1e: ANTI-VACUUM - guard benar-benar memindai isi repo', files.length >= 20, 'memindai ' + files.length + ' berkas (minimal 20)');

console.log('=== ENCODING GUARD: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);