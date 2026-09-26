/* tests/tools/gs_harness.js — harness L1 untuk mengeksekusi Code.gs (Apps Script) di Node.
 *
 * TUJUAN: sampai 2026-09-27, Code.gs (202 KB / 4.041 baris / 104 fungsi) TIDAK punya test
 * eksekutabel — semua "coverage" backend hanya regex/simulasi model sendiri (yang tidak
 * membaca file produksi). File ini membuat backend bisa diuji sungguhan tanpa deploy:
 * memuat Code.gs apa adanya ke dalam vm context dengan stub SpreadsheetApp / CacheService /
 * LockService / Utilities / PropertiesService / ContentService.
 *
 * yang di-fake (cukup untuk postTransaksi, auth, stok, aset):
 *   - Spreadsheet: sheet in-memory 2-d, getRange/setValues/appendRow/clearContents/getLastRow
 *   - CacheService: Map + TTL (deterministik, jam dikontrol lewat _now)
 *   - LockService: always-available lock (untuk menguji logika di dalam lock)
 *   - Utilities: computeDigest/computeHmacSha256 (Node crypto), getUuid, sleep, formatDate
 *   - PropertiesService: object in-memory Script Properties
 *
 * CATATAN PENTING: ini harness, bukan emulator Sheets. Yang diuji adalah KODE yang kita
 *Adventurepedua menulis (val, mutasi, idempotensi, gate auth) — bukan timing/race GAS sungguhan.
 * Batas kesimpulan: L1 (offline, deterministik). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');

/* ---------------- fake Utilities (SHA/HMAC sungguhan) ----------------
 * PENTING: Apps Script mengembalikan computeDigest() sebagai byte[] yang BERPERILAKU
 * seperti Array (punya .map yang menghasilkan Array of string). Node Buffer TIDAK punya
 * .map → hasilnya Uint8Array dan hashPasswordHex_ di Code.gs jadi garbage
 * ("uuid…$100000$0051003200…"). Karena itu di sini dikembalikan ARRAY of byte
 * (0..255), sama seperti GAS. */
function makeUtilities() {
  let uuidCounter = 0;
  const asBytes = (buf) => Array.from(buf);
  return {
    Charset: { UTF_8: 'UTF_8' },
    DigestAlgorithm: { SHA_256: 'SHA_256', SHA1: 'SHA1', MD5: 'MD5' },
    MimeType: { JSON: 'application/json', HTML: 'text/html', PLAIN_TEXT: 'text/plain' },
    // UUID v4 sungguhan (hex) — sama seperti Utilities.getUuid() di GAS. Kalau fake
    // memakai teks bebas, regex validasi hash di suite jadi tidak realistis.
    getUuid: () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
    sleep: (ms) => { /* sinkron: tidak benar-benar menunggu */ },
    computeDigest(algorithm, value, charset) {
      const alg = 'sha' + String(algorithm).toLowerCase().replace(/[^0-9]/g, '');
      return asBytes(crypto.createHash(alg).update(String(value), 'utf8').digest());
    },
    computeHmacSha(algorithm, value, key) {
      return asBytes(crypto.createHmac('sha' + String(algorithm).toLowerCase().replace(/[^0-9]/g, ''), String(key)).update(String(value), 'utf8').digest());
    },
    base: {
      encode: (bytes) => Buffer.from(Array.from(bytes).map(b => b & 0xFF)).toString('base64'),
      decode: (b64) => Array.from(Buffer.from(String(b64), 'base64')),
      encodeWebSafe: (bytes) => Buffer.from(Array.from(bytes).map(b => b & 0xFF)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      decodeWebSafe: (s) => Array.from(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    },
    formatDate: (d, tz) => {
      const date = (d instanceof Date) ? d : new Date(d);
      return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    },
    newBlob: (data) => makeBlob(data),
  };
}

/* Apps Script juga menyediakan versi TOP-LEVEL ( Utilities.base64EncodeWebSafe(...) ),
 * yang dipakai Code.gs untuk body signature idempotensi postTransaksi. Tanpa ini bodySig
 * jatuh ke catch → 'nosig' → retry dengan requestId sama tapi body BERBEDA dianggap duplikat
 * (test jadi bohong). Alias wajib sama persis dengan GAS. */
function attachUtilitiesAliases(u) {
  const norm = (bytes) => Array.from(bytes).map(b => b & 0xFF);
  u.base64Encode = (bytes) => Buffer.from(norm(bytes)).toString('base64');
  u.base64EncodeWebSafe = (bytes) => Buffer.from(norm(bytes)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  u.base64Decode = (b64) => Array.from(Buffer.from(String(b64), 'base64'));
  u.base64DecodeWebSafe = (s) => Array.from(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  u.computeHmacSha256 = (v, k) => u.computeHmacSha('SHA_256', v, k);
  u.computeHmacSha512 = (v, k) => u.computeHmacSha('SHA_512', v, k);
  // GAS: signature HMAC = base64 dari HMAC-SHA256 (dipakai Code.gs:576 untuk token viewer)
  u.computeHmacSha256Signature = (value, key) =>
    Buffer.from(norm(u.computeHmacSha('SHA_256', value, key))).toString('base64');
  u.getScriptTimeZone = () => 'Asia/Jakarta';
  return u;
}

/* Blob GAS: newBlob menerima string ATAU byte[]; getBytes() → array of byte,
 * getDataAsString() → string UTF-8. Code.gs memakainya dua arah: encode payload token
 * (string → bytes) dan decode payload saat verifikasi (bytes → string).
 * Implementasi pertama mengabaikan argumen sehingga payload token kosong. */
function makeBlob(data) {
  let buf;
  if (data === undefined || data === null) buf = Buffer.alloc(0);
  else if (Array.isArray(data) || ArrayBuffer.isView(data)) buf = Buffer.from(Array.from(data).map(b => b & 0xFF));
  else buf = Buffer.from(String(data), 'utf8');
  return {
    _buf: buf,
    getBytes: () => Array.from(buf),
    getDataAsString: () => buf.toString('utf8'),
    getContentType: () => 'application/octet-stream',
    getName: () => 'blob',
    setBytes: (b) => { buf = Buffer.from(Array.from(b).map(x => x & 0xFF)); },
  };
}

/* ---------------- fake CacheService (TTL deterministik) ---------------- */
function makeCacheService(clock) {
  const store = new Map();
  return {
    _store: store,
    getScriptCache() {
      return {
        get: (k) => {
          const e = store.get(k);
          if (!e) return null;
          if (e.expires && clock.now() > e.expires) { store.delete(k); return null; }
          return e.value;
        },
        put: (k, v, ttl) => { store.set(k, { value: String(v), expires: ttl ? clock.now() + Number(ttl) * 1000 : 0 }); },
        remove: (k) => { store.delete(k); },
      };
    },
  };
}

/* ---------------- fake LockService (selalu berhasil) ---------------- */
function makeLockService() {
  return {
    getScriptLock() { return { waitLock: () => true, releaseLock: () => true, tryLock: () => true }; },
    getUserLock() { return { waitLock: () => true, releaseLock: () => true, tryLock: () => true }; },
  };
}

/* ---------------- fake Spreadsheet (in-memory) ---------------- */
/* Range: LIVE VIEW ke array data sheet.
 * PENTING: di Google Sheets, sheet.getRange(...).setValue() MENULIS ke sheet.
 * Implementasi pertama harness ini mengembalikan copy sehingga semua updateSaldo/
 * updateRakSaldo "sukses" tapi tidak pernah benar-benar mengubah data — test pun
 * bohong. Range di bawah menyimpan reference ke data + offset, jadi setValue/setValues
 * menulis ke sheet sungguhan. */
function makeRange(data, r0, c0, nr, nc) {
  const readAll = () => {
    const out = [];
    for (let i = 0; i < nr; i++) {
      const row = [];
      for (let j = 0; j < nc; j++) {
        const src = data[r0 + i];
        const v = src ? src[c0 + j] : '';
        row.push(v === undefined ? '' : v);
      }
      out.push(row);
    }
    return out;
  };
  const self = {
    _isRange: true,
    getValues: readAll,
    getValue: () => { const src = data[r0]; const v = src ? src[c0] : ''; return v === undefined ? '' : v; },
    setValues(v) {
      for (let i = 0; i < v.length; i++) {
        if (!data[r0 + i]) data[r0 + i] = [];
        for (let j = 0; j < v[i].length; j++) data[r0 + i][c0 + j] = v[i][j];
      }
      return self;
    },
    setValue(v) {
      if (!data[r0]) data[r0] = [];
      data[r0][c0] = v;
      return self;
    },
    clearContent() {
      for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { if (data[r0 + i]) data[r0 + i][c0 + j] = ''; }
      return self;
    },
  };
  // no-op styling (tidak relevan untuk logika)
  ['setFontWeight', 'setBackground', 'setFontColor', 'setHorizontalAlignment', 'setVerticalAlignment',
    'setColumnWidth', 'setColumnWidths', 'setRowHeights', 'setWrap', 'setNumberFormat', 'setBorder',
    'setFontSize', 'setFontFamily', 'setMerge', 'setFrozenRows', 'autoResizeColumns', 'setNote',
    'setText', 'setDataValidation'].forEach(m => { self[m] = () => self; });
  return self;
}
function makeSheet(name, initial) {
  const data = (initial || []).map(r => r.slice());
  const self = {
    _name: name, _data: data,
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => (data[0] ? data[0].length : 0),
    getMaxRows: () => data.length,
    getMaxColumns: () => (data[0] ? data[0].length : 0),
    getDataRange: () => makeRange(data, 0, 0, data.length, (data[0] || []).length),
    getRange(a, b, c, d) {
      if (b === undefined) {
        // getRange(nRows) atau getRange(nRows, nCols)
        const nr = a, nc = c !== undefined ? c : (data[0] ? data[0].length : 0);
        return makeRange(data, 0, 0, nr, nc);
      }
      const r0 = a - 1, c0 = b - 1, nr = c, nc = d === undefined ? 1 : d;
      return makeRange(data, r0, c0, nr, nc);
    },
    getRangeList(list) {
      // cukup untuk findRowsByNumbers_ (dipakai getHistory/getStockLedger): gabung semua range
      const all = [];
      (list && list.ranges ? list.ranges : []).forEach(rg => {
        const vals = rg.getValues();
        vals.forEach(row => all.push(row));
      });
      return makeRange(all, 0, 0, all.length, (all[0] || []).length);
    },
    appendRow(row) { data.push((Array.isArray(row) ? row : [row]).slice()); return self; },
    setFrozenRows() { return self; },
    clearContents() { data.length = 0; return self; },
    autoResizeColumns() { return self; },
    setColumnWidth() { return self; }, setColumnWidths() { return self; },
    insertSheet() { return makeSheet('NewSheet', []); },
    deleteRow() { return self; }, deleteColumn() { return self; }, insertRowAfter() { return self; },
  };
  return self;
}
function makeSpreadsheet(sheets) {
  const byName = {};
  sheets.forEach(s => { byName[s._name] = s; });
  const ss = {
    _sheets: sheets,
    getActiveSpreadsheet: () => ss,
    getSheets: () => sheets,
    getSheetByName: (n) => byName[n] || null,
    _addSheet(n, initial) { const s = makeSheet(n, initial); sheets.push(s); byName[n] = s; return s; },
    _byName: byName,
    flush: () => {},
  };
  return ss;
}

/* ---------------- loader Code.gs ke context ---------------- */
function loadCodeGS(opts) {
  const o = opts || {};
  const src = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');
  const clock = { now: () => (o.now === undefined ? Date.now() : o.now) };
  const props = Object.assign({ EDITOR_KEY: 'TEST-EDITOR-KEY', VIEWER_TOKEN_SECRET: 'test-token-secret', ALLOW_EDITOR_KEY_FALLBACK: 'TRUE' }, o.props || {});
  const ss = o.spreadsheet || makeSpreadsheet([]);
  const util = attachUtilitiesAliases(makeUtilities());
  const sandbox = {
    SpreadsheetApp: makeSpreadsheetApi(ss),
    CacheService: makeCacheService(clock),
    LockService: makeLockService(),
    Utilities: util,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props[k] === undefined ? null : String(props[k])), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; }, getProperties: () => props }) },
    ContentService: { createTextOutput: (t) => ({ _t: t, setMimeType: () => ({ getContent: () => t }) }), MimeType: util.MimeType },
    SessionService: { getActiveUser: () => ({ getEmail: () => 'tester@example.com' }) },
    Logger: { log: () => {} },
    console: { log: () => {}, error: () => {}, warn: () => {} },
    Math: Math, JSON: JSON, Date: Date, String: String, Number: Number, Array: Array, Object: Object,
    parseInt: parseInt, parseFloat: parseFloat, isFinite: isFinite, isNaN: isNaN, RegExp: RegExp, Error: Error,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'), atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    __props: props, __ss: ss, __clock: clock, __util: util,
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(src, context, { filename: 'Code.gs', timeout: 30000 });
  // Opsi speed: turunkan KDF_ITERATIONS_ HANYA untuk runtime test (default GAS = 100000,
  // yang membuat satu login saja butuh ~1,5 detik di Node sehingga 1 suite bisa 80+ detik
  // dan mendekati timeout runner 120 detik). Logika yang diuji tidak berubah; nilai produksi
  // tetap diverifikasi terpisah lewat suite (KDF_ITERATIONS_ = 100000).
  if (o.kdfIterations) {
    try { context.KDF_ITERATIONS_ = Number(o.kdfIterations); } catch (e) {}
  }
  return context;
}
function makeSpreadsheetApi(ss) {
  return {
    getActiveSpreadsheet: () => ss,
    getUi: () => ({ alert: () => {}, prompt: () => null }),
    flush: () => {},
    newBlob: () => ({ getBytes: () => new Uint8Array(0) }),
  };
}

module.exports = { loadCodeGS, makeSheet, makeSpreadsheet, makeRange, ROOT };
