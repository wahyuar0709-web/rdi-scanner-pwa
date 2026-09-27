/* L1 gs_setup_editor_exec — menguji setupEditorAccount() (bootstrap akun editor, PLAN v1.41).
 *
 * Fungsi ini adalah satu-satunya cara membuat akun editor produksi tanpa menaruh password
 * di source code. Karena itu yang diuji bukan cuma "berhasil membuat akun", tapi juga
 * kejujuran desainnya:
 *   - password TIDAK boleh bocor ke kode / tidak boleh tertinggal di Script Property
 *   - tidak boleh menimpa akun editor produksi secara tak sengaja
 *   - jalur FORCE hanya aktif kalau memang diminta
 *   - akun hasil setup harus benar-benar bisa dipakai (login -> editor, bukan viewer)
 */
const { loadCodeGS, makeSpreadsheet, makeSheet } = require('../tools/gs_harness.js');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
const SECRET = 'test-token-secret';
const KDF_TEST = 1000;
const ACC_HDR = ['Username', 'Nama', 'PasswordHash', 'Role', 'Aktif', 'PasswordVersion', 'Catatan'];
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'Code.gs'), 'utf8');
const GOOD_PW = 'GudangRDI#2026';

function ctxWith(accounts, props) {
  const sheets = [
    makeSheet('Master_Item', [['No', 'ID_Item', 'Nama Material', 'Spesifikasi', 'User/Dept', 'BC/Non BC', 'Unit', 'Kategori', 'Min_Stock']]),
    makeSheet('Transaksi_Log', [['Timestamp', 'ID_Item', 'Nama_Item', 'Spesifikasi', 'Jenis', 'Qty', 'RAK', 'Vendor', 'No_Referensi', 'Saldo_Sesudah', 'Masuk', 'Sumber', 'Admin']]),
    makeSheet('Stok_Saldo', [['ID_Item', 'Nama', 'Unit', 'Total_Masuk', 'Total_Keluar', 'Saldo_Akhir']]),
    makeSheet('Stok_Per_Rak', [['ID_Item', 'RAK', 'Qty']]),
  ];
  if (accounts !== null) sheets.push(makeSheet('RDI_Accounts', [ACC_HDR].concat(accounts || [])));
  const p = { VIEWER_TOKEN_SECRET: SECRET };
  for (const k of Object.keys(props || {})) p[k] = props[k];
  return loadCodeGS({ spreadsheet: makeSpreadsheet(sheets), kdfIterations: KDF_TEST, props: p });
}
function thrown(fn) {
  try { fn(); return null; } catch (e) { return e.message || String(e); }
}
function accRow(ctx, username) {
  const sh = ctx.getAccountsSheet_();
  if (!sh) return null;
  const rows = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), 7).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').toLowerCase() === username) return rows[i];
  }
  return null;
}

/* ---------- A. password tidak pernah ada di source code ---------- */
t('A1: tidak ada string password literal di dalam setupEditorAccount',
  !/function setupEditorAccount\(\)[\s\S]{0,1200}createAccount_\([^)]*'[A-Za-z0-9#!@$%]{8,}'/.test(SRC), 'cek literal argumen ke-3');
t('A2: password dibaca dari Script Property',
  /getProperty\('TEMP_EDITOR_PW'\)/.test(SRC), 'TEMP_EDITOR_PW');
t('A3: tidak ada TEMP_EDITOR_PW yang ditulis di repo',
  !/TEMP_EDITOR_PW\s*[:=]\s*['"][^'"]+/.test(SRC), 'hanya nama property yang muncul');

/* ---------- B. happy path ---------- */
{
  const ctx = ctxWith([], { TEMP_EDITOR_PW: GOOD_PW });
  let r = null, err = null;
  try { r = ctx.setupEditorAccount(); } catch (e) { err = e.message; }
  t('B1: berhasil membuat akun', !err && r && r.ok === true, err || JSON.stringify(r));
  t('B2: created=true & username=wahyu & role=editor',
    r && r.created === true && r.username === 'wahyu' && r.role === 'editor', JSON.stringify(r));
  const row = accRow(ctx, 'wahyu');
  t('B3: baris akun tertulis di RDI_Accounts', !!row, row ? 'ada' : 'tidak ada');
  t('B4: kolom nama/role/aktif benar',
    row && row[1] === 'Wahyu Susanto' && String(row[3]).toLowerCase() === 'editor' && row[4] === true,
    row ? JSON.stringify([row[1], row[3], row[4]]) : '-');
  t('B5: password disimpan sebagai hash, bukan plaintext',
    row && String(row[2]).indexOf(GOOD_PW) < 0 && String(row[2]).length > 20,
    row ? 'hash ' + String(row[2]).slice(0, 14) + '...' : '-');
  t('B6: Script Property TEMP_EDITOR_PW dihapus setelah dipakai',
    ctx.__props && ctx.__props.TEMP_EDITOR_PW === undefined, JSON.stringify(ctx.__props && ctx.__props.TEMP_EDITOR_PW));
}

/* ---------- C. guard & error path ---------- */
{
  const ctx = ctxWith(null, {});
  const msg = thrown(() => ctx.setupEditorAccount());
  t('C1: tanpa TEMP_EDITOR_PW -> error yang jelas', !!msg && /TEMP_EDITOR_PW belum diisi/.test(msg), msg || '(tidak error)');
  t('C2: tanpa property -> sheet RDI_Accounts TIDAK ikut dibuat', ctx.getAccountsSheet_() === null, 'sheet tetap null');
}
{
  const ctx = ctxWith([], { TEMP_EDITOR_PW: 'lemah' });
  const msg = thrown(() => ctx.setupEditorAccount());
  t('C3: password lemah ditolak validatePasswordStrength_', !!msg && /lemah/i.test(msg), msg || '(tidak error)');
  t('C4: property password TIDAK tertinggal setelah ditolak',
    ctx.__props && ctx.__props.TEMP_EDITOR_PW === undefined, 'sudah dihapus');
  t('C5: tidak ada akun dibuat dari password lemah', accRow(ctx, 'wahyu') === null, 'tidak ada baris');
}
{
  // editor aktif sudah ada -> harus batal, tidak menimpa
  const existing = [['wahyu', 'Wahyu Susanto', 'pbkdf2$dummy$hash', 'editor', true, '123', 'lama']];
  const ctx = ctxWith(existing, { TEMP_EDITOR_PW: 'PasswordBaru#2026' });
  const before = accRow(ctx, 'wahyu');
  const msg = thrown(() => ctx.setupEditorAccount());
  t('C6: editor aktif sudah ada -> dibatalkan', !!msg && /Sudah ada akun editor aktif/.test(msg), msg || '(tidak error)');
  const after = accRow(ctx, 'wahyu');
  t('C7: akun lama TIDAK tertimpa', after && after[2] === before[2], after ? 'hash tidak berubah' : 'baris hilang');
  t('C8: property dihapus meski batal', ctx.__props && ctx.__props.TEMP_EDITOR_PW === undefined, 'sudah dihapus');
}

/* ---------- D. jalur FORCE (reset password) ---------- */
{
  const existing = [['wahyu', 'Wahyu Susanto', 'pbkdf2$dummy$hash', 'editor', true, '123', 'lama']];
  const ctx = ctxWith(existing, { TEMP_EDITOR_PW: 'GudangBaru#2026', TEMP_EDITOR_FORCE: 'TRUE' });
  let r = null, err = null;
  try { r = ctx.setupEditorAccount(); } catch (e) { err = e.message; }
  t('D1: FORCE=TRUE menimpa akun editor yang ada', !err && r && r.updated === true, err || JSON.stringify(r));
  const row = accRow(ctx, 'wahyu');
  t('D2: password benar-benar diganti (hash lama hilang)', row && String(row[2]).indexOf('dummy') < 0, row ? 'hash baru' : 'tidak ada baris');
  t('D3: hash baru bisa memverifikasi password baru', ctx.verifyPasswordHash_('GudangBaru#2026', row[2]) === true, 'verify true');
  t('D4: password lama tidak lagi berlaku', ctx.verifyPasswordHash_('GudangLama#2026', row[2]) === false, 'verify false');
  t('D5: kedua property dibersihkan', ctx.__props.TEMP_EDITOR_PW === undefined && ctx.__props.TEMP_EDITOR_FORCE === undefined, 'bersih');
}
{
  // FORCE dengan nilai lain (mis. "true" lowercase / "1") harus TIDAK dianggap force
  const existing = [['wahyu', 'Wahyu Susanto', 'pbkdf2$dummy$hash', 'editor', true, '123', 'lama']];
  const ctx = ctxWith(existing, { TEMP_EDITOR_PW: 'GudangBaru#2026', TEMP_EDITOR_FORCE: 'ya' });
  const msg = thrown(() => ctx.setupEditorAccount());
  t('D6: FORCE="ya" tidak dihitung force (harus tepat TRUE)', !!msg && /Sudah ada akun editor aktif/.test(msg), msg || '(tidak error)');
}

/* ---------- E. editor non-aktif tidak menghalangi ---------- */
{
  const existing = [['wahyu', 'Wahyu Susanto', 'pbkdf2$dummy$hash', 'editor', false, '123', 'non-aktif']];
  const ctx = ctxWith(existing, { TEMP_EDITOR_PW: GOOD_PW });
  let r = null, err = null;
  try { r = ctx.setupEditorAccount(); } catch (e) { err = e.message; }
  t('E1: editor non-aktif tidak menghalangi bootstrap ulang', !err && r && r.updated === true, err || JSON.stringify(r));
  const row = accRow(ctx, 'wahyu');
  t('E2: akun diaktifkan kembali', row && row[4] === true, row ? 'aktif=true' : '-');
}
{
  // hanya viewer yang ada -> tetap boleh
  const existing = [['tamu', 'Tamu Gudang', 'pbkdf2$dummy$hash', 'viewer', true, '123', 'viewer lama']];
  const ctx = ctxWith(existing, { TEMP_EDITOR_PW: GOOD_PW });
  let r = null, err = null;
  try { r = ctx.setupEditorAccount(); } catch (e) { err = e.message; }
  t('E3: adanya viewer tidak menghalangi pembuatan editor', !err && r && r.created === true, err || JSON.stringify(r));
  t('E4: viewer lama tetap utuh', !!accRow(ctx, 'tamu'), 'baris tamu masih ada');
}

/* ---------- F. akun hasil setup benar-benar bisa dipakai ---------- */
{
  const ctx = ctxWith([], { TEMP_EDITOR_PW: GOOD_PW });
  ctx.setupEditorAccount();
  const login = ctx.apiLogin({ username: 'wahyu', password: GOOD_PW });
  t('F1: login dengan password hasil setup berhasil', login && login.status === 'ok', JSON.stringify(login && login.status));
  t('F2: token membawa role=editor', login && login.token && login.role === 'editor', JSON.stringify(login && login.role));
  const wrong = ctx.apiLogin({ username: 'wahyu', password: 'PasswordSalah#2026' });
  t('F3: password salah tetap ditolak', wrong && wrong.status === 'error', JSON.stringify(wrong && wrong.status));
}

/* ---------- G. jejak audit ---------- */
{
  const ctx = ctxWith([], { TEMP_EDITOR_PW: GOOD_PW });
  ctx.setupEditorAccount();
  const sh = ctx.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Audit_Log');
  let row = null;
  if (sh) {
    const rows = sh.getRange(1, 1, sh.getLastRow(), 7).getValues();
    for (const r of rows) { if (String(r[4]) === 'setup') row = r; }
  }
  t('G1: Audit_Log dibuat otomatis & baris "setup" tercatat', !!row, row ? JSON.stringify([row[1], row[3], row[4], row[6]]) : 'tidak ada');
  t('G2: actor tercatat sebagai editor wahyu', row && String(row[1]) === 'wahyu' && String(row[3]) === 'editor', row ? row[1] + '/' + row[3] : '-');
  const allText = row ? JSON.stringify(row) : '';
  t('G3: tidak ada password bocor di baris audit', allText.indexOf(GOOD_PW) < 0, allText ? 'bersih' : '-');
}

/* ---------- H. tidak bisa dipanggil tanpa property (anti-abuse) ---------- */
{
  // realistis:oba-acak: fungsi harus gagal tanpa property, apa pun isi sheet
  const ctx = ctxWith([], {});
  let ok = 0;
  for (let i = 0; i < 3; i++) { if (!thrown(() => ctx.setupEditorAccount())) ok++; }
  t('H1: 3x dipanggil tanpa property -> 3x ditolak', ok === 0, ok + ' dari 3 lolos');
  t('H2: tidak ada akun liar yang muncul', accRow(ctx, 'wahyu') === null, 'sheet tetap kosong');
}

console.log('---- gs_setup_editor_exec: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
