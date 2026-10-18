/* L2 PERF (2026-10-16): verifikasi runtime browser paket perbaikan lag v15.33.
 *
 * Yang diuji di browser NYATA (Chrome headless + CDP) dgn katalog 3001 baris:
 *  1. BOOT  — splash harus sembunyi CEPAT (~0,6 dtk) walau getData sengaja
 *             ditunda 3 dtk oleh server mock. Dulu splash menunggu data
 *             (Promise.all([dataReady,minWait])) sehingga boot tersandera.
 *  2. AC    — acShow utk query typo ("kathode bering") harus:
 *             (a) selesai SINKRON cepat (pass-1 murah saja, bukan fuzzy penuh
 *                 ~0,9 dtk utk 3 rb baris), (b) tidak mem-freeze event loop
 *                 (chunk 22 ms), (c) menemukan item lewat pass async,
 *             (d) jalur event nyata (oninput -> debounce 150 ms) juga bekerja.
 *  3. RAK   — buka tab Rak ke-2 tidak boleh fetch getRakBreakdownAll lagi
 *             (_rakBreakdownMap dipakai ulang).
 *  4. DASH  — buka dashboard ke-2 dalam TTL 60 dtk tidak fetch getDashboard lagi.
 *  5. TRX   — pasca-transaksi sukses: TIDAK ada getData penuh segera; baris
 *             item di-patch lokal + 1 getItem ringan; kartu hasil tampil;
 *             refresh katalog gabungan menyusul ~90 dtk (konvergensi).
 *  6. BOOT4 — boot ulang dgn hash #dashboard: getData tetap 1x (bukan 2x) dan
 *             dashboard ter-render setelah data tiba (review-fix F-4).
 *
 * Catatan perlawanan test-hampa:
 *  - Query typo sengaja dipilih agar pass-1 (cheap) GAGAL (bukan substring,
 *    bukan prefix) sehingga jalur async benar-benar dieksekusi.
 *  - Hitungan panggilan diambil dari server mock (bukan asumsi UI).
 *  - Jendela waktu diberi margin (timer 90 dtk diukur 80-105 dtk).
 */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { spawn, spawnSync } = require('child_process');
const ROOT = 'C:\\projec\\rdi-scanner-pwa';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const HTTP_PORT = 9631, CDP_PORT = 9632;

/* Katalog 3001 baris: 3000 item normal + 1 item typo-target. */
const ROWS = [];
for (let i = 1; i <= 3000; i++) {
  ROWS.push({ id: 'T-' + String(i).padStart(4, '0'), no: String(i), nama: 'Bearing Unit HJ-' + String(i).padStart(4, '0'), spec: 'SP-' + (i % 50), qty: (i % 7) + 1, unit: 'Pcs', rak: 'A-' + String((i % 20) + 1).padStart(2, '0'), kategori: 'Sparepart', vendor: 'Vendor-' + (i % 5), po: 'PO-' + (i % 9), user: 'budi', minStock: 2, tglMasuk: '2026-01-01' });
}
ROWS.push({ id: 'SP-TYPO-01', no: '3001', nama: 'Kathode Bearing KX-9', spec: 'S', qty: 5, unit: 'Pcs', rak: 'B-09', kategori: 'Sparepart', vendor: 'V', po: 'P', user: 'budi', minStock: 2, tglMasuk: '2026-01-01' });
const N = ROWS.length;

const calls = {};
let itemSaldo = 25;
let firstDataServed = false;

function gas(b) {
  const a = (b && b.action) || 'unknown';
  calls[a] = (calls[a] || 0) + 1;
  if (a === 'getData') return { status: 'ok', total: N, rows: ROWS, items: ROWS, alat: [], raks: [], trx: [] };
  if (a === 'getItem') {
    const row = ROWS.find(r => r.id === b.id) || ROWS[0];
    return { status: 'ok', item: Object.assign({}, row, { saldo: itemSaldo }), row: row, saldo: itemSaldo, qty: itemSaldo, rakBreakdown: [{ rak: row.rak, qty: itemSaldo }], minStock: 2 };
  }
  if (a === 'getMasterLists') return { status: 'ok', kategori: ['Sparepart'], uom: ['Pcs'], vendor: ['Vendor-0'], rak: ['A-01'] };
  if (a === 'getDashboard') return { status: 'ok', totalItem: N, totalMasuk: 1, totalKeluar: 1, top5: [], kategori: [], terendah: [] };
  if (a === 'getRakBreakdownAll') return { status: 'ok', rows: [{ id: 'T-0001', rak: 'A-01', qty: 10 }, { id: 'T-0002', rak: 'A-01', qty: 5 }, { id: 'T-0003', rak: 'A-02', qty: 7 }] };
  if (a === 'postTransaksi') { const before = itemSaldo; itemSaldo = Math.max(0, itemSaldo - (b.qty || 1)); return { status: 'ok', saldoSebelum: before, saldoSesudah: itemSaldo, unit: 'Pcs', namaItem: 'Bearing Unit HJ-0100', jenis: b.jenis, qty: b.qty }; }
  if (a === 'getAlert') return { status: 'ok', items: [] };
  if (a === 'getHistory' || a === 'getAllHistory') return { status: 'ok', rows: [], history: [], total: 0 };
  return { status: 'ok', message: 'mock', rows: [], items: [], alat: [] };
}

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/gas') {
    const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => {
      let b = {}; try { b = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch (e) {}
      let delay = 0;
      if (b.action === 'getData' && !firstDataServed) { firstDataServed = true; delay = 3000; }
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(gas(b)));
      }, delay);
    });
    return;
  }
  if (u === '/') { res.writeHead(302, { Location: '/index.html' }); res.end(); return; }
  fs.readFile(path.join(ROOT, u.replace(/^\//, '')), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'text/html' }); res.end(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (n, ok, ev) => { if (ok === true) { pass++; console.log('PASS | ' + n + (ev ? ' | ' + ev : '')); } else { fail++; console.log('FAIL | ' + n + ' | ' + ev); } };

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(process.env.TEMP, 'rdi-perf-' + Date.now());
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
    /* Sesi EDITOR (rdi_editor_key) WAJIB ada: gasPost() di js/outbox.js menolak
       semua penulisan saat VIEWER_MODE=true (= kunci editor kosong) —
       "Mode lihat-saja: perubahan data tidak diizinkan." tanpa menyentuh fetch.
       Tanpa kunci editor, TRX-* lolos-lolos palsu (kartu hasil statis "—"
       dan mock tidak pernah melihat postTransaksi). Kunci diset di localStorage
       DAN sessionStorage karena readSecureStorage() membaca sessionStorage. */
    const nowTs = String(Date.now());
    await ev("localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');localStorage.setItem('rdi_editor_key','mock-editor-key');localStorage.setItem('rdi_editor_key_set_at','" + nowTs + "');sessionStorage.setItem('rdi_editor_key','mock-editor-key');sessionStorage.setItem('rdi_editor_key_set_at','" + nowTs + "');localStorage.setItem('rdi_viewer_token','" + tok + "');sessionStorage.setItem('rdi_viewer_token','" + tok + "');localStorage.setItem('rdi_last_active','" + nowTs + "');1");
    /* ---- BOOT: navigate ulang dgn sesi; getData sengaja ditunda 3 dtk ---- */
    const t0 = Date.now();
    await send('Page.navigate', { url: APP });
    let tHidden = null, rAtHidden = null, tData = null, rowsAtData = null;
    for (let i = 0; i < 120; i++) {
      const b = await ev("(function(){var s=document.getElementById('boot-splash');return {h:!s||s.classList.contains('hide'),r:(window.filteredRows||[]).length};})()");
      if (b && !b.__err) {
        if (b.h && tHidden === null) { tHidden = Date.now() - t0; rAtHidden = b.r; }
        if (b.r === N && tData === null) { tData = Date.now() - t0; rowsAtData = b.r; break; }
      }
      await sleep(150);
    }
    t('BOOT-1: splash sembunyi cepat tanpa menunggu data', tHidden !== null && tHidden <= 2500, 'tHidden=' + tHidden + 'ms');
    t('BOOT-2: saat splash sembunyi, data BELUM termuat (decouple)', rAtHidden === 0, 'rows saat splash hilang=' + rAtHidden);
    t('BOOT-3: data ' + N + ' baris tetap termuat sesudahnya', tData !== null && rowsAtData === N && tData <= 15000, 'tData=' + tData + 'ms rows=' + rowsAtData);
    await sleep(1200);

    /* ---- AC: acShow dgn katalog 3001 baris ---- */
    const ac = await ev("(function(){document.getElementById('scan-id-input').value='kathode bering';window.__lag=0;window.__last=performance.now();window.__wt=setInterval(function(){var n=performance.now();var d=n-window.__last-20;if(d>window.__lag)window.__lag=d;window.__last=n;},20);var t0=performance.now();window.acShow('scan');return {ms:performance.now()-t0};})()");
    t('AC-1: acShow sinkron terbatas dgn 3001 baris (<700ms)', ac && !ac.__err && typeof ac.ms === 'number' && ac.ms < 700, 'sync=' + (ac && ac.ms) + 'ms');
    let acEls = 0, acText = '', acElapsed = null;
    const acStart = Date.now();
    for (let i = 0; i < 100; i++) {
      const d = await ev("(function(){var els=document.querySelectorAll('#ac-scan .ac-item');return {n:els.length,txt:els.length?els[0].textContent:''};})()");
      if (d && !d.__err && d.n > 0) { acEls = d.n; acText = d.txt || ''; acElapsed = Date.now() - acStart; break; }
      await sleep(150);
    }
    t('AC-2: hasil fuzzy async muncul (item typo ditemukan)', acEls > 0 && acText.indexOf('Kathode') !== -1, 'elapsed=' + acElapsed + 'ms n=' + acEls + ' txt=' + acText.slice(0, 40));
    const lag = await ev("(function(){clearInterval(window.__wt);return {lag:window.__lag};})()");
    t('AC-3: tidak ada stall event-loop besar (chunk 22ms)', lag && !lag.__err && typeof lag.lag === 'number' && lag.lag < 700, 'lag maks=' + (lag && lag.lag && Math.round(lag.lag)) + 'ms');
    /* jalur event nyata: oninput -> toUpperCase -> debounce 150ms -> acShow */
    await ev("(function(){var el=document.getElementById('scan-id-input');el.value='kathode bering';el.dispatchEvent(new Event('input'));return 1;})()");
    let ac2 = 0;
    for (let i = 0; i < 100; i++) {
      const d = await ev("(function(){var els=document.querySelectorAll('#ac-scan .ac-item');return {n:els.length};})()");
      if (d && !d.__err && d.n > 0) { ac2 = d.n; break; }
      await sleep(150);
    }
    t('AC-4: jalur event nyata (input -> debounce) juga menemukan hasil', ac2 > 0, 'n=' + ac2);

    /* ---- RAK: buka ulang tab Rak harus pakai peta bersama ---- */
    const R0 = calls.getRakBreakdownAll || 0;
    await ev("window.switchTab('rak');1");
    await sleep(1500);
    const R1 = calls.getRakBreakdownAll || 0;
    const rakHtml = await ev("(function(){var c=document.getElementById('rak-list-container');return {len:(c&&c.innerHTML||'').length,txt:(c&&c.innerHTML||'').slice(0,200)};})()");
    await ev("window.switchTab('master');1");
    await sleep(300);
    await ev("window.switchTab('rak');1");
    await sleep(1500);
    const R2 = calls.getRakBreakdownAll || 0;
    t('RAK-1: buka tab Rak ke-2 TIDAK fetch getRakBreakdownAll lagi', R2 === R1 && R1 >= R0, 'buka1 ' + R0 + '->' + R1 + ', buka2 ' + R1 + '->' + R2);
    t('RAK-2: daftar rak ter-render dari peta', rakHtml && rakHtml.len > 30 && rakHtml.txt.indexOf('A-0') !== -1, 'len=' + (rakHtml && rakHtml.len));

    /* ---- DASH: TTL 60 dtk ---- */
    const D0 = calls.getDashboard || 0;
    await ev("window.switchTab('dashboard');1");
    await sleep(1800);
    const D1 = calls.getDashboard || 0;
    await ev("window.switchTab('master');1");
    await sleep(300);
    await ev("window.switchTab('dashboard');1");
    await sleep(1800);
    const D2 = calls.getDashboard || 0;
    t('DASH-1: buka dashboard ke-2 dalam TTL 60 dtk tidak fetch ulang', D1 > D0 && D2 === D1, 'buka1 ' + D0 + '->' + D1 + ', buka2 ' + D1 + '->' + D2);

    /* ---- TRX: transaksi tunggal via alur nyata ---- */
    await ev("(function(){document.getElementById('scan-id-input').value='T-0100';window.lookupItem();return 1;})()");
    let qtyReady = false;
    for (let i = 0; i < 60; i++) { const q = await ev("document.getElementById('qty-input').value"); if (q === '1') { qtyReady = true; break; } await sleep(150); }
    t('TRX-0: lookup item siap (flow transaksi terbentuk)', qtyReady === true, 'qty-input=' + JSON.stringify(await ev("document.getElementById('qty-input').value")));
    if (qtyReady) {
      await ev("(function(){window.setJenis('KELUAR');document.getElementById('qty-input').value='2';document.getElementById('rak-input').value='A-01';return 1;})()");
      const C0d = calls.getData || 0, C0i = calls.getItem || 0;
      await ev("window.submitTransaksi();1");
      let posted = false;
      for (let i = 0; i < 60; i++) { if ((calls.postTransaksi || 0) >= 1) { posted = true; break; } await sleep(150); }
      await sleep(2500);
      const C1d = calls.getData || 0, C1i = calls.getItem || 0;
      t('TRX-1: pasca-transaksi sukses TIDAK ada getData penuh', posted === true && C1d === C0d, 'getData ' + C0d + '->' + C1d + ' (posted=' + posted + ')');
      const row = await ev("(function(){var r=(window.filteredRows||[]).find(function(x){return x.id==='T-0100';});return r?{qty:String(r.qty),rak:String(r.rak||'')}:null;})()");
      t('TRX-2: baris item di-patch lokal + 1 getItem ringan', C1i >= C0i + 1 && row && row.qty === '23' && row.rak.indexOf('A-01') !== -1, 'getItem ' + C0i + '->' + C1i + ' row=' + JSON.stringify(row));
      /* result-before/-after default statis "—" → terisi HANYA oleh showResult()
         dgn data respons mock (25 → 23 Pcs). Ini bukti dinamis, bukan teks statis. */
      const rb = await ev("document.getElementById('result-before').textContent");
      const ra = await ev("document.getElementById('result-after').textContent");
      t('TRX-3: kartu hasil terisi dari respons server (25 -> 23 Pcs)', typeof ra === 'string' && ra.indexOf('23') !== -1 && ra.indexOf('Pcs') !== -1 && typeof rb === 'string' && rb.indexOf('25') !== -1, 'before=' + JSON.stringify(rb) + ' after=' + JSON.stringify(ra));
      /* ---- TRX-4: refresh katalog gabungan menyusul ~90 dtk (konvergensi) ---- */
      const tRef = Date.now();
      let refetched = null;
      for (let i = 0; i < 120; i++) { if ((calls.getData || 0) === C1d + 1) { refetched = Date.now() - tRef; break; } await sleep(1000); }
      t('TRX-4: refresh katalog gabungan menyusul (konvergensi ~90 dtk)', refetched !== null && refetched >= 80000 && refetched <= 105000, 'elapsed=' + (refetched !== null ? Math.round(refetched / 1000) + 's' : 'TIDAK TERJADI'));
    }

    /* ---- BOOT-4 (review-fix F-4): reload SUNGGUHAN dgn hash #dashboard — getData
       sengaja ditunda 3 dtk lagi; dulu minWait->switchTab('dashboard') memicu
       loadDashboard lebih awal shg fallback getData-nya jalan = 2x getData.
       Catatan: Page.navigate ke URL yg hanya beda hash TIDAK me-reload dokumen
       (fragment navigation) — karena itu dipakai location.reload() eksplisit. ---- */
    firstDataServed = false;
    const G0 = calls.getData || 0;
    await ev("(function(){try{localStorage.setItem('rdi_last_active',String(Date.now()));}catch(e){}location.hash='dashboard';location.reload();return 1;})()");
    let b4seen0 = false, b4rows = null;
    for (let i = 0; i < 120; i++) { const r = await ev("(window.filteredRows||[]).length"); if (r === 0) b4seen0 = true; if (b4seen0 && r === N) { b4rows = r; break; } await sleep(150); }
    await sleep(2000);
    const G1 = calls.getData || 0;
    t('BOOT-4: boot #dashboard tidak memicu getData ganda (F-4)', b4rows === N && (G1 - G0) === 1, 'getData ' + G0 + '->' + G1 + ' rows=' + b4rows);
    const dart = await ev("(function(){var s=document.getElementById('section-dashboard');var w=document.getElementById('dash-alert-widget');return {active:!!s&&s.classList.contains('active'),wlen:w?w.innerHTML.length:0,wid:w?w.innerHTML.indexOf('T-')!==-1:false};})()");
    t('BOOT-5: dashboard ter-render dari data setelah data tiba (tab aktif)', !!dart && dart.active === true && dart.wlen > 50 && dart.wid === true, JSON.stringify(dart));

    t('NO PAGE EXCEPTION', exc.length === 0, 'exceptions=' + JSON.stringify(exc.slice(0, 3)));
    console.log('---- perf_pass: ' + pass + ' PASS / ' + fail + ' FAIL ----');
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
