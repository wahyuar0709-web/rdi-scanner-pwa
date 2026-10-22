// Kontrak sintaks: setiap <script> inline di shell wajib lolos node --check.
// Alasan (2026-10-22): migrasi menu Lainnya (halaman section) sempat menyisakan
// 2 baris yatim dari fungsi closeMoreDrawer yang berbentuk multi-baris fisik.
// Kesalahan itu tidak terdeteksi L1 statis manapun dan baru ketahuan saat L2
// browser boot gagal total (SyntaxError). Gate ini mem-parse SEMUA blok script
// inline index.html & scanner.html sebelum lanjut — kegagalan boot by-sintaks
// tidak boleh harus menunggu L2 baru ketahuan.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');
const FILES = ['index.html', 'scanner.html'];

let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok === true) { pass++; console.log('PASS | ' + name + (ev ? ' | ' + ev : '')); }
  else if (ok === false) { fail++; console.log('FAIL | ' + name + ' | ' + ev); }
  else console.log(ok + ' | ' + name + ' | ' + ev);
}

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { t('sintaks ' + rel, false, 'FILE HILANG'); continue; }
  const src = fs.readFileSync(abs, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, idx = 0, bad = 0, checked = 0;
  while ((m = re.exec(src)) !== null) {
    idx++;
    const attrs = m[1] || '';
    if (/src=/i.test(attrs)) continue; // external: bukan bagian shell inline
    const body = m[2];
    if (!body.trim()) continue;
    checked++;
    const tmp = path.join(os.tmpdir(), 'parse_gate_' + path.basename(rel) + '_' + idx + '.js');
    fs.writeFileSync(tmp, body);
    try {
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    } catch (e) {
      bad++;
      const firstLine = String(e.stderr || e.message).split('\n').slice(0, 4).join(' / ');
      if (bad <= 3) console.error('  blok #' + idx + ' (mulai L' + src.slice(0, m.index).split('\n').length + '): ' + firstLine);
    }
  }
  t('sintaks semua <script> inline ' + rel, bad === 0, bad === 0 ? 'blok dicek=' + checked : 'rusak=' + bad + '/' + checked);
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail) process.exitCode = 1;
