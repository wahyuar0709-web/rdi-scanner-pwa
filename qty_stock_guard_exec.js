/* L1: parseQty / stockGuard (js/format.js) + kontrak pemakaian di index.html (audit UX 2026-11).
 * Bug asal: submit memakai parseInt -> 2.5 tersimpan 2 padahal pratinjau 2.5; KELUAR melebihi stok baru ditolak server.
 * stockGuard harus mencerminkan Code.gs v5.32 (per-rak bila rincian menutup saldo; fallback saldo total bila tidak). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'format.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const eq = (n, a, b) => { const ok = Object.is(a, b) || (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)); if (ok) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + ' -> ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); } };
const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
const P = ctx.parseQty, G = ctx.stockGuard;

eq('parseQty "2.5"', P('2.5'), 2.5); eq('parseQty "2,5" (koma)', P('2,5'), 2.5); eq('parseQty ".5"', P('.5'), 0.5);
eq('parseQty " 3 "', P(' 3 '), 3); eq('parseQty "0.1"+"0.2" dibulatkan', P('0.30000000000000004'), 0.3);
['', 'abc', '1e3', '-1', '1.2.3', null, undefined, 'Infinity'].forEach((v) => eq('parseQty tolak ' + JSON.stringify(v), P(v), NaN));
eq('fmtQty 0.1+0.2', ctx.fmtQty(0.1 + 0.2), '0.3'); eq('fmtQty 5', ctx.fmtQty(5), '5');

const bd = [{ rak: 'A-01', qty: 3 }, { rak: 'B-02', qty: 2 }];
eq('MASUK tidak pernah diblok', G('MASUK', 999, 'A-01', 5, bd).ok, true);
eq('KELUAR <= saldo rak (rincian lengkap)', G('KELUAR', 3, 'A-01', 5, bd).ok, true);
eq('KELUAR > saldo rak walau total cukup (rincian lengkap)', G('KELUAR', 4, 'A-01', 5, bd).ok, false);
eq('pesan menyebut rak & saldo rak', /rak A-01.*3/.test(G('KELUAR', 4, 'A-01', 5, bd).message), true);
eq('rak tak dikenal + rincian lengkap -> saldo rak 0 -> blok', G('KELUAR', 1, 'Z-09', 5, bd).ok, false);
const incomplete = [{ rak: 'A-01', qty: 1 }]; // total 5, rincian hanya 1 -> tidak menutup
eq('rincian tidak menutup & rak tak punya saldo -> pakai saldo TOTAL (ok)', G('KELUAR', 4, 'Z-09', 5, incomplete).ok, true);
eq('rincian tidak menutup & rak tak punya saldo -> melebihi TOTAL (blok)', G('KELUAR', 6, 'Z-09', 5, incomplete).ok, false);
eq('rincian tidak menutup tapi rak punya saldo -> tetap per-rak (blok)', G('KELUAR', 2, 'A-01', 5, incomplete).ok, false);
eq('PINDAH ikut aturan KELUAR', G('PINDAH', 4, 'A-01', 5, bd).ok, false);
eq('tanpa rincian sama sekali, saldo total 0 -> blok', G('KELUAR', 1, 'A-01', 0, []).ok, false);
eq('apostrof di depan rak diabaikan seperti textMarkerStrip_', G('KELUAR', 3, "A-01", 5, [{ rak: "'A-01", qty: 3 }, { rak: 'B-02', qty: 2 }]).ok, true);
eq('desimal: KELUAR 2.5 dari rak 2.5', G('KELUAR', 2.5, 'A-01', 2.5, [{ rak: 'A-01', qty: 2.5 }]).ok, true);
eq('qty kosong/NaN tidak memblok (ditangani validasi lain)', G('KELUAR', NaN, 'A-01', 5, bd).ok, true);

// kontrak pemakaian di index.html
const sub = idx.slice(idx.indexOf('function submitTransaksi('), idx.indexOf('function submitTransaksi(') + 1800);
eq('submitTransaksi memakai parseQty (bukan parseInt) untuk qty', /parseQty\(document\.getElementById\('qty-input'\)\.value\)/.test(sub) && !/parseInt\(document\.getElementById\('qty-input'\)/.test(sub), true);
eq('submitTransaksi memanggil stockGuard sebelum kirim', /stockGuard\(currentJenis,qty,rak,/.test(sub), true);
eq('qty-input step="any" & min tidak memaksa >=1', /id="qty-input" value="1" min="0" step="any"/.test(idx), true);
eq('pindah-qty step="any"', /id="pindah-qty" value="1" min="0" step="any"/.test(idx), true);
eq('elemen #stock-guard-msg ada (role=alert)', /id="stock-guard-msg"[^>]*role="alert"/.test(idx), true);
eq('adjustQty tidak lagi memotong ke bilangan bulat', /function adjustQty\(delta\)\{[^}]*parseQty\(/.test(idx), true);
console.log('PASS | qty_stock_guard_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
