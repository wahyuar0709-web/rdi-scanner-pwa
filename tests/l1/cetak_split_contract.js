// cetak_split_contract (2026-10-19) — kontrak refactor builder menu Cetak:
//   1) labelOpenHTML + labelPageHTML* + labelTailHTML === buildLabelHTML
//   2) printOpenHTML + printPageHTML* + printTailHTML === buildPrintHTML
//   3) QR px per modul <= 32 pada kartu stok + label rak (px=160 terukur 31 s/QR, 5924x5924 px)
//   4) labelPDFDraw bertahap === sekali jalan (isi PDF sama; trailer /ID diabaikan)
// QR di-stub supaya deterministik: yang diuji struktur HTML, bukan pustaka QR.
const fs = require('fs');
const path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');

let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok === true) { pass++; console.log('PASS | ' + name + (ev ? ' | ' + ev : '')); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + ev); }
}

const src = fs.readFileSync(path.join(ROOT, 'js/cetak.js'), 'utf8');
const ex = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const qrStub = px => 'data:image/png;base64,STUB' + (px || 120);

let J;
try { const j = require(path.join(ROOT, 'js/jspdf.min.js')); J = j.jsPDF || (j.jspdf && j.jspdf.jsPDF) || j; } catch (e) { J = undefined; }

let api = null, loadErr = '';
try {
  api = new Function('qrcode', 'ex', 'qrImgSrc', 'document', 'alert', 'location', 'jsPDF', 'jspdf',
    src + '\n;return {buildLabelHTML:buildLabelHTML,buildPrintHTML:buildPrintHTML,labelOpenHTML:labelOpenHTML,labelPageHTML:labelPageHTML,labelTailHTML:labelTailHTML,' +
    'printOpenHTML:printOpenHTML,printPageHTML:printPageHTML,printTailHTML:printTailHTML,' +
    'labelPerPage:labelPerPage,kartuTgl:kartuTgl,kartuPdfFilename:kartuPdfFilename,' +
    'labelPDFInit:labelPDFInit,labelPDFDraw:labelPDFDraw,buildLabelPDFDoc:buildLabelPDFDoc,kartuPdfRunnerSrc:kartuPdfRunnerSrc};')(
    () => ({ addData() {}, make() {}, createDataURL: qrStub }), ex, (x, px) => qrStub(px),
    { getElementById: () => null, createElement: () => ({ getContext: () => null, style: {} }) },
    () => {}, { href: 'http://x/index.html' }, J, undefined);
} catch (e) { loadErr = String(e && e.message || e); }
t('js/cetak.js dapat dimuat & fungsi split tersedia', !!api, loadErr || 'ok');

function rows(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: i % 7 === 0 ? '' : 'ID' + i, nama: 'Nama ' + i + ' <uji>', spec: i % 3 === 0 ? 'spec' + i : '', rak: i % 5 === 0 ? '' : 'R' + i, qty: i, unit: 'Pcs', vendor: 'V' + i });
  return out;
}

if (api) {
  let same = 0, diff = 0, firstDiff = '';
  for (const n of [0, 1, 4, 24, 25, 96]) {
    const r = rows(n);
    for (const mode of ['print', 'download']) {
      for (const tpl of ['4x6', '3x8', '2x7']) {
        const per = api.labelPerPage(tpl), total = Math.ceil(r.length / per);
        let html = api.labelOpenHTML(tpl);
        for (let p = 0, pi = 0; p < r.length; p += per, pi++) html += api.labelPageHTML(r.slice(p, p + per), tpl, pi === total - 1, p);
        html += api.labelTailHTML();
        if (html === api.buildLabelHTML(r, mode, tpl)) same++; else { diff++; firstDiff = firstDiff || ('label n=' + n + ' ' + mode + ' ' + tpl); }
      }
      for (const ps of ['A4', 'A5']) {
        const cpp = ps === 'A5' ? 2 : 4, total = Math.ceil(r.length / cpp), tgl = api.kartuTgl();
        let html = api.printOpenHTML(ps);
        for (let p = 0, pi = 0; p < r.length; p += cpp, pi++) { const c = r.slice(p, p + cpp); while (c.length < cpp) c.push(null); html += api.printPageHTML(c, tgl, pi === total - 1); }
        html += api.printTailHTML(mode, api.kartuPdfFilename(), ps);
        if (html === api.buildPrintHTML(r, mode, ps)) same++; else { diff++; firstDiff = firstDiff || ('kartu n=' + n + ' ' + mode + ' ' + ps); }
      }
    }
  }
  t('komposisi open+page+tail === build*HTML (48 kombinasi)', diff === 0, diff === 0 ? (same + ' sama') : (diff + ' beda, mis. ' + firstDiff));

  t('builder menutup <div id="pw">', /<\/div>/.test(api.labelTailHTML()) && /<\/div>/.test(api.printTailHTML('print', 'x.pdf', 'A4')), 'tail label=' + JSON.stringify(api.labelTailHTML().slice(0, 24)));

  const kartuHtml = api.buildPrintHTML(rows(4), 'download', 'A4');
  const pxCard = (kartuHtml.match(/data:image\/png;base64,STUB(\d+)/) || [])[1];
  t('QR kartu px per modul 8..32 (bukan 160)', +pxCard >= 8 && +pxCard <= 32, 'px=' + pxCard);
  const rakHtml = fs.readFileSync(path.join(ROOT, 'js/cetak.js'), 'utf8').match(/src="'\+qrImgSrc\(rak,(\d+)\)/);
  t('QR label rak px per modul 8..32', rakHtml && +rakHtml[1] >= 8 && +rakHtml[1] <= 32, 'px=' + (rakHtml && rakHtml[1]));
  t('QR disuntik via data-qr (payload id|nama|rak)', /data-qr="/.test(kartuHtml) && kartuHtml.indexOf('ID1|Nama 1') > 0, 'ok');

  const runner = api.kartuPdfRunnerSrc('kartu-stok.x.pdf', 'A4', 'portrait');
  t('runner PDF per halaman (html2pdf per .page + addImage + save)', /#pw \.page/.test(runner) && /toCanvas/.test(runner) && /addImage/.test(runner) && /doc\.save\(/.test(runner), 'len=' + runner.length);
  t('runner tidak meraster #pw utuh (bekas RC-C)', !/from\(document\.getElementById\("pw"\)\)/.test(runner), 'ok');
  const runnerA5 = api.kartuPdfRunnerSrc('x.pdf', 'A5', 'landscape');
  t('runner A5 = format a5 + landscape + 210x148.5mm', /format:"a5"/.test(runnerA5) && /orientation:"landscape"/.test(runnerA5) && /,210,148\.5,/.test(runnerA5), 'ok');

  if (!J) {
    console.log('NOT TESTED | PDF label (jsPDF tidak dapat dimuat di Node)');
  } else {
    const strip = s => s.replace(/\/ID \[ <[0-9A-F]+> <[0-9A-F]+> \]/, '/ID [ <ID> <ID> ]')
      .replace(/\/CreationDate \(D:[^)]*\)/g, '/CreationDate (D:<TS>)')
      .replace(/\/ModDate \(D:[^)]*\)/g, '/ModDate (D:<TS>)');
    let pdfDiff = 0, ev = '';
    for (const n of [12, 24, 96]) {
      const r = rows(n);
      const st1 = api.labelPDFInit('4x6'); api.labelPDFDraw(st1, r, 0, n);
      const b1 = Buffer.from(st1.doc.output('arraybuffer')).toString('latin1');
      if (n === 12) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
      const st2 = api.labelPDFInit('4x6'); for (let i = 0; i < n; i += 4) api.labelPDFDraw(st2, r, i, Math.min(n, i + 4));
      const b2 = Buffer.from(st2.doc.output('arraybuffer')).toString('latin1');
      if (strip(b1) !== strip(b2)) { pdfDiff++; ev = 'n=' + n + ' ' + b1.length + 'B vs ' + b2.length + 'B'; }
    }
    t('labelPDFDraw bertahap === sekali jalan (n=12/24/96)', pdfDiff === 0, pdfDiff === 0 ? '3/3 sama' : ev);
  }
}

console.log('=== CETAK SPLIT CONTRACT: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
