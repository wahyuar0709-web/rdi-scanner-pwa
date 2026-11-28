/* L1: bindSheetDragToClose (index.html) — seret-untuk-tutup bottom sheet.
 * Latar: logika identik dulu tersalin 3x; digabung menjadi satu fungsi (rilis v110). Saat penggabungan sempat terjadi
 * "bindSheetDragToClose is not defined" karena bagian Aset berada di lingkup berbeda -> fungsi HARUS diekspor ke window.
 * Tes ini menjalankan fungsi aslinya di DOM tiruan: ambang tutup, arah seret, mouse vs sentuh, pembersihan state. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); } };

// --- kontrak sumber
const a = idx.indexOf('function bindSheetDragToClose(');
const b = idx.indexOf('window.bindSheetDragToClose = bindSheetDragToClose;');
ok('fungsi bersama ada tepat satu kali', a > 0 && idx.indexOf('function bindSheetDragToClose(', a + 10) < 0);
ok('diekspor ke window (dipanggil dari lingkup Aset yang berbeda)', b > a);
['item-detail', 'aset-detail', 'aset-unit-detail'].forEach((k) =>
  ok('dipakai oleh sheet ' + k, new RegExp("bindSheetDragToClose\\('" + k + "-sheet','" + k + "-drag-handle','" + k + "-hero',function\\(\\)\\{\\w+\\(\\);\\}\\);").test(idx)));
ok('tidak ada lagi salinan inline onStart/onMove/onEnd', (idx.match(/function onStart\(/g) || []).length === 1);

// --- perilaku: jalankan fungsi aslinya
const code = idx.slice(a, b + 'window.bindSheetDragToClose = bindSheetDragToClose;'.length);
function rig(sheetH, withHandle) {
  const L = {}; // listener terdaftar: L[el][event]
  const mkEl = (name) => ({ name, addEventListener(ev, fn) { (L[name] = L[name] || {})[ev] = fn; } });
  const sheet = { name: 'sheet', offsetHeight: sheetH, style: {}, _c: new Set(), classList: { add(c) { sheet._c.add(c); }, remove(c) { sheet._c.delete(c); } }, addEventListener() {} };
  const hero = mkEl('hero'), handle = mkEl('handle');
  const win = { _l: {}, addEventListener(ev, fn) { win._l[ev] = fn; } };
  const doc = { getElementById: (id) => id === 'S' ? sheet : id === 'H' ? (withHandle === false ? null : handle) : id === 'R' ? hero : null };
  let closed = 0;
  const ctx = { document: doc, window: win }; vm.createContext(ctx); vm.runInContext(code, ctx);
  ctx.window.bindSheetDragToClose('S', 'H', 'R', () => { closed++; });
  const ev = (y, touch) => touch ? { touches: [{ clientY: y }], cancelable: true, preventDefault() {} } : { clientY: y, cancelable: true, preventDefault() {} };
  return { sheet, L, win, get closed() { return closed; },
    mouseDrag(dy) { L.hero.mousedown(ev(100)); win._l.mousemove(ev(100 + dy)); win._l.mouseup(); },
    touchDrag(dy) { L.hero.touchstart(ev(100, true)); L.hero.touchmove(ev(100 + dy, true)); L.hero.touchend(); } };
}
let r = rig(500); r.mouseDrag(109); ok('sheet 500px: seret 109px (< 110) tidak menutup', r.closed === 0);
r = rig(500); r.mouseDrag(111); ok('sheet 500px: seret 111px (> 110) menutup', r.closed === 1);
r = rig(1000); r.mouseDrag(150); ok('sheet 1000px: ambang 22% = 220px -> seret 150px tidak menutup', r.closed === 0);
r = rig(1000); r.mouseDrag(230); ok('sheet 1000px: seret 230px menutup', r.closed === 1);
r = rig(500); r.mouseDrag(-200); ok('seret ke ATAS tidak pernah menutup', r.closed === 0);
r = rig(500); r.L.hero.mousedown({ clientY: 100, cancelable: true, preventDefault() {} }); r.win._l.mousemove({ clientY: 60, cancelable: true, preventDefault() {} });
ok('seret ke atas menjepit transform di translateY(0px)', r.sheet.style.transform === 'translateY(0px)', r.sheet.style.transform);
r = rig(500); r.touchDrag(300); ok('geser sentuh 300px menutup (jalur e.touches)', r.closed === 1);
r = rig(500); r.touchDrag(30); ok('geser sentuh 30px tidak menutup', r.closed === 0);
r = rig(500); r.L.hero.mousedown({ clientY: 100, cancelable: true, preventDefault() {} });
ok('selama seret: kelas "dragging" aktif', r.sheet._c.has('dragging'));
r.win._l.mousemove({ clientY: 150, cancelable: true, preventDefault() {} }); r.win._l.mouseup();
ok('setelah lepas: "dragging" dilepas & transform dibersihkan', !r.sheet._c.has('dragging') && r.sheet.style.transform === '');
r = rig(500); r.win._l.mousemove({ clientY: 999, cancelable: true, preventDefault() {} }); r.win._l.mouseup();
ok('mousemove/mouseup tanpa mousedown (tidak sedang menyeret) diabaikan', r.closed === 0 && !r.sheet.style.transform);
r = rig(500); r.L.handle.touchstart({ touches: [{ clientY: 100 }] }); r.L.handle.touchmove({ touches: [{ clientY: 400 }], cancelable: true, preventDefault() {} }); r.L.handle.touchend();
ok('handle (selain hero) juga bisa dipakai menyeret', r.closed === 1);
let threw = false; try { const ctx = { document: { getElementById: () => null }, window: { addEventListener() {} } }; vm.createContext(ctx); vm.runInContext(code, ctx); ctx.window.bindSheetDragToClose('X', 'Y', 'Z', () => {}); } catch (e) { threw = true; }
ok('sheet tidak ditemukan -> keluar tanpa error', !threw);
console.log('PASS | sheet_drag_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
