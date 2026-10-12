/* L1 gs_import_excel_exec — MENGEKSEKUSI importExcel() sungguhan dari Code.gs lewat harness gs_harness.
 * Skenario: dry-run tidak menulis; commit menambah item+transaksi; upload ulang = 0 baris (idempotent);
 * baris kembar sah tetap terhitung; item lama tidak ditimpa; transaksi lama (scanner) tidak digandakan;
 * saldo berjalan kronologis; validasi input; backup gagal = batal total; saldo dihitung ulang di chunk final.
 * CATATAN LEVEL: L1 (mock Sheets/LockService). Tidak membuktikan perilaku GAS/Sheets asli (L3). */
const { loadCodeGS, makeSheet, makeSpreadsheet } = require('../tools/gs_harness.js');
let pass = 0, fail = 0;
function t(name, cond, detail) { if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); } else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); } }

function kit(extraMaster, extraTrx) {
  return makeSpreadsheet([
    makeSheet('Master_Item', [['No', 'ID_Item', 'Nama Material', 'Spesifikasi', 'User', 'BC/Non BC', 'Unit', 'Kategori', 'Min_Stock', 'Status']].concat(extraMaster || [])),
    makeSheet('Transaksi_Log', [['Timestamp', 'ID_Item', 'Nama_Item', 'Spesifikasi', 'Jenis', 'Qty', 'RAK', 'Vendor', 'No_Referensi', 'Saldo_Sebelum', 'Saldo_Sesudah', 'Keterangan', 'Admin']].concat(extraTrx || [])),
    makeSheet('Stok_Saldo', [['ID_Item', 'Nama', 'Unit', 'Total_Masuk', 'Total_Keluar', 'Saldo_Akhir']]),
    makeSheet('Stok_Per_Rak', [['ID_Item', 'RAK', 'Qty']]),
  ]);
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const items = [{ id: 'MRO-01', nama: 'Bearing', spec: '6205', unit: 'Pc', user: '', bc: '', kategori: 'Spare Part' },
  { id: 'MRO-02', nama: 'Bor', spec: '8x70', unit: 'Pc', user: 'MAINT', bc: 'Non BC', kategori: 'Tools' }];
const entries = [
  { id: 'MRO-01', j: 'MASUK', d: '2026-09-01', q: 10, ref: '=INV-1', rak: '-', ven: 'PT A', ket: 'IMPOR-EXCEL Spare Part', n: 1 },
  { id: 'MRO-01', j: 'KELUAR', d: '2026-09-03', q: 4, ref: '', rak: '-', ven: 'PT A', ket: 'IMPOR-EXCEL Spare Part', n: 1 },
  { id: 'MRO-02', j: 'MASUK', d: '2026-09-02', q: 5, ref: 'INV-2', rak: 'A-1', ven: '', ket: 'IMPOR-EXCEL Tools', n: 2 },
];
const tl = (k) => k.getSheetByName('Transaksi_Log');
const nTrx = (k) => tl(k).getLastRow() - 1;
const nMaster = (k) => k.getSheetByName('Master_Item').getLastRow() - 1;

(function dryRun() {
  const k = kit(); const ctx = loadCodeGS({ spreadsheet: k });
  const r = ctx.importExcel({ mode: 'dry', items: clone(items), entries: clone(entries) });
  t('dry: status ok & hitung 2 item baru, 4 MASUK + 1 KELUAR akan ditambah', r.status === 'ok' && r.itemsNew === 2 && r.masukAdd === 3 && r.keluarAdd === 1, JSON.stringify(r));
  t('dry: TIDAK menulis apa pun', nTrx(k) === 0 && nMaster(k) === 0);
})();

(function commitAndIdempotent() {
  const k = kit(); const ctx = loadCodeGS({ spreadsheet: k });
  const r = ctx.importExcel({ mode: 'commit', items: clone(items), entries: clone(entries), final: true, verifiedAdmin: 'budi' });
  t('commit: status ok, item & transaksi bertambah', r.status === 'ok' && nMaster(k) === 2 && nTrx(k) === 4, JSON.stringify(r));
  const rows = tl(k).getRange(2, 1, 4, 13).getValues();
  t('timestamp = tanggal Excel (bukan waktu impor)', rows[0][0] instanceof Date && rows[0][0].getFullYear() === 2026 && rows[0][0].getMonth() === 8 && rows[0][0].getDate() === 1);
  t('baris kembar (n=2) menghasilkan 2 baris MASUK', rows.filter((x) => x[1] === 'MRO-02' && x[4] === 'MASUK').length === 2);
  t('admin = akun terverifikasi; keterangan IMPOR-EXCEL', rows[0][12] === 'budi' && /IMPOR-EXCEL/.test(rows[0][11]));
  t('ref berawalan "=" di-escape (anti formula injection)', String(rows[0][8]).charAt(0) === "'");
  t('saldo berjalan kronologis: MRO-01 MASUK 0->10, KELUAR 10->6', rows[0][9] === 0 && rows[0][10] === 10 && rows[1][9] === 10 && rows[1][10] === 6, JSON.stringify([rows[0].slice(9, 11), rows[1].slice(9, 11)]));
  const sal = k.getSheetByName('Stok_Saldo').getRange(2, 1, 2, 6).getValues();
  t('chunk final: Stok_Saldo dihitung ulang (MRO-01=6, MRO-02=10)', sal.some((x) => x[0] === 'MRO-01' && x[5] === 6) && sal.some((x) => x[0] === 'MRO-02' && x[5] === 10), JSON.stringify(sal));
  const again = ctx.importExcel({ mode: 'commit', items: clone(items), entries: clone(entries), final: true });
  t('upload ulang: 0 baris ditambah, 4 sudah ada (idempotent)', again.status === 'ok' && again.masukAdd === 0 && again.keluarAdd === 0 && again.itemsNew === 0 && again.alreadyExist === 4 && nTrx(k) === 4, JSON.stringify(again));
  const more = clone(entries); more[2].n = 3;
  const inc = ctx.importExcel({ mode: 'commit', items: clone(items), entries: more, final: true });
  t('Excel bertambah 1 baris kembar: hanya selisihnya yang ditambah', inc.masukAdd === 1 && nTrx(k) === 5, JSON.stringify(inc));
})();

(function respectExisting() {
  const old = [new Date(2026, 8, 3, 9, 30), 'MRO-01', 'Bearing LAMA', '6205', 'KELUAR', 4, 'R-9', '', '', 0, 0, 'scan', 'ani'];
  const k = kit([[1, 'MRO-01', 'Bearing LAMA', '6205', 'GUDANG', 'BC', 'Pcs', 'Sparepart', 7, 'Aktif']], [old]);
  const ctx = loadCodeGS({ spreadsheet: k });
  const r = ctx.importExcel({ mode: 'commit', items: clone(items), entries: clone(entries), final: false });
  t('item lama TIDAK ditimpa (nama/kategori/min stock tetap)', k.getSheetByName('Master_Item').getRange(2, 1, 1, 9).getValues()[0].join('|') === '1|MRO-01|Bearing LAMA|6205|GUDANG|BC|Pcs|Sparepart|7', k.getSheetByName('Master_Item').getRange(2, 1, 1, 9).getValues()[0].join('|'));
  t('hanya 1 item baru (MRO-02); KELUAR yg sudah dicatat scanner (tgl+qty sama) tidak digandakan', r.itemsNew === 1 && r.keluarAdd === 0 && r.alreadyExist === 1, JSON.stringify(r));
  const rows = tl(k).getRange(2, 1, tl(k).getLastRow() - 1, 13).getValues();
  const masuk01 = rows.find((x) => x[1] === 'MRO-01' && x[4] === 'MASUK');
  t('nama di log item lama memakai nama Master_Item (bukan nama Excel)', masuk01 && masuk01[2] === 'Bearing LAMA');
  t('saldo berjalan memperhitungkan riwayat lama (MASUK 10 tgl 1 -> sebelum 0, sesudah 10)', masuk01 && masuk01[9] === 0 && masuk01[10] === 10, masuk01 && masuk01.slice(9, 11).join('->'));
})();

(function validation() {
  const k = kit(); const ctx = loadCodeGS({ spreadsheet: k });
  const bad = (patch) => ctx.importExcel(Object.assign({ mode: 'dry', items: clone(items), entries: clone(entries) }, patch));
  t('mode tak dikenal ditolak', bad({ mode: 'drop' }).status === 'error');
  const e1 = clone(entries); e1[0].d = '2026-02-31';
  t('tanggal mustahil ditolak', bad({ entries: e1 }).status === 'error');
  const e2 = clone(entries); e2[0].q = -1;
  t('qty negatif ditolak', bad({ entries: e2 }).status === 'error');
  const e3 = clone(entries); e3[0].j = 'HAPUS';
  t('jenis selain MASUK/KELUAR ditolak', bad({ entries: e3 }).status === 'error');
  const i1 = clone(items); i1[0].id = "X'; DROP";
  t('ID item berkarakter aneh ditolak', bad({ items: i1 }).status === 'error');
  const big = []; for (let i = 0; i < 801; i++) big.push(Object.assign({}, entries[0], { q: i + 1 }));
  t('commit > 800 transaksi per permintaan ditolak', ctx.importExcel({ mode: 'commit', items: clone(items), entries: big }).status === 'error' && nTrx(k) === 0);
  const unk = ctx.importExcel({ mode: 'dry', items: [], entries: clone(entries) });
  t('transaksi item tak dikenal dilewati & dilaporkan (tidak membuat item hantu)', unk.status === 'ok' && unk.masukAdd === 0 && unk.unknownIds.length === 2, JSON.stringify(unk));
})();

(function backupFail() {
  const k = kit(); const ctx = loadCodeGS({ spreadsheet: k }); // mock Sheet tanpa copyTo -> backup gagal
  const r = ctx.importExcel({ mode: 'commit', items: clone(items), entries: clone(entries), backup: true, final: true });
  t('backup gagal -> import dibatalkan total (tidak ada data berubah)', r.status === 'error' && nTrx(k) === 0 && nMaster(k) === 0, JSON.stringify(r));
  const sheet = tl(k); let copied = false;
  sheet.copyTo = (ss) => { copied = true; const s = ss.insertSheet('tmp'); s.setName = (n) => { s._n = n; return s; }; return s; };
  const ok = ctx.importExcel({ mode: 'commit', items: clone(items), entries: clone(entries), backup: true, final: true });
  t('backup sukses -> nama sheet cadangan dilaporkan', ok.status === 'ok' && copied && /^Transaksi_Log_backup_/.test(ok.backupSheet || ''), JSON.stringify(ok));
})();

(function routing() {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../Code.gs'), 'utf8');
  const post = src.slice(src.indexOf('function doPost'));
  t("route 'importExcel' ada di doPost SETELAH gate checkEditorSession_ (editor saja)", post.indexOf('checkEditorSession_(body)') > -1 && post.indexOf("action === 'importExcel'") > post.indexOf('checkEditorSession_(body)'));
  t("importExcel hanya dirutekan SEKALI (tidak ada di doGet / jalur viewer)", (src.match(/return corsOutput\(importExcel\(/g) || []).length === 1);
})();
console.log('\nRingkasan gs_import_excel_exec: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
