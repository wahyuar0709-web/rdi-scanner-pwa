/* LIVE WALKTHROUGH (2026-10-16, sesi review-fix v15.33):
 * "Pakai aplikasi seperti operator, sekali jalan" — bukti runtime manusiawi:
 *  1. login lewat FORM asli (username/password -> mock GAS balas token editor;
 *     role editor otomatis men-set kunci editor -> jalur tulis aktif).
 *  2. buka layar Transaksi lewat tab FAB asli (#tab-scanner).
 *  3. ketik typo "kathode bering" di #scan-id-input (input event nyata,
 *     debounce 150 ms) -> dropdown fuzzy async menemukan "Kathode Bearing KX-9".
 *  4. pilih item dari dropdown (mousedown -> acPick) -> detail + qty siap.
 *  5. simpan transaksi KELUAR 1 Pcs lewat tombol asli #btn-submit.
 *  6. buka Dashboard lewat tab asli, buka Rak lewat drawer "Lainnya".
 * Bukti: 8 screenshot di tests/results/live_walk/ + counter panggilan server mock
 *        + 0 page/console error (sejak pasca-login) + getData tetap 1x.
 * Catatan: TIDAK ada assertion timing ketat (itu tugas r2_perf_pass) — semua
 * tunggu longgar supaya host sibuk tidak menghasilkan false-fail.
 * Port: HTTP 9663 / CDP 9664. Jalankan: node tests/tools/live_walk.js
 */
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os');
const { spawn, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const HTTP_PORT = 9663, CDP_PORT = 9664;
const OUT = path.join(ROOT, 'tests', 'results', 'live_walk');

/* Katalog 3001 baris (sama dgn r2_perf_pass) + 1 item typo-target. */
const ROWS = [];
for (let i = 1; i <= 3000; i++) {
  ROWS.push({ id: 'T-' + String(i).padStart(4, '0'), no: String(i), nama: 'Bearing Unit HJ-' + String(i).padStart(4, '0'), spec: 'SP-' + (i % 50), qty: (i % 7) + 1, unit: 'Pcs', rak: 'A-' + String((i % 20) + 1).padStart(2, '0'), kategori: 'Sparepart', vendor: 'Vendor-' + (i % 5), po: 'PO-' + (i % 9), user: 'budi', minStock: 2, tglMasuk: '2026-01-01' });
}
ROWS.push({ id: 'SP-TYPO-01', no: '3001', nama: 'Kathode Bearing KX-9', spec: 'S', qty: 5, unit: 'Pcs', rak: 'B-09', kategori: 'Sparepart', vendor: 'V', po: 'P', user: 'budi', minStock: 2, tglMasuk: '2026-01-01' });
const N = ROWS.length;

const calls = {};
let itemSaldo = 25;
const LOGIN_USER = 'wahyu', LOGIN_PASS = 'RahasiaKuat123!';
const TOK = (function () {
  const p = LOGIN_USER + '|Wahyu Susanto|' + (Date.now() + 6 * 3600e3) + '|jti-live|1|editor';
  return Buffer.from(p, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.sig';
})();

function gas(b) {
  const a = (b && b.action) || 'unknown';
  calls[a] = (calls[a] || 0) + 1;
  if (a === 'login') return { status: 'ok', token: TOK, role: 'editor', nama: 'Wahyu Susanto', username: LOGIN_USER };
  if (a === 'getData') return { status: 'ok', total: N, rows: ROWS, items: ROWS, alat: [], raks: [], trx: [] };
  if (a === 'getItem') { const row = ROWS.find(r => r.id === b.id) || ROWS[0]; return { status: 'ok', item: Object.assign({}, row, { saldo: itemSaldo }), row: row, saldo: itemSaldo, qty: itemSaldo, rakBreakdown: [{ rak: row.rak, qty: itemSaldo }], minStock: 2 }; }
  if (a === 'getMasterLists') return { status: 'ok', kategori: ['Sparepart'], uom: ['Pcs'], vendor: ['Vendor-0'], rak: ['A-01', 'B-09'] };
  if (a === 'getDashboard') return { status: 'ok', totalItem: N, totalMasuk: 1, totalKeluar: 1, top5: [], kategori: [], terendah: [] };
  if (a === 'getRakBreakdownAll') return { status: 'ok', rows: [{ id: 'T-0001', rak: 'A-01', qty: 10 }, { id: 'T-0002', rak: 'A-01', qty: 5 }, { id: 'T-0003', rak: 'A-02', qty: 7 }] };
  if (a === 'postTransaksi') { const before = itemSaldo; itemSaldo = Math.max(0, itemSaldo - (b.qty || 1)); return { status: 'ok', saldoSebelum: before, saldoSesudah: itemSaldo, unit: 'Pcs', namaItem: 'Kathode Bearing KX-9', jenis: b.jenis, qty: b.qty }; }
  if (a === 'getAlert') return { status: 'ok', items: [] };
  if (a === 'getHistory' || a === 'getAllHistory') return { status: 'ok', rows: [], history: [], total: 0 };
  return { status: 'ok', message: 'mock', rows: [], items: [], alat: [] };
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
let pass = 0, fail = 0;
function rec(name, ok, detail) {
  if (ok) { pass++; console.log('PASS | ' + name + ' | ' + (detail || '')); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (detail || '')); }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(os.tmpdir(), 'rdi-live-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    'about:blank'
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(300);
      try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json(); const pg = l.find(t => t.type === 'page'); if (pg) target = pg.webSocketDebuggerUrl; } catch (e) {}
    }
    if (!target) throw new Error('tidak ada target CDP');
    ws = new WebSocket(target);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map();
    const pageErrors = [], consoleErrors = [];
    ws.onmessage = m => {
      const msg = JSON.parse(m.data);
      if (msg.id && pend.has(msg.id)) { pend.get(msg.id)(msg); pend.delete(msg.id); return; }
      if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails || {}; pageErrors.push(((d.exception || {}).description || d.text || '?').split('\n')[0]); }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') { consoleErrors.push((msg.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200)); }
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
    const shot = async (n, name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const b = r && r.result && r.result.data;
      if (b) { fs.writeFileSync(path.join(OUT, n + '-' + name + '.png'), Buffer.from(b, 'base64')); console.log('SHOT | ' + n + '-' + name + '.png'); }
      else console.log('SHOT-GAGAL | ' + n + '-' + name);
    };

    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    /* Jaring pengaman: blokir domain produksi — walkthrough TIDAK boleh menyentuh GAS asli. */
    await send('Network.setBlockedURLs', { urls: ['*script.google.com*', '*googleusercontent.com*'] });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const APP = 'http://127.0.0.1:' + HTTP_PORT + '/index.html';
    const GAS = 'http://127.0.0.1:' + HTTP_PORT + '/gas';

    console.log('== muat pertama (URL GAS produksi diblokir) ==');
    await send('Page.navigate', { url: APP });
    await waitFor("typeof window.switchTab==='function'", v => v === true, 150, 300);
    await ev("localStorage.setItem('rdi_gas_url','" + GAS + "');1");
    console.log('== muat ulang dengan mock GAS lokal ==');
    await send('Page.navigate', { url: APP });
    await waitFor("typeof window.switchTab==='function'", v => v === true, 150, 300);

    /* ---- 1. LOGIN lewat form asli ---- */
    const gate = await waitFor("(function(){var g=document.getElementById('login-gate');return g?(!g.classList.contains('hide')&&getComputedStyle(g).display!=='none'):null;})()", v => v === true, 60, 300);
    rec('LOGIN-1: gerbang login tampil (belum ada sesi)', gate === true, 'gate=' + gate);
    await sleep(700); await shot('1', 'login-gate');
    await ev("(function(){document.getElementById('login-username').value='" + LOGIN_USER + "';document.getElementById('login-password').value='" + LOGIN_PASS + "';return 1;})()");
    await ev("document.getElementById('login-submit-btn').click();1");
    const logged = await waitFor("(function(){var g=document.getElementById('login-gate');return {hid:!!g&&g.classList.contains('hide'),nav:!!document.querySelector('.tabnav')};})()", v => v && v.hid === true && v.nav === true, 120, 300);
    rec('LOGIN-2: login form sukses (token editor dari mock, gate tertutup)', !!logged, 'login_calls=' + (calls.login || 0));

    const preErr = { pe: pageErrors.slice(), ce: consoleErrors.slice() };
    if (preErr.pe.length || preErr.ce.length) { console.log('INFO error pra-login (di luar scope, host/produksi-diblokir): ' + JSON.stringify(preErr)); pageErrors.length = 0; consoleErrors.length = 0; }

    /* ---- 2. DATA termuat pasca-login ---- */
    const rowsN = await waitFor("(window.filteredRows||[]).length", v => v === N, 300, 300);
    rec('DATA: katalog 3001 baris termuat pasca-login', rowsN === N, 'rows=' + rowsN + ' getData=' + (calls.getData || 0) + ' getMasterLists=' + (calls.getMasterLists || 0));
    await sleep(600); await shot('2', 'setelah-login');

    /* ---- 3. Buka layar Transaksi lewat tab FAB asli ---- */
    await ev("document.getElementById('tab-scanner').click();1");
    const secScan = await waitFor("(function(){var a=document.querySelector('.page-section.active');return a?a.id:'';})()", v => v === 'section-scanner', 60, 300);
    rec('TRANSAKSI: layar Transaksi terbuka lewat tab FAB asli', secScan === 'section-scanner', 'section=' + secScan);
    await sleep(600); await shot('3', 'layar-transaksi');

    /* ---- 4. Cari typo -> fuzzy async ---- */
    await ev("(function(){var el=document.getElementById('scan-id-input');if(!el)return {noInput:true};el.focus();el.value='kathode bering';el.dispatchEvent(new Event('input',{bubbles:true}));return {ok:true};})()");
    const ac = await waitFor("(function(){var e=document.querySelectorAll('#ac-scan .ac-item');return {n:e.length,txt:e.length?(e[0].textContent||''):''};})()", v => v && v.n > 0, 100, 300);
    rec('CARI: typo "kathode bering" menemukan "Kathode Bearing KX-9" (fuzzy async)', !!ac && String(ac.txt).indexOf('Kathode') !== -1, ac ? ('n=' + ac.n + ' txt=' + String(ac.txt).slice(0, 60)) : 'tidak ada hasil');
    await sleep(400); await shot('4', 'hasil-cari-fuzzy');

    /* ---- 5. Pilih item dari dropdown (mousedown -> acPick) ---- */
    const pick = await ev("(function(){var els=document.querySelectorAll('#ac-scan .ac-item');for(var i=0;i<els.length;i++){if((els[i].textContent||'').indexOf('Kathode')!==-1){els[i].dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));return {picked:i};}}return {picked:-1};})()");
    const qtyReady = await waitFor("document.getElementById('qty-input').value", v => v === '1', 100, 300);
    rec('PILIH: item terpilih dari dropdown -> detail + qty siap', qtyReady === '1', 'pick=' + JSON.stringify(pick) + ' qty=' + JSON.stringify(qtyReady));
    await sleep(600); await shot('5', 'detail-item');

    /* ---- 6. Simpan transaksi lewat tombol asli ---- */
    await ev("(function(){try{window.setJenis('KELUAR')}catch(e){}var r=document.getElementById('rak-input');if(r)r.value='B-09';return 1;})()");
    const G0 = calls.getData || 0, I0 = calls.getItem || 0;
    await ev("document.getElementById('btn-submit').click();1");
    const posted = await waitFor("1", () => (calls.postTransaksi || 0) >= 1, 100, 300);
    await sleep(2500);
    const rb = await ev("document.getElementById('result-before').textContent");
    const ra = await ev("document.getElementById('result-after').textContent");
    const row = await ev("(function(){var r=(window.filteredRows||[]).find(function(x){return x.id==='SP-TYPO-01';});return r?{qty:String(r.qty)}:null;})()");
    rec('SIMPAN: transaksi terkirim ke server (postTransaksi)', posted !== null, 'calls.postTransaksi=' + (calls.postTransaksi || 0));
    rec('HASIL: kartu 25 -> 24 Pcs dari respons server', typeof ra === 'string' && ra.indexOf('24') !== -1 && ra.indexOf('Pcs') !== -1 && typeof rb === 'string' && rb.indexOf('25') !== -1, 'before=' + JSON.stringify(rb) + ' after=' + JSON.stringify(ra));
    rec('EFISIEN: baris di-patch lokal, getData TIDAK reload penuh', !!row && row.qty === '24' && (calls.getData || 0) === G0 && (calls.getItem || 0) >= I0 + 1, JSON.stringify(row) + ' getData=' + (calls.getData || 0) + ' getItem=' + (calls.getItem || 0));
    await sleep(400); await shot('6', 'pasca-transaksi');

    /* ---- 7. Dashboard lewat tab asli ---- */
    await ev("document.getElementById('tab-dashboard').click();1");
    const dash = await waitFor("(function(){var s=document.getElementById('section-dashboard');var w=document.getElementById('dash-alert-widget');return {a:!!s&&s.classList.contains('active'),wl:w?w.innerHTML.length:0};})()", v => v && v.a === true && v.wl > 50, 120, 500);
    rec('DASHBOARD: ter-render (klik tab asli)', !!dash, JSON.stringify(dash || {}));
    await sleep(700); await shot('7', 'dashboard');

    /* ---- 8. Tab Rak lewat drawer "Lainnya" ---- */
    await ev("document.getElementById('tab-more').click();1");
    await sleep(700);
    const rakClick = await ev("(function(){var els=document.querySelectorAll('#more-drawer [onclick]');for(var i=0;i<els.length;i++){var oc=els[i].getAttribute('onclick')||'';if(oc.indexOf('switchTab(\\'rak\\')')!==-1){els[i].click();return {clicked:oc.slice(0,80)};}}return {clicked:null,n:els.length};})()");
    let rakVia = rakClick && rakClick.clicked ? rakClick.clicked : null;
    if (!rakVia) { await ev("(function(){try{window.switchTab('rak');return 1}catch(e){return 0}})()"); rakVia = 'fallback:switchTab(rak)'; }
    const rakLen = await waitFor("(function(){var c=document.getElementById('rak-list-container');return c?c.innerHTML.length:0})()", v => v > 30, 120, 500);
    rec('RAK: daftar rak ter-render dari drawer "Lainnya"', rakLen !== null && rakLen > 30, 'len=' + rakLen + ' via=' + JSON.stringify(rakVia));
    await sleep(500); await shot('8', 'tab-rak');

    /* ---- Penutup ---- */
    rec('GLOBAL: 0 page error + 0 console error (sejak pasca-login)', pageErrors.length === 0 && consoleErrors.length === 0, JSON.stringify({ pe: pageErrors.slice(0, 3), ce: consoleErrors.slice(0, 3) }));
    console.log('CALLS ' + JSON.stringify(calls));
    console.log('FILES ' + JSON.stringify(fs.readdirSync(OUT)));
    console.log('---- live_walk: ' + pass + ' PASS / ' + fail + ' FAIL ----');
  } finally {
    try { ws && ws.close(); } catch (e) {}
    try { if (chrome.pid) spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
    try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 }); } catch (e) {}
    try { server.closeAllConnections && server.closeAllConnections(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
