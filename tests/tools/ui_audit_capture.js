/* UI AUDIT CAPTURE (2026-10-18) — read-only.
 * Tujuan: bukti visual + ukuran DOM untuk audit UI/UX (bukan gate rilis).
 *  - login lewat form asli (mock GAS lokal, domain produksi diblokir)
 *  - tangkap layar: login, master, dashboard, transaksi, riwayat,
 *    drawer Lainnya, rak, cetak, aset, alert, modal Pengaturan,
 *    master@320, master@landscape
 *  - ukur per layar: overflowX, target <44px, kontrol ikon tanpa label,
 *    padding input vs posisi ikon, overflow anak topbar, elemen fixed
 * Jalankan: node tests/tools/ui_audit_capture.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'tests', 'results', 'ui_audit_20261018');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const HTTP_PORT = 9495, CDP_PORT = 9496;

const rows = [];
const names = ['Bearing Unit', 'V-Belt', 'Cutting Wheel', 'Mata Saw', 'Cutter Blade', 'Seal O-Ring', 'Filter Oli', 'Selang Hidrolik'];
for (let i = 1; i <= 120; i++) {
  const qty = i % 10 === 0 ? 0 : (i % 7 === 0 ? 1 : (i % 9) + 3);
  rows.push({
    id: 'T-' + String(i).padStart(4, '0'), no: String(i),
    nama: names[i % names.length] + ' ' + ['AX', 'BX', 'CX'][i % 3] + '-' + String(i).padStart(3, '0') + (i === 3 ? ' Tipe Flange Panjang Dengan Adaptor Khusus' : ''),
    spec: 'SP-' + (i % 50), qty, unit: 'Pcs', rak: 'A-' + String((i % 20) + 1).padStart(2, '0'),
    kategori: 'Sparepart', vendor: 'Vendor-' + (i % 5), po: 'PO-' + (i % 9), user: 'budi', minStock: 2, tglMasuk: '2026-01-01'
  });
}
const N = rows.length;

function dayStr(offset) {
  const d = new Date(Date.now() + offset * 864e5);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
const history = [];
for (let i = 0; i < 12; i++) {
  const r = rows[i * 3 + 1];
  history.push({
    timestamp: dayStr(i < 6 ? 0 : -1) + ' ' + String(8 + (i % 6)).padStart(2, '0') + ':' + String((i * 7) % 60).padStart(2, '0') + ':00',
    itemId: r.id, nama: r.nama, spec: r.spec, jenis: i % 2 ? 'KELUAR' : 'MASUK', qty: (i % 4) + 1, unit: 'Pcs',
    rak: r.rak, admin: 'Wahyu Susanto', saldoSebelum: r.qty + 2, saldoSesudah: r.qty + 1, keterangan: 'mock audit'
  });
}
const asetItems = [
  { kodeAlat: 'BLD-01', namaAlat: 'Mata Saw Blade 305mm', spesifikasi: '305 x 25.4 x 80T', statusKondisi: 'AMAN', siapPakai: 12, sedangDipakai: 4, menungguAsah: 2, sedangDiasah: 1 },
  { kodeAlat: 'BLD-02', namaAlat: 'Cutter Blade CNC', spesifikasi: 'Tipe A / 120mm', statusKondisi: 'KRITIS', siapPakai: 2, sedangDipakai: 6, menungguAsah: 3, sedangDiasah: 2 },
  { kodeAlat: 'BLD-03', namaAlat: 'Mata Bor HSS', spesifikasi: 'Set 1-13mm', statusKondisi: 'HABIS', siapPakai: 0, sedangDipakai: 1, menungguAsah: 0, sedangDiasah: 0 },
  { kodeAlat: 'BLD-04', namaAlat: 'Insert Carbide', spesifikasi: 'CNMG 120408', statusKondisi: 'AMAN', siapPakai: 34, sedangDipakai: 8, menungguAsah: 1, sedangDiasah: 0 }
];

const LOGIN_USER = 'wahyu', LOGIN_PASS = 'RahasiaKuat123!';
const TOK = (function () {
  const p = LOGIN_USER + '|Wahyu Susanto|' + (Date.now() + 6 * 3600e3) + '|jti-audit|1|editor';
  return Buffer.from(p, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.sig';
})();

function gas(b) {
  const a = (b && b.action) || 'unknown';
  if (a === 'login') return { status: 'ok', token: TOK, role: 'editor', nama: 'Wahyu Susanto', username: LOGIN_USER };
  if (a === 'getData') return { status: 'ok', total: N, rows, items: rows, alat: [], raks: [], trx: [] };
  if (a === 'getItem') { const row = rows.find(r => r.id === b.id) || rows[0]; return { status: 'ok', item: row, row, saldo: row.qty, qty: row.qty, rakBreakdown: [{ rak: row.rak, qty: row.qty }], minStock: 2 }; }
  if (a === 'getMasterLists') return { status: 'ok', kategori: ['Sparepart'], uom: ['Pcs'], vendor: ['Vendor-0'], rak: ['A-01', 'A-02'] };
  if (a === 'getDashboard') return { status: 'ok', totalItem: N, totalMasuk: 6, totalKeluar: 9, top5: [], kategori: [], terendah: [] };
  if (a === 'getRakBreakdownAll') return { status: 'ok', rows: rows.slice(0, 30).map(r => ({ id: r.id, rak: r.rak, qty: r.qty })) };
  if (a === 'getAlert') return { status: 'ok', items: [] };
  if (a === 'getHistory' || a === 'getAllHistory') return { status: 'ok', rows: history, history, total: history.length };
  if (a === 'getAsetDashboard') return { status: 'ok', data: { totalUnit: 38, siapPakai: 21, sedangDipakai: 9, itemButuhPerhatian: 4, menungguAsah: 3, sedangDiasah: 1 } };
  if (a === 'getAsetItemList') return { status: 'ok', data: asetItems };
  return { status: 'ok', message: 'mock', rows: [], items: [], alat: [], data: [], history: [] };
}

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/gas') {
    const ch = [];
    req.on('data', c => ch.push(c));
    req.on('end', () => {
      let b = {};
      try { b = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(gas(b)));
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

const MEASURE = `(function(){
  function vis(el){ if(!el) return false; var r=el.getBoundingClientRect(); if(r.width<1||r.height<1) return false; var s=getComputedStyle(el); if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0') return false; if(el.closest('.login-gate:not(.hide)')) return false; return true; }
  function label(el){ var t=(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').replace(/\\s+/g,' ').trim(); return t.slice(0,42); }
  var de=document.documentElement;
  var out={ section:(document.querySelector('.page-section.active')||{}).id||'', overflowX: de.scrollWidth-de.clientWidth, vw: window.innerWidth, vh: window.innerHeight };
  var tb=document.querySelector('.topbar');
  if(tb){ var tr=tb.getBoundingClientRect(); var cs=getComputedStyle(tb);
    out.topbar={ x:Math.round(tr.x), w:Math.round(tr.width), h:Math.round(tr.height), clientH:tb.clientHeight, scrollH:tb.scrollHeight, overflow:cs.overflow, minH:cs.minHeight, children:[] };
    for(var i=0;i<tb.children.length;i++){ var c=tb.children[i], r=c.getBoundingClientRect(), s=getComputedStyle(c);
      if(s.display==='none') continue;
      out.topbar.children.push({ cls:String(c.className||c.id||c.tagName).slice(0,34), x:Math.round(r.x), right:Math.round(r.right), top:Math.round(r.top), bottom:Math.round(r.bottom), h:Math.round(r.height), overTop:Math.max(0,Math.round(tr.top-r.top)), overBottom:Math.max(0,Math.round(r.bottom-tr.bottom)), rightOver:Math.max(0,Math.round(r.right-tr.right)), ws:s.whiteSpace, ov:s.textOverflow });
    }
  }
  out.searches=[];
  document.querySelectorAll('.search-input').forEach(function(inp){
    if(!vis(inp)) return; var wr=inp.closest('.search-wrap'); var ic=wr?wr.querySelector('svg'):null;
    var ir=ic?ic.getBoundingClientRect():null, r=inp.getBoundingClientRect(), s=getComputedStyle(inp);
    var padL=parseFloat(s.paddingLeft)||0;
    out.searches.push({ id:inp.id, padLeft:Math.round(padL), iconRight:ir?Math.round(ir.right-r.left):null, overlap:!!ir&&(ir.right-r.left)>padL+1, font:s.fontSize, h:Math.round(r.height), ph:(inp.placeholder||'').slice(0,32) });
  });
  var sel='button,a[href],input:not([type=hidden]),select,textarea,[role=button],[onclick]';
  out.small=[]; out.unlabeled=[]; out.controls=0;
  document.querySelectorAll(sel).forEach(function(el){
    if(!vis(el)) return; var r=el.getBoundingClientRect(); var tag=el.tagName.toLowerCase();
    if(tag==='input'&&['hidden','checkbox','radio'].indexOf(el.type)>=0) return;
    out.controls++;
    if(Math.min(r.width,r.height)<44){ out.small.push({ tag:tag, id:el.id||'', cls:String(el.className||'').slice(0,34), lab:label(el), w:Math.round(r.width), h:Math.round(r.height) }); }
    var txt=(el.textContent||'').trim(); var aria=el.getAttribute('aria-label')||el.getAttribute('title');
    if(!txt&&!aria&&(tag==='button'||el.getAttribute('role')==='button')){ out.unlabeled.push({ tag:tag, id:el.id||'', cls:String(el.className||'').slice(0,34) }); }
  });
  out.fixed=[];
  document.querySelectorAll('nav, [class*=sheet], [class*=modal]').forEach(function(el){
    if(!vis(el)) return; var s=getComputedStyle(el); if(s.position!=='fixed'&&s.position!=='sticky') return;
    var r=el.getBoundingClientRect();
    out.fixed.push({ id:el.id||'', cls:String(el.className||'').slice(0,30), top:Math.round(r.top), bottom:Math.round(r.bottom), h:Math.round(r.height), padB:s.paddingBottom, cutBottom:r.bottom>window.innerHeight+2 });
  });
  return out;
})()`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(os.tmpdir(), 'rdi-uiaudit-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    'about:blank'
  ], { stdio: 'ignore' });

  let ws = null;
  const report = { shots: [], screens: {}, errors: { page: [], console: [] } };
  try {
    let target = null;
    for (let i = 0; i < 80 && !target; i++) {
      await sleep(300);
      try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json(); const pg = l.find(t => t.type === 'page'); if (pg) target = pg.webSocketDebuggerUrl; } catch (e) {}
    }
    if (!target) throw new Error('tidak ada target CDP');
    ws = new WebSocket(target);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map();
    ws.onmessage = m => {
      const msg = JSON.parse(m.data);
      if (msg.id && pend.has(msg.id)) { pend.get(msg.id)(msg); pend.delete(msg.id); return; }
      if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails || {}; report.errors.page.push(((d.exception || {}).description || d.text || '?').split('\n')[0]); }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') { report.errors.console.push((msg.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200)); }
    };
    const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
    const ev = async (x, ms) => {
      const to = new Promise(res => setTimeout(() => res({ __err: 'TIMEOUT' }), ms || 30000));
      const r = await Promise.race([send('Runtime.evaluate', { expression: x, returnByValue: true }), to]);
      if (r && r.__err) return r;
      if (r && r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || 'exc').split('\n')[0] };
      return r && r.result && r.result.result ? r.result.result.value : null;
    };
    const waitFor = async (expr, pred, tries, gap) => { for (let i = 0; i < tries; i++) { const r = await ev(expr); if (r !== null && r !== undefined && pred(r)) return r; await sleep(gap); } return null; };
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const b = r && r.result && r.result.data;
      if (b) { fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(b, 'base64')); report.shots.push(name + '.png'); console.log('SHOT | ' + name + '.png'); }
      else console.log('SHOT-GAGAL | ' + name);
    };
    const measure = async (name) => { const m = await ev(MEASURE, 30000); report.screens[name] = m; console.log('MEASURE | ' + name + ' | ' + JSON.stringify({ overflowX: m && m.overflowX, small: m && m.small ? m.small.length : null, unlabeled: m && m.unlabeled ? m.unlabeled.length : null, searches: m && m.searches })); return m; };

    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*script.google.com*', '*googleusercontent.com*'] });
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    const APP = 'http://127.0.0.1:' + HTTP_PORT + '/index.html';
    const GAS = 'http://127.0.0.1:' + HTTP_PORT + '/gas';

    await send('Page.navigate', { url: APP });
    await waitFor("typeof window.switchTab==='function'", v => v === true, 150, 300);
    await ev("localStorage.setItem('rdi_gas_url','" + GAS + "');1");
    await send('Page.navigate', { url: APP });
    await waitFor("typeof window.switchTab==='function'", v => v === true, 150, 300);

    await waitFor("(function(){var g=document.getElementById('login-gate');return g?(!g.classList.contains('hide')&&getComputedStyle(g).display!=='none'):null;})()", v => v === true, 60, 300);
    await sleep(800); await shot('01-login-375');
    await ev("(function(){document.getElementById('login-username').value='" + LOGIN_USER + "';document.getElementById('login-password').value='" + LOGIN_PASS + "';return 1;})()");
    await ev("document.getElementById('login-submit-btn').click();1");
    const logged = await waitFor("(function(){var g=document.getElementById('login-gate');return !!g&&g.classList.contains('hide');})()", v => v === true, 120, 300);
    await waitFor("(window.filteredRows||[]).length", v => v === N, 300, 300);
    await sleep(700);
    await shot('02-master-375'); await measure('master-375');

    await ev("document.getElementById('tab-dashboard').click();1");
    await waitFor("(function(){var s=document.getElementById('section-dashboard');return s&&s.classList.contains('active');})()", v => v === true, 60, 300);
    await sleep(1200); await shot('03-dashboard-375'); await measure('dashboard-375');

    await ev("document.getElementById('tab-scanner').click();1");
    await waitFor("(function(){var s=document.getElementById('section-scanner');return s&&s.classList.contains('active');})()", v => v === true, 60, 300);
    await sleep(700); await shot('04-transaksi-375'); await measure('transaksi-375');

    await ev("document.getElementById('tab-history').click();1");
    await waitFor("(function(){var c=document.getElementById('hist-feed-container');return c?c.querySelectorAll('.hist-card-row').length:0;})()", v => v > 0, 80, 300);
    await sleep(800); await shot('05-riwayat-375'); await measure('riwayat-375');

    await ev("document.getElementById('tab-more').click();1");
    await waitFor("(function(){var d=document.getElementById('more-drawer');return !!d&&d.classList.contains('show');})()", v => v === true, 60, 200);
    await sleep(500); await shot('06-drawer-375'); await measure('drawer-375');
    await ev("(function(){try{closeMoreDrawer()}catch(e){}return 1})()"); await sleep(500);

    await ev("(function(){try{window.switchTab('rak');return 1}catch(e){return 0}})()");
    await sleep(1200); await shot('07-rak-375'); await measure('rak-375');

    await ev("(function(){try{window.switchTab('cetak');return 1}catch(e){return 0}})()");
    await sleep(1200); await shot('08-cetak-375'); await measure('cetak-375');

    await ev("(function(){try{window.switchTab('aset');return 1}catch(e){return 0}})()");
    await sleep(1500); await shot('09-aset-375'); await measure('aset-375');

    await ev("(function(){try{window.switchTab('alert');return 1}catch(e){return 0}})()");
    await sleep(1200); await shot('10-alert-375'); await measure('alert-375');

    await ev("(function(){try{showConfig();return 1}catch(e){return 0}})()");
    await waitFor("(function(){var m=document.getElementById('modal-config');return !!m&&m.classList.contains('show');})()", v => v === true, 40, 200);
    await sleep(500); await shot('11-pengaturan-375'); await measure('pengaturan-375');
    await ev("(function(){var m=document.getElementById('modal-config');if(m)m.classList.remove('show');return 1})()");

    await ev("(function(){try{window.switchTab('master');return 1}catch(e){return 0}})()");
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
    await sleep(900); await shot('12-master-320'); await measure('master-320');

    await send('Emulation.setDeviceMetricsOverride', { width: 812, height: 375, deviceScaleFactor: 2, mobile: true });
    await sleep(900); await shot('13-master-landscape'); await measure('master-landscape');

    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await sleep(500);

    report.loggedIn = logged === true;
    report.rowCount = N;
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log('REPORT | ' + path.join(OUT, 'report.json'));
    console.log('ERRORS | page=' + report.errors.page.length + ' console=' + report.errors.console.length);
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
}

main().catch(e => { console.error('FATAL | ' + (e && e.stack || e)); process.exitCode = 1; });
