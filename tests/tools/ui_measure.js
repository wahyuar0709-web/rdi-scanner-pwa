/* UI MEASURE v2 — pengukuran runtime yang AKURAT.
 * Perbaikan atas v1 (v1 menghasilkan angka yang bisa menyesatkan):
 *  1) Kontras: alpha di-composite ke atas background efektif (v1 prayed opacity=1 →
 *    的几 false positive "1.02:1" untuk teks semi-transparan).
 *  2) Target kecil: menyimpan class + selector path, supaya temuan bisa langsung ditindaklanjuti.
 *  3) State: login sungguhan lewat form (mock GAS mengembalikan token valid) →
 *     app dalam kondisi normal, bukan setengah boot.
 *  4) both themes: ukur light lalu dark (theme toggle), karena kontras beda per tema.
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
  function effBg(el){
    var stack=[], n=el;
    while(n && n!==document.documentElement){ var c=parse(getComputedStyle(n).backgroundColor); if(c&&c.a>0){ stack.push(c); if(c.a>=0.99) break; } n=n.parentElement; }
    stack.push({r:255,g:255,b:255,a:1});
    var base=stack.pop();
    while(stack.length){ base=over(stack.pop(), base); }
    return base;
  }
  function lum(c){ var v=[c.r,c.g,c.b].map(function(x){x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);}); return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]; }
  function ratio(a,b){ var l1=lum(a),l2=lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); }
  function sel(el){ var s=el.tagName.toLowerCase(); if(el.id) s+='#'+el.id; if(el.className&&typeof el.className==='string') s+='.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'); return s; }
  function vis(el){ var st=getComputedStyle(el); if(st.display==='none'||st.visibility==='hidden') return false; var r=el.getBoundingClientRect(); return r.width>0&&r.height>0; }
  function label(el){ return (el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,30)||el.tagName.toLowerCase(); }

  var out={targets:[],tiny:[],contrast:[],fixed:[]};
  var els=document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[onclick]');
  for(var i=0;i<els.length;i++){ var el=els[i]; if(!vis(el))continue; var r=el.getBoundingClientRect(); if(r.width<1||r.height<1)continue;
    out.targets.push({sel:sel(el),label:label(el),w:Math.round(r.width),h:Math.round(r.height),tap:Math.round(r.height)}); }

  var leaves=document.querySelectorAll('body *'), seen={};
  for(var j=0;j<leaves.length;j++){ var e=leaves[j];
    if(e.children.length) continue; if(!vis(e)) continue;
    var t=(e.textContent||'').trim(); if(t.length<2) continue;
    var st=getComputedStyle(e), fs=parseFloat(st.fontSize), col=parse(st.color);
    if(!col) continue;
    var bg=effBg(e), comp=over(col,bg), rr=ratio(comp,bg);
    var bold=(parseInt(st.fontWeight,10)||400)>=700, large=fs>=24||(fs>=18.66&&bold), need=large?3:4.5;
    if(fs<10){ out.tiny.push({sel:sel(e),fs:fs,text:t.slice(0,24)}); }
    var key=col.r+','+col.g+','+col.b+','+col.a+'|'+Math.round(fs)+'|'+Math.round(rr*100);
    if(rr<need && !seen[key]){ seen[key]=1; out.contrast.push({sel:sel(e),ratio:Math.round(rr*100)/100,need:need,fs:fs,color:st.color,text:t.slice(0,24)}); }
  }
  var fx=document.querySelectorAll('.tabnav,.trx-submit-bar,.bottom-sheet,.topbar,.item-detail-sheet,.edit-sheet,.more-drawer');
  for(var f=0;f<fx.length;f++){ var e3=fx[f]; if(!vis(e3))continue; var r3=e3.getBoundingClientRect(), c3=getComputedStyle(e3);
    out.fixed.push({sel:sel(e3),pos:c3.position,top:Math.round(r3.top),bottom:Math.round(r3.bottom),h:Math.round(r3.height),padB:c3.paddingBottom}); }
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
  r.contrast.slice(0, 12).forEach(t => console.log('   ' + t.ratio + ':1 (butuh ' + t.need + ')  ' + t.fs + 'px  ' + t.sel + '  "' + t.text + '"  ' + t.color));
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
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text }; return r.result && r.result.result ? r.result.result.value : null; };

  await send('Runtime.enable'); await send('Page.enable');
  const APP = 'http://127.0.0.1:' + PORT + '/index.html';
  const GAS = 'http://127.0.0.1:' + PORT + '/gas';
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: APP });
  await sleep(1200);
  await ev("localStorage.setItem('rdi_gas_url','" + GAS + "');1");
  await send('Page.navigate', { url: APP });
  await sleep(2500);

  // login sungguhan lewat form
  const gate = await ev("(function(){var g=document.getElementById('login-gate');return g?!g.classList.contains('hide'):'tidak-ada';})()");
  console.log('login gate: ' + gate);
  if (gate === false) {
    await ev("(function(){document.getElementById('login-username').value='" + LOGIN.username + "';document.getElementById('login-password').value='" + LOGIN.password + "';return 1;})()");
    await ev("submitViewerLogin();1");
    await sleep(3000);
  }
  const state = await ev("(function(){return {gate:(document.getElementById('login-gate')||{className:'?'}).className, tabnav:!!document.querySelector('.tabnav'), rows:document.querySelectorAll('#tbody tr, table tbody tr').length};})()");
  console.log('state setelah login: ' + JSON.stringify(state));

  const all = {};
  for (const vp of [[375, 812, 'HP 375x812'], [320, 568, 'HP kecil 320x568'], [812, 375, 'landscape 812x375'], [1440, 900, 'desktop 1440x900']]) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp[0], height: vp[1], deviceScaleFactor: 2, mobile: vp[0] < 900 });
    await sleep(800);
    const r = await ev(MEASURE);
    if (!r || r.__err) { console.log('ERROR di ' + vp[2] + ': ' + JSON.stringify(r)); continue; }
    all[vp[2]] = r;
    report(r, vp[2]);
  }

  // mode gelap
  await ev("(function(){ try{ if(typeof toggleTheme==='function'){ toggleTheme(); return 'toggled'; } }catch(e){ return 'err:'+e.message; } })()");
  await sleep(900);
  const dark = await ev(MEASURE);
  if (dark && !dark.__err) { all.dark375 = dark; report(dark, 'DARK mode 375x812'); }

  fs.writeFileSync('C:/Users/lenov/AppData/Local/Temp/opencode/ui_measure2.json', JSON.stringify(all, null, 1), 'utf8');
  console.log('\n(Disimpan ui_measure2.json)');
  done(); process.exit(0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
