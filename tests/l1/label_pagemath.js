// LBL-03 / F-00b — label page math (L1 pure)
// Grid A4 label: 4 cols x 6 rows = 24 per page.
// 25 items must yield 2 page divs (not 1, not 3).
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

function extractScript(src, fnName) {
  const re = new RegExp('function\\s+' + fnName + '\\s*\\(');
  const m = src.match(re);
  if (!m) return null;
  let i = m.index + m[0].length - 1;
  let depth = 0,
    j = i;
  for (; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')') {
      depth--;
      if (depth === 0) {
        j++;
        break;
      }
    }
  }
  while (j < src.length && src[j] !== '{') j++;
  if (j >= src.length) return null;
  let b = 0,
    k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') b++;
    else if (src[k] === '}') {
      b--;
      if (b === 0) {
        k++;
        break;
      }
    }
  }
  return src.slice(m.index, k);
}

const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const utilPath = path.join(ROOT, 'js/util.js');
const utilSrc = fs.existsSync(utilPath) ? fs.readFileSync(utilPath, 'utf8') : '';
const cetakPath = path.join(ROOT, 'js/cetak.js');
const cetakSrc = fs.existsSync(cetakPath) ? fs.readFileSync(cetakPath, 'utf8') : '';








const grid = (src + '\n' + cetakSrc).match(/var cols=4,rows=6,perPage=cols\*rows/);
t('grid is 4x6=24 (static)', !!grid, !!grid);

const count24 = /isLabel\?24:/.test(src);
t('updateCetakCount label div=24 (static)', count24, count24);

const buildSrc = extractScript(src, 'buildLabelHTML') || extractScript(cetakSrc, 'buildLabelHTML');
if (!buildSrc) {
  t('extract buildLabelHTML', false, 'not found');
} else {
  let fn;
  try {
    fn = new Function(utilSrc + '\n' + buildSrc + '; return buildLabelHTML;')();
    t('buildLabelHTML executable', true, 'ok');
  } catch (e) {
    t('buildLabelHTML executable', false, String(e.message || e));
    fn = null;
  }

  if (fn) {
    function pagesOf(items) {
      const html = fn(items, 'print');
      return (html.match(/class="page/g) || []).length;
    }
    function cardsOf(items) {
      const html = fn(items, 'print');
      return (html.match(/class="lbl2"/g) || []).length;
    }

    const mk = (n) =>
      Array.from({ length: n }, (_, i) => ({
        id: 'ID' + i,
        nama: 'N' + i,
        spec: '',
        rak: 'R1',
      }));

    t('0 edge via 1 item => 1 page', pagesOf(mk(1)) === 1, 'pages=' + pagesOf(mk(1)));
    t('24 items => 1 page', pagesOf(mk(24)) === 1, 'pages=' + pagesOf(mk(24)));
    t('25 items => 2 pages (LBL-03)', pagesOf(mk(25)) === 2, 'pages=' + pagesOf(mk(25)));
    t('48 items => 2 pages', pagesOf(mk(48)) === 2, 'pages=' + pagesOf(mk(48)));
    t('49 items => 3 pages', pagesOf(mk(49)) === 3, 'pages=' + pagesOf(mk(49)));

    t('25 items => 25 label cards', cardsOf(mk(25)) === 25, 'cards=' + cardsOf(mk(25)));
    t('24 items => 24 label cards', cardsOf(mk(24)) === 24, 'cards=' + cardsOf(mk(24)));

    // page-math formula used by UI: ceil(n/24)
    const uiFormula = (n) => Math.ceil(n / 24);
    t('formula ceil(25/24)=2', uiFormula(25) === 2, uiFormula(25));
    t('formula ceil(24/24)=1', uiFormula(24) === 1, uiFormula(24));
    t('formula ceil(1/24)=1', uiFormula(1) === 1, uiFormula(1));

    // F-01 multi-copy: expanded array length drives pages
    const copies = 3;
    const base = mk(10);
    const expanded = [];
    for (let c = 0; c < copies; c++) expanded.push(...base);
    t('F-01 expand 10x3=30 labels', expanded.length === 30, 'len=' + expanded.length);
    t('F-01 30 expanded => 2 pages', pagesOf(expanded) === 2, 'pages=' + pagesOf(expanded));
  }
}

// static multi-copy hooks
const hasCopiesInput = /id="cetak-copies"/.test(src);
t('F-01 UI input cetak-copies exists', hasCopiesInput, hasCopiesInput);

const genExpands = /generateOutput[\s\S]{0,800}cetak-copies/.test(src);
t('F-01 generateOutput reads cetak-copies', !!genExpands, !!genExpands);

const countUsesCopies = /updateCetakCount[\s\S]{0,600}cetak-copies/.test(src);
t('F-01 updateCetakCount reads cetak-copies', !!countUsesCopies, !!countUsesCopies);

console.log('=== LABEL PAGEMATH: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
