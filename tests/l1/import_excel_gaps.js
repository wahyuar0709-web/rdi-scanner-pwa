/* L1 import_excel_gaps — perbaikan hasil uji 10 skema (2026-11-11, v5.29):
 *   IMP-01: dedup mengenali timestamp Transaksi_Log berbentuk TEKS dd/MM/yyyy.
 *   IMP-02: dedup mengenali qty tersimpan sebagai teks koma "10,5".
 *   IMP-03: hasil dry melaporkan nameMismatch (nama Excel ≠ master utk ID sama).
 *   IMP-04: dupNameSpecCount/unknownCount dilaporkan.
 *   IMP-05: header tanggal SETELAH "Stok Akhir" dilaporkan (lateDateCols).
 *   IMP-06: ID >40 karakter DITOLAK, bukan dipangkas.
 * CATATAN LEVEL: L1 (parser murni + mock Sheets). Tidak membuktikan GAS asli (L3). */
const { loadCodeGS, makeSheet, makeSpreadsheet } = require('../tools/gs_harness.js');
const P = require('C:/projec/rdi-scanner-pwa/js/importexcel.js');
let pass = 0, fail = 0;
function t(name, cond, detail) { if (cond) { pass++; console.log('PASS | ' + name); } else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); } }
const clone = (o) => JSON.parse(JSON.stringify(o));

function kit(extraMaster, extraTrx) {
  return makeSpreadsheet([
    makeSheet('Master_Item', [['No', 'ID_Item', 'Nama Material', 'Spesifikasi', 'User', 'BC/Non BC', 'Unit', 'Kategori', 'Min_Stock', 'Status']].concat(extraMaster || [])),
    makeSheet('Transaksi_Log', [['Timestamp', 'ID_Item', 'Nama_Item', 'Spesifikasi', 'Jenis', 'Qty', 'RAK', 'Vendor', 'No_Referensi', 'Saldo_Sebelum', 'Saldo_Sesudah', 'Keterangan', 'Admin']].concat(extraTrx || [])),
    makeSheet('Stok_Saldo', [['ID_Item', 'Nama', 'Unit', 'Total_Masuk', 'Total_Keluar', 'Saldo_Akhir']]),
    makeSheet('Stok_Per_Rak', [['ID_Item', 'RAK', 'Qty']]),
  ]);
}

(function imp01_text_timestamp() {
  /* baris log lama: timestamp TEKS (bukan Date) — dulu: dedup buta -> impor ulang menggandakan */
  const k = kit(
    [[1, 'MRO-01', 'Bearing', '6205', 'GUDANG', 'BC', 'Pcs', 'Spare Part', 5, 'Aktif']],
    [['01/09/2026 12:00', 'MRO-01', 'Bearing', '6205', 'MASUK', 10, '-', 'PT A', 'INV-1', 0, 10, 'IMPOR-EXCEL Tools', 'lama']]
  );
  const ctx = loadCodeGS({ spreadsheet: k });
  const r = ctx.importExcel({ mode: 'commit', items: [], entries: [{ id: 'MRO-01', j: 'MASUK', d: '2026-09-01', q: 10, ref: 'INV-1', rak: '-', ven: 'PT A', n: 1 }], final: true });
  const nTrx = k.getSheetByName('Transaksi_Log').getLastRow() - 1;
  t('IMP-01: timestamp teks dd/MM/yyyy dikenali dedup -> 0 ditambah', r.status === 'ok' && r.masukAdd === 0 && r.alreadyExist === 1 && nTrx === 1, JSON.stringify(r));
})();

(function imp02_qty_teks_koma() {
  const k = kit(
    [[1, 'MRO-02', 'Bor', '8mm', 'GUDANG', 'BC', 'Pcs', 'Tools', 5, 'Aktif']],
    [['01/09/2026 12:00', 'MRO-02', 'Bor', '8mm', 'MASUK', '10,5', '-', '', '', 0, 10.5, 'Migrasi dari Excel', 'lama']]
  );
  const ctx = loadCodeGS({ spreadsheet: k });
  const r = ctx.importExcel({ mode: 'commit', items: [], entries: [{ id: 'MRO-02', j: 'MASUK', d: '2026-09-01', q: 10.5, ref: '', n: 1 }], final: true });
  const nTrx = k.getSheetByName('Transaksi_Log').getLastRow() - 1;
  t('IMP-02: qty teks "10,5" dikenali dedup -> 0 ditambah', r.status === 'ok' && r.masukAdd === 0 && r.alreadyExist === 1 && nTrx === 1, JSON.stringify(r));
  /* qty teks mil "1.000,5" */
  const k2 = kit([[1, 'MRO-03', 'Obeng', '-', 'GUDANG', 'BC', 'Pcs', 'Tools', 5, 'Aktif']],
    [['02/09/2026 12:00', 'MRO-03', 'Obeng', '-', 'MASUK', '1.000,5', '-', '', '', 0, 1000.5, 'Migrasi', 'lama']]);
  const ctx2 = loadCodeGS({ spreadsheet: k2 });
  const r2 = ctx2.importExcel({ mode: 'commit', items: [], entries: [{ id: 'MRO-03', j: 'MASUK', d: '2026-09-02', q: 1000.5, ref: '', n: 1 }], final: true });
  t('IMP-02b: qty teks "1.000,5" dikenali dedup', r2.status === 'ok' && r2.masukAdd === 0 && r2.alreadyExist === 1, JSON.stringify(r2));
})();

(function imp03_name_mismatch() {
  const k = kit([[1, 'MRO-01', 'Bolt L Half Thread M6x70', '', 'GUDANG', 'BC', 'Pcs', 'Tools', 5, 'Aktif']], []);
  const ctx = loadCodeGS({ spreadsheet: k });
  const r = ctx.importExcel({ mode: 'dry', items: [{ id: 'MRO-01', nama: 'Bolt L', spec: '' }], entries: [] });
  t('IMP-03: nameMismatch dilaporkan (nama Excel beda dgn master, ID sama)', r.status === 'ok' && r.nameMismatchCount === 1 && r.nameMismatch[0].id === 'MRO-01' && r.nameMismatch[0].master === 'Bolt L Half Thread M6x70', JSON.stringify(r));
  const r2 = ctx.importExcel({ mode: 'dry', items: [{ id: 'MRO-01', nama: 'bolt l half thread m6x70' }], entries: [] });
  t('IMP-03b: nama sama beda kapital TIDAK dilaporkan', r2.status === 'ok' && r2.nameMismatchCount === 0, JSON.stringify(r2));
})();

(function imp04_counts() {
  const k = kit([], []);
  const ctx = loadCodeGS({ spreadsheet: k });
  const r = ctx.importExcel({ mode: 'dry', items: [{ id: 'MRO-99', nama: 'X' }], entries: [{ id: 'MRO-98', j: 'MASUK', d: '2026-09-01', q: 1, n: 1 }] });
  t('IMP-04: dupNameSpecCount & unknownCount dilaporkan', r.status === 'ok' && r.unknownCount === 1 && r.dupNameSpecCount === 0, JSON.stringify(r));
})();

(function imp05_late_date_cols() {
  const sh = { name: 'Tools', rows: [
    ['Material code', 'Material name', 'Qty In', 'Unit', '01/10/2026', 'Stok Akhir', '05/10/2026'],
    ['MRO-99-99-001', 'A', '5', 'Pcs', '1', '4', ''],
  ]};
  const out = P.parseSheets([sh], { today: '2026-11-11' });
  const s = out.report.sheets[0];
  t('IMP-05: kolom tanggal SETELAH Stok Akhir dilaporkan (lateDateCols) & tetap tak dipakai', s.lateDateCols.length === 1 && s.lateDateCols[0].col === 'G' && out.entries.every(e => e.d === '2026-10-01'), JSON.stringify(s.lateDateCols));
})();

(function imp06_id_too_long() {
  const k = kit([], []);
  const ctx = loadCodeGS({ spreadsheet: k });
  const r = ctx.importExcel({ mode: 'dry', items: [{ id: 'A'.repeat(45), nama: 'X' }], entries: [] });
  t('IMP-06: ID >40 karakter DITOLAK dengan pesan jelas', r.status === 'error' && /terlalu panjang/.test(r.message || ''), JSON.stringify(r));
  const r2 = ctx.importExcel({ mode: 'dry', items: [], entries: [{ id: 'A'.repeat(45), j: 'MASUK', d: '2026-09-01', q: 1, n: 1 }] });
  t('IMP-06b: ID transaksi >40 karakter juga ditolak', r2.status === 'error' && /terlalu panjang/.test(r2.message || ''), JSON.stringify(r2));
})();

(function imp03_parser_collapsed() {
  const sh = { name: 'Tools', rows: [
    ['Material code', 'Material name', 'Qty In', 'Unit', 'Stok Akhir', '10/10/2026'],
    ['MRO-01-08-[..]', 'Bolt L', '4', 'Pcs', '', '2'],
    ['MRO-01-08-[...]', 'Bolt L', '3', 'Pcs', '', '2'],
  ]};
  const out = P.parseSheets([sh], { today: '2026-11-11' });
  const s = out.report.sheets[0];
  const ke = s.collapsedCodes.filter(c => c.ke === 'MRO-01-08');
  t('IMP-03: parser mengumpulkan kolisi kode hasil rapikan (2 raw -> 1 kode)', s.collapsedCodes.length === 2 && ke.length === 2 && out.items.length === 1, JSON.stringify(s.collapsedCodes));
})();

console.log('\nimport_excel_gaps: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
