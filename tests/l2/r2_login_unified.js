/* L2 r2_login_unified (2026-09-27, F5-AUTH / PLAN §14) — bukti BROWSER untuk login unified.
 *
 * Yang diuji (bukan simulasi model, tapi form + fetch + penyimpanan sungguhan):
 *   1) satu form login (username+password) dipakai editor DAN viewer
 *   2) peran datang dari server (`role`), client tidak menebak
 *   3) role=editor  -> token disimpan di slot editor, tanpa class viewer-mode
 *   4) role=viewer  -> token disimpan di slot viewer, class viewer-mode aktif
 *   5) password salah -> pesan error, TIDAK ada token tersimpan
 *   6) modal Pengaturan tidak lagi punya field "Editor Key" (F5-AUTH)
 *   7) editor yang login bisa memanggil write (postTransaksi) — transport tidak berubah
 *
 * Mock GAS lokal hanya untuk action=login/getData/postTransaksi.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const HTTP_PORT = 9455, CDP_PORT = 9456;

const ROWS = [{
  id: 'MRO-02-001', no: '1', nama: 'Bearing 6205 ZZ', spec: 'Bearing', qty: 120, unit: 'Pcs',
  rak: 'A-01', kategori: 'Sparepart', vendor: 'V1', po: 'P1', user: 'budi', minStock: 20, tglMasuk: '2026-09-01',
}];

// token palsu dengan bentuk yang sama (payload|signature) supaya parseViewerToken/setAt bekerja
function fakeToken(username, nama, role) {
  const b64 = Buffer.from(username + '|' + nama + '|' + (Date.now() + 6 * 3600 * 1000) + '|jti-' + username + '|1|' + role, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64 + '.' + Buffer.from('sig-' + username).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const TOK_EDITOR = fakeToken('wahyu', 'Wahyu Susanto', 'editor');
const TOK_VIEWER = fakeToken('gudang01', 'Operator Gudang 01', 'viewer');

let lastAction = '';
let lastBody = null;

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/gas') {
    const ch = [];
    req.on('data', c => ch.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      let body = {};
      try { body = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch (e) {}
      const a = body.action || '';
      lastAction = a; lastBody = body;
      if (a === 'login') {
        if (body.username === 'wahyu' && body.password === 'EditorPass123!') {
          return res.end(JSON.stringify({ status: 'ok', token: TOK_EDITOR, role: 'editor', nama: 'Wahyu Susanto', username: 'wahyu' }));
        }
        if (body.username === 'gudang01' && body.password === 'ViewerPass123!') {
          return res.end(JSON.stringify({ status: 'ok', token: TOK_VIEWER, role: 'viewer', nama: 'Operator Gudang 01', username: 'gudang01' }));
        }
        return res.end(JSON.stringify({ status: 'error', message: 'Username atau password salah.' }));
      }
      if (a === 'logout') return res.end(JSON.stringify({ status: 'ok' }));
      if (a === 'getData') return res.end(JSON.stringify({ status: 'ok', total: ROWS.length, rows: ROWS }));
      if (a === 'getItem') return res.end(JSON.stringify({ status: 'ok' }));
      if (a === 'postTransaksi') {
        // hanya editor yang boleh: di sisi app, token editor dikirim di field editorKey
        const t = body.editorKey || body.viewerToken || '';
        if (t === TOK_EDITOR) return res.end(JSON.stringify({ status: 'ok', message: 'trx tersimpan' }));
        return res.end(JSON.stringify({ status: 'error', message: 'Akses ditolak.', needLogin: true }));
      }
      return res.end(JSON.stringify({ status: 'ok', message: 'ok', total: 0, items: [], alat: [], raks: [], trx: [] }));
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
const GAS_URL = 'http://127.0.0.1:' + HTTP_PORT + '/gas';

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(os.tmpdir(), 'rdi-login-' + Date.now());
  // Kalau port masih dilayani proses sisa dari run sebelumnya, runway
  // akan mengambil alih sesi Chrome yang salah. Selesaikan dulu.
  try {
    const r = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version');
    if (r.ok) { console.log('FAIL | CDP port ' + CDP_PORT + ' masih dilayani proses lain'); process.exit(2); }
  } catch (e) { /* port bebas, lanjutkan */ }
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore' });
  /* Di Windows chrome.kill() hanya menyentuh proses induk; anak-anak Chrome
   * (zygote/renderer/gpu) tetap hidup dan memegang port remote-debugging.
   * taskkill /T /F menutup seluruh pohon. */
  const cleanup = () => {
    try {
      // taskkill harus SINKRON: kalau hanya di-spawn, rmSync di bawah berjalan
      // sebelum Chrome benar-benar mati dan profile-lock masih dipegang, sehingga
      // penghapusan profil diam-diam gagal.
      if (process.platform === 'win32' && chrome.pid) {
        spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
      } else chrome.kill();
    } catch (e) {}
    try { server.close(); } catch (e) {}
    // Profil tidak pernah dihapus sebelum ini -> ratusan MB per run.
    try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch (e) {}
  };
  process.on('exit', cleanup);

  let target = null;
  // Tunggu /json/version lebih dulu: itu bukti Chrome benar-benar siap
  // menerima koneksi, bukan hanya port yang sudah terbuka.
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version'); if (r.ok) { ready = true; break; } } catch (e) {}
    await sleep(300);
  }
  if (!ready) { console.log('FAIL | CDP connect | Chrome tidak siap dalam 18 detik'); process.exit(2); }
  for (let i = 0; i < 60; i++) {
    try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json(); const p = l.find(t => t.type === 'page'); if (p) { target = p.webSocketDebuggerUrl; break; } } catch (e) {}
    await sleep(250);
  }
  if (!target) { console.log('FAIL | CDP connect | tidak ada target'); process.exit(2); }
  const ws = new WebSocket(target);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(String((d.exception && (d.exception.description || d.exception.value)) || d.text).split('\n')[0]);
    }
  };
  const send = (method, params) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : null;
  };
  /* B1: tunggu kondisi nyata, bukan sleep tetap. Sleep tetap membuat suite ini
   * flaky: 2500ms cukup di mesin cepat, tidak cukup di mesin terbebani. */
  const waitFor = async (expr, timeoutMs, label) => {
    const t0 = Date.now();
    const cap = timeoutMs || 20000;
    let last = null;
    while (Date.now() - t0 < cap) {
      last = await ev('!!(' + expr + ')');
      if (last === true) { console.log('INFO waitFor ' + (label || expr) + ' OK dalam ' + (Date.now() - t0) + 'ms'); return true; }
      await sleep(120);
    }
    console.log('INFO waitFor ' + (label || expr) + ' TIMEOUT setelah ' + (Date.now() - t0) + 'ms (nilai terakhir: ' + JSON.stringify(last) + ')');
    return false;
  };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: APP_URL });
  await waitFor("document.readyState !== 'loading'", 15000, 'halaman pertama siap (localStorage bisa ditulis)');
  // arahkan GAS ke mock lokal
  await ev("localStorage.setItem('rdi_gas_url','" + GAS_URL + "');localStorage.setItem('rdi_bypass_boot','1');'ok'");
  await send('Page.navigate', { url: APP_URL });
  await waitFor("document.getElementById('login-username') && document.getElementById('login-password')", 20000, 'form login siap setelah navigasi');

  // --- 1. form login ada & field Editor Key tidak ada ---
  rec('LU-1: form login username+password ada di layar utama',
    await ev("!!(document.getElementById('login-username') && document.getElementById('login-password'))") === true);
  rec('LU-2: modal Pengaturan tidak lagi punya field "Editor Key"',
    await ev("!document.getElementById('editor-key-input')") === true);
  rec('LU-3: loginVia = action "login" (bukan viewerLogin)',
    /action: *'login'/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));

  // --- 2. password salah ditolak, tidak ada token tersimpan ---
  await ev("(function(){document.getElementById('login-username').value='wahyu';document.getElementById('login-password').value='SALAH';return 1;})()");
  await ev("submitViewerLogin();1");
  await waitFor("(function(){var e=document.getElementById('login-error');return e && getComputedStyle(e).display !== 'none' && /salah/i.test(e.textContent || '');})()", 20000, 'pesan password salah tampil');
  let st = await ev("(function(){return {err:(document.getElementById('login-error').textContent||'').slice(0,60),vis:getComputedStyle(document.getElementById('login-error')).display,ek:localStorage.getItem('rdi_editor_key')||sessionStorage.getItem('rdi_editor_key'),vt:localStorage.getItem('rdi_viewer_token')||sessionStorage.getItem('rdi_viewer_token')};})()");
  rec('LU-4: password salah -> pesan error tampil', st && st.vis !== 'none' && /salah/i.test(st.err), JSON.stringify(st));
  rec('LU-5: password salah -> TIDAK ada token tersimpan', st && !st.ek && !st.vt, 'editor=' + (st && st.ek) + ' viewer=' + (st && st.vt));

  // --- 3. login editor -> token di slot editor, tanpa viewer-mode ---
  await ev("(function(){document.getElementById('login-username').value='wahyu';document.getElementById('login-password').value='EditorPass123!';return 1;})()");
  await ev("submitViewerLogin();1");
  await waitFor("document.getElementById('login-gate').classList.contains('hide')", 25000, 'login editor: gate tertutup');
  st = await ev("(function(){return {gate:document.getElementById('login-gate').classList.contains('hide'),ek:(localStorage.getItem('rdi_editor_key')||sessionStorage.getItem('rdi_editor_key')||''),vt:(localStorage.getItem('rdi_viewer_token')||sessionStorage.getItem('rdi_viewer_token')||''),vmode:document.body.classList.contains('viewer-mode'),top:(document.getElementById('topbar-username')||{}).textContent||''};})()");
  rec('LU-6: login editor -> gate tertutup (masuk app)', st && st.gate === true, JSON.stringify(st));
  rec('LU-7: login editor -> token DISIMPAN di slot editor', st && st.ek.length > 20, 'len=' + (st && st.ek.length));
  rec('LU-8: login editor -> slot viewer KOSONG (tidak ada dua sesi)', st && !st.vt, 'viewer=' + (st && st.vt));
  rec('LU-9: login editor -> class viewer-mode TIDAK aktif', st && st.vmode === false);
  rec('LU-10: nama asli tampil di topbar (identitas, bukan "Admin")', st && /wahyu/i.test(st.top), 'topbar=' + (st && st.top));

  // --- 4. editor bisa write (transport tidak berubah) ---
  const w = await ev("(function(){return fetch('" + GAS_URL + "',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'postTransaksi',editorKey:(sessionStorage.getItem('rdi_editor_key')||localStorage.getItem('rdi_editor_key')||''),id:'MRO-02-001',qty:1})}).then(r=>r.json());})()");
  rec('LU-11: editor bisa write (postTransaksi diterima)', w && w.status === 'ok', JSON.stringify(w));

  // --- 5. login viewer -> token di slot viewer + viewer-mode ---
  await ev("(function(){try{sessionStorage.clear();}catch(e){} localStorage.removeItem('rdi_editor_key');localStorage.removeItem('rdi_viewer_token');localStorage.removeItem('rdi_last_active');return 1;})()");
  await send('Page.navigate', { url: APP_URL });
  await waitFor("document.getElementById('login-username')", 20000, 'form login siap untuk sesi viewer');
  await ev("(function(){document.getElementById('login-username').value='gudang01';document.getElementById('login-password').value='ViewerPass123!';return 1;})()");
  await ev("submitViewerLogin();1");
  await waitFor("document.getElementById('login-gate').classList.contains('hide') && document.body.classList.contains('viewer-mode')", 25000, 'login viewer: masuk app + viewer-mode');
  st = await ev("(function(){return {gate:document.getElementById('login-gate').classList.contains('hide'),ek:(localStorage.getItem('rdi_editor_key')||sessionStorage.getItem('rdi_editor_key')||''),vt:(localStorage.getItem('rdi_viewer_token')||sessionStorage.getItem('rdi_viewer_token')||''),vmode:document.body.classList.contains('viewer-mode')};})()");
  rec('LU-12: login viewer -> masuk app', st && st.gate === true, JSON.stringify(st));
  rec('LU-13: login viewer -> token DISIMPAN di slot viewer', st && st.vt.length > 20, 'len=' + (st && st.vt.length));
  rec('LU-14: login viewer -> slot editor KOSONG', st && !st.ek);
  rec('LU-15: login viewer -> class viewer-mode AKTIF', st && st.vmode === true);

  // --- 6. viewer TIDAK bisa write ---
  const w2 = await ev("(function(){return fetch('" + GAS_URL + "',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'postTransaksi',viewerToken:(sessionStorage.getItem('rdi_viewer_token')||localStorage.getItem('rdi_viewer_token')||''),id:'MRO-02-001',qty:1})}).then(r=>r.json());})()");
  rec('LU-16: viewer TIDAK bisa write (ditolak)', w2 && w2.status === 'error', JSON.stringify(w2));

  rec('LU-17: tidak ada uncaught error selama seluruh alur', errors.length === 0, 'errors=' + errors.length + (errors[0] ? ' | ' + errors[0].slice(0, 90) : ''));

  console.log('---- r2_login_unified: ' + pass + ' PASS / ' + fail + ' FAIL ----');
  ws.close(); cleanup();
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
