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

const H = ['No.', 'Material code', 'Material name', 'Material specification', 'No. invoice', 'Received Date', 'RAK ', 'Qty In', 'Unit',
  '01/09/2026', '02/09/2026', '25-Agu-252', '03/09/2026', '01/09/2026', 'Stok Akhir'];
const rows = [H,
  [1, 'mro-01', 'Gear puller', '100', 'INV-1', '01/09/2026', 'a-1', 10, 'Pc', 2, null, 1, 3, 1, 4],         // kolom 25-Agu skip (1), 03/09 ok(3) ; 01/09 duplikat tanggal mundur? (01<03 -> mundur)
  [2, 'MRO-02', 'Bor', '8x70', '=INV-2', null, null, 5, 'Pc', null, 1, null, null, null, 4],                    // tanpa tgl terima & rak
  [3, 'MRO-02', 'Bor', '8x70', '=INV-2', null, null, 5, 'Pc', null, 1, null, null, null, 4],                    // baris kembar sah
  [null, null, null, null, null, null, null, null, null],
  [4, '', 'tanpa kode', '', '', '', '', 1, 'Pc']];
const out = P.parseSheets([{ name: 'Tools', rows }, { name: 'Master Code', rows: [['CODE', 'KATEGORI'], ['X', 'Y']] }], { today: '2026-10-12' });

t('Master Code (bukan sheet transaksi) diabaikan', out.report.sheets.length === 1 && out.report.sheets[0].name === 'Tools');
t('item: kode di-uppercase & kategori dari nama sheet', out.items.find(i => i.id === 'MRO-01') && out.items.find(i => i.id === 'MRO-01').kategori === 'Tools');
t('2 item unik (MRO-01, MRO-02)', out.items.length === 2, out.items.map(i => i.id).join(','));
const m1 = out.entries.filter(e => e.id === 'MRO-01');
t('MRO-01: 1 MASUK + KELUAR hanya di kolom valid (01/09=2, 03/09=3)', m1.filter(e => e.j === 'MASUK').length === 1 && m1.filter(e => e.j === 'KELUAR').length === 2, JSON.stringify(m1.map(e => e.j + e.d + ':' + e.q)));
t('rak huruf besar; rak kosong -> "-"', m1[0].rak === 'A-1' && out.entries.find(e => e.id === 'MRO-02').rak === '-');
t('tanggal terima kosong -> tanggal kolom pertama yang terisi (02/09/2026)', out.entries.find(e => e.id === 'MRO-02' && e.j === 'MASUK').d === '2026-09-02');
const m2 = out.entries.filter(e => e.id === 'MRO-02' && e.j === 'MASUK');
t('baris kembar sah digabung jadi 1 entri n=2 (bukan hilang)', m2.length === 1 && m2[0].n === 2, JSON.stringify(m2.map(e => e.n)));
t('kolom header tak terbaca dilewati & dilaporkan', out.report.sheets[0].skippedCols.some(c => c.header === '25-Agu-252' && c.cells === 1 && /tidak terbaca/.test(c.reason)), JSON.stringify(out.report.sheets[0].skippedCols));
t('kolom urutan mundur (01/09 setelah 03/09) dilewati', out.report.sheets[0].skippedCols.some(c => /mundur/.test(c.reason)));
t('baris tanpa kode dilewati + warning', out.report.sheets[0].skippedRows === 1 && out.report.warnings.length === 1);
t('Qty In - keluar != Stok Akhir terdeteksi & ditandai kolomDilewati', out.report.sheets[0].mismatch.length === 1 && out.report.sheets[0].mismatch[0].kolomDilewati === true, JSON.stringify(out.report.sheets[0].mismatch));
const fut = P.parseSheets([{ name: 'Indirect', rows: [H.slice(0, 9).concat(['04/03/2027', '05/03/2026', 'Stok Akhir']), [1, 'A-1', 'x', '', 'r', '01/03/2026', '', 5, 'Pc', 1, 2, 2]] }], { today: '2026-10-12' });
t('tanggal masa depan (2027) dilewati, kolom 2026 sesudahnya tetap dipakai', fut.entries.filter(e => e.j === 'KELUAR').length === 1 && fut.entries.find(e => e.j === 'KELUAR').d === '2026-03-05', JSON.stringify(fut.entries.map(e => e.j + e.d)));
t('kunci MASUK abaikan apostrof awal (safeCell_) & huruf besar', P.entryKey({ id: 'A', j: 'MASUK', d: '2026-01-01', q: 1, ref: "'=inv" }) === P.entryKey({ id: 'A', j: 'MASUK', d: '2026-01-01', q: 1, ref: '=INV' }));
t('kunci KELUAR tidak memakai no referensi', P.entryKey({ id: 'A', j: 'KELUAR', d: '2026-01-01', q: 1, ref: 'x' }) === P.entryKey({ id: 'A', j: 'KELUAR', d: '2026-01-01', q: 1, ref: '' }));
const badId = P.parseSheets([{ name: 'Spare Part', rows: [H.slice(0, 9).concat(['01/09/2026', 'Stok Akhir']), [1, 'MRO-01-01-[..]', 'Bearing', '', 'r', '01/09/2026', '', 4, 'Pc', null, 4], [2, 'MRO-01-01-001', 'Bearing', '', 'r', '01/09/2026', '', 4, 'Pc', null, 4]] }], { today: '2026-10-12' });
t('kode placeholder "[..]" dilewati + warning (tidak memblokir import)', badId.items.length === 1 && badId.items[0].id === 'MRO-01-01-001' && badId.report.warnings.some((w) => /baris 2.*tidak valid/.test(w)), JSON.stringify(badId.report.warnings));
console.log('\nRingkasan import_excel_parse: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
