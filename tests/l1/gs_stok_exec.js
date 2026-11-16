/* L1 gs_stok_exec — MENGEKSEKUSI invariants saldo Code.gs sungguhan:
 *   Stok_Saldo.Saldo_Akhir = Total_Masuk − Total_Keluar (rebuild dari Transaksi_Log)
 *   Stok_Per_Rak.Qty = delta per rak MASUK/KELUAR
 *   getSaldoFullMap / getRakBreakdown / getRakSummaryMap konsisten dengan sheet
 *   getSheetData mengirim qty sebagai STRING (kontrak yang menjaga UI: kalau number,
 *   escaper pernah membuat sel stok item berstok 0 tampil kosong — lihat ESC-01)
 * stressing: recalculateAllSaldoLocked_ harus mengembalikan saldo yang sama dengan
 * incremental update (yaitu dua jalur perhitungan harus SETUJU). */
const { loadCodeGS, makeSpreadsheet, makeSheet } = require('../tools/gs_harness.js');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
function buildKitchen() {
  return makeSpreadsheet([
    makeSheet('Master_Item', [
      ['No', 'ID_Item', 'Nama Material', 'Spesifikasi', 'User/Dept', 'BC/Non BC', 'Unit', 'Kategori', 'Min_Stock', 'Status'],
      [1, 'MRO-01', 'Bearing 6205', 'Bearing', 'Gudang', 'BC', 'Pcs', 'Sparepart', 10, 'Aktif'],
      [2, 'MRO-02', 'V-Belt B50', 'Belt', 'Gudang', 'NON BC', 'Pcs', 'Consumable', 5, 'Aktif'],
      [3, 'MRO-03', 'O-ring 20', 'Seal', 'Gudang', 'NON BC', 'Pcs', 'Consumable', 8, 'Aktif'],
    ]),
    makeSheet('Transaksi_Log', [['Timestamp', 'ID_Item', 'Nama_Item', 'Spesifikasi', 'Jenis', 'Qty', 'RAK', 'Vendor', 'No_Referensi', 'Saldo_Sebelum', 'Saldo_Sesudah', 'Keterangan', 'Admin']]),
    makeSheet('Stok_Saldo', [['ID_Item', 'Nama', 'Unit', 'Total_Masuk', 'Total_Keluar', 'Saldo_Akhir']]),
    makeSheet('Stok_Per_Rak', [['ID_Item', 'RAK', 'Qty']]),
  ]);
}
function sheetRows(kit, name) {
  const sh = kit.getSheetByName(name);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}
function replay(kit) {
  // hitung ulang dari Transaksi_Log (ground truth independen dari kode produksi)
  const total = {}, perRak = {};
  sheetRows(kit, 'Transaksi_Log').forEach(r => {
    const id = String(r[1]), jenis = String(r[4]).toUpperCase(), qty = parseFloat(r[5]) || 0, rak = String(r[6] || '');
    if (!total[id]) total[id] = { masuk: 0, keluar: 0 };
    if (jenis === 'MASUK') { total[id].masuk += qty; perRak[id + '|' + rak] = (perRak[id + '|' + rak] || 0) + qty; }
    else if (jenis === 'KELUAR') { total[id].keluar += qty; perRak[id + '|' + rak] = (perRak[id + '|' + rak] || 0) - qty; }
  });
  return { total, perRak };
}
function ctxFor(kit) {
  return loadCodeGS({ spreadsheet: kit, props: { EDITOR_KEY: 'EK', VIEWER_TOKEN_SECRET: 'S' } });
}

/* ---------- 1. incremental vs rebuild: dua jalur harus SETUJU ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  // riwayat campur: 3 item, 3 rak, masuk & keluar (ANGKA DISESUAIKAN: KELUAR dari B-01
  // tidak boleh melebihi saldo rak B-01 — percobaan pertama memakai 25 dari stok 20 dan
  // DITOLAK server, itu perilaku benar yang kini jadi assert tersendiri di bawah)
  const ops = [
    ['MRO-01', 'MASUK', 100, 'A-01'], ['MRO-02', 'MASUK', 50, 'A-02'], ['MRO-01', 'KELUAR', 30, 'A-01'],
    ['MRO-01', 'MASUK', 20, 'B-01'], ['MRO-03', 'MASUK', 60, 'B-02'], ['MRO-01', 'KELUAR', 15, 'B-01'],
    ['MRO-02', 'KELUAR', 10, 'A-02'], ['MRO-03', 'KELUAR', 12, 'B-02'], ['MRO-01', 'MASUK', 5, 'A-01'],
  ];
  ops.forEach((o, i) => {
    const r = ctx.postTransaksi({ itemId: o[0], jenis: o[1], qty: o[2], rak: o[3], admin: 'b', requestId: 'r' + i });
    if (r.status !== 'ok') t('set-up transaksi ' + i + ' ok', false, JSON.stringify(r).slice(0, 90));
  });
  t('set-up: 9 transaksi semuanya tersimpan', sheetRows(kit, 'Transaksi_Log').length === 9, 'baris=' + sheetRows(kit, 'Transaksi_Log').length);

  // floor per-rak: KELUAR melebihi saldo rak DITOLAK walau saldo total item cukup
  const floor = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'KELUAR', qty: 999, rak: 'B-01', admin: 'b', requestId: 'floor-1' });
  t('floor per-rak: KELUAR melebihi saldo rak ditolak', floor && floor.status === 'error' && /tidak cukup/i.test(floor.message || ''), JSON.stringify(floor).slice(0, 100));
  t('floor per-rak: penolakan tidak mengubah Stok_Saldo', (sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-01') || [])[5] === 80, 'saldo=' + JSON.stringify((sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-01') || [])[5]));

  // salin hasil incremental
  const incTotal = {}, incRak = {};
  sheetRows(kit, 'Stok_Saldo').forEach(r => { incTotal[String(r[0])] = { masuk: Number(r[3]) || 0, keluar: Number(r[4]) || 0, saldo: Number(r[5]) || 0 }; });
  sheetRows(kit, 'Stok_Per_Rak').forEach(r => { incRak[String(r[0]) + '|' + String(r[1])] = Number(r[2]) || 0; });

  // rebuild penuh
  ctx.recalculateAllSaldoLocked_();
  const rbTotal = {}, rbRak = {};
  sheetRows(kit, 'Stok_Saldo').forEach(r => { rbTotal[String(r[0])] = { masuk: Number(r[3]) || 0, keluar: Number(r[4]) || 0, saldo: Number(r[5]) || 0 }; });
  sheetRows(kit, 'Stok_Per_Rak').forEach(r => { rbRak[String(r[0]) + '|' + String(r[1])] = Number(r[2]) || 0; });

  t('rebuild: Stok_Saldo identik dengan incremental', JSON.stringify(incTotal) === JSON.stringify(rbTotal), 'inc=' + JSON.stringify(incTotal) + ' rb=' + JSON.stringify(rbRak));
  t('rebuild: Stok_Per_Rak identik dengan incremental', JSON.stringify(incRak) === JSON.stringify(rbRak), 'inc=' + JSON.stringify(incRak) + ' rb=' + JSON.stringify(rbRak));

  // bandingkan dengan replay independen (ground truth)
  const rp = replay(kit);
  const expectTotal = {}, expectRak = {};
  Object.keys(rp.total).forEach(id => { expectTotal[id] = { masuk: rp.total[id].masuk, keluar: rp.total[id].keluar, saldo: rp.total[id].masuk - rp.total[id].keluar }; });
  Object.keys(rp.perRak).forEach(k => { if (rp.perRak[k] !== 0) expectRak[k] = rp.perRak[k]; });
  const same = (a, b) => JSON.stringify(Object.keys(a).sort().map(k => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map(k => [k, b[k]]));
  t('saldo sheet = replay independen dari Transaksi_Log', same(rbTotal, expectTotal), 'sheet=' + JSON.stringify(rbTotal) + ' replay=' + JSON.stringify(expectTotal));
  t('saldo per rak sheet = replay independen', same(rbRak, expectRak), 'sheet=' + JSON.stringify(rbRak) + ' replay=' + JSON.stringify(expectRak));
  t('MRO-01: 100+20+5 masuk, 30+15 keluar → saldo 80', rbTotal['MRO-01'] && rbTotal['MRO-01'].saldo === 80, JSON.stringify(rbTotal['MRO-01']));
  t('MRO-01 di 2 rak: A-01 = 75, B-01 = 5', rbRak['MRO-01|A-01'] === 75 && rbRak['MRO-01|B-01'] === 5, JSON.stringify(rbRak));
})();

/* ---------- 2. helper read konsisten dengan sheet ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 40, rak: 'A-01', admin: 'b', requestId: 'h1' });
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'KELUAR', qty: 15, rak: 'A-01', admin: 'b', requestId: 'h2' });
  const map = ctx.getSaldoFullMap();
  t('getSaldoFullMap: MRO-01 = 25', map && map['MRO-01'] && Number(map['MRO-01'].saldo !== undefined ? map['MRO-01'].saldo : map['MRO-01']) === 25, JSON.stringify(map && map['MRO-01']));
  const rb = ctx.getRakBreakdown('MRO-01');
  t('getRakBreakdown: MRO-01 A-01 = 25', Array.isArray(rb) && rb.length === 1 && Number(rb[0].qty) === 25, JSON.stringify(rb));
  const item = ctx.getItemById('MRO-01');
  t('getItemById: status ok + ada rakBreakdown', item && item.status === 'ok' && Array.isArray(item.item.rakBreakdown), JSON.stringify(item && { s: item.status, rb: item.item && item.item.rakBreakdown }));
  t('getItemById: item Arsip tidak bisa (tidak ada di master → error)', ctx.getItemById('TIDAK-ADA').status === 'error', JSON.stringify(ctx.getItemById('TIDAK-ADA')).slice(0, 70));
})();

/* ---------- 3. kontrak tipe data ke client (regression lock ESC-01) ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  ctx.postTransaksi({ itemId: 'MRO-03', jenis: 'MASUK', qty: 5, rak: 'B-02', admin: 'b', requestId: 't1' });
  ctx.postTransaksi({ itemId: 'MRO-03', jenis: 'KELUAR', qty: 5, rak: 'B-02', admin: 'b', requestId: 't2' });
  const res = ctx.getSheetData({});
  const row = res.rows.find(r => r.id === 'MRO-03');
  t('getSheetData: qty berstok 0 dikirim sebagai STRING "0" (bukan number 0)', typeof row.qty === 'string' && row.qty === '0', 'tipe=' + typeof row.qty + ' nilai=' + JSON.stringify(row.qty));
  t('getSheetData: item berstok 0 tetap ikut terkirim (tidak difilter)', !!row, 'ada=' + !!row);
  const hist = ctx.getAllHistory({ limit: 50 });
  const h0 = (hist.rows || []).find(r => String(r.itemId) === 'MRO-03');
  t('getAllHistory: qty & saldoSesudah sebagai String', h0 && typeof h0.qty === 'string' && typeof h0.saldoSesudah === 'string', 'qty=' + typeof h0.qty + ' saldo=' + typeof (h0 && h0.saldoSesudah));
})();

/* ---------- 4. addItem membuat transaksi stok awal ---------- */
(function () {
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  const r = ctx.addItem({ nama: 'Item Baru Uji', spec: 'Spec uji', unit: 'Pcs', kategori: 'Sparepart', qty: 12, rak: 'C-01', minStock: 3, admin: 'b' });
  t('addItem berhasil', r && r.status === 'ok', JSON.stringify(r).slice(0, 120));
  const newId = r.id || (r.item && r.item.id);
  t('addItem mengembalikan ID baru', !!newId, 'id=' + newId);
  const trx = sheetRows(kit, 'Transaksi_Log');
  t('addItem dengan qty>0 membuat transaksi MASUK stok awal', trx.length === 1 && String(trx[0][4]).toUpperCase() === 'MASUK' && Number(trx[0][5]) === 12, JSON.stringify(trx[0]).slice(0, 130));
  const sal = sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === newId);
  t('addItem mencatat saldo awal 12', sal && Number(sal[5]) === 12, JSON.stringify(sal));
  const d = ctx.addItem({ nama: '', unit: 'Pcs', admin: 'b' });
  t('addItem tanpa nama ditolak', d && d.status === 'error', JSON.stringify(d).slice(0, 80));
})();

/* ---------- 5. v5.32 fallback lokasi: item tanpa/parsial rekaman rak ---------- */
(function () {
  // MRO-02 = item "fallback": stok 10 dari MASUK lama tanpa RAK (data migrasi),
  // Stok_Saldo konsisten dengan log, TIDAK ada baris Stok_Per_Rak.
  const kit = buildKitchen();
  kit.getSheetByName('Transaksi_Log').getRange(2, 1, 1, 13).setValues([['2026-01-01', 'MRO-02', 'V-Belt B50', 'Belt', 'MASUK', 10, '', '', '', '', 10, 'stok awal migrasi', 'b']]);
  kit.getSheetByName('Stok_Saldo').getRange(2, 1, 1, 6).setValues([['MRO-02', 'V-Belt B50', 'Pcs', 10, 0, 10]]);
  const ctx = ctxFor(kit);

  const ok = ctx.postTransaksi({ itemId: 'MRO-02', jenis: 'KELUAR', qty: 4, rak: 'F-01', admin: 'b', requestId: 'fb1' });
  t('fallback: KELUAR item tanpa rekaman rak DITERIMA (validasi saldo total)', ok && ok.status === 'ok', JSON.stringify(ok).slice(0, 120));
  t('fallback: Stok_Saldo MRO-02 turun 10 -> 6', (sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-02') || [])[5] === 6, JSON.stringify(sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-02')));
  t('fallback: TIDAK menulis Stok_Per_Rak', sheetRows(kit, 'Stok_Per_Rak').length === 0, JSON.stringify(sheetRows(kit, 'Stok_Per_Rak')));
  const lg = sheetRows(kit, 'Transaksi_Log');
  t('fallback: log mencatat rak yang diketik operator', lg.length === 2 && String(lg[1][6]) === 'F-01', JSON.stringify(lg[1] || []).slice(0, 130));

  const over = ctx.postTransaksi({ itemId: 'MRO-02', jenis: 'KELUAR', qty: 99, rak: 'F-01', admin: 'b', requestId: 'fb2' });
  t('fallback: KELUAR melebihi saldo total DITOLAK', over && over.status === 'error' && /tidak cukup/i.test(over.message || ''), JSON.stringify(over).slice(0, 110));

  const pin = ctx.postTransaksi({ itemId: 'MRO-02', jenis: 'PINDAH', qty: 2, rak: 'G-02', rakAsal: 'F-01', admin: 'b', requestId: 'fb3' });
  t('fallback: PINDAH dari rak tak terekam DITERIMA', pin && pin.status === 'ok', JSON.stringify(pin).slice(0, 120));
  const rakRows = sheetRows(kit, 'Stok_Per_Rak');
  t('fallback PINDAH: rak tujuan terekam (G-02 = 2), rak asal tidak dibuat', rakRows.length === 1 && String(rakRows[0][1]) === 'G-02' && Number(rakRows[0][2]) === 2, JSON.stringify(rakRows));
  t('fallback PINDAH: total saldo item tidak berubah (6)', (sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-02') || [])[5] === 6, '');

  const salBefore = (sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-02') || []).slice(3).map(Number);
  const rakBefore = {};
  sheetRows(kit, 'Stok_Per_Rak').forEach(r => { rakBefore[String(r[0]) + '|' + String(r[1])] = Number(r[2]) || 0; });
  ctx.recalculateAllSaldoLocked_();
  const salAfter = (sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-02') || []).slice(3).map(Number);
  const rakAfter = {};
  sheetRows(kit, 'Stok_Per_Rak').forEach(r => { rakAfter[String(r[0]) + '|' + String(r[1])] = Number(r[2]) || 0; });
  t('fallback: rebuild Stok_Saldo identik dengan incremental', JSON.stringify(salBefore) === JSON.stringify(salAfter), 'inc=' + JSON.stringify(salBefore) + ' rb=' + JSON.stringify(salAfter));
  t('fallback: rebuild Stok_Per_Rak identik dengan incremental (tanpa baris negatif)', JSON.stringify(rakBefore) === JSON.stringify(rakAfter), 'inc=' + JSON.stringify(rakBefore) + ' rb=' + JSON.stringify(rakAfter));
})();

(function () {
  // item "parsial": MASUK A-01 10 terekam + 5 unit migrasi tanpa rak -> total 15, breakdown 10
  const kit = buildKitchen();
  const ctx = ctxFor(kit);
  ctx.postTransaksi({ itemId: 'MRO-03', jenis: 'MASUK', qty: 10, rak: 'A-01', admin: 'b', requestId: 'p0' });
  kit.getSheetByName('Transaksi_Log').getRange(3, 1, 1, 13).setValues([['2026-01-01', 'MRO-03', 'O-ring 20', 'Seal', 'MASUK', 5, '', '', '', '', 5, 'stok migrasi tanpa rak', 'b']]);
  kit.getSheetByName('Stok_Saldo').getRange(2, 1, 1, 6).setValues([['MRO-03', 'O-ring 20', 'Pcs', 15, 0, 15]]);

  const ok = ctx.postTransaksi({ itemId: 'MRO-03', jenis: 'KELUAR', qty: 4, rak: 'B-02', admin: 'b', requestId: 'p1' });
  t('parsial: KELUAR dari rak tak terekam DITERIMA (sisa tak terekam cukup)', ok && ok.status === 'ok', JSON.stringify(ok).slice(0, 120));
  let rakRows = sheetRows(kit, 'Stok_Per_Rak');
  t('parsial: rak B-02 tidak dibuat, A-01 tetap 10', rakRows.length === 1 && String(rakRows[0][1]) === 'A-01' && Number(rakRows[0][2]) === 10, JSON.stringify(rakRows));
  t('parsial: saldo total 15 -> 11', (sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-03') || [])[5] === 11, '');

  const ok2 = ctx.postTransaksi({ itemId: 'MRO-03', jenis: 'KELUAR', qty: 3, rak: 'A-01', admin: 'b', requestId: 'p2' });
  t('parsial: KELUAR dari rak TEREKAM tetap jalan (saldo rak cukup)', ok2 && ok2.status === 'ok', JSON.stringify(ok2).slice(0, 120));
  rakRows = sheetRows(kit, 'Stok_Per_Rak');
  t('parsial: A-01 turun 10 -> 7', rakRows.length === 1 && Number(rakRows[0][2]) === 7, JSON.stringify(rakRows));

  const over = ctx.postTransaksi({ itemId: 'MRO-03', jenis: 'KELUAR', qty: 8, rak: 'A-01', admin: 'b', requestId: 'p3' });
  t('parsial: KELUAR melebihi saldo rak TEREKAM tetap DITOLAK (strict)', over && over.status === 'error' && /tidak cukup/i.test(over.message || ''), JSON.stringify(over).slice(0, 110));

  const rakBefore = {};
  sheetRows(kit, 'Stok_Per_Rak').forEach(r => { rakBefore[String(r[0]) + '|' + String(r[1])] = Number(r[2]) || 0; });
  const salBefore = (sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-03') || []).slice(3).map(Number);
  ctx.recalculateAllSaldoLocked_();
  const rakAfter = {};
  sheetRows(kit, 'Stok_Per_Rak').forEach(r => { rakAfter[String(r[0]) + '|' + String(r[1])] = Number(r[2]) || 0; });
  const salAfter = (sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-03') || []).slice(3).map(Number);
  t('parsial: rebuild Stok_Saldo identik dengan incremental', JSON.stringify(salBefore) === JSON.stringify(salAfter), 'inc=' + JSON.stringify(salBefore) + ' rb=' + JSON.stringify(salAfter));
  t('parsial: rebuild Stok_Per_Rak identik dengan incremental', JSON.stringify(rakBefore) === JSON.stringify(rakAfter), 'inc=' + JSON.stringify(rakBefore) + ' rb=' + JSON.stringify(rakAfter));
})();

(function () {
  // item dengan baris rak "-" negatif (sampah rebuild lama): KELUAR dari "-" harus bisa
  // dan rebuild harus MEMBUANG baris negatif itu, bukan menambah baris baru.
  const kit = buildKitchen();
  kit.getSheetByName('Transaksi_Log').getRange(2, 1, 1, 13).setValues([['2026-01-01', 'MRO-01', 'Bearing 6205', 'Bearing', 'MASUK', 8, '', '', '', '', 8, 'stok awal migrasi', 'b']]);
  kit.getSheetByName('Stok_Saldo').getRange(2, 1, 1, 6).setValues([['MRO-01', 'Bearing 6205', 'Pcs', 8, 0, 8]]);
  kit.getSheetByName('Stok_Per_Rak').getRange(2, 1, 1, 3).setValues([['MRO-01', '-', -5]]);
  const ctx = ctxFor(kit);

  const ok = ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'KELUAR', qty: 3, rak: '-', admin: 'b', requestId: 'n1' });
  t('negatif "-": KELUAR dari rak placeholder DITERIMA (validasi total)', ok && ok.status === 'ok', JSON.stringify(ok).slice(0, 120));
  t('negatif "-": Stok_Saldo 8 -> 5', (sheetRows(kit, 'Stok_Saldo').find(r => String(r[0]) === 'MRO-01') || [])[5] === 5, '');
  t('negatif "-": baris lama tidak disentuh incremental (masih -5)', JSON.stringify(sheetRows(kit, 'Stok_Per_Rak')) === JSON.stringify([['MRO-01', '-', -5]]), JSON.stringify(sheetRows(kit, 'Stok_Per_Rak')));

  ctx.recalculateAllSaldoLocked_();
  const rakRows = sheetRows(kit, 'Stok_Per_Rak');
  t('negatif "-": rebuild MEMBUANG baris keluar-saja (tidak ada baris negatif baru)', rakRows.length === 0, JSON.stringify(rakRows));
  const lg = sheetRows(kit, 'Transaksi_Log');
  t('negatif "-": log tetap mencatat RAK "-" (safeCell_ menambah apostrof)', lg.length === 2 && String(lg[1][6]) === "'-", JSON.stringify(lg[1] || []).slice(0, 130));
})();

console.log('---- gs_stok_exec: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
