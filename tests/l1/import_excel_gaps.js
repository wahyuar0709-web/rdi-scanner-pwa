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

(function imp10_promote_dan_commit() {
  /* kasus user: Excel lama tanpa kode -> AUTO-<hash>; Excel berikutnya kode asli ->
     harus UPDATE item lama, bukan item baru (dobel input). */
  const k = kit(
    [[1, 'AUTO-948FFE61', 'Sticker Felt bludru brand 3M', '3cmx3meter', '', '', 'Roll', 'Indirect', 0]],
    [['01/11/2026 12:00', 'AUTO-948FFE61', 'Sticker Felt bludru brand 3M', '3cmx3meter', 'MASUK', 3, '-', 'DMN', 'RDI-2610-DMN003', 0, 3, 'IMPOR-EXCEL Indirect', 'lama']]
  );
  const ctx = loadCodeGS({ spreadsheet: k });
  const dry = ctx.importExcel({ mode: 'dry', items: [{ id: 'MRO-01-08-247', nama: 'Sticker Felt bludru brand 3M', spec: '3cmx3meter', unit: 'Roll', bc: 'Non BC', kategori: 'Indirect' }],
    entries: [{ id: 'MRO-01-08-247', j: 'MASUK', d: '2026-11-01', q: 3, ref: 'RDI-2610-DMN003', rak: '-', ven: 'DMN', n: 1 }] });
  t('IMP-10 dry: autoPromote terdeteksi (AUTO -> kode asli)', dry.status === 'ok' && dry.autoPromoteCount === 1 && dry.autoPromote[0].autoId === 'AUTO-948FFE61' && dry.autoPromote[0].newId === 'MRO-01-08-247', JSON.stringify(dry));
  t('IMP-10 dry: masukAdd 0 (dedup kena, bukan dobel)', dry.masukAdd === 0 && dry.alreadyExist === 1, JSON.stringify(dry));
  const com = ctx.importExcel({ mode: 'commit', items: [{ id: 'MRO-01-08-247', nama: 'Sticker Felt bludru brand 3M', spec: '3cmx3meter', unit: 'Roll', bc: 'Non BC', kategori: 'Indirect' }],
    entries: [{ id: 'MRO-01-08-247', j: 'MASUK', d: '2026-11-01', q: 3, ref: 'RDI-2610-DMN003', rak: '-', ven: 'DMN', n: 1 }], final: true });
  const mrows = k.getSheetByName('Master_Item').getDataRange().getValues();
  const hasAuto = mrows.some(r => String(r[1]) === 'AUTO-948FFE61');
  const hasReal = mrows.some(r => String(r[1]) === 'MRO-01-08-247');
  const trxRows = k.getSheetByName('Transaksi_Log').getDataRange().getValues();
  const logIds = trxRows.slice(1).map(r => String(r[1]));
  t('IMP-10 commit: ID lama diganti kode asli di master, item baru TIDAK dibuat', com.status === 'ok' && !hasAuto && hasReal && com.itemsNew === 0, JSON.stringify(com));
  t('IMP-10 commit: riwayat log ikut ke kode baru (masih 1 baris MASUK)', logIds.every(x => x === 'MRO-01-08-247') && logIds.length === 1, JSON.stringify(logIds));
})();

(function imp10_promote_item_arsip_tidak_dipromote() {
  const k = kit(
    [[1, 'AUTO-AAA', 'Item X', 'S1', '', '', 'Pcs', 'Indirect', 0, 'Arsip'],
     [2, 'AUTO-BBB', 'Item X', 'S1', '', '', 'Pcs', 'Indirect', 0, 'Aktif']],
    []
  );
  const ctx = loadCodeGS({ spreadsheet: k });
  const dry = ctx.importExcel({ mode: 'dry', items: [{ id: 'MRO-99-01', nama: 'Item X', spec: 'S1' }], entries: [] });
  t('IMP-10: item AUTO yang diarsipkan TIDAK dipromote (yang aktif yang dipakai)', dry.status === 'ok' && dry.autoPromoteCount === 1 && dry.autoPromote[0].autoId === 'AUTO-BBB', JSON.stringify(dry));
})();

(function imp11_alias() {
  /* impor file LAMA lagi: baris tanpa kode -> AUTO-*, padahal master sudah punya kode asli */
  const k = kit(
    [[1, 'MRO-01-08-247', 'Sticker Felt bludru brand 3M', '3cmx3meter', '', 'Non BC', 'Roll', 'Indirect', 0]],
    [['01/11/2026 12:00', 'MRO-01-08-247', 'Sticker Felt bludru brand 3M', '3cmx3meter', 'MASUK', 3, '-', 'DMN', 'RDI-2610-DMN003', 0, 3, 'IMPOR-EXCEL Indirect', 'lama']]
  );
  const ctx = loadCodeGS({ spreadsheet: k });
  const dry = ctx.importExcel({ mode: 'dry', items: [{ id: 'AUTO-948FFE61', nama: 'Sticker Felt bludru brand 3M', spec: '3cmx3meter', unit: 'Roll', kategori: 'Indirect' }],
    entries: [{ id: 'AUTO-948FFE61', j: 'MASUK', d: '2026-11-01', q: 3, ref: 'RDI-2610-DMN003', rak: '-', ven: 'DMN', n: 1 }] });
  t('IMP-11 dry: AUTO dialihkan ke kode master, tidak jadi item baru', dry.status === 'ok' && dry.autoAliasCount === 1 && dry.autoAlias[0].toId === 'MRO-01-08-247' && dry.itemsNew === 0, JSON.stringify(dry));
  t('IMP-11 dry: transaksi dedup kena lewat kode master -> 0 ditambah', dry.masukAdd === 0 && dry.alreadyExist === 1 && dry.unknownCount === 0, JSON.stringify(dry));
})();

(function imp10_alias_dalam_batch_gabung_identik() {
  /* Excel berisi item sama 2 baris: 1 tanpa kode (AUTO), 1 berkode asli, batch sama.
     Aturan "1 baris = 1 batch": total baris DIPERTAHANKAN (n dijumlah), hanya id-nya
     yang menyatu ke kode asli -- tidak ada data yang hilang atau berlipat. */
  const k = kit([], []);
  const ctx = loadCodeGS({ spreadsheet: k });
  const com = ctx.importExcel({ mode: 'commit',
    items: [
      { id: 'MRO-01-08-249', nama: 'Item Z', spec: 'S9', unit: 'Pcs', kategori: 'Indirect' },
      { id: 'AUTO-DEADBEEF', nama: 'Item Z', spec: 'S9', unit: 'Pcs', kategori: 'Indirect' },
    ],
    entries: [
      { id: 'MRO-01-08-249', j: 'MASUK', d: '2026-11-01', q: 3, ref: 'R-1', rak: '-', n: 1 },
      { id: 'AUTO-DEADBEEF', j: 'MASUK', d: '2026-11-01', q: 3, ref: 'R-1', rak: '-', n: 1 },
    ], final: true });
  const rows = k.getSheetByName('Transaksi_Log').getDataRange().getValues().slice(1);
  t('IMP-10: AUTO+asli dalam batch sama menyatu ke kode asli, total 2 baris dipertahankan', com.status === 'ok' && com.masukAdd === 2 && rows.length === 2 && com.itemsNew === 1 && rows.every(r => String(r[1]) === 'MRO-01-08-249'), JSON.stringify(com));
})();

(function imp10_promote_harus_sah_saldo_berjalan() {
  /* riwayat lama item AUTO harus dihitung sebagai kode baru saat menulis Saldo_Sebelum/Sesudah */
  const k = kit(
    [[1, 'AUTO-CAFEBABE', 'Item W', 'S2', '', '', 'Pcs', 'Indirect', 0]],
    [[new Date(2026, 10, 1, 12, 0, 0), 'AUTO-CAFEBABE', 'Item W', 'S2', 'MASUK', 10, '-', '', '', 0, 10, 'IMPOR-EXCEL', 'lama']]
  );
  const ctx = loadCodeGS({ spreadsheet: k });
  const com = ctx.importExcel({ mode: 'commit', items: [{ id: 'MRO-01-08-250', nama: 'Item W', spec: 'S2', unit: 'Pcs', kategori: 'Indirect' }],
    entries: [{ id: 'MRO-01-08-250', j: 'MASUK', d: '2026-11-05', q: 2, ref: 'R-2', rak: '-', n: 1 }], final: true });
  const trx = k.getSheetByName('Transaksi_Log').getDataRange().getValues();
  const baru = trx.find(r => String(r[1]) === 'MRO-01-08-250' && String(r[4]) === 'MASUK' && +r[5] === 2);
  t('IMP-10: saldo berjalan menyambung riwayat lama (sebelum=10, sesudah=12)', com.status === 'ok' && baru && +baru[9] === 10 && +baru[10] === 12, JSON.stringify(trx.slice(1)));
})();

console.log('\nimport_excel_gaps: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
