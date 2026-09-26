/* L2 viewport_mode (2026-09-25): tes 4 kombinasi tampilan — HP/Desktop × Viewer/Editor.
 * Tiap kombinasi divalidasi: class body viewer-mode, bentuk nav (sidebar editor desktop
 * 80px / tabbar viewer), padding body, tinggi section cetak (vh-56 editor desktop,
 * vh-104 viewer desktop, vh-122 mobile) + overlap bar vs list = 0, switchTab jalan,
 * tanpa page/console error. Boot: mock 4 rows via HTTP /gas. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const HTTP_PORT = 9373, CDP_PORT = 9374;

const ROWS = [];
for (let i = 1; i <= 4; i++) {
  ROWS.push({
    id: 'MRO-02-00' + i, nama: 'Item Fitur ' + i, spec: 'Spesifikasi ' + i, qty: i * 5, unit: 'Pcs',
    rak: 'A-0' + i, kategori: 'Sparepart', vendor: 'Vendor ' + i, po: 'PO-00' + i, user: 'Tester',
    minStock: 2, arsip: '', tglMasuk: '2026-09-01'
  });
}

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/gas') {
    const ch = [];
    req.on('data', c => ch.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      let a = '';
      try { a = JSON.parse(Buffer.concat(ch).toString() || '{}').action || ''; } catch (e) {}
      if (a === 'getData') res.end(JSON.stringify({ status: 'ok', total: ROWS.length, rows: ROWS }));
      else res.end(JSON.stringify({ status: 'ok', message: 'ok', total: 0, items: [], alat: [], raks: [], trx: [] }));
    });
    return;
  }
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(file, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(d);
  });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function rec(name, ok, detail) {
  if (ok) { pass++; console.log('PASS | ' + name + ' | ' + (detail || '')); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (detail || '')); }
}

const DESKTOP = { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false };
const PHONE = { width: 430, height: 932, deviceScaleFactor: 2, mobile: true };

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(require('os').tmpdir(), 'rdi-vpmode-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1366,768',
    'about:blank'
  ], { stdio: 'ignore' });

  const pageErrors = [];
  const consoleErrors = [];
  try {
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(300);
      try {
        const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json();
        const pg = l.find(t => t.type === 'page');
        if (pg) target = pg.webSocketDebuggerUrl;
      } catch (e) {}
    }
    if (!target) throw new Error('no CDP target');
    const ws = new WebSocket(target);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pend = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails || {};
        pageErrors.push((d.exception && d.exception.description || d.text || '?').split('\n')[0]);
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        consoleErrors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200));
      }
    };
    const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
      if (r.result && r.result.exceptionDetails) return { error: (r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text };
      return r.result && r.result.result ? r.result.result.value : { error: 'no result' };
    };
    await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.enable');

    const step = async (name, expr, pred, detailExpr) => {
      const before = pageErrors.length + consoleErrors.length;
      const r = await ev(expr);
      await sleep(120);
      const after = pageErrors.length + consoleErrors.length;
      let extra = {};
      if (detailExpr) extra = await ev(detailExpr);
      const errDelta = after - before;
      const ok = !(r && r.error) && pred(r, extra) && errDelta === 0;
      rec(name, ok, JSON.stringify({ r, extra, err: errDelta, last: pageErrors.slice(-1).concat(consoleErrors.slice(-1)) }).slice(0, 340));
      return ok;
    };

    const setMetrics = m => send('Emulation.setDeviceMetricsOverride', m);
    const waitReady = async (expectViewer, rows) => {
      let last = null;
      for (let i = 0; i < 70; i++) {
        const r = await ev("(function(){var b=document.getElementById('boot-splash');var h=!b||b.classList.contains('hide');return {h:h,rs:document.readyState,v:document.body.classList.contains('viewer-mode'),n:(window.allRows||[]).length,fn:typeof window.switchTab==='function'};})()");
        if (r && !r.error && r.h === true && r.rs === 'complete' && r.fn === true && r.v === expectViewer && r.n === rows) return r;
        last = r;
        await sleep(300);
      }
      return { timeout: true, last: last };
    };

    // helper ekspresi metrik layout (dipakai ulang per kombinasi)
    const NAV_RECT = "(function(){var n=document.getElementById('main-tabnav');var r=n?n.getBoundingClientRect():{left:-1,top:-1,width:0,height:0,bottom:-1};var cs=n?getComputedStyle(n):{};return {left:Math.round(r.left),top:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),bottom:Math.round(r.bottom),pos:cs.position};})()";
    const BODY_PAD = "(function(){return {pad:getComputedStyle(document.body).paddingLeft,vw:Math.round(window.innerWidth),vh:Math.round(window.innerHeight)};})()";
    const CETAK_RECT = "(function(){window.switchTab('cetak');return 'ok';})()";
    const CETAK_DETAIL = "(function(){var s=document.getElementById('section-cetak');var b=document.getElementById('cetak-action-bar');var l=document.getElementById('cetak-item-list');if(!s||!b||!l)return {miss:true};var sr=s.getBoundingClientRect(),br=b.getBoundingClientRect(),lr=l.getBoundingClientRect();var overlap=Math.round(Math.max(0,lr.bottom-br.top));return {secH:Math.round(sr.height),barInSec:br.bottom<=sr.bottom+1&&br.top>=sr.top-1,listBeforeBar:lr.bottom<=br.top+1,overlap:overlap,vw:Math.round(window.innerWidth),vh:Math.round(window.innerHeight),items:l.querySelectorAll('.cetak-item-row').length};})()";

    const assertCetak = (r, mode) => {
      if (!r || r.miss) return false;
      const isPhone = r.vw <= 700; // mobile via LEBAR (media max-width), bukan tinggi
      const expected = isPhone ? r.vh - 122 : (mode === 'viewer' ? r.vh - 104 : r.vh - 56);
      return Math.abs(r.secH - expected) <= 2 && r.barInSec === true && r.listBeforeBar === true && r.overlap === 0 && r.items === 4;
    };

    // ============ BOOT: VIEWER (token, tanpa editor key) di DESKTOP ============
    await setMetrics(DESKTOP);
    await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
    for (let i = 0; i < 50; i++) {
      const ready = await ev("typeof window.switchTab==='function' && !!document.getElementById('boot-splash')");
      if (ready === true) break;
      await sleep(300);
    }
    const payload = Buffer.from(['h', 'n', String(Date.now() + 3600000), 'sig'].join('|')).toString('base64').replace(/=+$/, '') + '.sig';
    await ev("localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');sessionStorage.setItem('rdi_viewer_token','" + payload + "');sessionStorage.removeItem('rdi_editor_key');sessionStorage.removeItem('rdi_editor_key_set_at');'ok'");
    await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
    let     ok = await waitReady(true, 4);
    rec('BOOT VIEWER: class viewer-mode + 4 rows (desktop)', !!(ok && !ok.timeout), JSON.stringify(ok));

    // ---- 1) VIEWER DESKTOP ----
    let nav = await ev(NAV_RECT);
    rec('VIEWER DESKTOP: nav tabbar sticky bawah topbar (top≈56, h≈48, bukan sidebar)',
      !nav.error && nav.pos === 'sticky' && Math.abs(nav.top - 56) <= 2 && Math.abs(nav.h - 48) <= 2,
      JSON.stringify(nav));
    let pad = await ev(BODY_PAD);
    rec('VIEWER DESKTOP: body tanpa padding sidebar (pad=0px)',
      !pad.error && pad.pad === '0px', JSON.stringify(pad));
    await ev(CETAK_RECT); await sleep(200);
    let c = await ev(CETAK_DETAIL);
    rec('VIEWER DESKTOP: cetak tinggi vh-104 + bar tak menimpa list', assertCetak(c, 'viewer'), JSON.stringify(c));
    await step('VIEWER DESKTOP: switchTab master jalan',
      "(function(){window.switchTab('master');return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {sec:(document.querySelector('.page-section.active')||{}).id};})()");

    // ---- 2) VIEWER HP ----
    await setMetrics(PHONE); await sleep(400);
    nav = await ev(NAV_RECT);
    rec('VIEWER HP: nav bottom-fixed (bottom≈vh, h≈66)',
      !nav.error && nav.pos === 'fixed' && Math.abs(nav.bottom - 932) <= 2 && nav.h >= 60 && nav.h <= 72,
      JSON.stringify(nav));
    pad = await ev(BODY_PAD);
    rec('VIEWER HP: body tanpa padding sidebar (pad=0px)',
      !pad.error && pad.pad === '0px', JSON.stringify(pad));
    await ev(CETAK_RECT); await sleep(200);
    c = await ev(CETAK_DETAIL);
    rec('VIEWER HP: cetak tinggi vh-122 + bar tak menimpa list', assertCetak(c, 'viewer'), JSON.stringify(c));
    await step('VIEWER HP: switchTab dashboard jalan',
      "(function(){window.switchTab('dashboard');return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {sec:(document.querySelector('.page-section.active')||{}).id};})()");

    // ---- 3) EDITOR DESKTOP (set editor key → reload) ----
    await setMetrics(DESKTOP);
    for (let i = 0; i < 30; i++) { // pastikan execution context app siap sebelum tulis storage
      const cReady = await ev("typeof window.switchTab==='function'");
      if (cReady === true) break;
      await sleep(300);
    }
    await ev("sessionStorage.setItem('rdi_editor_key','testkey');sessionStorage.setItem('rdi_editor_key_set_at',String(Date.now()));'ok'");
    await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
    ok = await waitReady(false, 4);
    rec('BOOT EDITOR: tanpa class viewer-mode + 4 rows (desktop)', !!(ok && !ok.timeout), JSON.stringify(ok));
    nav = await ev(NAV_RECT);
    rec('EDITOR DESKTOP: nav jadi sidebar icon-only (left=0, w≈80, h=vh, pos=fixed)',
      !nav.error && nav.pos === 'fixed' && nav.left === 0 && Math.abs(nav.w - 80) <= 1 && Math.abs(nav.h - 768) <= 2,
      JSON.stringify(nav));
    pad = await ev(BODY_PAD);
    rec('EDITOR DESKTOP: body padding-left 80px (ruang sidebar)',
      !pad.error && pad.pad === '80px', JSON.stringify(pad));
    await ev(CETAK_RECT); await sleep(200);
    c = await ev(CETAK_DETAIL);
    rec('EDITOR DESKTOP: cetak tinggi vh-56 + bar tak menimpa list', assertCetak(c, 'editor'), JSON.stringify(c));
    await step('EDITOR DESKTOP: switchTab master jalan',
      "(function(){window.switchTab('master');return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {sec:(document.querySelector('.page-section.active')||{}).id};})()");

    // ---- 4) EDITOR HP ----
    await setMetrics(PHONE); await sleep(400);
    nav = await ev(NAV_RECT);
    rec('EDITOR HP: sidebar OFF (media <1024) → nav bottom-fixed (bottom≈vh, h≈66)',
      !nav.error && nav.pos === 'fixed' && Math.abs(nav.bottom - 932) <= 2 && nav.h >= 60 && nav.h <= 72,
      JSON.stringify(nav));
    pad = await ev(BODY_PAD);
    rec('EDITOR HP: body padding 0 (sidebar hanya desktop)',
      !pad.error && pad.pad === '0px', JSON.stringify(pad));
    await ev(CETAK_RECT); await sleep(200);
    c = await ev(CETAK_DETAIL);
    rec('EDITOR HP: cetak tinggi vh-122 + bar tak menimpa list', assertCetak(c, 'editor'), JSON.stringify(c));
    await step('EDITOR HP: switchTab scanner jalan',
      "(function(){window.switchTab('scanner');return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {sec:(document.querySelector('.page-section.active')||{}).id};})()");

    // ---- GLOBAL: nol error ----
    rec('GLOBAL: 0 page error + 0 console error (4 kombinasi)',
      pageErrors.length === 0 && consoleErrors.length === 0,
      JSON.stringify({ pageErrors: pageErrors.slice(0, 5), consoleErrors: consoleErrors.slice(0, 5) }));

    console.log('=== VIEWPORT_MODE: ' + pass + ' PASS / ' + fail + ' FAIL ===');
    ws.close();
    process.exitCode = fail ? 1 : 0;
  } finally {
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
