/* L1 pindah_rak — v5.31: jenis transaksi PINDAH (revisi posisi rak pasca-masuk).
 * Eksekusi postTransaksi() + recalculateAllSaldoCore() sungguhan dari Code.gs
 * lewat harness gs_harness (dapur Master_Item + Transaksi_Log + Stok_Saldo + Stok_Per_Rak).
 * Skenario:
 *   - PINDAH: saldo total TIDAK berubah, Stok_Per_Rak pindah asal→tujuan
 *   - Saldo_Sebelum/Sesudah baris log = saldo total (tidak berubah oleh pindah)
 *   - Keterangan baris PINDAH = "PINDAH DARI: <asal>" (format tetap utk recount)
 *   - PINDAH > saldo rak ASAL ditolak (meski saldo total cukup)
 *   - PINDAH tanpa rakAsal / asal==tujuan ditolak
 *   - PINDAH item Arsip ditolak
 *   - idempotensi requestId: retry PINDAH sama tidak dobel
 *   - recount: baris PINDAH tidak mengubah Total_Masuk/Keluar; rak asal/tujuan benar
 *   - recount: baris PINDAH tanpa asal ter-parse dilewati (tanpa rak hantu)
 * CATATAN LEVEL: L1 deterministik (offline). Tidak menguji race GAS / LockService asli. */
const { loadCodeGS, makeSpreadsheet, makeSheet } = require('../tools/gs_harness.js');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}

function buildKitchen(opts) {
  const o = opts || {};
  const master = makeSheet('Master_Item', [
    ['No', 'ID_Item', 'Nama Material', 'Spesifikasi', 'User/Dept', 'BC/Non BC', 'Unit', 'Kategori', 'Min_Stock', 'Status'],
    [1, 'MRO-01', 'Bearing 6205', 'Bearing industri', 'Gudang', 'BC', 'Pcs', 'Sparepart', 10, o.arsip ? 'Arsip' : 'Aktif'],
    [2, 'MRO-02', 'V-Belt B50', 'Timing belt', 'Gudang', 'NON BC', 'Pcs', 'Consumable', 5, 'Aktif'],
  ]);
  const trx = makeSheet('Transaksi_Log', [
    ['Timestamp', 'ID_Item', 'Nama_Item', 'Spesifikasi', 'Jenis', 'Qty', 'RAK', 'Vendor', 'No_Referensi', 'Saldo_Sebelum', 'Saldo_Sesudah', 'Keterangan', 'Admin'],
  ]);
  const saldo = makeSheet('Stok_Saldo', [
    ['ID_Item', 'Nama', 'Unit', 'Total_Masuk', 'Total_Keluar', 'Saldo_Akhir'],
  ]);
  const rak = makeSheet('Stok_Per_Rak', [
    ['ID_Item', 'RAK', 'Qty'],
  ]);
  return makeSpreadsheet([master, trx, saldo, rak]);
}
function ctxFor(kitchen) {
  return loadCodeGS({ spreadsheet: kitchen, props: { EDITOR_KEY: 'TEST-EDITOR-KEY', VIEWER_TOKEN_SECRET: 'test-token-secret' } });
}
function trxCount(kit) { return kit.getSheetByName('Transaksi_Log').getLastRow() - 1; }
function saldoOf(kit, id) {
  const sh = kit.getSheetByName('Stok_Saldo');
  const v = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), 6).getValues();
  const row = v.find(r => String(r[0]) === id);
  return row ? { masuk: row[3], keluar: row[4], saldo: row[5] } : null;
}
function rakRows(kit, id) {
  const sh = kit.getSheetByName('Stok_Per_Rak');
  const v = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), 3).getValues();
  const map = {};
  v.filter(r => String(r[0]) === id).forEach(r => { map[String(r[1])] = Number(r[2]); });
  return map;
}
function logRow(kit, n) { /* baris ke-n (1-based) transaksi terakhir */
  return kit.getSheetByName('Transaksi_Log').getRange(1 + n, 1, 1, 13).getValues()[0];
}
function seed(kit, ctx) {
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 20, rak: 'A-01', admin: 'budi', requestId: 'sd-1' });
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 30, rak: 'B-01', admin: 'budi', requestId: 'sd-2' });
}

/* ---------- 1. PINDAH valid: total tetap, rak pindah ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  seed(kit, ctx);
  const res = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'PINDAH', qty: 5, rak: 'B-01', rakAsal: 'A-01', admin: 'budi', requestId: 'rp-1' });
  t('PINDAH berhasil (status ok)', res && res.status === 'ok', JSON.stringify(res));
  t('PINDAH tidak mengubah saldo total (50/0/50)', JSON.stringify(saldoOf(kit, 'MRO-01')) === JSON.stringify({ masuk: 50, keluar: 0, saldo: 50 }), JSON.stringify(saldoOf(kit, 'MRO-01')));
  t('PINDAH: rak asal A-01 tinggal 15', rakRows(kit, 'MRO-01')['A-01'] === 15, JSON.stringify(rakRows(kit, 'MRO-01')));
  t('PINDAH: rak tujuan B-01 jadi 35', rakRows(kit, 'MRO-01')['B-01'] === 35, JSON.stringify(rakRows(kit, 'MRO-01')));
  const row = logRow(kit, trxCount(kit));
  t('Log PINDAH: jenis & rak = tujuan', row[4] === 'PINDAH' && String(row[6]) === 'B-01', 'jenis=' + row[4] + ' rak=' + row[6]);
  t('Log PINDAH: keterangan = PINDAH DARI: A-01', String(row[11]).indexOf('PINDAH DARI: A-01') === 0, 'ket=' + row[11]);
  t('Log PINDAH: Saldo_Sebelum/Sesudah = total, tak berubah', row[9] === 50 && row[10] === 50, 'sebelum=' + row[9] + ' sesudah=' + row[10]);
  t('PINDAH tidak memanggil updateSaldo (Stok_Saldo 1 baris tetap)', kit.getSheetByName('Stok_Saldo').getLastRow() === 2, 'lastRow=' + kit.getSheetByName('Stok_Saldo').getLastRow());
})();

/* ---------- 2. PINDAH > saldo rak asal ditolak (meski total cukup) ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  seed(kit, ctx);
  const res = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'PINDAH', qty: 25, rak: 'B-01', rakAsal: 'A-01', admin: 'budi', requestId: 'rp-2' });
  t('PINDAH > saldo rak asal DITOLAK', res && res.status === 'error' && /rak/i.test(res.message || ''), JSON.stringify(res));
  t('Ditolak: tidak ada baris log baru', trxCount(kit) === 2, 'baris=' + trxCount(kit));
  t('Ditolak: saldo rak tidak berubah', rakRows(kit, 'MRO-01')['A-01'] === 20 && rakRows(kit, 'MRO-01')['B-01'] === 30, JSON.stringify(rakRows(kit, 'MRO-01')));
})();

/* ---------- 3. Validasi input PINDAH ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  seed(kit, ctx);
  const r1 = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'PINDAH', qty: 5, rak: 'B-01', admin: 'budi', requestId: 'rp-3a' });
  t('PINDAH tanpa rakAsal ditolak', r1 && r1.status === 'error' && /asal/i.test(r1.message || ''), JSON.stringify(r1));
  const r2 = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'PINDAH', qty: 5, rak: 'A-01', rakAsal: 'A-01', admin: 'budi', requestId: 'rp-3b' });
  t('PINDAH asal==tujuan ditolak', r2 && r2.status === 'error' && /berbeda/i.test(r2.message || ''), JSON.stringify(r2));
  const r3 = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'PINDAH', qty: 0, rak: 'B-01', rakAsal: 'A-01', admin: 'budi', requestId: 'rp-3c' });
  t('PINDAH qty 0 ditolak', r3 && r3.status === 'error', JSON.stringify(r3));
  t('Semua ditolak: log tetap 2 baris', trxCount(kit) === 2, 'baris=' + trxCount(kit));
})();

/* ---------- 4. PINDAH item Arsip ditolak ---------- */
(function () {
  const kit = buildKitchen({ arsip: true });
  const ctx = ctxFor(kit);
  const res = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'PINDAH', qty: 5, rak: 'B-01', rakAsal: 'A-01', admin: 'budi', requestId: 'rp-4' });
  t('PINDAH item Arsip ditolak', res && res.status === 'error' && /arsip/i.test(res.message || ''), JSON.stringify(res));
})();

/* ---------- 5. Idempotensi requestId PINDAH ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  seed(kit, ctx);
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'PINDAH', qty: 5, rak: 'B-01', rakAsal: 'A-01', admin: 'budi', requestId: 'rp-5' });
  const res = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'PINDAH', qty: 5, rak: 'B-01', rakAsal: 'A-01', admin: 'budi', requestId: 'rp-5' });
  t('Retry requestId sama: status ok', res && res.status === 'ok', JSON.stringify(res));
  t('Retry requestId sama: tidak dobel (log 3 baris)', trxCount(kit) === 3, 'baris=' + trxCount(kit));
  t('Retry requestId sama: rak A-01 tetap 15', rakRows(kit, 'MRO-01')['A-01'] === 15, JSON.stringify(rakRows(kit, 'MRO-01')));
})();

/* ---------- 6. Recount: PINDAH tidak mengubah total; rak benar ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  seed(kit, ctx);
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'PINDAH', qty: 5, rak: 'B-01', rakAsal: 'A-01', admin: 'budi', requestId: 'rp-6' });
  const r = ctx.recalculateAllSaldoCore();
  t('Recount ok', r && r.ok === true, JSON.stringify(r));
  t('Recount: Total_Masuk/Keluar tetap 50/0 (PINDAH tidak dihitung)', JSON.stringify(saldoOf(kit, 'MRO-01')) === JSON.stringify({ masuk: 50, keluar: 0, saldo: 50 }), JSON.stringify(saldoOf(kit, 'MRO-01')));
  t('Recount: A-01=15, B-01=35', rakRows(kit, 'MRO-01')['A-01'] === 15 && rakRows(kit, 'MRO-01')['B-01'] === 35, JSON.stringify(rakRows(kit, 'MRO-01')));
})();

/* ---------- 7. Recount: baris PINDAH tanpa asal dilewati (tanpa rak hantu) ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  seed(kit, ctx);
  /* baris PINDAH rusak: keterangan tanpa "PINDAH DARI:" — harus dilewati recount,
     TIDAK boleh menggelembungkan rak di kolom RAK */
  kit.getSheetByName('Transaksi_Log').appendRow([new Date(), 'MRO-01', 'Bearing 6205', 'Bearing industri', 'PINDAH', 7, 'C-99', '', '', 50, 50, 'xx', 'budi']);
  const r = ctx.recalculateAllSaldoCore();
  t('Recount ok dgn baris PINDAH rusak', r && r.ok === true, JSON.stringify(r));
  t('Recount: rak hantu C-99 tidak dibuat', rakRows(kit, 'MRO-01')['C-99'] === undefined, JSON.stringify(rakRows(kit, 'MRO-01')));
  t('Recount: A-01=20, B-01=30 (baris rusak diabaikan)', rakRows(kit, 'MRO-01')['A-01'] === 20 && rakRows(kit, 'MRO-01')['B-01'] === 30, JSON.stringify(rakRows(kit, 'MRO-01')));
  t('Recount: total tetap 50/0', JSON.stringify(saldoOf(kit, 'MRO-01')) === JSON.stringify({ masuk: 50, keluar: 0, saldo: 50 }), JSON.stringify(saldoOf(kit, 'MRO-01')));
})();

/* ---------- 8. PINDAH parsial: pindah sebagian stok rak ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  seed(kit, ctx);
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'PINDAH', qty: 3, rak: 'C-01', rakAsal: 'A-01', admin: 'budi', requestId: 'rp-8' });
  t('Pindah parsial: A-01 tinggal 17', rakRows(kit, 'MRO-01')['A-01'] === 17, JSON.stringify(rakRows(kit, 'MRO-01')));
  t('Pindah parsial: C-01 (rak baru) = 3', rakRows(kit, 'MRO-01')['C-01'] === 3, JSON.stringify(rakRows(kit, 'MRO-01')));
  t('Pindah parsial: total tetap 50/0/50', JSON.stringify(saldoOf(kit, 'MRO-01')) === JSON.stringify({ masuk: 50, keluar: 0, saldo: 50 }), JSON.stringify(saldoOf(kit, 'MRO-01')));
})();

/* ---------- 9. LOCK versi: API_VERSION/API_BUILD v5.31 ---------- */
const fs = require('fs');
const path = require('path');
const gs = fs.readFileSync(path.join(__dirname, '..', '..', 'Code.gs'), 'utf8');
t('LOCK-P1: API_VERSION = v5.31', /var API_VERSION = 'v5\.31'/.test(gs));
t('LOCK-P2: API_BUILD = 2026-11-12.2', /var API_BUILD\s*=\s*'2026-11-12\.2'/.test(gs));
t('LOCK-P3: postTransaksi menerima PINDAH', /jenis!=='MASUK'&&jenis!=='KELUAR'&&jenis!=='PINDAH'/.test(gs));
t('LOCK-P4: recount parse format PINDAH DARI:', /PINDAH DARI:/.test(gs));

console.log('PASS | pindah_rak | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
