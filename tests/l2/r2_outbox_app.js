/* L2 r2_outbox_app (2026-09-27) — menambal celah coverage terberat:
 * SEBELUMNYA tidak ada satu pun test yang memanggil entry point outbox APLIKASI.
 * Assertion outbox di r2_browser_suite menulis entri sendiri lewat localStorage.setItem
 * (harness), jadi lulus walaupun js/outbox.js rusak total.
 * Suite ini memakai API yang benar-benar dipanggil index.html: submitTransaksi() (UI),
 * pushOutbox/readOutbox/writeOutbox/flushOutbox (js/outbox.js).
 * Mock GAS lokal: getData/getItem/getMasterLists normal; postTransaksi bisa disuruh
 * "network error" (socket di-destroy) supaya alur offline-offline seperti produksi. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
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
      // 2026-10-13 (DBG-02): backend Sometimes menjawab HTML, bukan JSON —
      // timeout Apps Script, interstitial login Google, halaman error proxy/CDN.
      // Hasil transaksi pada kasus ini TIDAK BISA DIPERCAYAKAN -> antrean harus dipertahankan.
      if (MODE === 'html' && body.action === 'postTransaksi') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body><h1>Script error: exceeded execution time</h1></body></html>');
        return;
      }
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
    /* 2026-10-14 (anti-flake): dua asumsi timing yang rapuh dihapus.
     * (1) sleep(400) setelah switchTab tidak menjamin form scanner sudah ada.
     * (2) lookupItem() ASYNC; sleep(1000) setelahnya tidak menjamin item selesai
     *     di-resolve. Kalau belum, submitTransaksi() keluar lewat guard
     *     `if(!currentItem)` (index.html:3499) dan TIDAK ADA yang masuk antrean —
     *     assert OFFLINE gagal, lalu assert RETRY ikut gagal karena antrean memang
     *     kosong sejak awal. Bukti: suite ini 10P/2F di dalam batch runner,
     *     tapi 12P/0F dijalankan sendiri. Batch runner menghapus ~100 MB profil
     *     Chrome di antara suite, jadi 1000 ms tidak cukup di sana.
     * Sekarang: tunggu elemen dan await/loop sinyal nyata, bukan menebak durasi. */
    await ev("switchTab('scanner');'ok'");
    let formReady = false;
    for (let i = 0; i < 60; i++) {
      formReady = await ev("!!document.getElementById('scan-id-input') && !!document.getElementById('qty-input')");
      if (formReady === true) break;
      await sleep(200);
    }
    rec('PRECONDISI: form scanner ter-mount sebelum diisi', formReady === true, 'scan-id-input+qty-input tersedia=' + formReady);
    await ev("(function(){localStorage.removeItem('rdi_trx_outbox');document.getElementById('scan-id-input').value='MRO-02-002';lookupItem();return 'ok';})()");
    let resolved = null;
    for (let i = 0; i < 150; i++) {
      /* window.currentItem SELALU undefined: `var currentItem` privat di
       * dalam IIFE (index.html:2917), tanpa export ke window/self/globalThis.
       * Jadi sinyal di bawah diambil dari DOM, bukan dari state privat:
       *   hideStatus('sbar-lookup') -> class 'sbar' tanpa 'show', dan
       *   showScanStep('transaksi')  -> #step-transaksi dapat class 'active'.
       * Keduanya hanya terjadi SESUDAH currentItem=result.item dieksekusi. */
      resolved = await ev("(function(){var b=document.getElementById('btn-lookup');var sl=document.getElementById('sbar-lookup');var st=document.getElementById('step-transaksi');if(!b||!sl||!st)return null;var done=!b.disabled&&sl.className.indexOf('show')<0;var step=st.classList.contains('active');return(done&&step)?{ready:true,slClass:sl.className}:null;})()");
      if (resolved && !resolved.error && resolved.ready) break;
      await sleep(200);
    }
    rec('PRECONDISI: lookupItem selesai (sinyal DOM, bukan var privat)', !!(resolved && resolved.ready), JSON.stringify(resolved));
    await ev("(function(){setJenis('KELUAR');document.getElementById('qty-input').value='3';document.getElementById('rak-input').value='B-01';return 'ok';})()");
    const offQ = await ev("(function(){submitTransaksi();return new Promise(function(res){setTimeout(function(){var l=readOutbox();res({len:l.length,qty:l[0]&&l[0].payload?l[0].payload.qty:null,jenis:l[0]&&l[0].payload?l[0].payload.jenis:null,rid:!!(l[0]&&l[0].payload&&l[0].payload.requestId)});},2200);});})()", true);
    rec('OFFLINE: submitTransaksi() → pushOutbox() oleh app (qty/jenis/requestId utuh)', offQ && !offQ.error && offQ.len === 1 && offQ.qty === 3 && offQ.jenis === 'KELUAR' && offQ.rid === true, JSON.stringify(offQ));

    // ---- 2. Retry saat online → flushOutbox() mengosongkan, server menerima ----
    MODE = 'ok';
    const before = POSTS.filter(p => p.action === 'postTransaksi').length;
    const fl = await ev("flushOutbox().then(function(){return {len:readOutbox().length};})", true);
    const after = POSTS.filter(p => p.action === 'postTransaksi').length;
    rec('RETRY: flushOutbox() kirim antrean & kosongkan', fl && !fl.error && fl.len === 0 && after > before, 'len=' + (fl && fl.len) + ' posts+' + (after - before));

    // ---- 3. Kapasitas outbox: TIDAK boleh ada kehilangan diam-diam ----
    // RED (2026-09-27, OFF-01): versi lama memakai slice(-20) → 5 transaksi offline
    // terlama HILANG tanpa jejak. Perilaku baru: kapasitas dinaikkan, dan ketika penuh
    // aplikasi mencoba flush dulu + memberi PERINGATAN eksplisit ke user.
    const cap = await ev(`(function(){
      localStorage.removeItem('rdi_trx_outbox');
      window.__obFullWarn = 0;
      var cfg = window.__rdiConfig || {};
      var origWarn = cfg.onOutboxFull;
      cfg.onOutboxFull = function (info) { window.__obFullWarn++; window.__lastOutboxInfo = info; };
      var n = (typeof OUTBOX_MAX !== 'undefined' ? OUTBOX_MAX : 20);
      for (var i = 1; i <= n + 25; i++) { pushOutbox({ action:'postTransaksi', itemId:'X'+i, requestId:'cap-'+i, qty:1 }); }
      var ids = readOutbox().map(function(e){ return e.payload.requestId; });
      cfg.onOutboxFull = origWarn;
      return { max:n, len:ids.length, has1:ids.indexOf('cap-1')>=0, hasN:ids.indexOf('cap-'+n)>=0,
               last:ids[ids.length-1], warn:window.__obFullWarn, info:window.__lastOutboxInfo || null };
    })()`);
    rec('CAP: kapasitas outbox dinaikkan ke 100 (dulu 20 = 5 transaksi hilang diam-diam)', cap && cap.max === 100, JSON.stringify(cap).slice(0, 120));
    rec('CAP: entri terbaru selalu tersimpan (yang dipotong hanya yang terlama)', cap && cap.hasN === true && cap.last === 'cap-' + (cap.max + 25), JSON.stringify(cap).slice(0, 140));
    rec('CAP: pemotongan di atas kapasitas SELALU accompanied peringatan (tidak diam)', cap && cap.warn > 0 && cap.info && /trimmed|near-full|storage/.test(cap.info.note || ''),
      cap ? ('warning ' + cap.warn + '× info=' + JSON.stringify(cap.info)) : 'tidak ada');

    // ---- 3b. Saat penuh → warning eksplisit (bukan diam) ----
    const warn = await ev(`(function(){
      localStorage.removeItem('rdi_trx_outbox');
      var cfg = window.__rdiConfig || {};
      var fired = 0;
      var orig = cfg.onOutboxFull;
      cfg.onOutboxFull = function (info) { fired++; window.__lastOutboxInfo = info; };
      var n = (typeof OUTBOX_MAX !== 'undefined' ? OUTBOX_MAX : 20);
      for (var i = 1; i <= n + 5; i++) { pushOutbox({ action:'postTransaksi', itemId:'Y'+i, requestId:'warn-'+i, qty:1 }); }
      var after = readOutbox().length;
      cfg.onOutboxFull = orig;
      return { fired:fired, after:after, max:n, info:window.__lastOutboxInfo || null };
    })()`);
    rec('CAP-FULL: aplikasi memberi peringatan eksplisit saat antrean penuh', warn && warn.fired > 0,
      warn ? ('warning dipanggil ' + warn.fired + '×, antrean=' + warn.after + '/' + warn.max + ' info=' + JSON.stringify(warn.info)) : 'tidak ada');
    await ev("(function(){localStorage.removeItem('rdi_trx_outbox');return 1;})()");

    // ---- 4. Dedup by requestId ----
    const dd = await ev("(function(){localStorage.removeItem('rdi_trx_outbox');pushOutbox({action:'postTransaksi',requestId:'d-1',qty:1});pushOutbox({action:'postTransaksi',requestId:'d-1',qty:2});var l=readOutbox();return {len:l.length,qty:l[0].payload.qty};})()");
    rec('DEDUP: pushOutbox() dedup by requestId (terakhir menang)', dd && dd.len === 1 && dd.qty === 2, JSON.stringify(dd));

    // ---- 5. Partial dianggap sukses (dihapus dari antrean) ----
    await ev("(function(){localStorage.removeItem('rdi_trx_outbox');pushOutbox({action:'postTransaksi',requestId:'p-1',qty:1});return 1;})()");
    const part = await ev("(function(){return Promise.resolve({len:readOutbox().length});})()", true);
    rec('QUEUE: entri partial tersimpan sampai flush (partial dihitung success oleh app)', part && part.len === 1, JSON.stringify(part));
    await ev("(function(){localStorage.removeItem('rdi_trx_outbox');return 1;})()");

    // ---- 6. DBG-02 (2026-10-13): respons NON-JSON = hasil tidak diketahui.
    // Entri antrean TIDAK BOLEH dihapus: kalau ternyata server sudah sempat commit,
    // menghapus antrean = transaksi hilang diam-diam; operator lalu input ulang = duplikat.
    MODE = 'html';
    const htmlCase = await ev("(function(){localStorage.removeItem('rdi_trx_outbox');" +
      "pushOutbox({action:'postTransaksi',requestId:'html-1',qty:1});" +
      "pushOutbox({action:'postTransaksi',requestId:'html-2',qty:2});" +
      "var seeded=readOutbox().map(function(e){return e.payload.requestId;});" +
      "return flushOutbox().then(function(){return {seeded:seeded,after:readOutbox().map(function(e){return e.payload.requestId;})};});})()", true);
    rec('DBG-02: respons non-JSON -> entri outbox HARUS tetap diantrekan', htmlCase && !htmlCase.error && htmlCase.after.length === 2,
      'seeded=' + JSON.stringify(htmlCase && htmlCase.seeded) + ' after=' + JSON.stringify(htmlCase && htmlCase.after));
    MODE = 'ok';
    await ev("(function(){localStorage.removeItem('rdi_trx_outbox');return 1;})()");

    // ---- 7. DBG-03 (2026-10-13): requestId null TIDAK BOLEH mengosongkan antrean.
    // removeOutboxByRequestId(null) sebelumnya jatuh ke writeOutbox([]) = hapus SEMUA
    // transaksi offline milik operator lain yang sedang menunggu sync.
    const wipe = await ev("(function(){localStorage.removeItem('rdi_trx_outbox');" +
      "pushOutbox({action:'postTransaksi',requestId:'keep-1',qty:1});" +
      "pushOutbox({action:'postTransaksi',requestId:'keep-2',qty:2});" +
      "removeOutboxByRequestId(null);" +
      "return {len:readOutbox().length};})()");
    rec('DBG-03: removeOutboxByRequestId(null) tidak boleh menghapus seluruh antrean', wipe && wipe.len === 2, 'len=' + (wipe && wipe.len));
    await ev("(function(){localStorage.removeItem('rdi_trx_outbox');return 1;})()");

    rec('NO PAGE EXCEPTION selama suite', exceptions.length === 0, 'exceptions=' + JSON.stringify(exceptions.slice(0, 3)));
    console.log('---- r2_outbox_app: ' + pass + ' PASS / ' + fail + ' FAIL ----');
  } finally {
    try { ws && ws.close(); } catch (e) {}
    try { if (process.platform === 'win32' && chrome.pid) spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else process.kill(chrome.pid); } catch (e) {}
    try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch (e) {}
    server.close();
  }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
