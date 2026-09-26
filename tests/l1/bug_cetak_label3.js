// BUG FIX CYCLE 2026-09-26 — 3 bug menu cetak label barang (user: "PERBAIKI BUG INI")
// Bug 1: layar terpotong di atas — .subpage-bar sticky top:52px/104px menimpa
//        .panel-head di #section-cetak (section jadi scrollport, bar didorong turun).
// Bug 2: download PDF lambat — popup + html2pdf CDN + html2canvas raster A4 scale2.
//        Fix: jsPDF vector di window utama → klik langsung download.
// Bug 3: QR/nama/spec kecil — QR 13-20mm & font 4.5-6pt padahal cell masih lega.
//        Fix: maksimalkan QR per template + font naik.
const fs = require('fs');
const path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');
let pass = 0,
  fail = 0;
function t(name, ok, ev) {
  if (ok === true) {
    pass++;
    console.log('PASS | ' + name + (ev ? ' | ' + ev : ''));
  } else if (ok === false) {
    fail++;
    console.log('FAIL | ' + name + ' | ' + ev);
  } else {
    console.log(ok + ' | ' + name + ' | ' + ev);
  }
}

const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cetakSrc = fs.readFileSync(path.join(ROOT, 'js/cetak.js'), 'utf8');
const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const all = src + '\n' + cetakSrc;

// ================= Bug 1: sticky bar tak boleh menimpa panel-head =================
const scopedBar = /#section-cetak\s+\.subpage-bar\s*\{[^}]*position:(relative|static)/.test(src);
t('BUG1: #section-cetak .subpage-bar overridden (relative/static)', scopedBar, scopedBar);
const scopedTop = /#section-cetak\s+\.subpage-bar\s*\{[^}]*top:(auto|0)/.test(src);
t('BUG1: scoped rule resets top (auto/0)', scopedTop, scopedTop);
// scoped rule harus muncul setelah base .subpage-bar sticky rule (specificity sudah menang,
// tapi pastikan rule-nya benar-benar di file & bukan di komentar)
const ruleIdx = src.search(/#section-cetak\s+\.subpage-bar\s*\{/);
const stickyIdx = src.search(/\.subpage-bar\{[^}]*position:sticky/);
t('BUG1: scoped rule present & after base sticky rule', ruleIdx > 0 && stickyIdx > 0 && ruleIdx > stickyIdx, `rule@${ruleIdx} sticky@${stickyIdx}`);

// ================= Bug 3: ukuran QR & font dimaksimalkan =================
let LABEL = null;
try {
  LABEL = new Function(cetakSrc + '\n; return LABEL_TPL;')();
} catch (e) {}
t('BUG3: LABEL_TPL executable', !!LABEL, LABEL ? 'ok' : 'exec failed');
if (LABEL) {
  t('BUG3: 4x6 qrMm >= 26 (was 15)', LABEL['4x6'] && LABEL['4x6'].qrMm >= 26, LABEL['4x6'] && LABEL['4x6'].qrMm);
  t('BUG3: 3x8 qrMm >= 16 (was 13)', LABEL['3x8'] && LABEL['3x8'].qrMm >= 16, LABEL['3x8'] && LABEL['3x8'].qrMm);
  t('BUG3: 2x7 qrMm >= 21 (was 20)', LABEL['2x7'] && LABEL['2x7'].qrMm >= 21, LABEL['2x7'] && LABEL['2x7'].qrMm);
}

// font sizes dari CSS output buildLabelHTML (print mode)
let labelCss = null;
try {
  const utilSrc = fs.readFileSync(path.join(ROOT, 'js/util.js'), 'utf8');
  const fn = new Function(utilSrc + '\n' + cetakSrc + '\n; return buildLabelHTML;')();
  labelCss = fn([{ id: 'ID0', nama: 'N', spec: 'S', rak: 'R1' }], 'print', '4x6');
} catch (e) {}
if (labelCss) {
  const fs1 = (labelCss.match(/\.lbl2-nama\{[^}]*font-size:([\d.]+)pt/) || [])[1];
  const fs2 = (labelCss.match(/\.lbl2-kode\{[^}]*font-size:([\d.]+)pt/) || [])[1];
  const fs3 = (labelCss.match(/\.lbl2-spec\{[^}]*font-size:([\d.]+)pt/) || [])[1];
  const fs4 = (labelCss.match(/\.lbl2-co\{[^}]*font-size:([\d.]+)pt/) || [])[1];
  t('BUG3: nama font >= 7pt (was 5.5)', parseFloat(fs1) >= 7, fs1 + 'pt');
  t('BUG3: kode font >= 7.5pt (was 6)', parseFloat(fs2) >= 7.5, fs2 + 'pt');
  t('BUG3: spec font >= 5.5pt (was 4.5)', parseFloat(fs3) >= 5.5, fs3 + 'pt');
  t('BUG3: co font >= 4pt (was 3)', parseFloat(fs4) >= 4, fs4 + 'pt');
} else {
  t('BUG3: buildLabelHTML executable', false, 'exec failed');
}

// QR render px: qrcode.createDataURL(px,…) = pixel PER MODULE — px=120 terukur
// 49 DETIK/QR & px=240 eksplosif (akar "download PDF lambat"); utk QR 27mm cukup
// px≈10 (≈410px total ≈ 400dpi @27mm). Rentang wajib 8..32.
const qrPx = parseInt((cetakSrc.match(/qrImgSrc\(qrPayload,\s*(\d+)\)/) || [])[1]);
const qrPxPdf = parseInt((cetakSrc.match(/qrImgSrc\(payload,\s*(\d+)\)/) || [])[1]);
t('BUG3: label QR px in 8..32 (was 120; 120=49s/QR)', qrPx >= 8 && qrPx <= 32, 'px=' + qrPx);
t('BUG3: PDF QR px in 8..32', qrPxPdf >= 8 && qrPxPdf <= 32, 'px=' + qrPxPdf);

// ================= Bug 2: download instan via jsPDF vector =================
const jsPdfExists = fs.existsSync(path.join(ROOT, 'js/jspdf.min.js'));
t('BUG2: js/jspdf.min.js vendored', jsPdfExists, jsPdfExists);
const jsPdfScript = /<script src="\.\/js\/jspdf\.min\.js"><\/script>/.test(src);
t('BUG2: index.html loads jspdf before cetak.js', jsPdfScript, jsPdfScript);
const hasDLP = /function\s+downloadLabelPDF\s*\(/.test(cetakSrc);
t('BUG2: downloadLabelPDF defined in cetak.js', hasDLP, hasDLP);
const genBranch = /generateOutput\(mode\)[\s\S]{0,1200}downloadLabelPDF\(expanded/.test(src);
t('BUG2: generateOutput label+download -> downloadLabelPDF (no popup)', genBranch, genBranch);
const swAsset = /'\.\/js\/jspdf\.min\.js'/.test(swSrc);
t('BUG2: sw.js precaches js/jspdf.min.js', swAsset, swAsset);

// label builder tak lagi embed html2pdf (download = vector via jsPDF)
let dlHtml = null,
  prnHtml = null;
try {
  const utilSrc = fs.readFileSync(path.join(ROOT, 'js/util.js'), 'utf8');
  const fn = new Function(utilSrc + '\n' + cetakSrc + '\n; return buildLabelHTML;')();
  dlHtml = fn([{ id: 'ID0', nama: 'N', spec: '', rak: 'R1' }], 'download', '4x6');
  prnHtml = fn([{ id: 'ID0', nama: 'N', spec: '', rak: 'R1' }], 'print', '4x6');
} catch (e) {}
if (dlHtml && prnHtml) {
  t('BUG2: label download builder has no html2pdf', !dlHtml.includes('html2pdf'), 'html2pdf=' + dlHtml.includes('html2pdf'));
  t('BUG2: label print builder still window.print', prnHtml.includes('window.print()'), prnHtml.includes('window.print()'));
} else {
  t('BUG2: buildLabelHTML(download/print) executable', false, 'exec failed');
}

// jalur kartu stok TIDAK boleh rusak — tetap html2pdf popup
let kartuDl = null;
try {
  const utilSrc = fs.readFileSync(path.join(ROOT, 'js/util.js'), 'utf8');
  const fn = new Function(utilSrc + '\n' + cetakSrc + '\n; return buildPrintHTML;')();
  kartuDl = fn([{ id: 'ID0', nama: 'N', spec: '', rak: 'R1' }], 'download', 'A4');
} catch (e) {}
t('NON-REGRESSION: kartu download keeps html2pdf', kartuDl ? kartuDl.includes('html2pdf') : false, kartuDl ? 'ok' : 'exec failed');

console.log('=== BUG CETAK LABEL 3-IN-1: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
