/* L1 gs_setup_account_exec — menguji setupAccount(): alat umum buat/reset akun.
 *
 * Kebutuhan nyata: viewer "warehouse" hasil migrasi punya password lama yang tidak
 * diketahui siapa pun (migrasi menyalin hash byte-identik, jadi tidak ada cara
 * memulihkan password aslinya). Jalan satu-satunya = reset, dan tidak ada toolnya.
 * Test ini memastikan tool itu ada, aman, dan tidak merusak akun lain.
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
const PW = 'GudangRDI#2026';
const PW2 = 'GudangBaru#2027';

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
function thrown(fn) { try { fn(); return null; } catch (e) { return e.message || String(e); } }
function run(ctx, props) {
  for (const k of Object.keys(props)) ctx.__props[k] = props[k];
  try { return { r: ctx.setupAccount() }; } catch (e) { return { err: e.message }; }
}
function accRow(ctx, u) {
  const sh = ctx.getAccountsSheet_();
  if (!sh) return null;
  const rows = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), 7).getValues();
  for (const r of rows) if (String(r[0] || '').toLowerCase() === u) return r;
  return null;
}

/* ---------- A. tidak ada kredensial di source ---------- */
t('A1: tidak ada password/username literal di setupAccount',
  !/function setupAccount\(\)[\s\S]{0,1600}createAccount_\(\s*['"][A-Za-z0-9#!@$%_-]{4,}/.test(SRC), 'argumen createAccount_ bukan literal');
t('A2: kredensial dibaca dari Script Property',
  /getProperty\('ACC_USERNAME'\)/.test(SRC) && /getProperty\('ACC_PASSWORD'\)/.test(SRC), 'ACC_USERNAME + ACC_PASSWORD');
t('A3: semua properti dibersihkan setelah dipanggil',
  /'ACC_USERNAME', 'ACC_PASSWORD', 'ACC_ROLE', 'ACC_NAMA', 'ACC_NOTE', 'ACC_ALLOW_DOWNGRADE'/.test(SRC), '6 properti');

/* ---------- B. buat akun baru ---------- */
{
  const ctx = ctxWith([], { ACC_USERNAME: 'gudang01', ACC_PASSWORD: PW, ACC_ROLE: 'viewer', ACC_NAMA: 'Budi Santoso' });
  const { r, err } = run(ctx, {});
  t('B1: berhasil buat viewer baru', !err && r && r.created === true, err || JSON.stringify(r));
  const row = accRow(ctx, 'gudang01');
  t('B2: nama & role tersimpan benar', row && row[1] === 'Budi Santoso' && String(row[3]) === 'viewer', row ? JSON.stringify([row[1], row[3]]) : '-');
  t('B3: password jadi hash, bukan plaintext', row && String(row[2]).indexOf(PW) < 0, 'hash ok');
  t('B4: catatanauto terisi', row && String(row[6]).indexOf('setupAccount') >= 0, row ? row[6] : '-');
  t('B5: semua properti kosong setelah jalan',
    !ctx.__props.ACC_USERNAME && !ctx.__props.ACC_PASSWORD && !ctx.__props.ACC_ROLE, JSON.stringify(ctx.__props.ACC_USERNAME || 'kosong'));
}
{
  const ctx = ctxWith([], { ACC_USERNAME: 'kadep', ACC_PASSWORD: PW, ACC_ROLE: 'editor' });
  const { r } = run(ctx, {});
  t('B6: bisa buat editor baru', r && r.created === true && r.role === 'editor', JSON.stringify(r));
  t('B7: ACC_NAMA kosong -> nama fallback ke username', accRow(ctx, 'kadep')[1] === 'kadep', accRow(ctx, 'kadep')[1]);
}

/* ---------- C. kasus nyata: reset password viewer hasil migrasi ---------- */
{
  const mig = '2fc564fc-0d0f-4e47-92a3-c8f64f104ddd$100000$b3b58472a8cb4020cfacfa0dbb8d91cdc257d203cea7c4281fb6b040eba6c7d9';
  const ctx = ctxWith([['warehouse', 'Wahyu susanto', mig, 'viewer', true, 'ff029b247770b8b5', 'migrasi dari Viewer_Accounts']],
    { ACC_USERNAME: 'warehouse', ACC_PASSWORD: PW2, ACC_ROLE: 'viewer' });
  const { r, err } = run(ctx, {});
  t('C1: reset password hasil migrasi berhasil', !err && r && r.updated === true, err || JSON.stringify(r));
  const row = accRow(ctx, 'warehouse');
  t('C2: hash lama (migrasi) diganti', row && String(row[2]) !== mig, 'hash baru');
  t('C3: password baru bisa diverifikasi', ctx.verifyPasswordHash_(PW2, row[2]) === true, 'verify true');
  t('C4: tetap 1 baris (update in-place, tidak duplikat)',
    ctx.getAccountsSheet_().getLastRow() === 2, 'lastRow=' + ctx.getAccountsSheet_().getLastRow());
  t('C5: role & nama lama dipertahankan (ACC_NAMA kosong tidak menimpa)', row && String(row[3]) === 'viewer' && row[1] === 'Wahyu susanto', JSON.stringify([row[1], row[3]]));
}

{
  const rows = [['gudang9', 'Nama Lama', 'pbkdf2$x$y', 'viewer', true, '1', 'lama']];
  const ctx = ctxWith(rows, { ACC_USERNAME: 'gudang9', ACC_PASSWORD: PW, ACC_ROLE: 'viewer', ACC_NAMA: 'Nama Baru' });
  const { r, err } = run(ctx, {});
  t('C6: ACC_NAMA yang diisi SENGAJA boleh menimpa nama', !err && r && String(accRow(ctx, 'gudang9')[1]) === 'Nama Baru', err || accRow(ctx, 'gudang9')[1]);
}

/* ---------- D. error path ---------- */
{
  const ctx = ctxWith([], { ACC_ROLE: 'viewer', ACC_PASSWORD: PW });
  const { err } = run(ctx, {});
  t('D1: tanpa ACC_USERNAME ditolak', !!err && /ACC_USERNAME belum diisi/.test(err), err || '(tidak error)');
  t('D2: password tetap terhapus walau gagal', ctx.__props.ACC_PASSWORD === undefined, 'bersih');
}
{
  const ctx = ctxWith([], { ACC_USERNAME: 'x', ACC_ROLE: 'viewer' });
  const { err } = run(ctx, {});
  t('D3: tanpa ACC_PASSWORD ditolak', !!err && /ACC_PASSWORD belum diisi/.test(err), err || '(tidak error)');
}
{
  const ctx = ctxWith([], { ACC_USERNAME: 'x', ACC_PASSWORD: PW, ACC_ROLE: 'admin' });
  const { err } = run(ctx, {});
  t('D4: role ngawur ditolak', !!err && /harus 'editor' atau 'viewer'/.test(err), err || '(tidak error)');
  t('D5: tidak ada akun yang dibuat', accRow(ctx, 'x') === null, 'tidak ada baris');
}
{
  const ctx = ctxWith([], { ACC_USERNAME: 'x', ACC_PASSWORD: 'lemah', ACC_ROLE: 'viewer' });
  const { err } = run(ctx, {});
  t('D6: password lemah ditolak', !!err && /lemah/i.test(err), err || '(tidak error)');
}

/* ---------- E. pengaman turunkan editor ---------- */
{
  const rows = [['wahyu', 'Wahyu Susanto', 'pbkdf2$x$y', 'editor', true, '1', 'operator warehouse']];
  const ctx = ctxWith(rows, { ACC_USERNAME: 'wahyu', ACC_PASSWORD: PW, ACC_ROLE: 'viewer' });
  const { err } = run(ctx, {});
  t('E1: editor -> viewer ditolak tanpa ACC_ALLOW_DOWNGRADE', !!err && /ACC_ALLOW_DOWNGRADE/.test(err), err || '(tidak error)');
  t('E2: role editor tetap utuh', String(accRow(ctx, 'wahyu')[3]) === 'editor', 'masih editor');
}
{
  const rows = [['wahyu', 'Wahyu Susanto', 'pbkdf2$x$y', 'editor', true, '1', 'operator warehouse']];
  const ctx = ctxWith(rows, { ACC_USERNAME: 'wahyu', ACC_PASSWORD: PW, ACC_ROLE: 'viewer', ACC_ALLOW_DOWNGRADE: 'TRUE' });
  const { r, err } = run(ctx, {});
  t('E3: turunkan editor BOLEH dengan ACC_ALLOW_DOWNGRADE=TRUE', !err && r && r.updated === true, err || JSON.stringify(r));
  t('E4: role jadi viewer', String(accRow(ctx, 'wahyu')[3]) === 'viewer', 'viewer');
}
{
  const rows = [['wahyu', 'Wahyu Susanto', 'pbkdf2$x$y', 'editor', false, '1', 'non-aktif']];
  const ctx = ctxWith(rows, { ACC_USERNAME: 'wahyu', ACC_PASSWORD: PW, ACC_ROLE: 'viewer' });
  const { r, err } = run(ctx, {});
  t('E5: editor NON-aktif boleh diturunkan tanpa flag', !err && r && r.updated === true, err || JSON.stringify(r));
}

/* ---------- F. hak akses benar-benar berbeda ---------- */
{
  const ctx = ctxWith([], {});
  run(ctx, { ACC_USERNAME: 'v1', ACC_PASSWORD: PW, ACC_ROLE: 'viewer' });
  run(ctx, { ACC_USERNAME: 'e1', ACC_PASSWORD: PW, ACC_ROLE: 'editor' });
  const tokV = ctx.apiLogin({ username: 'v1', password: PW });
  const tokE = ctx.apiLogin({ username: 'e1', password: PW });
  t('F1: viewer login dapat role viewer', tokV && tokV.role === 'viewer', JSON.stringify(tokV && tokV.role));
  t('F2: editor login dapat role editor', tokE && tokE.role === 'editor', JSON.stringify(tokE && tokE.role));
  t('F3: token viewer DITOLAK di gerbang tulis', ctx.checkEditorSession_({ editorKey: tokV.token }).ok === false, 'ditolak');
  t('F4: token editor DITERIMA di gerbang tulis', ctx.checkEditorSession_({ editorKey: tokE.token }).ok === true, 'diterima');
}

/* ---------- G. self-arming kunci lama ---------- */
{
  const ctx = ctxWith([], { EDITOR_KEY: 'kunci-lama-yang-bocor' });
  t('G1: kunci legacy sudah MATI walau tab akun masih kosong (fail-closed)', ctx.legacySingleKeyEnabled_() === false, 'legacy off');
  run(ctx, { ACC_USERNAME: 'e1', ACC_PASSWORD: PW, ACC_ROLE: 'editor' });
  t('G2: setelah ada editor, kunci legacy MATI otomatis', ctx.legacySingleKeyEnabled_() === false, 'legacy off');
  t('G3: kunci lama tidak lagi diterima', ctx.checkEditorSession_({ editorKey: 'kunci-lama-yang-bocor' }).ok === false, 'ditolak');
}

/* ---------- H. jejak audit ---------- */
{
  const ctx = ctxWith([], {});
  run(ctx, { ACC_USERNAME: 'a1', ACC_PASSWORD: PW, ACC_ROLE: 'viewer' });
  const sh = ctx.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Audit_Log');
  let row = null;
  if (sh) for (const r of sh.getRange(1, 1, sh.getLastRow(), 7).getValues()) if (String(r[4]) === 'setup') row = r;
  t('H1: baris audit "setup" tercatat', !!row, row ? JSON.stringify([row[1], row[3], row[4]]) : 'tidak ada');
  t('H2: tidak ada password bocor di audit', row ? JSON.stringify(row).indexOf(PW) < 0 : false, 'bersih');
}
{
  const mig = '2fc564fc-0d0f-4e47-92a3-c8f64f104ddd$100000$b3b58472a8cb4020cfacfa0dbb8d91cdc257d203cea7c4281fb6b040eba6c7d9';
  const ctx = ctxWith([['warehouse', 'Wahyu susanto', mig, 'viewer', true, 'ff02', 'migrasi dari Viewer_Accounts']], {});
  run(ctx, { ACC_USERNAME: 'warehouse', ACC_PASSWORD: PW2, ACC_ROLE: 'viewer' });
  const sh = ctx.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Audit_Log');
  let row = null;
  if (sh) for (const r of sh.getRange(1, 1, sh.getLastRow(), 7).getValues()) if (String(r[4]) === 'setup-reset') row = r;
  t('H3: reset tercatat sebagai "setup-reset" (bukan "setup")', !!row, row ? 'aksi=' + row[4] : 'tidak ada');
}

console.log('---- gs_setup_account_exec: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
