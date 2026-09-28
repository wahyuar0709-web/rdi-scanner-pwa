/* L1 suite: parseDateKey() — kontrak "kunci periode" (js/format.js).
 *
 * Konteks: index.html:2719 (renderOperatorProductivity) memfilter baris transaksi
 * dengan `parseDateKey(String(r.timestamp||'')) >= minKey`, di mana minKey
 * berbentuk '2026-09-01'. Karena perbandingan itu LEKSIKRAF string, nilai sampah
 * apa pun yang lebih besar secara leksikografis akan LOLOS. Versi lama
 * mengembalikan `ts.split(' ')[0] || ts.substring(0,10) || 'unknown'` tanpa
 * validasi, sehingga 'bukan tanggal' -> 'bukan', 'null' -> 'null', 'NaN' -> 'NaN'
 * — semuanya lolos filter dan ikut terhitung pada periode mana pun.
 *
 * Suite ini memanggil js/format.js sungguhan lewat vm, bukan mencocokkan string
 * source, supaya regresi perilaku benar-benar terdeteksi.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const F = path.join(ROOT, 'js', 'format.js');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) {
    pass++;
    console.log('PASS ' + name);
  } else {
    fail++;
    console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''));
  }
};

const src = fs.readFileSync(F, 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'format.js' });

const pdk = ctx.parseDateKey;
const fdl = ctx.formatDayLabel;

ok('format.js termuat dan fungsi terdefine', typeof pdk === 'function' && typeof fdl === 'function');

/* --- 1. Format yang BENAR-BENAR dipakai produksi harus tetap diparse --- */
ok('ISO YYYY-MM-DD', pdk('2026-09-27') === '2026-09-27', pdk('2026-09-27'));
ok('ISO 8601 dari Date (log aset, Code.gs:3508)', pdk('2026-09-27T07:03:00.000Z') === '2026-09-27', pdk('2026-09-27T07:03:00.000Z'));
ok('Indonesia dd/MM/yyyy HH:mm (Code.gs fmtDateTime)', pdk('27/09/2026 14:03') === '2026-09-27', pdk('27/09/2026 14:03'));
ok('Indonesia dd/MM/yyyy tanpa jam', pdk('27/09/2026') === '2026-09-27', pdk('27/09/2026'));
ok('Date.toString() (fallback Utilities/String(val))', /^\d{4}-\d{2}-\d{2}$/.test(pdk(new Date(2026, 8, 27).toString())), pdk(new Date(2026, 8, 27).toString()));

/* --- 2. Sampah TIDAK BOLEH jadi string yang bocor ke UI --- */
const junk = ['', '   ', 'bukan tanggal', 'unknown', 'null', 'undefined', 'NaN', '-', '??-??-??', '0', 'false'];
for (const j of junk) {
  const r = pdk(j);
  ok('junk ' + JSON.stringify(j) + ' tidak menghasilkan "unknown"', r !== 'unknown', r);
}

/* --- 3. REGRESI INTI: sampah tidak boleh lolos filter periode --- */
const minKey = '2026-09-01';
for (const j of junk) {
  const k = pdk(j);
  ok('filter periode menolak ' + JSON.stringify(j), !(k >= minKey), { key: k, lolos: k >= minKey });
}
ok('baris valid di dalam periode tetap lolos', pdk('27/09/2026 14:03') >= minKey);
ok('baris valid sebelum periode tetap ditolak', !(pdk('31/08/2026 23:59') >= minKey));
ok('baris valid tepat di batas periode lolos (>= bersifat inklusif)', pdk('2026-09-01') >= minKey);

/* --- 4. formatDayLabel tidak boleh menampilkan kata Inggris --- */
const labels = junk.map((j) => fdl(pdk(j)));
ok('tidak ada label "unknown" dari datasampah', !labels.some((l) => /unknown/i.test(String(l))), labels);
ok('semua labelsampah bukan string kosong', labels.every((l) => typeof l === 'string' && l.length > 0), labels);
ok('label sampelah konsisten satu nilai', new Set(labels).size === 1, labels);
ok('label fallback berbahasa Indonesia', labels[0] === 'Tanpa tanggal', labels[0]);
ok('label tanggal valid tetap Bahasa Indonesia', /2026/.test(fdl('2026-09-27')), fdl('2026-09-27'));
ok("formatDayLabel string kosong aman dipanggil langsung", fdl('') === 'Tanpa tanggal', fdl(''));

console.log('PASS | format_parsedatekey_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
