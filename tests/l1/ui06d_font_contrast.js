/* L1 F-06d (2026-09-25): UI-07 label info esensial ≥12px + UI-08 kontras --text3 ≥4.5:1.
 * UI-07: 12 selector nama di bukti audit §5.1.4 (saldo/rak/badge/id) — SEMUA rule yang
 *        memuat font-size wajib ≥12px.
 * UI-08: kontras WCAG --text3 vs --bg/--surface2/--surface ≥4.5:1; #78716c lama hilang;
 *        tidak ada pemakaian #f59e0b sebagai warna TEKS (audit dikoreksi: hanya bg/border). */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// --- WCAG relative luminance / contrast ---
function srgb(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function lum(hex) {
  const r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// --- UI-07: 12 selector audit ---
const SELS = ['.ilc2-low', '.trx-progress-lbl', '.hdr-saldo-lbl', '.idd-hist-saldo-lbl',
  '.item-detail-stok-badge', '.hamburger-badge', '.ilc2-tgl-corner', '.item-detail-id',
  '.ftbadge', '.ilc2-rak', '.ilc3-rak', '.ilc2-btn-trx'];
for (const sel of SELS) {
  const key = sel + '{';
  let idx = 0, sizes = [], found = 0;
  while ((idx = src.indexOf(key, idx)) !== -1) {
    found++;
    const end = src.indexOf('}', idx);
    const body = src.slice(idx, end + 1);
    const m = body.match(/font-size:\s*([\d.]+)px/g) || [];
    m.forEach(x => { const n = parseFloat(x.match(/([\d.]+)px/)[1]); if (!isNaN(n)) sizes.push(n); });
    idx = end + 1;
  }
  t('UI-07: ' + sel + ' font-size ≥12px', found > 0 && sizes.length >= 1 && sizes.every(v => v >= 12),
    'rules=' + found + ' sizes=[' + sizes.join(',') + ']');
}

// --- UI-08: kontras var tema ---
function vars(name) {
  const re = new RegExp('--' + name + ':\\s*([^;}]+)[;}]', 'g');
  const out = []; let m;
  while ((m = re.exec(src)) !== null) out.push(m[1].trim());
  return [...new Set(out)];
}
const bgs = vars('bg'), t3s = vars('text3'), s2s = vars('surface2'), s1s = vars('surface');
t('UI-08: --text3 terdefinisi', t3s.length >= 1, JSON.stringify(t3s));
for (const t3 of t3s) {
  for (const [label, arr] of [['bg', bgs], ['surface2', s2s], ['surface', s1s]]) {
    for (const bg of arr) {
      const c = contrast(t3, bg);
      t('UI-08: kontras ' + t3 + ' vs --' + label + ' ' + bg + ' ≥4.5:1', c >= 4.5, c.toFixed(2) + ':1');
    }
  }
}
t('UI-08: nilai lama #78716c tidak dipakai lagi', src.indexOf('#78716c') === -1, 'masih ada');
t('UI-08: tidak ada #f59e0b sebagai warna teks (color:, bukan border-/background-color:)', !/(?<![-\w])color:\s*#f59e0b/i.test(src), 'ada color:#f59e0b');

console.log('---- ui06d_font_contrast: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
