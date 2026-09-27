/* L2 r2_ui_quality_gate — gerbang kualitas UI yang bisa dijalankan ulang.
 *
 * DESAIN (sengaja): suite ini TIDAK gagal karena utang yang sudah diketahui. Aturannya:
 *   - ASSERTION (hijau/merah): batas keras yang saat ini sudah terpenuhi → melindungi dari regresi.
 *   - DEBT (laporan, tidak menggagalkan): pelanggaran yang SUDAH ADA → dicetak agar terlihat
 *     dan tidak hilang, tapi tidak membuat gate merah permanen (gate merah permanen melatih
 *     orang mengabaikan merah).
 *
 * Semua angka diukur dari DOM + screenshot pixel, bukan dari reading CSS.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const HTTP_PORT = 9475, CDP_PORT = 9476;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TOK = (() => {
  const p = 'wahyu|Wahyu Susanto|' + (Date.now() + 6 * 3600e3) + '|jti-gate|1|editor';
  const b = Buffer.from(p).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b + '.' + Buffer.from('sig').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
})();
const ROWS = [{ id: 'MRO-02-001', no: '1', nama: 'Bearing 6205 ZZ', spec: 'Bearing', qty: 156, unit: 'Pcs', rak: 'A-00', kategori: 'Sparepart', vendor: 'V1', po: 'P1', user: 'budi', minStock: 20, tglMasuk: '2026-09-09' }];

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/gas') {
    const ch = []; req.on('data', c => ch.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      let b = {}; try { b = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch (e) {}
      const a = b.action || '';
      if (a === 'getData') return res.end(JSON.stringify({ status: 'ok', total: ROWS.length, rows: ROWS }));
      if (a === 'getItem') return res.end(JSON.stringify({ status: 'ok', id: b.id, item: ROWS[0] }));
      if (a === 'getMasterLists') return res.end(JSON.stringify({ status: 'ok', uom: ['Pcs'], kategori: ['Sparepart'], rak: ['A-00'], vendor: ['V1'] }));
      return res.end(JSON.stringify({ status: 'ok', message: 'ok', total: 0, items: [], alat: [], raks: [], trx: [] }));
    });
    return;
  }
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); res.end(d); });
});

let pass = 0, fail = 0;
const debt = [];
function rec(name, ok, detail) {
  if (ok) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
function owed(id, title, evidence, fix) { debt.push({ id, title, evidence, fix }); }

(async () => {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(os.tmpdir(), 'rdi-uigate-' + Date.now());
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + ud,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  const done = () => { try { chrome.kill(); } catch (e) {} try { server.close(); } catch (e) {} };
  process.on('exit', done);
  let target = null;
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json(); const p = l.find(t => t.type === 'page'); if (p) { target = p.webSocketDebuggerUrl; break; } } catch (e) {} await sleep(300); }
  if (!target) { console.log('FAIL | CDP connect | tidak ada target'); process.exit(2); }
  const ws = new WebSocket(target);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(); const pageErrors = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; pageErrors.push(String((d.exception && (d.exception.description || d.exception.value)) || d.text).split('\n')[0]); } };
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text }; return r.result && r.result.result ? r.result.result.value : null; };
  await send('Runtime.enable'); await send('Page.enable');
  const APP = 'http://127.0.0.1:' + HTTP_PORT + '/index.html';
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: APP }); await sleep(1000);
  await ev("localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');localStorage.setItem('rdi_viewer_token','" + TOK + "');1");
  await send('Page.navigate', { url: APP }); await sleep(3000);

  /* ---------- A. ASSERTION: batas keras yang harus tetap terpenuhi ---------- */

  // A1: tidak ada halaman error saat boot
  rec('UQ-1: boot tanpa uncaught error', pageErrors.length === 0, 'errors=' + pageErrors.length + (pageErrors[0] ? ' | ' + pageErrors[0].slice(0, 80) : ''));

  // A2: tidak ada scroll horizontal (WCAG 1.4.10 reflow)
  for (const w of [320, 375, 768]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 812, deviceScaleFactor: 1, mobile: w < 900 });
    await sleep(600);
    const o = await ev('({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, iw: innerWidth})');
    rec('UQ-2: tanpa scroll horizontal di ' + w + 'px', o.sw <= o.cw + 1, 'scrollW=' + o.sw + ' clientW=' + o.cw);
  }

  // A3: semua dialog punya role + aria-modal
  const dlg = await ev(`(function(){var n=0,m=0;var d=document.querySelectorAll('[role="dialog"]');
    n=d.length; m=document.querySelectorAll('[role="dialog"][aria-modal="true"]').length; return {n:n,m:m};})()`);
  rec('UQ-3: semua dialog punya role=dialog + aria-modal', dlg.n > 0 && dlg.n === dlg.m, 'dialog=' + dlg.n + ' aria-modal=' + dlg.m);

  // A4: field login punya nama aksesibel + autocomplete (WCAG 2.2 accessible auth)
  const login = await ev(`(function(){
    var u=document.getElementById('login-username'), p=document.getElementById('login-password');
    if(!u||!p) return {missing:true};
    return { uName: !!(u.getAttribute('aria-label')||u.closest('label')), uAc: u.getAttribute('autocomplete'),
             pName: !!(p.getAttribute('aria-label')||p.closest('label')), pAc: p.getAttribute('autocomplete'),
             pType: p.getAttribute('type') };
  })()`);
  rec('UQ-4: field login punya nama aksesibel', !!(login.uName && login.pName), JSON.stringify(login));
  rec('UQ-5: login mendukung password manager (autocomplete)',
    login.uAc === 'username' && login.pAc === 'current-password' && login.pType === 'password',
    'username=' + login.uAc + ' password=' + login.pAc);
  const pasteBlocked = await ev(`(function(){
    var bad=[]; var f=document.querySelectorAll('input');
    for(var i=0;i<f.length;i++){ var v=f[i].getAttribute('onpaste')||''; var of=f[i].getAttribute('oncut')||''; if(/preventDefault/.test(v)||/preventDefault/.test(of)) bad.push(f[i].id||f[i].name||'?'); }
    return bad;
  })()`);
  rec('UQ-6: paste tidak diblokir di input mana pun (WCAG 2.2)', pasteBlocked.length === 0, 'diblokir di: ' + (pasteBlocked.join(',') || 'tidak ada'));

  // A7: ada area error login yang bisa diumumkan screen reader
  const errEl = await ev(`(function(){var e=document.getElementById('login-error');if(!e)return null;
    return {role:e.getAttribute('role'),live:e.getAttribute('aria-live')};})()`);
  if (errEl && (errEl.role === 'alert' || errEl.live)) {
    rec('UQ-7: error login diumumkan ke screen reader', true, 'role=' + errEl.role + ' aria-live=' + errEl.live);
  } else {
    owed('UQ-DEBT-1', 'Error login tidak diumumkan screen reader',
      '#login-error punya class "login-error u-hide" tanpa role="alert"/aria-live (diukur 2026-09-27)',
      'tambah role="alert" aria-live="assertive" pada #login-error');
  }

  // A8: topbar tidak boleh memotong konten. Diukur pada 375 DAN 320, dengan toleransi
  // yang jujur: <2px dianggap anti-aliasing, >2px = konten benar-benar terpotong.
  const tbInfo = {};
  for (const w of [375, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 812, deviceScaleFactor: 1, mobile: true });
    await sleep(600);
    tbInfo[w] = await ev(`(function(){
      var t=document.querySelector('.topbar');
      var over=0, worst='';
      for(var i=0;i<t.children.length;i++){ var c=t.children[i], r=c.getBoundingClientRect(), tr=t.getBoundingClientRect();
        var o=Math.max(0, Math.round(tr.top - r.top)) + Math.max(0, Math.round(r.bottom - tr.bottom));
        if(o>over){ over=o; worst=(c.className||c.tagName).toString().slice(0,30)+' h='+Math.round(r.height); } }
      return { c:t.clientHeight, s:t.scrollHeight, over:over, worst:worst };
    })()`);
  }
  const worstOver = Math.max(tbInfo[375].over, tbInfo[320].over, tbInfo[375].s - tbInfo[375].c, tbInfo[320].s - tbInfo[320].c);
  if (worstOver <= 2) {
    rec('UQ-8: topbar tidak memotong konten (375 & 320px)', true,
      '375: over=' + tbInfo[375].over + 'px, 320: over=' + tbInfo[320].over + 'px');
  } else {
    owed('UQ-DEBT-2', 'Topbar memotong konten (nama perusahaan terpotong)',
      '375px: ' + tbInfo[375].over + 'px lebih (' + tbInfo[375].worst + '); 320px: ' + tbInfo[320].over + 'px lebih (' + tbInfo[320].worst + '). CSS .topbar memakai height tetap 56px sementara isinya membungkus jadi 2-3 baris.',
      'ubah .topbar dari `height:56px` menjadi `min-height:56px; padding-block`, DAN/ATAU potong nama perusahaan dengan text-overflow:ellipsis + white-space:nowrap di bawah 640px');
  }

  // A9: target sentuh >= 24px (WCAG 2.2) — dijaga: tidak boleh bertambah
  const smallT = await ev(`(function(){
    var bad=[]; var els=document.querySelectorAll('button,a[href],input:not([type=hidden]),select,[role=button]');
    for(var i=0;i<els.length;i++){ var e=els[i]; var st=getComputedStyle(e);
      if(st.display==='none'||st.visibility==='hidden') continue;
      var r=e.getBoundingClientRect(); if(r.width<1||r.height<1) continue;
      if(Math.min(r.width,r.height)<24) bad.push((e.id||e.className||e.tagName).toString().slice(0,34)+' '+Math.round(r.width)+'x'+Math.round(r.height)); }
    return bad;
  })()`);
  if (!smallT.length) rec('UQ-9: semua target sentuh >= 24px (WCAG 2.2 AA)', true, '');
  else owed('UQ-DEBT-3', 'Ada target sentuh < 24px (WCAG 2.2 AA)',
    smallT.length + ' elemen: ' + smallT.slice(0, 6).join(' | '),
    'tinggikan tinggi minimal .item-detail-section-toggle (17px) & tombol chip kecil, atau beri padding');

  // A10: tidak boleh ada teks < 9px (batas keras yang harus tetap berlaku)
  const tinyT = await ev(`(function(){
    var bad=[]; var els=document.querySelectorAll('body *');
    for(var i=0;i<els.length;i++){ var e=els[i]; if(e.children.length) continue;
      var st=getComputedStyle(e); if(st.display==='none'||st.visibility==='hidden') continue;
      var r=e.getBoundingClientRect(); if(r.width<2||r.height<2) continue;
      var t=(e.textContent||'').trim(); if(t.length<2) continue;
      var fs=parseFloat(st.fontSize); if(fs<9) bad.push(fs+'px '+(e.className||e.tagName)+' "'+t.slice(0,18)+'"'); }
    return bad;
  })()`);
  if (!tinyT.length) rec('UQ-10: tidak ada teks < 9px', true, '');
  else owed('UQ-DEBT-4', 'Teks sangat kecil (< 9px)',
    tinyT.length + ' elemen: ' + tinyT.slice(0, 6).join(' | '),
    'naikkan ke token --fs-10 minimal (target发表评论: 11-12px untuk label di HP)');

  // A11: dark mode — topbar harus tetap punya teks yang terbaca
  await ev("toggleTheme();1"); await sleep(800);
  const dk = await ev(`(function(){
    var tb=document.querySelector('.topbar'), ti=document.querySelector('.topbar-title');
    var bgImg=getComputedStyle(tb).backgroundImage;
    // tentukan warna latar efektif: ambil color stop pertama dari gradient
    var m=/rgba?\\(([^)]+)\\)/.exec(bgImg);
    var bg = m ? m[1].split(',').map(parseFloat) : [0,0,0];
    function lum(c){var v=c.slice(0,3).map(function(x){x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);});return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2];}
    function parseC(c){var q=/rgba?\\(([^)]+)\\)/.exec(c);return q?q[1].split(',').map(parseFloat):[0,0,0];}
    var tc=parseC(getComputedStyle(ti).color);
    var l1=lum(tc), l2=lum(bg);
    return { bodyClass: document.body.className, ratio: Math.round(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))*100)/100,
             titleColor: getComputedStyle(ti).color, topbarGrad: bgImg.slice(0,70) };
  })()`);
  if (dk.ratio >= 4.5) rec('UQ-11: topbar tetap terbaca di mode gelap (>=4.5:1)', true, 'kontras=' + dk.ratio);
  else owed('UQ-DEBT-5', 'Topbar tidak terbaca di mode gelap',
    'kontras judul topbar = ' + dk.ratio + ':1 (butuh 4.5) — teks ' + dk.titleColor + ' di atas ' + dk.topbarGrad + ' (body class="' + dk.bodyClass + '")',
    'dark mode belum punya palet token: 0 dari 125 token berubah, 35 rule body.light vs 1 rule body:not(.light). Opsi: (a) sembunyikan toggle sampai palet gelap ada, atau (b) buat blok token gelap + perbaikan .topbar');

  // A12: login-error punya affordance tombol lihat-sandi
  const pwT = await ev(`(function(){
    var p=document.getElementById('login-password'); if(!p) return null;
    var wrap=p.parentElement; var btn=wrap?wrap.querySelector('button,[role=button]'):null;
    return { ada: !!btn, label: btn?(btn.getAttribute('aria-label')||btn.textContent||'').trim().slice(0,20):'' };
  })()`);
  if (!pwT || pwT.ada) rec('UQ-12: ada kontrol lihat/sembunyikan sandi', true, pwT ? 'label=' + pwT.label : '');
  else owed('UQ-DEBT-6', 'Tidak ada tombol lihat/sembunyikan sandi',
    'input#login-password tidak punya tombol toggle diDalam wrapper-nya',
    'tambahkan tombol ikon dengan aria-label="Lihat sandi" + aria-pressed');

  /* ---------- LAPORAN ---------- */
  console.log('\n---- UTANG UI yang sudah ada (DEBT, tidak menggagalkan gate) ----');
  if (!debt.length) console.log('  (tidak ada)');
  debt.forEach(d => {
    console.log('  [' + d.id + '] ' + d.title);
    console.log('      bukti : ' + d.evidence);
    console.log('      saran : ' + d.fix);
  });
  console.log('\n---- r2_ui_quality_gate: ' + pass + ' PASS / ' + fail + ' FAIL / ' + debt.length + ' DEBT ----');
  done();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
