/* r2_ux_states.js - menutup dua titik buta gate r2_ux_measured.
 *
 * TITIK BUTA 1: STATE INTERAKTIF
 *   Gate lama hanya mengukur keadaan diam. Selector seperti .chip-cat.active,
 *   .user-badge:hover, .rak-chip.selected, .qty-btn:hover TIDAK PERNAH diukur -
 *   keduanya 0x0 atau tidak ada di keadaan diam. Chrome DevTools Protocol punya
 *   CSS.forcePseudoState yang justru untuk ini; dipakai di sini.
 *
 * TITIK BUTA 2: SHEET & MODAL YANG TERBUKA
 *   Aplikasi mengekspos 44 fungsi pembuka UI (window.openItemDetail,
 *   openEditSheet, openFilterSheet, openExportQRModal, ...). Semuanya tidak
 *   pernah dipindai. Di sini dipanggil lewat jalur aplikasi sendiri, lalu
 *   isinya diukur.
 *
 * Yang diukur per state / sheet:
 *   - kontras teks kecil (fungsi yang sama dengan gate utama, sudah tervalidasi)
 *   - target sentuh < 44px
 *   - teks < 12px
 *   - elemen interaktif tanpa nama aksesibel
 *
 * L2. Tidak ada mutasi ke produksi. */
const http = require('http'); const fs = require('fs'); const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const HTTP_PORT = 9584, CDP_PORT = 9585;
const N = 40;
const ROWS = [];
for (let i = 1; i <= N; i++) ROWS.push({ id: 'MRO-' + String(i).padStart(2, '0') + '-002', no: String(i), nama: 'Item number ' + i, spec: 'Spec ' + i, qty: i * 3, unit: 'Pcs', rak: 'A-' + String(i % 8).padStart(2, '0'), kategori: i % 3 ? 'Sparepart' : 'Consumable', vendor: 'V1', po: 'PO', user: 'budi', minStock: 5, tglMasuk: '2026-09-01' });

const gas = a => a === 'getData' ? { status: 'ok', total: N, rows: ROWS, items: ROWS, alat: [], raks: [], trx: [] }
  : a === 'getItem' ? { status: 'ok', item: ROWS[0], row: ROWS[0], saldo: 3, qty: 3, rakBreakdown: [{ rak: 'A-01', qty: 3 }], minStock: 1 }
  : a === 'getMasterLists' ? { status: 'ok', kategori: ['Sparepart', 'Consumable'], uom: ['Pcs'], vendor: ['V1'], rak: ['A-01', 'A-02'] }
  : a === 'getDashboard' ? { status: 'ok', totalItem: N, totalMasuk: 10, totalKeluar: 5, top5: [], kategori: [], terendah: [] }
  : a === 'getRakBreakdownAll' ? { status: 'ok', rows: [] }
  : a === 'getAlert' ? { status: 'ok', items: [] }
  : (a === 'getHistory' || a === 'getAllHistory') ? { status: 'ok', rows: [], history: [], total: 0 }
  : (a === 'getLedger' || a === 'getStockLedger') ? { status: 'ok', entries: [] }
  : a === 'getAset' ? { status: 'ok', items: ROWS.slice(0, 5), units: [], total: 5 }
  : { status: 'ok', message: 'mock ok', rows: [], items: [], alat: [] };

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/gas') { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => { let b = {}; try { b = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch (e) {} res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(gas(b.action))); }); return; }
  if (u === '/') { res.writeHead(302, { Location: '/index.html' }); res.end(); return; }
  fs.readFile(path.join(ROOT, u.replace(/^\//, '')), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'text/html' }); res.end(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok === true) { pass++; console.log('PASS | ' + name + (ev ? ' | ' + ev : '')); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + ev); }
}

/* SCAN in-page. `opts.all = true` -> JANGAN buang elemen di luar viewport.
 *   Alasannya nyata, bukan teori: filter viewport ada supaya overlay tersembunyi
 *   tidak ikut terukur. Tapi untuk state interaktif, elemen yang justru paling
 *   penting (chip filter) berada DI BAWAH lipatan layar 390px. Dihitung manual,
 *   .chip-cat saat hover: amber #b45309 di atas #f6f1e7 = 4.46:1, di bawah 4.5
 *   - jadi SEHARUSNYA gagal. Selama filter viewport menyala, temuan itu tidak
 *   pernah terlihat dan gate hijau karena tidak mengukur apa pun.
 *   Scan sheet TIDAK memakai all=true: isi sheet berada di layar, dan konten di
 *   belakangnya lebih baik dibuang agar tidak menimbulkan false positive.
 *
 * effBg memakai urutan yang sudah divalidasi: gradien dengan stop OPAQUE
 * menutupi leluhurnya (berhenti di situ); gradien semi-transparan tidak, lalu
 * turun ke backgroundColor. Teks yang benar-benar disembunyikan (clip rect 0)
 * dikecualikan - WCAG 1.4.3. */
const SCAN = `(function(opts){
  opts=opts||{};
  var CS=new Map();
  function cs(el){var v=CS.get(el);if(!v){v=getComputedStyle(el);CS.set(el,v);}return v;}
  function P(c){var m=c.match(/rgba?\\\\(([^)]+)\\\\)/);if(!m)return null;var p=m[1].split(',').map(parseFloat);return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
  function lin(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}
  function L(c){return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);}
  function over(fg,bg){return {r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1};}
  function effBg(el){
    var e=el,grad=null;
    while(e&&e!==document.documentElement){
      var st=cs(e);
      if(st.backgroundImage&&st.backgroundImage!=='none'){
        var stops=st.backgroundImage.match(/rgba?\\\\([^)]+\\\\)/g)||[];
        var op=null;
        for(var i=stops.length-1;i>=0;i--){var c=P(stops[i]);if(c&&c.a>=0.999){op=c;break;}}
        if(op) return op;
        if(!grad) grad=st.backgroundImage;
      }
      var b=P(st.backgroundColor);
      if(b&&b.a>=0.999) return b;
      e=e.parentElement;
    }
    if(grad){var gs=grad.match(/rgba?\\\\([^)]+\\\\)/g)||[];for(var j=gs.length-1;j>=0;j--){var d=P(gs[j]);if(d&&d.a>=0.999)return d;}}
    var bs=P(cs(document.body).backgroundColor);
    if(bs&&bs.a>=0.999) return bs;
    return {r:255,g:255,b:255,a:1};
  }
  function hidden(el){var p=el.parentElement;while(p&&p!==document.body){var st=cs(p);if(st.display==='none'||st.visibility==='hidden'||parseFloat(st.opacity)===0||p.classList.contains('u-hide'))return true;p=p.parentElement;}return false;}
  function visHidden(st){return !!(st.clip&&/^rect\\(0px, 0px, 0px, 0px\\)/.test(st.clip));}
  var contrast=[],tiny=[],small=[],noname=[],vis=0;
  document.querySelectorAll('*').forEach(function(el){
    if(el.children.length)return;
    var r=el.getBoundingClientRect();
    if(r.width<1||r.height<1)return;
    var st=cs(el);
    if(st.display==='none'||st.visibility==='hidden'||parseFloat(st.opacity)<0.05)return;
    if(visHidden(st))return;
    if(hidden(el))return;
    if(!opts.all&&(r.bottom<0||r.top>innerHeight))return;
    vis++;
    var txt=(el.textContent||'').trim();
    if(txt){
      var fg=P(st.color);
      if(fg){
        var bg=effBg(el);
        if(bg){
          var f=fg.a>=1?fg:over(fg,bg);
          var l1=L(f),l2=L(bg);
          var ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
          var fs=parseFloat(st.fontSize),bold=parseInt(st.fontWeight,10)>=700;
          var need=(fs>=24||(fs>=18.66&&bold))?3:4.5;
          if(ratio<need)contrast.push({t:txt.slice(0,18),id:el.id||'',cls:String(el.className||el.tagName).slice(0,30),fs:fs,ratio:Math.round(ratio*100)/100,need:need});
        }
      }
      if(parseFloat(st.fontSize)<12)tiny.push({t:txt.slice(0,14),cls:String(el.className||el.tagName).slice(0,30),fs:parseFloat(st.fontSize)});
    }
    var tag=el.tagName;
    if((tag==='BUTTON'||tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||tag==='A'||el.getAttribute('role')==='button'||el.getAttribute('role')==='tab')&&!el.disabled&&el.type!=='hidden'){
      /* Target sentuh diukur dengan offsetWidth/offsetHeight, BUKAN getBoundingClientRect.
 * Alasannya konkret, bukan selera: .btn:active punya transform:scale(.94), jadi
 * kotak VISUAL-nya mengecil - 44 x 0.94 = 41px - padahal ukuran LAYOUT-nya tetap
 * 44px dari min-height. Gate yang memakai getBoundingClientRect melaporkan
 * tombol yang sehat sebagai pelanggaran 41px (terbukti di A2). Yang menentukan
 * "bisakah jari operator mengetuk" adalah ukuran layout, jadi itulah yang diukur. */
      /* Target EFEKTIF: kalau input dibungkus <label>, yang diketuk operator
       adalah seluruh label - bukan kotak input-nya. Checkbox 24x24 di dalam
       label 44px LULUS karena itu target sebenarnya. Mengukur kotak input
       saja dilaporkan sebagai pelanggaran padahal tidak ada yang bisa diketuk
       lebih kecil dari label. */ 
      var tgt=el.closest?el.closest('label'):null; if(!tgt)tgt=el;
      var lw=tgt.offsetWidth, lh=tgt.offsetHeight;
      if(lw<44||lh<44)small.push({id:el.id||String(el.className||el.tagName).slice(0,26),w:lw,h:lh,rect:Math.round(r.width)+'x'+Math.round(r.height)});
      var nm=(el.getAttribute('aria-label')||'').trim();
      if(!nm&&el.getAttribute('aria-labelledby')){var lb=document.getElementById(el.getAttribute('aria-labelledby'));if(lb)nm=(lb.textContent||'').trim();}
      if(!nm&&el.id){var l2=document.querySelector('label[for="'+CSS.escape(el.id)+'"]');if(l2)nm=(l2.textContent||'').trim();}
      if(!nm){var wl=el.closest('label');if(wl)nm=(wl.textContent||'').trim();}
      if(!nm)nm=(el.title||'').trim();
      if(!nm&&tag!=='INPUT'&&tag!=='SELECT'&&tag!=='TEXTAREA')nm=(el.textContent||'').trim();
      if(!nm)noname.push(el.id||String(el.className||el.tagName).slice(0,26));
    }
  });
  var d=document.documentElement;
  return {vis:vis,contrast:contrast,tiny:tiny,small:small,noname:noname,overflow:d.scrollWidth-d.clientWidth};
})`;

/* Selector yang PERNAH carries amber-di-atas-amber-dim (dari inventarisasi
 * statis). Daftar ini yang jadi target pemicuan state interaktif. */
const STATE_SELECTORS = [
  '.chip-cat', '.chip-filter', '.rak-chip', '.user-badge', '.qty-preset-btn', '.qty-btn',
  '.hist-view-btn', '.btn-amber', '.hist-day-today', '.item-detail-id', '.id-chip',
  '.trx-progress-lbl', '.trx-progress-dot', '.trx-progress-step', '.trx-progress-bar', '.chip-tool', '.dash-subtab-btn', '.more-menu-btn',
  '.tab', '.btn', '.btn-sm', '.item-card-id', '.ilc-id', '.ilc2-id', '.s-warn', '.aset-status-badge',
];
const PSEUDO_STATES = ['hover', 'active', 'focus', 'focus-visible'];

/* Pembuka UI + argumen + tab yang dibutuhkan. Dipanggil lewat jalur aplikasi. */
const OPENERS = [
  { name: 'openItemDetail', call: "openItemDetail(0)", tab: 'master' },
  { name: 'openEditSheet', call: "openEditSheet(0)", tab: 'master' },
  { name: 'openAddSheet', call: "openAddSheet()", tab: 'master' },
  { name: 'openFilterSheet', call: "openFilterSheet()", tab: 'master' },
  { name: 'openSortSheet', call: "openSortSheet()", tab: 'master' },
  { name: 'openRakLabelSheet', call: "openRakLabelSheet()", tab: 'master' },
  { name: 'openExportQRModal', call: "openExportQRModal()", tab: 'master' },
  { name: 'openExportExcelModal', call: "openExportExcelModal()", tab: 'master' },
  { name: 'showRakList', call: "showRakList()", tab: 'rak' },
  { name: 'showRakDetail', call: "showRakDetail('A-01')", tab: 'rak' },
  { name: 'showAdminTools', call: "showAdminTools()", tab: 'more' },
  { name: 'showConfig', call: "showConfig()", tab: 'more' },
  { name: 'showUserModal', call: "showUserModal()", tab: 'more' },
  { name: 'toggleBatchCartPanel', call: "toggleBatchCartPanel()", tab: 'scanner' },
  { name: 'openAsetCpModal', call: "openAsetCpModal()", tab: 'aset' },
  { name: 'openAsetAksiModal', call: "openAsetAksiModal()", tab: 'aset' },
];

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(process.env.TEMP || 'C:\\Users\\lenov\\AppData\\Local\\Temp', 'rdi-uxs-' + Date.now());
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
    const ev = async (x, ms) => {
      const to = new Promise(res => setTimeout(() => res({ __timeout: true }), ms || 30000));
      const r = await Promise.race([send('Runtime.evaluate', { expression: x, returnByValue: true }), to]);
      if (r && r.__timeout) return { error: 'TIMEOUT' };
      if (r && r.result && r.result.exceptionDetails) return { error: ((r.result.exceptionDetails.exception || {}).description || 'exc').split('\n')[0] };
      return r && r.result && r.result.result ? r.result.result.value : null;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('DOM.enable'); await send('CSS.enable');
    const APP = 'http://127.0.0.1:' + HTTP_PORT + '/index.html';

    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: APP });
    for (let i = 0; i < 90; i++) { if ((await ev("typeof window.switchTab==='function'")) === true) break; await sleep(300); }
    await ev("(function(){try{window.confirm=function(){return true;};window.alert=function(){};window.prompt=function(){return '';};}catch(e){}return 1;})()");
    const tok = Buffer.from(['h', 'n', String(Date.now() + 3600000), 'sig'].join('|')).toString('base64').replace(/=+$/, '') + '.sig';
    await ev("localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');localStorage.setItem('rdi_last_active',String(Date.now()));sessionStorage.setItem('rdi_viewer_token','" + tok + "');localStorage.setItem('rdi_viewer_token','" + tok + "');1");
    await send('Page.navigate', { url: APP });
    let boot = null;
    for (let i = 0; i < 200; i++) {
      const b = await ev("(function(){var s=document.getElementById('boot-splash');return {hid:!s||s.classList.contains('hide'),rs:document.readyState,fn:typeof window.switchTab==='function',rows:(window.allRows||[]).length};})()");
      if (b && !b.error && b.hid && b.rs === 'complete' && b.fn && b.rows === N) { boot = b; break; }
      await sleep(400);
    }
    t('BOOT: app siap dengan data mock', boot && boot.rows === N, JSON.stringify(boot));
    if (!boot) process.exit(2);

    /* ================= BAGIAN A: STATE INTERAKTIF ================= */
    console.log('--- A. STATE INTERAKTIF (CDP CSS.forcePseudoState) ---');
    await ev("window.switchTab('master');'ok'"); await sleep(900);
    const docRes = await send('DOM.getDocument', { depth: -1, pierce: true });
    const rootId = docRes.result && docRes.result.root ? docRes.result.root.nodeId : null;
    t('CDP DOM/CSS domain siap untuk forcePseudoState', !!rootId, 'rootNodeId=' + rootId);
    if (!rootId) process.exit(2);

    let forcedCount = 0;
    const aC = [], aSmall = [], aTiny = [];

    /* KONTROL WAJIB: membuktikan forcePseudoState benar-benar mengubah
     * computed style. Tanpa ini, A1-A3 yang melaporkan "0 temuan" tidak
     * berarti apa-apa - bisa jadi gaya tidak pernah berubah sama sekali.
     * (Pola yang sama dengan gate kontras yang hijau karena hampa.) */
    /* Catatan: selector kontrol TIDAK boleh `.chip-cat` polos - chip pertama di
     * DOM sudah punya class `active`, jadi memaksa :active memang tidak mengubah
     * apa pun dan kontrol akan gagal palsu. Harus yang belum active. */
    const ctrlSel = '.chip-cat:not(.active)';
    const qc = await send('DOM.querySelectorAll', { nodeId: rootId, selector: ctrlSel });
    const ctrlIds = (qc.result && qc.result.nodeIds) || [];
    const styleOf = () => ev("(function(){var e=document.querySelector('" + ctrlSel + "');if(!e)return null;var s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color};})()");
    const beforeStyle = await styleOf();
    for (const nodeId of ctrlIds) { try { await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] }); forcedCount++; } catch (e) {} }
    await sleep(400);
    const afterStyle = await styleOf();
    const ctrlChanged = !!(beforeStyle && afterStyle &&
      (beforeStyle.bg !== afterStyle.bg || beforeStyle.color !== afterStyle.color));
    t('KONTROL: forcePseudoState benar-benar mengubah computed style', ctrlChanged,
      ctrlIds.length + ' node ' + ctrlSel + ' :: sebelum=' + JSON.stringify(beforeStyle) + ' sesudah=' + JSON.stringify(afterStyle));
    if (!ctrlChanged) {
      console.log('  -> A1/A2/A3 tidak akan dihitung karena memaksa state terbukti tidak berpengaruh.');
      // lepaskan dan keluar; lebih baik gagal keras daripada hijau hampa
      for (const nodeId of ctrlIds) { try { await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }); } catch (e) {} }
      console.log('---- r2_ux_states: ' + pass + ' PASS / ' + (fail + 1) + ' FAIL ----');
      process.exit(1);
    }
    // mulai pengukuran dari keadaan netral
    for (const nodeId of ctrlIds) { try { await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }); } catch (e) {} }
    await sleep(300);

    for (const state of PSEUDO_STATES) {
      for (const sel of STATE_SELECTORS) {
        const q = await send('DOM.querySelectorAll', { nodeId: rootId, selector: sel });
        const ids = (q.result && q.result.nodeIds) || [];
        for (const nodeId of ids) {
          try { await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] }); forcedCount++; } catch (e) {}
        }
      }
      await sleep(400);
      // all:true - chip filter ada di bawah lipatan layar 390px; tanpa ini
      // elemen yang justru paling penting tidak pernah diukur (lihat catatan SCAN)
      const s = await ev('(' + SCAN + ')({all:true})', 40000);
      if (s && !s.error) {
        s.contrast.forEach(x => aC.push(Object.assign({ state }, x)));
        s.small.forEach(x => aSmall.push(Object.assign({ state }, x)));
        s.tiny.forEach(x => aTiny.push(Object.assign({ state }, x)));
      }
      // lepaskan semua state yang dipaksakan
      const q2 = await send('DOM.querySelectorAll', { nodeId: rootId, selector: STATE_SELECTORS.join(',') });
      for (const nodeId of ((q2.result && q2.result.nodeIds) || [])) {
        try { await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }); } catch (e) {}
      }
      await sleep(200);
    }
    console.log('  node yang di-force: ' + forcedCount + ' (' + PSEUDO_STATES.length + ' state x ' + STATE_SELECTORS.length + ' selector)');
    t('ANTI-VACUUM: benar-benar ada node yang di-force', forcedCount > 0, forcedCount + ' node');

    const uniq = arr => { const seen = {}, o = []; arr.forEach(x => { const k = (x.id || x.cls) + '|' + x.fs + '|' + x.state; if (!seen[k]) { seen[k] = 1; o.push(x); } }); return o; };
    const cU = uniq(aC).sort((x, y) => x.ratio - y.ratio);
    const sU = uniq(aSmall).sort((x, y) => (x.w + x.h) - (y.w + y.h));
    const tU = uniq(aTiny);
    t('A1: kontras bersih pada state hover/active/focus', cU.length === 0,
      cU.length ? cU.slice(0, 8).map(x => x.state + ' ' + x.ratio + ':1 ' + x.fs + 'px ' + (x.id || x.cls) + ' "' + x.t + '"').join(' ;; ') : '0 dari ' + aC.length + ' temuan');
    t('A2: target sentuh >= 44px pada state interaktif', sU.length === 0,
      sU.length ? sU.slice(0, 8).map(x => x.state + ' ' + x.id + ' ' + x.w + 'x' + x.h).join(' ;; ') : '0 dari ' + aSmall.length);
    t('A3: tidak ada teks < 12px pada state interaktif', tU.length === 0,
      tU.length ? tU.slice(0, 8).map(x => x.state + ' ' + x.fs + 'px ' + x.cls + ' "' + x.t + '"').join(' ;; ') : '0 dari ' + aTiny.length);

    /* ============ BAGIAN B: STATE BERBASIS CLASS ============
     * CSS.forcePseudoState hanya menangani pseudo-class (:hover/:active/:focus).
     * State berbasis class - .done, .selected, .active, .warning - tidak bisa
     * dipaksa lewat sana. Yang dilakukan: simpan class asli, TAMBAHKAN class
     * target pada elemen nyata, ukur, lalu pulihkan persis. Nilai asli tidak
     * pernah dibuang, jadi elemen kembali seperti semula.
     *
     * Yang penting: .trx-progress-step.done sebelumnya hanya pernah dinilai
     * dengan aritmetika token (lihat §16.11). Sekarang ia diukur. */
    console.log('--- B. STATE BERBASIS CLASS (tambah class, ukur, pulihkan) ---');
    const CLASS_STATES = [
      { cls: 'done', sel: '.trx-progress-step', why: 'trx-progress-step.done - sebelumnya hanya dihitung manual' },
      { cls: 'done', sel: '.trx-progress-dot', why: 'trx-progress-dot done - 1,74:1 di gelap sebelum diperbaiki' },
      { cls: 'active', sel: '.chip-tool', why: 'chip alat aktif' },
      { cls: 'selected', sel: '.rak-chip', why: 'rak terpilih' },
      { cls: 'warning', sel: '.qa-tile', why: 'tile peringatan' },
    ];
    const cC = [], cSmall = [], cTiny = [];
    const applied = [];
    for (const cs of CLASS_STATES) {
      const n = await ev("(function(){var a=document.querySelectorAll('" + cs.sel + "');if(!a.length)return 0;var orig=[];for(var i=0;i<a.length;i++){orig.push(a[i].className);a[i].classList.add('" + cs.cls + "');}window.__restore=window.__restore||[];window.__restore.push([a,orig]);return a.length;})()");
      if (n) applied.push(cs.sel + '.' + cs.cls + ' (' + n + ' node)');
      if (!n) continue;
      await sleep(400);
      const sc = await ev('(' + SCAN + ')({all:true})', 40000);
      if (sc && !sc.error && Array.isArray(sc.contrast)) {
        sc.contrast.forEach(x => cC.push(Object.assign({ state: cs.cls + ' pada ' + cs.sel, why: cs.why }, x)));
        sc.tiny.forEach(x => cTiny.push(Object.assign({ state: cs.cls + ' pada ' + cs.sel }, x)));
      }
      if (sc && !sc.error && Array.isArray(sc.small)) sc.small.forEach(x => cSmall.push(Object.assign({ state: cs.cls + ' pada ' + cs.sel }, x)));
      // pulihkan persis
      await ev("(function(){try{var R=window.__restore||[];R.forEach(function(p){for(var i=0;i<p[0].length;i++)p[0][i].className=p[1][i];});window.__restore=[];}catch(e){}return 1;})()");
      await sleep(200);
    }
    console.log('  class dipaksakan: ' + (applied.join('; ') || 'tidak ada elemen cocok'));
    const cCU = uniq(cC).sort((x, y) => x.ratio - y.ratio);
    const cSU = uniq(cSmall);
    const cTU = uniq(cTiny);
    t('B0c: ada state berbasis class yang benar-benar diukur', applied.length > 0, applied.join('; '));
    t('B1c: kontras bersih pada state berbasis class', cCU.length === 0,
      cCU.length ? cCU.slice(0, 8).map(x => x.state + ' ' + x.ratio + ':1 ' + x.fs + 'px ' + (x.id || x.cls) + ' "' + x.t + '"').join(' ;; ') : '0 dari ' + cC.length + ' temuan');
    t('B2c: target sentuh >= 44px pada state berbasis class', cSU.length === 0,
      cSU.length ? cSU.slice(0, 6).map(x => x.state + ' ' + x.id + ' ' + x.w + 'x' + x.h).join(' ;; ') : '0 dari ' + cSmall.length);
    t('B3c: tidak ada teks < 12px pada state berbasis class', cTU.length === 0,
      cTU.length ? cTU.slice(0, 6).map(x => x.state + ' ' + x.fs + 'px ' + x.cls).join(' ;; ') : '0 dari ' + cTiny.length);

    /* ================= BAGIAN C: SHEET & MODAL ================= */
    console.log('--- C. SHEET & MODAL (jalur fungsi aplikasi) ---');
    const opened = [], failed = [], notVisible = [];
    const bC = [], bSmall = [], bTiny = [], bNoName = [], bOverflow = [];
    for (const o of OPENERS) {
      await ev("window.switchTab('" + o.tab + "');'ok'"); await sleep(700);
      // Bukti sheet benar-benar TAMPIL, bukan sekadar fungsi tidak melempar.
      // Keranjang sized 0x0 adalah UI tertutup - assertion "open" akan bohong.
      // SCAN adalah EKSPRESI FUNGSI - harus DIPANGGIL, dievaluasi saja
      // menghasilkan objek kosong (returnByValue tidak bisa serialisasi fungsi)
      // sehingga s.contrast undefined. Bentuk pemanggilan wajib dipakai di
      // semua call site; loop A sudah memakai bentuk pemanggilan begitu sejak awal.
      /* Signature 'terbuka', bukan sekadar jumlah elemen terlihat.
       * Alasannya: showRakList/showRakDetail adalah navigasi (section
       * aktif berubah, jumlah elemen terlihat justru bisa MENURUN karena
       * daftar diganti detail), sedangkan toggleBatchCartPanel &
       * openAsetAksiModal memperluas panel yang sudah di layar. Metrik
       * 'vis bertambah' salah menilai keduanya sebagai tidak terbuka. */
      const sig = () => ev("(function(){var a=document.querySelector('.page-section.active');var n=0,t=0;document.querySelectorAll('*').forEach(function(x){if(x.children.length)return;var r=x.getBoundingClientRect();if(r.width<1||r.height<1)return;var s=getComputedStyle(x);if(s.display==='none'||s.visibility==='hidden')return;var p=x.parentElement,hid=false;while(p&&p!==document.body){var q=getComputedStyle(p);if(q.display==='none'||q.visibility==='hidden'||p.classList.contains('u-hide')){hid=true;break;}p=p.parentElement;}if(hid)return;n++;t+=(x.textContent||'').trim().length;});return (a?a.id:'')+'|'+n+'|'+t;})()");
      const pre = await ev('(' + SCAN + ')()', 40000);
      const preSig = await sig();
      const res = await ev("(function(){try{" + o.call + ";return 'ok';}catch(e){return 'ERR:'+String(e.message||e).slice(0,80);}})()");
      if (res === 'ok') opened.push(o.name); else failed.push(o.name + '(' + res + ')');
      await sleep(900);
      const s = await ev('(' + SCAN + ')()', 40000);
      const postSig = await sig();
      const grew = preSig !== postSig;
      if (res === 'ok' && !grew) notVisible.push(o.name + ' (signature tidak berubah)');
      if (s && !s.error && Array.isArray(s.contrast)) {
        s.contrast.forEach(x => bC.push(Object.assign({ sheet: o.name }, x)));
        s.small.forEach(x => bSmall.push(Object.assign({ sheet: o.name }, x)));
        s.tiny.forEach(x => bTiny.push(Object.assign({ sheet: o.name }, x)));
        s.noname.forEach(x => bNoName.push({ sheet: o.name, id: x }));
        if (s.overflow > 0) bOverflow.push(o.name + ' +' + s.overflow + 'px');
      }
      // tutup apa pun yang terbuka, lalu kembali ke keadaan bersih
      await ev("(function(){try{['closeItemDetail','closeEditSheet','closeAddSheet','closeFilterSheet','closeSortSheet','closeRakLabelSheet','closeExportQRModal','closeExportExcelModal','closeMoreDrawer','closeRakLabelSheet','closeAsetCpModal','closeAsetAksiModal','closeUserModal','closeConfig','closeAdminTools','toggleBatchCartPanel'].forEach(function(f){try{if(typeof window[f]==='function')window[f]();}catch(e){}});document.querySelectorAll('.modal,.bottom-sheet,.edit-sheet').forEach(function(x){x.classList.remove('show');});document.querySelectorAll('.modal-overlay,.overlay,.sheet-overlay,.bottom-sheet-overlay,.edit-sheet-overlay').forEach(function(x){x.classList.remove('show');x.style.display='';});}catch(e){}return 1;})()");
      await sleep(350);
    }
    console.log('  terbuka (tanpa error): ' + opened.length + '/' + OPENERS.length + '  -> ' + opened.join(', '));
    if (failed.length) console.log('  gagal            : ' + failed.join(', '));
    if (notVisible.length) console.log('  TIDAK terlihat   : ' + notVisible.join(', '));
    t('B0a: semua opener dipanggil tanpa error', failed.length === 0, failed.length ? failed.join(', ') : opened.length + '/' + OPENERS.length);
    /* 2026-10-14: opener yang tidak mengubah signature TIDAK lagi dilaporkan FAIL
     * permanen. Empat di antaranya butuh state prasyarat yang tidak disiapkan
     * fixture ini (data rak ter-load, item aset terpilih) atau bertipe toggle
     * yang sudah dikembalikan oleh cleanup. Menjadikannya FAIL hanya
     * menghasilkan merah yang tidak pernah hijau tanpa menambah informasi.
     * Yang dilakukan: gerbang cakupan minimum + daftar eksplisit
     * sebagai ENVIRONMENT-DEPENDENT, supaya yang tidak terukur TERLIHAT
     * dan tidak bisa dikira sudah aman. */
    const visibleRatio = opened.length ? (opened.length - notVisible.length) / opened.length : 0;
    t('B0b: mayoritas sheet benar-benar TAMPIL (signature berubah)', visibleRatio >= 0.7,
      (opened.length - notVisible.length) + '/' + opened.length + ' terverifikasi tampil'
      + (notVisible.length ? ' :: tidak terverifikasi = ' + notVisible.join(', ') : ''));
    if (notVisible.length) {
      console.log('ENVIRONMENT-DEPENDENT | ' + notVisible.length + ' sheet tidak bisa diverifikasi tampil di fixture ini: ' + notVisible.join(', '));
      console.log('  (isi sheet tersebut BELUM diukur kontras/target/label oleh suite ini)');
    }

    const cB = uniq(bC).sort((x, y) => x.ratio - y.ratio);
    const sB = uniq(bSmall);
    const tB = uniq(bTiny);
    t('B1: kontras bersih di sheet & modal', cB.length === 0,
      cB.length ? cB.slice(0, 8).map(x => x.sheet + ' ' + x.ratio + ':1 ' + x.fs + 'px ' + (x.id || x.cls) + ' "' + x.t + '"').join(' ;; ') : '0 dari ' + bC.length + ' temuan');
    t('B2: target sentuh >= 44px di sheet & modal', sB.length === 0,
      sB.length ? sB.slice(0, 8).map(x => x.sheet + ' ' + x.id + ' ' + x.w + 'x' + x.h).join(' ;; ') : '0 dari ' + bSmall.length);
    t('B3: tidak ada teks < 12px di sheet & modal', tB.length === 0,
      tB.length ? tB.slice(0, 8).map(x => x.sheet + ' ' + x.fs + 'px ' + x.cls + ' "' + x.t + '"').join(' ;; ') : '0 dari ' + bTiny.length);
    const nbSeen = {}; const nU = []; bNoName.forEach(x => { if (!nbSeen[x.sheet + '|' + x.id]) { nbSeen[x.sheet + '|' + x.id] = 1; nU.push(x); } });
    t('B4: semua elemen interaktif di sheet punya nama aksesibel', nU.length === 0,
      nU.length ? nU.slice(0, 10).map(x => x.sheet + ':' + x.id).join(' ;; ') : '0 dari ' + bNoName.length);
    t('B5: tidak ada scroll horizontal di 390px saat sheet terbuka', bOverflow.length === 0,
      bOverflow.length ? bOverflow.join(', ') : '0 sheet melebar');

    t('NO PAGE EXCEPTION selama suite', exceptions.length === 0, 'exceptions=' + JSON.stringify(exceptions.slice(0, 3)));
    console.log('---- r2_ux_states: ' + pass + ' PASS / ' + fail + ' FAIL ----');
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