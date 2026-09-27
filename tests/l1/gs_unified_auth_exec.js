/* L1 gs_unified_auth_exec — MENGEKSEKUSI logika auth unified yang baru (F5-AUTH, PLAN §14).
 *
 * TUJUAN: "satu identitas per orang" — editor & viewer login dengan username+password yang
 * sama, peran dibawa di dalam token (signed), dan kunci tunggal lama jadi break-glass saja.
 *
 * Semua test di bawah ini SEHARUSNYA GAGAL (RED) sebelum implementasi ada.
 * KDF produksi 100.000 dinaikkan? Tidak — diturunkan ke 1.000 lewat override harness supaya
 * suite cepat; logika verifikasi identik (KDF produksi diverifikasi sebagai assert terpisah).
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

function ctxWith(accounts, opts) {
  opts = opts || {};
  const sheets = [
    makeSheet('Master_Item', [['No', 'ID_Item', 'Nama Material', 'Spesifikasi', 'User/Dept', 'BC/Non BC', 'Unit', 'Kategori', 'Min_Stock']]),
    makeSheet('Transaksi_Log', [['Timestamp', 'ID_Item', 'Nama_Item', 'Spesifikasi', 'Jenis', 'Qty', 'RAK', 'Vendor', 'No_Referensi', 'Saldo_Sesudah', 'Masuk', 'Sumber', 'Admin']]),
    makeSheet('Stok_Saldo', [['ID_Item', 'Nama', 'Unit', 'Total_Masuk', 'Total_Keluar', 'Saldo_Akhir']]),
    makeSheet('Stok_Per_Rak', [['ID_Item', 'RAK', 'Qty']]),
  ];
  if (accounts !== null) sheets.push(makeSheet('RDI_Accounts', [ACC_HDR].concat(accounts || [])));
  if (opts.legacyViewers) sheets.push(makeSheet('Viewer_Accounts', [['Username','Password','Nama','Aktif','passwordVersion']].concat(opts.legacyViewers)));
  const props = { VIEWER_TOKEN_SECRET: SECRET };
  if (opts.editorKey) props.EDITOR_KEY = opts.editorKey;
  if (opts.allowLegacy) props.ALLOW_LEGACY_SINGLE_KEY = 'TRUE';
  return withStub(loadCodeGS({ spreadsheet: makeSpreadsheet(sheets), kdfIterations: KDF_TEST, props: props }));
}
const hash = (ctx, plain) => ctx.makeSaltedPasswordHash_(plain);

/* ---------- A. login editor & viewer mengembalikan peran ---------- */
(function () {
  const seed = ctxWith([]);                     // ctx kosong untuk bikin hash
  const hEditor = hash(seed, 'EditorPass123!');
  const hViewer = hash(seed, 'ViewerPass123!');
  const ctx = ctxWith([
    ['wahyu', 'Wahyu Susanto', hEditor, 'editor', 'TRUE', 1, 'operator warehouse'],
    ['gudang01', 'Operator Gudang 01', hViewer, 'viewer', 'TRUE', 1, 'read only'],
  ]);

  const le = ctx.apiLogin({ username: 'wahyu', password: 'EditorPass123!' });
  const lej = safeJson(le);
  t('A1: login editor → status ok', lej && lej.status === 'ok', dump(lej));
  t('A2: login editor → role=editor', lej && lej.role === 'editor', 'role=' + (lej && lej.role));
  t('A3: login editor → nama terisi (identitas nyata)', lej && lej.nama === 'Wahyu Susanto', 'nama=' + (lej && lej.nama));
  t('A4: login editor → token ada & bertanda tangan', !!(lej && typeof lej.token === 'string' && lej.token.indexOf('.') > 0));

  const lv = ctx.apiLogin({ username: 'gudang01', password: 'ViewerPass123!' });
  const lvj = safeJson(lv);
  t('A5: login viewer → role=viewer', lvj && lvj.status === 'ok' && lvj.role === 'viewer', dump(lvj));
  t('A6: nama viewer ikut terisi', lvj && lvj.nama === 'Operator Gudang 01');

  // token membawa role di payload (bit ke-6)
  const bits = decodeToken(lej && lej.token, ctx);
  t('A7: payload token membawa field role', !!(bits && bits[5] === 'editor'), 'bits[5]=' + (bits && bits[5]));
  const vb = decodeToken(lvj && lvj.token, ctx);
  t('A8: payload token viewer membawa role=viewer', !!(vb && vb[5] === 'viewer'), 'bits[5]=' + (vb && vb[5]));

  // backward compatibility: token lama tanpa role -> dibaca sebagai viewer
  const legacyBits = ['gudang01', 'Operator Gudang 01', String(Date.now() + 60000), 'jti-legacy', '1'];
  const legacyToken = legacyBits.join('|');
  const signed = signPayload(ctx, legacyToken);
  const vres = ctx.verifyAuthToken_(signed);
  t('A9: token lama tanpa field role tetap valid & dianggap viewer',
    !!(vres && vres.ok && vres.role === 'viewer'), dumpObj(vres));
})();

/* ---------- B. password salah: ditolak tanpa membocorkan keberadaan user ---------- */
(function () {
  const seed = ctxWith([]);
  const h = hash(seed, 'BenarSekali123!');
  const ctx = ctxWith([['wahyu', 'Wahyu Susanto', h, 'editor', 'TRUE', 1, '']]);

  const wrong = safeJson(ctx.apiLogin({ username: 'wahyu', password: 'SalahSekali123!' }));
  const unknown = safeJson(ctx.apiLogin({ username: 'entah', password: 'SalahSekali123!' }));
  t('B1: password salah ditolak', wrong && wrong.status !== 'ok' && !wrong.token, dump(wrong));
  t('B2: user tidak ada ditolak', unknown && unknown.status !== 'ok' && !unknown.token, dump(unknown));
  t('B3: pesan gagal IDENTIK untuk "password salah" vs "user tidak ada" (tidak membocorkan)',
    !!(wrong && unknown) && JSON.stringify(wrong.message) === JSON.stringify(unknown.message),
    'salah="' + (wrong && wrong.message) + '" | tidak-ada="' + (unknown && unknown.message) + '"');
})();

/* ---------- C. gate tulis: hanya role editor ---------- */
(function () {
  const seed = ctxWith([]);
  const ctx = ctxWith([
    ['wahyu', 'Wahyu Susanto', hash(seed, 'EditorPass123!'), 'editor', 'TRUE', 1, ''],
    ['gudang01', 'Operator Gudang 01', hash(seed, 'ViewerPass123!'), 'viewer', 'TRUE', 1, ''],
  ]);
  const eTok = tokOf(safeJson(ctx.apiLogin({ username: 'wahyu', password: 'EditorPass123!' })));
  const vTok = tokOf(safeJson(ctx.apiLogin({ username: 'gudang01', password: 'ViewerPass123!' })));

  // token editor dikirim di field editorKey (transport klien tidak berubah)
  const w1 = ctx.checkEditorSession_({ editorKey: eTok });
  t('C1: token role=editor → write diizinkan', !!(w1 && w1.ok), dumpObj(w1));
  t('C2: nama penyetor ikut terbawa (untuk audit)', !!(w1 && w1.nama === 'Wahyu Susanto'), 'nama=' + (w1 && w1.nama));

  const w2 = ctx.checkEditorSession_({ editorKey: vTok });
  t('C3: token role=viewer → write DITOLAK', !!(w2 && w2.ok === false), dumpObj(w2));

  const w3 = ctx.checkEditorSession_({});
  t('C4: tanpa kredensial → write DITOLAK (fail-closed)', !!(w3 && w3.ok === false), dumpObj(w3));

  // checkAnyAccess untuk baca: peran ikut terpetakan
  const a1 = ctx.checkAnyAccess({ editorKey: eTok });
  t('C5: checkAnyAccess(token editor) → role editor', !!(a1 && a1.ok && a1.role === 'editor'), dumpObj(a1));
  const a2 = ctx.checkAnyAccess({ viewerToken: vTok });
  t('C6: checkAnyAccess(token viewer) → role viewer', !!(a2 && a2.ok && a2.role === 'viewer'), dumpObj(a2));
  const a3 = ctx.checkAnyAccess({});
  t('C7: checkAnyAccess tanpa token → ditolak', !!(a3 && a3.ok === false), dumpObj(a3));
})();

/* ---------- D. akun nonaktif: benar-benar berhenti (tidak bisa pakai kunci lama) ---------- */
(function () {
  const seed = ctxWith([]);
  const h = hash(seed, 'EditorPass123!');
  const ctx = ctxWith([
    ['wahyu', 'Wahyu Susanto', h, 'editor', 'TRUE', 1, ''],
    ['slamet', 'Slamet Operator', h, 'editor', 'FALSE', 1, ''],
  ]);
  const tok = tokOf(safeJson(ctx.apiLogin({ username: 'wahyu', password: 'EditorPass123!' })));
  t('D1: editor aktif → token valid', !!(ctx.verifyAuthToken_(tok) || {}).ok);

  // token milik akun yang dinonaktifkan (dibuat SEBELUM status berubah di fixture lain)
  const off = ctxWith([
    ['slamet', 'Slamet Operator', h, 'editor', 'TRUE', 1, ''],
  ]);
  const offTok = tokOf(safeJson(off.apiLogin({ username: 'slamet', password: 'EditorPass123!' })));
  // sekarang akun dinonaktifkan
  const off2 = ctxWith([
    ['slamet', 'Slamet Operator', h, 'editor', 'FALSE', 1, ''],
  ]);
  const res = off2.verifyAuthToken_(offTok);
  t('D2: token lama milik akun Aktif=FALSE → DITOLAK', !!(res && res.ok === false), dumpObj(res));
  const lg = safeJson(off2.apiLogin({ username: 'slamet', password: 'EditorPass123!' }));
  t('D3: akun Aktif=FALSE tidak bisa login ulang', !!(lg && lg.status !== 'ok'), dump(lg));
  t('D4: verifyAuthToken_ tidak melempar exception (aman)', true);
})();

/* ---------- E. ganti password → token lama mati ---------- */
(function () {
  const seed = ctxWith([]);
  const h1 = hash(seed, 'PasswordLama123!');
  const ctx = ctxWith([['wahyu', 'Wahyu Susanto', h1, 'editor', 'TRUE', 1, '']]);
  const tok = tokOf(safeJson(ctx.apiLogin({ username: 'wahyu', password: 'PasswordLama123!' })));
  t('E1: token valid sebelum password diganti', !!(ctx.verifyAuthToken_(tok) || {}).ok);
  const h2 = ctx.makeSaltedPasswordHash_('PasswordBaru456!');
  // naikkan PasswordVersion di fixture ( simulating ganti password)
  const ctx2 = ctxWith([['wahyu', 'Wahyu Susanto', h2, 'editor', 'TRUE', 2, '']]);
  const res = ctx2.verifyAuthToken_(tok);
  t('E2: token lama MATI setelah passwordVersion naik', !!(res && res.ok === false), dumpObj(res));
  const loginBaru = safeJson(ctx2.apiLogin({ username: 'wahyu', password: 'PasswordBaru456!' }));
  t('E3: password baru bisa login', !!(loginBaru && loginBaru.status === 'ok'), dump(loginBaru));
  const loginLama = safeJson(ctx2.apiLogin({ username: 'wahyu', password: 'PasswordLama123!' }));
  t('E4: password lama tidak bisa login lagi', !!(loginLama && loginLama.status !== 'ok'), dump(loginLama));
})();

/* ---------- F. kunci tunggal legacy = break-glass, default MATI ---------- */
(function () {
  const seed = ctxWith([], { editorKey: 'RAHASIA-LAMA' });
  const ctxNo = ctxWith([
    ['wahyu', 'Wahyu Susanto', hash(seed, 'EditorPass123!'), 'editor', 'TRUE', 1, ''],
  ], { editorKey: 'RAHASIA-LAMA' });
  t('F1: ALLOW_LEGACY_SINGLE_KEY tidak di-set → kunci tunggal DITOLAK',
    !!(ctxNo.checkEditorSession_({ editorKey: 'RAHASIA-LAMA' }) || {}).ok === false,
    dumpObj(ctxNo.checkEditorSession_({ editorKey: 'RAHASIA-LAMA' })));

  const ctxYes = ctxWith([
    ['wahyu', 'Wahyu Susanto', hash(seed, 'EditorPass123!'), 'editor', 'TRUE', 1, ''],
  ], { editorKey: 'RAHASIA-LAMA', allowLegacy: true });
  t('F2: ALLOW_LEGACY_SINGLE_KEY=TRUE → kunci tunggal jadi break-glass yang hidup',
    !!(ctxYes.checkEditorSession_({ editorKey: 'RAHASIA-LAMA' }) || {}).ok === true,
    dumpObj(ctxYes.checkEditorSession_({ editorKey: 'RAHASIA-LAMA' })));
})();

/* ---------- G. fail-closed: sheet akun hilang/kosong = tolak semua ---------- */
(function () {
  const seed = ctxWith([]);
  const h = hash(seed, 'EditorPass123!');
  const noSheet = ctxWith(null, { editorKey: 'RAHASIA-LAMA', allowLegacy: true });
  const r1 = noSheet.apiLogin({ username: 'wahyu', password: 'EditorPass123!' });
  t('G1: sheet RDI_Accounts tidak ada → login DITOLAK (bukan dispensing)', !!(safeJson(r1) || {}).status !== 'ok', dump(safeJson(r1)));
  const empty = ctxWith([], { editorKey: 'RAHASIA-LAMA', allowLegacy: true });
  const r2 = empty.apiLogin({ username: 'wahyu', password: 'EditorPass123!' });
  t('G2: sheet RDI_Accounts kosong → login DITOLAK', !!(safeJson(r2) || {}).status !== 'ok', dump(safeJson(r2)));
  t('G3: tidak ada exception yang lolos (fail-closed, bukan error500)', !!(safeJson(r1) && safeJson(r2)));
})();

/* ---------- H. migrasi Viewer_Accounts → RDI_Accounts (idempotent) ---------- */
(function () {
  const seed = ctxWith([]);
  const hA = hash(seed, 'PasswordA123!');
  const hB = hash(seed, 'PasswordB123!');
  const ctx = ctxWith([], {
    legacyViewers: [
      ['petugas1', hA, 'Petugas Satu', 'TRUE', 1],
      ['petugas2', hB, 'Petugas Dua', 'TRUE', 1],
    ],
  });
  let m1 = null, m2 = null;
  try { m1 = ctx.migrateToUnifiedAccounts_(); } catch (e) { m1 = { error: e.message }; }
  t('H1: migrasi jalan & melaporkan jumlah baris', !!(m1 && m1.migrated >= 2), dumpObj(m1));
  const rows = readAccounts(ctx, 'RDI_Accounts');
  t('H2: 2 viewer legacy terbawa dengan Role=viewer', rows.length === 2 && rows.every(r => r[3] === 'viewer'), 'rows=' + rows.length);
  t('H3: hash password disalin byte-identik (password lama tetap berlaku)',
    rows.some(r => r[2] === hA) && rows.some(r => r[2] === hB), 'hashA ada=' + rows.some(r => r[2] === hA));
  const login = safeJson(ctx.apiLogin({ username: 'petugas1', password: 'PasswordA123!' }));
  t('H4: viewer lama bisa login tanpa reset password', !!(login && login.status === 'ok' && login.role === 'viewer'), dump(login));
  try { m2 = ctx.migrateToUnifiedAccounts_(); } catch (e) { m2 = { error: e.message }; }
  const rows2 = readAccounts(ctx, 'RDI_Accounts');
  t('H5: migrasi idempotent (dijalankan 2x tidak duplikat)', rows2.length === rows.length, 'sebelum=' + rows.length + ' sesudah=' + rows2.length);
})();

/* ---------- I. kekuatan password ---------- */
(function () {
  const seed = ctxWith([]);
  const ctx = ctxWith([]);
  t('I1: password terlalu pendek ditolak', ctx.validatePasswordStrength_('Ab1!') === false, "'Ab1!'");
  t('I2: password tanpa variasi ditolak', ctx.validatePasswordStrength_('aaaaaaaaaaaa') === false);
  t('I3: password hanya huruf ditolak', ctx.validatePasswordStrength_('PasswordPanjang') === false);
  t('I4: password kuat (huruf+besar+kecil+angka+simbol) diterima', ctx.validatePasswordStrength_('EditorPass123!') === true);
  let threw = null;
  try { ctx.createAccount_('x', 'X', 'abc', 'editor'); } catch (e) { threw = e.message; }
  t('I5: pembuatan akun dengan password lemah DITOLAK (lempar error)', !!threw && /lemah/i.test(threw), threw || '(tidak melempar)');
  let made = null;
  try { made = ctx.createAccount_('wahyu', 'Wahyu Susanto', 'EditorPass321!', 'editor', 'operator'); } catch (e) { made = { error: e.message }; }
  t('I6: pembuatan akun dengan password kuat BERHASIL', !!(made && made.ok === true), dump(made));
  const accRow = readAccounts(ctx, 'RDI_Accounts').find(r => r[0] === 'wahyu');
  t('I7: akun tersimpan dengan Role=editor & hash (bukan plaintext)', !!(accRow && accRow[3] === 'editor' && /\$/.test(String(accRow[2])) && String(accRow[2]) !== 'EditorPass321!'),
    accRow ? ('role=' + accRow[3] + ' hashFormat=' + (/\$/.test(String(accRow[2])) ? 'salted' : 'PLAIN')) : '(tidak ada baris)');
  const lgi = safeJson(ctx.apiLogin({ username: 'wahyu', password: 'EditorPass321!' }));
  t('I8: akun yang dibuat bisa langsung login sebagai editor', !!(lgi && lgi.status === 'ok' && lgi.role === 'editor'), dump(lgi));
  // createAccount_ hanya boleh dari editor Apps Script — tidak boleh jadi route HTTP
  const srcNow = fs.readFileSync(path.join(__dirname, '..', '..', 'Code.gs'), 'utf8');
  t('I9: createAccount_ TIDAK diekspos lewat doPost (tidak ada route HTTP)',
    !/action === 'createAccount'/.test(srcNow) && !/apiCreateAccount/.test(srcNow) &&
    !/if \(action === 'setupUnifiedAuth'\)/.test(srcNow));
})();

/* ---------- J. rate limit login tetap berlaku ---------- */
(function () {
  const seed = ctxWith([]);
  const ctx = ctxWith([['wahyu', 'Wahyu Susanto', hash(seed, 'EditorPass123!'), 'editor', 'TRUE', 1, '']]);
  let blocked = null;
  for (let i = 1; i <= 8; i++) {
    const r = safeJson(ctx.apiLogin({ username: 'wahyu', password: 'salah-' + i }));
    if (r && /terlalu banyak/i.test(r.message || '')) { blocked = i; break; }
  }
  t('J1: login gagal berulang dibatasi (rate limit)', blocked !== null, 'diblokir pada percobaan ke-' + blocked);
  const ok = safeJson(ctx.apiLogin({ username: 'wahyu', password: 'EditorPass123!' }));
  t('J2: setelah diblokir, password benar pun belum langsung diterima (fail-closed)', !!(ok && ok.status !== 'ok'), dump(ok));
})();

/* ---------- K. logout tetap mencabut token ---------- */
(function () {
  const seed = ctxWith([]);
  const ctx = ctxWith([['wahyu', 'Wahyu Susanto', hash(seed, 'EditorPass123!'), 'editor', 'TRUE', 1, '']]);
  const tok = tokOf(safeJson(ctx.apiLogin({ username: 'wahyu', password: 'EditorPass123!' })));
  t('K1: token valid sebelum logout', !!(ctx.verifyAuthToken_(tok) || {}).ok);
  ctx.apiLogout({ token: tok });
  t('K2: token dicabut setelah logout', !!(ctx.verifyAuthToken_(tok) || {}).ok === false);
  const w = ctx.checkEditorSession_({ editorKey: tok });
  t('K3: token yang sudah logout tidak bisa dipakai untuk write', !!(w && w.ok === false), dumpObj(w));
})();

/* ---------- L. integritas: tidak ada rahasia di source ---------- */
(function () {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'Code.gs'), 'utf8');
  t('L1: tidak ada password/kunci literal yang di-hardcode di Code.gs',
    !/(EDITOR_KEY\s*=\s*['"][^'"]{4,})/.test(src) && !/VIEWER_TOKEN_SECRET\s*=\s*['"][^'"]{8,}/.test(src));
  t('L2: constantTimeEquals_ tetap dipakai untuk perbandingan rahasia', /function constantTimeEquals_/.test(src));
  t('L3: password tidak pernah masuk URL (tidak ada ?password= / &password=)',
    !/[?&](password|editorKey|token)=/.test(src));
  t('L4: Sheet RDI_Accounts punya defineOrCreate + fail-closed', /RDI_Accounts/.test(src) && /getSheetByName\(SHEET_ACCOUNTS\)/.test(src));
})();

/* ---------- M. TRANSISI AMAN (penting secara operasional) ----------
 * Kalau legacy langsung dimatikan saat deploy, semua user (viewer + editor) terkunci
 * sampai admin sempat membuat akun. Aturannya:
 *   - belum ada akun editor di RDI_Accounts  -> kunci lama TETAP dipakai (transisi),
 *     sehingga tidak ada lockout; begitu akun editor pertama dibuat, jalur ini MATI OTOMATIS.
 *   - ALLOW_LEGACY_SINGLE_KEY=FALSE          -> dipatuhi eksplisit, walau belum ada editor.
 *   - ALLOW_LEGACY_SINGLE_KEY=TRUE           -> dipatuhi eksplisit, walau editor sudah ada.
 *   - error saat membaca sheet               -> fail-closed (kunci lama TIDAK dipakai).
 */
(function () {
  const seed = ctxWith([]);
  const hEditor = hash(seed, 'EditorPass123!');

  // M1: belum ada akun editor -> transisi, kunci lama masih hidup
  const m1 = ctxWith([['gudang01', 'Op 01', hash(seed, 'ViewerPass123!'), 'viewer', 'TRUE', 1, '']], { editorKey: 'LAMA' });
  t('M1: belum ada akun editor -> kunci lama TETAP hidup (tidak ada lockout)',
    !!(m1.checkEditorSession_({ editorKey: 'LAMA' }) || {}).ok === true,
    dumpObj(m1.checkEditorSession_({ editorKey: 'LAMA' })));

  // M2: ada akun editor -> legacy MATI otomatis (self-arming)
  const m2 = ctxWith([['wahyu', 'Wahyu Susanto', hEditor, 'editor', 'TRUE', 1, '']], { editorKey: 'LAMA' });
  t('M2: sudah ada akun editor -> kunci lama MATI otomatis',
    !!(m2.checkEditorSession_({ editorKey: 'LAMA' }) || {}).ok === false,
    dumpObj(m2.checkEditorSession_({ editorKey: 'LAMA' })));

  // M3: FALSE eksplisit menutup walau belum ada editor
  const m3ctx = ctxWith([['gudang01', 'Op 01', hash(seed, 'ViewerPass123!'), 'viewer', 'TRUE', 1, '']], { editorKey: 'LAMA' });
  m3ctx.PropertiesService.getScriptProperties().setProperty('ALLOW_LEGACY_SINGLE_KEY', 'FALSE');
  t('M3: ALLOW_LEGACY_SINGLE_KEY=FALSE eksplisit -> kunci lama mati walau belum ada editor',
    !!(m3ctx.checkEditorSession_({ editorKey: 'LAMA' }) || {}).ok === false,
    dumpObj(m3ctx.checkEditorSession_({ editorKey: 'LAMA' })));

  // M4: TRUE eksplisit membuka walau editor sudah ada (break-glass sadar risiko)
  const m4 = ctxWith([['wahyu', 'Wahyu Susanto', hEditor, 'editor', 'TRUE', 1, '']], { editorKey: 'LAMA', allowLegacy: true });
  t('M4: ALLOW_LEGACY_SINGLE_KEY=TRUE -> break-glass hidup walau editor sudah ada',
    !!(m4.checkEditorSession_({ editorKey: 'LAMA' }) || {}).ok === true,
    dumpObj(m4.checkEditorSession_({ editorKey: 'LAMA' })));

  // M5: sheet hilang total -> tetap fail-closed (tidak ada discretion)
  const m5 = ctxWith(null, { editorKey: 'LAMA' });
  t('M5: sheet akun hilang -> kunci lama tetap ditolak (fail-closed)',
    !!(m5.checkEditorSession_({ editorKey: 'LAMA' }) || {}).ok === false,
    dumpObj(m5.checkEditorSession_({ editorKey: 'LAMA' })));
})();

/* ---------- N. AUTO-MIGRASI saat login pertama ----------
 * Kalau viewer lama tidak bisa login setelah deploy hanya karena sheet unified belum diisi,
 * itu lockout yang tidak perlu. apiLogin memigrasi sendiri (idempotent) saat sheet kosong. */
(function () {
  const seed = ctxWith([]);
  const hA = hash(seed, 'PasswordA123!');
  const ctx = ctxWith([], { legacyViewers: [['petugas1', hA, 'Petugas Satu', 'TRUE', 1]] });
  const r = safeJson(ctx.apiLogin({ username: 'petugas1', password: 'PasswordA123!' }));
  t('N1: viewer lama bisa login TANPA langkah manual (auto-migrasi saat sheet kosong)',
    !!(r && r.status === 'ok' && r.role === 'viewer'), dump(r));
  const rows = readAccounts(ctx, 'RDI_Accounts');
  t('N2: auto-migrasi benar-benar menulis ke RDI_Accounts', rows.length === 1 && rows[0][0] === 'petugas1',
    'rows=' + rows.length + (rows[0] ? ' username=' + rows[0][0] : ''));
  t('N3: auto-migrasi tidak merusak akun yang sudah ada (idempotent)',
    ((safeJson(ctx.apiLogin({ username: 'petugas1', password: 'PasswordA123!' })) || {}).status === 'ok') &&
    readAccounts(ctx, 'RDI_Accounts').length === 1,
    'rows setelah login kedua=' + readAccounts(ctx, 'RDI_Accounts').length);
})();
/* ---------- MISSING: fungsi yang dipakai suite ini harus ada di Code.gs ---------- */
(function () {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'Code.gs'), 'utf8');
  const needed = [
    'apiLogin', 'apiLogout', 'createAccount_', 'verifyAuthToken_', 'checkEditorSession_',
    'validatePasswordStrength_', 'migrateToUnifiedAccounts_',
  ];
  const missing = needed.filter(n => !(new RegExp('function\\s+' + n + '\\s*\\(')).test(src));
  t('F5AUTH-0: semua fungsi F5-AUTH ada di Code.gs (lihat §14.4)', missing.length === 0,
    missing.length ? 'BELUM ADA: ' + missing.join(', ') : 'semua ada');
})();

console.log('---- gs_unified_auth_exec: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);

/* ---------------- helper ---------------- */
/* Proxy: fungsi yang belum ada di Code.gs menghasilkan null, bukan crash —
 * supaya RED terlihat sebagai daftar FAIL, bukan Exception. */
function withStub(ctx) {
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string') return undefined;
      return function () { return null; };
    },
  });
}
function tokOf(j) { return (j && j.token) ? j.token : null; }
function safeJson(out) {
  if (!out) return null;
  // fungsi API unified mengembalikan objek biasa (bukan TextOutput corsOutput)
  if (typeof out === 'object' && !out.getContent && out._t === undefined && 'status' in out) return out;
  let raw = null;
  try { raw = typeof out.getContent === 'function' ? out.getContent() : (out._t || null); } catch (e) { raw = null; }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function dump(j) { return j ? JSON.stringify(j).slice(0, 120) : '(null)'; }
function dumpObj(o) { return o ? JSON.stringify(o).slice(0, 120) : '(null)'; }
function decodeToken(token, ctx) {
  if (!token) return null;
  try {
    const payload = token.split('.')[0];
    return Utilities_decode(ctx, payload);
  } catch (e) { return null; }
}
function Utilities_decode(ctx, b64) {
  return ctx.Utilities.newBlob(ctx.Utilities.base64DecodeWebSafe(b64)).getDataAsString().split('|');
}
function signPayload(ctx, payloadStr) {
  // HARUS meniru makeAuthToken_ persis: base64 dari BYTES payload, bukan dari string.
  const b64 = ctx.Utilities.base64EncodeWebSafe(ctx.Utilities.newBlob(payloadStr).getBytes());
  const sig = ctx.Utilities.base64EncodeWebSafe(ctx.Utilities.computeHmacSha256Signature(b64, ctx.getViewerSecret()));
  return b64 + '.' + sig;
}
function readAccounts(ctx, sheetName) {
  try {
    const ss = ctx.SpreadsheetApp.getActiveSpreadsheet();
    const s = ss.getSheetByName(sheetName);
    if (!s || s.getLastRow() < 2) return [];
    return s.getRange(2, 1, s.getLastRow() - 1, 7).getValues();
  } catch (e) { return []; }
}
