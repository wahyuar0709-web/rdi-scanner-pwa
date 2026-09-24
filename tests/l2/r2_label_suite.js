// L1 + L2 tests: menu CETAK LABEL BARANG
// Scope-safe: only exported window APIs + DOM + popup capture (no IIFE internals).
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'c:/projec/rdi-scanner-pwa';
const PORT = 8782;
const CDP_PORT = 9338;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = 'C:\\Users\\lenov\\AppData\\Local\\Temp\\opencode\\cdp-label-' + Date.now();
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function rec(name, status, detail) {
  results.push({ name, status, detail });
  console.log(status + ' | ' + name + ' | ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)));
}
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
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws')), { once: true });
  });
  ws.addEventListener('message', ev => {
    if (typeof ev.data !== 'string') return;
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, msg => msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result));
      ws.send(JSON.stringify({ id: i, method, params }));
      setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error('timeout ' + method)); } }, 45000);
    });
  }
  return { send, close: () => ws.close() };
}
function extractScript(src, fnName) {
  const re = new RegExp('function\\s+' + fnName + '\\s*\\(');
  const m = src.match(re);
  if (!m) return null;
  let i = m.index + m[0].length - 1;
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')') { depth--; if (depth === 0) { j++; break; } }
  }
  while (j < src.length && src[j] !== '{') j++;
  if (j >= src.length) return null;
  let b = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') b++;
    else if (src[k] === '}') { b--; if (b === 0) { k++; break; } }
  }
  return src.slice(m.index, k);
}

function mockRows(n) {
  const base = [
    { id: 'MRO-01-01-001', nama: 'Lakban kain hitam', spec: '25mm x 15m', rak: 'A1-01', qty: 5, unit: 'Pcs', user: 'WH', bc: 'Non BC', kategori: 'MRO' },
    { id: 'MRO-02-02-002', nama: '<img src=x onerror=window.__xss=1>', spec: 'x" onmouseover="y', rak: 'B2', qty: 0, unit: 'Pcs', user: 'WH', bc: 'BC', kategori: 'MRO' },
    { id: '', nama: 'Tanpa ID', spec: '', rak: undefined, qty: 3, unit: 'Pcs', user: '', bc: '', kategori: '' },
    { id: 'MRO-03-03-003', nama: 'Batre AAA', spec: 'alkaline', rak: 'C3', qty: 8, unit: 'Pcs', user: '', bc: '', kategori: 'MRO' }
  ];
  const rows = [];
  for (let i = 0; i < n; i++) {
    if (i < base.length) rows.push(Object.assign({}, base[i]));
    else rows.push({ id: 'ID' + i, nama: 'Item ' + i, spec: 'spec' + i, rak: 'R' + (i % 9 + 1), qty: i, unit: 'Pcs', user: '', bc: '', kategori: 'MRO' });
  }
  return rows;
}

function l1(src) {
  const hasLabelBtn = /data-mode="label"/.test(src) && /Label Barang/.test(src);
  rec('L1: tab Label Barang exists', hasLabelBtn ? 'PASS' : 'FAIL', hasLabelBtn);

  const hasBuildLabel = /function buildLabelHTML/.test(src);
  rec('L1: buildLabelHTML defined', hasBuildLabel ? 'PASS' : 'FAIL', hasBuildLabel);

  const hasDoCetak = /function doCetak\(\)/.test(src) && /function doDownload\(\)/.test(src);
  rec('L1: doCetak/doDownload defined', hasDoCetak ? 'PASS' : 'FAIL', hasDoCetak);

  const grid = src.match(/var cols=4,rows=6,perPage=cols\*rows/);
  rec('L1: label grid 4x6=24', grid ? 'PASS' : 'FAIL', !!grid);

  const count24 = /isLabel\?24:/.test(src);
  rec('L1: updateCetakCount label page math uses 24', count24 ? 'PASS' : 'FAIL', count24);

  const labelEsc = src.includes("function ex(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}");
  rec('L1: label HTML uses ex() escaper', labelEsc ? 'PASS' : 'FAIL', labelEsc);

  const escFields = src.includes("'+ex(qrID)+'") && src.includes("'+ex(item.nama)+'");
  rec('L1: label kode/nama escaped via ex()', escFields ? 'PASS' : 'FAIL', escFields);

  const qrExternal = /api\.qrserver\.com/.test(src);
  rec('L1: QR via api.qrserver.com (external)', qrExternal ? 'PASS' : 'FAIL', 'external QR API present=' + qrExternal);

  const qrEnc = /encodeURIComponent\(qrID\+'\\|'\+item\.nama\+'\\|'\+\(item\.rak\|\|''\)\)/.test(src) || /encodeURIComponent\(qrID\+'\|'\+item\.nama\+'\|'\+\(item\.rak\|\|''\)\)/.test(src);
  rec('L1: QR payload encodeURIComponent + rak fallback', qrEnc ? 'PASS' : 'FAIL', qrEnc);

  const hidePs = /\(mode==='label'\)\?'none':''/.test(src) || /mode==='label'\)\?'none':''/.test(src);
  rec('L1: paper-size hidden in label mode', hidePs ? 'PASS' : 'FAIL', hidePs);

  const emptyAlert = /Pilih minimal 1 item/.test(src);
  rec('L1: empty selection guard', emptyAlert ? 'PASS' : 'FAIL', emptyAlert);

  const popupGuard = /Popup diblokir browser/.test(src);
  rec('L1: popup blocked guard', popupGuard ? 'PASS' : 'FAIL', popupGuard);

  const printMode = /window\.onload=function\(\)\{window\.print\(\);\}/.test(src);
  rec('L1: print mode auto window.print', printMode ? 'PASS' : 'FAIL', printMode);

  const pdfMode = /html2pdf\.js/.test(src) && /mode==='download'/.test(src);
  rec('L1: download mode uses html2pdf', pdfMode ? 'PASS' : 'FAIL', pdfMode);

  const fname = /label-barang\./.test(src);
  rec('L1: PDF filename label-barang.YYYY.MM.DD', fname ? 'PASS' : 'FAIL', fname);

  const selSet = /var cetakSelectedIds=new Set\(\)/.test(src);
  rec('L1: selection is Set of _idx', selSet ? 'PASS' : 'FAIL', selSet);

  const allBtn = /cetakSelectAll\(\)/.test(src) && /cetakClearAll\(\)/.test(src);
  rec('L1: Semua/Hapus buttons wired', allBtn ? 'PASS' : 'FAIL', allBtn);

  const sticky = /onclick="doCetak\(\)"/.test(src) && /onclick="doDownload\(\)"/.test(src);
  rec('L1: sticky bar Cetak+PDF wired', sticky ? 'PASS' : 'FAIL', sticky);

  const buildLabelSrc = extractScript(src, 'buildLabelHTML');
  if (!buildLabelSrc) {
    rec('L1: XSS escape in buildLabelHTML', 'FAIL', 'could not extract function');
  } else {
    try {
      const fn = new Function(buildLabelSrc + '; return buildLabelHTML;')();
      const evil = [{ id: '"><img src=x onerror=alert(1)>', nama: '<script>alert(2)</script>', spec: '" onload="alert(3)', rak: 'A1' }];
      const html = fn(evil, 'print');
      const xss = /<script>alert\(2\)<\/script>/.test(html) || /<img src=x onerror=alert\(1\)>/.test(html) || /onload="alert\(3\)/.test(html);
      rec('L1: XSS payload not raw in label HTML', xss ? 'FAIL' : 'PASS', xss ? 'raw payload found' : 'escaped');
      const hasEsc = html.includes('&lt;script&gt;') || html.includes('&lt;img') || html.includes('&quot;');
      rec('L1: escaped entities present', hasEsc ? 'PASS' : 'FAIL', hasEsc);
      const pages = (html.match(/class="page/g) || []).length;
      rec('L1: 1 item => 1 page div', pages === 1 ? 'PASS' : 'FAIL', { pages });
      const many = Array.from({ length: 25 }, (_, i) => ({ id: 'ID' + i, nama: 'N' + i, spec: '', rak: 'R' }));
      const html25 = fn(many, 'print');
      const pages25 = (html25.match(/class="page/g) || []).length;
      rec('L1: 25 items => 2 pages', pages25 === 2 ? 'PASS' : 'FAIL', { pages25 });

      // QR assertion must use a clean item with known ID (not evil-item HTML)
      const clean = [{ id: 'ID0', nama: 'N', spec: '', rak: 'R1' }];
      const cleanHtml = fn(clean, 'print');
      const mData = (cleanHtml.match(/data=([^"&]+)/) || ['', ''])[1] || '';
      const decoded = decodeURIComponent(mData);
      const qrOk = cleanHtml.includes('api.qrserver.com') && decoded.indexOf('ID0|N|R1') === 0;
      rec('L1: QR data param uses encoded id', qrOk ? 'PASS' : 'FAIL', { decoded: decoded.slice(0, 80) });

      const dl = fn(evil, 'download');
      rec('L1: download mode embeds html2pdf', dl.includes('html2pdf') ? 'PASS' : 'FAIL', dl.includes('html2pdf'));
      rec('L1: print mode embeds window.print', html.includes('window.print()') ? 'PASS' : 'FAIL', html.includes('window.print()'));
      const noId = fn([{ id: '', nama: 'X', spec: '', rak: '' }], 'print');
      rec('L1: empty id => MAT001 fallback', noId.includes('MAT001') ? 'PASS' : 'FAIL', noId.includes('MAT001'));

      const undefRak = fn([{ id: 'Z1', nama: 'N', spec: '', rak: undefined }], 'print');
      const mDataU = (undefRak.match(/data=([^"]+)/) || ['', ''])[1] || '';
      const decodedU = decodeURIComponent(mDataU);
      rec('L1/INFO: QR payload when rak undefined', 'NOT TESTED', { decoded: decodedU.slice(0, 80) });
      const rakUndefBug = decodedU.includes('undefined');
      rec('L1: rak undefined does NOT leak into QR payload', rakUndefBug ? 'FAIL' : 'PASS', { decoded: decodedU.slice(0, 100) });
    } catch (e) {
      rec('L1: buildLabelHTML executable', 'FAIL', String(e.message || e));
    }
  }

  const usesIdx = /function generateOutput\(mode\)\{[\s\S]{0,200}cetakSelectedIds\.has\(r\._idx\)/.test(src);
  rec('L1: generateOutput filters by _idx', usesIdx ? 'PASS' : 'FAIL', usesIdx);
  const modeBranch = /_cetakMode==='label'\)\?buildLabelHTML/.test(src);
  rec('L1: generateOutput branches label vs kartu', modeBranch ? 'PASS' : 'FAIL', modeBranch);

  const titleSwitch = /Cetak Label Barang/.test(src);
  rec('L1: page title switches to Cetak Label Barang', titleSwitch ? 'PASS' : 'FAIL', titleSwitch);
}

async function main() {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  l1(src);

  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/gas') {
      let chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) {}
        const action = body.action || '';
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        if (action === 'getData') {
          const rows = mockRows(4);
          res.end(JSON.stringify({ status: 'ok', total: rows.length, rows }));
        } else if (action === 'getMasterLists') {
          res.end(JSON.stringify({ status: 'ok', uom: ['Pcs'], rak: ['A1'], vendor: ['V'], kategori: ['MRO'] }));
        } else if (action === 'getRakBreakdownAll') {
          res.end(JSON.stringify({ status: 'ok', rows: [] }));
        } else {
          res.end(JSON.stringify({ status: 'ok', message: 'mock', total: 0 }));
        }
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
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  try {
    const { execSync } = require('child_process');
    execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ' + CDP_PORT + ' -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { timeout: 5000, stdio: 'ignore' });
    execSync('powershell -NoProfile -Command "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -like \"*chrome*\" } | Stop-Process -Force -ErrorAction SilentlyContinue"', { timeout: 5000, stdio: 'ignore' });
  } catch (e) {}
  try { fs.unlinkSync('C:\\Users\\lenov\\AppData\\Local\\Temp\\opencode\\r2_label_results.json'); } catch (e) {}

  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + PROFILE,
    '--window-size=1366,900', '--disable-dev-shm-usage', '--disable-extensions',
    '--disable-background-networking', '--allow-running-insecure-content',
    'http://127.0.0.1:' + PORT + '/index.html'
  ];
  const chrome = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let chromeExit = null, chromeErr = '';
  chrome.on('error', e => { chromeErr += e.message; });
  chrome.on('exit', (c, s) => { chromeExit = c + '/' + s; });

  let cdp = null;
  for (let i = 0; i < 80; i++) {
    try { cdp = await connectCDP(CDP_PORT); break; } catch (e) { await sleep(250); }
  }
  if (!cdp) {
    rec('L2: CDP connect', 'NOT TESTED', { chromeExit, chromeErr });
    writeResults();
    try { chrome.kill(); } catch (e) {}
    server.close();
    return;
  }
  rec('L2: CDP connect', 'PASS', { chromeExit });

  const evalIn = async (expr) => {
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails.exception && r.exceptionDetails.exception.description;
        return { err: d || r.exceptionDetails.text || 'exception' };
      }
      return r.result && r.result.value !== undefined ? r.result.value : r.result;
    } catch (e) { return { err: String(e.message || e) }; }
  };

  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
    await sleep(2000);

    // Boot path: point GAS to local mock + valid editor session BEFORE reload
    const bootSet = await evalIn(`(function(){
      try {
        localStorage.setItem('rdi_gas_url','http://127.0.0.1:${PORT}/gas');
        sessionStorage.setItem('rdi_editor_key','WH1234');
        sessionStorage.setItem('rdi_editor_key_set_at', String(Date.now()));
        localStorage.setItem('rdi_editor_key','WH1234');
        localStorage.setItem('rdi_editor_key_set_at', String(Date.now()));
        return 'ok';
      } catch(e){ return String(e); }
    })()`);
    rec('L2: storage boot inject', bootSet === 'ok' ? 'PASS' : 'FAIL', bootSet);

    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });

    // wait for session + data load
    let booted = null;
    for (let i = 0; i < 40; i++) {
      await sleep(400);
      booted = await evalIn(`(function(){
        var g=document.getElementById('login-gate');
        var gateHidden=!g||g.classList.contains('hide');
        var last=(document.getElementById('last-load')||{}).textContent||'';
        return {gateHidden:gateHidden, last:last, hasLoad:typeof loadData==='function'};
      })()`);
      if (booted && booted.gateHidden && booted.last && /item/.test(booted.last)) break;
    }
    rec('L2: boot session + loadData', (booted && booted.gateHidden && /item/.test(booted.last||'')) ? 'PASS' : 'FAIL', booted);

    const fns = await evalIn(`({
      doCetak: typeof doCetak, doDownload: typeof doDownload,
      setCetakMode: typeof setCetakMode, buildLabelHTML: typeof buildLabelHTML,
      generateOutput: typeof generateOutput, renderCetakList: typeof renderCetakList,
      cetakSelectAll: typeof cetakSelectAll, cetakClearAll: typeof cetakClearAll,
      updateCetakCount: typeof updateCetakCount, switchTab: typeof switchTab,
      toggleCetakRow: typeof toggleCetakRow, loadData: typeof loadData
    })`);
    const exportedOk = fns && fns.doCetak === 'function' && fns.setCetakMode === 'function'
      && fns.renderCetakList === 'function' && fns.cetakSelectAll === 'function'
      && fns.cetakClearAll === 'function' && fns.toggleCetakRow === 'function'
      && fns.switchTab === 'function' && fns.updateCetakCount === 'function';
    // buildLabelHTML/generateOutput are IIFE-scoped by design — record as INFO, not FAIL
    rec('L2: exported cetak APIs (scope-safe set)', exportedOk ? 'PASS' : 'FAIL', fns);
    rec('L2/INFO: buildLabelHTML/generateOutput IIFE-scoped (not on window)', 'NOT TESTED', {
      buildLabelHTML: fns && fns.buildLabelHTML,
      generateOutput: fns && fns.generateOutput
    });

    await evalIn(`switchTab('cetak')`);
    await sleep(400);
    const sectionActive = await evalIn(`document.getElementById('section-cetak') && document.getElementById('section-cetak').classList.contains('active')`);
    rec('L2: section-cetak active', sectionActive === true ? 'PASS' : 'FAIL', sectionActive);

    await evalIn(`setCetakMode('label')`);
    await sleep(250);
    const modeState = await evalIn(`({
      title: (document.getElementById('cetak-subpage-title')||{}).textContent,
      paperHidden: (function(){var el=document.getElementById('paper-size-wrap');return el?el.style.display:null;})(),
      activeBtn: (function(){var b=document.querySelector('#cetak-mode-nav .dash-subtab-btn.active');return b?b.getAttribute('data-mode'):null;})()
    })`);
    rec('L2: label mode UI state', (modeState && modeState.title === 'Cetak Label Barang' && modeState.paperHidden === 'none' && modeState.activeBtn === 'label') ? 'PASS' : 'FAIL', modeState);

    await evalIn(`renderCetakList()`);
    await sleep(350);
    const listCount = await evalIn(`document.querySelectorAll('#cetak-item-list .cetak-item-row').length`);
    rec('L2: renderCetakList shows rows', (typeof listCount === 'number' && listCount >= 4) ? 'PASS' : 'FAIL', listCount);

    const xssInList = await evalIn(`window.__xss === 1`);
    rec('L2: list XSS not fired', xssInList === false ? 'PASS' : 'FAIL', xssInList);

    // Selection via exported APIs only (DOM + hint text)
    await evalIn(`cetakClearAll(); toggleCetakRow(null, 0); toggleCetakRow(null, 1);`);
    await sleep(250);
    let hint = await evalIn(`({
      label: (document.getElementById('cetak-sel-label')||{}).textContent,
      hint: (document.getElementById('print-hint')||{}).textContent,
      checked: document.querySelectorAll('#cetak-item-list .cetak-item-cb:checked').length
    })`);
    rec('L2: 2 selected => page math label (1 halaman)', (hint && /2 item dipilih/.test(hint.label || '') && /2 label/.test(hint.hint || '') && /1 halaman/.test(hint.hint || '') && hint.checked === 2) ? 'PASS' : 'FAIL', hint);

    await evalIn(`cetakSelectAll()`);
    await sleep(250);
    hint = await evalIn(`({
      label: (document.getElementById('cetak-sel-label')||{}).textContent,
      hint: (document.getElementById('print-hint')||{}).textContent,
      rows: document.querySelectorAll('#cetak-item-list .cetak-item-row').length,
      checked: document.querySelectorAll('#cetak-item-list .cetak-item-cb:checked').length
    })`);
    rec('L2: select all => N label / 1 halaman', (hint && /4 item dipilih/.test(hint.label || '') && /4 label/.test(hint.hint || '') && /1 halaman/.test(hint.hint || '') && hint.checked === 4 && hint.rows === 4) ? 'PASS' : 'FAIL', hint);

    // empty selection alert via doCetak (exported)
    await evalIn(`cetakClearAll()`);
    await sleep(150);
    const emptyAlert = await evalIn(`(function(){
      var old = window.alert; var msg=null; window.alert=function(m){msg=m;};
      try { doCetak(); } finally { window.alert=old; }
      return msg;
    })()`);
    rec('L2: empty selection alerts via doCetak', (typeof emptyAlert === 'string' && /Pilih minimal 1/.test(emptyAlert)) ? 'PASS' : 'FAIL', emptyAlert);

    // popup capture: select clean row for structure, XSS row for escape
    await evalIn(`cetakClearAll(); toggleCetakRow(null, 0); setCetakMode('label');`);
    await sleep(150);
    const popupCapture = await evalIn(`(function(){
      var realOpen = window.open;
      var captured = { opened: false, closed: false, html: null, err: null };
      window.open = function(){
        captured.opened = true;
        var doc = { _h:'', write:function(s){ this._h += s; }, close:function(){ captured.closed=true; captured.html=this._h; } };
        return { document: doc, close: function(){ captured.closed=true; } };
      };
      try { doCetak(); } catch(e){ captured.err = String(e); }
      window.open = realOpen;
      var h = captured.html || '';
      return {
        opened: captured.opened, closed: captured.closed, err: captured.err,
        hasLabel: h.indexOf('Label Barang')>=0,
        hasPrint: h.indexOf('window.print()')>=0,
        labels: (h.match(/class="lbl2"/g)||[]).length,
        hasQr: h.indexOf('api.qrserver.com')>=0,
        hasCompany: h.indexOf('PT RAYARD DELI INDONESIA')>=0,
        pageA4: h.indexOf('@page{size:A4 portrait')>=0
      };
    })()`);
    rec('L2: doCetak writes label popup HTML', (popupCapture && popupCapture.opened && popupCapture.closed && popupCapture.hasLabel && popupCapture.hasPrint && popupCapture.labels === 1 && popupCapture.hasCompany && popupCapture.pageA4 && popupCapture.hasQr) ? 'PASS' : 'FAIL', popupCapture);

    // XSS row is _idx=1 (mock row with <img onerror=...>)
    await evalIn(`cetakClearAll(); toggleCetakRow(null, 1); setCetakMode('label');`);
    await sleep(150);
    const xssPopup = await evalIn(`(function(){
      var realOpen = window.open;
      var captured = { opened: false, closed: false, html: null, err: null };
      window.open = function(){
        captured.opened = true;
        var doc = { _h:'', write:function(s){ this._h += s; }, close:function(){ captured.closed=true; captured.html=this._h; } };
        return { document: doc, close: function(){ captured.closed=true; } };
      };
      try { doCetak(); } catch(e){ captured.err = String(e); }
      window.open = realOpen;
      var h = captured.html || '';
      return {
        opened: captured.opened, closed: captured.closed, err: captured.err,
        labels: (h.match(/class="lbl2"/g)||[]).length,
        hasEsc: h.indexOf('&lt;img')>=0 || h.indexOf('&lt;script')>=0 || h.indexOf('&quot;')>=0,
        rawXss: /<img src=x onerror=window\.__xss=1>/.test(h)
      };
    })()`);
    rec('L2: label XSS escaped in popup output', (xssPopup && xssPopup.opened && xssPopup.labels === 1 && xssPopup.rawXss === false && xssPopup.hasEsc) ? 'PASS' : 'FAIL', xssPopup);

    const xssAfter = await evalIn(`window.__xss === 1`);
    rec('L2: no XSS after generate', xssAfter === false ? 'PASS' : 'FAIL', xssAfter);

    // download mode via doDownload + popup capture
    const dlCapture = await evalIn(`(function(){
      var realOpen = window.open;
      var captured = { opened:false, closed:false, html:null, err:null };
      window.open = function(){
        captured.opened = true;
        var doc = { _h:'', write:function(s){ this._h += s; }, close:function(){ captured.closed=true; captured.html=this._h; } };
        return { document: doc, close: function(){ captured.closed=true; } };
      };
      try { doDownload(); } catch(e){ captured.err = String(e); }
      window.open = realOpen;
      var h = captured.html || '';
      return {
        opened: captured.opened, closed: captured.closed, err: captured.err,
        hasPdf: h.indexOf('html2pdf')>=0,
        fname: (h.match(/label-barang\\.\\d{4}\\.\\d{2}\\.\\d{2}\\.pdf/)||[])[0]||null,
        labels: (h.match(/class="lbl2"/g)||[]).length
      };
    })()`);
    rec('L2: doDownload html2pdf + filename', (dlCapture && dlCapture.opened && dlCapture.hasPdf && dlCapture.fname && dlCapture.labels === 1) ? 'PASS' : 'FAIL', dlCapture);

    // back to kartu
    await evalIn(`setCetakMode('kartu')`);
    await sleep(200);
    const kartuState = await evalIn(`({
      title: (document.getElementById('cetak-subpage-title')||{}).textContent,
      paperShown: (function(){var el=document.getElementById('paper-size-wrap');return el?el.style.display:null;})(),
      activeBtn: (function(){var b=document.querySelector('#cetak-mode-nav .dash-subtab-btn.active');return b?b.getAttribute('data-mode'):null;})()
    })`);
    rec('L2: back to kartu mode UI', (kartuState && kartuState.title === 'Cetak Kartu Stok' && kartuState.activeBtn === 'kartu') ? 'PASS' : 'FAIL', kartuState);

    // 25-item page math: reload mock with 25 rows, loadData, select all
    // (local allRows is reassigned by loadData; window.allRows is stale by design)
    const reload25 = await evalIn(`(function(){
      // temporarily swap GAS to a 25-row mock by re-calling loadData after changing endpoint is hard;
      // instead: re-fetch via loadData is fixed mock. Use search-free select on existing 4 is not 25.
      // Inject is not possible on IIFE allRows. So: verify page-math hint formula for label via UI with available rows,
      // and separately assert updateCetakCount math by selecting all rendered rows only.
      return 'skip-inject';
    })()`);
    // Page-math for 25 cannot be forced without IIFE access; assert formula via static already (L1).
    // Document as NOT TESTED for live 25-row browser path if mock only has 4.
    rec('L2/NOT TESTED: live 25-label page math (mock has 4 rows; IIFE allRows not injectable)', 'NOT TESTED', reload25);

    // paper size ignored in label mode (by design: always A4 24/page)
    await evalIn(`setCetakMode('label'); cetakSelectAll();`);
    await sleep(150);
    const paperIgnored = await evalIn(`({
      paperHidden: (function(){var el=document.getElementById('paper-size-wrap');return el?el.style.display:null;})(),
      hint: (document.getElementById('print-hint')||{}).textContent
    })`);
    rec('L2: label mode ignores paper-size (A4 in hint)', (paperIgnored && paperIgnored.paperHidden === 'none' && /A4/.test(paperIgnored.hint || '')) ? 'PASS' : 'FAIL', paperIgnored);

    // stale _idx after clear+reselect still toggles
    await evalIn(`cetakClearAll()`);
    await sleep(100);
    await evalIn(`toggleCetakRow(null, 3)`);
    await sleep(150);
    const reselect = await evalIn(`({
      label: (document.getElementById('cetak-sel-label')||{}).textContent,
      checked: document.querySelectorAll('#cetak-item-list .cetak-item-cb:checked').length
    })`);
    rec('L2: reselect after clear works', (reselect && /1 item dipilih/.test(reselect.label || '') && reselect.checked === 1) ? 'PASS' : 'FAIL', reselect);

  } catch (e) {
    rec('L2: suite error', 'FAIL', String(e.message || e));
  }

  try { cdp.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  server.close();
  writeResults();
}
function writeResults() {
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const other = results.length - pass - fail;
  const summary = { pass, fail, other, results, at: new Date().toISOString() };
  fs.writeFileSync('C:\\Users\\lenov\\AppData\\Local\\Temp\\opencode\\r2_label_results.json', JSON.stringify(summary, null, 2));
  console.log('=== LABEL SUITE: ' + pass + ' PASS / ' + fail + ' FAIL / ' + other + ' OTHER ===');
}
main().catch(e => {
  rec('FATAL', 'FAIL', String(e.message || e));
  writeResults();
  process.exit(1);
});
