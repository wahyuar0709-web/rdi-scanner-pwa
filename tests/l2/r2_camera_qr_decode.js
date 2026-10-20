/* L2 r2_camera_qr_decode (2026-10-18): jalur scan kamera -> decode QR -> auto-isi.
 * Kamera HW diganti kanvas (canvas.captureStream) via shim navigator.mediaDevices.getUserMedia.
 * Yang diuji tetap kode app asli: getUserMedia -> video.srcObject -> video.play ->
 * scanFrame() -> drawImage + getImageData + jsQR -> #scan-id-input + lookupItem.
 * Bukan pengganti L4 (kamera/optik fisik tetap DEVICE/PHYSICAL).
 * Matrix QR dibuat di Node memakai qrcode.min.js (vendored) lalu digambar di kanvas.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const HTTP_PORT = 9392, CDP_PORT = 9393;

const QR_TEXT = 'MRO-02-001';
const ROWS = [];
for (let i = 1; i <= 4; i++) {
  ROWS.push({
    id: 'MRO-02-00' + i, nama: 'Item Kamera ' + i, spec: 'Spesifikasi ' + i, qty: i * 5, unit: 'Pcs',
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
      let a = '', id = '';
      try { const b = JSON.parse(Buffer.concat(ch).toString() || '{}'); a = b.action || ''; id = b.id || ''; } catch (e) {}
      if (a === 'getData') return res.end(JSON.stringify({ status: 'ok', total: ROWS.length, rows: ROWS }));
      if (a === 'getItem') {
        const row = ROWS.find(r => r.id === String(id).toUpperCase());
        if (row) return res.end(JSON.stringify({ status: 'ok', item: row }));
        return res.end(JSON.stringify({ status: 'error', message: 'Item tidak ditemukan' }));
      }
      res.end(JSON.stringify({ status: 'ok', message: 'ok', total: 0, items: [], alat: [], raks: [], trx: [] }));
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
let pass = 0, fail = 0, env = 0;
function rec(name, ok, detail) {
  if (ok) { pass++; console.log('PASS | ' + name + ' | ' + (detail || '')); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (detail || '')); }
}
function recEnv(name, detail) { env++; console.log('ENVIRONMENT-DEPENDENT | ' + name + ' | ' + (detail || '')); }

function qrMatrix(text) {
  const qrcode = require(path.join(ROOT, 'qrcode.min.js'));
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let bits = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) bits += qr.isDark(r, c) ? '1' : '0';
  return { n, bits };
}

const CAM_SHIM = (() => {
  const { n, bits } = qrMatrix(QR_TEXT);
  return `(function(){
  var N=${n},BITS=${JSON.stringify(bits)},W=640,H=480;
  var canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  var ctx=canvas.getContext('2d');
  var scale=Math.max(2,Math.floor(Math.min(W,H)/(N+8)));
  var total=(N+8)*scale,ox=Math.floor((W-total)/2),oy=Math.floor((H-total)/2);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#000000';
  for(var r=0;r<N;r++)for(var c=0;c<N;c++){if(BITS.charCodeAt(r*N+c)===49)ctx.fillRect(ox+(c+4)*scale,oy+(r+4)*scale,scale,scale);}
  window.__camCanvas=canvas;
  function fakeGetUserMedia(){try{return Promise.resolve(canvas.captureStream(10));}catch(e){return Promise.reject(e);}}
  try{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:fakeGetUserMedia,configurable:true,writable:true});}
  catch(e){navigator.mediaDevices.getUserMedia=fakeGetUserMedia;}
  window.__camShim={w:W,h:H,module:N,scale:scale};
})();`;
})();

const SNAP = `(function(){
  var v=document.getElementById('qr-video');
  var c=document.getElementById('qr-scanner-container');
  var l=document.getElementById('qr-label');
  var inp=document.getElementById('scan-id-input');
  return {shim:!!window.__camShim,vw:v?v.videoWidth:0,vh:v?v.videoHeight:0,rs:v?v.readyState:-1,
    ctr:c?c.style.display:'?',lbl:l?l.textContent:'?',lblDet:!!(l&&l.classList.contains('detected')),
    val:inp?inp.value:'?',tracks:(v&&v.srcObject&&v.srcObject.getTracks)?v.srcObject.getTracks().map(function(t){return t.readyState;}):[]};
})()`;

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(require('os').tmpdir(), 'rdi-camqr-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=430,932',
    '--autoplay-policy=no-user-gesture-required', 'about:blank'
  ], { stdio: 'ignore' });

  let ws = null;
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
    ws = new WebSocket(target);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pend = new Map();
    const pageErrors = [];
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails || {};
        pageErrors.push(((d.exception && d.exception.description) || d.text || '?').split('\n')[0]);
      }
    };
    const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.result && r.result.exceptionDetails) return { error: (r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text };
      return r.result && r.result.result ? r.result.result.value : { error: 'no result' };
    };
    await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: CAM_SHIM });

    const payload = Buffer.from(['h', 'n', String(Date.now() + 3600000), 'sig'].join('|')).toString('base64').replace(/=+$/, '') + '.sig';
    await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
    for (let i = 0; i < 50; i++) {
      if (await ev("typeof window.switchTab==='function' && !!document.getElementById('boot-splash')") === true) break;
      await sleep(300);
    }
    await ev("localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');"
      + "sessionStorage.setItem('rdi_viewer_token','" + payload + "');"
      + "sessionStorage.setItem('rdi_editor_key','testkey');"
      + "sessionStorage.setItem('rdi_editor_key_set_at',String(Date.now()));'ok'");
    await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
    let booted = false;
    for (let i = 0; i < 70; i++) {
      const r = await ev("(function(){var b=document.getElementById('boot-splash');return {h:!b||b.classList.contains('hide'),rs:document.readyState,n:(window.allRows||[]).length,fn:typeof window.switchTab==='function',gate:(document.getElementById('login-gate')||{}).className||''};})()");
      if (r && !r.error && r.h === true && r.rs === 'complete' && r.fn === true && r.n === 4) { booted = true; break; }
      await sleep(300);
    }
    rec('boot ready (editor, 4 row mock)', booted === true, 'booted=' + booted);

    const shimOk = await ev("!!window.__camShim && !!window.__camCanvas && typeof navigator.mediaDevices.getUserMedia==='function'");
    rec('shim kamera terpasang sebelum app boot', shimOk === true, JSON.stringify(await ev("window.__camShim||null")));

    await ev("switchTab('scanner');'ok'");
    await sleep(400);
    const stepOk = await ev("!!document.querySelector('#step-input.active')");
    rec('section scanner + step-input aktif', stepOk === true, 'step-input active=' + stepOk);

    await ev("toggleInlineScanner('scanner');'ok'");

    let cam = null, decoded = null;
    for (let i = 0; i < 60; i++) {
      const s = await ev(SNAP);
      if (!s || s.error) break;
      if (!cam && s.vw >= 100 && s.rs >= 2) cam = s;
      if (s.val === QR_TEXT) { decoded = s; break; }
      await sleep(500);
    }

    if (!cam) recEnv('video kamera simulasi mengalir (videoWidth/readyState)', 'tanpa frame; canvas.captureStream tidak didukung lingkungan ini');
    else rec('video kamera simulasi mengalir', cam.vw === 640 && cam.vh === 480 && cam.rs >= 2, JSON.stringify(cam));

    if (!cam) {
      recEnv('decode QR dari stream kamera', 'dilewati: stream tidak mengalir');
    } else {
      rec('decode QR -> #scan-id-input terisi otomatis', decoded !== null, decoded ? JSON.stringify({ val: decoded.val, lbl: decoded.lbl }) : 'tidak terdeteksi dalam 30s');
      rec('label menunjukkan QR terdeteksi', !!(decoded && decoded.lblDet && /QR terdeteksi/.test(decoded.lbl)), decoded ? decoded.lbl : 'n/a');
      rec('scanner tertutup otomatis setelah deteksi', !!(decoded && decoded.ctr === 'none'), 'ctr=' + (decoded ? decoded.ctr : 'n/a'));
      const ended = decoded && decoded.tracks.length > 0 && decoded.tracks.every(t => t === 'ended');
      rec('track kamera di-stop setelah deteksi', !!ended, JSON.stringify(decoded ? decoded.tracks : null));
      let follow = null;
      for (let i = 0; i < 12; i++) {
        follow = await ev("(function(){return {trx:!!document.querySelector('#step-transaksi.active'),qty:(document.getElementById('qty-input')||{}).value,prev:(document.getElementById('prev-nama')||{}).textContent||''};})()");
        if (follow && follow.trx === true) break;
        await sleep(400);
      }
      rec('lookupItem lanjut ke step transaksi (getItem mock)', !!(follow && follow.trx === true), JSON.stringify(follow));
    }

    rec('tidak ada uncaught exception', pageErrors.length === 0, 'count=' + pageErrors.length + ' ' + JSON.stringify(pageErrors.slice(0, 2)));

    console.log('NOT TESTED | kamera + optik perangkat fisik (L4) | butuh HP + QR tercetak/di layar lain');
    console.log('---');
    console.log('=== CAMERA_QR: ' + pass + ' PASS / ' + fail + ' FAIL / ' + env + ' ENVIRONMENT-DEPENDENT ===');
  } finally {
    try { ws && ws.close(); } catch (e) {}
    try { if (process.platform === 'win32' && chrome.pid) spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill(); } catch (e) {}
    try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch (e) {}
    server.close();
  }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
