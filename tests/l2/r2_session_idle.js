/* L2 r2_session_idle (2026-09-26): bug HP "akun langsung logout saat app dibuka lagi".
 * Sebelum fix: boot migration memindahkan kredensial localStorage→sessionStorage lalu
 * menghapus localStorage → PWA di-process-kill HP (sessionStorage hilang) → sesi lenyap.
 * Fix: dual-write (session + local resume copy) + enforceSessionIdle → auto-logout bila
 * app tidak dibuka > SESSION_IDLE_MS (2 jam) via rdi_last_active.
 * Skrip: boot viewer → sesi aktif + resume copy ada → tab baru (storage sama, sessionStorage
 * kosong, model process-kill) → sesi dipulihkan → la=now-30m → masih login → la=now-3h →
 * gate terlihat + kredensial terhapus. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const HTTP_PORT = 9425, CDP_PORT = 9426;

const ROWS = [];
for (let i = 1; i <= 4; i++) {
  ROWS.push({
    id: 'MRO-02-00' + i, nama: 'Item ' + i, spec: 'Spec ' + i, qty: i * 5, unit: 'Pcs',
    rak: 'A-0' + i, kategori: 'Sparepart', vendor: 'V', po: 'P', user: 'T',
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

const APP_URL = 'http://127.0.0.1:' + HTTP_PORT + '/index.html';
const GAS_SETUP = "localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');'ok'";

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(require('os').tmpdir(), 'rdi-sess-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=430,932',
    'about:blank'
  ], { stdio: 'ignore' });

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
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.result && r.result.exceptionDetails) return { error: (r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text };
      return r.result && r.result.result ? r.result.result.value : { error: 'no result' };
    };
    await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
    const payload = Buffer.from(['h', 'n', String(Date.now() + 3600000), 'sig'].join('|')).toString('base64').replace(/=+$/, '') + '.sig';

    async function waitBoot() {
      for (let i = 0; i < 80; i++) {
        const r = await ev("(function(){var b=document.getElementById('boot-splash');return {h:!b||b.classList.contains('hide'),rs:document.readyState,fn:typeof window.switchTab==='function',n:(window.allRows||[]).length};})()");
        if (r && !r.error && r.h === true && r.rs === 'complete' && r.fn === true) return r;
        await sleep(300);
      }
      return null;
    }
    // helper untuk attach tab baru (proses terpisah = model PWA process-kill: sessionStorage kosong)
    async function openFreshTab(url) {
      const r = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/new?' + encodeURIComponent(url), { method: 'PUT' });
      const t = await r.json();
      const w = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => { w.onopen = res; w.onerror = rej; });
      let i2 = 0; const p2 = new Map();
      w.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p2.has(m.id)) { p2.get(m.id)(m); p2.delete(m.id); } };
      const send2 = (method, params) => new Promise(res => { const i = ++i2; p2.set(i, res); w.send(JSON.stringify({ id: i, method, params })); });
      const ev2 = async expr => {
        const rr = await send2('Runtime.evaluate', { expression: expr, returnByValue: true });
        if (rr.result && rr.result.exceptionDetails) return { error: (rr.result.exceptionDetails.exception || {}).description || rr.result.exceptionDetails.text };
        return rr.result && rr.result.result ? rr.result.result.value : { error: 'no result' };
      };
      await send2('Page.enable'); await send2('Runtime.enable');
      for (let i = 0; i < 90; i++) {
        const s = await ev2("(function(){var b=document.getElementById('boot-splash');return {h:!b||b.classList.contains('hide'),rs:document.readyState,fn:typeof window.switchTab==='function'};})()");
        if (s && !s.error && s.h === true && s.rs === 'complete' && s.fn === true) break;
        await sleep(300);
      }
      return { ws: w, ev: ev2, id: t.id, send: send2 };
    }
    async function closeTab(tid) { try { await fetch('http://127.0.0.1:' + CDP_PORT + '/json/close/' + tid, { method: 'PUT' }); } catch (e) {} }

    /* ---- Tab 1: boot viewer normal (login shape: token via writeSecureStorage) ---- */
    await send('Page.navigate', { url: APP_URL });
    await waitBoot();
    await ev(GAS_SETUP);
    // seed = bentuk hasil writeSecureStorage (dual-write + touch); fungsi auth ada di scope internal app
    await ev("sessionStorage.setItem('rdi_viewer_token','" + payload + "');localStorage.setItem('rdi_viewer_token','" + payload + "');localStorage.setItem('rdi_last_active',String(Date.now()));'ok'");
    await send('Page.navigate', { url: APP_URL });
    const b1 = await waitBoot();
    rec('T1 boot dengan sesi siap', b1 && b1.n === 4, JSON.stringify(b1));

    let st = await ev("(function(){return {gate:!document.getElementById('login-gate').classList.contains('hide'),tok:localStorage.getItem('rdi_viewer_token')||'',la:parseInt(localStorage.getItem('rdi_last_active')||'0',10),sesT:sessionStorage.getItem('rdi_viewer_token')||''};})()");
    rec('T1 gate tersembunyi (login aktif)', st.gate === false, JSON.stringify({ gate: st.gate }));
    rec('T1 resume copy ada di localStorage', !!st.tok, 'len=' + (st.tok || '').length);
    rec('T1 rdi_last_active fresh (<10s)', st.la > 0 && Date.now() - st.la < 10000, 'age=' + (Date.now() - (st.la || 0)) + 'ms');
    rec('T1 sesi utama di sessionStorage', !!st.sesT, 'len=' + (st.sesT || '').length);

    /* ---- Tab 2: tab BARU (storage sama, sessionStorage kosong) = PWA dibuka lagi ---- */
    let t2 = await openFreshTab(APP_URL);
    let s2 = await t2.ev("(function(){return {gate:!document.getElementById('login-gate').classList.contains('hide'),sesT:sessionStorage.getItem('rdi_viewer_token')||'',tok:localStorage.getItem('rdi_viewer_token')||''};})()");
    rec('T2 tab baru: sesi DIPULIHKAN (gate hidden)', s2.gate === false, JSON.stringify({ gate: s2.gate }));
    rec('T2 tab baru: migrasi mengisi sessionStorage', !!s2.sesT, 'len=' + (s2.sesT || '').length);
    rec('T2 tab baru: resume copy tetap di localStorage', !!s2.tok, 'len=' + (s2.tok || '').length);
    await t2.ws.close(); await closeTab(t2.id); t2 = null;

    /* ---- Idle window: la = now-30 menit (<2 jam) → tetap login ---- */
    await ev("localStorage.setItem('rdi_last_active',String(Date.now()-30*60000));'ok'");
    t2 = await openFreshTab(APP_URL);
    s2 = await t2.ev("(function(){return {gate:!document.getElementById('login-gate').classList.contains('hide'),tok:localStorage.getItem('rdi_viewer_token')||''};})()");
    rec('T2b la=now-30m: masih login (gate hidden)', s2.gate === false, JSON.stringify({ gate: s2.gate }));
    rec('T2b la=now-30m: kredensial utuh', !!s2.tok, 'len=' + (s2.tok || '').length);
    await t2.ws.close(); await closeTab(t2.id); t2 = null;

    /* ---- Idle stale: la = now-3 jam (>2 jam) → auto-logout + purge ---- */
    await ev("localStorage.setItem('rdi_last_active',String(Date.now()-3*3600000));'ok'");
    t2 = await openFreshTab(APP_URL);
    s2 = await t2.ev("(function(){return {gate:!document.getElementById('login-gate').classList.contains('hide'),tok:localStorage.getItem('rdi_viewer_token')||'',sesT:sessionStorage.getItem('rdi_viewer_token')||'',la:localStorage.getItem('rdi_last_active'),ek:localStorage.getItem('rdi_editor_key')||''};})()");
    rec('T2c la=now-3h: GATE TERLIHAT (auto-logout)', s2.gate === true, JSON.stringify({ gate: s2.gate }));
    rec('T2c la=now-3h: resume copy dihapus', !s2.tok, 'tok len=' + (s2.tok || '').length);
    rec('T2c la=now-3h: sessionStorage token dihapus', !s2.sesT, 'sesT len=' + (s2.sesT || '').length);
    rec('T2c la=now-3h: rdi_last_active dibersihkan', s2.la === null, 'la=' + s2.la);
    await t2.ws.close(); await closeTab(t2.id);

    console.log('---');
    console.log('PASS / ' + fail + ' FAIL');
    try { ws.close(); } catch (e) {}
  } finally {
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
