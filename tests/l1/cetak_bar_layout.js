/* L1 revisi user 2026-09-25: action bar cetak tidak boleh menimpa list.
 * Redesain: #section-cetak = viewport-split flex shell (height = 100dvh - chrome:
 * topbar 56 / +bottom-nav 66 mobile / +sticky-tab 48 tablet), list scroll internal
 * (flex:1), action bar pindah jadi footer IN-FLOW di dalam container → bar & list
 * tidak pernah overlap di desktop maupun HP. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// --- shell CSS ---
t('CSS: #section-cetak.active flex column + overflow:hidden',
  /#section-cetak\.active\{display:flex;flex-direction:column;overflow:hidden;/.test(src));
t('CSS: height base = 100vh & 100dvh - 56 (topbar)',
  /#section-cetak\.active\{[^}]*calc\(100vh - 56px\);height:calc\(100dvh - 56px\)/.test(src));
t('CSS: mobile <=640 = - 122 (56 topbar + 66 bottom-nav)',
  /@media\(max-width:640px\)\{#section-cetak\.active\{[^}]*calc\(100dvh - 122px\)/.test(src));
t('CSS: desktop viewer-mode = - 104 (topbar56 + sticky tab48; sidebar hanya utk editor)',
  /@media\(min-width:1024px\)\{body\.viewer-mode #section-cetak\.active\{[^}]*calc\(100dvh - 104px\)/.test(src));
t('CSS: .search-wrap dalam panel-body tak flex:0 0 100% (rebut ruang list)',
  /#section-cetak \.panel-body>\.search-wrap\{flex:0 0 auto;/.test(src));
t('CSS: tablet 641-1023 = - 104 (56 + 48 sticky tab)',
  /@media\(min-width:641px\) and \(max-width:1023px\)\{#section-cetak\.active\{[^}]*calc\(100dvh - 104px\)/.test(src));
t('CSS: container flex col min-height:0 + padding-bottom kecil',
  /#section-cetak \.container\{width:100%;display:flex;flex-direction:column;flex:1;min-height:0;padding-bottom:var\(--sp-12\)\}/.test(src));
t('CSS: panel flex col overflow:hidden (clip konten, bar tak tergusur)',
  /#section-cetak \.panel\{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;margin-bottom:0\}/.test(src));
t('CSS: panel-body flex col min-height:0 overflow:hidden',
  /#section-cetak \.panel-body\{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden\}/.test(src));
t('CSS: list flex:1 min-height:80 scroll internal',
  /#section-cetak \.panel-body>#cetak-item-list\{flex:1 1 auto;min-height:80px\}/.test(src));
t('CSS: bar flex:0 0 auto (tak ikut menyusut)',
  /#cetak-action-bar\{flex:0 0 auto;margin-top:var\(--space-1\)\}/.test(src));

// --- struktur HTML: bar pindah ke dalam section-cetak (sebelum section-aset) ---
const iSec = src.indexOf('id="section-cetak"');
const iBar = src.indexOf('id="cetak-action-bar"');
const iAset = src.indexOf('id="section-aset"');
t('HTML: bar berada SETELAH section-cetak & SEBELUM section-aset',
  iSec >= 0 && iBar > iSec && iAset > iBar, 'sec=' + iSec + ' bar=' + iBar + ' aset=' + iAset);

// --- gaya inline bar: tak ada lagi fixed/overlay ---
const barTag = (src.match(/<div id="cetak-action-bar"[^>]*>/) || [''])[0];
t('HTML: bar tak lagi position:fixed', !/position:fixed/.test(barTag), barTag.slice(0, 200));
t('HTML: bar tak lagi bottom:66px overlay', !/bottom:66px/.test(barTag), barTag.slice(0, 200));
t('HTML: bar inline punya flex:0 0 auto', /flex:0 0 auto/.test(barTag), barTag.slice(0, 200));

// --- container & list: magic numbers hilang ---
t('HTML: container tak lagi padding-bottom:140px', !/style="padding-bottom:140px"/.test(src));
const listTag = (src.match(/<div id="cetak-item-list"[^>]*>/) || [''])[0];
t('HTML: list tak lagi max-height calc magic', !/max-height:calc/.test(listTag), listTag.slice(0, 200));
t('HTML: list tetap scroll (overflow-y:auto)', /overflow-y:auto/.test(listTag));

// --- tidak ada fixed-overlay selector lama yang tersisa utk bar ---
t('CSS: tak ada #cetak-action-bar position:fixed lagi', !/#cetak-action-bar\{[^}]*position:fixed/.test(src));

// --- perilaku & tombol utuh ---
t('JS: switchTab masih toggle display bar', /getElementById\('cetak-action-bar'\)/.test(src));
t('HTML: print-hint utuh', /id="print-hint"/.test(src));
t('HTML: tombol doCetak/doDownload utuh', /onclick="doCetak\(\)"/.test(src) && /onclick="doDownload\(\)"/.test(src));

console.log('---- cetak_bar_layout: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
