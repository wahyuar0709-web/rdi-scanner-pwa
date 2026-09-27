/* L1 gs_audit_exec — AUDIT LOG (BE-03,PLAN §15). Dijalankan sungguhan lewat harness.
 *
 * EMAS (kenapa fitur ini baru berarti sekarang): sebelum F5-AUTH, semua editor berbagi satu
 * kunci sehingga kolom `admin` selalu "Admin" — log yang menulis "Admin melakukan X" tidak
 * berguna. Sekarang SETIAP actionsulis terikat ke username + nama + role orang nyata, jadi
 * audit log akhirnya bisa dipertanggungjawabkan.
 *
 * Aturan yang diuji:
 *  1) Sheet Audit_Log dibuat otomatis dengan header yang benar
 *  2) Setiap action tulis yang berhasil -> 1 baris: username, nama, role, action, ringkasan
 *  3) Penolakan write oleh viewer AKUN TUA -> TIDAK ditulis ke log (cecah, bisa di-flood),
 *      tapi request TANPA token juga tidak (penyerang bisa membanjiri)
 *  4) Login BERHASIL & GAGAL dicatat (kegagalan penting untuk deteksi brute force)
 *  5) Password / editorKey / token TIDAK PERNAH masuk log (rahasia)
 *  6) Formula-injection guard (safeCell_) dipakai pada kolom teks
 *  7) Kegagalan menulis log TIDAK BOLEH menggagalkan write bisnis (try/catch, fail-open
 *      untuk log, fail-closed untuk data)
 *  8) Action BACA tidak dicatat (log jadi bising & mahal)
 */
const { loadCodeGS, makeSpreadsheet, makeSheet } = require('../tools/gs_harness.js');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
const SECRET = 'audit-secret';
const ACC_HDR = ['Username', 'Nama', 'PasswordHash', 'Role', 'Aktif', 'PasswordVersion', 'Catatan'];
const LOG_HDR = ['Timestamp', 'Username', 'Nama', 'Role', 'Aksi', 'Ringkasan', 'Hasil'];

function ctxWith(accounts, opts) {
  opts = opts || {};
  const sheets = [
    makeSheet('Master_Item', [['No', 'ID_Item', 'Nama Material', 'Spesifikasi', 'User/Dept', 'BC/Non BC', 'Unit', 'Kategori', 'Min_Stock'],
      ['1', 'UJI-001', 'Item Uji Audit', '-', 'x', 'Non BC', 'Pcs', 'Sparepart', 0]]),
    makeSheet('Transaksi_Log', [['Timestamp', 'ID_Item', 'Nama_Item', 'Spesifikasi', 'Jenis', 'Qty', 'RAK', 'Vendor', 'No_Referensi', 'Saldo_Sesudah', 'Masuk', 'Sumber', 'Admin']]),
    makeSheet('Stok_Saldo', [['ID_Item', 'Nama', 'Unit', 'Total_Masuk', 'Total_Keluar', 'Saldo_Akhir']]),
    makeSheet('Stok_Per_Rak', [['ID_Item', 'RAK', 'Qty']]),
    makeSheet('RDI_Accounts', [ACC_HDR].concat(accounts || [])),
  ];
  const props = { VIEWER_TOKEN_SECRET: SECRET };
  if (opts.editorKey) props.EDITOR_KEY = opts.editorKey;
  return loadCodeGS({ spreadsheet: makeSpreadsheet(sheets), kdfIterations: 1000, props: props });
}
function readLog(ctx) {
  try {
    const ss = ctx.SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('Audit_Log');
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  } catch (e) { return []; }
}
function setupAccounts() {
  const seed = ctxWith([]);
  return {
    hEditor: seed.makeSaltedPasswordHash_('EditorPass123!'),
    hViewer: seed.makeSaltedPasswordHash_('ViewerPass123!'),
  };
}

/* ---------- 1. header sheet dibuat otomatis ---------- */
(function () {
  const { hEditor } = setupAccounts();
  const ctx = ctxWith([['wahyu', 'Wahyu Susanto', hEditor, 'editor', 'TRUE', 1, '']]);
  const ok = ctx.logAudit_({ username: 'wahyu', nama: 'Wahyu Susanto', role: 'editor' }, 'testAction', { qty: 1 }, 'ok');
  const ss = ctx.SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Audit_Log');
  t('A1: sheet Audit_Log dibuat otomatis saat logging', !!sh, sh ? 'lastRow=' + sh.getLastRow() : 'sheet tidak ada');
  if (sh) {
    const hdr = sh.getRange(1, 1, 1, 7).getValues()[0].map(String);
    t('A2: header Audit_Log benar', JSON.stringify(hdr) === JSON.stringify(LOG_HDR), hdr.join(','));
  }
  t('A3: logAudit_ mengembalikan sukses', ok === true, 'ret=' + ok);
})();

/* ---------- 2. write oleh editor tercatat dengan identitas ---------- */
(function () {
  const { hEditor, hViewer } = setupAccounts();
  const ctx = ctxWith([
    ['wahyu', 'Wahyu Susanto', hEditor, 'editor', 'TRUE', 1, ''],
    ['gudang01', 'Operator Gudang 01', hViewer, 'viewer', 'TRUE', 1, ''],
  ]);
  const eTok = ctx.apiLogin({ username: 'wahyu', password: 'EditorPass123!' }).token;
  const vTok = ctx.apiLogin({ username: 'gudang01', password: 'ViewerPass123!' }).token;

  // A) write nyata lewat doPost -> harus tercatat
  ctx.__lastSheet = null;
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ action: 'postTransaksi', editorKey: eTok, itemId: 'UJI-001', nama: 'Item Uji Audit', jenis: 'MASUK', qty: 5, rak: 'A-01', requestId: 'req-audit-1' }) } });
  const parsed = parseOut(out);
  t('A4: postTransaksi oleh editor berhasil', parsed && parsed.status === 'ok', JSON.stringify(parsed).slice(0, 100));
  const rows = readLog(ctx);
  t('A5: write tercatat di Audit_Log', rows.length >= 1, 'baris=' + rows.length);
  if (rows.length) {
    const last = rows[rows.length - 1];
    t('A6: username tercatat (identitas nyata)', last[1] === 'wahyu', 'username=' + last[1]);
    t('A7: nama tercatat', last[2] === 'Wahyu Susanto', 'nama=' + last[2]);
    t('A8: role tercatat', last[3] === 'editor', 'role=' + last[3]);
    t('A9: aksi tercatat', last[4] === 'postTransaksi', 'aksi=' + last[4]);
    t('A10: ringkasan memuat info berguna (id+qty)', /UJI-001/.test(String(last[5])) && /5/.test(String(last[5])), 'ringkas=' + String(last[5]).slice(0, 80));
  }
  const trx = readSheet(ctx, 'Transaksi_Log');
  const trxAdmin = trx.length ? String(trx[trx.length - 1][12]) : '';
  t('A11: kolom Admin di transaksi = nama orang (bukan "Admin")', trxAdmin === 'Wahyu Susanto', 'admin=' + trxAdmin);

  // B) viewer mencoba write -> ditolak DAN tidak dicatat (anti-flood)
  const before = readLog(ctx).length;
  const out2 = ctx.doPost({ postData: { contents: JSON.stringify({ action: 'postTransaksi', viewerToken: vTok, itemId: 'UJI-001', qty: 1, requestId: 'req-audit-2' }) } });
  const p2 = parseOut(out2);
  t('A12: viewer tidak bisa write', p2 && p2.status === 'error', JSON.stringify(p2).slice(0, 90));
  t('A13: request viewer TIDAK membanjiri audit log', readLog(ctx).length === before, 'sebelum=' + before + ' sesudah=' + readLog(ctx).length);

  // C) action BACA tidak dicatat
  const beforeRead = readLog(ctx).length;
  ctx.doPost({ postData: { contents: JSON.stringify({ action: 'getData', viewerToken: vTok }) } });
  t('A14: action baca tidak dicatat (log tetap ringkas)', readLog(ctx).length === beforeRead, 'sebelum=' + beforeRead + ' sesudah=' + readLog(ctx).length);
})();

/* ---------- 3. login dicatat (sukses & gagal) ---------- */
(function () {
  const { hEditor, hViewer } = setupAccounts();
  const ctx = ctxWith([['wahyu', 'Wahyu Susanto', hEditor, 'editor', 'TRUE', 1, '']]);
  ctx.apiLogin({ username: 'wahyu', password: 'EditorPass123!' });
  let rows = readLog(ctx);
  t('A15: login SUKSES dicatat', rows.some(r => r[4] === 'login' && r[1] === 'wahyu'), 'rows=' + rows.length);
  ctx.apiLogin({ username: 'wahyu', password: 'SalahBanget123!' });
  rows = readLog(ctx);
  const gagal = rows.filter(r => r[4] === 'login' && r[6] === 'gagal');
  t('A16: login GAGAL dicatat (deteksi brute force)', gagal.length >= 1, 'baris gagal=' + gagal.length);
  t('A17: baris login gagal TIDAK membocorkan password', rows.every(r => !/SalahBanget/.test(JSON.stringify(r))), 'aman');
  ctx.apiLogout({ token: 'x.y' });
  t('A18: logout dicatat', readLog(ctx).some(r => r[4] === 'logout'), '');
})();

/* ---------- 4. keamanan: rahasia tidak pernah masuk log ---------- */
(function () {
  const { hEditor } = setupAccounts();
  const ctx = ctxWith([['wahyu', 'Wahyu Susanto', hEditor, 'editor', 'TRUE', 1, '']], { editorKey: 'RAHASIA-SHARING-KEY' });
  const eTok = ctx.apiLogin({ username: 'wahyu', password: 'EditorPass123!' }).token;
  ctx.doPost({ postData: { contents: JSON.stringify({ action: 'postTransaksi', editorKey: eTok, password: 'JANGANLOGINI', itemId: 'UJI-001', qty: 1, requestId: 'r3' }) } });
  const all = JSON.stringify(readLog(ctx));
  t('A19: password dari body tidak masuk audit log', !/JANGANLOGINI/.test(all), '');
  t('A20: token tidak masuk audit log', !/jti-/.test(all) && all.indexOf(eTok) < 0, '');
  t('A21: kunci shared tidak masuk audit log', !/RAHASIA-SHARING-KEY/.test(all), '');
  t('A22: hash password tidak masuk audit log', all.indexOf(hEditor) < 0, '');
})();

/* ---------- 5. formula-injection guard ---------- */
(function () {
  const { hEditor } = setupAccounts();
  const ctx = ctxWith([['wahyu', 'Wahyu Susanto', hEditor, 'editor', 'TRUE', 1, '']]);
  ctx.logAudit_({ username: 'wahyu', nama: 'Wahyu', role: 'editor' }, 'updateItem', { nama: '=IMPORTXML("http://evil","//a")' }, 'ok');
  const rows = readLog(ctx);
  const cell = rows.length ? String(rows[0][5]) : '';
  t('A23: Formula-injection dicegat di ringkasan (AWAL "=" dibuang)', cell.length > 0 && cell.charAt(0) !== '=', 'ringkas=' + cell.slice(0, 60));
})();

/* ---------- 6. kegagalan log tidak boleh menggagalkan write ---------- */
(function () {
  const { hEditor } = setupAccounts();
  const ctx = ctxWith([['wahyu', 'Wahyu Susanto', hEditor, 'editor', 'TRUE', 1, '']]);
  const eTok = ctx.apiLogin({ username: 'wahyu', password: 'EditorPass123!' }).token;
  // Sabotase TEPAT sasaran: membuat PENULISAN log gagal (sheet tak bisa dibuat/diakses).
  ctx.ensureAuditSheet_ = function () { throw new Error('sabotase: sheet tidak bisa diakses'); };
  // Kontrak: kegagalan log tidak boleh menggagalkan write bisnis. (Kalau kita menimpa
  //  logAudit_ secara keseluruhan, try/catch di dalamnya ikut hilang — itu bukan skenario
  //  produksi, karena try/catch itu bagian dari logAudit_ itu sendiri.)
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ action: 'postTransaksi', editorKey: eTok, itemId: 'UJI-001', jenis: 'MASUK', qty: 3, rak: 'A-01', requestId: 'req-sab' }) } });
  const p = parseOut(out);
  t('A24: write tetap BERHASIL walau logging error (data tidak boleh hilang)', p && p.status === 'ok', JSON.stringify(p).slice(0, 90));
  const trx = readSheet(ctx, 'Transaksi_Log');
  t('A25: transaksi benar-benar tertulis meski log gagal', trx.length === 1, 'trx=' + trx.length);
})();

/* ---------- 7. tidak ada route HTTP untuk menulis log seenaknya ---------- */
(function () {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'Code.gs'), 'utf8');
  const doPost = src.slice(src.indexOf('function doPost'));
  t('A26: tidak ada action HTTP untuk menulis/menghapus audit log',
    !/action === '(writeAudit|clearAudit|deleteAudit|addAudit)'/.test(doPost));
  t('A27: logAudit_ dipanggil dari gate tulis (bukan dari dalam handler bisnis)',
    /checkEditorSession_\(body\)/.test(doPost) && /logAudit_/.test(doPost));
  t('A28: sheet audit punya nama tetap & tidak bisa diubah dari client',
    /var SHEET_AUDIT_LOG\s*=\s*'Audit_Log'/.test(src));
})();

console.log('---- gs_audit_exec: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);

function parseOut(out) {
  if (!out) return null;
  if (typeof out === 'object' && 'status' in out) return out;
  try { return JSON.parse(out.getContent()); } catch (e) { return null; }
}
function readSheet(ctx, name) {
  try {
    const ss = ctx.SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues();
  } catch (e) { return []; }
}
