/* L2 r2_ux_feedback (2026-10-19): umpan balik operator di lapangan.
 * Menguji tiga jalur yang sebelumnya tidak ada / memblokir:
 *   1. Haptic (navigator.vibrate) saat item ditemukan / gagal ditemukan.
 *   2. Haptic dihormati saat OS meminta reduced motion (tidak bergetar).
 *   3. Notice in-app (bukan alert modal) dengan warna/role sesuai jenis pesan.
 * Level: L2 (browser headless, vibrate di-stub â€” bukan getaran fisik).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const HTTP_PORT = 9431, CDP_PORT = 9432;

const ROWS = [{
  id: 'MRO-02-001', nama: 'Mata Saw 12 inch', spec: 'HSS 12x2', qty: 5, unit: 'Pcs',
  rak: 'A-01', kategori: 'Sparepart', vendor: 'V', po: 'P', user: 'T', minStock: 2, arsip: '', tglMasuk: '2026-09-01'
}];

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/gas') {
    const ch = [];
    req.on('data', c => ch.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      let a = '';
      try { a = JSON.parse(Buffer.concat(ch).toString() || '{}').action || ''; } catch (e) {}
      if (a === 'getData') { const zeroRows = req.url.indexOf('rows=0') !== -1; res.end(JSON.stringify({ status: 'ok', total: zeroRows ? 0 : ROWS.length, rows: zeroRows ? [] : ROWS })); }
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
  if (ok) { pass++; console.log('PASS | ' + name + ' | ' + (detail === undefined ? '' : JSON.stringify(detail))); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (detail === undefined ? '' : JSON.stringify(detail))); }
}

const VIB_STUB = `(function(){
  window.__vib=[];
  try{Object.defineProperty(navigator,'vibrate',{value:function(p){window.__vib.push(p);return true;},configurable:true});}catch(e){return 'stub-fail';}
  return 'ok';
})()`;

const LOOKUP = `(function(mode){
  window.__vib=[];
  var real=window.gasGet;
  window.gasGet=function(){return Promise.resolve(mode==='ok'
    ?{status:'ok',item:{id:'MRO-02-001',nama:'Mata Saw 12 inch',spec:'HSS 12x2',saldo:5,unit:'Pcs',rak:'A-01',kategori:'Sparepart',vendor:'V',arsip:''}}
    :{status:'error',message:'Item tidak ditemukan'});};
  document.getElementById('scan-id-input').value='MRO-02-001';
  try{lookupItem();}finally{window.gasGet=real;}
  return 'called';
})('%MODE%')`;

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(require('os').tmpdir(), 'rdi-uxfb-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=430,932',
    'about:blank'
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
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.result && r.result.exceptionDetails) return { error: (r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text };
      return r.result && r.result.result ? r.result.result.value : { error: 'no result' };
    };
    await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.enable');
    const payload = Buffer.from(['h', 'n', String(Date.now() + 3600000), 'sig'].join('|')).toString('base64').replace(/=+$/, '') + '.sig';

    async function boot(nRows) {
      const expectRows = nRows === undefined ? ROWS.length : nRows;
      await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
      for (let i = 0; i < 50; i++) {
        if (await ev("typeof window.switchTab==='function' && !!document.getElementById('boot-splash')") === true) break;
        await sleep(300);
      }
      await ev("localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas" + (nRows === 0 ? '?rows=0' : '') + "');sessionStorage.setItem('rdi_viewer_token','" + payload + "');sessionStorage.removeItem('rdi_editor_key');'ok'");
      await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
      for (let i = 0; i < 70; i++) {
        const r = await ev("(function(){var b=document.getElementById('boot-splash');return {h:!b||b.classList.contains('hide'),rs:document.readyState,n:(window.allRows||[]).length,fn:typeof window.switchTab==='function'};})()");
        if (r && !r.error && r.h === true && r.rs === 'complete' && r.fn === true && r.n === expectRows) return true;
        await sleep(300);
      }
      return false;
    }

    await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
    rec('boot siap (data 1 baris termuat)', (await boot()) === true);

    rec('stub navigator.vibrate terpasang', (await ev(VIB_STUB)) === 'ok');

    await ev(LOOKUP.replace('%MODE%', 'ok'));
    await sleep(400);
    const okVib = await ev("({vib:window.__vib,step:(document.getElementById('step-transaksi')||{}).className||null,err:(document.querySelector('#sbar-lookup.s-err')||{}).textContent||null})");
    rec('haptic saat item ditemukan (1 pola pendek)', okVib && Array.isArray(okVib.vib) && okVib.vib.length === 1 && okVib.vib[0] === 35, okVib);

    await ev(LOOKUP.replace('%MODE%', 'err'));
    await sleep(400);
    const errVib = await ev("({vib:window.__vib,errTxt:(document.querySelector('#sbar-lookup.s-err')||{}).textContent||null})");
    rec('haptic beda saat item TIDAK ditemukan (pola 3 ketuk)', errVib && Array.isArray(errVib.vib) && errVib.vib.length === 1 && Array.isArray(errVib.vib[0]) && errVib.vib[0].length === 3, errVib);
    rec('pesan gagal tetap tampil di status bar', errVib && typeof errVib.errTxt === 'string' && /tidak ditemukan/i.test(errVib.errTxt), errVib && errVib.errTxt);

    const warn = await ev("(function(){cetakNotice('Pilih minimal 1 item dulu.','warn',700);var el=document.getElementById('cetak-pdf-banner');return el?{role:el.getAttribute('role'),bg:getComputedStyle(el).backgroundColor,txt:el.textContent}:null;})()");
    rec('notice warning: role=status + warna amber gelap', warn && warn.role === 'status' && warn.bg === 'rgb(122, 74, 0)' && /Pilih minimal 1/.test(warn.txt), warn);

    await sleep(1200);
    rec('notice auto-hilang setelah durasi', (await ev("!!document.getElementById('cetak-pdf-banner')")) === false);

    const errN = await ev("(function(){cetakNotice('Popup diblokir browser.','err',700);var el=document.getElementById('cetak-pdf-banner');return el?{role:el.getAttribute('role'),bg:getComputedStyle(el).backgroundColor}:null;})()");
    rec('notice error: role=alert + warna merah gelap', errN && errN.role === 'alert' && errN.bg === 'rgb(127, 29, 29)', errN);
    await sleep(1200);

    const badge = await ev(`(function(){
      function mk(i){return {payload:{requestId:'probe-'+i}};}
      localStorage.setItem('rdi_trx_outbox', JSON.stringify([mk(1),mk(2)]));
      updateOutboxBadge();
      var el=document.getElementById('offline-banner');
      var a={txt:(el.textContent||'').trim(),role:el.getAttribute('role'),aria:el.getAttribute('aria-live'),cls:el.className};
      localStorage.removeItem('rdi_trx_outbox');
      updateOutboxBadge();
      var b={txt:(el.textContent||'').trim(),cls:el.className};
      return {pending:a,clear:b};
    })()`);
    rec('badge antrean: "2 transaksi tertunda menunggu dikirim" + role=status',
      badge && badge.pending && /transaksi tertunda menunggu dikirim/.test(badge.pending.txt) && /2/.test(badge.pending.txt) && badge.pending.role === 'status' && /pending/.test(badge.pending.cls) && badge.pending.aria === 'polite', badge && badge.pending);
    rec('badge antrean hilang saat antrean kosong (online)',
      badge && badge.clear && !/show/.test(badge.clear.cls) && !/transaksi tertunda/.test(badge.clear.txt), badge && badge.clear);

    const selReset = await ev(`(function(){
      switchTab('cetak'); renderCetakList(); cetakSelectAll();
      var before=(document.getElementById('cetak-sel-label')||{}).textContent||'';
      var s=document.getElementById('cetak-search'); s.value='zzz-tidak-ada'; renderCetakList();
      var el=document.getElementById('cetak-pdf-banner');
      var after=(document.getElementById('cetak-sel-label')||{}).textContent||'';
      var n=el?{txt:el.textContent,role:el.getAttribute('role')}:null;
      s.value=''; renderCetakList(); cetakBanner(false);
      return {before:before,after:after,notice:n};
    })()`);
    rec('U-2: ubah filter mereset pilihan Cetak + notice',
      selReset && /1 item dipilih/.test(selReset.before || '') && /^0 item dipilih/.test(selReset.after || '') && selReset.notice && /direset/.test(selReset.notice.txt) && selReset.notice.role === 'status', selReset);

    const modeNotice = await ev(`(function(){
      cetakSelectAll();
      setCetakMode('label');
      var el=document.getElementById('cetak-pdf-banner');
      var a=el?{txt:el.textContent,role:el.getAttribute('role'),bg:getComputedStyle(el).backgroundColor}:null;
      setCetakMode('kartu');
      var b=el?el.textContent:null;
      cetakBanner(false);
      return {label:a,kartu:b};
    })()`);
    rec('U-5: pindah mode menjelaskan pilihan yang dipakai',
      modeNotice && modeNotice.label && /1 item dipilih dipakai untuk mode Label/.test(modeNotice.label.txt || '') && modeNotice.label.role === 'status' && modeNotice.label.bg === 'rgb(26, 58, 122)' && /Kartu Stok/.test(modeNotice.kartu || ''), modeNotice);

    const singleKeep = await ev(`(function(){
      cetakClearAll(); var s=document.getElementById('cetak-search'); s.value='zzz-tidak-ada'; renderCetakList(); s.value='';
      var real=window.open, opened=0;
      window.open=function(){opened++;return {closed:true,document:{write:function(){},close:function(){},getElementById:function(){return null;}},close:function(){}};};
      var err=null;
      try{ printSingleItem(0); }catch(e){ err=String(e); }
      window.open=real;
      var lbl=(document.getElementById('cetak-sel-label')||{}).textContent||'';
      var checked=document.querySelectorAll('#cetak-item-list .cetak-item-cb:checked').length;
      cetakBanner(false);
      return {opened:opened,lbl:lbl,checked:checked,err:err};
    })()`);
    rec('U-2: printSingleItem tetap membawa pilihan walau filter berubah + daftar dirender ulang',
      singleKeep && singleKeep.opened === 1 && /1 item dipilih/.test(singleKeep.lbl || '') && singleKeep.checked === 1, singleKeep);

    const beep = await ev(`(function(){
      window.__beepStarts=0; window.__realAC=window.AudioContext;
      function Fake(){return {state:'running',currentTime:0,destination:{},resume:function(){},createOscillator:function(){return {type:'',frequency:{value:0},connect:function(){},start:function(){window.__beepStarts++;},stop:function(){}};},createGain:function(){return {gain:{setValueAtTime:function(){},exponentialRampToValueAtTime:function(){}},connect:function(){}};}};}
      window.AudioContext=Fake;
      var realGas=window.gasGet;
      window.gasGet=function(){return Promise.resolve({status:'ok',item:{id:'MRO-02-001',nama:'x',spec:'',saldo:1,unit:'Pcs',rak:'A-01',kategori:'',vendor:'',arsip:''}});};
      setBeepPref(true);
      document.getElementById('scan-id-input').value='MRO-02-001';
      lookupItem();
      window.gasGet=realGas;
      return {pref:localStorage.getItem('rdi_beep')};
    })()`);
    await sleep(600);
    const beepOn = await ev("window.__beepStarts");
    await ev(`(function(){
      setBeepPref(false); window.__beepStarts=0;
      var realGas=window.gasGet;
      window.gasGet=function(){return Promise.resolve({status:'ok',item:{id:'MRO-02-001',nama:'x',spec:'',saldo:1,unit:'Pcs',rak:'A-01',kategori:'',vendor:'',arsip:''}});};
      document.getElementById('scan-id-input').value='MRO-02-001';
      lookupItem();
      window.gasGet=realGas;
      window.AudioContext=window.__realAC; delete window.__realAC;
      return 'ok';
    })()`);
    await sleep(600);
    const beepOff = await ev("window.__beepStarts");
    rec('U-4: beep hanya berbunyi saat sakelar aktif',
      beep && beep.pref === '1' && beepOn === 1 && beepOff === 0, {pref: beep && beep.pref, on: beepOn, off: beepOff});

    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const rmBoot = await boot();
    rec('boot ulang dengan prefers-reduced-motion: reduce', rmBoot === true);
    rec('stub vibrate terpasang (reduced motion)', (await ev(VIB_STUB)) === 'ok');
    await ev(LOOKUP.replace('%MODE%', 'ok'));
    await sleep(400);
    const rmVib = await ev("({vib:window.__vib,pid:(document.getElementById('preview-id')||{}).textContent||null,trx:document.getElementById('step-transaksi').classList.contains('active'),sbar:(document.getElementById('sbar-lookup')||{}).textContent||null})");
    rec('reduced motion: tidak ada getaran (preferensi OS dihormati)', rmVib && Array.isArray(rmVib.vib) && rmVib.vib.length === 0, rmVib);
    rec('alur tetap jalan tanpa getaran (item tampil di preview)', rmVib && rmVib.pid === 'MRO-02-001' && rmVib.trx === true, rmVib);

    const boot0 = await boot(0);
    rec('boot ulang dengan data kosong (0 baris, jalur nyata getData)', boot0 === true);

    const alertFree = await ev(`(function(){
      var calls=[]; var real=window.alert; window.alert=function(m){calls.push(String(m));};
      var r={};
      exportExcel(); r.export={a:calls.length, n:(window.allRows||[]).length, txt:(document.getElementById('cetak-pdf-banner')||{}).textContent||null};
      cetakBanner(false); calls.length=0;
      openExportQRModal(); r.qr={a:calls.length, txt:(document.getElementById('cetak-pdf-banner')||{}).textContent||null, modal:(document.getElementById('modal-export-qr')||{}).className?document.getElementById('modal-export-qr').classList.contains('show'):null};
      document.getElementById('modal-export-qr').classList.remove('show'); cetakBanner(false); calls.length=0;
      printRakLabels(); r.rak={a:calls.length, txt:(document.getElementById('cetak-pdf-banner')||{}).textContent||null};
      cetakBanner(false); calls.length=0;
      exportHistFeedCSV(); r.hist={a:calls.length, txt:(document.getElementById('cetak-pdf-banner')||{}).textContent||null};
      cetakBanner(false); calls.length=0;
      asetPlaceholder('Uji Coba'); r.ph={a:calls.length, txt:(document.getElementById('cetak-pdf-banner')||{}).textContent||null};
      cetakBanner(false); calls.length=0;
      window.alert=real;
      return r;
    })()`);
    rec('U-1+: exportExcel tanpa data memakai notice, bukan alert',
      alertFree && alertFree.export && alertFree.export.n === 0 && alertFree.export.a === 0 && /Muat data terlebih dahulu/.test(alertFree.export.txt || ''), alertFree && alertFree.export);
    rec('U-1+: openExportQRModal tanpa data tidak membuka modal + notice',
      alertFree && alertFree.qr && alertFree.qr.a === 0 && alertFree.qr.modal === false && /Muat data terlebih dahulu/.test(alertFree.qr.txt || ''), alertFree && alertFree.qr);
    rec('U-1+: printRakLabels tanpa rak terpilih memakai notice',
      alertFree && alertFree.rak && alertFree.rak.a === 0 && /Pilih minimal 1 rak/.test(alertFree.rak.txt || ''), alertFree && alertFree.rak);
    rec('U-1+: exportHistFeedCSV tanpa data memakai notice',
      alertFree && alertFree.hist && alertFree.hist.a === 0 && /Tidak ada data riwayat/.test(alertFree.hist.txt || ''), alertFree && alertFree.hist);
    rec('U-1+: asetPlaceholder memakai notice info, bukan alert',
      alertFree && alertFree.ph && alertFree.ph.a === 0 && /belum tersedia/.test(alertFree.ph.txt || ''), alertFree && alertFree.ph);

    console.log('---');
    console.log('UX_FEEDBACK: ' + pass + ' PASS / ' + fail + ' FAIL');
  } finally {
    try { ws && ws.close(); } catch (e) {}
    try { if (process.platform === 'win32' && chrome.pid) spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill(); } catch (e) {}
    try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch (e) {}
    server.close();
  }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });


