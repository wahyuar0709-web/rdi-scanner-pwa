// F-02 — Template label (4×6 vs 3×8 vs 2×7) L1 pure
// Default must stay byte-equivalent page math to F-00b (4×6=24).
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
const utilSrc = fs.readFileSync(path.join(ROOT, 'js/util.js'), 'utf8');
const cetakSrc = fs.readFileSync(path.join(ROOT, 'js/cetak.js'), 'utf8');
const all = src + '\n' + cetakSrc;

// --- UI contract ---
const hasTplWrap = /id="label-tpl-wrap"/.test(src);
t('F-02 UI label-tpl-wrap exists', hasTplWrap, hasTplWrap);

const hasTplSelect = /id="label-tpl"/.test(src);
t('F-02 UI label-tpl select exists', hasTplSelect, hasTplSelect);

const hasOpts =
  /value="4x6"/.test(src) && /value="3x8"/.test(src) && /value="2x7"/.test(src);
t('F-02 options 4x6/3x8/2x7 present', hasOpts, hasOpts);

const modeTogglesTpl =
  /setCetakMode[\s\S]{0,600}label-tpl-wrap/.test(src) &&
  /label-tpl-wrap/.test(src);
t('F-02 setCetakMode toggles label-tpl-wrap', modeTogglesTpl, modeTogglesTpl);

const genReadsTpl = /generateOutput[\s\S]{0,1200}label-tpl/.test(src);
t('F-02 generateOutput reads label-tpl', !!genReadsTpl, !!genReadsTpl);

const countReadsTpl = /updateCetakCount[\s\S]{0,900}label-tpl|labelPerPage|getLabelTpl/.test(src);
t('F-02 updateCetakCount resolves template perPage', !!countReadsTpl, !!countReadsTpl);

const noHard24 = !/isLabel\?24:/.test(src);
t('F-02 updateCetakCount no longer hardcodes isLabel?24', noHard24, noHard24);

// --- builder contract ---
const hasTplMap = /LABEL_TEMPLATES|getLabelTpl/.test(cetakSrc);
t('F-02 LABEL_TEMPLATES/getLabelTpl in cetak.js', hasTplMap, hasTplMap);

const sig3 = /function buildLabelHTML\s*\(\s*items\s*,\s*mode\s*,\s*tplId\s*\)/.test(cetakSrc);
t('F-02 buildLabelHTML accepts tplId 3rd arg', sig3, sig3);

const oldSig = /function buildLabelHTML\(items,mode\)/.test(cetakSrc);
t('F-02 old 2-arg-only signature removed', !oldSig, 'oldSig=' + oldSig);

// --- executable page math (full cetak.js so getLabelTpl is in scope) ---
function makeItems(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'ID' + i,
    nama: 'N' + i,
    spec: '',
    rak: 'R1',
  }));
}
function pagesOf(fn, items, tplId) {
  const html = tplId === undefined ? fn(items, 'print') : fn(items, 'print', tplId);
  return (html.match(/class="page/g) || []).length;
}
function colsOf(fn, items, tplId) {
  const html = fn(items, 'print', tplId);
  const m = html.match(/grid-template-columns:repeat\((\d+),1fr\)/);
  return m ? parseInt(m[1], 10) : null;
}

let fn = null;
try {
  fn = new Function(utilSrc + '\n' + cetakSrc + '\n; return buildLabelHTML;')();
  t('F-02 buildLabelHTML executable (full cetak)', true, 'ok');
} catch (e) {
  t('F-02 buildLabelHTML executable (full cetak)', false, String(e.message || e));
}

if (fn) {
  // backward-compat default = F-00b 4×6
  t('default: 24 items => 1 page', pagesOf(fn, makeItems(24)) === 1, 'pages=' + pagesOf(fn, makeItems(24)));
  t('default: 25 items => 2 pages (F-00b parity)', pagesOf(fn, makeItems(25)) === 2, 'pages=' + pagesOf(fn, makeItems(25)));
  t('default grid cols=4', colsOf(fn, makeItems(1)) === 4, 'cols=' + colsOf(fn, makeItems(1)));

  t('tpl 4x6: 25 => 2 pages', pagesOf(fn, makeItems(25), '4x6') === 2, 'pages=' + pagesOf(fn, makeItems(25), '4x6'));
  t('tpl 4x6 grid cols=4', colsOf(fn, makeItems(1), '4x6') === 4, 'cols=' + colsOf(fn, makeItems(1), '4x6'));

  t('tpl 3x8: 24 => 1 page', pagesOf(fn, makeItems(24), '3x8') === 1, 'pages=' + pagesOf(fn, makeItems(24), '3x8'));
  t('tpl 3x8: 25 => 2 pages', pagesOf(fn, makeItems(25), '3x8') === 2, 'pages=' + pagesOf(fn, makeItems(25), '3x8'));
  t('tpl 3x8 grid cols=3', colsOf(fn, makeItems(1), '3x8') === 3, 'cols=' + colsOf(fn, makeItems(1), '3x8'));

  t('tpl 2x7: 14 => 1 page', pagesOf(fn, makeItems(14), '2x7') === 1, 'pages=' + pagesOf(fn, makeItems(14), '2x7'));
  t('tpl 2x7: 15 => 2 pages', pagesOf(fn, makeItems(15), '2x7') === 2, 'pages=' + pagesOf(fn, makeItems(15), '2x7'));
  t('tpl 2x7 grid cols=2', colsOf(fn, makeItems(1), '2x7') === 2, 'cols=' + colsOf(fn, makeItems(1), '2x7'));

  t('unknown tpl falls back to 4x6 (25=>2)', pagesOf(fn, makeItems(25), 'nope') === 2, 'pages=' + pagesOf(fn, makeItems(25), 'nope'));

  // labelPerPage helper used by updateCetakCount
  let lpp = null;
  try {
    lpp = new Function(cetakSrc + '\n; return typeof labelPerPage==="function"?labelPerPage:null;')();
  } catch (e) {}
  t('F-02 labelPerPage exported', typeof lpp === 'function', typeof lpp);
  if (lpp) {
    t('labelPerPage 4x6=24', lpp('4x6') === 24, lpp('4x6'));
    t('labelPerPage 3x8=24', lpp('3x8') === 24, lpp('3x8'));
    t('labelPerPage 2x7=14', lpp('2x7') === 14, lpp('2x7'));
    t('labelPerPage unknown=24', lpp('nope') === 24, lpp('nope'));
  }
}

// --- mode visibility static ---
const ltDefaultHidden =
  /id="label-tpl-wrap"\s+style="display:none"/.test(src) ||
  /id="label-tpl-wrap"[^>]*display:\s*none/.test(src);
t('F-02 label-tpl-wrap default hidden (kartu mode)', ltDefaultHidden, ltDefaultHidden);

console.log('=== F-02 LABEL TEMPLATE: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
