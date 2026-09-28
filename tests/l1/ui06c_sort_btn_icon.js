/* L1 F-06c (2026-09-25): UI-05 sort keyboard + UI-06 tombol ikon accessible name.
 * UI-05: tiap <th th-sortable> wajib punya <button type="button" onclick="sortByColumn(...)">
 *        di dalamnya (native focusable/Enter-Space), onclick dipindah dari th (hindari dobel).
 * UI-06: 0 tombol ikon murni (hanya SVG/glyph) tanpa aria-label di index.html & scanner.html.
 *
 * PERBAIKAN 2026-09-28: tombol ikon dulu berisi emoji (mis. "✕"), sehingga pola
 * <button ...>TEKS</button> dengan TEKS tanpa "<" bisa menyRetailnya. Setelah
 * emoji diganti <svg class="ic">, pola lama itu tidak lagi cocok sama sekali -
 * tombol ikon jadi tak terdeteksi dan test berubah jadi false green. Sekarang
 * isi tombol dipindai penuh (bersarang), dan tombol dianggap "ikon murni"
 * bila isinya cuma SVG/glyph tanpa teks yang terbaca. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scanner = fs.readFileSync(path.join(ROOT, 'scanner.html'), 'utf8');
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' -> ' + detail : '')); }
}

// --- UI-05: th-sortable -> button ---
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
// Versi lama hanya cocok untuk isi tanpa "<". Sekarang isi tombol dibaca penuh
// sampai </button> yang sepadan, sehingga tombol ber- <svg> ikut terhitung.
function iconBtns(h) {
  const out = [];
  const re = /<button\b([^>]*)>/gi;
  let mm;
  while ((mm = re.exec(h)) !== null) {
    const attrs = mm[1];
    const mulai = re.lastIndex;
    let i = mulai, depth = 1;
    while (i < h.length && depth > 0) {
      const nextOpen = h.indexOf('<button', i);
      const nextClose = h.indexOf('</button>', i);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) { depth++; i = nextOpen + 7; }
      else { depth--; i = nextClose + 9; }
    }
    const inner = h.slice(mulai, Math.max(mulai, i - 9));
    re.lastIndex = i;
    const adaSvg = /<svg\b/i.test(inner);
    // teks yang benar-benar terbaca pengguna (tanpa tag, tanpa entity, tanpa emoji)
    const teks = inner.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u{27BF}\u{2B00}-\u{2BFF}]/gu, '').trim();
    const glyphSaja = !adaSvg && teks === '' && inner.trim() !== '';
    if (!adaSvg && !glyphSaja) continue;   // bukan tombol ikon
    if (/[A-Za-z0-9]/.test(teks)) continue; // ada teks -> bukan ikon murni
    out.push({ attrs, inner: inner.replace(/\s+/g, ' ').trim().slice(0, 70) });
  }
  return out;
}

const idxIcons = iconBtns(src);
const idxBad = idxIcons.filter((b) => !/aria-label=/.test(b.attrs));
t('UI-06: tombol ikon murni terdeteksi di index.html (baseline >= 20)', idxIcons.length >= 20, 'dapat ' + idxIcons.length);
t('UI-06: index.html 0 tombol ikon tanpa aria-label', idxBad.length === 0,
  idxBad.length + ' tanpa: ' + idxBad.map((b) => b.inner).join(' | '));
const scIcons = iconBtns(scanner);
const scBad = scIcons.filter((b) => !/aria-label=/.test(b.attrs));
t('UI-06: scanner.html 0 tombol ikon tanpa aria-label', scBad.length === 0,
  scBad.length + ' tanpa: ' + scBad.map((b) => b.inner).join(' | '));

// --- Penjaga tambahan: tidak boleh ada emoji sebagai ikon lagi ---
const emojiIkon = [];
const emRe = />([\u{1F300}-\u{1FAFF}\u2600-\u{27BF}\u{2B00}-\u{2BFF}\u2715\u2716\u2717\u2B07\u2B06\u21BB\u2630\u26F6])\uFE0F?/gu;
let em;
while ((em = emRe.exec(src)) !== null) {
  const baris = src.slice(Math.max(0, em.index - 60), em.index + 3).replace(/\s+/g, ' ');
  if (/^\s*(\/\*|\*|\/\/|<!--)/.test(src.slice(src.lastIndexOf('\n', em.index) + 1, em.index))) continue; // komentar
  emojiIkon.push(em[0].trim() + '  ' + baris.slice(-70));
}
t('UI-06: 0 emoji yang berfungsi sebagai ikon di markup', emojiIkon.length === 0,
  emojiIkon.length + ' ditemukan: ' + emojiIkon.slice(0, 3).join(' | '));

console.log('---- ui06c_sort_btn_icon: ' + pass + ' PASS / ' + fail + ' FAIL ----');
console.log('     tombol ikon murni di index.html : ' + idxIcons.length);
process.exit(fail ? 1 : 0);
