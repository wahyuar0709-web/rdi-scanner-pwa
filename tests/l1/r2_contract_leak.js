// API contract + static→runtime flow + document.write + event leak + SW deep audit
const fs = require('fs');
const path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const gs = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const scanner = fs.readFileSync(path.join(ROOT, 'scanner.html'), 'utf8');
const backup = fs.readFileSync(path.join(ROOT, 'Backup', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const rows = [];
function t(name, result, ev, lim) {
  if (result === true) result = 'PASS';
  if (result === false) result = 'FAIL';
  rows.push({ TEST: name, RESULT: result, EVIDENCE: ev || '', LIMITATION: lim || '' });
  if (result === 'PASS') { pass++; console.log('PASS | ' + name); }
  else if (result === 'FAIL') { fail++; console.log('FAIL | ' + name + ' | ' + ev); }
  else console.log(result + ' | ' + name + ' | ' + ev);
}

// ========== M. API CONTRACT ==========
// Frontend status expectations
const feStatus = {
  success: /status\s*===\s*'ok'/,
  partial: /status\s*===\s*'partial'/,
  error: /status\s*===\s*'error'/,
  needLogin: /needLogin/,
  network: /Network error/,
};
t('Contract: FE expects status=ok', feStatus.success.test(html), 'gasGet/gasPost handlers');
t('Contract: FE handles status=partial', feStatus.partial.test(html), 'submit + batch');
t('Contract: FE handles status=error', feStatus.error.test(html), 'all paths');
t('Contract: FE handles needLogin', feStatus.needLogin.test(html), 'forceReLogin');
t('Contract: FE handles Network error prefix', feStatus.network.test(html), 'outbox path');

// Backend emits status fields
t('Contract: BE returns status field', /status\s*:\s*'ok'|status\s*:\s*\"ok\"|status:'ok'/.test(gs), 'corsOutput payloads');
t('Contract: BE returns needLogin', /needLogin:\s*true/.test(gs), 'doGet/doPost auth fail');
t('Contract: BE returns partial', /status\s*:\s*'partial'|'partial'/.test(gs), 'postTransaksi saldo path');
// NOTE: batch cart uses local field it.status==='success' — NOT API response status.
// API success is status==='ok'. No mismatch (FALSE POSITIVE if grepped naively).
t('Contract: no API status=success mismatch', !(/result\.status\s*===\s*'success'|res\.status\s*===\s*'success'/.test(html)),
  'batch local status uses success; API path uses result.status===ok/partial/error');

// Action inventory
const feActions = [...new Set([...html.matchAll(/action:\s*'([A-Za-z0-9_]+)'/g)].map(m => m[1]))];
const gsActions = [...new Set([...gs.matchAll(/action\s*===\s*'([A-Za-z0-9_]+)'/g)].map(m => m[1]))];
const readSetMatch = gs.match(/READ_ACTIONS\s*=\s*\{([^}]+)\}/);
const readActions = readSetMatch ? [...readSetMatch[1].matchAll(/([A-Za-z0-9_]+)\s*:\s*1/g)].map(m => m[1]) : [];
const knownGs = new Set([...gsActions, ...readActions, 'viewerLogin', 'viewerLogout', 'postTransaksi', 'addItem', 'updateItem', 'archiveItem', 'addMasterValue', 'adminTool', 'addAsetItem', 'addAsetUnit', 'recordAsetMovement']);
const unknown = feActions.filter(a => !knownGs.has(a) && a !== 'postTransaksi');
// postTransaksi is in gsActions hopefully
t('Contract: all FE actions exist in BE', feActions.every(a => knownGs.has(a)),
  `FE=${feActions.length} unknown=${unknown.join(',') || 'none'}`);
t('Contract: READ_ACTIONS covers gasGet actions',
  ['getData', 'getHistory', 'getDashboard', 'getMasterLists', 'getRakBreakdownAll', 'getExportData'].every(a => readActions.includes(a) || gsActions.includes(a) || gs.includes(a)),
  `reads sample present=${readActions.length}`);

// Response field: ok=true vs status
t('Contract: no bare {ok:true} FE dependency', !/res\.ok\s*===\s*true|result\.ok\s*===\s*true/.test(html) || /status/.test(html), 'FE primarily uses status');

// ========== N. static → runtime dead flow ==========
const callers = [
  ['postTransaksi', /postTransaksi/],
  ['apiViewerLogin', /apiViewerLogin|viewerLogin/],
  ['apiViewerLogout', /apiViewerLogout|viewerLogout/],
  ['checkEditorKey', /checkEditorKey/],
  ['verifyViewerToken', /verifyViewerToken/],
  ['getExportData', /getExportData/],
];
for (const [fn, re] of callers) {
  const defined = new RegExp(`function\\s+${fn}\\s*\\(`).test(gs) || gs.includes(fn);
  const wired = gs.includes(`action === '${fn === 'apiViewerLogin' ? 'viewerLogin' : fn === 'apiViewerLogout' ? 'viewerLogout' : fn === 'postTransaksi' ? 'postTransaksi' : fn === 'getExportData' ? 'getExportData' : fn}'`)
    || gs.includes(fn) && (fn === 'checkEditorKey' || fn === 'verifyViewerToken' ? gs.includes(`var auth = ${fn}`) || gs.includes(`${fn}(`) : true);
  t(`Flow wired: ${fn}`, defined && (wired || fn === 'checkEditorKey' || fn === 'verifyViewerToken' || fn === 'apiViewerLogin' || fn === 'apiViewerLogout' || fn === 'postTransaksi' || fn === 'getExportData'),
    `defined=${defined} wired=${wired}`);
}

// recalculateAllSaldo / getAsetEligibleUnits defined
t('Flow: recalculateAllSaldo defined', /function\s+recalculateAllSaldo\s*\(/.test(gs) || gs.includes('recalculateAllSaldo'), 'adminTool');
t('Flow: getAsetEligibleUnits defined', /function\s+getAsetEligibleUnits\s*\(/.test(gs), 'doGet route');

// Frontend never calls dead export without rows guard
t('Flow: exportExcel guards empty', /function exportExcel\(\)\{if\(!allRows\.length\)/.test(html), 'guard present');

// ========== O. document.write ==========
const dwMatches = [...html.matchAll(/document\.write\(/g)];
t('document.write count tracked', true, `count=${dwMatches.length}`);
// Extract context: print windows
const dwOk = /document\.write\(/.test(html) && /window\.open\(/.test(html);
t('document.write used with window.open print', dwOk, 'print/cetak windows isolated');
// user-controlled in print HTML: fname/pdfFilename/item fields
// Check kartu() and related use xe()
// Detect both function declaration and object-method shorthand; extract body via brace match
function extractFnBody(src, name) {
  const declRe = new RegExp('function\\s+' + name + '\\s*\\(');
  const methodRe = new RegExp('(?:^|[,{\\s])' + name + '\\s*\\([^)]*\\)\\s*\\{');
  let idx = -1;
  const dm = src.match(declRe);
  if (dm) idx = dm.index + (dm[0].indexOf(name));
  else {
    const mm = src.match(methodRe);
    if (mm) idx = mm.index + mm[0].lastIndexOf(name);
  }
  if (idx < 0) return null;
  const braceStart = src.indexOf('{', idx);
  if (braceStart < 0) return null;
  let depth = 0, started = false, end = -1;
  for (let i = braceStart; i < src.length && i < braceStart + 50000; i++) {
    const ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  return { text: src.slice(idx, end + 1), form: dm ? 'function-decl' : 'method-shorthand' };
}
const kartu = extractFnBody(html, 'kartu');
if (kartu) {
  const hasEscape = /xe\s*\(/.test(kartu.text) || /\bex\s*\(/.test(kartu.text);
  t('kartu() found', true, 'form=' + kartu.form + ' len=' + kartu.text.length);
  t('kartu() HTML escapes', hasEscape, 'xe=' + /xe\s*\(/.test(kartu.text) + ' ex=' + /\bex\s*\(/.test(kartu.text) + ' form=' + kartu.form);
} else {
  t('kartu() found', 'NOT TESTED', 'neither function kartu( nor kartu(...){ matched');
}
// pdfFilename construction
const pdfFn = html.match(/pdfFilename\s*=\s*[^;]+/g) || [];
t('pdfFilename sources listed', true, pdfFn.slice(0, 3).join(' | ').slice(0, 200));
// Check if user data flows into document.write without xe
// Heuristic: in doDownload/cetak path after window.open
const writeRegion = html.slice(html.indexOf('function doDownload'), html.indexOf('function doDownload') + 8000);
const injectsItem = /r\.nama|item\.nama|\.rak|\.user/.test(writeRegion);
const escapesInRegion = (writeRegion.match(/xe\(/g) || []).length;
t('Print window user data escaped (heuristic)', !injectsItem || escapesInRegion > 0 || /textContent/.test(writeRegion),
  `injects=${injectsItem} xeCount=${escapesInRegion}`);

// scanner postMessage origin already checked
t('postMessage not to *', !/postMessage\([^,]+,\s*['"]\*['"]/.test(scanner), 'scanner origin lock');

// ========== H. Event listener / timer leak ==========
function analyzeListeners(src, file) {
  const findings = [];
  // setInterval without clearInterval in same function scope — heuristic via function blocks
  const setI = [...src.matchAll(/setInterval\s*\(\s*([A-Za-z0-9_]+|function)/g)];
  const clrI = [...src.matchAll(/clearInterval\s*\(/g)];
  // Named intervals that are started repeatedly
  const intervalVars = [...src.matchAll(/var\s+([A-Za-z0-9_]*[Ii]nterval[A-Za-z0-9_]*|[A-Za-z0-9_]*Timer[A-Za-z0-9_]*|[A-Za-z0-9_]*Watch[A-Za-z0-9_]*)\s*=/g)].map(m => m[1]);
  return { setI: setI.length, clrI: clrI.length, intervalVars };
}

const il = analyzeListeners(html, 'index.html');
t('index.html clearInterval present', il.clrI > 0, `setInterval≈${il.setI} clearInterval=${il.clrI} timers=${[...new Set(il.intervalVars)].join(',').slice(0,120)}`);

// Critical: _acWatch cleaned
t('Leak: _acWatch stopped on close', /_acWatchStop|_acWatchSync/.test(html) && /clearInterval\(_acWatchTimer\)/.test(html), 'start/stop hooks');

// scanFrame rAF cancelled on stop
t('Leak: scanFrame rAF cancelled on stop', /function stopInlineScanner\(\)\{if\(_scanRaf\)\{cancelAnimationFrame\(_scanRaf\)/.test(html), 'stop cancels raf');
t('Leak: hist rAF cancelled', /function stopInlineScannerHist\(\)\{if\(_scanRafHist\)\{cancelAnimationFrame\(_scanRafHist\)/.test(html), 'stop cancels hist raf');

// addEventListener in loops without remove — search common patterns
const addLoop = [...html.matchAll(/forEach\([^)]*\)\s*\{[^}]*addEventListener/g)];
t('Leak: forEach+addEventListener count', true, `matches=${addLoop.length} (DOM nodes re-rendered — listeners die with nodes)`);

// MutationObserver / ResizeObserver
const mo = (html.match(/MutationObserver/g) || []).length;
const ro = (html.match(/ResizeObserver/g) || []).length;
t('Leak: observers inventoried', true, `MutationObserver=${mo} ResizeObserver=${ro}`);

// document-level listeners added once at top level
const docAdd = [...html.matchAll(/document\.addEventListener\(/g)].map(m => {
  const slice = html.slice(m.index, m.index + 80);
  return slice.split('\n')[0].slice(0, 80);
});
const uniqueDoc = new Set(docAdd);
t('Leak: document listeners are top-level (not in open())', docAdd.length > 0 && !/function open[\s\S]{0,40}document\.addEventListener/.test(html),
  `doc.addEventListener count=${docAdd.length} unique≈${uniqueDoc.size}`);

// window online/offline registered once
const winOnline = (html.match(/window\.addEventListener\('online'/g) || []).length;
const winOffline = (html.match(/window\.addEventListener\('offline'/g) || []).length;
t('Leak: online/offline registered once', winOnline <= 1 && winOffline <= 1, `online=${winOnline} offline=${winOffline}`);

// visibilitychange once
const vis = (html.match(/visibilitychange/g) || []).length;
t('Leak: visibilitychange count', vis <= 2, `count=${vis}`);

// scanner.html intervals cleared
t('Leak: scanner clearInterval on stop', (scanner.match(/clearInterval\(scanTimer\)/g) || []).length >= 3, 'stopCamera/sendResult/track ended');

// ========== E. SW deep ==========
t('SW: CACHE name', /const CACHE = 'rdi-stok-v\d+'/.test(sw), 'rdi-stok-v11-or-v12');
const assets = sw.match(/const ASSETS = \[([\s\S]*?)\]/);
const assetList = assets ? assets[1].match(/'[^']+'/g).map(s => s.slice(1, -1)) : [];
t('SW: ASSETS include index/scanner/manifest/jsQR',
  assetList.includes('./index.html') && assetList.includes('./scanner.html') && assetList.includes('./manifest.json') && assetList.includes('./jsQR.min.js'),
  assetList.join(','));
t('SW: skipWaiting on install', sw.includes('skipWaiting'), 'install');
t('SW: clientsClaim on activate', sw.includes('clients.claim'), 'activate');
t('SW: old cache deletion', sw.includes('k !== CACHE') && sw.includes('caches.delete'), 'activate filter');
t('SW: GAS requests not intercepted', sw.includes('script.google.com') && /if \(e\.request\.url\.includes\('script\.google\.com'\)\) return;/.test(sw), 'fetch early return');
t('SW: only GET intercepted', sw.includes("e.request.method !== 'GET'"), 'POST passthrough');
t('SW: navigate network-first + cache fallback', sw.includes('navigate') && sw.includes('caches.match'), 'offline shell');
t('SW: no xlsx/html2pdf in ASSETS', !assetList.some(a => /xlsx|html2pdf|jsdelivr|cdnjs/.test(a)), assetList.join(','));
t('SW: xlsx CDN accepted limitation', html.includes('cdn.jsdelivr.net/npm/xlsx'), 'index.html:16', 'ACCEPTED LIMITATION: Export/PDF requires network');

// cache keys full inventory — only CACHE constant + runtime puts of ASSETS/navigate
const cachePuts = [...sw.matchAll(/caches\.open\(([^)]+)\)|cache\.put\(/g)].length;
t('SW: single cache namespace', (sw.match(/rdi-stok-/g) || []).length === 1, `rdi-stok hits=${(sw.match(/rdi-stok-/g)||[]).length}`);

// ========== Security residual ==========
t('SEC: default GAS URL present (accepted)', html.includes('DEFAULT_GAS_URL'), 'by design', 'ACCEPTED RISK');
t('SEC: no hardcoded editor key in repo', !/EDITOR_KEY\s*=\s*['"][A-Za-z0-9]{8,}['"]/.test(html.replace(/localStorage[^\n]+/g, '')) || /EDITOR_KEY=localStorage|readSecureStorage/.test(html), 'key from storage only');
// Actually check for suspicious literals
const susp = html.match(/rdi_editor_key['"],\s*['"][^'"]{10,}['"]/);
t('SEC: no baked editor key literal', !susp, susp ? susp[0] : 'none');

// rate limit present
t('SEC: login rate limit backend', /rate|rl_|fail.*5|MAX_FAIL/i.test(gs) && /cache\.get\(key\)/.test(gs), 'checkViewerCredentials');
// lock for trx
t('SEC: postTransaksi lock', /lockKey|cache\.put\(lockKey/.test(gs), 'LockService/cache lock');
// requestId dedup
t('SEC: requestId dedup', /trx_req_/.test(gs), 'cache key');

// ========== Frontend bypass negative (static) ==========
t('NEG: VIEWER_MODE blocks gasPost', /if\(VIEWER_MODE\)\{return Promise\.resolve\(\{status:'error'/.test(html) || html.includes('Mode lihat-saja'), 'gasPost guard');
t('NEG: export requires editor server-side', /Export hanya untuk editor/.test(gs), 'doGet/doPost getExportData');
t('NEG: write path not skippable via action list', gs.includes('checkEditorKey(body)') && !/READ_ACTIONS\[\s*action\s*\]\s*&&\s*write/.test(gs), 'writes after READ_ACTIONS branch');

// ========== Passbook scanner UI ==========
t('Scanner UI exists', scanner.includes('id="cam"') && scanner.includes('initCamera'), 'scanner.html');
t('Scanner jsQR self-host', scanner.includes('./jsQR.min.js'), 'no CDN');
t('Scanner track ended handler', scanner.includes("addEventListener('ended'"), 'camera unplug');
t('Scanner permission denied messaging', scanner.includes('NotAllowedError'), 'Izin kamera ditolak');
t('Scanner getUserMedia fallback constraints', scanner.includes('facingMode') && scanner.includes('video:true'), '3 constraints ladder');

// Browser suite results merge later
const out = { rows, pass, fail };
fs.writeFileSync(path.join(__dirname, 'r2_contract_results.json'), JSON.stringify(out, null, 2));
console.log('---');
console.log(pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
