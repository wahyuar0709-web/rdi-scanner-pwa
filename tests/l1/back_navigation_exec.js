/* L1: modul Back perangkat (index.html, blok "BACK PERANGKAT"). Konsistensi: setiap lapisan yang dicegat Back harus
 * dikenal handler Escape yang sudah ada (karena Back menutup lapisan lewat event Escape), kalau tidak Back "tidak berbuat apa-apa". */
const fs = require('fs'), path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); } };

const mod = idx.slice(idx.indexOf('BACK PERANGKAT'));
ok('modul Back ada & memakai popstate', /addEventListener\('popstate'/.test(mod));
ok('sentinel dipasang pada interaksi pengguna (bukan saat load)', /\['pointerdown','touchstart','keydown'\]/.test(mod));
const m = mod.match(/var LAYERS='([^']+)'/); ok('daftar LAYERS ditemukan', !!m);
const esc = idx.slice(idx.indexOf("if(e.key!=='Escape')return;if(document.getElementById('item-detail-sheet')"));
const escHead = esc.slice(0, esc.indexOf('function closeTopOverlay'));
(m ? m[1].split(',') : []).forEach((sel) => {
  if (sel === '.modal-overlay.show') { ok('.modal-overlay ditangani closeTopOverlay()', /closeTopOverlay\(\)/.test(escHead) && /_overlayCloseMap/.test(esc)); return; }
  const id = (sel.match(/^#([\w-]+)\.show$/) || [])[1];
  ok('lapisan #' + id + ' dikenal handler Escape', !!id && escHead.indexOf("getElementById('" + id + "').classList.contains('show')") >= 0, sel);
});
ok('semua kasus keluar: toast + jendela 2 detik', /Tekan Back sekali lagi untuk keluar/.test(mod) && /exitUntil=Date\.now\(\)\+2000/.test(mod));
ok('sub-halaman memakai backFromSubpage() yang sama dengan tombol Kembali', /backFromSubpage\(\)/.test(mod) && /onclick="backFromSubpage\(\)"/.test(idx));
console.log('PASS | back_navigation_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
