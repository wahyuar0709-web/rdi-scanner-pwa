/* L1 import_excel_parse — parser js/importexcel.js (murni, tanpa DOM): format kartu stok per-batch -> item + transaksi.
 * Level: L1 (statis/simulasi). Tidak menguji file Excel produksi maupun UI browser (L2). */
const P = require('../../js/importexcel.js');
let pass = 0, fail = 0;
function t(name, cond, detail) { if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); } else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); } }

t('parseDate dd/MM/yyyy', P.parseDate('04/09/2026') === '2026-09-04');
t('parseDate serial Excel (46269 = 2026-09-04)', P.parseDate(46269) === '2026-09-04', P.parseDate(46269));
t('parseDate ISO + sufiks duplikat ".1"', P.parseDate('2026-06-11 00:00:00.1') === '2026-06-11');
t('parseDate "25-Agu-252" -> null', P.parseDate('25-Agu-252') === null);
t('parseDate tanggal mustahil 31/02 -> null', P.parseDate('31/02/2026') === null);

t('repairCode "[..]" placeholder -> kode bersih', P.repairCode('MRO-01-08-[..]') === 'MRO-01-08');
t('repairCode apostrof/tata = "-" dibuang', P.repairCode('  =INV-2  ') === 'INV-2');
t('repairCode kode penuh simbol -> null (dilewati)', P.repairCode('#$%') === null && P.repairCode('') === null);
t('headerParts "25-Agu-252"', (() => { const p = P.headerParts('25-Agu-252'); return p && p.d === 25 && p.m === 8 && p.ys === '252'; })());
t('headerParts "19/08/20262"', (() => { const p = P.headerParts('19/08/20262'); return p && p.d === 19 && p.m === 8 && p.ys === '20262'; })());
t('repairCandidates jangkar kiri-kanan (kasus nyata Indirect AE)', JSON.stringify(P.repairCandidates({ d: 25, m: 8, ys: '252' }, '2025-08-25', '2025-08-27', '2026-10-12')) === '[\"2025-08-25\"]', JSON.stringify(P.repairCandidates({ d: 25, m: 8, ys: '252' }, '2025-08-25', '2025-08-27', '2026-10-12')));
t('repairCandidates tahun masa depan + jangkar (kasus nyata Indirect FG)', JSON.stringify(P.repairCandidates({ d: 4, m: 3, ys: '2027' }, '2026-03-04', '2026-03-05', '2026-10-12')) === '[\"2026-03-04\"]');
t('repairCandidates tahun 5 digit (kasus nyata Spare Part CB)', JSON.stringify(P.repairCandidates({ d: 19, m: 8, ys: '20262' }, '2026-08-15', '2026-08-22', '2026-10-12')) === '[\"2026-08-19\"]');
t('repairCandidates tanpa jangkar kiri -> ambigu (dilewati)', P.repairCandidates({ d: 4, m: 3, ys: '2027' }, null, '2026-03-05', '2026-10-12').length === 2);
t('repairCandidates tanpa jangkar sama sekali -> kosong', P.repairCandidates({ d: 25, m: 8, ys: '252' }, null, null, '2026-10-12').length === 0);

const H = ['No.', 'Material code', 'Material name', 'Material specification', 'No. invoice', 'Received Date', 'RAK ', 'Qty In', 'Unit',
  '01/09/2026', '02/09/2026', '25-Agu-252', '03/09/2026', '01/09/2026', 'Stok Akhir'];
const rows = [H,
  [1, 'mro-01', 'Gear puller', '100', 'INV-1', '01/09/2026', 'a-1', 10, 'Pc', 2, null, 1, 3, 1, 4],         // 01/09(2) + 25-Agu skip + 03/09(3) + 01/09 kedua(1) -> 10-6=Stok Akhir 4
  [2, 'MRO-02', 'Bor', '8x70', '=INV-2', null, null, 5, 'Pc', null, 1, null, null, null, 4],                    // tanpa tgl terima & rak
  [3, 'MRO-02', 'Bor', '8x70', '=INV-2', null, null, 5, 'Pc', null, 1, null, null, null, 4],                    // baris kembar sah
  [null, null, null, null, null, null, null, null, null],
  [4, '', 'tanpa kode', '', '', '', '', 1, 'Pc']];
const out = P.parseSheets([{ name: 'Tools', rows }, { name: 'Master Code', rows: [['CODE', 'KATEGORI'], ['X', 'Y']] }], { today: '2026-10-12' });

t('Master Code (bukan sheet transaksi) diabaikan', out.report.sheets.length === 1 && out.report.sheets[0].name === 'Tools');
t('item: kode di-uppercase & kategori dari nama sheet', out.items.find(i => i.id === 'MRO-01') && out.items.find(i => i.id === 'MRO-01').kategori === 'Tools');
t('3 item unik (MRO-01, MRO-02, sisa sementara AUTO-… utk baris tanpa kode)', out.items.length === 3, out.items.map(i => i.id).join(','));
const m1 = out.entries.filter(e => e.id === 'MRO-01');
t('MRO-01: 1 MASUK + 3 KELUAR (01/09=2, 03/09=3, 01/09 kedua=1)', m1.filter(e => e.j === 'MASUK').length === 1 && m1.filter(e => e.j === 'KELUAR').length === 3, JSON.stringify(m1.map(e => e.j + e.d + ':' + e.q)));
t('saldo MRO-01: 10 - 6 = Stok Akhir 4, tanpa mismatch', out.report.sheets[0].mismatch.length === 0);
t('rak huruf besar; rak kosong -> "-"', m1[0].rak === 'A-1' && out.entries.find(e => e.id === 'MRO-02').rak === '-');
t('tanggal terima kosong -> tanggal kolom pertama yang terisi (02/09/2026)', out.entries.find(e => e.id === 'MRO-02' && e.j === 'MASUK').d === '2026-09-02');
const m2 = out.entries.filter(e => e.id === 'MRO-02' && e.j === 'MASUK');
t('baris kembar sah digabung jadi 1 entri n=2 (bukan hilang)', m2.length === 1 && m2[0].n === 2, JSON.stringify(m2.map(e => e.n)));
t('kolom header tak terbaca dilewati & dilaporkan', out.report.sheets[0].skippedCols.some(c => c.header === '25-Agu-252' && c.cells === 1 && /tidak terbaca/.test(c.reason)), JSON.stringify(out.report.sheets[0].skippedCols));
t('kolom sah urut tidak menaik (01/09 kedua) tetap dipakai & dilaporkan', out.report.sheets[0].reorderedCols === 1);
t('baris tanpa kode ada nama tidak lagi dilewati (lihat test kode sementara)', out.report.sheets[0].skippedRows === 0 && out.report.warnings.length === 0);
const fut = P.parseSheets([{ name: 'Indirect', rows: [H.slice(0, 9).concat(['04/03/2027', '05/03/2026', 'Stok Akhir']), [1, 'A-1', 'x', '', 'r', '01/03/2026', '', 5, 'Pc', 1, 2, 2]] }], { today: '2026-10-12' });
t('tanggal masa depan TANPA jangkar kiri ambigu -> tetap dilewati, kolom 2026 kanannya tetap dipakai', fut.entries.filter(e => e.j === 'KELUAR').length === 1 && fut.entries.find(e => e.j === 'KELUAR').d === '2026-03-05', JSON.stringify(fut.entries.map(e => e.j + e.d)));
t('kunci MASUK abaikan apostrof awal (safeCell_) & huruf besar', P.entryKey({ id: 'A', j: 'MASUK', d: '2026-01-01', q: 1, ref: "'=inv" }) === P.entryKey({ id: 'A', j: 'MASUK', d: '2026-01-01', q: 1, ref: '=INV' }));
t('kunci KELUAR tidak memakai no referensi', P.entryKey({ id: 'A', j: 'KELUAR', d: '2026-01-01', q: 1, ref: 'x' }) === P.entryKey({ id: 'A', j: 'KELUAR', d: '2026-01-01', q: 1, ref: '' }));

/* ===== e2e perbaikan otomatis ===== */
// header "25-Agu-252" di antara jangkar -> dijahit (kasus nyata Indirect AE)
const rii = P.parseSheets([{ name: 'Indirect', rows: [
  ['No.', 'Material code', 'Material name', 'Qty In', 'Unit', '25/08/2025', '25-Agu-252', '27/08/2025', 'Stok Akhir'],
  [1, 'HSE-02-01-001', 'Baut', 10, 'Pc', null, 2, null, 8]] }], { today: '2026-10-12' });
t('header "25-Agu-252" dijahit ke 2025-08-25 dari jangkar', rii.report.totals.fixedDateCols === 1 && rii.entries.find(e => e.j === 'KELUAR' && e.d === '2025-08-25'), JSON.stringify(rii.report.sheets[0].fixedDateCols));
t('header kolom asal tetap dipelihara di laporan', rii.report.sheets[0].fixedDateCols[0].header === '25-Agu-252' && rii.report.sheets[0].fixedDateCols[0].col === 'G');
t('saldo: 10 - 2 = 8 (Stok Akhir), tanpa mismatch', rii.report.totals.mismatch === 0);

// kolom masa depan berjangkar kiri+kanan -> dijahit mundur (kasus nyata Indirect FG)
const tf = P.parseSheets([{ name: 'Indirect', rows: [
  ['No.', 'Material code', 'Material name', 'Qty In', 'Unit', '04/03/2026', '04/03/2027', '05/03/2026', 'Stok Akhir'],
  [1, 'TL-03', 'z', 7, 'Pc', 1, 2, 3, 1]] }], { today: '2026-10-12' });
t('kolom 04/03/2027 berjangkar kiri+kanan dijahit ke 2026-03-04', tf.report.totals.fixedDateCols === 1 && tf.entries.filter(e => e.j === 'KELUAR' && e.d === '2026-03-04').length === 2, JSON.stringify(tf.report.sheets[0].fixedDateCols));
t('saldo: 7 - (1+2+3) = 1, tanpa mismatch', tf.report.totals.mismatch === 0 && tf.report.totals.keluar === 3);

// qty koma Indonesia & mismatch terdeteksi bila benar-benar tidak cocok
const qtyS = P.parseSheets([{ name: 'Consumable', rows: [
  ['No.', 'Material code', 'Material name', 'Qty In', 'Unit', '02/09/2026', 'Stok Akhir'],
  [1, 'HSE-01-01-001', 'y', '1.000,5', 'Pc', 2, 998.5]] }], { today: '2026-10-12' });
t('Qty In "1.000,5" dibaca 1000.5 (format mil)', qtyS.entries.find(e => e.j === 'MASUK').q === 1000.5 && qtyS.report.totals.mismatch === 0);
const mm = P.parseSheets([{ name: 'Consumable', rows: [
  ['No.', 'Material code', 'Material name', 'Qty In', 'Unit', 'WaT', '02/09/2026', 'Stok Akhir'],
  [1, 'HSE-01-01-002', 'x', 5, 'Pc', 1, 2, 2]] }], { today: '2026-10-12' });
t('kolom "WaT" tidak terbaca -> dilewati, mismatch terdeteksi & ditandai kolomDilewati', mm.report.totals.mismatch === 1 && mm.report.sheets[0].mismatch[0].kolomDilewati === true, JSON.stringify(mm.report.sheets[0].mismatch));

// kode placeholder dirapikan otomatis
const badId = P.parseSheets([{ name: 'Spare Part', rows: [H.slice(0, 9).concat(['01/09/2026', 'Stok Akhir']), [1, 'MRO-01-01-[..]', 'Bearing', '', 'r', '01/09/2026', '', 4, 'Pc', null, 4], [2, 'MRO-01-01-001', 'Bearing', '', 'r', '01/09/2026', '', 4, 'Pc', null, 4]] }], { today: '2026-10-12' });
t('kode placeholder "[..]" dirapikan otomatis jadi "MRO-01-01"', badId.items.length === 2 && badId.items[0].id === 'MRO-01-01' && badId.report.totals.fixedCodeRows === 1, JSON.stringify(badId.items.map(i => i.id)));
t('baris tanpa kode tapi ada nama -> kode sementara AUTO-... (bukan dilewati)', (() => { const a = P.parseSheets([{ name: 'Tools', rows: [H, [5, '', 'tanpa kode', '', '', '', '', 1, 'Pc']] }], { today: '2026-10-12' }); return a.items.length === 1 && /^AUTO-[0-9A-F]{8}$/.test(a.items[0].id) && a.report.totals.autoCodeRows === 1; })(), JSON.stringify(P.parseSheets([{ name: 'Tools', rows: [H, [5, '', 'tanpa kode', '', '', '', '', 1, 'Pc']] }], { today: '2026-10-12' }).items));
t('baris tanpa kode DAN tanpa nama tetap diabaikan senyap', P.parseSheets([{ name: 'Tools', rows: [H, [null, null, null, null, null, null, null, null]] }], { today: '2026-10-12' }).items.length === 0);
t('kode sementara deterministik & terpisah per nama', (() => {
  const k1 = P.autoCodeTemp('FIXED DRILL', ''), k1b = P.autoCodeTemp('FIXED DRILL', ''), k2 = P.autoCodeTemp('COUNTER For edge banding machine ', '');
  return k1 === k1b && k1 !== k2 && /^AUTO-[0-9A-F]{8}$/.test(k1) && P.parseDate(k1.slice(5)) === null;
})());
t('2 baris nama sama tanpa kode -> item AUTO sama (kartu stok per-batch)', (() => {
  const a = P.parseSheets([{ name: 'Spare Part', rows: [H, [602, '', 'FIXED DRILL', '', '', '01/09/2026', '', 2, 'Pc', null, 2], [603, '', 'FIXED DRILL', '', '', '02/09/2026', '', 3, 'Pc', null, 3]] }], { today: '2026-10-12' });
  return a.items.length === 1 && a.report.totals.masuk === 2 && a.entries.filter(e => e.j === 'MASUK').length === 2;
})());
const badId2 = P.parseSheets([{ name: 'Spare Part', rows: [H.slice(0, 9).concat(['01/09/2026', 'Stok Akhir']), [1, '#$%', 'Bearing', '', 'r', '01/09/2026', '', 4, 'Pc', null, 4]] }], { today: '2026-10-12' });
t('kode tak terselamatkan tetap dilewati + warning', badId2.items.length === 0 && badId2.report.warnings.length === 1 && badId2.report.warnings[0].indexOf('tak bisa dirapikan') >= 0);

console.log('\nRingkasan import_excel_parse: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
