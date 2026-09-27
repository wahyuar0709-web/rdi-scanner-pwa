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
// PERBAIKAN 2026-09-27: versi lama mengumpulkan --text3/--bg dari SEMUA blok tema jadi satu
// daftar lalu menyilangkannya -> setelah palet gelap ditambahkan, ia membandingkan
// --text3 versi terang dengan --bg versi gelap (3.13:1) = FALSE POSITIVE. Sekarang token
// dipasangkan DALAM satu blok tema, dan KEDUA tema ikut diperiksa (lebih ketat, bukan lebih longgar).
function blockVars(selector) {
  const at = src.indexOf(selector);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let d = 0, j = open;
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) break; } }
  const body = src.slice(open + 1, j);
  const get = (name) => { const m = new RegExp('--' + name + ':\\s*([^;}]+)').exec(body); return m ? m[1].trim() : null; };
  return { bg: get('bg'), surface: get('surface'), surface2: get('surface2'), text3: get('text3'), text2: get('text2'), text: get('text') };
}
const THEMES = [
  ['terang (:root)', blockVars(':root')],
  ['gelap (body:not(.light))', blockVars('body:not(.light)')],
];
let themeOk = 0;
for (const [name, v] of THEMES) {
  if (!v || !v.text3) { t('UI-08: token tema ' + name + ' lengkap', false, JSON.stringify(v)); continue; }
  for (const key of ['bg', 'surface', 'surface2']) {
    const c = contrast(v.text3, v[key]);
    t('UI-08[' + name + ']: --text3 ' + v.text3 + ' vs --' + key + ' ' + v[key] + ' ≥4.5:1', c >= 4.5, c.toFixed(2) + ':1');
  }
  const cText = contrast(v.text, v.surface);
  t('UI-08[' + name + ']: --text ' + v.text + ' vs --surface ≥4.5:1', cText >= 4.5, cText.toFixed(2) + ':1');
  const cText2 = contrast(v.text2, v.surface);
  t('UI-08[' + name + ']: --text2 ' + v.text2 + ' vs --surface ≥4.5:1', cText2 >= 4.5, cText2.toFixed(2) + ':1');
  themeOk++;
}
t('UI-08: kedua tema punya token yang diperiksa', themeOk === 2, themeOk + '/2 tema');
t('UI-08: nilai lama #78716c tidak dipakai lagi', src.indexOf('#78716c') === -1, 'masih ada');
t('UI-08: tidak ada #f59e0b sebagai warna teks (color:, bukan border-/background-color:)', !/(?<![-\w])color:\s*#f59e0b/i.test(src), 'ada color:#f59e0b');

console.log('---- ui06d_font_contrast: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
