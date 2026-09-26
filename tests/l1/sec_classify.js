/* L1 gate keamanan (2026-09-27) — sebelumnya file ini mencetak token "FIXED/CLASS/OPEN"
 * yang tidak dikenali runner (0 assert) DAN 6 dari 12 verdict-nya HARDCODE (selalu "FIXED"
 * apa pun yang terjadi di Code.gs), plus process.exit(0) tanpa syarat.
 * Sekarang: setiap verdict diturunkan dari kode. Status yang dipakai:
 *   PASS  = properti keamanan benar-benar terverifikasi di source
 *   FAIL  = regresi (properti hilang/rusak) → gate merah
 *   ACCEPTED LIMITATION = temuan TERDAFTAR yang masih terbuka (ID + rujukan PLAN §1.4)
 * Exit non-zero hanya bila ada FAIL. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const gs = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const outbox = fs.readFileSync(path.join(ROOT, 'js', 'outbox.js'), 'utf8');

let pass = 0, fail = 0, limits = [];
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
function limit(id, name, detail) { limits.push(id); console.log('ACCEPTED LIMITATION | ' + id + ' ' + name + (detail ? ' | ' + detail : '')); }

function bodyOf(src, fname, max) {
  const i = src.indexOf('function ' + fname + '(');
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j > 0 ? Math.min(j, i + (max || 15000)) : i + (max || 15000));
}

/* ---------- A. GATE AUTENTIKASI ---------- */
const doGet = bodyOf(gs, 'doGet', 6000);
const doPost = bodyOf(gs, 'doPost', 9000);
t('SEC-A1: doGet mewajibkan auth (checkAnyAccess)', /checkAnyAccess\s*\(/.test(doGet));
t('SEC-A2: doGet membalas needLogin:true saat auth gagal', /needLogin\s*:\s*true/.test(doGet));
t('SEC-A3: doPost mewajibkan auth untuk baca (checkAnyAccess)', /checkAnyAccess\s*\(/.test(doPost));
t('SEC-A4: doPost mewajibkan editorKey untuk tulis (checkEditorKey)', /checkEditorKey\s*\(/.test(doPost));
t('SEC-A5: gate tulis dijalankan SEBELUM dispatch aksi tulis',
  doPost.indexOf('checkEditorKey(body)') >= 0 && doPost.indexOf('checkEditorKey(body)') < doPost.indexOf("'postTransaksi'"),
  'idx gate=' + doPost.indexOf('checkEditorKey(body)') + ' dispatch=' + doPost.indexOf("'postTransaksi'"));
t('SEC-A6: viewerLogin tetap dapat diakses tanpa auth (endpoint tiket)', /viewerLogin/.test(doPost) && !/checkEditorKey[\s\S]{0,200}viewerLogin/.test(doPost));
t('SEC-A7: editor key fail-closed bila Script Property kosong',
  /if\s*\(\s*!\s*required\s*\)\s*\{\s*return\s*\{\s*ok:\s*false/.test(bodyOf(gs, 'checkEditorKey', 2000)),
  'cek "if (!required) return {ok:false}" di checkEditorKey()');

/* ---------- B. KREDENSIAL & KRIPTO ---------- */
t('SEC-B1: perbandingan constant-time (constantTimeEquals_)', /function constantTimeEquals_/.test(gs));
t('SEC-B2: password di-hash (bukan plaintext) — verifyPasswordHash_', /function verifyPasswordHash_/.test(gs));
t('SEC-B3: KDF iteratif 100.000 iterasi', /100000/.test(gs) && /hashPasswordIterated_/.test(gs));
t('SEC-B4: format hash salt$iterations$hash', /makeSaltedPasswordHash_/.test(gs) && /split\('\$'\)/.test(gs));
t('SEC-B5: password default factory ditolak', /GANTI-PASSWORD-INI/.test(gs));
t('SEC-B6: tidak ada enumerasi user (pesan generik)', /Username atau password salah/.test(gs));
t('SEC-B7: secret token dari Script Properties, bukan hardcode', /VIEWER_TOKEN_SECRET/.test(gs) && /PropertiesService/.test(gs));
t('SEC-B8: tak ada secret hardcoded di front-end',
  !/EDITOR_KEY\s*=\s*['"][^'"]{8,}['"]/.test(html) && !/VIEWER_TOKEN_SECRET/.test(html));
t('SEC-B9: rate limit login viewer ada (5 gagal → lock 15 menit)',
  /fails\s*>=\s*5/.test(gs) && /fails\s*>=\s*5\s*\?\s*900\s*:\s*300/.test(gs) && /15 menit/.test(gs),
  'rateLimitViewerLogin_ + recordViewerLoginFail_ (TTL 900s)');

/* ---------- C. TOKEN & REPLAY ---------- */
t('SEC-C1: token membawa passwordVersion (pv)', /pvStr/.test(gs) && /function passwordPv_/.test(gs));
t('SEC-C2: verifyViewerToken membandingkan pv', /expectedHashPv/.test(gs) || /passwordPv/i.test(bodyOf(gs, 'verifyViewerToken', 4000)));
t('SEC-C3: denylist logout (token_deny_ + TTL)', /token_deny_/.test(gs) && /function apiViewerLogout/.test(gs));
t('SEC-C4: TTL token 6 jam (bukan 12 jam / 30 hari)', /6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(gs) && !/12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(gs));
t('SEC-C5: viewerLogout tidak bocor status token (selalu status ok)',
  /function apiViewerLogout[\s\S]{0,700}status:\s*'ok'/.test(gs));

/* ---------- D. INTEGRITAS TRANSAKSI ---------- */
t('SEC-D1: idempotensi requestId + body signature', /trx_req_/.test(gs) && /bodySig/.test(gs));
t('SEC-D2: mutex per item (acquirePerItemLock_)', /function acquirePerItemLock_/.test(gs) && /waitLock/.test(gs));
t('SEC-D3: validasi KELUAR tidak melebihi saldo RAK', /saldoSebelumRak/.test(gs));
t('SEC-D4: KELUAR hanya dari item berstatus Aktif (anti arsip)',
  /item\.status\s*===\s*'Arsep?'|item\.status\s*===\s*'Arsip'/.test(bodyOf(gs, 'postTransaksi', 20000)) && /Arsip/.test(bodyOf(gs, 'postTransaksi', 20000)),
  'cek "if (item.status === \'Arsip\') return error" di postTransaksi()');
t('SEC-D5: updateSaldo melempar error (tidak diam-diam)', /throw new Error/.test(bodyOf(gs, 'updateSaldo', 4000)));
t('SEC-D6: kegagalan sinkron dilaporkan sebagai partial (bukan "ok")',
  /status:\s*saldoSyncOk\s*\?\s*'ok'\s*:\s*'partial'/.test(gs) && /saldoSyncWarning/.test(gs));
t('SEC-D7: safeCell_ (formula-injection guard) dipakai di jalur tulis Master/Transaksi',
  ['postTransaksi', 'updateItem', 'addItem', 'updateSaldo', 'updateRakSaldo']
    .every(fn => /safeCell_\(/.test(bodyOf(gs, fn, 6000))),
  ['postTransaksi', 'updateItem', 'addItem', 'updateSaldo', 'updateRakSaldo'].filter(fn => !/safeCell_\(/.test(bodyOf(gs, fn, 6000))).join(',') || 'semua pakai');

/* ---------- E. FRONT-END SECURITY ---------- */
t('SEC-E1: tidak ada eval/new Function di index.html', !/eval\s*\(/.test(html) && !/new Function\s*\(/.test(html));
t('SEC-E2: kredensial dikirim di BODY POST, bukan query string',
  /kredensial pindah ke BODY POST/.test(outbox) && /params\.editorKey\s*=/.test(outbox) && /params\.viewerToken\s*=/.test(outbox)
    && !/fetch\(\s*GAS_URL\s*\+/.test(outbox) && !/[?&]editorKey=/.test(outbox),
  'kredensial masuk ke body params; tidak ada (?editorKey= di URL');
t('SEC-E3: postMessage scanner validasi origin', /e\.origin\s*!==\s*location\.origin/.test(html));
t('SEC-E4: sesi dual-write + idle 2 jam (regression lock fix 2026-09-26)',
  /var SESSION_IDLE_MS=2\*60\*60\*1000/.test(html) && /function enforceSessionIdle/.test(html));
t('SEC-E5: enforceSessionIdle dijalankan SEBELUM migrasi storage (regression lock)',
  html.indexOf('enforceSessionIdle();(function(){var editorKey=') > 0
    && html.indexOf('enforceSessionIdle();(function(){var editorKey=') < html.indexOf('EDITOR_KEY=readSecureStorage('),
  'idx enforce=' + html.indexOf('enforceSessionIdle();(function(){var editorKey=') + ' < idx re-read=' + html.indexOf('EDITOR_KEY=readSecureStorage('));
t('SEC-E6: migrasi tidak lagi menghapus salinan localStorage (resume copy)',
  !/localStorage\.removeItem\('rdi_viewer_token'\)/.test(html));
t('SEC-E7: TTL editor key 30 hari', /EDITOR_KEY_TTL_DAYS=30/.test(html));
t('SEC-E8: outbox tidak menulis kredensial ke log', !/console\.(log|warn)\([^)]*(editorKey|viewerToken|EDITOR_KEY)/.test(html + outbox));
t('SEC-E9: viewer mode memblokir tulis di sisi client', /Mode lihat-saja/.test(outbox + html));
t('SEC-E10: sessionStorage jadi penyimpanan utama token (bukan localStorage-only)',
  /function readSecureStorage[\s\S]{0,160}sessionStorage\.getItem/.test(html));

/* ---------- F. TEMUAN TERDAFTAR (belum ditutup) ---------- */
const asetNoSafe = ['addAsetItem', 'addAsetUnit', 'recordAsetMovement', 'addMasterValue']
  .filter(fn => !/safeCell_\(/.test(bodyOf(gs, fn, 6000)));
if (asetNoSafe.length) limit('BE-05', 'formula-injection guard tidak ada di jalur tulis modul Aset + addMasterValue',
  'fungsi=' + asetNoSafe.join(',') + ' · CELL ENTERPRISE/Sheet bisa meng-eksekusi formula dari input user');
if (/headers\['X-Editor-Key'\]/.test(gs)) limit('BE-07', 'jalur kredensial via header mati (GAS lowercase-kan nama header)',
  'sementara query string ?editorKey= masih diterima di Code.gs:849-851');
if (!/Audit_Log|AUDIT_LOG/.test(gs)) limit('BE-03', 'tidak ada audit log mutasi/auth',
  'jejak aktor hanya kolom Transaksi_Log.Admin (bisa kosong/kosong dari client)');
if (/checkAnyAccess[\s\S]{0,200}checkEditorKey/.test(gs) && /verifyPasswordHash_/.test(gs)) {
  const shortCircuit = /if\s*\(\s*!\s*editorKey\s*\)\s*return\s*\{?\s*(ok:\s*false|none)/.test(bodyOf(gs, 'checkEditorAccountKey_', 2500))
    || /if\s*\(\s*!editorKey\s*\)/.test(bodyOf(gs, 'checkEditorAccountKey_', 2500));
  if (!shortCircuit) limit('BE-01', 'KDF 100k iterasi dijalankan untuk setiap request baca/anonim',
    'belum ada short-circuit saat editorKey kosong → amplifier rate-limit');
}
if (!/ALLOW_EDITOR_KEY_FALLBACK/.test(gs)) limit('BE-02', 'perlu rate limit untuk editor key', '');
else t('SEC-F1: ada penanda ALLOW_EDITOR_KEY_FALLBACK (hardening Editor_Accounts)', true);
if (/cdn\.jsdelivr/.test(html)) limit('CL-03', '2 CDN tanpa SRI (xlsx, html2pdf)',
  'integrity= count=' + (html.match(/integrity=/g) || []).length);
if (/localStorage\.setItem\('rdi_viewer_token'/.test(html)) limit('CL-01', 'token viewer juga di localStorage (resume copy)',
  'dibatasi idle 2 jam + TTL server 6 jam + denylist logout (resmi diperbaiki 2026-09-26)');
if (/\.slice\(-20\)/.test(outbox)) limit('OFF-01', 'outbox dipotong 20 entri (transaksi offline tertua hilang diam-diam)',
  'js/outbox.js:28 —verified runtime: cap-1..cap-5 hilang');

console.log('---- sec_classify: ' + pass + ' PASS / ' + fail + ' FAIL / ' + limits.length + ' ACCEPTED LIMITATION ----');
process.exit(fail ? 1 : 0);
