/* L1 F-06b — UI-03 input label/aria-label + UI-04 Escape/backdrop overlay (statis).
 * RED/GREEN gate per spesi PLAN.md §5.1.4 gelombang F-06b. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const labelFor = new Set([...src.matchAll(/<label[^>]*\sfor="([\w-]+)"/g)].map(m => m[1]));
function isWrapped(idx) {
  const seg = src.slice(Math.max(0, idx - 1200), idx);
  let depth = 0;
  const re = /<\/?label\b/g;
  let m;
  while ((m = re.exec(seg))) {
    if (m[0] === '<label') depth++;
    else depth--;
  }
  return depth > 0;
}

const re = /<input\b[^>]*>/g;
let m, total = 0;
const miss = [];
while ((m = re.exec(src)) !== null) {
  const tag = m[0];
  total++;
  const type = (tag.match(/type="([\w-]+)"/) || [])[1] || 'text';
  if (type === 'hidden') continue;
  const id = (tag.match(/\bid="([\w-]+)"/) || [])[1];
  const ok = /aria-label=|aria-labelledby=/.test(tag) ||
    (id && labelFor.has(id)) ||
    isWrapped(m.index);
  if (!ok) miss.push((id || '-') + ':' + type);
}
t('UI-03: deteksi input >= 65', total >= 65, 'total=' + total);
t('UI-03: 0 input placeholder-only (tanpa label/for/wrap/aria)', miss.length === 0, miss.length + ' miss: ' + miss.slice(0, 12).join(', '));
t('UI-03: login-username ada aria-label', /id="login-username"[^>]*aria-label=/.test(src));
t('UI-03: login-password ada aria-label', /id="login-password"[^>]*aria-label=/.test(src));
t('UI-03: idd-min-input ada aria-label', /id="idd-min-input"[^>]*aria-label=/.test(src));
t('UI-03: template min-stock-input ada aria-label', /min-stock-input"\s+aria-label="Min stok/.test(src));
t('UI-03: template cetak-item-cb ada aria-label', /cetak-item-cb"\s+aria-label="Pilih/.test(src));
t('UI-03: label exp-date punya for', /<label[^>]*for="exp-date-from"/.test(src) && /<label[^>]*for="exp-date-to"/.test(src));

const ovIds = [...src.matchAll(/class="modal-overlay" id="([\w-]+)"/g)].map(x => x[1]);
t('UI-04: jumlah .modal-overlay = 13', ovIds.length === 13, 'dapat ' + ovIds.length);
const mapDef = src.match(/_overlayCloseMap\s*=\s*\{([\s\S]*?)\}/);
t('UI-04: _overlayCloseMap didefinisikan', !!mapDef);
const pairs = mapDef ? [...mapDef[1].matchAll(/'([\w-]+)'\s*:\s*'(\w+)'/g)] : [];
const keys = new Set(pairs.map(p => p[1]));
const missing = ovIds.filter(id => !keys.has(id));
t('UI-04: semua id overlay ada di map', missing.length === 0, 'kurang: ' + missing.join(','));
const badFn = pairs.filter(p => !new RegExp('function\\s+' + p[2] + '\\s*\\(').test(src)).map(p => p[2]);
t('UI-04: setiap nilai map terdefinisi', badFn.length === 0, badFn.join(','));
const notExp = pairs.filter(p => !new RegExp('window\\.' + p[2] + '\\s*=').test(src)).map(p => p[2]);
t('UI-04: setiap nilai map di-export ke window', notExp.length === 0, notExp.join(','));
t('UI-04: closeTopOverlay didefinisikan', /function\s+closeTopOverlay\s*\(/.test(src));
t('UI-04: closeTopOverlay resolusi via window[_overlayCloseMap]', /window\[_overlayCloseMap\[/.test(src));
t('UI-04: closeTopOverlay baca .modal-overlay.show', /querySelectorAll\('\.modal-overlay\.show'\)/.test(src));
const escIdx = src.indexOf("e.key!=='Escape'");
t('UI-04: handler Escape global ada', escIdx >= 0);
if (escIdx >= 0) {
  const seg = src.substr(escIdx, 1600);
  t('UI-04: Escape handler panggil closeTopOverlay', seg.indexOf('closeTopOverlay()') >= 0);
}
t('UI-04: delegate klik backdrop .modal-overlay', /addEventListener\('click',function\(e\)\{[\s\S]{0,400}modal-overlay/.test(src));

console.log('---- ui06b_label_escape: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
