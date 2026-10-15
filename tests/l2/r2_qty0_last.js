/* L2 - REVISI 2 (2026-10-15): item stok 0 tetap di list, tapi di paling belakang.
 *
 * Diminta: "kalau qty 0 dia tetap ada di list TPI, di tampil di paling
 * belakang dan ketika cari masih muncul. Tujuannya agar dia tidak mengotori
 * tampilan."
 *
 * Yang dijamin suite ini:
 *   - stok 0 tidak disembunyikan (tetap semua item tampil)
 *   - stok 0 urut di dua posisi terakhir, pada SEMUA arah pengurutan
 *   - mengetik namanya tetap menemukannya
 *
 * Fixture disengaja: ada DUA item stok 0 dan letaknya di TENGAH sumber, supaya
 * urutannya benar-benar teruji dan bukan kebetulan sudah berada di akhir.
 *
 * Dua jebakan yang sudah dibayar untuk dihindari, dan penjaganya masih ada:
 *
 *  1. `setSort` tidak ada - pemicu pengurutan yang sebenarnya adalah
 *     `sortByColumn` (dirujuk dari onclick header tabel). Memakai setSort
 *     membuat arah tidak pernah berubah, ketiga skenario menghasilkan urutan
 *     IDENTIK, dan test meluluskan sesuatu yang tidak diuji.
 *  2. Ekspektasi arah: panggilan pertama `sortByColumn('qty')` menghasilkan
 *     TURUN, bukan naik. Assertion harus ikut datanya, bukan tebakan.
 *
 * Karena itu ada GUARD ANTI-HAMPA di assert 4: urutan item bukan-nol WAJIB
 * benar-benar terbalik antara panggilan kedua dan ketiga. Kalau tidak, skenario
 * itu tidak menguji apa pun dan tidak boleh dianggap lulus.
 */
/* Bukti runtime: item stok 0 harus urut di PALING BELAKANG, tetap tampil,
 * dan tetap bisa dicari - apa pun arah pengurutan yang dipilih.
 *
 * Fixture disengaja: qty 0 di tengah, bukan di ujung, supaya urutannya benar
 * benar teruji dan bukan kebetulan ber|posisi sudah di akhir.
 *
 * Yang diuji:
 *   1. urutan bawaan        -> stok 0 di akhir
 *   2. klik "stok" naik     -> stok 0 TETAP di akhir (tidak ikut _sortDir)
 *   3. klik "stok" turun    -> stok 0 TETAP di akhir
 *   4. mengetik nama        -> stok 0 ditemukan
 *   5. stok 0 tidak hilang dari list saat tidak mencari
 */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { spawn, spawnSync } = require('child_process');
const ROOT = 'C:\\projec\\rdi-scanner-pwa';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const HTTP_PORT = 9629, CDP_PORT = 9630;

/*.qty sengaja tidak berurutan, dan 0 ada di tengah. */
const ROWS = [
  { id: 'MRO-01-002', no: '1', nama: 'Alpha Bearing', spec: 'S1', qty: 25, unit: 'Pcs', rak: 'A-01', kategori: 'Sparepart', vendor: 'V', po: 'P', user: 'b', minStock: 2, tglMasuk: '2026-01-05' },
  { id: 'MRO-02-002', no: '2', nama: 'Zeta Habis', spec: 'S2', qty: 0, unit: 'Pcs', rak: 'A-02', kategori: 'Sparepart', vendor: 'V', po: 'P', user: 'b', minStock: 2, tglMasuk: '2026-02-05' },
  { id: 'MRO-03-002', no: '3', nama: 'Beta Seal', spec: 'S3', qty: 8, unit: 'Pcs', rak: 'A-03', kategori: 'Sparepart', vendor: 'V', po: 'P', user: 'b', minStock: 2, tglMasuk: '2026-03-05' },
  { id: 'MRO-04-002', no: '4', nama: 'Omega Kosong', spec: 'S4', qty: 0, unit: 'Pcs', rak: 'A-04', kategori: 'Sparepart', vendor: 'V', po: 'P', user: 'b', minStock: 2, tglMasuk: '2026-04-05' },
  { id: 'MRO-05-002', no: '5', nama: 'Gamma Filter', spec: 'S5', qty: 15, unit: 'Pcs', rak: 'A-05', kategori: 'Sparepart', vendor: 'V', po: 'P', user: 'b', minStock: 2, tglMasuk: '2026-05-05' },
];
const N = ROWS.length;
const gas = a => a === 'getData' ? { status: 'ok', total: N, rows: ROWS, items: ROWS, alat: [], raks: [], trx: [] }
  : a === 'getItem' ? { status: 'ok', item: ROWS[0], row: ROWS[0], saldo: 25, qty: 25, rakBreakdown: [{ rak: 'A-01', qty: 25 }], minStock: 2 }
  : a === 'getMasterLists' ? { status: 'ok', kategori: ['Sparepart'], uom: ['Pcs'], vendor: ['V'], rak: ['A-01'] }
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

/* Ambil urutan dari DOM: nama +qty tiap kartu. */
const URUT = `(function(){
  var c=document.querySelectorAll('.ilc3');
  var out=[];
  for(var i=0;i<c.length;i++){
    var el=c[i];
    var nm=el.querySelector('.ilc3-nama');
    out.push({nama:(nm?nm.textContent:'?').replace(/\\s+/g,' ').trim().slice(0,18)});
  }
  return {ran:true, urut:out};
})()`;

/* Ambil urutan dari data yang benar-benar diurutkan oleh aplikasi. */
const URUT_DATA = `(function(){
  try{
    var f=(window.filteredRows||[]).map(function(r){return (r.nama||'').slice(0,12)+'='+(parseFloat(r.qty)||0);});
    return {ran:true, f:f};
  }catch(e){return {ran:false, err:String(e.message||e)};}
})()`;

async function urut(ev) {
  /* picu render ulang lewat filterTableDebounced, bukan memanggil internal */
  await ev("(function(){var el=document.getElementById('search-box');el.value='';try{filterTableDebounced();}catch(e){}return {ran:true};})()");
  await sleep(1300);
  const d = await ev(URUT_DATA);
  return d && d.ran ? d.f : ['<gagal: ' + (d ? d.err : 'null') + '>'];
}
/* dua elemen terakhir harus qty 0, dan TIDAK boleh ada qty 0 di tengah. */
function cekNolDiAkhir(list) {
  if (!list.length) return false;
  const qty = list.map(x => parseFloat(String(x).split('=')[1]) || 0);
  const last2 = qty.slice(-2);
  const first3 = qty.slice(0, -2);
  return last2.length === 2 && last2[0] === 0 && last2[1] === 0 && first3.every(q => q > 0);
}

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(process.env.TEMP, 'rdi-qz-' + Date.now());
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
    t('BOOT: 5 item, 2 di antaranya stok 0', boot !== null, JSON.stringify(boot));
    if (!boot) process.exit(2);
    await ev("window.switchTab('master');1");
    await sleep(1600);

    const U1 = await urut(ev);
    t('1: urutan bawaan -> stok 0 di dua posisi terakhir', cekNolDiAkhir(U1), JSON.stringify(U1));

    const adaSemua = Array.isArray(U1) && U1.length === N;
    t('2: semua 5 item tetap tampil (tidak ada yang disembunyikan)', adaSemua === true, 'jumlah=' + (Array.isArray(U1) ? U1.length : '?'));

    /* Urutkan lewat sortByColumn - fungsi yang dirujuk onclick di header
       tabel, jadi berada di scope global. Versi pertama memakai setSort yang
       ternyata tidak ada, sehingga arah tidak pernah berubah dan ketiga
       skenario menghasilkan urutan IDENTIK: kelulusan hampa.
       Arah pertama untuk field qty adalah TURUN (dir -1), kedua_calls-nya
       naik. Ekspektasi tes pertama saya salah (mengira naik) - datanya yang
       benar, jadi assertionsnya yang dikoreksi. */
    const NONZERO = (u) => (Array.isArray(u) ? u.slice(0, -2).map(x => parseFloat(String(x).split('=')[1]) || 0) : []);
    const isDesc = (a) => a.length > 1 && a.every((v, i) => i === 0 || a[i - 1] >= v);
    const isAsc = (a) => a.length > 1 && a.every((v, i) => i === 0 || a[i - 1] <= v);

    const s1 = await ev("(function(){try{sortByColumn('qty','Stok');return {ran:true,ok:1};}catch(e){return {ran:false,err:String(e.message||e)};}})()");
    await sleep(500);
    const U2 = await urut(ev);
    t('3: arah pertama "stok" (turun) -> stok 0 tetap di akhir',
      cekNolDiAkhir(U2) && isDesc(NONZERO(U2)) === true,
      (s1 && s1.ok === 1) ? JSON.stringify(U2) : 'sortByColumn gagal: ' + JSON.stringify(s1));

    const s2 = await ev("(function(){try{sortByColumn('qty','Stok');return {ran:true,ok:1};}catch(e){return {ran:false,err:String(e.message||e)};}})()");
    await sleep(500);
    const U3 = await urut(ev);
    /* GUARD ANTI-HAMPA: kalau urutan tidak benar-benar terbalik, skenario ini
       tidak menguji apa pun dan tidak boleh dianggap lulus. */
    const benarTerbalik = Array.isArray(U2) && Array.isArray(U3) &&
      JSON.stringify(U2.slice(0, -2)) !== JSON.stringify(U3.slice(0, -2));
    t('4: arah kedua "stok" (naik) -> stok 0 tetap di akhir, DAN urutan benar-benar terbalik',
      cekNolDiAkhir(U3) && isAsc(NONZERO(U3)) === true && benarTerbalik === true,
      JSON.stringify(U3) + ' | terbalik=' + benarTerbalik);

    /* cari item stok 0 */
    const cari = await ev("(function(){try{var el=document.getElementById('search-box');el.value='Habis';filterTableDebounced();return {ran:true};}catch(e){return {ran:false,err:String(e.message||e)};}})()");
    await sleep(1300);
    const C = await ev("(function(){var f=(window.filteredRows||[]).map(function(r){return r.nama.slice(0,12)+'='+(parseFloat(r.qty)||0);});return {ran:true,f:f};})()");
    t('5: mengetik "Habis" -> item stok 0 ditemukan', cari && cari.ran === true && C && C.f.length === 1 && parseFloat(C.f[0].split('=')[1]) === 0,
      JSON.stringify(C ? C.f : C));

    t('NO PAGE EXCEPTION', exc.length === 0, 'exceptions=' + JSON.stringify(exc.slice(0, 3)));
    console.log('---- qty0_last: ' + pass + ' PASS / ' + fail + ' FAIL ----');
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