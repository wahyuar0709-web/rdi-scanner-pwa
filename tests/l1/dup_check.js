/* L1 gate keunikan definisi (2026-09-27) — sebelumnya file ini printer diagnostik 0-assert.
 * Gunanya: IIFE 'use strict' + 190 export window berarti penulisan ulang diam-diam (shadow)
 * tidak akan ketahuan. Suite ini mengunci:
 *   - fungsi yang WAJIB tunggal (1 definisi) di seluruh file front-end
 *   - duplikasi yang DISENGAJA (baseline) — kalau berubah, suite gagal → wajib update di sini
 *   - fungsi backend TIDAK boleh ikut terdefinisi di front-end (boundary FE/BE) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const FE_FILES = ['index.html', 'js/util.js', 'js/format.js', 'js/cetak.js', 'js/outbox.js'];
let fe = '';
FE_FILES.forEach(f => { fe += '\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'); });

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
const defs = fn => (fe.match(new RegExp('function\\s+' + fn.replace(/\$/g, '\\$') + '\\s*\\(', 'g')) || []).length;

// 1. WAJIB TUNGGAL — identitas aplikasi & kontrak API
const MUST_UNIQUE = [
  'xe', 'xeJs', 'ex', 'qrImgSrc', 'rakDisplay', 'buildQrPayload',
  'gasGet', 'gasPost', 'genRequestId', 'checkUrl',
  'readOutbox', 'writeOutbox', 'pushOutbox', 'removeOutboxByRequestId', 'flushOutbox',
  'readSecureStorage', 'writeSecureStorage', 'clearSecureStorage', 'enforceSessionIdle', '_touchSessionActivity',
  'hasValidSession', 'forceReLogin', 'submitViewerLogin', 'logoutViewer', 'logoutEditor',
  'switchTab', 'showStatus', 'hideStatus', 'saveConfig',
  'submitTransaksi', 'lookupItem', 'showResult', 'checkLedgerReconciliation',
  'buildLabelHTML', 'buildPrintHTML', 'buildRakLabelHTML', 'labelPerPage', 'downloadLabelPDF', 'buildLabelPDFDoc',
  'openAddSheet', 'saveAddItem', 'openEditSheet', 'saveEditItem',
  'loadData', 'renderTable', 'loadAlert', 'loadHistory', 'loadAllHistory', 'renderCetakList',
];
MUST_UNIQUE.forEach(fn => {
  const n = defs(fn);
  t('definisi tunggal: ' + fn + '()', n === 1, 'def=' + n);
});

// 2. DUPLIKASI YANG DISENGAJA (baseline — ubah = harus update suite ini)
const ALLOWED_DUP = {
  'attempt': { n: 2, why: 'inner helper retry di gasGet & gasPost (satu per fungsi)' },
  'onStart': { n: 3, why: '3 handler drag-to-close: item-detail, aset-detail, aset-unit-detail' },
  'onMove': { n: 3, why: 'sama dengan onStart' },
  'onEnd': { n: 3, why: 'sama dengan onStart' },
  'showModal': { n: 2, why: 'inner helper pada 2 modal Aset (scope terpisah)' },
};
Object.keys(ALLOWED_DUP).forEach(fn => {
  const spec = ALLOWED_DUP[fn];
  const n = defs(fn);
  t('duplikasi disengaja sesuai baseline: ' + fn + '() = ' + spec.n, n === spec.n, 'def=' + n + ' · ' + spec.why);
});

// 3. BOUNDARY FE/BE — fungsi server tidak boleh didefinisikan ulang di front-end
const BE_ONLY = ['postTransaksi', 'recalculateAllSaldo', 'getAsetEligibleUnits', 'apiViewerLogin',
  'getSheetData', 'checkEditorKey', 'verifyViewerToken', 'migrateToMultiRakSchema', 'setupSheets'];
BE_ONLY.forEach(fn => {
  const n = defs(fn);
  t('boundary FE/BE: ' + fn + '() tidak ada di front-end', n === 0, 'def=' + n);
});

// 4. Server tetap punya implementasi (kalau area ini dihapus, GE쪽 rusak tanpa suite ini)
const gs = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');
['function postTransaksi', 'function checkEditorKey', 'function verifyViewerToken',
 'function safeCell_', 'function recalculateAllSaldoLocked_', 'function acquirePerItemLock_',
 'function getAsetEligibleUnits', 'function recordAsetMovement'].forEach(pat => {
  t('Code.gs masih punya: ' + pat.replace('function ', ''), gs.indexOf(pat) >= 0);
});

// 5. Sisa marker refactor "moved → js/…" = dokumentasi F4.x, bukan error.
const movedMarkers = (fe.match(/moved → js\//g) || []).length;
t('marker "moved → js/…" terdokumentasi (F4.x, bukan error)', movedMarkers > 0, movedMarkers + ' marker di ' + FE_FILES.join(', '));

console.log('---- dup_check: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
