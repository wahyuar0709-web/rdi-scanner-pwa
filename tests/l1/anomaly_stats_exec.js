/* L1: anomalyStats / isQtyAnomaly (js/format.js) + kontrak istilah & reset layar hasil (audit UX 2026-11 #5 #8 #11).
 * Bug asal: peringatan anomali memakai SEMUA transaksi (masuk+keluar+pindah) dan aturan OR, sehingga aktif hampir selalu. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'format.js'), 'utf8'), ctx);
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); } };
const R = (j, qs) => qs.map((q) => ({ q, j }));

ok('kurang dari 5 transaksi -> tidak ada statistik', ctx.anomalyStats(R('KELUAR', [1, 2, 3, 4]), 'KELUAR') === null);
ok('1 riwayat saja tidak memicu peringatan', ctx.isQtyAnomaly(999, ctx.anomalyStats(R('KELUAR', [2]), 'KELUAR')) === false);
const st = ctx.anomalyStats(R('KELUAR', [4, 5, 5, 6, 5]), 'KELUAR');
ok('statistik: n=5 rata-rata 5 maks 6 median 5', st && st.n === 5 && st.avg === 5 && st.max === 6 && st.median === 5, st);
ok('qty 10 (<=3x rata-rata 15) bukan anomali walau > maks', ctx.isQtyAnomaly(10, st) === false);
ok('qty 16 (>3x rata-rata & > semua riwayat) anomali', ctx.isQtyAnomaly(16, st) === true);
ok('qty 15 tepat 3x rata-rata bukan anomali (strict >)', ctx.isQtyAnomaly(15, st) === false);
const mix = R('MASUK', [100, 120, 90, 110, 100]).concat(R('KELUAR', [1, 2, 1, 2, 1]));
ok('dihitung per jenis: KELUAR tidak terpengaruh riwayat MASUK besar', ctx.anomalyStats(mix, 'KELUAR').max === 2);
ok('dihitung per jenis: MASUK tidak terpengaruh KELUAR kecil', ctx.anomalyStats(mix, 'MASUK').avg === 104);
ok('PINDAH tidak dihitung', ctx.anomalyStats(R('PINDAH', [1, 1, 1, 1, 1, 1]), null) === null);
ok('tanpa jenis -> gabungan MASUK+KELUAR (tanpa PINDAH)', ctx.anomalyStats(mix.concat(R('PINDAH', [500])), null).n === 10);
ok('qty nol/negatif/NaN diabaikan', ctx.anomalyStats(R('KELUAR', [0, -1, 'x', 2, 2, 2, 2, 2]), 'KELUAR').n === 5);
ok('rows null/undefined tidak melempar', ctx.anomalyStats(null, 'KELUAR') === null && ctx.anomalyStats(undefined, null) === null);

// kontrak index.html
const ev = idx.slice(idx.indexOf('function evaluateAnomalyWarning(){'), idx.indexOf('function hideAnomalyWarning(){'));
ok('evaluateAnomalyWarning memakai anomalyStats/isQtyAnomaly', ev.indexOf('anomalyStats(_anomalyStats.rows,currentJenis)') >= 0 && ev.indexOf('isQtyAnomaly(qty,st)') >= 0);
ok('pesan anomali menyebut jumlah & jenis transaksi', /transaksi '\+\(currentJenis\?currentJenis\.toLowerCase\(\):'sebelumnya'\)/.test(idx));
ok('layar hasil lama direset setelah >60 dtk saat kembali ke tab Transaksi', /_trxResultAt&&Date\.now\(\)-_trxResultAt>60000/.test(idx) && /if\(name==='result'\)_trxResultAt=Date\.now\(\)/.test(idx));
ok('pesan status-belum-pasti menyebut "Riwayat" (nama tab), bukan "History"', /Cek Riwayat sebelum mencoba lagi/.test(idx) && /Cek Riwayat dulu/.test(idx) && !/Cek History/.test(idx));
console.log('PASS | anomaly_stats_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
