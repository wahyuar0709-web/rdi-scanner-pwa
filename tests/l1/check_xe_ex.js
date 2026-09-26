/* L1 kontrak escaper (2026-09-27) — sebelumnya file ini skrip diagnostik 0-assert
 * (mengebandingkan xe vs ex dan mencetak "EQ: false" yang menyesatkan).
 * Sekarang suite sungguhan: MENGEKSEKUSI fungsi asli js/util.js lalu menguji kontraknya.
 * Escaper adalah pertahanan XSS utama aplikasi (172 sink innerHTML), jadi harusdikunci.
 * Catatan kontrak penting:
 *   - xe()/ex() TIDAK escape single-quote → hanya aman untuk atribut berkoma-ganda & teks.
 *   - xeJs() escape backslash DULU → wajib untuk literal JS di dalam atribut onclick. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const utilSrc = fs.readFileSync(path.join(ROOT, 'js', 'util.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0, other = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
function limit(name, detail) { other++; console.log('ACCEPTED LIMITATION | ' + name + (detail ? ' | ' + detail : '')); }

// eksekusi util.js apa adanya (qrcode dicek typeof di dalam qrImgSrc → aman tanpa vendor)
let api = null, execErr = null;
try {
  api = new Function(utilSrc + '\n;return {xe:xe,xeJs:xeJs,ex:ex,qrImgSrc:qrImgSrc,rakDisplay:rakDisplay,buildQrPayload:buildQrPayload};')();
} catch (e) { execErr = e.message; }
t('escaper: js/util.js dapat dieksekusi', !!api, execErr || 'xe/xeJs/ex/qrImgSrc/rakDisplay/buildQrPayload tersedia');
if (api) {
  const { xe, xeJs, ex, qrImgSrc, rakDisplay, buildQrPayload } = api;

  t('xe: escape & < > "', xe('a&b<c>d"e') === 'a&amp;b&lt;c&gt;d&quot;e', JSON.stringify(xe('a&b<c>d"e')));
  t('ex: escape & < > " (identik dgn xe)', ex('a&b<c>d"e') === xe('a&b<c>d"e'), JSON.stringify(ex('a&b<c>d"e')));
  t('xe: payload <img src=x onerror=... jadi teks', xe('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;', JSON.stringify(xe('<img src=x onerror=alert(1)>')));
  t('xe: null/undefined -> string kosong', xe(null) === '' && xe(undefined) === '', JSON.stringify([xe(null), xe(undefined)]));
  t('xe: angka 0 tidak jadi kosong', xe(0) === '0', JSON.stringify(xe(0)));
  t('ex: angka 0 tidak jadi kosong', ex(0) === '0', JSON.stringify(ex(0)));

  // xeJs: urutan backslash-lalu-quote (fix XSS kritikal) + '&' di-escape TERAKHIR (doble-escape disengaja)
  const j = xeJs("O'Brien\\X <b>");
  t("xeJs: backslash di-escape sebelum quote", j.indexOf("\\\\") >= 0, JSON.stringify(j));
  t("xeJs: single-quote di-escape", j.indexOf("\\'") >= 0, JSON.stringify(j));
  t('xeJs: tag jadi &lt;b&gt; lalu & di-escape terakhir (doble-escape disengaja)',
    j.indexOf('&amp;lt;b&amp;gt;') >= 0, 'output=' + JSON.stringify(j));
  // inti fix XSS: hasil xeJs, kalau ditaruh di literal JS berkoma-tunggal, HARUS kembali
  // persis ke input (tidak bisa "break out"). Ini uji round-trip, bukan cek jumlah karakter.
  // (1) input TANPA karakter HTML → round-trip lewat literal JS harus persis kembali
  ["O'Brien", 'a\\b', "\\'", 'back\\\\slash'].forEach(input => {
    const out = xeJs(input);
    let back = null;
    try { back = new Function("return '" + out + "'")(); } catch (e) { back = 'THROW:' + e.message; }
    t('xeJs round-trip literal JS: ' + JSON.stringify(input), back === input, 'out=' + JSON.stringify(out) + ' back=' + JSON.stringify(back));
  });
  // (2) input DENGAN karakter HTML → harus jadi entity, tidak boleh ada karakter mentah
  //     (xeJs memang hybrid: aman untuk literal JS DAN atribut HTML)
  // (2) input DENGAN karakter HTML → jadi entity, tidak boleh ada karakter mentah.
  //     CATATAN PENTING: karena '&' di-escape TERAKHIR, entity yang sudah formed jadi
  //     double-escape: '<' → '&lt;' → '&amp;lt;'. ITU disengaja & aman (dipakai di dalam
  //     literal JS pada atribut HTML, harus tampil sebagai TEKS). Ekspektasi suite ini
  //     mengunci perilaku tersebut supaya tidak ada yang "memperbaiki" lalu merusak XSS fix.
  [["it's\\\"mix", '&amp;quot;'], ['<img src=x>', '&amp;lt;'], ['a&b', '&amp;'], ['5>3', '&amp;gt;']]
    .forEach(([input, entity]) => {
      const out = xeJs(input);
      const noRaw = !/["<>]/.test(out.replace(/&(amp|lt|gt|quot);/g, ''));
      t('xeJs escape HTML (double-escape disengaja): ' + JSON.stringify(input) + ' → ' + entity,
        out.indexOf(entity) >= 0 && noRaw, 'out=' + JSON.stringify(out));
    });
  const bq = xeJs("\\'");
  t('xeJs: backslash+quote → 4 karakter (\\, \\, \\, \')', bq.length === 4 && bq.split('').join('') === '\\\\\\\'', 'out=' + JSON.stringify(bq));
  t('xeJs: 0 tetap "0" (tak jadi kosong)', xeJs(0) === '0', JSON.stringify(xeJs(0)));
  t('xeJs: false jadi "false" (tak jadi kosong)', xeJs(false) === 'false', JSON.stringify(xeJs(false)));

  t('buildQrPayload: format id|nama|rak', buildQrPayload('ID-1', 'Bearing', 'A-01') === 'ID-1|Bearing|A-01', buildQrPayload('ID-1', 'Bearing', 'A-01'));
  t('buildQrPayload: id kosong tetap 3 bagian (builder label pakai fallback MAT###)', buildQrPayload('', 'Bearing', '') === '|Bearing|', JSON.stringify(buildQrPayload('', 'Bearing', '')));
  t('rakDisplay: buang sufiks :N (takeoff DoorBox)', rakDisplay('A-01:3') === 'A-01', JSON.stringify(rakDisplay('A-01:3')));
  t('rakDisplay: rak polos tetap', rakDisplay('A-01') === 'A-01', JSON.stringify(rakDisplay('A-01')));
  t('rakDisplay: kosong tetap kosong', rakDisplay('') === '', JSON.stringify(rakDisplay('')));

  const fb = qrImgSrc('apa saja', 10);
  t('qrImgSrc: fallback 1px bila library qrcode tidak ada (tidak blank)', typeof fb === 'string' && fb.indexOf('data:image/gif;base64') === 0, fb.slice(0, 32));

  limit('xe/ex tidak escape single-quote', 'wajib pakai xeJs() untuk literal JS di atribut onclick (sudah dikunci di suite ini)');
} else {
  fail++; console.log('FAIL | escaper: tidak bisa dieksekusi — suite lain tidak dapat diandalkan | ' + (execErr || ''));
}

// definisi tunggal di seluruh file front-end
const feFiles = ['index.html', 'js/util.js', 'js/format.js', 'js/cetak.js', 'js/outbox.js'];
let fe = '';
feFiles.forEach(f => { fe += '\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'); });
['xe', 'xeJs', 'ex', 'qrImgSrc', 'rakDisplay', 'buildQrPayload'].forEach(fn => {
  const n = (fe.match(new RegExp('function\\s+' + fn + '\\s*\\(', 'g')) || []).length;
  t('definisi unik: ' + fn + '()', n === 1, ' definisi=' + n);
});

// escaper benar-benar dipakai di jalur render (bukan cuma ada)
t('xe() dipakai di FE (>20 call site)', (fe.match(/\bxe\(/g) || []).length > 20, 'call=' + (fe.match(/\bxe\(/g) || []).length);
t('xeJs() dipakai untuk argumen inline handler', (fe.match(/\bxeJs\(/g) || []).length > 5, 'call=' + (fe.match(/\bxeJs\(/g) || []).length);
t('ex() dipakai di js/cetak.js untuk HTML cetak', /ex\(/.test(fs.readFileSync(path.join(ROOT, 'js', 'cetak.js'), 'utf8')), 'js/cetak.js');
void html;

console.log('---- check_xe_ex: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
