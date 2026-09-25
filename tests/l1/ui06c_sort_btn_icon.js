/* L1 F-06c (2026-09-25): UI-05 sort keyboard + UI-06 tombol ikon accessible name.
 * UI-05: tiap <th th-sortable> wajib punya <button type="button" onclick="sortByColumn(...)">
 *        di dalamnya (native focusable/Enter-Space), onclick dipindah dari th (hindari dobel).
 * UI-06: 0 tombol ikon murni (hanya glyph/entity) tanpa aria-label di index.html & scanner.html. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scanner = fs.readFileSync(path.join(ROOT, 'scanner.html'), 'utf8');
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// --- UI-05: th-sortable → button ---
const thRe = /<th([^>]*\bth-sortable\b[^>]*)>([\s\S]*?)<\/th>/g;
const ths = [];
let m;
while ((m = thRe.exec(src)) !== null) ths.push({ attrs: m[1], body: m[2] });
t('UI-05: jumlah <th th-sortable> = 8', ths.length === 8, 'dapat ' + ths.length);
let btnOk = 0, thOnClick = 0;
for (const th of ths) {
  const bm = th.body.match(/<button([^>]*)>/);
  if (bm && /type="button"/.test(bm[1]) && /\bonclick="sortByColumn\(/.test(bm[1])) btnOk++;
  if (/\bonclick=/.test(th.attrs)) thOnClick++;
}
t('UI-05: semua th-sortable dibungkus <button type="button" onclick="sortByColumn(...)">',
  ths.length > 0 && btnOk === ths.length, btnOk + '/' + ths.length);
t('UI-05: onclick tidak lagi di <th> (hindari sort dobel via bubbling)', thOnClick === 0,
  thOnClick + ' th masih punya onclick');
t('UI-05: sortByColumn tetap terdefinisi', /function sortByColumn\(/.test(src));

// --- UI-06: tombol ikon murni wajib aria-label ---
function iconBtns(h) {
  const re = /<button([^>]*)>([^<]*)<\/button>/g;
  const out = [];
  let mm;
  while ((mm = re.exec(h)) !== null) {
    const attrs = mm[1], raw = mm[2].trim();
    if (raw === '') continue;
    const stripped = raw.replace(/&[a-z]+;/gi, '');
    if (/[A-Za-z0-9]/.test(stripped)) continue; // ada teks → bukan ikon murni
    out.push({ attrs, raw });
  }
  return out;
}
const idxIcons = iconBtns(src);
const idxBad = idxIcons.filter(b => !/aria-label=/.test(b.attrs));
t('UI-06: index.html ada tombol ikon murni terdeteksi (baseline)', idxIcons.length >= 8, 'dapat ' + idxIcons.length);
t('UI-06: index.html 0 tombol ikon tanpa aria-label', idxBad.length === 0,
  idxBad.length + ' tanpa: ' + idxBad.map(b => b.raw).join(', '));
const scIcons = iconBtns(scanner);
const scBad = scIcons.filter(b => !/aria-label=/.test(b.attrs));
t('UI-06: scanner.html 0 tombol ikon tanpa aria-label', scBad.length === 0,
  scBad.length + ' tanpa: ' + scBad.map(b => b.raw).join(', '));

console.log('---- ui06c_sort_btn_icon: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
