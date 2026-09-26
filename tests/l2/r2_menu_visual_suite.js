/* L2 menu_visual (2026-09-25): cek TAMPILAN semua menu di semua kombinasi
 * HP/Desktop × Viewer/Editor. Per menu: section aktif & terlihat, tak overflow
 * horizontal (section + page), elemen kunci konten terlihat (width>0),
 * screenshot bukti ke temp. Plus: more-drawer rect & modal fit per kombinasi.
 * Boot: mock 4 rows via HTTP /gas, 2x reload (viewer -> editor). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const HTTP_PORT = 9375, CDP_PORT = 9376;
const SHOT_DIR = path.join('C:\\Users\\lenov\\AppData\\Local\\Temp\\opencode', 'menu-shots');

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

// menu -> elemen kunci konten (harus terlihat ketika section aktif).
// master mobile pakai card-list-body (tabel #table-wrap display:none by design) -> array = ANY w>0.
const MENUS = [
  ['dashboard', ['dash-total']],
  ['master', ['table-body', 'card-list-body']],
  ['history', ['hist-id-input']],
  ['scanner', ['scan-id-input']],
  ['alert', ['alert-tbody']],
  ['rak', ['rak-list-container']],
  ['cetak', ['cetak-item-list']],
  ['aset', ['aset-kpi-total']]
];
const MODALS = ['modal-filter', 'modal-sort', 'modal-user', 'modal-config', 'modal-export-qr', 'modal-export-excel'];
const MODAL_OPENERS = {
  'modal-filter': 'openFilterSheet',
  'modal-sort': 'openSortSheet',
  'modal-user': 'showUserModal',
  'modal-config': 'showConfig',
  'modal-export-qr': 'openExportQRModal',
  'modal-export-excel': 'openExportExcelModal'
};

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(require('os').tmpdir(), 'rdi-menushot-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1366,768',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
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
    const shot = async name => {
      try {
        const r = await send('Page.captureScreenshot', { format: 'png' });
        if (r && r.result && r.result.data) {
          fs.writeFileSync(path.join(SHOT_DIR, name + '.png'), Buffer.from(r.result.data, 'base64'));
          return true;
        }
      } catch (e) {}
      return false;
    };
    await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.enable');

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

    const MENU_EXPR = (menu, keys) => {
      const keyEval = keys.map((k, i) =>
        "var k" + i + "=document.getElementById('" + k + "');var kr" + i + "=k" + i + "?k" + i + ".getBoundingClientRect():null;"
      ).join('');
      const keyAny = keys.map((k, i) => "(kr" + i + "&&kr" + i + ".width>0)").join('||');
      return "(function(){window.switchTab('" + menu + "');" +
        "var sec=document.getElementById('section-" + menu + "');" +
        "if(!sec)return {noSec:true};" +
        "var r=sec.getBoundingClientRect();var cs=getComputedStyle(sec);" +
        keyEval +
        "var de=document.documentElement;" +
        "return {active:sec.classList.contains('active'),disp:cs.display,vis:cs.visibility," +
        "w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top)," +
        "secOv:sec.scrollWidth<=sec.clientWidth+2,pageOv:de.scrollWidth<=window.innerWidth+2," +
        "keyVisible:" + (keyAny || 'false') + ",vw:window.innerWidth,vh:window.innerHeight};" +
        "})()";
    };

    const assertMenu = r => !!(r && !r.error && !r.noSec && r.active === true &&
      r.disp !== 'none' && r.vis !== 'hidden' &&
      r.w >= r.vw * 0.5 && r.h >= 100 &&
      r.secOv === true && r.pageOv === true &&
      r.keyVisible === true);

    const LEAK_EXPR = "((document.querySelectorAll('.modal-overlay.show').length)+(document.getElementById('more-drawer').classList.contains('show')?1:0))";

    const checkAllMenus = async label => {
      const leak0 = await ev(LEAK_EXPR);
      rec('LEAK GUARD [' + label + ']: tidak ada overlay/drawer menyala di awal phase',
        leak0 === 0, 'open=' + JSON.stringify(leak0));
      for (const [menu, keys] of MENUS) {
        const before = pageErrors.length + consoleErrors.length;
        const r = await ev(MENU_EXPR(menu, keys));
        await sleep(150);
        const leak = await ev(LEAK_EXPR);
        const shotOk = await shot('menu_' + label + '_' + menu);
        const errDelta = (pageErrors.length + consoleErrors.length) - before;
        rec('MENU ' + menu + ' [' + label + ']: aktif + terlihat + no overflow + elemen kunci + screenshot',
          assertMenu(r) && errDelta === 0 && shotOk && leak === 0,
          JSON.stringify({ r, err: errDelta, shot: shotOk, leak: leak, last: pageErrors.slice(-1).concat(consoleErrors.slice(-1)) }).slice(0, 360));
      }
      // more drawer rect
      const before = pageErrors.length + consoleErrors.length;
      const d = await ev("(function(){window.switchTab('more');var dr=document.getElementById('more-drawer');var r=dr.getBoundingClientRect();var cs=getComputedStyle(dr);return {show:dr.classList.contains('show'),w:Math.round(r.width),h:Math.round(r.height),disp:cs.display,pageOv:document.documentElement.scrollWidth<=window.innerWidth+2,vw:window.innerWidth};})()");
      await sleep(150);
      const errDelta = (pageErrors.length + consoleErrors.length) - before;
      rec('MORE DRAWER [' + label + ']: tampil + rect fit + no overflow',
        !!(d && !d.error && d.show === true && d.disp !== 'none' && d.w > 0 && d.w <= d.vw + 2 && d.h > 0 && d.pageOv === true) && errDelta === 0,
        JSON.stringify({ d, err: errDelta }).slice(0, 300));
      await ev("window.switchTab('more');'ok'"); // toggle close
      // modal fit per kombinasi + Escape wajib menutup
      for (const mid of MODALS) {
        const fn = MODAL_OPENERS[mid];
        const b2 = pageErrors.length + consoleErrors.length;
        await ev("(function(){window." + fn + "();return 'ok';})()");
        await sleep(350); // animasi modal masuk (~120ms terlalu cepat: rect 0)
        const m = await ev("(function(){var o=document.getElementById('" + mid + "');if(!o)return {no:true};var m=o.querySelector('.modal')||o.firstElementChild;if(!m)return {noChild:true};var r=m.getBoundingClientRect();return {show:o.classList.contains('show'),w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),left:Math.round(r.left),vw:window.innerWidth,vh:window.innerHeight};})()");
        const e2 = (pageErrors.length + consoleErrors.length) - b2;
        rec('MODAL ' + mid + ' [' + label + ']: fit viewport',
          !!(m && !m.error && m.show === true && m.w > 0 && m.w <= m.vw + 2 && m.h > 0 && m.h <= m.vh + 2 && m.top >= -2 && m.left >= -2) && e2 === 0,
          JSON.stringify({ m, err: e2 }).slice(0, 300));
        await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));'ok'");
        await sleep(250);
        const closed = await ev("document.getElementById('" + mid + "').classList.contains('show')");
        rec('MODAL ' + mid + ' [' + label + ']: Escape MENUTUP (tak bocor ke phase berikut)',
          closed === false, 'show=' + JSON.stringify(closed));
      }
    };

    // ============ BOOT VIEWER ============
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
    let ok = await waitReady(true, 4);
    rec('BOOT VIEWER: siap', !!(ok && !ok.timeout), JSON.stringify(ok));

    // ---- VIEWER DESKTOP ----
    await checkAllMenus('viewer-desktop');

    // ---- VIEWER HP ----
    await setMetrics(PHONE); await sleep(400);
    await checkAllMenus('viewer-phone');

    // ============ BOOT EDITOR ============
    await setMetrics(DESKTOP);
    for (let i = 0; i < 30; i++) {
      const cReady = await ev("typeof window.switchTab==='function'");
      if (cReady === true) break;
      await sleep(300);
    }
    await ev("sessionStorage.setItem('rdi_editor_key','testkey');sessionStorage.setItem('rdi_editor_key_set_at',String(Date.now()));'ok'");
    await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
    ok = await waitReady(false, 4);
    rec('BOOT EDITOR: siap', !!(ok && !ok.timeout), JSON.stringify(ok));

    // ---- EDITOR DESKTOP ----
    await checkAllMenus('editor-desktop');

    // ---- EDITOR HP ----
    await setMetrics(PHONE); await sleep(400);
    await checkAllMenus('editor-phone');

    // ---- GLOBAL ----
    rec('GLOBAL: 0 page error + 0 console error (semua menu x 4 kombinasi)',
      pageErrors.length === 0 && consoleErrors.length === 0,
      JSON.stringify({ pageErrors: pageErrors.slice(0, 6), consoleErrors: consoleErrors.slice(0, 6) }));

    console.log('=== MENU_VISUAL: ' + pass + ' PASS / ' + fail + ' FAIL ===');
    console.log('shots: ' + SHOT_DIR);
    ws.close();
    process.exitCode = fail ? 1 : 0;
  } finally {
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
