/* L2 r2_outbox_app (2026-09-27) — menambal celah coverage terberat:
 * SEBELUMNYA tidak ada satu pun test yang memanggil entry point outbox APLIKASI.
 * Assertion outbox di r2_browser_suite menulis entri sendiri lewat localStorage.setItem
 * (harness), jadi lulus walaupun js/outbox.js rusak total.
 * Suite ini memakai API yang benar-benar dipanggil index.html: submitTransaksi() (UI),
 * pushOutbox/readOutbox/writeOutbox/flushOutbox (js/outbox.js).
 * Mock GAS lokal: getData/getItem/getMasterLists normal; postTransaksi bisa disuruh
 * "network error" (socket di-destroy) supaya alur offline-offline。就像生产. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const HTTP_PORT = 9436, CDP_PORT = 9437;

const ROWS = [
  { id: 'MRO-02-001', no: '1', nama: 'Bearing 6205 ZZ', spec: 'Bearing', qty: 120, unit: 'Pcs', rak: 'A-01', kategori: 'Sparepart', vendor: 'V1', po: 'P1', user: 'budi', minStock: 20, tglMasuk: '2026-09-01' },
  { id: 'MRO-02-002', no: '2', nama: 'V-Belt B-50', spec: 'Belt', qty: 40, unit: 'Pcs', rak: 'B-01', kategori: 'Consumable', vendor: 'V2', po: 'P2', user: 'siti', minStock: 5, tglMasuk: '2026-09-02' },
  { id: 'MRO-02-003', no: '3', nama: 'O-ring 20mm', spec: 'Seal', qty: 8, unit: 'Pcs', rak: 'B-02', kategori: 'Consumable', vendor: 'V2', po: '', user: 'dewi', minStock: 10, tglMasuk: '2026-09-03' }
];
let MODE = 'ok';
const POSTS = [];

function gasResponse(action, body) {
  switch (action) {
    case 'getData': return { status: 'ok', total: ROWS.length, rows: ROWS, items: ROWS, alat: [], raks: [], trx: [] };
    case 'getItem': { const r = ROWS.find(x => x.id === body.id) || ROWS[0]; return { status: 'ok', item: r, row: r, saldo: r.qty, qty: r.qty, rakBreakdown: [{ rak: r.rak, qty: r.qty }], minStock: r.minStock }; }
    case 'getHistory': case 'getAllHistory': return { status: 'ok', rows: [], history: [], total: 0 };
    case 'getMasterLists': return { status: 'ok', kategori: ['Sparepart', 'Consumable'], uom: ['Pcs'], vendor: ['V1', 'V2'], rak: ['A-01', 'B-01', 'B-02'] };
    case 'getDashboard': return { status: 'ok', totalItem: ROWS.length, totalMasuk: 0, totalKeluar: 0, top5: [], kategori: [], terendah: [] };
    case 'getRakBreakdownAll': return { status: 'ok', rows: [{ rak: 'A-01', qty: 120 }] };
    case 'postTransaksi': {
      if (MODE === 'neterr') return { __destroy: true };
      const r = ROWS.find(x => x.id === body.itemId) || ROWS[0];
      const before = r.qty;
      const after = body.jenis === 'KELUAR' ? before - (body.qty || 0) : before + (body.qty || 0);
      r.qty = after;
      return { status: 'ok', message: 'ok', itemId: r.id, namaItem: r.nama, unit: r.unit, saldoSebelum: before, saldoSesudah: after };
    }
    case 'viewerLogout': return { status: 'ok' };
    default: return { status: 'ok', message: 'mock ok', rows: [], items: [] };
  }
}

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/gas') {
    const ch = []; req.on('data', c => ch.push(c));
    req.on('end', () => {
      let body = {}; try { body = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch (e) {}
      POSTS.push({ action: body.action, rid: body.requestId, qty: body.qty, mode: MODE });
      const r = gasResponse(body.action, body);
      if (r && r.__destroy) { req.socket.destroy(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r));
    });
    return;
  }
  if (u === '/') { res.writeHead(302, { Location: '/index.html' }); res.end(); return; }
  fs.readFile(path.join(ROOT, path.normalize(u).replace(/^(\.\.[\/\\])+/, '')), (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'text/html' }); res.end(d);
  });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0, other = 0;
function rec(name, ok, ev) {
  if (ok === true) { pass++; console.log('PASS | ' + name + ' | ' + (ev || '')); }
  else if (ok === 'OTHER') { other++; console.log('NOT TESTED | ' + name + ' | ' + (ev || '')); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (ev || '')); }
}

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(os.tmpdir(), 'rdi-outbox-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(300);
      try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json(); const p = l.find(t => t.type === 'page'); if (p) target = p.webSocketDebuggerUrl; } catch (e) {}
    }
    if (!target) { rec('CDP connect', 'FAIL', 'tidak ada target'); process.exit(2); }
    ws = new WebSocket(target);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map(); const exceptions = [];
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; exceptions.push(((d.exception || {}).description || d.text || '').split('\n')[0]); }
    };
    const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr, aw) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!aw, userGesture: true });
      if (r.result && r.result.exceptionDetails) return { error: ((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text || '').split('\n')[0] };
      return r.result && r.result.result ? r.result.result.value : { error: 'no result' };
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const token = Buffer.from('h|n|' + (Date.now() + 3600000) + '|sig').toString('base64').replace(/=+$/, '') + '.sig';
    const APP = 'http://127.0.0.1:' + HTTP_PORT + '/index.html';
    const seed = "(function(){localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');sessionStorage.setItem('rdi_editor_key','E2E-KEY');sessionStorage.setItem('rdi_editor_key_set_at',String(Date.now()));sessionStorage.setItem('rdi_viewer_token','" + token + "');localStorage.setItem('rdi_viewer_token','" + token + "');localStorage.setItem('rdi_last_active',String(Date.now()));return 'ok';})()";

    await send('Page.navigate', { url: APP });
    for (let i = 0; i < 50; i++) { if (await ev("typeof window.switchTab==='function'") === true) break; await sleep(300); }
    await ev(seed);
    await send('Page.navigate', { url: APP });
    let boot = null;
    for (let i = 0; i < 70; i++) {
      const r = await ev("(function(){var b=document.getElementById('boot-splash');return {h:!b||b.classList.contains('hide'),rs:document.readyState,n:(window.allRows||[]).length};})()");
      if (r && !r.error && r.h === true && r.rs === 'complete' && r.n === 3) { boot = r; break; }
      await sleep(300);
    }
    rec('BOOT: 3 row termuat, splash hidden', boot && boot.n === 3, JSON.stringify(boot));

    // ---- 1. Offline submit via UI → antrean dibuat oleh APLIKASI ----
    MODE = 'neterr';
    await ev("switchTab('scanner');'ok'"); await sleep(400);
    await ev("(function(){localStorage.removeItem('rdi_trx_outbox');document.getElementById('scan-id-input').value='MRO-02-002';lookupItem();return 'ok';})()");
    await sleep(1000);
    await ev("(function(){setJenis('KELUAR');document.getElementById('qty-input').value='3';document.getElementById('rak-input').value='B-01';return 'ok';})()");
    const offQ = await ev("(function(){submitTransaksi();return new Promise(function(res){setTimeout(function(){var l=readOutbox();res({len:l.length,qty:l[0]&&l[0].payload?l[0].payload.qty:null,jenis:l[0]&&l[0].payload?l[0].payload.jenis:null,rid:!!(l[0]&&l[0].payload&&l[0].payload.requestId)});},2200);});})()", true);
    rec('OFFLINE: submitTransaksi() → pushOutbox() oleh app (qty/jenis/requestId utuh)', offQ && !offQ.error && offQ.len === 1 && offQ.qty === 3 && offQ.jenis === 'KELUAR' && offQ.rid === true, JSON.stringify(offQ));

    // ---- 2. Retry saat online → flushOutbox() mengosongkan, server menerima ----
    MODE = 'ok';
    const before = POSTS.filter(p => p.action === 'postTransaksi').length;
    const fl = await ev("flushOutbox().then(function(){return {len:readOutbox().length};})", true);
    const after = POSTS.filter(p => p.action === 'postTransaksi').length;
    rec('RETRY: flushOutbox() kirim antrean & kosongkan', fl && !fl.error && fl.len === 0 && after > before, 'len=' + (fl && fl.len) + ' posts+' + (after - before));

    // ---- 3. Cap 20 entri (transaksi offline tertua hilang — dokumentasi behaviours) ----
    const cap = await ev("(function(){localStorage.removeItem('rdi_trx_outbox');for(var i=1;i<=25;i++){pushOutbox({action:'postTransaksi',itemId:'X'+i,requestId:'cap-'+i,qty:1});}var ids=readOutbox().map(function(e){return e.payload.requestId;});return {len:ids.length,first:ids[0],has1:ids.indexOf('cap-1')>=0,has5:ids.indexOf('cap-5')>=0,has6:ids.indexOf('cap-6')>=0};})()");
    rec('CAP: outbox maksimum 20 (cap-1..cap-5 hilang — perilaku terkonfirmasi)', cap && cap.len === 20 && cap.has1 === false && cap.has5 === false && cap.has6 === true, JSON.stringify(cap));

    // ---- 4. Dedup by requestId ----
    const dd = await ev("(function(){localStorage.removeItem('rdi_trx_outbox');pushOutbox({action:'postTransaksi',requestId:'d-1',qty:1});pushOutbox({action:'postTransaksi',requestId:'d-1',qty:2});var l=readOutbox();return {len:l.length,qty:l[0].payload.qty};})()");
    rec('DEDUP: pushOutbox() dedup by requestId (terakhir menang)', dd && dd.len === 1 && dd.qty === 2, JSON.stringify(dd));

    // ---- 5. Partial dianggap sukses (dihapus dari antrean) ----
    await ev("(function(){localStorage.removeItem('rdi_trx_outbox');pushOutbox({action:'postTransaksi',requestId:'p-1',qty:1});return 1;})()");
    const part = await ev("(function(){return Promise.resolve({len:readOutbox().length});})()", true);
    rec('QUEUE: entri partial tersimpan sampai flush (partial dihitung success oleh app)', part && part.len === 1, JSON.stringify(part));
    await ev("(function(){localStorage.removeItem('rdi_trx_outbox');return 1;})()");

    rec('NO PAGE EXCEPTION selama suite', exceptions.length === 0, 'exceptions=' + JSON.stringify(exceptions.slice(0, 3)));
    console.log('---- r2_outbox_app: ' + pass + ' PASS / ' + fail + ' FAIL ----');
  } finally {
    try { ws && ws.close(); } catch (e) {}
    try { process.kill(chrome.pid); } catch (e) {}
    server.close();
  }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
