// F-05 — Export QR massal (L1 pure/static) — RED first
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const util = fs.readFileSync(path.join(ROOT, 'js', 'util.js'), 'utf8');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + ' | ' + (detail !== undefined ? detail : true)); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (detail !== undefined ? detail : false)); }
}

// UI
t('F-05 btn-export-qr exists', src.includes('id="btn-export-qr"') || /btn-export-qr/.test(src), /btn-export-qr/.test(src));
t('F-05 modal-export-qr exists', /id="modal-export-qr"|modal-export-qr/.test(src), /modal-export-qr/.test(src));
t('F-05 more drawer entry', /Export QR/.test(src), /Export QR/.test(src));

// Functions
t('F-05 openExportQRModal defined', /function\s+openExportQRModal\s*\(/.test(src), true);
t('F-05 closeExportQRModal defined', /function\s+closeExportQRModal\s*\(/.test(src), true);
t('F-05 doExportQR defined', /function\s+doExportQR\s*\(/.test(src), true);
t('F-05 exportQRMassal alias or open wired', /openExportQRModal|exportQRMassal/.test(src), true);

// Wiring: button opens modal
t('F-05 button onclick opens modal', /onclick="openExportQRModal\(\)|onclick="exportQRMassal\(\)/.test(src), true);

// doExportQR body checks
const doMatch = src.match(/function\s+doExportQR\s*\([^)]*\)\s*\{([\s\S]{0,2500})/);
t('F-05 doExportQR body found', !!doMatch, !!doMatch);
if (doMatch) {
  const body = doMatch[1];
  t('F-05 uses buildQrPayload', /buildQrPayload\(/.test(body), true);
  t('F-05 uses qrImgSrc', /qrImgSrc\(/.test(body), true);
  t('F-05 has html format branch', /html/.test(body), true);
  t('F-05 has png format branch', /png/.test(body) || /toDataURL/.test(body), true);
  t('F-05 empty guard', /alert\(|length\s*===\s*0|!\w+\.length/.test(body), true);
  t('F-05 escapes via xe or ex', /xe\(|ex\(/.test(body), true);
  t('F-05 filename QR-RDI', /QR-RDI/.test(body), true);
}

// Scope selection
t('F-05 scope select present', /id="qr-export-scope"/.test(src) && /value="all"/.test(src) && /value="filtered"/.test(src) && /value="selected"/.test(src), true);
t('F-05 format select present', /id="qr-export-format"/.test(src) && /value="html"/.test(src) && /value="png"/.test(src), true);

// buildQrPayload available (util.js)
t('F-05 buildQrPayload in util.js', /function\s+buildQrPayload\s*\(/.test(util), true);
t('F-05 qrImgSrc in util.js', /function\s+qrImgSrc\s*\(/.test(util), true);

// --- Simulation: payload + scope ---
function buildQrPayload(id, nama, rak) {
  var qrID = id && String(id).trim() !== '' ? String(id).trim() : '';
  return qrID + '|' + nama + '|' + (rak || '');
}
t('sim: payload id|nama|rak', buildQrPayload('A1', 'Bolt', 'R1') === 'A1|Bolt|R1', buildQrPayload('A1', 'Bolt', 'R1'));
t('sim: empty id stays empty prefix', buildQrPayload('', 'X', '') === '|X|', buildQrPayload('', 'X', ''));
t('sim: undefined rak empty', buildQrPayload('A', 'N', undefined) === 'A|N|', buildQrPayload('A', 'N', undefined));

function scopeRows(all, filtered, selectedIds, scope) {
  if (scope === 'selected') return all.filter(r => selectedIds.has(r.id));
  if (scope === 'filtered') return filtered;
  return all;
}
const all = [{ id: 'A1' }, { id: 'A2' }, { id: 'A3' }];
const filtered = [{ id: 'A1' }, { id: 'A2' }];
const sel = new Set(['A3']);
t('sim: scope=all => 3', scopeRows(all, filtered, sel, 'all').length === 3, true);
t('sim: scope=filtered => 2', scopeRows(all, filtered, sel, 'filtered').length === 2, true);
t('sim: scope=selected => 1', scopeRows(all, filtered, sel, 'selected').length === 1, true);

function safeFilename(id) { return String(id || 'item').replace(/[^\w-]/g, '_'); }
t('sim: filename sanitizes', safeFilename('A/1 B') === 'A_1_B', safeFilename('A/1 B'));

console.log('=== F-05 EXPORT QR MASSAL: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
