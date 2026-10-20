/* tools/cetak_perf_probe.js — L2/CDP: ukur biaya main-thread menu Cetak (bertahap).
 * Pakai: node tests/tools/cetak_perf_probe.js [tag] [rows]
 * Output: tests/results/cetak_perf_<tag>.json (ditulis per tahap, tahan hang)
 * Catatan: tahap S2C/S3b memakai STUB qrcode (ukur biaya non-QR); QR asli diukur di S2/S2B/S2D/S3d.
 */
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const HTTP_PORT = 9477, CDP_PORT = 9478;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = 'C:\\Users\\lenov\\AppData\\Local\\Temp\\opencode\\cdp-cetakperf-' + Date.now();
const DL_DIR = PROFILE + '\\dl';
const TAG = process.argv[2] || 'run';
const ROWS = parseInt(process.argv[3] || '3000', 10);
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT_FILE = path.join(ROOT, 'tests', 'results', 'cetak_perf_' + TAG + '.json');
const RES = { tag: TAG, rows: ROWS, started: new Date().toISOString(), provenance: {}, beats: [], stages: {} };

function save() { fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true }); fs.writeFileSync(OUT_FILE, JSON.stringify(RES, null, 2)); }
function fileHash(p) { try { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex') + ' / ' + fs.statSync(p).size + 'B'; } catch (e) { return 'ERR ' + e.message; } }
function provenance() {
  const o = {};
  for (const f of ['index.html', 'js/cetak.js', 'js/util.js', 'js/jspdf.min.js', 'js/html2pdf.bundle.min.js', 'qrcode.min.js']) o[f] = fileHash(path.join(ROOT, f));
  return o;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject);
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
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); p.resolve(msg); }
  });
  ws.addEventListener('close', () => {
    for (const [, p] of pending) { try { p.resolve({ error: { message: 'BROWSER_DEAD' } }); } catch (e) {} }
    pending.clear();
  });
  function send(method, params = {}, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve });
      try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { pending.delete(i); reject(e); return; }
      setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error('timeout ' + method)); } }, timeoutMs);
    });
  }
  return { send, close: () => ws.close() };
}

function mockRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: 'MRO-' + String(i).padStart(2, '0') + '-X-' + String(i).padStart(4, '0'),
      nama: 'Item contoh ' + i + ' nama agak panjang untuk uji render',
      spec: 'spec ' + i + ' 25mm x 15m',
      rak: i < 10 ? 'GRPX-A' : (i < 100 ? 'GRPY-B' : (i < 124 ? 'GRPZ-C' : 'R' + (i % 9 + 1) + '-' + String(i % 40).padStart(2, '0'))),
      qty: i % 250, unit: 'Pcs', user: 'WH', bc: i % 3 === 0 ? 'BC' : 'Non BC', kategori: 'MRO'
    });
  }
  return rows;
}

const DEFS = `(function(){
  window.__ck=[];
  window.P={};
  var P=window.P;
  P.ck=function(s){window.__ck.push(s);try{fetch('/beat?c='+encodeURIComponent(s),{mode:'no-cors'}).catch(function(){});}catch(e){}};
  P.now=function(){return performance.now();};
  P.r1=function(x){return Math.round(x*10)/10;};
  P.hash=function(s){var h=5381;for(var i=0;i<s.length;i++)h=((h*33)^s.charCodeAt(i))>>>0;return h.toString(16);};
  P.pages=function(html){return (html.match(/class="page/g)||[]).length;};
  P.imgs=function(html){return (html.match(/<img /g)||[]).length;};
  P.struct=function(html){return String(html).replace(/src="data:image\\/[a-z]+;base64,[^"]*"/g,'src="QR"');};
  P.paint=function(fn){return new Promise(function(res){var t=P.now();fn();requestAnimationFrame(function(){requestAnimationFrame(function(){res(P.now()-t);});});});};
  P.sync=function(fn){var t=P.now();var v=fn();return {ms:P.r1(P.now()-t),val:v};};
  P.checked=function(){return document.querySelectorAll('#cetak-item-list .cetak-item-cb:checked').length;};
  P.sel=function(q){var el=document.getElementById('cetak-search');el.value=q;renderCetakList();cetakClearAll();cetakSelectAll();var n=P.checked();el.value='';return n;};
  P.stubQr=function(){if(!P.qrReal)P.qrReal=window.qrcode;window.qrcode=function(){return {addData:function(){},make:function(){},createDataURL:function(){return 'data:image/png;base64,STUB';}};};};
  P.unstubQr=function(){if(P.qrReal)window.qrcode=P.qrReal;};
  P.mkFake=function(){
    function mkEl(){var el={_h:'',style:{},dataset:{},
      insertAdjacentHTML:function(p,h){el._h+=h;window.__cap.html+=h;},
      appendChild:function(){},remove:function(){},setAttribute:function(){},getAttribute:function(){return null;},
      querySelector:function(){return null;},addEventListener:function(){},
      get innerHTML(){return el._h;},set innerHTML(v){el._h=v;window.__cap.html+=v;},
      get textContent(){return el._h;},set textContent(v){el._h=v;window.__cap.txt=v;}
    };return el;}
    var els={};
    var doc={write:function(s){window.__cap.html+=s;},close:function(){window.__cap.docClosed=true;},
      getElementById:function(id){if(!els[id])els[id]=mkEl();return els[id];},
      createElement:function(){window.__cap.created=(window.__cap.created||0)+1;return mkEl();},head:mkEl(),body:mkEl()};
    var win={document:doc,close:function(){window.__cap.closed=true;},focus:function(){},print:function(){window.__cap.printed=true;}};
    Object.defineProperty(win,'closed',{get:function(){return !!window.__cap.closed;}});
    return win;
  };
  P.flow=async function(q,call,opt){
    if(typeof opt==='number')opt={pages:opt};opt=opt||{};
    var n=P.sel(q);
    window.__cap={html:'',closed:false,docClosed:false,printed:false,error:null,txt:'',created:0};
    var beats=0,stop=false;
    (function loop(){if(stop)return;beats++;requestAnimationFrame(loop);})();
    var openOrig=window.open;
    window.open=function(){return P.mkFake();};
    var t=P.now(),threw=null;
    try{call();}catch(e){threw=String(e&&e.message||e);}
    var growth=0,lastLen=0,doneAt=null;
    for(var k=0;k<600;k++){
      if(!opt.pages&&!opt.until&&window.__cap.closed)break;
      if(window.__cap.html.length>lastLen){growth++;lastLen=window.__cap.html.length;}
      var ok=false;
      if(opt.pages&&P.pages(window.__cap.html)>=opt.pages)ok=true;
      if(opt.until){try{if(opt.until())ok=true;}catch(e){}}
      if(ok&&doneAt===null)doneAt=P.now();
      if(doneAt!==null&&P.now()-doneAt>300)break;
      await new Promise(function(r){setTimeout(r,50);});}
    stop=true;window.open=openOrig;
    return {sel:n,ms:P.r1(P.now()-t),ms_to_done:doneAt?P.r1(doneAt-t):null,beats:beats,growth_steps:growth,kb:Math.round((window.__cap.html||'').length/1024),
      pages:P.pages(window.__cap.html||''),closed:!!window.__cap.closed,docClosed:!!window.__cap.docClosed,printed:!!window.__cap.printed,
      created:window.__cap.created||0,txt:(window.__cap.txt||'').slice(0,90),error:threw||window.__cap.error};
  };
  P.race=function(p,ms){return Promise.race([p,new Promise(function(r){setTimeout(function(){r({__timeout:ms});},ms);})]);};
  P.mount=function(itemsOrHtml){var html=(typeof itemsOrHtml==='string')?itemsOrHtml:buildPrintHTML(itemsOrHtml,'download','A4');
    var wrap=document.createElement('div');wrap.style.position='fixed';wrap.style.left='-99999px';wrap.style.top='0';
    var tmp=document.createElement('div');tmp.innerHTML=html;
    while(tmp.firstChild)wrap.appendChild(tmp.firstChild);document.body.appendChild(wrap);return wrap;};
  P.opt=function(pSize,orient){return {margin:0,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true,logging:false},jsPDF:{unit:'mm',format:String(pSize||'a4').toLowerCase(),orientation:orient||'portrait'}};};
  return 'defs-ok';
})()`;

/* S1: daftar + klik centang + pilih semua (DOM), termasuk cap 100 + "Tampilkan semua" */
const S1 = `(async function(){var out={};P.ck('s1-mulai');
  switchTab('cetak');var t0=P.now();renderCetakList();out.render_ms=P.r1(P.now()-t0);P.ck('s1-render');
  out.cap=document.querySelectorAll('#cetak-item-list .cetak-item-row').length;
  out.dom_rows=out.cap;
  out.list_kb=Math.round(((document.getElementById('cetak-item-list')||{}).innerHTML||'').length/1024);
  out.has_data_idx=document.querySelectorAll('#cetak-item-list .cetak-item-row[data-idx]').length;
  var mb=document.querySelector('#cetak-item-list button[onclick="cetakShowAllRows()"]');
  out.more_btn=!!mb;out.more_txt=mb?mb.textContent:null;
  cetakClearAll();P.ck('s1-clearall');
  out.n_cb=document.querySelectorAll('#cetak-item-list .cetak-item-cb').length;out.click_ms=[];
  async function clickAt(idx){var cbs=document.querySelectorAll('#cetak-item-list .cetak-item-cb');var cb=cbs[idx];if(!cb)return null;
    var row=cb.closest('.cetak-item-row');if(row)row.setAttribute('data-probe','keep');
    var ms=P.r1(await P.paint(function(){cb.click();}));P.ck('s1-klik-'+idx);
    var still=document.querySelector('#cetak-item-list .cetak-item-row[data-probe="keep"]');
    if(still)still.removeAttribute('data-probe');
    return {i:idx,ms:ms,row_kept:!!still};}
  var probes=[1,50,99];for(var pi=0;pi<probes.length;pi++){var r1=await clickAt(probes[pi]);if(r1)out.click_ms.push(r1);}
  out.dom_checked=P.checked();
  cetakClearAll();var sac=P.r1(await P.paint(function(){cetakSelectAll();}));out.selectall_capped_ms=sac;out.selected_all_capped=P.checked();var nb=document.getElementById('cetak-pdf-banner');out.selectall_notice=nb?nb.textContent:null;P.ck('s1-selectall-capped');
  cetakClearAll();
  var t1=P.now();cetakShowAllRows();out.showall_ms=P.r1(P.now()-t1);P.ck('s1-showall');
  out.dom_rows_all=document.querySelectorAll('#cetak-item-list .cetak-item-row').length;
  out.has_data_idx_all=document.querySelectorAll('#cetak-item-list .cetak-item-row[data-idx]').length;
  out.more_btn_after=!!document.querySelector('#cetak-item-list button[onclick="cetakShowAllRows()"]');
  cetakClearAll();
  var probes2=[1000,2999];for(var pj=0;pj<probes2.length;pj++){var r2=await clickAt(probes2[pj]);if(r2)out.click_ms.push(r2);}
  out.dom_checked_all=P.checked();
  cetakClearAll();var sa=P.r1(await P.paint(function(){cetakSelectAll();}));out.selectall_ms=sa;out.selected_all=P.checked();out.selected_all_expanded=P.checked();P.ck('s1-selectall');
  cetakClearAll();renderCetakList();P.ck('s1-selesai');return out;})()`;

/* S2: kurva biaya QR asli (px kecil) + dimensi citra */
const S2 = `(async function(){var out={};P.ck('s2-mulai');
  var payload='MRO-00-X-0000|Item contoh 0 nama agak panjang untuk uji render|GRPX-A';
  out.payload_len=payload.length;
  function imgSize(src){return new Promise(function(res){var im=new Image();im.onload=function(){res({w:im.naturalWidth,h:im.naturalHeight});};im.onerror=function(){res({err:1});};im.src=src;});}
  out.qr=[];
  var sizes=[4,10,40];
  for(var si=0;si<sizes.length;si++){var sz=sizes[si];var t=P.now();var src=null,err=null;
    try{src=qrImgSrc(payload,sz);}catch(e){err=String(e&&e.message||e);}
    var ms=P.r1(P.now()-t);var dim=src?await imgSize(src):{};
    out.qr.push({px:sz,ms:ms,kb:src?Math.round(src.length/1024):0,dim:dim,err:err});
    P.ck('s2-qr-'+sz);await new Promise(function(r){setTimeout(r,50);});}
  out.modules_hint=(out.qr[0].dim&&out.qr[0].dim.w)?Math.round((out.qr[0].dim.w-4)/4):null;
  P.ck('s2-selesai');return out;})()`;

/* S2B: satu QR px=160 (px per modul) — jalur kartu stok & label rak */
const S2B = `(async function(){var out={};P.ck('s2b-mulai');
  var payload='MRO-00-X-0000|Item contoh 0 nama agak panjang untuk uji render|GRPX-A';
  var t=P.now();var src=null,err=null;
  try{src=qrImgSrc(payload,160);}catch(e){err=String(e&&e.message||e);}
  out.qr160={ms:P.r1(P.now()-t),kb:src?Math.round(src.length/1024):0,err:err};
  if(src){out.qr160.dim=await new Promise(function(res){var im=new Image();im.onload=function(){res({w:im.naturalWidth,h:im.naturalHeight});};im.onerror=function(){res({err:1});};im.src=src;});}
  P.ck('s2b-selesai');return out;})()`;

/* S2C: struktur builder dengan QR di-stub (biaya non-QR) + hash struktur */
const S2C = `(async function(){var out={};P.ck('s2c-mulai');P.stubQr();
  var items12=allRows.slice(0,12),items24=allRows.slice(0,24),items60=allRows.slice(0,60),items120=allRows.slice(0,120),items96=allRows.slice(0,96);
  var b1=P.sync(function(){return buildPrintHTML(items12,'print','A4');});
  out.kartu12_print={ms:b1.ms,pages:P.pages(b1.val),imgs:P.imgs(b1.val),kb:Math.round(b1.val.length/1024),hash:P.hash(P.struct(b1.val))};
  P.ck('s2c-kartu12print');
  var b2=P.sync(function(){return buildPrintHTML(items12,'download','A4');});
  var cf=b2.val.indexOf('<div id="pw">')+14,ct=b2.val.indexOf('</div><script',cf);
  out.kartu12_dl={ms:b2.ms,pages:P.pages(b2.val),imgs:P.imgs(b2.val),kb:Math.round(b2.val.length/1024),hash:P.hash(P.struct(b2.val)),core:P.hash(P.struct(b2.val.slice(cf,ct)))};
  P.ck('s2c-kartu12dl');
  var b3=P.sync(function(){return buildPrintHTML(items120,'download','A4');});
  out.kartu120_dl={ms:b3.ms,pages:P.pages(b3.val),imgs:P.imgs(b3.val),kb:Math.round(b3.val.length/1024)};
  P.ck('s2c-kartu120');
  var b4=P.sync(function(){return buildPrintHTML(items24,'download','A5');});
  out.kartu24_A5_dl={ms:b4.ms,pages:P.pages(b4.val),imgs:P.imgs(b4.val)};
  var b5=P.sync(function(){return buildLabelHTML(items96,'print','4x6');});
  out.label96_print={ms:b5.ms,pages:P.pages(b5.val),imgs:P.imgs(b5.val),kb:Math.round(b5.val.length/1024)};
  P.ck('s2c-label96');
  var b6=P.sync(function(){return buildLabelHTML(items12,'print','4x6');});
  out.label12_print={ms:b6.ms,pages:P.pages(b6.val),imgs:P.imgs(b6.val),kb:Math.round(b6.val.length/1024),hash:P.hash(P.struct(b6.val))};
  var b7=P.sync(function(){return buildLabelHTML(items12,'print','3x8');});
  out.label12_3x8_print={ms:b7.ms,pages:P.pages(b7.val)};
  var b8=P.sync(function(){return buildRakLabelHTML(['A1-01','A1-02','B2-03','C3-04']);});
  out.rak4={ms:b8.ms,pages:P.pages(b8.val),imgs:P.imgs(b8.val)};
  P.unstubQr();P.ck('s2c-selesai');return out;})()`;

/* S2D: PDF label (QR asli px=10) — kontrak byte-out */
const S2D = `(async function(){var out={};P.ck('s2d-mulai');
  var items12=allRows.slice(0,12),items24=allRows.slice(0,24);
  var p1=P.sync(function(){return buildLabelPDFDoc(items12,'4x6');});
  out.labelpdf12={ms:p1.ms};
  try{var buf=p1.val.doc.output('arraybuffer');var u=new Uint8Array(buf);var s=0;for(var i=0;i<u.length;i+=53)s=(s*33+u[i])>>>0;
    out.labelpdf12.bytes=u.length;out.labelpdf12.sum=s;out.labelpdf12.fname=p1.val.fname;}catch(e){out.labelpdf12.err=String(e);}
  P.ck('s2d-pdf12');
  var p2=P.sync(function(){return buildLabelPDFDoc(items24,'3x8');});
  out.labelpdf24_3x8={ms:p2.ms};
  try{var buf2=p2.val.doc.output('arraybuffer');out.labelpdf24_3x8.bytes=buf2.byteLength;}catch(e){out.labelpdf24_3x8.err=String(e);}
  P.ck('s2d-selesai');return out;})()`;

/* S2E: build kartu dengan QR ASLI — biaya nyata (2 kartu, 1 halaman) */
const S2E = `(async function(){var out={};P.ck('s2e-mulai');
  var items2=allRows.slice(0,2);
  var t=P.now();var html=buildPrintHTML(items2,'download','A4');var ms=P.r1(P.now()-t);
  out.kartu2_dl_real={ms:ms,pages:P.pages(html),imgs:P.imgs(html),kb:Math.round(html.length/1024),ms_per_card:P.r1(ms/2),per_page_predict_4kartu:P.r1(ms/2*4)};
  P.ck('s2e-selesai');return out;})()`;

/* S2F: keluaran builder label dengan QR ASLI (hash byte penuh = patokan refactor) */
const S2F = `(async function(){var out={};P.ck('s2f-mulai');
  var items12=allRows.slice(0,12),items96=allRows.slice(0,96);
  var b=P.sync(function(){return buildLabelHTML(items12,'print','4x6');});
  out.label12_print_real={ms:b.ms,pages:P.pages(b.val),imgs:P.imgs(b.val),kb:Math.round(b.val.length/1024),hash_full:P.hash(b.val),hash_struct:P.hash(P.struct(b.val))};
  P.ck('s2f-l12');
  var b4=P.sync(function(){return buildLabelHTML(items12,'print','3x8');});
  out.label12_3x8_real={ms:b4.ms,pages:P.pages(b4.val),hash_full:P.hash(b4.val)};
  P.ck('s2f-l12_3x8');
  var b2=P.sync(function(){return buildLabelHTML(items96,'print','4x6');});
  out.label96_print_real={ms:b2.ms,pages:P.pages(b2.val),kb:Math.round(b2.val.length/1024),hash_full:P.hash(b2.val)};
  P.ck('s2f-l96');
  P.ck('s2f-selesai');return out;})()`;

/* S3a: flow UI (popup palsu) — label24 (QR asli px=10), kartu4 (QR di-stub) */
const S3a = `(async function(){var out={};P.ck('s3a-mulai');
  setCetakMode('label');
  out.flow_label24_print=await P.flow('GRPZ',function(){doCetak();},{pages:1});P.ck('s3a-l24print');
  out.flow_label24_dl=await P.flow('GRPZ',function(){doDownload();},{until:function(){var t=(document.getElementById('cetak-sel-label')||{}).textContent||'';if(/Membuat PDF/.test(t))window.__lpSeen=1;return !!window.__lpSeen&&!/Membuat PDF/.test(t);}});P.ck('s3a-l24dl');
  P.stubQr();setCetakMode('kartu');
  out.flow_kartu4_dl_stubqr=await P.flow('GRPX',function(){doDownload();},{pages:3});P.ck('s3a-k4dlstub');
  out.flow_kartu4_print_stubqr=await P.flow('GRPX',function(){doCetak();},{pages:3});P.ck('s3a-k4printstub');
  P.unstubQr();P.ck('s3a-selesai');return out;})()`;

/* S3b: flow UI skala besar (popup palsu, QR di-stub) */
const S3b = `(async function(){var out={};P.ck('s3b-mulai');P.stubQr();
  setCetakMode('kartu');
  out.flow_kartu100_dl_stubqr=await P.flow('GRPY',function(){doDownload();},{pages:23});P.ck('s3b-k100dl');
  out.flow_kartu100_print_stubqr=await P.flow('GRPY',function(){doCetak();},{pages:23});P.ck('s3b-k100print');
  P.unstubQr();P.ck('s3b-selesai');return out;})()`;

/* S4: batas canvas + geometri 100 item + raster (QR di-stub) */
const S4 = `(async function(){var out={};P.ck('s4-mulai');P.stubQr();
  out.canvas_limits=(function(){var r={};
    try{var t=document.createElement('canvas');t.width=32767;t.height=8;r.w32767_ctx=!!t.getContext('2d');}catch(e){r.w32767_ctx=String(e);}
    try{var t2=document.createElement('canvas');t2.width=8;t2.height=65535;r.h65535_ctx=!!t2.getContext('2d');}catch(e){r.h65535_ctx=String(e);}
    return r;})();
  var items100=allRows.slice(0,100);
  var html100=buildPrintHTML(items100,'download','A4');
  out.html100={pages:P.pages(html100),kb:Math.round(html100.length/1024)};
  var w=P.mount(html100);
  out.geom100={css_h:Math.round(w.scrollHeight),canvas_h_at_scale2:Math.round(w.scrollHeight*2),limit_canvas_32767:Math.round(w.scrollHeight*2)>=32760,pages_fit_before_limit:Math.floor(32760/Math.max(1,Math.round(w.scrollHeight/Math.max(1,P.pages(html100)))))};
  P.ck('s4-geom100');
  try{
    if(typeof html2pdf!=='function'){await new Promise(function(res,rej){var s=document.createElement('script');s.src='js/html2pdf.bundle.min.js';s.onload=res;s.onerror=function(){rej(new Error('gagal muat bundle'));};document.head.appendChild(s);});}
    out.has_html2pdf=(typeof html2pdf);out.has_html2canvas=(typeof html2canvas);out.has_jspdf=(typeof jsPDF);P.ck('s4-bundle');
    var pgs=w.querySelectorAll('.page');
    var t1=P.now();var c1=await P.race(html2pdf().set(P.opt('a4','portrait')).from(pgs[0]).toCanvas().get('canvas'),180000);
    out.page1_raster=c1&&c1.__timeout?{timeout_ms:c1.__timeout}:{ms:P.r1(P.now()-t1),w:c1.width,h:c1.height,px:c1.width*c1.height};P.ck('s4-page1');
    if(pgs.length>1){
      var t2=P.now();var c2=await P.race(html2pdf().set(P.opt('a4','portrait')).from(pgs[1]).toCanvas().get('canvas'),180000);
      out.page2_raster=c2&&c2.__timeout?{timeout_ms:c2.__timeout}:{ms:P.r1(P.now()-t2),w:c2.width,h:c2.height};P.ck('s4-page2');
    }
    var t3=P.now();var c3=await P.race(html2pdf().set(P.opt('a4','portrait')).from(w).toCanvas().get('canvas'),240000);
    if(c3&&c3.__timeout){out.all25pages_raster={timeout_ms:c3.__timeout,container_css_h:Math.round(w.scrollHeight)};}
    else{out.all25pages_raster={ms:P.r1(P.now()-t3),w:c3.width,h:c3.height,px:c3.width*c3.height,limit_hit:(c3.height>=32760||c3.width>=32760)};}
    P.ck('s4-all25');
  }catch(e){out.raster_err=String(e&&e.message||e);}
  try{w.remove();}catch(e){}
  P.unstubQr();P.ck('s4-selesai');return out;})()`;

/* S5: bukti ujung-ke-ujung runner PDF kartu BARU (popup nyata, 10 kartu = 3 halaman A4).
   Diukur: waktu sampai popup tertutup (runner menutup setelah doc.save), progres terlihat,
   dan rAF beat app utama selama PDF dibuat (bukti UI tidak beku). */
const S5 = `(async function(){var out={};P.ck('s5-mulai');P.unstubQr();setCetakMode('kartu');
  var ps=document.getElementById('paper-size');if(ps)ps.value='A4';
  var n=P.sel('GRPX');
  var beats=0,stop=false;(function lp(){if(stop)return;beats++;requestAnimationFrame(lp);})();
  var origOpen=window.open;window.__popup=null;
  window.open=function(){var x=origOpen.apply(window,arguments);window.__popup=x;return x;};
  var t=P.now();doDownload();P.ck('s5-trigger');
  var popup=window.__popup;out.popup=!!popup;
  var seenProgress=false,lastTxt='',libsMs=null,netScripts=null,bannerSeen=false,bannerTxt='';
  for(var k=0;k<1400;k++){
    if(!popup)break;
    try{var pe=popup.document&&popup.document.getElementById('cetak-progress');lastTxt=(pe&&pe.textContent)||'';}catch(e){lastTxt='(err)';}
    if(libsMs===null){try{if(typeof popup.html2pdf==='function')libsMs=P.r1(P.now()-t);}catch(e){}}
    if(/Halaman|Merender|Menyimpan/.test(lastTxt)){seenProgress=true;
      if(netScripts===null){try{netScripts=popup.document.querySelectorAll('script[src]').length;}catch(e){netScripts=-1;}}
    }
    try{var be=document.getElementById('cetak-pdf-banner');if(be){bannerSeen=true;bannerTxt=be.textContent||'';}}catch(e){}
    if(popup.closed)break;
    await new Promise(function(r){setTimeout(r,250);});
  }
  stop=true;out.sel=n;out.closed=popup?!!popup.closed:null;out.progress_seen=seenProgress;out.last_txt=String(lastTxt).slice(0,80);
  out.libs_ms=libsMs;out.net_scripts=netScripts;out.banner_seen=bannerSeen;out.banner_txt=String(bannerTxt).slice(0,80);
  out.beats=beats;out.ms=P.r1(P.now()-t);
  window.open=origOpen;try{if(popup&&!popup.closed)popup.close();}catch(e){}
  P.ck('s5-selesai');return out;})()`;

/* S7: bukti banner progres di TAB APLIKASI untuk PDF label (jalur tanpa popup). */
const S7 = `(async function(){var out={};P.ck('s7-mulai');setCetakMode('label');
  var tpl=document.getElementById('label-tpl');if(tpl)tpl.value='4x6';
  P.sel('GRPZ');
  var btn=document.querySelector('[onclick="doDownload()"]');
  var t=P.now();
  if(btn)btn.click();else doDownload();
  var seen=false,txts=[],last='';
  for(var k=0;k<90;k++){
    var be=document.getElementById('cetak-pdf-banner');
    if(be){seen=true;var tx=(be.textContent||'').trim();if(tx&&tx!==last){last=tx;txts.push(tx.slice(0,44));}}
    else if(seen)break;
    await new Promise(function(r){setTimeout(r,150);});
  }
  out.dom_checked=P.checked();out.btn=!!btn;out.banner_seen=seen;out.txts=txts.slice(0,8);out.ms=P.r1(P.now()-t);
  P.ck('s7-selesai');return out;})()`;

async function main() {
  fs.mkdirSync(DL_DIR, { recursive: true });
  RES.provenance.start = provenance();
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/beat') {
      let q = ''; try { q = decodeURIComponent((req.url.split('?')[1] || '').replace(/^c=/, '')); } catch (e) {}
      if (RES.beats.length < 400) { RES.beats.push({ t: Date.now(), c: q }); }
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return;
    }
    if (p === '/gas') {
      let chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) {}
        const action = body.action || '';
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        if (action === 'getData') { const rows = mockRows(ROWS); res.end(JSON.stringify({ status: 'ok', total: rows.length, rows })); return; }
        if (action === 'getMasterLists') { res.end(JSON.stringify({ status: 'ok', uom: ['Pcs'], rak: ['A1-01'], vendor: ['V'], kategori: ['MRO'] })); return; }
        if (action === 'getRakBreakdownAll') { res.end(JSON.stringify({ status: 'ok', rows: [] })); return; }
        res.end(JSON.stringify({ status: 'ok', message: 'mock', total: 0 }));
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
  await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));

  try {
    spawnSync('powershell', ['-NoProfile', '-Command', 'Get-NetTCPConnection -LocalPort ' + CDP_PORT + ' -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }'], { timeout: 5000, stdio: 'ignore' });
  } catch (e) {}

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-print-preview', '--kiosk-printing', '--disable-popup-blocking',
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + PROFILE,
    '--window-size=1366,900', '--disable-dev-shm-usage',
    '--disable-extensions', '--disable-background-networking', '--allow-running-insecure-content',
    'http://127.0.0.1:' + HTTP_PORT + '/index.html'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let chromeExit = null;
  chrome.on('exit', (c, s) => { chromeExit = c + '/' + s; });

  let cdp = null;
  for (let i = 0; i < 80; i++) { try { cdp = await connectCDP(CDP_PORT); break; } catch (e) { await sleep(250); } }
  if (!cdp) { console.log('CDP connect GAGAL chromeExit=' + chromeExit); server.close(); return; }
  console.log('CDP tersambung. rows=' + ROWS + ' tag=' + TAG);

  const evalIn = async (expr, timeoutMs) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeoutMs);
    if (r.error) return { err: r.error.message };
    if (r.result && r.result.exceptionDetails) return { err: (r.result.exceptionDetails.exception || {}).description || 'exception' };
    return r.result && r.result.result ? r.result.result.value : (r.result ? r.result.value : r);
  };
  const responsive = async () => { try { const v = await cdp.send('Runtime.evaluate', { expression: '1+1', returnByValue: true }, 6000); return v && v.result && v.result.result && v.result.result.value === 2; } catch (e) { return false; } };
  const responsiveWait = async (maxMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) { if (await responsive()) return true; await sleep(10000); console.log('    masih sibuk… ' + Math.round((Date.now() - t0) / 1000) + 's'); }
    return false;
  };
  let aborted = false;
  const stage = async (name, expr, timeoutMs) => {
    if (aborted) { RES.stages[name] = { skipped: 'stage sebelumnya membuat renderer tidak responsif' }; console.log('--- STAGE ' + name + ' DILEWATI'); return; }
    const t0 = Date.now();
    console.log('--- STAGE ' + name + ' mulai');
    try {
      const r = await evalIn(expr, timeoutMs);
      RES.stages[name] = { wall_s: ((Date.now() - t0) / 1000).toFixed(1), result: r };
      console.log('--- STAGE ' + name + ' selesai (' + RES.stages[name].wall_s + 's)');
    } catch (e) {
      RES.stages[name] = { wall_s: ((Date.now() - t0) / 1000).toFixed(1), error: String(e.message || e) };
      console.log('--- STAGE ' + name + ' GAGAL: ' + (e.message || e));
      const ck = await evalIn('(window.__ck||[]).slice(-8)').catch(() => null);
      RES.stages[name].checkpoints = ck;
      console.log('    checkpoint: ' + JSON.stringify(ck));
      if (!(await responsiveWait(180000))) { aborted = true; console.log('    renderer TIDAK responsif → tahap berikutnya dilewati'); }
    }
    RES.beatsNow = RES.beats.length;
    save();
  };

  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.print=function(){window.__rdiPrintCalls=(window.__rdiPrintCalls||0)+1;};' });
    cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL_DIR }).catch(() => {});
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
    for (let i = 0; i < 120; i++) { const r = await evalIn("(function(){var e=document.getElementById('boot-splash');return e?e.classList.contains('hide'):null;})()"); if (r === true) break; await sleep(250); }
    await evalIn('(function(){try{localStorage.setItem("rdi_gas_url","http://127.0.0.1:' + HTTP_PORT + '/gas");sessionStorage.setItem("rdi_editor_key","WH1234");sessionStorage.setItem("rdi_editor_key_set_at",String(Date.now()));localStorage.setItem("rdi_editor_key","WH1234");localStorage.setItem("rdi_editor_key_set_at",String(Date.now()));return "ok";}catch(e){return String(e);}})()');
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
    for (let i = 0; i < 120; i++) { const r = await evalIn("(function(){var e=document.getElementById('boot-splash');return e?e.classList.contains('hide'):null;})()"); if (r === true) break; await sleep(250); }
    let warm = null;
    for (let i = 0; i < 200; i++) {
      warm = await evalIn("(function(){return {n:(typeof allRows!=='undefined'&&allRows.length)||0, gate:(function(){var g=document.getElementById('login-gate');return !g||g.classList.contains('hide');})()};})()");
      if (warm && warm.gate && warm.n >= Math.min(ROWS, 50)) break;
      await sleep(500);
    }
    RES.warmup = warm;
    console.log('Warmup: ' + JSON.stringify(warm));

    const d = await evalIn(DEFS);
    console.log('DEFS: ' + JSON.stringify(d));
    RES.stages.defs = d;
    save();

    const ONLY = (process.env.PROBE_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
    const STAGES = [
      ['S1_daftar_klik', S1, 300000],
      ['S2_qr_kecil', S2, 300000],
      ['S2C_struktur_stubqr', S2C, 300000],
      ['S2D_labelPDF', S2D, 300000],
      ['S2F_label_real_hash', S2F, 600000],
      ['S3a_flow_label_kartu', S3a, 600000],
      ['S3b_flow_besar_stubqr', S3b, 600000],
      ['S2B_qr160', S2B, 420000],
      ['S2E_kartu2_real_qr', S2E, 550000],
      ['S5_pdf_runner_e2e', S5, 420000],
['S7_banner_label_dl', S7, 300000],
      ['S4_canvas_geom_raster', S4, 900000]
    ];
    RES.only = ONLY;
    for (const [nm, code, to] of STAGES) { if (ONLY.length && !ONLY.includes(nm)) continue; await stage(nm, code, to); }
  } catch (e) {
    console.log('FATAL: ' + String(e.message || e));
    RES.fatal = String(e.message || e);
    save();
  } finally {
    RES.provenance.end = provenance();
    try { if (process.platform === 'win32' && chrome.pid) spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill(); } catch (e) {}
    try { RES.downloads = fs.readdirSync(DL_DIR).map(f => ({ f, size: fs.statSync(path.join(DL_DIR, f)).size })); } catch (e) { RES.downloads = []; }
    try { fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch (e) {}
    server.close();
  }
  save();
  console.log('tersimpan: ' + OUT_FILE);
}
main();
