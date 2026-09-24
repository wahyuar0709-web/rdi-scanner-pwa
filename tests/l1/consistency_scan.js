const fs = require('fs');
// Data consistency static checks on Code.gs patterns
const s = fs.readFileSync('c:/projec/rdi-scanner-pwa/Code.gs','utf8');
const checks = [
  [/qty\s*<=\s*0/, 'reject qty<=0'],
  [/isFinite\(qty\)/, 'isFinite qty'],
  [/qty\s*>\s*1e9/, 'qty upper bound'],
  [/jenis!=='MASUK'&&jenis!=='KELUAR'/, 'jenis validation'],
  [/!rak/, 'rak required'],
  [/status === 'Arsip'/, 'arsip block'],
  [/qty>saldoSebelumRak/, 'insufficient rak stock check'],
  [/safeCell_/, 'formula injection guard'],
  [/appendRow/, 'trx append'],
  [/updateSaldo\(/, 'updateSaldo called'],
  [/updateRakSaldo\(/, 'updateRakSaldo called'],
  [/acquirePerItemLock_/, 'per-item lock'],
  [/trx_req_/, 'requestId dedup cache'],
  [/saldoSyncOk\s*\?\s*'ok'\s*:\s*'partial'/, 'partial on sync fail'],
  [/function normalizeRak_/, 'normalizeRak'],
  [/function generateAsetLogTrxId_/, 'aset trx id seq'],
  [/MIGRATED_MULTI_RAK/, 'multi-rak migration gate'],
  [/getRowsByNumbers_/, 'batched row reads'],
];
console.log('=== DATA CONSISTENCY / STOCK FEATURES ===');
for (const [re, name] of checks) console.log((re.test(s)?'PASS':'FAIL')+': '+name);

// orphan risk: postTransaksi validates item exists
console.log((/getItemById\(itemId\)/.test(s)?'PASS':'FAIL')+': item existence check before trx');

// negative qty from parseFloat
console.log((/qty <= 0/.test(s)?'PASS':'FAIL')+': reject non-positive qty');

// timestamp
console.log((/new Date\(\)/.test(s)?'PASS':'FAIL')+': uses new Date() for trx timestamp');

// frontend xe / xeJs
const html = fs.readFileSync('c:/projec/rdi-scanner-pwa/index.html','utf8');
console.log('\n=== XSS ESCAPE HELPERS ===');
console.log((/function xe\(/.test(html)?'PASS':'FAIL')+': xe defined');
console.log((/function xeJs\(/.test(html)?'PASS':'FAIL')+': xeJs defined');
console.log((/onclick="[^"]*xe\(/.test(html)?'FAIL: raw xe in onclick':'PASS: no raw xe in onclick attr'));
const xeJsOnclick = (html.match(/onclick="[^"]*xeJs\(/g)||[]).length;
console.log('onclick with xeJs count:', xeJsOnclick);

// scanner postMessage
const sc = fs.readFileSync('c:/projec/rdi-scanner-pwa/scanner.html','utf8');
console.log('\n=== SCANNER SECURITY ===');
console.log((/postMessage\s*\([^)]*,\s*['"]\*['"]/.test(sc)?'FAIL: wildcard postMessage':'PASS: no wildcard postMessage'));
console.log((/location\.origin/.test(sc)?'PASS: uses location.origin':'FAIL: no location.origin'));
console.log((/jsdelivr|cdn\./.test(sc)?'FAIL: CDN jsQR':'PASS: local jsQR'));
console.log((/didSend/.test(sc)?'PASS: didSend guard':'FAIL: no duplicate send guard'));
console.log((/nativeBusy|jsqBusy/.test(sc)?'PASS: busy flags':'FAIL: no busy flags'));
console.log((/cam\.play\(\)\.catch/.test(sc)?'PASS: cam.play catch':'FAIL: cam.play no catch'));
console.log((/'ended'/.test(sc)?'PASS: track ended listener':'FAIL: no track ended'));
console.log((/history\.back/.test(sc)?'PASS: history.back fallback':'FAIL: no history fallback'));
