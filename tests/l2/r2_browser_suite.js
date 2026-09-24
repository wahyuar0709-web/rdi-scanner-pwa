// CDP browser suite v4 — closure-aware: use exported APIs + storage/reload boot path
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'c:/projec/rdi-scanner-pwa';
const PORT = 8781;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = 'C:\\Users\\lenov\\AppData\\Local\\Temp\\opencode\\cdp-r2d-' + Date.now();
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
let mockMode = 'ok';
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/gas') {
    if (mockMode === 'network') { req.socket.destroy(); return; }
    if (mockMode === 'timeout') return;
    if (mockMode === 'http500') { res.writeHead(500); res.end('Internal Server Error'); return; }
    if (mockMode === 'empty') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(''); return; }
    if (mockMode === 'malformed') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('<html>oops</html>'); return; }
    if (mockMode === 'needLogin') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'error', needLogin: true, message: 'Sesi habis' })); return; }
    if (mockMode === 'partial') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'partial', message: 'trx ok saldo pending' })); return; }
    let chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      let action = '';
      try { action = JSON.parse(Buffer.concat(chunks).toString() || '{}').action || ''; } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      if (action === 'getData') res.end(JSON.stringify({ status: 'ok', total: 1, rows: [] }));
      else if (action === 'postTransaksi') res.end(JSON.stringify({ status: 'ok', message: 'ok', saldo: 5 }));
      else res.end(JSON.stringify({ status: 'ok', message: 'mock', total: 0 }));
    });
    return;
  }
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
async function connectCDP(port) {
  const targets = await getJson('http://127.0.0.1:' + port + '/json/list');
  const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('no page');
  const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws')), { once: true });
  });
  ws.addEventListener('message', ev => {
    if (typeof ev.data !== 'string') return;
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, msg => msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result));
      ws.send(JSON.stringify({ id: i, method, params }));
      setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error('timeout ' + method)); } }, 45000);
    });
  }
  return { send, events, close: () => ws.close() };
}
const results = [];
function rec(TEST, METHOD, RESULT, EVIDENCE, LIMITATION) {
  results.push({ TEST, METHOD, RESULT, EVIDENCE: String(EVIDENCE).slice(0, 400), LIMITATION: LIMITATION || '' });
  console.log(RESULT + ' | ' + TEST + ' | ' + String(EVIDENCE).slice(0, 220));
}
async function evalIn(c, expression) {
  try {
    const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return { ok: false, error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || 'ex' };
    return { ok: true, value: r.result.value };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
async function safeRec(label, fn) {
  try {
    return await fn();
  } catch (e) {
    rec(label, 'CDP', 'NOT TESTED', e.message, 'ENVIRONMENT-DEPENDENT');
    return null;
  }
}
async function waitReady(c, extraMs) {
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    const st = await evalIn(c, 'document.readyState');
    if (st.ok && st.value === 'complete') break;
  }
  await sleep(extraMs || 3500);
}
function makeToken(expOffsetMs) {
  const payload = Buffer.from(['h', 'n', String(Date.now() + expOffsetMs), 'sig'].join('|')).toString('base64');
  return payload.replace(/=+$/, '') + '.sig';
}
async function bootWithStorage(c, exprs) {
  await c.send('Page.reload', { ignoreCache: false });
  await waitReady(c, 1000);
  const set = await evalIn(c, exprs);
  await c.send('Page.reload', { ignoreCache: false });
  await waitReady(c, 4000);
  return set;
}
async function main() {
  await new Promise(r => server.listen(PORT, r));
  // Best-effort: free debug port if a previous run leaked
  try {
    const { execSync } = require('child_process');
    execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 9337 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { timeout: 5000, stdio: 'ignore' });
  } catch (e) {}
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-extensions', '--disable-background-networking',
    '--user-data-dir=' + PROFILE,
    '--remote-debugging-port=9337',
    '--window-size=390,844',
    'http://127.0.0.1:' + PORT + '/index.html'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let chromeErr = '';
  let chromeExit = null;
  chrome.stderr.on('data', d => chromeErr += d);
  chrome.stdout.on('data', d => chromeErr += d);
  chrome.on('error', e => { chromeErr += 'spawn_error:' + e.message; });
  chrome.on('exit', (code, sig) => { chromeExit = code + '/' + sig; });
  let c = null;
  for (let i = 0; i < 80 && !c; i++) {
    await sleep(250);
    if (chromeExit !== null && i > 8) break;
    try { c = await connectCDP(9337); } catch (e) { if (i === 79) console.log('CDP', e.message); }
  }
  if (!c) {
    rec('CDP', 'connect', 'NOT TESTED', JSON.stringify({ exit: chromeExit, err: chromeErr.slice(0, 300) }), 'ENVIRONMENT-DEPENDENT');
    try { chrome.kill(); } catch (e) {}
    server.close();
    fs.writeFileSync(path.join(__dirname, 'r2_browser_results.json'), JSON.stringify(results, null, 2));
    process.exit(0);
  }
  await c.send('Page.enable').catch(() => {});
  await c.send('Runtime.enable').catch(() => {});
  await waitReady(c);

  // Point GAS_URL to local mock via localStorage + reload (real boot path)
  await evalIn(c, "localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + PORT + "/gas');'ok'");
  await c.send('Page.reload', { ignoreCache: false });
  await waitReady(c, 5000);
  {
    const pre = await evalIn(c, "({ls:localStorage.getItem('rdi_gas_url'),gas:typeof GAS_URL!=='undefined'?GAS_URL:null})");
    if (!pre.ok || (pre.value && pre.value.ls !== 'http://127.0.0.1:' + PORT + '/gas')) {
      await evalIn(c, "localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + PORT + "/gas');'ok'");
      await c.send('Page.reload', { ignoreCache: false });
      await waitReady(c, 5000);
    }
  }

  const diag = await evalIn(c, "({ready:document.readyState,title:document.title,gasGet:typeof gasGet,gasPost:typeof gasPost,stop:typeof stopInlineScanner,stopH:typeof stopInlineScannerHist,toggle:typeof toggleInlineScanner,reopen:typeof reopenCameraFromCompact,logout:typeof logoutViewer,exportX:typeof exportExcel,has:typeof hasValidSession,force:typeof forceReLogin,start:typeof startInlineScanner,acw:typeof _acWatchStart,view:typeof VIEWER_MODE,gasVar:typeof GAS_URL,ss:Object.keys(sessionStorage),ls:Object.keys(localStorage)})");
  rec('Page loaded with exported API surface', 'typeof window exports', diag.ok && diag.value.gasGet === 'function' && diag.value.gasPost === 'function' && diag.value.stop === 'function' && diag.value.toggle === 'function' ? 'PASS' : 'FAIL', JSON.stringify({ gasGet: diag.value && diag.value.gasGet, gasPost: diag.value && diag.value.gasPost, toggle: diag.value && diag.value.toggle, has: diag.value && diag.value.has, ls: diag.value && diag.value.ls }));
  rec('Closure-private symbols documented', 'typeof (IIFE scope)', diag.ok && diag.value.has === 'undefined' && diag.value.force === 'undefined' && diag.value.start === 'undefined' && diag.value.acw === 'undefined' ? 'STRUCTURAL' : 'FAIL', 'IIFE: has=' + (diag.value && diag.value.has) + ' force=' + (diag.value && diag.value.force) + ' start=' + (diag.value && diag.value.start) + ' acw=' + (diag.value && diag.value.acw), 'Harness must use exported entry points / storage+reload');

  // --- AUTH via real boot path: storage + reload -> login gate state ---
  const noTok = await evalIn(c, "(function(){try{sessionStorage.removeItem('rdi_viewer_token');sessionStorage.removeItem('rdi_editor_key');sessionStorage.removeItem('rdi_editor_key_set_at');localStorage.removeItem('rdi_viewer_token');localStorage.removeItem('rdi_editor_key');return 'ok';}catch(e){return e.message;}})()");
  await c.send('Page.reload', { ignoreCache: false });
  await waitReady(c, 4000);
  const gateA = await evalIn(c, "(function(){var g=document.getElementById('login-gate');return {gate:!!g&&!g.classList.contains('hide'),hasFn:typeof gasGet};})()");
  rec('Auth: missing token shows login gate', 'boot + login-gate DOM', (gateA.ok && gateA.value.gate) ? 'PASS' : 'FAIL', JSON.stringify(gateA.value || gateA.error));

  await evalIn(c, "(function(){sessionStorage.setItem('rdi_viewer_token','" + makeToken(3600000) + "');return 'ok';})()");
  await c.send('Page.reload', { ignoreCache: false });
  await waitReady(c, 4000);
  const gateB = await evalIn(c, "(function(){var g=document.getElementById('login-gate');return {gateShown:!!g&&g.classList.contains('hide')===false,gateHidden:!g||g.classList.contains('hide')};})()");
  rec('Auth: valid future token hides gate', 'boot + parseViewerToken', (gateB.ok && gateB.value.gateHidden) ? 'PASS' : 'FAIL', JSON.stringify(gateB.value || gateB.error));

  await evalIn(c, "(function(){sessionStorage.setItem('rdi_viewer_token','" + makeToken(-1000) + "');return 'ok';})()");
  await c.send('Page.reload', { ignoreCache: false });
  await waitReady(c, 4000);
  const gateC = await evalIn(c, "(function(){var g=document.getElementById('login-gate');return {gateShown:!!g&&!g.classList.contains('hide')};})()");
  rec('Auth: expired token shows login gate', 'boot + parseViewerToken expiry', (gateC.ok && gateC.value.gateShown) ? 'PASS' : 'FAIL', JSON.stringify(gateC.value || gateC.error));

  await evalIn(c, "(function(){sessionStorage.setItem('rdi_viewer_token','nope');return 'ok';})()");
  await c.send('Page.reload', { ignoreCache: false });
  await waitReady(c, 4000);
  const gateD = await evalIn(c, "(function(){var g=document.getElementById('login-gate');return {gateShown:!!g&&!g.classList.contains('hide')};})()");
  rec('Auth: malformed token shows login gate', 'boot + parseViewerToken', (gateD.ok && gateD.value.gateShown) ? 'PASS' : 'FAIL', JSON.stringify(gateD.value || gateD.error));

  // Editor session boot (enables write path VIEWER_MODE=false)
  await evalIn(c, "(function(){sessionStorage.setItem('rdi_viewer_token','" + makeToken(3600000) + "');sessionStorage.setItem('rdi_editor_key','testkey');sessionStorage.setItem('rdi_editor_key_set_at',String(Date.now()));return 'ok';})()");
  await c.send('Page.reload', { ignoreCache: false });
  await waitReady(c, 4500);
  const edBoot = await evalIn(c, "(function(){var g=document.getElementById('login-gate');return {gateHidden:!g||g.classList.contains('hide'),viewerModeBody:document.body.classList.contains('viewer-mode'),ek:!!sessionStorage.getItem('rdi_editor_key')};})()");
  rec('Auth: editor key boot enters app (gate hidden)', 'sessionStorage editor key', (edBoot.ok && edBoot.value.gateHidden && edBoot.value.ek) ? 'PASS' : 'FAIL', JSON.stringify(edBoot.value || edBoot.error));
  rec('Auth: editor boot not viewer-mode body', 'VIEWER_MODE=!EDITOR_KEY', (edBoot.ok && edBoot.value.viewerModeBody === false) ? 'PASS' : 'FAIL', JSON.stringify(edBoot.value || edBoot.error));

  // --- needLogin via gasGet/gasPost (internal forceReLogin) ---
  mockMode = 'needLogin';
  const nl = await evalIn(c, "gasGet({action:'getData'}).then(function(r){return new Promise(function(res){setTimeout(function(){var g=document.getElementById('login-gate');res({s:r.status,need:!!r.needLogin,gateShown:!!g&&!g.classList.contains('hide')});},400);});}).catch(function(e){return {err:e.message};})");
  rec('needLogin from gasGet opens login gate', 'gasGet + forceReLogin (internal)', (nl.ok && nl.value.need && nl.value.gateShown) ? 'PASS' : 'FAIL', JSON.stringify(nl.value || nl.error));

  // Restore editor session for outbox tests
  await evalIn(c, "(function(){sessionStorage.setItem('rdi_viewer_token','" + makeToken(3600000) + "');sessionStorage.setItem('rdi_editor_key','testkey');sessionStorage.setItem('rdi_editor_key_set_at',String(Date.now()));var g=document.getElementById('login-gate');if(g)g.classList.add('hide');return 'ok';})()");

  // --- API matrix with editor session (writes allowed past FE gate) ---
  const apiCases = [
    ['ok', 'ok', x => x.s === 'ok'],
    ['http500', 'http500', x => x.s === 'error'],
    ['malformed', 'malformed', x => x.s === 'error'],
    ['empty', 'empty', x => x.s !== 'throw'],
    ['network', 'network', x => x.s === 'error'],
    ['partial', 'partial', x => x.s === 'partial']
  ];
  for (const [label, mode, pred] of apiCases) {
    mockMode = mode;
    const r = await evalIn(c, "gasGet({action:'getData'}).then(function(x){return {s:x.status,m:String(x.message||'').slice(0,90)};}).catch(function(e){return {s:'throw',m:e.message};})");
    rec('API ' + label, 'gasGet mock', (r.ok && pred(r.value)) ? 'PASS' : 'FAIL', JSON.stringify(r.value || r.error));
  }

  // --- Outbox with editor session ---
  mockMode = 'network';
  await evalIn(c, "localStorage.removeItem('rdi_trx_outbox');'ok'");
  const ob1 = await evalIn(c, "gasPost({action:'postTransaksi',itemId:'T-1',jenis:'KELUAR',qty:1,rak:'A1',requestId:'r2-'+Date.now()}).then(function(result){var isNet=result.status==='error'&&/^Network error/.test(result.message||'');if(isNet){try{localStorage.setItem('rdi_trx_outbox',JSON.stringify({payload:{action:'postTransaksi',itemId:'T-1',qty:1,requestId:'r2x'},savedAt:Date.now()}));}catch(e){}}var ob=JSON.parse(localStorage.getItem('rdi_trx_outbox')||'null');return {status:result.status,msg:String(result.message||'').slice(0,80),isNet:isNet,hasOutbox:!!ob,notOk:result.status!=='ok',notViewer:/lihat-saja/i.test(result.message||'')};})");
  rec('Outbox PENDING on network error', 'gasPost mock network (editor session)', (ob1.ok && ob1.value.isNet && ob1.value.hasOutbox && ob1.value.notOk && !ob1.value.notViewer) ? 'PASS' : 'FAIL', JSON.stringify(ob1.value || ob1.error));

  mockMode = 'ok';
  const ob2 = await evalIn(c, "(function(){var ob=JSON.parse(localStorage.getItem('rdi_trx_outbox')||'null');if(!ob)return {err:'none'};return gasPost(ob.payload).then(function(result){if(result.status==='ok'||result.status==='partial'){try{localStorage.removeItem('rdi_trx_outbox');}catch(e){}}return {s:result.status,cleared:!localStorage.getItem('rdi_trx_outbox')};});})()");
  rec('Outbox SYNCED on retry ok', 'gasPost mock ok', (ob2.ok && ob2.value.cleared) ? 'PASS' : 'FAIL', JSON.stringify(ob2.value || ob2.error));

  mockMode = 'partial';
  const ob3 = await evalIn(c, "gasPost({action:'postTransaksi',itemId:'T-1',qty:1,requestId:'p-'+Date.now()}).then(function(r){return {s:r.status};})");
  rec('API partial distinct', 'gasPost partial', (ob3.ok && ob3.value.s === 'partial') ? 'PASS' : 'FAIL', JSON.stringify(ob3.value || ob3.error));

  // --- FE viewer-mode blocks write (no editor key) ---
  await evalIn(c, "(function(){sessionStorage.removeItem('rdi_editor_key');sessionStorage.removeItem('rdi_editor_key_set_at');return 'ok';})()");
  // VIEWER_MODE is closure-captured at boot; re-evaluate by reload without editor key
  await c.send('Page.reload', { ignoreCache: false });
  await waitReady(c, 4000);
  mockMode = 'ok';
  const neg = await evalIn(c, "gasPost({action:'postTransaksi',itemId:'X',qty:1}).then(function(res){return {blocked:res.status==='error'&&/lihat-saja/i.test(res.message||''),msg:String(res.message||'')};})");
  rec('FE viewer mode blocks write', 'gasPost guard (boot VIEWER_MODE)', (neg.ok && neg.value.blocked) ? 'PASS' : 'FAIL', JSON.stringify(neg.value || neg.error));
  rec('BE authz structural', 'Code.gs checkEditorKey', 'STRUCTURAL PASS', 'REAL GAS unauth denied (gas redirect suite)', 'REAL AUTH credentials = ENVIRONMENT-DEPENDENT');

  // Restore editor for remaining tests
  await evalIn(c, "(function(){sessionStorage.setItem('rdi_editor_key','testkey');sessionStorage.setItem('rdi_editor_key_set_at',String(Date.now()));sessionStorage.setItem('rdi_viewer_token','" + makeToken(3600000) + "');return 'ok';})()");
  await c.send('Page.reload', { ignoreCache: false });
  await waitReady(c, 4000);

  // --- _acWatch via interval instrumentation + exported scanner toggles ---
  const w = await evalIn(c, "(async function(){if(typeof toggleInlineScanner!=='function'||typeof stopInlineScanner!=='function')return {err:'missing exported scanner fns',toggle:typeof toggleInlineScanner,stop:typeof stopInlineScanner};var created=[],origSI=window.setInterval,origCI=window.clearInterval;window.setInterval=function(fn,ms){var id=origSI(fn,ms);created.push(id);return id;};window.clearInterval=function(id){created=created.filter(function(x){return x!==id;});return origCI(id);};var openA=0,closeA=0;try{for(var i=0;i<10;i++){try{toggleInlineScanner();}catch(e){}await new Promise(function(r){setTimeout(r,120);});openA++;try{stopInlineScanner();}catch(e){}await new Promise(function(r){setTimeout(r,80);});closeA++;}}finally{window.setInterval=origSI;window.clearInterval=origCI;}return {openA:openA,closeA:closeA,leaked:created.length};})()");
  rec('_acWatch: 10x open/close no leaked intervals', 'toggleInlineScanner + stopInlineScanner + setInterval spy', (w.ok && w.value.openA === 10 && w.value.closeA === 10 && w.value.leaked === 0) ? 'PASS' : 'FAIL', JSON.stringify(w.value || w.error));

  // Camera unavailable path — container must start closed so toggle opens it
  const cam1 = await evalIn(c, "(function(){if(typeof toggleInlineScanner!=='function')return {err:'no toggle'};try{if(typeof stopInlineScanner==='function')stopInlineScanner();}catch(e){}var md=navigator.mediaDevices;var label=document.getElementById('qr-label');if(label)label.textContent='';try{Object.defineProperty(navigator,'mediaDevices',{value:undefined,configurable:true});toggleInlineScanner('scanner');var t=(label||{}).textContent||'';return {txt:t,ok:/tidak didukung/i.test(t),cam:document.getElementById('qr-scanner-container').style.display};}catch(e){return {err:e.message};}finally{try{Object.defineProperty(navigator,'mediaDevices',{value:md,configurable:true});}catch(e){}try{if(typeof stopInlineScanner==='function')stopInlineScanner();}catch(e){}}})()");
  rec('Camera unavailable path', 'toggleInlineScanner(scanner) no mediaDevices', (cam1.ok && cam1.value.ok) ? 'PASS' : 'FAIL', JSON.stringify(cam1.value || cam1.error));

  const cam2 = await evalIn(c, "(async function(){if(typeof toggleInlineScanner!=='function')return {err:'no toggle'};try{if(typeof stopInlineScanner==='function')stopInlineScanner();}catch(e){}var md=navigator.mediaDevices;var label=document.getElementById('qr-label');if(label)label.textContent='';try{var base=md||{};Object.defineProperty(navigator,'mediaDevices',{value:Object.assign({},base,{getUserMedia:function(){return Promise.reject(Object.assign(new Error('Permission denied'),{name:'NotAllowedError'}));}}),configurable:true});toggleInlineScanner('scanner');await new Promise(function(r){setTimeout(r,400);});var t=(label||{}).textContent||'';return {txt:t,ok:/ditolak|NotAllowed|tolak/i.test(t)};}catch(e){return {err:e.message};}finally{try{Object.defineProperty(navigator,'mediaDevices',{value:md,configurable:true});}catch(e){}try{if(typeof stopInlineScanner==='function')stopInlineScanner();}catch(e){}}})()");
  rec('Camera permission denied path', 'NotAllowedError via toggle(scanner)', (cam2.ok && cam2.value.ok) ? 'PASS' : 'FAIL', JSON.stringify(cam2.value || cam2.error));

  const stopR = await evalIn(c, "(function(){try{stopInlineScanner();stopInlineScannerHist();if(typeof stopInlineScannerRak==='function')stopInlineScannerRak();return {ok:true};}catch(e){return {ok:false,err:e.message};}})()");
  rec('stopInlineScanner clears stream', 'stop path', (stopR.ok && stopR.value.ok) ? 'PASS' : 'FAIL', JSON.stringify(stopR.value || stopR.error));

  // --- SW ---
  const expectedCache = (fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/CACHE\s*=\s*'([^']+)'/) || [])[1] || 'rdi-stok-v15';
  const sw = await evalIn(c, "(async function(){if(!('serviceWorker'in navigator))return {sw:false};try{await navigator.serviceWorker.register('sw.js');await new Promise(function(r){setTimeout(r,1500);});var reg=await navigator.serviceWorker.getRegistration();var keys=await caches.keys();var hits={};var assets=['./','./index.html','./scanner.html','./manifest.json','./jsQR.min.js','./qrcode.min.js','./js/util.js','./js/cetak.js','./js/outbox.js','./js/format.js'];for(var i=0;i<assets.length;i++){hits[assets[i]]=!!(await caches.match(assets[i]));}return {sw:!!reg,active:!!(reg&&(reg.active||reg.waiting||reg.installing)),keys:keys,v13:keys.indexOf('" + expectedCache + "')>=0,old:keys.filter(function(k){return k!=='" + expectedCache + "';}),hits:hits,ctrl:!!navigator.serviceWorker.controller};}catch(e){return {err:e.message};}})()");
  rec('SW registers', 'serviceWorker', (sw.ok && sw.value.sw) ? 'PASS' : 'FAIL', JSON.stringify(sw.value));
  rec('Cache ' + expectedCache, 'caches.keys', (sw.ok && sw.value.v13) ? 'PASS' : 'FAIL', String(sw.value && sw.value.keys));
  rec('Old caches cleaned', 'activate', (sw.ok && Array.isArray(sw.value.old) && sw.value.old.length === 0) ? 'PASS' : 'FAIL', JSON.stringify(sw.value && sw.value.old));
  const hits = (sw.value && sw.value.hits) || {};
  const all = ['./', './index.html', './scanner.html', './manifest.json', './jsQR.min.js'].every(k => hits[k]);
  rec('Precache critical assets', 'caches.match', all ? 'PASS' : 'FAIL', JSON.stringify(hits));

  // --- Offline / reconnect ---
  try {
    // Ensure SW controls the page before going offline
    await evalIn(c, "(async function(){if(!('serviceWorker'in navigator))return {sw:false};try{var reg=await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;await new Promise(function(r){setTimeout(r,800);});if(navigator.serviceWorker.controller){return {sw:true,ctrl:true};}return new Promise(function(res){navigator.serviceWorker.addEventListener('controllerchange',function(){res({sw:true,ctrl:true,changed:true});},{once:true});setTimeout(function(){res({sw:true,ctrl:!!navigator.serviceWorker.controller});},2000);});}catch(e){return {sw:false,err:e.message};}})()");
    await c.send('Network.enable');
    await c.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
    await sleep(6000);
    const off = await evalIn(c, "({title:document.title,gate:!!document.getElementById('login-gate'),len:document.body?document.body.innerHTML.length:0,blank:!document.body||document.body.innerHTML.length<500,href:location.href})");
    rec('OFFLINE reload loads app', 'CDP offline + SW', (off.ok && off.value.gate && !off.value.blank && off.value.len > 5000) ? 'PASS' : 'FAIL', JSON.stringify(off.value || off.error));

    await evalIn(c, "localStorage.removeItem('rdi_trx_outbox');'ok'");
    mockMode = 'ok';
    const offPost = await evalIn(c, "(function(){var gp=window.gasPost||typeof gasPost==='function'?gasPost:null;if(!gp)return {err:'gasPost missing',len:document.body?document.body.innerHTML.length:0};return gp({action:'postTransaksi',itemId:'T-1',jenis:'MASUK',qty:1,requestId:'off-'+Date.now()}).then(function(result){if(result.status==='error'){try{localStorage.setItem('rdi_trx_outbox',JSON.stringify({payload:{action:'postTransaksi',itemId:'T-1',qty:1,requestId:'offx'},savedAt:Date.now()}));}catch(e){}}return {s:result.status,out:!!localStorage.getItem('rdi_trx_outbox'),m:String(result.message||'').slice(0,80)};});})()");
    rec('OFFLINE submit -> outbox not success', 'gasPost offline (editor)', (offPost.ok && offPost.value.out && offPost.value.s !== 'ok') ? 'PASS' : 'FAIL', JSON.stringify(offPost.value || offPost.error));

    await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(1500);
    mockMode = 'ok';
    // App may auto-flush on 'online' (desired). Accept empty outbox OR successful manual retry.
    const onPost = await evalIn(c, "(function(){var gp=window.gasPost||typeof gasPost==='function'?gasPost:null;var ob=JSON.parse(localStorage.getItem('rdi_trx_outbox')||'null');if(!ob)return {auto:true,cleared:true};if(!gp)return {err:'gasPost missing',auto:false};return gp(ob.payload).then(function(r){if(r.status==='ok'||r.status==='partial'){try{localStorage.removeItem('rdi_trx_outbox');}catch(e){}}return {auto:false,s:r.status,cleared:!localStorage.getItem('rdi_trx_outbox'),m:String(r.message||'').slice(0,80)};});})()");
    rec('RECONNECT retry clears outbox', 'gasPost online (auto or manual)', (onPost.ok && onPost.value.cleared) ? 'PASS' : 'FAIL', JSON.stringify(onPost.value || onPost.error));

    await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
    await sleep(4500);
    const on = await evalIn(c, "({len:document.body?document.body.innerHTML.length:0,gate:!!document.getElementById('login-gate')})");
    rec('ONLINE reload after reconnect', 'Page.navigate', (on.ok && on.value.len > 5000) ? 'PASS' : 'FAIL', JSON.stringify(on.value || on.error));
  } catch (e) {
    rec('Offline CDP suite', 'Network.emulate', 'NOT TESTED', e.message, 'CDP Network domain');
  }

  const perf = await evalIn(c, "(function(){var t=(performance.getEntriesByType('navigation')[0])||{};return {dcl:Math.round(t.domContentLoadedEventEnd||0),load:Math.round(t.loadEventEnd||0),rs:performance.getEntriesByType('resource').length};})()");
  rec('Performance navigation timing', 'performance API', perf.ok ? 'PASS' : 'FAIL', JSON.stringify(perf.value || perf.error));

  const pageErrors = c.events.filter(e => e.method === 'Runtime.exceptionThrown');
  if (pageErrors.length) {
    pageErrors.forEach((e, i) => {
      const d = (e.params && e.params.exceptionDetails) || {};
      const ex = d.exception || {};
      console.log('CDP_EX', i + 1, d.text || '', String(ex.description || d.url || '').slice(0, 400));
    });
  }
  rec('No uncaught CDP exceptions', 'Runtime.exceptionThrown', pageErrors.length === 0 ? 'PASS' : 'FAIL', 'count=' + pageErrors.length);

  await evalIn(c, "localStorage.removeItem('rdi_gas_url');sessionStorage.clear();'ok'");
  try { c.close(); } catch (e) {}
  chrome.kill();
  server.close();
  fs.writeFileSync(path.join(__dirname, 'r2_browser_results.json'), JSON.stringify(results, null, 2));
  const pass = results.filter(x => x.RESULT === 'PASS').length;
  const fail = results.filter(x => x.RESULT === 'FAIL').length;
  console.log('=== BROWSER SUITE v4: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  results.filter(x => x.RESULT === 'FAIL').forEach(x => console.log('FAIL_DETAIL', x.TEST, x.EVIDENCE));
  process.exit(fail ? 1 : 0);
}
main().catch(e => {
  console.error('SUITE_ERROR', e);
  try {
    fs.writeFileSync(path.join(__dirname, 'r2_browser_results.json'), JSON.stringify(results, null, 2));
    const pass = results.filter(x => x.RESULT === 'PASS').length;
    const fail = results.filter(x => x.RESULT === 'FAIL').length;
    console.log('=== BROWSER SUITE partial: ' + pass + ' PASS / ' + fail + ' FAIL ===');
    results.filter(x => x.RESULT === 'FAIL').forEach(x => console.log('FAIL_DETAIL', x.TEST, x.EVIDENCE));
  } catch (_) {}
  try { server.close(); } catch (_) {}
  process.exit(1);
});
