/* L1: viewfinder scan rak harus pindah ke slot di sheet Pindah Rak saat sheet terbuka,
 * dan kembali ke tempat asal saat dipakai dari tab Transaksi (fix UI-10, 2026-11).
 * Fungsi _placeRakScanner diambil dari index.html lalu dijalankan di DOM tiruan. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); } };

const m = idx.match(/var _rakScanHome=null;function _placeRakScanner\(c\)\{[\s\S]*?\n(?=function toggleInlineScannerRak)/);
ok('fungsi _placeRakScanner ada di index.html', !!m);
ok('slot #pindah-scan-slot ada di sheet Pindah Rak', /id="pindah-scan-slot"/.test(idx));
ok('toggleInlineScannerRak memanggil _placeRakScanner', /function toggleInlineScannerRak\(\)\{[^}]*_placeRakScanner\(c\)/.test(idx));

if (m) {
  const mk = (id) => { const e = { id, parentNode: null, kids: [], cls: new Set(),
    classList: { add: (x) => e.cls.add(x), contains: (x) => e.cls.has(x) },
    appendChild(c) { if (c.parentNode) c.parentNode.kids.splice(c.parentNode.kids.indexOf(c), 1); c.parentNode = e; e.kids.push(c); return c; },
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.kids.splice(c.parentNode.kids.indexOf(c), 1); c.parentNode = e; const i = ref ? e.kids.indexOf(ref) : -1; if (i < 0) e.kids.push(c); else e.kids.splice(i, 0, c); return c; } };
    Object.defineProperty(e, 'nextSibling', { get() { if (!e.parentNode) return null; const k = e.parentNode.kids; return k[k.indexOf(e) + 1] || null; } });
    return e; };
  const home = mk('home'), after = mk('after'), c = mk('qr-scanner-rak-container'), sheet = mk('pindah-sheet'), slot = mk('pindah-scan-slot');
  home.appendChild(c); home.appendChild(after);
  const ctx = { document: { getElementById: (i) => ({ 'pindah-sheet': sheet, 'pindah-scan-slot': slot })[i] || null } };
  vm.createContext(ctx); vm.runInContext(m[0] + '\nthis._p=_placeRakScanner;', ctx);

  ctx._p(c);
  ok('sheet tertutup: viewfinder tetap di tempat asal', c.parentNode === home);
  sheet.classList.add('show'); ctx._p(c);
  ok('sheet terbuka: viewfinder pindah ke slot sheet', c.parentNode === slot);
  sheet.cls.delete('show'); ctx._p(c);
  ok('sheet tertutup lagi: kembali ke asal, sebelum saudara aslinya', c.parentNode === home && home.kids.indexOf(c) < home.kids.indexOf(after), home.kids.map((k) => k.id));
}
console.log('PASS | ui_pindah_scan_slot_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
