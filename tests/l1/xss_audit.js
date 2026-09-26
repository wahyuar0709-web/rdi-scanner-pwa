/* L1 gate sink XSS (2026-09-27) — sebelumnya file ini hanya DUMP daftar innerHTML dan
 * heuristik "SUSPECT" yang terlalu sempit (0 ketemu, jadi sinyal aman palsu) + mencetak
 * DEFAULT_GAS_URL lengkap ke artefak. Sekarang jadi suite sungguhan:
 *   1. setiap call site showStatus() yang menginterpolasi data WAJIB ter-escape
 *      (diverifikasi: 67 call site, 0 kebocoran — dikunci sebagai regression gate)
 *   2. setiap renderer HTML kritis WAJIB memakai escaper
 *   3. builder cetak di js/cetak.js WAJIB memakai ex()
 *   4. hasil jsPDF (vektor) TIDAK butuh escaping HTML — dicek tidak memakai innerHTML
 *   5. document.write hanya untuk window cetak (3 situs)
 *   6. vendor library lokal + tidak ada eval/new Function
 * Runtime XSS multi-permukaan (9 tab) sudahcovered L2 r2_feature_smoke/probe. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cetak = fs.readFileSync(path.join(ROOT, 'js', 'cetak.js'), 'utf8');
const util = fs.readFileSync(path.join(ROOT, 'js', 'util.js'), 'utf8');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
function bodyOf(src, fname, max) {
  const i = src.indexOf('function ' + fname + '(');
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j > 0 ? Math.min(j, i + (max || 12000)) : i + (max || 12000));
}

/* 1. call site showStatus: argumen HTML tidak boleh bocor identifier mentah */
function showStatusArg3(src) {
  const out = [];
  let i = 0, first = true;
  while ((i = src.indexOf('showStatus(', i + 1)) >= 0) {
    if (src.slice(Math.max(0, i - 9), i).endsWith('function ')) { i += 11; continue; } // definisi
    const start = src.indexOf('(', i);
    let d = 0, k = start;
    for (; k < src.length; k++) { if (src[k] === '(') d++; else if (src[k] === ')') { d--; if (d === 0) break; } }
    const inner = src.slice(start + 1, k);
    const parts = []; let dd = 0, cur = '';
    for (const ch of inner) {
      if (ch === '(' || ch === '[') dd++; else if (ch === ')' || ch === ']') dd--;
      if (ch === ',' && dd === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    out.push({ arg: parts.slice(2).join(','), line: src.slice(0, i).split('\n').length });
    i = k;
  }
  return out;
}
function unescapedLeftover(arg) {
  let s = arg;
  s = s.replace(/\bxeJs\s*\([\s\S]*?\)/g, ' ').replace(/\bxe\s*\([\s\S]*?\)/g, ' ').replace(/\bex\s*\([\s\S]*?\)/g, ' ');
  s = s.replace(/\bIC\.[a-zA-Z]+/g, ' ').replace(/<\/?[a-z]+>/g, ' ');
  s = s.replace(/'(\\.|[^'])*'/g, ' ').replace(/"(\\.|[^"])*"/g, ' ');
  s = s.replace(/\b[A-Za-z_$][\w$]*\s*\.\s*(length|total|count|size)\b/gi, ' ');
  s = s.replace(/\b[A-Za-z_$][\w$]*\s*\?/g, ' ');
  s = s.replace(/\b\d+(\.\d+)?\b/g, ' ');
  return s.replace(/[^\w]/g, '');
}
const sites = showStatusArg3(html);
const leaks = sites.filter(s => unescapedLeftover(s.arg));
t('XSS-1: showStatus() call site terinventarisasi', sites.length >= 60, sites.length + ' call site');
t('XSS-2: TIDAK ADA data mentah bocor ke showStatus()', leaks.length === 0,
  leaks.length ? leaks.map(l => 'L' + l.line).join(',') : '0 kebocoran dari ' + sites.length + ' call site');
const msgSites = sites.filter(s => /res\.message|err\.message|\.message/.test(s.arg));
const msgEscaped = msgSites.filter(s => /xe\(|xeJs\(|ex\(/.test(s.arg));
t('XSS-3: semua showStatus() yang memakai pesan server ter-escape', msgSites.length === msgEscaped.length,
  msgEscaped.length + '/' + msgSites.length + ' call site pesan server');

/* 2. renderer HTML kritis */
const HTML_RENDERERS = ['_buildTableHtml', 'buildCardHtml', 'renderCetakList', 'renderAdminResults',
  'loadDashRecentActivity', 'renderLowestStockWidget', 'renderRakLabelList', 'renderHistTable',
  'renderOperatorProductivity', 'loadAlert', 'renderAsetItemList', 'renderAsetUnitSubpageList',
  'renderHistFeed', 'renderRackOverview', 'renderHistDay'];
const missing = HTML_RENDERERS.filter(f => { const b = bodyOf(html, f); return !b || !/\bxe\(|\bxeJs\(|\bex\(/.test(b); });
t('XSS-4: renderer HTML kritis memakai escaper', missing.length === 0,
  missing.length ? 'tanpa escaper: ' + missing.join(', ') : HTML_RENDERERS.length + ' fungsi aman');

/* 3. builder cetak (pakai segmen eksplisit: buildPrintHTML berisi inner function,
      sehingga bodyOf terpotong di '\nfunction ' — verified 17 pemanggilan ex()) */
['buildRakLabelHTML', 'buildLabelHTML'].forEach(f => {
  t('XSS-5: js/cetak.js ' + f + '() memakai ex()', /\bex\(/.test(bodyOf(cetak, f)));
});
const printSeg = cetak.slice(cetak.indexOf('function buildPrintHTML'), cetak.indexOf('function labelPdfFilename'));
t('XSS-5: js/cetak.js buildPrintHTML() memakai ex()', /\bex\(/.test(printSeg), (printSeg.match(/\bex\(/g) || []).length + ' pemanggilan ex()');

/* 4. builder jsPDF = vektor, tidak boleh innerHTML */
const pdf = bodyOf(cetak, 'buildLabelPDFDoc');
t('XSS-6: buildLabelPDFDoc (jsPDF vektor) tidak memakai innerHTML/document.write', !/innerHTML|document\.write/.test(pdf));

/* 5. document.write hanya untuk window cetak */
const writes = (html.match(/document\.write\(/g) || []).length;
t('XSS-7: document.write terbatas di 3 window cetak', writes === 3, 'jumlah=' + writes);

/* 6. vendor lokal & tanpa eval */
['jsQR.min.js', 'qrcode.min.js', 'js/jspdf.min.js'].forEach(f => {
  t('XSS-8: vendor lokal tersedia: ' + f, fs.existsSync(path.join(ROOT, f)));
});
t('XSS-9: tidak ada eval() / new Function() di front-end', !/eval\s*\(/.test(html) && !/new Function\s*\(/.test(html));
t('XSS-10: escaper utama escape 4 karakter HTML (& < > ")',
  util.includes("replace(/&/g,'&amp;')") && util.includes("replace(/</g,'&lt;')")
  && util.includes("replace(/>/g,'&gt;')") && util.includes('replace(/"/g,\'&quot;\')'));
t('XSS-11: xe() tidak lagi menghilangkan angka 0 (fix 2026-09-27)', /String\(s==null\?'':s\)/.test(util));
/* 12. setiap statement innerHTML yang memuat pesan server (.message) WAJIB ter-escape
        (dicek per statement, bukan per baris) */
const msgStatements = [...html.matchAll(/innerHTML\s*=\s*[^;]{0,240};/g)]
  .map(m => m[0])
  .filter(s => /\.(message)\b/.test(s));
const unescapedMsg = msgStatements.filter(s => !/xe\(|xeJs\(|ex\(/.test(s));
t('XSS-12: innerHTML yang memuat .message selalu ter-escape', unescapedMsg.length === 0,
  msgStatements.length + ' statement diperiksa, ' + unescapedMsg.length + ' tanpa escaper'
  + (unescapedMsg.length ? ' → ' + unescapedMsg[0].replace(/\s+/g, ' ').slice(0, 120) : ''));

console.log('---- xss_audit: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
