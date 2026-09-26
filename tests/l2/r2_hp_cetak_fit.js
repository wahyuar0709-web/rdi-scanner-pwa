/* L2 r2_hp_cetak_fit (2026-09-26): bug tampilan HP menu cetak label.
 * Sebelum fix: .container{margin:0 auto} → flex item auto-margin cross → stretch mati →
 * container lebar = max-content (~505px) → isi #section-cetak terpotong di layar <505px
 * (430/375/360/320), overflow tersembunyi oleh section overflow:hidden.
 * Fix: #section-cetak .container{width:100%}.
 * Assert per viewport (mobile): container == vw, tak ada elemen melewati tepi kanan,
 * head/nav/list tanpa overflow horizontal, tombol mode Label muat + wrap, action bar
 * tidak ter-clipping, baris list tak melebihi list. Desktop 1440: container fill. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const HTTP_PORT = 9423, CDP_PORT = 9424;

const ROWS = [];
for (let i = 1; i <= 4; i++) {
  ROWS.push({
    id: 'MRO-02-00' + i, nama: 'Item Panjang Nama Material Contoh ' + i, spec: 'Spesifikasi teknis barang contoh panjang ' + i,
    qty: i * 5, unit: 'Pcs', rak: 'A-0' + i, kategori: 'Sparepart', vendor: 'V', po: 'P', user: 'T',
    minStock: 2, arsip: '', tglMasuk: '2026-09-01'
  });
}

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/gas') {
    const ch = [];
    req.on('data', c => ch.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      let a = '';
      try { a = JSON.parse(Buffer.concat(ch).toString() || '{}').action || ''; } catch (e) {}
      if (a === 'getData') res.end(JSON.stringify({ status: 'ok', total: ROWS.length, rows: ROWS }));
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
  if (ok) { pass++; console.log('PASS | ' + name + ' | ' + (detail || '')); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (detail || '')); }
}

const SNAP = `(function(){
  function R(sel){var el=document.querySelector(sel);if(!el)return null;var r=el.getBoundingClientRect();
    return {l:Math.round(r.left),r:Math.round(r.right),t:Math.round(r.top),b:Math.round(r.bottom),w:Math.round(r.width),h:Math.round(r.height)};}
  function OVF(sel){var el=document.querySelector(sel);if(!el)return null;
    return {sw:el.scrollWidth,cw:el.clientWidth,ovf:el.scrollWidth>el.clientWidth+1};}
  var sec=R('#section-cetak');
  var out={vw:innerWidth,docSW:document.documentElement.scrollWidth,
    container:R('#section-cetak .container'),head:R('#section-cetak .panel-head'),
    nav:R('#cetak-mode-nav'),list:R('#cetak-item-list'),act:R('#cetak-action-bar'),
    headOvf:OVF('#section-cetak .panel-head'),navOvf:OVF('#cetak-mode-nav'),listOvf:OVF('#cetak-item-list'),
    btnL:R('#cetak-mode-nav .dash-subtab-btn[data-mode=label]'),
    sel:R('#section-cetak .panel-head select'),
    row:R('.cetak-item-row'),
    actVsSec:sec?Math.round(out_act_b()-sec.b):null};
  function out_act_b(){var a=document.getElementById('cetak-action-bar');var r=a?a.getBoundingClientRect():{bottom:0};return r.bottom;}
  out.actVsSec=sec?Math.round(out_act_b()-sec.b):null;
  var over=[];
  ['#section-cetak .subpage-bar','#section-cetak .panel-head','#cetak-mode-nav','#section-cetak .search-wrap','#cetak-item-list','#cetak-action-bar'].forEach(function(s){
    var el=document.querySelector(s);if(!el)return;var r=el.getBoundingClientRect();
    if(r.right>innerWidth+1||r.left<-1)over.push(s+':'+Math.round(r.left)+'..'+Math.round(r.right));});
  out.over=over;
  return out;
})()`;

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  const ud = path.join(require('os').tmpdir(), 'rdi-hpfit-' + Date.now());
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

    async function boot() {
      await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
      for (let i = 0; i < 50; i++) {
        if (await ev("typeof window.switchTab==='function' && !!document.getElementById('boot-splash')") === true) break;
        await sleep(300);
      }
      await ev("localStorage.setItem('rdi_gas_url','http://127.0.0.1:" + HTTP_PORT + "/gas');sessionStorage.setItem('rdi_viewer_token','" + payload + "');sessionStorage.removeItem('rdi_editor_key');'ok'");
      await send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
      let ok = false;
      for (let i = 0; i < 70; i++) {
        const r = await ev("(function(){var b=document.getElementById('boot-splash');return {h:!b||b.classList.contains('hide'),rs:document.readyState,n:(window.allRows||[]).length,fn:typeof window.switchTab==='function'};})()");
        if (r && !r.error && r.h === true && r.rs === 'complete' && r.fn === true && r.n === 4) { ok = true; break; }
        await sleep(300);
      }
      return ok;
    }

    for (const vp of [[430, 932], [375, 667], [360, 640], [320, 568]]) {
      const tag = 'HP ' + vp[0] + 'x' + vp[1];
      await send('Emulation.setDeviceMetricsOverride', { width: vp[0], height: vp[1], deviceScaleFactor: 2, mobile: true });
      const ok = await boot();
      rec(tag + ' boot ready', ok === true, 'boot=' + ok);
      await ev("switchTab('cetak');'ok'");
      await sleep(700);
      let o = await ev(SNAP);
      rec(tag + ' kartu: no page h-overflow', o.docSW <= o.vw + 1, 'docSW=' + o.docSW + ' vw=' + o.vw);
      rec(tag + ' kartu: container == viewport', o.container && Math.abs(o.container.w - o.vw) <= 1, 'cont=' + (o.container && o.container.w));
      rec(tag + ' kartu: no element beyond right edge', o.over && o.over.length === 0, JSON.stringify(o.over));
      rec(tag + ' kartu: panel-head no h-overflow', o.headOvf && !o.headOvf.ovf, JSON.stringify(o.headOvf));
      rec(tag + ' kartu: mode-nav no h-overflow', o.navOvf && !o.navOvf.ovf, JSON.stringify(o.navOvf));
      rec(tag + ' kartu: list no h-overflow', o.listOvf && !o.listOvf.ovf, JSON.stringify(o.listOvf));
      rec(tag + ' kartu: btn Label within viewport', o.btnL && o.btnL.r <= o.vw, 'btnL.r=' + (o.btnL && o.btnL.r) + ' vw=' + o.vw);
      rec(tag + ' kartu: row <= list right edge', o.row && o.list && o.row.r <= o.list.r + 1, 'row=' + (o.row && o.row.r) + ' list=' + (o.list && o.list.r));

      await ev(`(function(){var b=document.querySelector('#cetak-mode-nav .dash-subtab-btn[data-mode="label"]');if(b)b.click();return 'ok';})()`);
      await sleep(500);
      o = await ev(SNAP);
      rec(tag + ' label: no element beyond right edge', o.over && o.over.length === 0, JSON.stringify(o.over));
      rec(tag + ' label: btn Label within viewport', o.btnL && o.btnL.r <= o.vw, 'btnL.r=' + (o.btnL && o.btnL.r));
      rec(tag + ' label: tpl select within viewport', o.sel && o.sel.r <= o.vw, 'sel.r=' + (o.sel && o.sel.r));

      await ev(`(function(){var cb=document.querySelector('#cetak-item-list input[type=checkbox]');if(cb)cb.click();return 'ok';})()`);
      await sleep(500);
      o = await ev(SNAP);
      rec(tag + ' label+sel: action bar visible/not clipped', o.act && o.actVsSec !== null && o.actVsSec <= 1, 'actVsSec=' + o.actVsSec);
      rec(tag + ' label+sel: action bar within viewport', o.act && o.act.r <= o.vw, 'act.r=' + (o.act && o.act.r));
      rec(tag + ' label+sel: no page h-overflow', o.docSW <= o.vw + 1, 'docSW=' + o.docSW);
    }

    // Desktop regression guard: container fill (max-width 1520 @ >=1440)
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const dok = await boot();
    rec('DESKTOP 1440 boot ready', dok === true, 'boot=' + dok);
    await ev("switchTab('cetak');'ok'");
    await sleep(700);
    const d = await ev(SNAP);
    rec('DESKTOP 1440 container fill (==1440)', d.container && Math.abs(d.container.w - 1440) <= 1, 'cont=' + (d.container && d.container.w));
    rec('DESKTOP 1440 no element beyond right edge', d.over && d.over.length === 0, JSON.stringify(d.over));
    rec('DESKTOP 1440 list no h-overflow', d.listOvf && !d.listOvf.ovf, JSON.stringify(d.listOvf));

    console.log('---');
    console.log('PASS / ' + fail + ' FAIL');
  } finally {
    try { ws && ws.close(); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
