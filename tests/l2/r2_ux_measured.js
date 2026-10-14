/* L2 UX MEASURED GATE (2026-10-14)
 *
 * Gate ini sengaja TIDAK grep. Audit 2026-10-14 membuktikan grep tidak cukup:
 *   - xss_audit tidak memuat scanFrame*  -> SEC-01 lolos 16/16
 *   - handler_coverage menghitung deklarasi IIFE sebagai global -> DBG-01 lolos
 *   - SEC-C2 memvalidasi definisi ter-shadow yang tidak pernah jalan
 * Jadi semua angka di sini diukur dari DOM + computed style sungguhan di Chrome.
 *
 * Rubrik: tabel prioritas 1-10 SKILL.md ui-ux-pro-max (hanya tabelnya yang dipakai;
 * scripts/ + references/ skill tidak ada di mesin ini sehingga database tidak bisa
 * di-query — dicatat di PLAN.md, tidak diaku sebagai hasil query).
 *
 * Menutup UX-01 (target sentuh), UX-02 (teks <12px), UX-03 (nama aksesibel),
 * UX-04 (aria-selected tab), UX-05 (kontras amber di atas amber-dim). */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const HTTP_PORT = 9582, CDP_PORT = 9583;
const N = 40;
const ROWS = [];
for (let i = 1; i <= N; i++) ROWS.push({ id: 'MRO-' + String(i).padStart(2, '0') + '-001', no: String(i), nama: 'Item number ' + i, spec: 'Spec ' + i, qty: i * 3, unit: 'Pcs', rak: 'A-' + String(i % 8).padStart(2, '0'), kategori: i % 3 ? 'Sparepart' : 'Consumable', vendor: 'V1', po: 'PO', user: 'budi', minStock: 5, tglMasuk: '2026-09-01' });
const gas = a => a === 'getData' ? { status: 'ok', total: N, rows: ROWS, items: ROWS, alat: [], raks: [], trx: [] }
  : a === 'getItem' ? { status: 'ok', item: ROWS[0], row: ROWS[0], saldo: 3, qty: 3, rakBreakdown: [{ rak: 'A-01', qty: 3 }], minStock: 1 }
  : a === 'getMasterLists' ? { status: 'ok', kategori: ['Sparepart', 'Consumable'], uom: ['Pcs'], vendor: ['V1'], rak: ['A-01', 'A-02'] }
  : a === 'getDashboard' ? { status: 'ok', totalItem: N, totalMasuk: 10, totalKeluar: 5, top5: [], kategori: [], terendah: [] }
  : a === 'getRakBreakdownAll' ? { status: 'ok', rows: [] }
  : a === 'getAlert' ? { status: 'ok', items: [] }
  : (a === 'getHistory' || a === 'getAllHistory') ? { status: 'ok', rows: [], history: [], total: 0 }
  : (a === 'getLedger' || a === 'getStockLedger') ? { status: 'ok', entries: [] }
  : { status: 'ok', message: 'mock ok', rows: [], items: [], alat: [] };
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/gas') { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => { let b = {}; try { b = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch (e) {} res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(gas(b.action))); }); return; }
  if (u === '/') { res.writeHead(302, { Location: '/index.html' }); res.end(); return; }
  fs.readFile(path.join(ROOT, u.replace(/^\//, '')), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'text/html' }); res.end(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}

/* Scan in-page: dipakai untuk UX-01/02/03. Kontras (UX-05) punya scan sendiri
 * karena butuh composite background berlapis. */
const SCAN = `(function(){
  function acc(el){
    if(el.getAttribute('aria-label'))return el.getAttribute('aria-label');
    if(el.getAttribute('aria-labelledby')){var t=document.getElementById(el.getAttribute('aria-labelledby'));if(t)return t.textContent.trim();}
    if(el.id){var l=document.querySelector('label[for="'+CSS.escape(el.id)+'"]');if(l)return l.textContent.trim();}
    var w=el.closest('label');if(w)return w.textContent.trim();
    if(el.title)return el.title;
    var t2=(el.textContent||'').trim();if(t2)return t2;
    return '';
  }
  var inter=Array.prototype.slice.call(document.querySelectorAll('button:not([disabled]),a[href],input:not([type=hidden]),select,[role=button],[role=tab]')).filter(function(el){
    var r=el.getBoundingClientRect(),cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||r.width<1||r.height<1)return false;
    /* PENTING: cek ANCESTOR juga. Versi pertama hanya memeriksa elemennya sendiri,
       sehingga ikut menghitung field di dalam #login-gate yang sudah .u-hide —
       elemen yang tidak terlihat operator mana pun. Itu false positive. */
    var p=el.parentElement,hidden=false;
    while(p&&p!==document.body){
      var pc=getComputedStyle(p);
      if(pc.display==='none'||pc.visibility==='hidden'||pc.opacity==='0'||p.classList.contains('u-hide')||p.hasAttribute('hidden')){hidden=true;break;}
      if(pc.pointerEvents==='none'&&pc.position==='fixed'){hidden=true;break;}
      p=p.parentElement;
    }
    if(hidden)return false;
    if(r.bottom<0||r.top>innerHeight)return false;
    return true;
  });
  /* Ukuran LAYOUT (offsetWidth/offsetHeight), bukan getBoundingClientRect.
   * Alasannya konkret: .btn:active punya transform:scale(.94) sehingga kotak
   * visualnya jadi 44 x 0.94 = 41px, padahal min-height:44px tetap berlaku.
   * Gate memakai kotak visual akan melaporkan tombol sehat sebagai pelanggaran
   * (terbukti di r2_ux_states A2). Yang menentukan jari bisa mengetuk adalah
   * ukuran layout. 2026-10-14 */
  /* Target EFEKTIF: kalau input dibungkus <label>, yang diketuk operator adalah
   seluruh label - bukan kotak input-nya. Checkbox 24x24 di dalam label 44px
   LULUS karena itu target sebenarnya; mengukur kotak input saja akan
   melaporkan pelanggaran yang tidak bisa diukai pengguna. 2026-10-14 */
  var small=inter.map(function(el){var r=el.getBoundingClientRect();var tgt=el.closest?el.closest('label'):null;if(!tgt)tgt=el;return {id:(el.id||String(el.className).split(' ')[0]||el.tagName),w:tgt.offsetWidth,h:tgt.offsetHeight,rect:Math.round(r.width)+'x'+Math.round(r.height)};})
               .filter(function(x){return x.w<44||x.h<44;});
  var noName=inter.filter(function(el){return !acc(el).trim();}).map(function(el){return (el.id||String(el.className).split(' ')[0]||el.tagName);});
  var tinyFont=[];
  document.querySelectorAll('*').forEach(function(el){
    if(el.children.length)return;var t=(el.textContent||'').trim();if(!t)return;
    var r=el.getBoundingClientRect();if(r.width<1||r.height<1)return;
    if(r.top>innerHeight||r.bottom<0||r.left>innerWidth||r.right<0)return;
    var cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')return;
    /* sama seperti filter target: jangan hitung teks di dalam ancestor tersembunyi */
    var p=el.parentElement,hid=false;
    while(p&&p!==document.body){
      var pc=getComputedStyle(p);
      if(pc.display==='none'||pc.visibility==='hidden'||parseFloat(pc.opacity)===0||p.classList.contains('u-hide')||p.hasAttribute('hidden')){hid=true;break;}
      p=p.parentElement;
    }
    if(hid)return;
    var fs=parseFloat(cs.fontSize);
    if(fs<12) tinyFont.push({t:t.slice(0,14),fs:fs,el:String(el.className||el.tagName).slice(0,30)});
  });
  var tabs=Array.prototype.slice.call(document.querySelectorAll('#main-tabnav [role=tab]'));
  var noSel=tabs.filter(function(el){return el.getAttribute('aria-selected')===null;}).map(function(el){return el.id;});
  var doc=document.documentElement;
  var trows=document.querySelectorAll('table tbody tr').length;
  return {interTotal:inter.length, tableRows:trows, small:small.slice(0,12), smallCount:small.length,
          noName:noName, tinyFont:tinyFont.slice(0,10), tinyFontCount:tinyFont.length,
          tabCount:tabs.length, tabsMissingAriaSelected:noSel,
          hOverflow:doc.scrollWidth-doc.clientWidth};
})()`;

const CONTRAST = `(function(){
  /* 2026-10-14: cache computed style per elemen. Tanpa ini effBg() memanggil
   * getComputedStyle untuk tiap elemen DAN tiap leluhurnya = O(n x kedalaman),
   * sekitar 50.000 panggilan yang memaksa style recalc. Scan melambat dari
   * <1 detik jadi LEBIH DARI 15 MENIT per kombinasi (terukur). */
  var CS=new Map();
  function cs(el){var v=CS.get(el);if(!v){v=getComputedStyle(el);CS.set(el,v);}return v;}
  function P(c){var m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;var p=m[1].split(',').map(parseFloat);return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
  function lin(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}
  function L(c){return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);}
  function over(fg,bg){return {r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1};}
  /* 2026-10-14 v2 - effBg sebelumnya salah dan menghasilkan rasio mustahil
   * (1.09:1 untuk teks gelap di atas latar terang).
   * PENYEBAB: background-image BODY ditulis sebagai SHORTHAND
   * (background: linear-gradient(...) + warna). Chrome menyertakan warnanya
   * sebagai stop terakhir, dan kode lama memperlakukan SEMUA stop gradien
   * sebagai lapisan background yang harus dikomposit -> hasil ngawur.
   * ATURAN BARU:
   *   1. naik sampai ketemu backgroundColor opaque - itu yang dipakai,
   *      gradien diabaikan (gradien pola garis 4% tidak mengubah warna dominan).
   *   2. baru kalau tidak ada warna opaque: pakai stop gradien yang opaque.
   *   3. cadangan terakhir: backgroundColor body, lalu putih.
   * Keterbatasan yang DISADARI: gradien pekat tumpang-tindih tidak dihitung.
   * Diterima karena tidak dapat disampel andal tanpa pixel, dan jauh lebih
   * akurat daripada mengarang komposit dari stop gradien. */
  function effBg(el){
    /* Urutan WAJIB benar, dan ini sumber dua regresi berturut-turut:
     *   - gradien yang punya stop OPAQUE paints DI ATAS background-color dan
     *     menutupi semua leluhurnya -> HARUS dihentikan di elemen itu.
     *     (Topbar navy, sheet header, tombol primary: teks putih di atasnya.
     *     Kalau naik terus ke body, teks putih jadi dihitung di atas krem
     *     -> 1.15:1, mustahil.)
     *   - gradien yang stop-nya TRANSPARAN (pola garis 4% milik body) tidak
     *     menutupi apa pun -> boleh lanjut ke background-color elemen itu.
     */
    var e=el, grad=null;
    while(e && e!==document.documentElement){
      var st=cs(e);
      if(st.backgroundImage && st.backgroundImage!=='none'){
        var stops=st.backgroundImage.match(/rgba?\\([^)]+\\)/g)||[];
        var opaque=null;
        for(var i=stops.length-1;i>=0;i--){var c=P(stops[i]);if(c&&c.a>=0.999){opaque=c;break;}}
        if(opaque) return opaque;          /* gradien pekat: berhenti di sini */
        if(!grad) grad=st.backgroundImage;
      }
      var b=P(st.backgroundColor);
      if(b && b.a>=0.999) return b;        /* warna opaque: juga menutupi leluhur */
      e=e.parentElement;
    }
    if(grad){
      var gs=grad.match(/rgba?\\([^)]+\\)/g)||[];
      for(var j=gs.length-1;j>=0;j--){var d=P(gs[j]);if(d&&d.a>=0.999)return d;}
    }
    var bs=P(cs(document.body).backgroundColor);
    if(bs&&bs.a>=0.999) return bs;
    return {r:255,g:255,b:255,a:1};
  }
  function hidden(el){var p=el.parentElement;while(p&&p!==document.body){var st=cs(p);if(st.display==='none'||st.visibility==='hidden'||parseFloat(st.opacity)===0||p.classList.contains('u-hide'))return true;p=p.parentElement;}return false;}
  /* Teks yang benar-benar disembunyikan dari pandangan TIDAK punya kewajiban
   * kontras. Tanpa pengecualian ini, .sr-only (1x1, clip rect(0px,0px,0px,0px))
   * dilaporkan gagal 1.5:1 - FALSE POSITIVE. WCAG 1.4.3 mengecualikan teks
   * yang tidak/presentationly disembunyikan. */
  function visuallyHidden(st){
    if(st.clip && /^rect\(0px, 0px, 0px, 0px\)/.test(st.clip))return true;
    return false;
  }
  var out=[];
  document.querySelectorAll('*').forEach(function(el){
    if(el.children.length)return;
    var txt=(el.textContent||'').trim();if(!txt)return;
    var r=el.getBoundingClientRect();if(r.width<1||r.height<1)return;
    if(r.top>innerHeight||r.bottom<0||r.left>innerWidth||r.right<0)return;
    var csx=cs(el);
    if(csx.visibility==='hidden'||csx.display==='none')return;
    if(parseFloat(csx.opacity)<0.05)return;
    if(visuallyHidden(csx))return;
    if(hidden(el))return;
    var fg=P(csx.color);if(!fg)return;
    var bg=effBg(el);if(!bg)return;
    var f=fg.a>=1?fg:over(fg,bg);
    var l1=L(f),l2=L(bg);
    var ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    var fs=parseFloat(csx.fontSize),bold=parseInt(csx.fontWeight,10)>=700;
    var need=(fs>=24||(fs>=18.66&&bold))?3:4.5;
    if(ratio<need) out.push({t:txt.slice(0,16),id:el.id||'',cls:String(el.className||el.tagName).slice(0,30),fs:fs,ratio:Math.round(ratio*100)/100,need:need});
  });
  var seen={},u=[];
  out.forEach(function(x){var k=(x.id||x.cls)+'|'+x.fs;if(!seen[k]){seen[k]=1;u.push(x);}});
  u.sort(function(a,b){return a.ratio-b.ratio;});
  return u;
})()`;

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(process.env.TEMP || 'C:\\Users\\lenov\\AppData\\Local\\Temp', 'rdi-uxg-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  try {
    let target = null;
    for (let i = 0; i < 40 && !target; i++) { await sleep(300); try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json(); const p = l.find(t => t.type === 'page'); if (p) target = p.webSocketDebuggerUrl; } catch (e) {} }
    if (!target) { t('CDP connect', false, 'tidak ada target'); process.exit(2); }
    ws = new WebSocket(target);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pend = new Map(); const exceptions = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; exceptions.push(((d.exception || {}).description || d.text || '').split('\n')[0]); } };
    const send = (me, pa) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
    /* 2026-10-14: batas waktu per evaluate. Tanpa ini satu dialog native yang
     * tidak tertekan akan menggantung SELURUH suite tanpa satu baris output -
     * persis yang terjadi pada probe eksplorasi (macet >17 menit). Timeout
     * membuat kegagalan terlihat sebagai FAIL, bukan sebagai kekal diam. */
    const ev = async (x, ms) => {
      const to = new Promise(res => setTimeout(() => res({ __timeout: true }), ms || 20000));
      const r = await Promise.race([send('Runtime.evaluate', { expression: x, returnByValue: true }), to]);
      if (r && r.__timeout) return { error: 'TIMEOUT ' + (ms || 20000) + 'ms' };
      if (r && r.result && r.result.exceptionDetails) return { error: (r.result.exceptionDetails.exception || {}).description };
      return r && r.result && r.result.result ? r.result.result.value : null;
    };
    await send('Page.enable'); await send('Runtime.enable');
    const APP = 'http://127.0.0.1:' + HTTP_PORT + '/index.html';

    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: APP });
    for (let i = 0; i < 90; i++) { if (await ev("typeof window.switchTab==='function'") === true) break; await sleep(300); }
    /* Seed sesi login. Versi pertama TIDAK melakukan ini -> aplikasi tetap di
       login gate, dan semua scan hanya melihat 10 elemen hampa. Gate yang hijau
       karena tidak mengukur apa pun = gate bohong. */
    const tok = Buffer.from(['h', 'n', String(Date.now() + 3600000), 'sig'].join('|')).toString('base64').replace(/=+$/, '') + '.sig';
    await ev("localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');localStorage.setItem('rdi_last_active',String(Date.now()));sessionStorage.setItem('rdi_viewer_token','" + tok + "');localStorage.setItem('rdi_viewer_token','" + tok + "');1");
    await send('Page.navigate', { url: APP });
    /* Netralkan dialog native. Di headless tidak ada yang menekan confirm(),
       dan dialog native memblokir eksekusi JS selamanya - bukan sekadar
       timeout. Dicegah lebih baik daripada waited lalu menggantung. */
    for (let i = 0; i < 20; i++) {
      await ev("(function(){try{window.confirm=function(){return true;};window.alert=function(){};window.prompt=function(){return '';};}catch(e){}return 1;})()");
      await sleep(300);
    }
    /* KNB: tunggu boot DENGAN sinyal yang benar. Versi pertama hanya menunggu
     * (window.allRows||[]).length === N; pada mesin yang lambat app sudah render
     * tapi data belum, sehingga BOOT gagal padahal tidak ada bug. */
    let boot = null;
    for (let i = 0; i < 200; i++) {
      const b = await ev("(function(){var s=document.getElementById('boot-splash');return {hid:!s||s.classList.contains('hide'),rs:document.readyState,fn:typeof window.switchTab==='function',rows:(window.allRows||[]).length};})()");
      if (b && !b.error && b.hid && b.rs === 'complete' && b.fn && b.rows === N) { boot = b; break; }
      await sleep(400);
    }
    t('BOOT: shell siap + data termuat', boot && boot.rows === N, JSON.stringify(boot));
    /* ANTI-VACUUM: gate yang hanya mengukur 10 elemen hampa itu tidak berguna.
       Minimal harus benar-benar melihat isi tabel. */
    const appState = await ev("(function(){var g=document.getElementById('login-gate');return {gateHidden:!!(g&&g.classList.contains('hide')),rows:(window.allRows||[]).length,trs:document.querySelectorAll('#section-master tbody tr, .inv-table tbody tr, table tbody tr').length,tabs:(document.querySelectorAll('#main-tabnav [role=tab]')||[]).length};})()");
    t('ANTI-VACUUM: app benar-benar DI DALAM (gate login tertutup, data ada)', appState && appState.gateHidden && appState.rows === N && appState.tabs >= 4 && appState.trs >= 5,
      JSON.stringify(appState));

    /* ---------- UX-02: teks < 12px ----------
     * Sekaligus mengukur CAKUPAN dan OVERFLOW per tab, karena keduanya tidak
     * bisa dipisahkan: menaikkan 52 node teks dari 11px ke 12px bisa membuat
     * tabel melebar dan memunculkan scroll horizontal di layar 390px.
     * Gate ini harus membuktikan dua-duanya, bukan salah satu. */
    const tabsToScan = ['dashboard', 'master', 'history', 'cetak', 'scanner', 'alert'];
    let tinyAll = [];
    const cover = [];   // cakupan per tab
    const overflow = []; // tab yang punya scroll horizontal
    for (const tab of tabsToScan) {
      await ev("window.switchTab('" + tab + "');'ok'"); await sleep(900);
      const sc = await ev(SCAN);
      if (!sc) { cover.push({ tab, inter: -1, rows: -1 }); continue; }
      cover.push({ tab: tab, inter: sc.interTotal, rows: sc.tableRows, ov: sc.hOverflow });
      if (sc.hOverflow > 0) overflow.push(tab + ' +' + sc.hOverflow + 'px');
      if (sc.tinyFontCount) tinyAll = tinyAll.concat(sc.tinyFont.map(x => Object.assign({ tab }, x)));
    }

    const totalInter = cover.reduce((a, x) => a + (x.inter > 0 ? x.inter : 0), 0);
    const totalRows = cover.reduce((a, x) => a + (x.rows > 0 ? x.rows : 0), 0);
    t('CAKUPAN: gate benar-benar mengukur isi app (bukan hampa)', totalInter >= 60 && totalRows >= 10,
      'interaktif=' + totalInter + ' baris-tabel=' + totalRows + ' :: ' + cover.map(x => x.tab + '=' + x.inter + '/' + x.rows).join(' '));
    t('TANPA SCROLL HORIZONTAL di 390px setelah teks dinaikkan ke 12px', overflow.length === 0,
      overflow.length ? overflow.join(', ') : '0 tab melebar');
    t('UX-02: TIDAK ADA teks < 12px di 6 tab (mobile 390px)', tinyAll.length === 0,
      tinyAll.length ? tinyAll.slice(0, 8).map(x => x.tab + ':' + x.fs + 'px "' + x.t + '" ' + x.el).join(' ;; ') : '0 elemen');

    /* ---------- UX-01: target sentuh ---------- */
    await ev("window.switchTab('master');'ok'"); await sleep(900);
    const m390 = await ev(SCAN);
    t('UX-01: TIDAK ADA target sentuh < 44px di mobile 390px', m390 && m390.smallCount === 0,
      m390 ? m390.smallCount + ' dari ' + m390.interTotal + (m390.small.length ? ' -> ' + m390.small.map(x => x.id + ' ' + x.w + 'x' + x.h).join(', ') : '') : 'scan gagal');

    /* ---------- UX-03: nama aksesibel ---------- */
    await ev("window.switchTab('aset');'ok'"); await sleep(1100);
    const aset = await ev(SCAN);
    t('UX-03: TIDAK ADA elemen interaktif tanpa nama aksesibel (tab Aset)', aset && aset.noName.length === 0,
      aset ? (aset.noName.length ? aset.noName.slice(0, 6).join(', ') : '0 dari ' + aset.interTotal + ' elemen') : 'scan gagal');
    const selNames = await ev(`(function(){
      return ['aset-tu-select-kode','aset-cp-select-kode'].map(function(id){
        var el=document.getElementById(id);
        if(!el)return{id:id,ok:false,why:'tidak ada'};
        var l=el.closest('label')||(el.id?document.querySelector('label[for="'+CSS.escape(el.id)+'"]'):null);
        var n=el.getAttribute('aria-label')||(l?l.textContent.trim():'');
        return {id:id,ok:!!n,name:n};
      });
    })()`);
    t('UX-03: 2 select Kode Alat punya nama aksesibel', selNames && selNames.every(x => x.ok),
      selNames ? selNames.map(x => x.id + '="' + (x.name || '(KOSONG)') + '"').join(', ') : '');

    /* ---------- UX-04: aria-selected ---------- */
    const aria = await ev(`(function(){
      var out=[];
      ['master','history','scanner','dashboard','more'].forEach(function(tb){
        try{ window.switchTab(tb); }catch(e){}
        var el=document.getElementById('tab-'+tb);
        if(!el){out.push({tab:tb,err:'tidak ada'});return;}
        out.push({tab:tb,sel:el.getAttribute('aria-selected'),active:el.classList.contains('active')});
      });
      return out;
    })()`);
    const badAria = aria && aria.filter(x => x.sel === null);
    t('UX-04: SETIAP tab punya aria-selected setelah switchTab()', aria && badAria.length === 0,
      aria ? aria.map(x => x.tab + '=' + x.sel).join(' ') : '');
    t('UX-04: tab aktif selalu aria-selected="true"', aria && aria.filter(x => x.active).every(x => x.sel === 'true'),
      aria ? 'aktif: ' + aria.filter(x => x.active).map(x => x.tab + '=' + x.sel).join(',') : '');

    /* ---------- UX-05: kontras ---------- */
    let cAll = [];
    for (const tab of ['dashboard', 'master', 'history', 'cetak']) {
      await ev("window.switchTab('" + tab + "');'ok'"); await sleep(1000);
      const c = await ev(CONTRAST);
      if (c) cAll = cAll.concat(c.map(x => Object.assign({ tab }, x)));
    }
    const seen = {}; const uniq = [];
    cAll.forEach(x => { const k = x.cls + '|' + x.fs; if (!seen[k]) { seen[k] = 1; uniq.push(x); } });
    uniq.sort((a, b) => a.ratio - b.ratio);
    t('UX-05: TIDAK ADA teks kecil gagal kontras AA (4 tab)', uniq.length === 0,
      uniq.length ? uniq.slice(0, 8).map(x => x.tab + ' ' + x.ratio + ':1 ' + x.fs + 'px ' + x.cls + ' "' + x.t + '"').join(' ;; ') : '0 elemen gagal');

    /* ---------- UX-05b: CAKUPAN KONTRAS (2026-10-14) ----------
     * Loop di atas hanya 4 tab / 1 viewport / 1 tema. Inventarisasi statis
     * menunjukkan 23 aturan CSS + 2 inline memakai amber-di-atas-amber-dim,
     * jadi sebagian besar TIDAK PERNAH diukur di sana. Contoh nyata yang
     * terlewat: #batchcart-count yang inline-style.
     * Diperluas ke 8 tab x 2 viewport x 2 tema. Hasil probe manual:
     * 33 kombinasi -> 0 kegagalan, jadi cakupan ini tidak menambah merah,
     * hanya menutup Lubang pengukuran.
     * CATATAN JUJUR: state hover/active dan sheet yang belum dibuka TIDAK
     * diukur di sini (banyak selector amber berukuran 0x0 di semua state
     * yang dipindai). Tidak boleh diklaim sudah terverifikasi. */
    const WIDE_TABS = ['dashboard', 'master', 'history', 'scanner', 'alert', 'aset', 'cetak', 'more'];
    const WIDE_VP = [{ w: 390, h: 844, tag: 'm390' }, { w: 1440, h: 900, tag: 'd1440' }];
    let wideFail = [], wideScans = 0;
    for (const vp of WIDE_VP) {
      await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.w < 700 });
      for (const theme of ['gelap', 'terang']) {
        await ev("(function(){document.body.classList.toggle('light'," + (theme === 'terang') + ");return 1;})()");
        for (const tb of WIDE_TABS) {
          await ev("window.switchTab('" + tb + "');'ok'"); await sleep(450);
          const c = await ev(CONTRAST, 30000);
          wideScans++;
          if (c && !c.error) for (const x of c) wideFail.push(Object.assign({ where: vp.tag + '/' + theme + '/' + tb }, x));
        }
      }
    }
    // kembalikan ke mobile + tema gelap supaya assert berikutnya tidak berubah
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await ev("document.body.classList.remove('light');'ok'");
    const wSeen = {}; const wUniq = [];
    wideFail.forEach(x => { const k = (x.id || x.cls) + '|' + x.fs; if (!wSeen[k]) { wSeen[k] = 1; wUniq.push(x); } });
    wUniq.sort((a, b) => a.ratio - b.ratio);
    t('UX-05b: kontras bersih di cakupan luas (' + wideScans + ' scan = 8 tab x 2 viewport x 2 tema)', wUniq.length === 0,
      wUniq.length ? wUniq.slice(0, 8).map(x => x.where + ' ' + x.ratio + ':1 ' + x.fs + 'px ' + (x.id || x.cls) + ' "' + x.t + '"').join(' ;; ') : '0 elemen gagal dari ' + wideScans + ' scan');

    /* ---------- kontrol: gate harus bisa mendeteksi ============ */
    const inject = await ev(`(function(){
      var s=document.createElement('style');
      s.id='ux05-probe'; s.textContent='.ux05-victim{color:#b45309;background:rgba(180,83,9,.12);font-size:12px;padding:2px 4px}';
      document.head.appendChild(s);
      var d=document.createElement('div'); d.className='ux05-victim'; d.id='ux05-victim-el'; d.textContent='probe';
      document.body.appendChild(d);
      var cs=getComputedStyle(d);
      return {fs:cs.fontSize,color:cs.color};
    })()`);
    const inj = await ev(CONTRAST);
    const caught = inj && inj.some(x => x.cls.indexOf('ux05-victim') >= 0);
    t('KONTROL: gate kontras menangkap injeksi teks 12px amber-di-atas-amber', caught,
      caught ? 'tertangkap (gate punya gigi)' : 'TIDAK TERTANGKAP - gate ini vacuous!');
    await ev("(function(){var s=document.getElementById('ux05-probe');if(s)s.remove();var e=document.getElementById('ux05-victim-el');if(e)e.remove();return 1;})()");

    t('NO PAGE EXCEPTION selama suite', exceptions.length === 0, 'exceptions=' + JSON.stringify(exceptions.slice(0, 3)));

    console.log('---- r2_ux_measured: ' + pass + ' PASS / ' + fail + ' FAIL ----');
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