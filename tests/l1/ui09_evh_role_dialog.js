/* L1 F-06e (2026-09-25): UI-09 fallback 100dvh + UI-10 role dialog modal filter/sort.
 * UI-09: tiap pemakaian `100vh` di index.html wajib punya deklarasi fallback `100dvh`
 *        setelahnya (progressive enhancement: browser lama tetap 100vh, modern pakai dvh
 *        — mengatasi viewport bar URL HP yang membuat layout kepotong).
 * UI-10: #modal-filter & #modal-sort wajib `role="dialog" aria-modal="true" aria-label`
 *        (konsisten dengan 11 modal-overlay lainnya). */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// --- UI-09: 4 occurrence 100vh harus punya pasangan fallback 100dvh ---
t('UI-09: jumlah occurrence 100vh = 4 (baseline audit)', (src.match(/100vh/g) || []).length === 4,
  'dapat ' + (src.match(/100vh/g) || []).length);
t('UI-09: body min-height fallback 100vh → 100dvh',
  /min-height:100vh;min-height:100dvh/.test(src));
t('UI-09: bottom-sheet max-height calc(100vh - 140px) → calc(100dvh - 140px)',
  /max-height:calc\(100vh - 140px\);\s*max-height:calc\(100dvh - 140px\)/.test(src));
t('UI-09: sidebar height 100vh → 100dvh (rule bertingkat)',
  /height:100vh;\s*height:100dvh;/.test(src));
t('UI-09: cetak-item-list inline calc(100vh - 320px) → calc(100dvh - 320px)',
  /max-height:calc\(100vh - 320px\);\s*max-height:calc\(100dvh - 320px\)/.test(src));
t('UI-09: tidak ada 100vh tanpa fallback dvh di dekatnya',
  (() => {
    const re = /100vh/g; let m, n = 0;
    while ((m = re.exec(src)) !== null) {
      const after = src.slice(m.index, m.index + 120);
      if (!/100dvh/.test(after)) n++;
    }
    return n === 0;
  })(), '100vh tanpa dvh fallback di window 120 char');

// --- UI-10: modal-filter & modal-sort ---
function tagOf(id) {
  const re = new RegExp('<div[^>]*id="' + id + '"[^>]*>');
  const m = src.match(re);
  return m ? m[0] : '';
}
for (const id of ['modal-filter', 'modal-sort']) {
  const tag = tagOf(id);
  t('UI-10: #' + id + ' tag ditemukan', tag !== '');
  t('UI-10: #' + id + ' punya role="dialog"', /role="dialog"/.test(tag), tag.slice(0, 120));
  t('UI-10: #' + id + ' punya aria-modal="true"', /aria-modal="true"/.test(tag), tag.slice(0, 120));
  t('UI-10: #' + id + ' punya aria-label (accessible name)', /aria-label="[^"]+"/.test(tag), tag.slice(0, 120));
}

console.log('---- ui09_evh_role_dialog: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
