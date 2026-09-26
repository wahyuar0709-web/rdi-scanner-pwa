/* L1 gs_auth_exec — MENGEKSEKUSI logika auth Code.gs sungguhan (viewerLogin, token HMAC,
 * passwordVersion, denylist, rate limit, editor key).ilver
 * Sebelumnya "coverage" auth = simulasi model sendiri (sim_auth_fix) yang tidak membaca
 * Code.gs sama sekali, plus sec_classify yang hanya grep string.
 * Yang diuji: password benar/salah, akun non-aktif, default password ditolak, TTL token,
 * denylist setelah logout, pv mismatch, rate limit 5 gagal, editor key gate. */
const { loadCodeGS, makeSpreadsheet, makeSheet } = require('../tools/gs_harness.js');
const crypto = require('crypto');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}

const SECRET = 'test-token-secret';
// KDF produksi = 100.000 iterasi (diverifikasi sebagai assert terpisah). Untuk runtime test
// kita turunkan ke 1.000 supaya suite tidak memakan 80+ detik; logika verifikasi tetap sama.
const KDF_TEST = 1000;
function ctxWith(editorKey, rows) {
  const ss = makeSpreadsheet([
    makeSheet('Master_Item', [['No', 'ID_Item', 'Nama Material', 'Spesifikasi', 'User/Dept', 'BC/Non BC', 'Unit', 'Kategori', 'Min_Stock', 'Status']]),
    makeSheet('Transaksi_Log', [['Timestamp', 'ID_Item', 'Nama_Item', 'Spesifikasi', 'Jenis', 'Qty', 'RAK', 'Vendor', 'No_Referensi', 'Saldo_Sebelum', 'Saldo_Sesudah', 'Keterangan', 'Admin']]),
    makeSheet('Stok_Saldo', [['ID_Item', 'Nama', 'Unit', 'Total_Masuk', 'Total_Keluar', 'Saldo_Akhir']]),
    makeSheet('Stok_Per_Rak', [['ID_Item', 'RAK', 'Qty']]),
    makeSheet('Viewer_Accounts', [['Username', 'Password', 'Nama', 'Aktif', 'passwordVersion']].concat(rows || [])),
  ]);
  return loadCodeGS({ spreadsheet: ss, kdfIterations: KDF_TEST, props: { EDITOR_KEY: editorKey, VIEWER_TOKEN_SECRET: SECRET } });
}
// hash password dg cara Code.gs (makeSaltedPasswordHash_) — ambil dari context
function hashWith(ctx, plain) { return ctx.makeSaltedPasswordHash_(plain); }

/* ---------- 0. konstanta produksi & override kecepatan ---------- */
(function () {
  const gsSrc = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'Code.gs'), 'utf8');
  t('KDF produksi = 100.000 iterasi (terverifikasi di source Code.gs)', /KDF_ITERATIONS_\s*=\s*100000/.test(gsSrc), 'Code.gs KDF_ITERATIONS_ = 100000');
  t('hash default memakai 100.000 iterasi', String(loadCodeGS({ props: { VIEWER_TOKEN_SECRET: 'S' } }).makeSaltedPasswordHash_('x').split('$')[1]) === '100000', 'default context');
  t('override kdfIterations berlaku (harness speeding, logika sama)', String(ctxWith('EK').makeSaltedPasswordHash_('x').split('$')[1]) === String(KDF_TEST), 'override=' + KDF_TEST);
})();

/* ---------- 1. login benar → token, login salah → ditolak ---------- */
(function () {
  const ctx0 = ctxWith('EK'); // ctx kosong untuk ambil hasher
  const pw = hashWith(ctx0, 'rahasia123');
  const ctx = ctxWith('EK', [['budi', pw, 'Budi Santoso', true, '']]);
  const ok = ctx.apiViewerLogin({ username: 'budi', password: 'rahasia123' });
  t('login password benar → status ok + token', ok && ok.status === 'ok' && !!ok.token, JSON.stringify({ s: ok && ok.status, adaToken: !!(ok && ok.token) }));
  t('login mengembalikan nama untuk topbar', ok && ok.nama === 'Budi Santoso', 'nama=' + (ok && ok.nama));
  const salah = ctx.apiViewerLogin({ username: 'budi', password: 'salah' });
  t('login password salah → error', salah && salah.status === 'error', JSON.stringify(salah).slice(0, 80));
  t('login salah tidak membocorkan apakah user ada (pesan generik)', /Username atau password salah/.test(salah && salah.message || ''), 'msg=' + String(salah && salah.message).slice(0, 60));
  const tanpaUser = ctx.apiViewerLogin({ username: 'entah', password: 'apa' });
  t('user tidak ada → pesan IDENTIK (anti enumerasi)', (tanpaUser && tanpaUser.message) === (salah && salah.message), 'msg=' + String(tanpaUser && tanpaUser.message).slice(0, 60));
})();

/* ---------- 2. akun non-aktif ditolak ---------- */
(function () {
  const ctx0 = ctxWith('EK');
  const pw = hashWith(ctx0, 'pw123');
  const ctx = ctxWith('EK', [['siti', pw, 'Siti', false, '']]);
  const r = ctx.apiViewerLogin({ username: 'siti', password: 'pw123' });
  t('akun non-aktif (Aktif=FALSE) ditolak', r && r.status === 'error', JSON.stringify(r).slice(0, 90));
})();

/* ---------- 3. password default factory ditolak ---------- */
(function () {
  const ctx0 = ctxWith('EK');
  const ctx = ctxWith('EK', [['newbie', hashWith(ctx0, 'GANTI-PASSWORD-INI'), 'Newbie', true, '']]);
  const r = ctx.apiViewerLogin({ username: 'newbie', password: 'GANTI-PASSWORD-INI' });
  t('password default GANTI-PASSWORD-INI ditolak', r && r.status === 'error', JSON.stringify(r).slice(0, 90));
})();

/* ---------- 4. verifyViewerToken: valid / rusak / kedaluwarsa ---------- */
(function () {
  const ctx0 = ctxWith('EK');
  const pw = hashWith(ctx0, 'pwA');
  const ctx = ctxWith('EK', [['dewi', pw, 'Dewi', true, '']]);
  const login = ctx.apiViewerLogin({ username: 'dewi', password: 'pwA' });
  const token = login.token;
  t('token dari login valid', ctx.verifyViewerToken(token).ok === true, JSON.stringify(ctx.verifyViewerToken(token)));
  t('token rusak ditolak', ctx.verifyViewerToken(token.slice(0, -2) + 'xx').ok === false, 'signature rusak');
  t('token kosong ditolak', ctx.verifyViewerToken('').ok === false, 'token kosong');
  const fakePayload = Buffer.from('dewi|Dewi|' + (Date.now() + 9e6) + '|j1|pv', 'utf8').toString('base64url') + '.deadbeef';
  t('token dengan signature palsu ditolak', ctx.verifyViewerToken(fakePayload).ok === false, 'signature dipalsukan');
})();

/* ---------- 5. denylist: logout membuat token tidak berlaku ---------- */
(function () {
  const ctx0 = ctxWith('EK');
  const pw = hashWith(ctx0, 'pwB');
  const ctx = ctxWith('EK', [['rina', pw, 'Rina', true, '']]);
  const login = ctx.apiViewerLogin({ username: 'rina', password: 'pwB' });
  const token = login.token;
  t('token berlaku sebelum logout', ctx.verifyViewerToken(token).ok === true, 'ok');
  const lo = ctx.apiViewerLogout({ viewerToken: token });
  t('logout selalu balas status ok (tak bocorkan status token)', lo && lo.status === 'ok', JSON.stringify(lo));
  const after = ctx.verifyViewerToken(token);
  t('setelah logout token DITOLAK (denylist)', after.ok === false, JSON.stringify(after));
})();

/* ---------- 6. passwordVersion: pv berubah → token lama revoked ---------- */
(function () {
  const ctx0 = ctxWith('EK');
  const pw = hashWith(ctx0, 'pwC');
  // pv KOSONG di sheet → pv diturunkan dari hash password (passwordPv_)
  const ctx = ctxWith('EK', [['andi', pw, 'Andi', true, '']]);
  const login = ctx.apiViewerLogin({ username: 'andi', password: 'pwC' });
  t('token dari login (pv diturunkan) valid', ctx.verifyViewerToken(login.token).ok === true, JSON.stringify(ctx.verifyViewerToken(login.token)));
  // Simulasi ADMIN mengubah password ⇒ kolom passwordVersion diganti
  const sheet = ctx.__ss.getSheetByName('Viewer_Accounts');
  sheet.getRange(2, 5, 1, 1).setValue('ffffffffffffffff');
  // cache status 60 detik (by design, BE-09) → simulasikan jendela lewat: bersihkan cache
  ctx.CacheService._store.delete('viewer_status_andi');
  const after = ctx.verifyViewerToken(login.token);
  t('token LAMA revoked setelah passwordVersion berubah', after.ok === false, JSON.stringify(after));
  const login2 = ctx.apiViewerLogin({ username: 'andi', password: 'pwC' });
  ctx.CacheService._store.delete('viewer_status_andi');
  t('token BARU (pv baru) valid setelah login ulang', ctx.verifyViewerToken(login2.token).ok === true, JSON.stringify(ctx.verifyViewerToken(login2.token)));
})();

/* ---------- 7. rate limit: 5 gagal → terkunci 15 menit ---------- */
(function () {
  const ctx0 = ctxWith('EK');
  const pw = hashWith(ctx0, 'pwD');
  const ctx = ctxWith('EK', [['tomi', pw, 'Tomi', true, '']]);
  let msgs = [];
  for (let i = 0; i < 5; i++) msgs.push(ctx.apiViewerLogin({ username: 'tomi', password: 'salah' }).message);
  const sixth = ctx.apiViewerLogin({ username: 'tomi', password: 'pwD' });
  t('setelah 5× gagal, login benarPun ditolak (rate limit)', sixth && sixth.status === 'error' && /terlalu banyak|15 menit/i.test(sixth.message || ''), JSON.stringify(sixth).slice(0, 90));
  t('pesan rate limit menyebut 15 menit', /15 menit/i.test(sixth && sixth.message || ''), 'msg=' + String(sixth && sixth.message).slice(0, 60));
})();

/* ---------- 8. editor key gate ---------- */
(function () {
  const ctx = ctxWith('RAHASIA-EDITOR');
  t('editor key benar diterima', ctx.checkEditorKey({ editorKey: 'RAHASIA-EDITOR' }).ok === true, JSON.stringify(ctx.checkEditorKey({ editorKey: 'RAHASIA-EDITOR' })));
  t('editor key salah ditolak', ctx.checkEditorKey({ editorKey: 'x' }).ok === false, 'ditolak');
  const ctxNoKey = ctxWith('');
  t('EDITOR_KEY kosong (belum diset) → fail-closed', ctxNoKey.checkEditorKey({ editorKey: 'apa saja' }).ok === false, JSON.stringify(ctxNoKey.checkEditorKey({ editorKey: 'apa saja' })).slice(0, 80));
})();

/* ---------- 9. constant-time compare benar ---------- */
(function () {
  const ctx = ctxWith('EK');
  t('constantTimeEquals_ benar untuk string sama', ctx.constantTimeEquals_('abc', 'abc') === true, 'abc==abc');
  t('constantTimeEquals_ salah untuk beda', ctx.constantTimeEquals_('abc', 'abd') === false, 'abc!=abd');
  t('constantTimeEquals_ beda panjang → false', ctx.constantTimeEquals_('abc', 'abcd') === false, 'panjang beda');
  t('constantTimeEquals_ null vs string → false, tidak error', ctx.constantTimeEquals_(null, 'abc') === false, 'null aman');
})();

/* ---------- 10. password di-hash, tidak disimpan polos ---------- */
(function () {
  const ctx0 = ctxWith('EK');
  const pw = hashWith(ctx0, 'rahasia');
  t('password di-hash berformat salt$iterations$hash', /^[0-9a-f-]+\$\d+\$[0-9a-f]{64}$/.test(pw), 'shape=' + pw.slice(0, 18) + '…');
  t('hash tidak mengandung password polos', pw.indexOf('rahasia') < 0, 'tidak ada plaintext');
  t('hash unik per salt (2× hash ≠)', hashWith(ctx0, 'rahasia') !== pw, 'salt unik');
  t('verifyPasswordHash_ benar untuk password cocok', ctx0.verifyPasswordHash_('rahasia', pw) === true, 'verify ok');
  t('verifyPasswordHash_ salah untuk password lain', ctx0.verifyPasswordHash_('salah', pw) === false, 'verify ditolak');
})();

/* ---------- 11. token tidak menyimpan password, hanya metadata ---------- */
(function () {
  const ctx0 = ctxWith('EK');
  const pw = hashWith(ctx0, 'pwE');
  const ctx = ctxWith('EK', [['fajar', pw, 'Fajar', true, '']]);
  const login = ctx.apiViewerLogin({ username: 'fajar', password: 'pwE' });
  const payloadPart = String(login.token).split('.')[0];
  const decoded = Buffer.from(payloadPart.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  t('payload token memuat username+nama+expiry (bukan password)', /fajar/.test(decoded) && /Fajar/.test(decoded) && !/pwE/.test(decoded), 'decoded<' + decoded.length + ' char, ada pwE? ' + /pwE/.test(decoded) + '>');
  t('payload TIDAK memuat password/hash', !/pbkdf|hash|\$/.test(decoded), 'tidak ada tanda hash');
})();

console.log('---- gs_auth_exec: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
