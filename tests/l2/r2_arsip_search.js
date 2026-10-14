/* L2 - REVISI 2026-10-15: item terarsip harus tetap bisa ditemukan lewat panel cari.
 *
 * Fungsi ini dibuat untuk membuktikan SATU hal di browser sungguhan:
 * mengetik nama item berstatus "Arsip" di panel cari MASTER harus
 * memunculkannya. Sebelumnya tidak mungkin - `_doFilter` membuang baris
 * terarsip lebih dulu daripada menjalankan pencarian.
 *
 * Menguji lewat jalur UI, bukan lewat internal:
 *   #search-box --oninput--> filterTableDebounced() --150ms--> filterTable()
 *                  --80ms--> _doFilter()
 * Fungsi internal aplikasi TIDAK terekspos ke window; `window._doFilter`
 * bernilai undefined. Yang bisa dipanggil dari luar hanya
 * `filterTableDebounced()`, karena itu yang dirujuk handler inline. Dan
 * `oninput` inline dieksekusi di scope global, jadi pemanggilan yang salah akan
 * melempar ReferenceError.
 *
 * Dua jebakan harness yang sudah-terbayar untuk dihindari (lihat catatan di
 * `ketik()`): placeholder yang tidak cocok sehingga ekspresi tidak pernah
 * dipanggil, dan langkah no-op yang diterima tanpa complains lalu dibaca
 * state basi. Keduanya membuat tes melaporkan hasil yang tidak terjadi.
 */
/* Bukti final, dengan dua perbaikan pada harness-nya sendiri.
 *
 * BUG HARNESS #1 - placeholder tidak cocok.
 *   Templat ditulis `(function(val){` tetapi diganti dengan `.replace('(val)',...)`.
 *   Substring `(val)` TIDAK ADA di `(val){`. Replace tidak mengubah apa pun,
 *   ekspresi hanya dievaluasi sebagai fungsi dan tidak pernah dipanggil.
 *   Akibatnya setiap langkah no-op, dan tes melaporkan state basi sebagai hasil.
 *   -> pakai placeholder eksplisit `__VAL__` dan BANGUN ekspresinya.
 *
 * BUG HARNESS #2 - langkah no-op diterima diam-diam.
 *   Versi lama hanya memeriksa `s.fatal || s.err`; kalau ekspresinya tidak
 *   dijalankan, hasilnya `null` dan lolos. Sekarang langkah WAJIB mengembalikan
 *   objek bertanda `ran:true`, dan kalau tidak, itu dilaporkan sebagai
 *   kegagalan - bukan dilanjutkan dengan pembacaan basi.
 *
 * Cara ini sudah terbukti bekerja (lihat diag_final): mengetik "Rusak"
 * memunculkan tepat 1 kartu dengan petunjuk
 * "1 dari 5 item untuk "rusak" - termasuk 1 item diarsipkan".
 */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { spawn, spawnSync } = require('child_process');
const ROOT = 'C:\\projec\\rdi-scanner-pwa';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const HTTP_PORT = 9627, CDP_PORT = 9628;
const N = 5; const ARSIP_NAMA = 'Bearing Rusak Habis';
const ROWS = [];
for (let i = 1; i <= N; i++) ROWS.push({
  id: 'MRO-' + String(i).padStart(2, '0') + '-002', no: String(i),
  nama: i === 3 ? ARSIP_NAMA : 'Sparepart Motor ' + i,
  spec: 'Spec ' + i, qty: i === 3 ? 0 : (i * 7), unit: 'Pcs', rak: 'A-0' + i,
  kategori: 'Sparepart', vendor: 'PT Sinar Jaya', po: 'PO-1' + i, user: 'budi',
  minStock: 2, tglMasuk: '2026-09-01', status: i === 3 ? 'Arsip' : '',
});
const gas = a => a === 'getData' ? { status: 'ok', total: N, rows: ROWS, items: ROWS, alat: [], raks: [], trx: [] }
  : a === 'getItem' ? { status: 'ok', item: ROWS[0], row: ROWS[0], saldo: 7, qty: 7, rakBreakdown: [{ rak: 'A-01', qty: 7 }], minStock: 2 }
  : a === 'getMasterLists' ? { status: 'ok', kategori: ['Sparepart'], uom: ['Pcs'], vendor: ['PT Sinar Jaya'], rak: ['A-01'] }
  : a === 'getDashboard' ? { status: 'ok', totalItem: N, totalMasuk: 1, totalKeluar: 1, top5: [], kategori: [], terendah: [] }
  : a === 'getRakBreakdownAll' ? { status: 'ok', rows: [] } : a === 'getAlert' ? { status: 'ok', items: [] }
  : (a === 'getHistory' || a === 'getAllHistory') ? { status: 'ok', rows: [], history: [], total: 0 }
  : (a === 'getLedger' || a === 'getStockLedger') ? { status: 'ok', entries: [] }
  : { status: 'ok', message: 'mock', rows: [], items: [], alat: [] };
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/gas') { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => { let b = {}; try { b = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch (e) {} res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(gas(b.action))); }); return; }
  if (u === '/') { res.writeHead(302, { Location: '/index.html' }); res.end(); return; }
  fs.readFile(path.join(ROOT, u.replace(/^\//, '')), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'text/html' }); res.end(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (n, ok, ev) => { if (ok === true) { pass++; console.log('PASS | ' + n + (ev ? ' | ' + ev : '')); } else { fail++; console.log('FAIL | ' + n + ' | ' + ev); } };

/* Placeholder eksplisit, dan bentuk akhir sudah berupa EKSPRESI PANGGILAN. */
function stepExpr(val) {
  return '(function(){try{' +
    'var el=document.getElementById("search-box");' +
    'if(!el)return {ran:false,err:"tidak ada #search-box"};' +
    'el.value=' + JSON.stringify(val) + ';' +
    'filterTableDebounced();' +
    'return {ran:true,v:el.value};' +
    '}catch(e){return {ran:false,err:String(e&&e.message||e)};}})()';
}
const BACA = `(function(){
  var c=document.querySelectorAll('.ilc3');
  var isi=[]; for(var i=0;i<c.length;i++) isi.push((c[i].textContent||'').replace(/\\s+/g,' ').trim().slice(0,30));
  var h=document.getElementById('search-hint');
  var arsip=null;
  for(var k=0;k<c.length;k++) if((c[k].textContent||'').indexOf('ARSIP')>=0) arsip=c[k];
  var s=arsip?getComputedStyle(arsip):null;
  return {ran:true, n:isi.length, isi:isi, hint:h?((h.textContent||'').replace(/\\s+/g,' ').trim().slice(0,120)):'',
          arsipAda:!!arsip, opacity:s?s.opacity:'', badge:arsip?((arsip.textContent||'').indexOf('ARSIP')>=0):false};
})()`;

async function ketik(ev, val) {
  const s = await ev(stepExpr(val));
  if (!s || s.ran !== true) return { ran: false, __err: s ? s.err : 'langkah tidak mengembalikan objek' };
  await sleep(1300);
  const r = await ev(BACA);
  if (!r || r.ran !== true) return { ran: false, __err: 'BACA gagal' };
  if (r.ran === true) {
    const v = await ev("document.getElementById('search-box').value");
    if (v !== val) return { ran: false, __err: 'nilai input tidak menempel: ' + v + ' != ' + val };
  }
  return r;
}

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(process.env.TEMP, 'rdi-ah-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  try {
    let target = null;
    for (let i = 0; i < 40 && !target; i++) { await sleep(300); try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json(); const p = l.find(t => t.type === 'page'); if (p) target = p.webSocketDebuggerUrl; } catch (e) {} }
    if (!target) throw new Error('tidak ada target CDP');
    ws = new WebSocket(target);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pend = new Map(); const exc = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; exc.push(((d.exception || {}).description || d.text || '').split('\n')[0]); } };
    const send = (me, pa) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
    const ev = async (x, ms) => { const to = new Promise(res => setTimeout(() => res({ __err: 'TIMEOUT' }), ms || 30000)); const r = await Promise.race([send('Runtime.evaluate', { expression: x, returnByValue: true }), to]); if (r && r.__err) return r; if (r && r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || 'exc').split('\n')[0] }; return r && r.result && r.result.result ? r.result.result.value : null; };
    await send('Page.enable'); await send('Runtime.enable');
    const APP = 'http://127.0.0.1:' + HTTP_PORT + '/index.html';
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: APP });
    for (let i = 0; i < 90; i++) { if ((await ev("typeof window.switchTab==='function'")) === true) break; await sleep(300); }
    const tok = Buffer.from(['h', 'n', String(Date.now() + 7200000), 'sig'].join('|')).toString('base64').replace(/=+$/, '') + '.sig';
    await ev("localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');localStorage.setItem('rdi_viewer_token','" + tok + "');sessionStorage.setItem('rdi_viewer_token','" + tok + "');localStorage.setItem('rdi_last_active',String(Date.now()));1");
    await send('Page.navigate', { url: APP });
    let boot = null;
    for (let i = 0; i < 150; i++) {
      const b = await ev("(function(){var s=document.getElementById('boot-splash');return {h:!s||s.classList.contains('hide'),r:(window.allRows||[]).length};})()");
      if (b && !b.__err && b.h && b.r === N) { boot = b; break; }
      await sleep(400);
    }
    t('BOOT: 5 item, 1 berstatus Arsip', boot !== null, JSON.stringify(boot));
    if (!boot) process.exit(2);
    await ev("window.switchTab('master');1");
    await sleep(1600);

    const B = await ketik(ev, 'Rusak');
    const bM = B && B.isi && B.isi.some(x => x.indexOf('Rusak') >= 0);
    t('B: ketik "Rusak" -> item arsip TAMPUL (ini perbaikannya)', bM === true && B.n === 1,
      (B && B.__err) ? ('LANGKAH GAGAL: ' + B.__err) : ('n=' + B.n + ' hint=' + JSON.stringify(B.hint)));
    t('C: hasil ditandai arsip (redup + badge ARSIP)',
      B && B.arsipAda === true && Number(B.opacity) < 0.9 && B.badge === true,
      JSON.stringify({ ada: B && B.arsipAda, op: B && B.opacity, badge: B && B.badge }));
    t('D: petunjuk menyebut jumlah item terarsip',
      B && typeof B.hint === 'string' && B.hint.indexOf('diarsipkan') >= 0, JSON.stringify(B && B.hint));

    const A = await ketik(ev, '');
    const aM = A && A.isi && A.isi.some(x => x.indexOf('Rusak') >= 0);
    t('A: kotak kosong -> arsip TIDAK tampil (perilaku lama utuh)', A && A.n === N - 1 && !aM,
      (A && A.__err) ? A.__err : ('n=' + A.n + ' ' + JSON.stringify(A.isi)));

    const E = await ketik(ev, 'Motor');
    const eM = E && E.isi && E.isi.some(x => x.indexOf('Rusak') >= 0);
    t('E: ketik "Motor" -> 4 kartu, arsip tidak ikut', E && E.n === N - 1 && !eM,
      (E && E.__err) ? E.__err : ('n=' + E.n + ' ' + JSON.stringify(E.isi)));

    const F = await ketik(ev, 'zzzztidakada');
    t('F: ketik yang tidak ada -> 0 kartu, tanpa error', F && F.n === 0,
      (F && F.__err) ? F.__err : ('n=' + F.n));

    t('NO PAGE EXCEPTION', exc.length === 0, 'exceptions=' + JSON.stringify(exc.slice(0, 3)));
    console.log('---- arsip_search_ui: ' + pass + ' PASS / ' + fail + ' FAIL ----');
  } finally {
    try { ws && ws.close(); } catch (e) {}
    try { if (chrome.pid) spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
    try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (e) {}
    try { server.closeAllConnections && server.closeAllConnections(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });