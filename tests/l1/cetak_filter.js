// F-03 — Filter cetak per rak/kategori (L1 pure)
// Kategori already exists via _activeCat; gap = exact rak filter in list+selectAll+master.
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

// --- UI contract ---
const hasRakBar = /id="rak-filter-bar"/.test(src);
t('F-03 UI rak-filter-bar exists', hasRakBar, hasRakBar);

const hasOpenCallsRak =
  /function openFilterSheet\(\)[\s\S]{0,200}renderRakFilter\(\)/.test(src);
t('F-03 openFilterSheet calls renderRakFilter', !!hasOpenCallsRak, !!hasOpenCallsRak);

const hasState = /_activeRak\s*=\s*''/.test(src);
t('F-03 _activeRak state declared', hasState, hasState);

// --- functions exist ---
const hasRenderRak = /function renderRakFilter\s*\(/.test(src);
t('F-03 renderRakFilter defined', hasRenderRak, hasRenderRak);

const hasSetRak = /function setRakFilter\s*\(/.test(src);
t('F-03 setRakFilter defined', hasSetRak, hasSetRak);

// --- applied in three paths (exact match) ---
const exact = /_activeRak&&\(r\.rak\|\|''\)\.trim\(\)!==_activeRak/;
const rc = /function renderCetakList\(\)/.test(src);
const sel = /function cetakSelectAll\(\)/.test(src);
const dof = /function _doFilter\(\)/.test(src);

function bodyOf(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = src.match(re);
  if (!m) return null;
  let i = m.index;
  let j = src.indexOf('{', i);
  let depth = 0,
    k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(i, k + 1);
}

const bRender = bodyOf('renderCetakList');
const bSel = bodyOf('cetakSelectAll');
const bDof = bodyOf('_doFilter');
const bReset = bodyOf('resetAllFilters');
const bBadge = bodyOf('_updateFilterUI');
const bSet = bodyOf('setRakFilter');
const bRak = bodyOf('renderRakFilter');

t('F-03 renderCetakList applies _activeRak exact', bRender ? exact.test(bRender) : false, !!bRender && exact.test(bRender));
t('F-03 cetakSelectAll applies _activeRak exact', bSel ? exact.test(bSel) : false, !!bSel && exact.test(bSel));
t('F-03 _doFilter applies _activeRak exact', bDof ? exact.test(bDof) : false, !!bDof && exact.test(bDof));

t('F-03 resetAllFilters clears _activeRak', bReset ? /_activeRak\s*=\s*''/.test(bReset) : false, !!bReset && /_activeRak\s*=\s*''/.test(bReset));
t('F-03 _updateFilterUI counts _activeRak', bBadge ? /_activeRak/.test(bBadge) : false, !!bBadge && /_activeRak/.test(bBadge));

// --- renderRakFilter: Semua chip + xe escape ---
t('F-03 renderRakFilter has Semua chip', bRak ? /Semua/.test(bRak) && /data-rak=""/.test(bRak) : false, !!bRak);
t('F-03 renderRakFilter escapes via xe()', bRak ? /xe\(/.test(bRak) : false, !!bRak && /xe\(/.test(bRak));
t('F-03 setRakFilter refreshes list', bSet ? /refreshActiveList\(\)/.test(bSet) : false, !!bSet && /refreshActiveList\(\)/.test(bSet));

// --- kategori still present (regression) ---
t('F-03 kategori filter still present (_activeCat)', /_activeCat/.test(src) && /renderCatFilter/.test(src), 'cat=' + /_activeCat/.test(src));

// --- executable: exact filter predicate (sim) ---
function makeRows() {
  return [
    { id: '1', nama: 'Item A1', rak: 'A1', kategori: 'MRO' },
    { id: '2', nama: 'Item A10', rak: 'A10', kategori: 'MRO' },
    { id: '3', nama: 'Item A1 b', rak: ' A1 ', kategori: 'CAT2' },
    { id: '4', nama: 'Item B1', rak: 'B1', kategori: 'MRO' },
    { id: '5', nama: 'No rak', rak: '', kategori: '' },
    { id: '6', nama: 'No rak 2', rak: undefined, kategori: 'MRO' },
  ];
}
function filterRak(rows, activeRak) {
  return rows.filter(function (r) {
    if (activeRak && (r.rak || '').trim() !== activeRak) return false;
    return true;
  });
}
function filterCat(rows, activeCat) {
  return rows.filter(function (r) {
    if (activeCat && (r.kategori || '').trim() !== activeCat) return false;
    return true;
  });
}
const rows = makeRows();
const onlyA1 = filterRak(rows, 'A1');
t('sim: _activeRak=A1 exact excludes A10', onlyA1.length === 2 && onlyA1.every((r) => (r.rak || '').trim() === 'A1'), 'n=' + onlyA1.length + ' ids=' + onlyA1.map((r) => r.id).join(','));
t('sim: space-padded rak matches after trim', onlyA1.some((r) => r.id === '3'), 'ids=' + onlyA1.map((r) => r.id).join(','));
t('sim: _activeRak empty keeps all', filterRak(rows, '').length === rows.length, filterRak(rows, '').length);
const catThenRak = filterRak(filterCat(rows, 'CAT2'), 'A1');
t('sim: kategori AND rak', catThenRak.length === 1 && catThenRak[0].id === '3', 'n=' + catThenRak.length);
const searchA1 = rows.filter((r) => (r.rak || '').toLowerCase().includes('a1'));
t('sim: substring search A1 hits A10 (contrast)', searchA1.length >= 3 && onlyA1.length === 2, 'search=' + searchA1.length + ' exact=' + onlyA1.length);

console.log('=== F-03 CETAK FILTER: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
