/* UI MEASURE v2 — pengukuran runtime yang AKURAT.
 * Perbaikan atas v1 (v1 menghasilkan angka yang bisa menyesatkan):
 *  1) Kontras: alpha di-composite ke atas background efektif (v1 memakai opacity=1 →
 *    beberapa false positive "1.02:1" untuk teks semi-transparan).
 *  2) Target kecil: menyimpan class + selector path, supaya temuan bisa langsung ditindaklanjuti.
 *  3) State: login sungguhan lewat form (mock GAS mengembalikan token valid) →
 *     app dalam kondisi normal, bukan setengah boot.
 *  4) theme: ukur light saja; mode gelap tidak diukur.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const PORT = 9463, CDP = 9464;

const ROWS = [];
for (let i = 1; i <= 12; i++) {
  ROWS.push({
    id: 'MRO-02-00' + i, no: String(i), nama: 'Bearing 6205 ZZ Variant ' + i, spec: 'Bearing 6205 ZZ',
    qty: 100 + i * 7, unit: 'Pcs', rak: 'A-0' + (i % 4), kategori: 'Sparepart', vendor: 'PT Vendor ' + i,
    po: 'PO-2026-' + i, user: 'budi', minStock: 20, tglMasuk: '2026-09-0' + ((i % 9) + 1),
  });
}
const LOGIN = { username: 'wahyu', password: 'RahasiaKuat123!' };
function fakeToken() {
  const p = LOGIN.username + '|Wahyu Susanto|' + (Date.now() + 6 * 3600e3) + '|jti-wahyu|1|editor';
  const b64 = Buffer.from(p, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64 + '.' + Buffer.from('sig').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const TOK = fakeToken();

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/gas') {
    const ch = [];
    req.on('data', c => ch.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      let b = {};
      try { b = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch (e) {}
      const a = b.action || '';
      if (a === 'login') return res.end(JSON.stringify({ status: 'ok', token: TOK, role: 'editor', nama: 'Wahyu Susanto', username: LOGIN.username }));
      if (a === 'getData') return res.end(JSON.stringify({ status: 'ok', total: ROWS.length, rows: ROWS }));
      if (a === 'getItem') return res.end(JSON.stringify({ status: 'ok', id: b.id, item: ROWS[0] }));
      if (a === 'getMasterLists') return res.end(JSON.stringify({ status: 'ok', uom: ['Pcs'], kategori: ['Sparepart'], rak: ['A-01'], vendor: ['PT Vendor 1'] }));
      if (a === 'getHistory') return res.end(JSON.stringify({ status: 'ok', rows: [] }));
      if (a === 'getDashboard') return res.end(JSON.stringify({ status: 'ok', total: ROWS.length, perlu: 3, expiring: 2 }));
      if (a === 'getAlert') return res.end(JSON.stringify({ status: 'ok', rows: [] }));
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

/* ---- ekspresi in-page: kontras dengan alpha compositing ---- */
const MEASURE = `(function(){
  function parse(c){ var m=/rgba?\\(([^)]+)\\)/.exec(c||''); if(!m) return null; var p=m[1].split(',').map(parseFloat); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
  function over(fg,bg){ var a=fg.a; return {r:fg.r*a+bg.r*(1-a), g:fg.g*a+bg.g*(1-a), b:fg.b*a+bg.b*(1-a), a:1}; }
  /* Kandidat background ancestor. PENTING (perbaikan 2026-09-27): versi lama hanya membaca
   * "backgroundColor", sehingga elemen dengan background GRADIENT (mis. topbar brand,
   * btn-primary) terlihat transparan dan walker naik ke body -> kontras teks putih di
   * topbar dilaporkan 1.15:1 (FALSE POSITIVE; nilai sebenarnya 8.86:1).
   * Sekarang color stop gradien ikut dibaca dan yang dipakai adalah stop TERBURUK. */
  function gradStops(bi){
    if(!bi || bi==='none') return [];
    if(bi.indexOf('gradient')<0) return [];
    var out=[], re=/rgba?\\([^)]+\\)|#[0-9a-fA-F]{3,8}/g, m;
    while((m=re.exec(bi))!==null){ var c=parse(m[0]); if(c && c.a>0) out.push(c); }
    return out;
  }
  function effBgAll(el){
    /* Kumpulkan layer backgroundColor (paling dekat dulu) sampai ketemu gradien
     * atau warna opak; lalu komposit layer-layer itu DI ATAS tiap color stop gradien.
     * Bug sebelumnya (27/09/2026): layer semi-transparan (mis. chip rgba(255,255,255,.15))
     * dipakai mentah-mentah sebagai kandidat background -> teks putih di chip putih
     * dilaporkan 1:1. Yang benar: composit dulu, baru bandingkan per stop. */
    var colorLayers=[], grad=null, n=el;
    while(n && n!==document.documentElement){
      var cs=getComputedStyle(n);
      var stops=gradStops(cs.backgroundImage);
      if(stops.length){ grad=stops; break; }
      var c=parse(cs.backgroundColor);
      if(c&&c.a>0){ colorLayers.push(c); if(c.a>=0.99) break; }
      n=n.parentElement;
    }
    if(!grad) grad=[{r:255,g:255,b:255,a:1}];
    var res=[];
    for(var i=0;i<grad.length;i++){
      var base={r:grad[i].r,g:grad[i].g,b:grad[i].b,a:1};
      for(var k=colorLayers.length-1;k>=0;k--) base=over(colorLayers[k], base);
      res.push(base);
    }
    res.candidatesFromGradient = grad.length>1;
    return res;
  }
  function effBg(el){ return effBgAll(el)[0]; }
  function lum(c){ var v=[c.r,c.g,c.b].map(function(x){x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);}); return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]; }
  function ratio(a,b){ var l1=lum(a),l2=lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); }
  function sel(el){ var s=el.tagName.toLowerCase(); if(el.id) s+='#'+el.id; if(el.className&&typeof el.className==='string') s+='.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'); return s; }
  function effectivelyHidden(el){
    if(el.classList && el.classList.contains('sr-only')) return true;
    var r=el.getBoundingClientRect(); if(r.width<1||r.height<1) return true;
    var st=getComputedStyle(el);
    if(st.clip==='rect(0px, 0px, 0px, 0px)') return true;
    if(st.clipPath==='inset(100%)') return true;
    var op=parseFloat(st.opacity); if(!isNaN(op)&&op<0.05) return true;
    return false;
  }
  function vis(el){ if(effectivelyHidden(el)) return false; var st=getComputedStyle(el); if(st.display==='none'||st.visibility==='hidden') return false; var r=el.getBoundingClientRect(); return r.width>0&&r.height>0; }
  function label(el){ return (el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,30)||el.tagName.toLowerCase(); }

  var out={targets:[],tiny:[],contrast:[],fixed:[]};
  var els=document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[onclick]');
  for(var i=0;i<els.length;i++){ var el=els[i]; if(!vis(el))continue; var r=el.getBoundingClientRect(); if(r.width<1||r.height<1)continue;
    out.targets.push({sel:sel(el),label:label(el),w:Math.round(r.width),h:Math.round(r.height),tap:Math.round(r.height)}); }

  var leaves=document.querySelectorAll('body *'), seen={};
  for(var j=0;j<leaves.length;j++){ var e=leaves[j];
    if(e.children.length) continue; if(!vis(e)) continue; if(effectivelyHidden(e)) continue;
    var t=(e.textContent||'').trim(); if(t.length<2) continue;
    var st=getComputedStyle(e), fs=parseFloat(st.fontSize), col=parse(st.color);
    if(!col) continue;
    var bgs=effBgAll(e), rr=1e9, worstBg=null;
    for(var bi2=0; bi2<bgs.length; bi2++){ var b2=bgs[bi2]; var r2=ratio(over(col,b2), b2); if(r2<rr){ rr=r2; worstBg=b2; } }
    var bold=(parseInt(st.fontWeight,10)||400)>=700, large=fs>=24||(fs>=18.66&&bold), need=large?3:4.5;
    if(fs<10){ out.tiny.push({sel:sel(e),fs:fs,text:t.slice(0,24)}); }
    var key=col.r+','+col.g+','+col.b+','+col.a+'|'+Math.round(fs)+'|'+Math.round(rr*100);
    if(rr<need && !seen[key]){ seen[key]=1; out.contrast.push({sel:sel(e),ratio:Math.round(rr*100)/100,need:need,fs:fs,color:st.color,text:t.slice(0,24),bg:worstBg,grad:bgs.length>1}); }
  }
  var fx=document.querySelectorAll('.tabnav,.trx-submit-bar,.bottom-sheet,.topbar,.item-detail-sheet,.edit-sheet,.more-drawer');
  for(var f=0;f<fx.length;f++){ var e3=fx[f]; if(!vis(e3))continue; var r3=e3.getBoundingClientRect(), c3=getComputedStyle(e3);
    out.fixed.push({sel:sel(e3),pos:c3.position,top:Math.round(r3.top),bottom:Math.round(r3.bottom),h:Math.round(r3.height),padB:c3.paddingBottom}); }
  var sb=document.querySelector('.boot-splash-sub');
  if(sb && vis(sb)){
    var stb=getComputedStyle(sb), fgb=parse(stb.color), bgsb=effBgAll(sb), rsb=1e9, wb=null;
    for(var si=0; si<bgsb.length; si++){ var bsb=bgsb[si]; var rs=ratio(over(fgb,bsb), bsb); if(rs<rsb){ rsb=rs; wb=bsb; } }
    out.splash={ratio:Math.round(rsb*100)/100,color:stb.color,bg:wb};
  }
  out.vw=innerWidth; out.vh=innerHeight;
  out.bodyClass=document.body.className;
  return out;
})()`;

function report(r, label) {
  console.log('\n=========== ' + label + ' (' + r.vw + 'x' + r.vh + ') mode=' + (r.bodyClass || '-') + ' ===========');
  const small = r.targets.filter(t => Math.min(t.w, t.h) < 24);
  const ios = r.targets.filter(t => Math.min(t.w, t.h) < 44);
  console.log('TARGET SENTUH: total ' + r.targets.length + ' | <24px: ' + small.length + ' | <44px: ' + ios.length);
  small.slice(0, 10).forEach(t => console.log('   ⚠ ' + t.w + 'x' + t.h + '  ' + t.sel + '  "' + t.label + '"'));
  if (!small.length) console.log('   ✓ tidak ada target < 24px');
  console.log('TEKS < 10px: ' + r.tiny.length);
  r.tiny.slice(0, 12).forEach(t => console.log('   ' + t.fs + 'px  ' + t.sel + '  "' + t.text + '"'));
  console.log('KONTRAS GAGAL: ' + r.contrast.length);
  r.contrast.slice(0, 12).forEach(t => console.log('   ' + t.ratio + ':1 (butuh ' + t.need + ')  ' + t.fs + 'px  ' + t.sel + '  "' + t.text + '"  ' + t.color + (t.grad && t.bg ? '  bg(sworst stop)=' + t.bg.r + ',' + t.bg.g + ',' + t.bg.b : '')));
  if (!r.contrast.length) console.log('   ✓ semua teks memenuhi WCAG AA');
  console.log('ELEMEN FIXED:');
  r.fixed.forEach(c => console.log('   ' + c.pos.padEnd(7) + ' ' + c.sel.padEnd(34) + ' top=' + c.top + ' bottom=' + c.bottom + ' h=' + c.h + ' padB=' + c.padB + (c.bottom > r.vh + 1 ? '  ⚠ TERPOTONG tepi bawah' : '')));
  return { small: small.length, tiny: r.tiny.length, contrast: r.contrast.length };
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const ud = path.join(os.tmpdir(), 'rdi-m2-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  const done = () => { try { chrome.kill(); } catch (e) {} try { server.close(); } catch (e) {} };
  process.on('exit', done);
  let target = null;
  for (let i = 0; i < 50; i++) {
    try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); const p = l.find(t => t.type === 'page'); if (p) { target = p.webSocketDebuggerUrl; break; } } catch (e) {}
    await sleep(300);
  }
  const ws = new WebSocket(target);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.result && r.result.exceptionDetails) { const ex = r.result.exceptionDetails; return { __err: (ex.exception && ex.exception.description) || ex.text }; } return r.result && r.result.result ? r.result.result.value : null; };

  await send('Runtime.enable'); await send('Page.enable');
  const APP = 'http://127.0.0.1:' + PORT + '/index.html';
  const GAS = 'http://127.0.0.1:' + PORT + '/gas';
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: APP });
  await sleep(1200);
  await ev("localStorage.setItem('rdi_gas_url','" + GAS + "');1");
  await send('Page.navigate', { url: APP });
  for (let i = 0; i < 20; i++) {
    if (await ev('!!document.body')) break;
    await sleep(500);
  }
  const boot = await ev("(function(){var s=document.querySelector('.boot-splash'),cs=false,csb=false;if(!s){s=document.createElement('div');s.className='boot-splash';document.body.appendChild(s);cs=true;}var sb=s.querySelector('.boot-splash-sub');if(!sb){sb=document.createElement('div');sb.className='boot-splash-sub';sb.textContent='Menyiapkan data';s.appendChild(sb);csb=true;}var tr=s.style.transition,od=s.style.display,ov=s.style.visibility,oo=s.style.opacity,sa=s.style.animation,was=s.classList.contains('hide');var st=sb.style.transition,sd=sb.style.display,sv=sb.style.visibility,so=sb.style.opacity,sba=sb.style.animation;s.style.transition='none';s.style.animation='none';s.style.display='flex';s.style.visibility='visible';s.style.opacity='1';s.classList.remove('hide');sb.style.transition='none';sb.style.animation='none';sb.style.display='block';sb.style.visibility='visible';sb.style.opacity='1';void s.offsetWidth;var r=" + MEASURE + ";if(csb)sb.remove();else{sb.style.transition=st;sb.style.animation=sba;sb.style.display=sd;sb.style.visibility=sv;sb.style.opacity=so;}if(cs)s.remove();else{s.classList.toggle('hide',was);s.style.transition=tr;s.style.animation=sa;s.style.display=od;s.style.visibility=ov;s.style.opacity=oo;}return r;})()");
  console.log('BOOT splash: ' + JSON.stringify(boot && boot.splash ? boot.splash : (boot && boot.__err ? boot : null)));
  if (!boot || !boot.splash) console.log('WARN: kontras splash tidak terukur');
  else if (boot.splash.ratio < 4.5) console.log('WARN: kontras splash ' + boot.splash.ratio + ':1 < 4.5');
  await sleep(1600);

  // login sungguhan lewat form
  const gate = await ev("(function(){var g=document.getElementById('login-gate');return g?!g.classList.contains('hide'):'tidak-ada';})()");
  console.log('login gate: ' + gate);
  if (gate === true) {
    await ev("(function(){document.getElementById('login-username').value='" + LOGIN.username + "';document.getElementById('login-password').value='" + LOGIN.password + "';return 1;})()");
    await ev("submitViewerLogin();1");
    await sleep(3000);
  }
  const state = await ev("(function(){var g=document.getElementById('login-gate');var gv=false;if(g){var c=getComputedStyle(g);gv=c.display!=='none'&&c.visibility!=='hidden'&&g.getClientRects().length>0;}return {gate:g?g.className:'?',gateVisible:gv,tabnav:!!document.querySelector('.tabnav'),rows:document.querySelectorAll('#tbody tr, table tbody tr').length,err:(document.getElementById('login-error')||{}).textContent,gas:!!(localStorage.getItem('rdi_gas_url')||'')};})()");
  console.log('state setelah login: ' + JSON.stringify(state));
  if (!state || !state.tabnav || !state.rows || state.rows < 1 || state.gateVisible) {
    console.log('FATAL: login/data tidak siap — pengukuran dibatalkan');
    process.exit(3);
  }
  console.log('labels: ' + JSON.stringify(await ev("(function(){var h=document.querySelector('.hist-search-input');var hs=h?getComputedStyle(h):null;var sv=document.getElementById('sheet-version-label');return {histPadLeft:hs&&hs.paddingLeft,histPadRight:hs&&hs.paddingRight,sheetVersion:sv&&sv.textContent,topVersion:(document.getElementById('topbar-version-label')||{}).textContent};})()")));

  const all = {};
  for (const vp of [[375, 812, 'HP 375x812'], [320, 568, 'HP kecil 320x568'], [812, 375, 'landscape 812x375'], [1440, 900, 'desktop 1440x900']]) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp[0], height: vp[1], deviceScaleFactor: 2, mobile: vp[0] < 900 });
    await sleep(800);
    const r = await ev(MEASURE);
    if (!r || r.__err) { console.log('ERROR di ' + vp[2] + ': ' + JSON.stringify(r)); continue; }
    all[vp[2]] = r;
    report(r, vp[2]);
  }

  fs.writeFileSync('C:/Users/lenov/AppData/Local/Temp/opencode/ui_measure2.json', JSON.stringify(all, null, 1), 'utf8');
  console.log('\n(Disimpan ui_measure2.json)');
  done(); process.exit(0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
