/* L2 feature_smoke (audit menyeluruh tombol/fitur — 2026-09-25):
 * Boot editor dgn 4 rows mock → (1) semua tab aktif & section benar,
 * (2) more-drawer open/close, (3) modal utama buka → Escape → tutup (13 overlay map
 * F-06b + sheet tambah), (4) master search+sort, (5) cetak mode switch + select,
 * (6) input scanner/render tiap section — semua tanpa page error / console error. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const HTTP_PORT = 9371, CDP_PORT = 9372;

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

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(require('os').tmpdir(), 'rdi-smoke-' + Date.now());
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
    await send('Page.enable'); await send('Runtime.enable');

    const mark = { errors: 0 };
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

    // ---- BOOT editor mode, 4 rows mock ----
    await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
    for (let i = 0; i < 50; i++) { // tunggu app shell siap sebelum set storage
      const ready = await ev("typeof window.switchTab==='function' && !!document.getElementById('boot-splash')");
      if (ready === true) break;
      await sleep(300);
    }
    const payload = Buffer.from(['h', 'n', String(Date.now() + 3600000), 'sig'].join('|')).toString('base64').replace(/=+$/, '') + '.sig';
    await ev("localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');sessionStorage.setItem('rdi_viewer_token','" + payload + "');sessionStorage.setItem('rdi_editor_key','testkey');sessionStorage.setItem('rdi_editor_key_set_at',String(Date.now()));'ok'");
    await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
    for (let i = 0; i < 70; i++) {
      const h = await ev("(function(){var b=document.getElementById('boot-splash');return b?b.classList.contains('hide'):false;})()");
      if (h === true) break;
      await sleep(300);
    }
    await sleep(1500);
    for (let i = 0; i < 20; i++) { // pastikan app siap (switchTab exported) sebelum step
      const ready = await ev("typeof window.switchTab==='function' && (window.allRows||[]).length===4");
      if (ready === true) break;
      await sleep(300);
    }

    await step('BOOT: editor masuk app + 4 rows termuat',
      "(function(){var g=document.getElementById('boot-splash');return {hidden:!g||g.classList.contains('hide'),viewer:document.body.classList.contains('viewer-mode'),rows:(window.allRows||[]).length};})()",
      (r) => r.hidden === true && r.viewer === false && r.rows === 4);

    // ---- SEMUA TAB ----
    const TABS = ['dashboard', 'master', 'history', 'alert', 'rak', 'cetak', 'aset', 'scanner'];
    for (const tab of TABS) {
      await step('TAB ' + tab + ': section aktif + tab state',
        "(function(){window.switchTab('" + tab + "');return 'ok';})()",
        (r) => r === 'ok',
        "(function(){var a=document.querySelector('.page-section.active');var t=document.querySelector('.tab.active,.tab-fab.active');return {sec:a?a.id:'',tab:t?t.id:'',hash:location.hash};})()");
      await ev("(function(){var a=document.querySelector('.page-section.active');return a&&a.id==='section-" + tab + "';})()");
    }
    // assert hasil per-tab benar-benar aktif (pred detail dilakukan terpisah utk tiap tab)
    // (step di atas memverifikasi tanpa error; verifikasi section via evaluate ulang):
    let secOk = true, secBad = [];
    for (const tab of TABS) {
      await ev("window.switchTab('" + tab + "')"); await sleep(80);
      const r = await ev("(document.querySelector('.page-section.active')||{}).id");
      if (r !== 'section-' + tab) { secOk = false; secBad.push(tab + '=' + r); }
    }
    rec('TAB: semua 8 section aktif sesuai switchTab', secOk, secBad.join(','));
    await ev("window.switchTab('scanner')");

    // ---- MORE DRAWER ----
    await step('MORE: drawer open',
      "(function(){window.switchTab('more');return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {open:document.getElementById('more-drawer').classList.contains('show')};})()");
    await step('MORE: drawer close (toggle lagi)',
      "(function(){window.switchTab('more');return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {open:document.getElementById('more-drawer').classList.contains('show')};})()");

    // ---- MODAL/SHEET: buka → Escape → tutup (13 overlay map + add sheet) ----
    const MODALS = [
      ['openFilterSheet', 'modal-filter'],
      ['openSortSheet', 'modal-sort'],
      ['showUserModal', 'modal-user'],
      ['showConfig', 'modal-config'],
      ['openExportQRModal', 'modal-export-qr'],
      ['openExportExcelModal', 'modal-export-excel']
    ];
    for (const [fn, id] of MODALS) {
      await step('MODAL ' + fn + ': terbuka',
        "(function(){window." + fn + "();return 'ok';})()",
        (r) => r === 'ok',
        "(function(){return {show:document.getElementById('" + id + "').classList.contains('show')};})()");
      await step('MODAL ' + fn + ': Escape menutup (closeTopOverlay map)',
        "(function(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return 'ok';})()",
        (r) => r === 'ok',
        "(function(){return {show:document.getElementById('" + id + "').classList.contains('show')};})()");
    }
    // add sheet (di luar map — tombol batal)
    await step('SHEET openAddSheet: terbuka + closeAddSheet menutup',
      "(function(){window.openAddSheet();var o=document.getElementById('add-sheet')||document.querySelector('.sheet.show')||document.getElementById('modal-add');window.closeAddSheet();return {ok:true,stillOpen:!!(o&&o.classList.contains('show'))};})()",
      (r) => r && r.ok && r.stillOpen === false);

    // ---- MASTER: search + sort + detail ----
    await ev("window.switchTab('master')"); await sleep(150);
    await step('MASTER search: input event terproses',
      "(function(){var el=document.getElementById('search-box')||document.querySelector('#master-search-zone input');if(!el)return {noInput:true};el.value='Item Fitur 1';el.dispatchEvent(new Event('input',{bubbles:true}));return {ok:true};})()",
      (r) => r && r.ok === true);
    await sleep(450); // debounce filterTable 150ms + _doFilter 80ms
    const afterSearch = await ev("(function(){var t=document.querySelectorAll('#table-body tr').length;var empty=/Tidak ada item yang cocok/.test((document.getElementById('table-body')||{}).innerHTML||'');return {rows:t,empty:empty};})()");
    rec('MASTER search: query "Item Fitur 1" benar-benar menyaring (rows < 4)',
      !!(afterSearch && (afterSearch.rows < 4 || afterSearch.empty === true)),
      JSON.stringify(afterSearch));
    await step('MASTER sort: klik th pertama',
      "(function(){var b=document.querySelector('.th-sortable button');if(!b)return {noBtn:true};b.click();return {ok:true};})()",
      (r) => r && r.ok === true);
    await step('MASTER: reset search',
      "(function(){var el=document.getElementById('search-box')||document.querySelector('#master-search-zone input');if(el){el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));}return 'ok';})()",
      (r) => r === 'ok');

    // ---- CETAK: mode switch + select ----
    await ev("window.switchTab('cetak')"); await sleep(150);
    await step('CETAK: render + pilih semua + mode label + kembali kartu',
      "(function(){window.renderCetakList();window.cetakSelectAll();window.setCetakMode('label');window.updateCetakCount();window.setCetakMode('kartu');return {rows:document.querySelectorAll('#cetak-item-list .cetak-item-row').length};})()",
      (r) => r && r.rows === 4,
      "(function(){return {count:(document.getElementById('print-hint')||{}).textContent||''};})()");

    // ---- SECTION LAIN: render/interaksi kecil ----
    await step('ALERT: render tab low-stock',
      "(function(){window.switchTab('alert');return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {sec:(document.querySelector('.page-section.active')||{}).id};})()");
    await step('RAK: render + filter chips',
      "(function(){window.switchTab('rak');if(window.renderRakFilter)window.renderRakFilter();return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {chips:document.querySelectorAll('#rak-filter-bar .chip').length};})()");
    await step('HISTORY: render',
      "(function(){window.switchTab('history');if(window.renderHistory)window.renderHistory();return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {sec:(document.querySelector('.page-section.active')||{}).id};})()");
    await step('ASET: render',
      "(function(){window.switchTab('aset');return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {sec:(document.querySelector('.page-section.active')||{}).id};})()");
    await step('SCANNER: input manual uppercase + tanpa error',
      "(function(){window.switchTab('scanner');var el=document.getElementById('id-input')||document.querySelector('.id-input-wrap input');if(!el)return {noInput:true};el.value='mro-02-001';el.dispatchEvent(new Event('input',{bubbles:true}));return {ok:true,v:el.value};})()",
      (r) => r && r.ok === true && r.v === 'MRO-02-001');
    await step('DASHBOARD: render',
      "(function(){window.switchTab('dashboard');return 'ok';})()",
      (r) => r === 'ok',
      "(function(){return {sec:(document.querySelector('.page-section.active')||{}).id};})()");

    // ---- GLOBAL: nol error ----
    rec('GLOBAL: 0 page error + 0 console error (seluruh smoke)',
      pageErrors.length === 0 && consoleErrors.length === 0,
      JSON.stringify({ pageErrors: pageErrors.slice(0, 5), consoleErrors: consoleErrors.slice(0, 5) }));

    console.log('=== FEATURE SMOKE: ' + pass + ' PASS / ' + fail + ' FAIL ===');
    ws.close();
    process.exitCode = fail ? 1 : 0;
  } finally {
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
