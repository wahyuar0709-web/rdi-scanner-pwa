/* ============================================================================
 *  L1 gate - BUG-1 / BUG-2 / BUG-2c / BUG-3  (tanggal 2026-10-15)
 * ============================================================================
 *
 * BUG-1 (KRITIS): safeCell_ merusak KUNCI GABUNG antar sheet
 *   safeCell_() mengubah teks berawalan = + - @ menjadi "'v" (tanda kutip
 *   paksa-teks). Untuk kolom teks bebas itu benar. Tapi RAK adalah kunci gabung
 *   Transaksi_Log <-> Stok_Per_Rak.
 *
 *   updateRakSaldo() melakukan proteksi formula pada nilai rak DI AWAL fungsi,
 *   lalu memakai nilai yang sudah ter-corrupt itu sebagai kunci findRowIndex().
 *   Untuk RAK berawalan "-" (placeholder yang dipakai importExcel dan data
 *   produksi), bentuk yang DICARI tidak lagi sama dengan bentuk yang TERSIMPAN
 *   -> idx = -1 -> appendRow() -> Stok_Per_Rak pecah jadi banyak baris untuk
 *   satu item+rak yang sama.
 *
 *   Gejalanya nyata: transaksi uji "Majun / MRO-01-09-137" memakai RAK = "-".
 *
 * BUG-2: kelas identik di Kode_Alat (kunci gabung Aset_Item <-> Aset_Unit <->
 *   Aset_Movement_Log). Akibatnya cek duplikat lolos, cek foreign key gagal,
 *   nomor Unit_ID kembar menumpuk, daftar unit & riwayat asah kosong.
 *
 * BUG-2c: nilai tampilan masih mentah -> operator melihat tanda kutip.
 *
 * BUG-3: manifest.json (background_color + theme_color) dan <meta
 *   name="theme-color"> masih #f3efe6 (krem hangat lama) padahal redesign §18
 *   sudah pindah ke --bg #F1F4F9 (light) / #0A1017 (dark). #f3efe6 sudah tidak
 *   ada lagi di palette baru.
 *
 * ============================================================================
 *  PENJAGA ANTI-HAMPA DI DALAM FILE INI
 * ============================================================================
 *  Dua jebakan nyata terjadi saat mengerjakan perbaikan ini, dan keduanya
 *  hampir membuat gate hijau tanpa ada yang diuji:
 *
 *  1. Gate SEC-D7 di sec_classify.js memakai /safeCell_\(/ - dan komentar
 *     explain yang menulis "rak = safeCell_(rak)" secara harfiah,ia cocok ke
 *     TEKS KOMENTAR. Gate akan tetap hijau walau safeCell_ benar-benar
 *     dihapus dari updateRakSaldo. Karena itu assert di sini MENGHINDARI
 *     baris komentar dan baris pembungkus blok-komentar - hanya menghitung
 *     panggilan di baris kode nyata.
 *
 *  2. SEC-D7 memakai jendela 6000 karakter dari awal fungsi. Fungsi
 *     postTransaksi sendiri 11.246 karakter, jadi hanya ada sisa ~40 karakter.
 *     Menambah komentar di dalamnya membuat gate gagal. Jendelanya
 *     sengaja TIDAK dilonggarkan: melemahkan gate supaya kode bisa lulus
 *     adalah cara membuat test tidak berguna. Penjelasan dipindah ke blok
 *     dokumentasi textMarkerStrip_ sebagai gantinya.
 * ============================================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const gs = read('Code.gs');
const html = read('index.html');
const manifest = read('manifest.json');
const sw = read('sw.js');

let pass = 0, fail = 0;
const t = (n, ok, ev) => {
  if (ok) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (ev ? '\n        ' + ev : '')); }
};
const bodyOf = (src, fn) => {
  const i = src.indexOf('function ' + fn);
  if (i < 0) return '';
  const j = src.indexOf('\r\nfunction ', i);
  return src.slice(i, j < 0 ? src.length : j);
};

/* Panggilan safeCell_ di BARIS KODE saja - bukan di komentar, bukan di blok
 * baris pembungkus blok-komentar. Inilah penjaga anti-hampa yang hilang di
 * SEC-D7. */
const codeCalls = (body, fname) => {
  const out = [];
  body.split('\r\n').forEach((ln, i) => {
    const kode = ln.replace(/^\s+/, '');
    if (kode.startsWith('//') || kode.startsWith('*') || kode.startsWith('/*')) return;
    let x = ln;
    while (true) {
      const k = x.indexOf(fname + '(');
      if (k < 0) break;
      out.push(x.slice(k, k + 40));
      x = x.slice(k + fname.length + 1);
    }
  });
  return out;
};

console.log('=== BUG-1: RAK tidak boleh merusak kunci gabung ===');
t('BUG1-1: helper textMarkerStrip_ ada',
  /function textMarkerStrip_\(v\)\s*\{[\s\S]{0,300}while \(t\.charAt\(0\) === "'"\)\s*t = t\.slice\(1\);/.test(gs));
t('BUG1-2: helper findRowIndexLoose ada',
  /function findRowIndexLoose\(data, matchers\)\s*\{[\s\S]{0,400}textMarkerStrip_\(row\[col\]\)/.test(gs));
t('BUG1-3: updateRakSaldo TIDAWSAH men-corrupt nilai rak di awal fungsi',
  !/function updateRakSaldo\([\s\S]{0,400}?\n  rak = safeCell_\(rak\);/.test(gs),
  'masih ada "rak = safeCell_(rak)" sebagai pernyataan, bukan di baris rowData');
t('BUG1-4: updateRakSaldo menyimpan kunci rak terpisah',
  /var rakKey = rak;/.test(bodyOf(gs, 'updateRakSaldo')));
t('BUG1-5: lookup Stok_Per_Rak pakai findRowIndexLoose + rakKey',
  /findRowIndexLoose\(existing, \[\[COL_RAK_SALDO\.ID, itemId\], \[COL_RAK_SALDO\.RAK, rakKey\]\]\)/.test(gs));
t('BUG1-6: proteksi formula saat MENULIS tetap ada (rowData)',
  /var rowData = \[itemId, safeCell_\(rak\), newQty\];/.test(gs),
  'proteksi formula tidak boleh hilang hanya karena lookup diubah');
t('BUG1-7: perbandingan saldo rak di postTransaksi ternormalisasi',
  /var rakKeyTrim = textMarkerStrip_\(rak\);[\s\S]{0,160}textMarkerStrip_\(rb\.rak\)===rakKeyTrim/.test(gs));
t('BUG1-8: Transaksi_Log tetap memakai safeCell_(rak)',
  /jenis, qty, safeCell_\(rak\), safeCell_\(vendor\)/.test(gs));
t('BUG1-9: findRowIndex ASLI tidak diubah (hanya varian baru yang ditambahkan)',
  /function findRowIndex\(data, matchers\)[\s\S]{0,400}if \(String\(row\[col\]\|\|''\)\.trim\(\)\.toUpperCase\(\) !== val\)/.test(gs));
t('BUG1-10: safeCell_ ASLI tidak diubah',
  /if \(\/\^\[=\+\\-\@\\t\\r\]\/\.test\(s\)\) return "'" \+ s;/.test(gs));

console.log('\n=== BUG-2: Kode_Alat (kunci gabung 3 sheet Aset) ===');
const B2 = [
  ['BUG2-1 generateAsetUnitId_', /textMarkerStrip_\(kode\) !== textMarkerStrip_\(kodeAlat\)\.trim\(\)/],
  ['BUG2-2 addAsetItem cek duplikat', /textMarkerStrip_\(existing\[i\]\[0\]\)\.trim\(\) === textMarkerStrip_\(kodeAlat\)\.trim\(\)/],
  ['BUG2-3 addAsetUnit cek foreign key', /textMarkerStrip_\(kodeCol\[i\]\[0\]\)\.trim\(\) === textMarkerStrip_\(kodeAlat\)\.trim\(\)/],
  ['BUG2-4 getAsetUnitList filter', /textMarkerStrip_\(r\[COL_ASET_UNIT\.KODE_ALAT\]\)\.trim\(\) !== textMarkerStrip_\(kode\)\.trim\(\)/],
  ['BUG2-5 getAsetEligibleUnits filter', /textMarkerStrip_\(r\[COL_ASET_UNIT\.KODE_ALAT\]\)\.trim\(\) !== textMarkerStrip_\(kode\)\.trim\(\)/],
  ['BUG2-6 kontrol asah baca', /var kodeAlat = textMarkerStrip_\(r\[COL_ASET_LOG\.KODE_ALAT\]\)\.trim\(\)/],
  ['BUG2-7 recordAsetMovement baca', /var kodeAlat = textMarkerStrip_\(row\[COL_ASET_UNIT\.KODE_ALAT\]\)\.trim\(\)/],
];
B2.forEach(([n, re]) => t(n, re.test(gs)));
t('BUG2-8: tidak ada sisa perbandingan Kode_Alat mentah',
  !/String\(r\[COL_ASET_(UNIT|ITEM)\.KODE_ALAT\] \|\| ''\)\.trim\(\) [!=]== kode\b/.test(gs));
t('BUG2-9: penulisan Kode_Alat tetap dilindungi',
  /newNo, safeCell_\(kodeAlat\),/.test(gs) && /unitId, safeCell_\(kodeAlat\),/.test(gs));

console.log('\n=== BUG-2c: tampilan bersih dari tanda kutip paksa-teks ===');
t('BUG2C-1: 4 tampilan RAK dari Transaksi_Log ternormalisasi',
  (gs.match(/rak:\s*textMarkerStrip_\(row\[COL_TRX\.RAK\]/g) || []).length === 4,
  'dapat ' + (gs.match(/rak:\s*textMarkerStrip_\(row\[COL_TRX\.RAK\]/g) || []).length);
t('BUG2C-2: 2 tampilan RAK dari Stok_Per_Rak ternormalisasi',
  (gs.match(/rak:\s*textMarkerStrip_\([a-z]+\[COL_RAK_SALDO\.RAK\]/g) || []).length === 2);
t('BUG2C-3: 3 tampilan Kode_Alat ternormalisasi',
  (gs.match(/kodeAlat:\s*textMarkerStrip_\(/g) || []).length === 3);
t('BUG2C-4: Master_Rak ikut ternormalisasi saat resync',
  /addDedup\(rakSet, textMarkerStrip_\(r\[COL_RAK_SALDO\.RAK\]\)\)/.test(gs));
t('BUG2C-5: tidak ada lagi "rak: String(row[COL_TRX.RAK]...) polos',
  !/rak:\s*String\(row\[COL_TRX\.RAK\]/.test(gs));

console.log('\n=== ANTI-HAMPA: gate ini hanya menghitung panggilan NYATA ===');
/* Kalau gate ini bisa hijau tanpa safeCell_ di updateRakSaldo, maka ia sama
 * tidak berguna dengan SEC-D7 yang dulu bisa cocok ke komentar. */
['postTransaksi', 'updateItem', 'addItem', 'updateSaldo', 'updateRakSaldo'].forEach(fn => {
  const body = bodyOf(gs, fn);
  const calls = codeCalls(body, 'safeCell_');
  const offset = body.search(/safeCell_\(/);
  t('HAPA-' + fn + ': ada panggilan safeCell_ di baris kode nyata', calls.length > 0,
    'hanya cocok ke komentar - gate ini akan hampa');
  t('HAPA-' + fn + ': kemunculan pertama dalam jendela 6000 (konsisten dgn SEC-D7)',
    offset >= 0 && offset < 6000, 'offset=' + offset);
});
/* Bukti langsung: hapus panggilan, gate harus ikut mati. */
{
  const tanpa = bodyOf(gs, 'updateRakSaldo').replace(/safeCell_\(/g, 'HAPUS(');
  t('HAPA-bukti: tanpa panggilan, tidak ada yang cocok',
    codeCalls(tanpa, 'safeCell_').length === 0 && !/safeCell_\(/.test(tanpa));
}

console.log('\n=== BUG-3: warna manifest & meta theme-color ===');
t('BUG3-1: manifest.json tidak lagi #f3efe6', !/f3efe6/i.test(manifest));
t('BUG3-2: index.html tidak lagi #f3efe6', !/f3efe6/i.test(html),
  'warna krem hangat lama masih ada: ' + (html.match(/f3efe6/gi) || []).length + 'x');
t('BUG3-3: manifest background_color = #f1f4f9 (sama dengan --bg light)',
  /"background_color"\s*:\s*"#f1f4f9"/i.test(manifest));
t('BUG3-4: manifest theme_color = #f1f4f9', /"theme_color"\s*:\s*"#f1f4f9"/i.test(manifest));
t('BUG3-5: warna manifest benar-benar ada sebagai token --bg di index.html',
  /--bg:#F1F4F9;/i.test(html),
  'manifest harus memakai warna yang benar-benar dipakai aplikasi');
t('BUG3-6: meta theme-color di index.html = #f1f4f9',
  /<meta name="theme-color" content="#f1f4f9">/i.test(html));
t('BUG3-7: hanya ada satu meta theme-color', (html.match(/<meta name="theme-color"/g) || []).length === 1);
t('BUG3-8: manifest.json tetap JSON valid', (() => { try { JSON.parse(manifest); return true; } catch (e) { return false; } })());

console.log('\n=== TIDAK BOLEH BERUBAH (regression lock) ===');
const LOCK = [
  ['LOCK-1: --bg light tetap #F1F4F9', /--bg:#F1F4F9;/i.test(html)],
  ['LOCK-2: --bg dark tetap #0A1017', /--bg:#0A1017;/i.test(html)],
  ['LOCK-3: #78716c tetap dilarang (gate ui06d)', !/#78716c/i.test(html)],
  ['LOCK-4: #f59e0b tidak dipakai sebagai color: (hanya gradient/border)',
    !/(^|[^-])color:\s*#f59e0b/i.test(html)],
  ['LOCK-5: --br-16 tetap 16px (gate cetak_bar_layout)', /--br-16:16px/.test(html)],
  ['LOCK-6: sw.js CACHE tidak diubah', /CACHE = 'rdi-stok-v41'/.test(sw)],
  ['LOCK-7: sw.js precache tetap 16 aset terakhir', /'\.\/js\/html2pdf\.bundle\.min\.js'/.test(sw)],
  ['LOCK-8: API_VERSION masih v5.28', /API_VERSION = 'v5\.28'/.test(gs)],
  ['LOCK-9: API_BUILD masih 2026-10-13.1', /API_BUILD\s*=\s*'2026-10-13\.1'/.test(gs)],
  ['LOCK-10: kontrak uncertain masih ada di postTransaksi', /genericError_\('postTransaksi', true\)/.test(gs)],
  ['LOCK-11: genericError_ ASLI tidak diubah',
    /function genericError_\(fnName, uncertain\)\s*\{\s*var r = \{ status: 'error', message: 'Terjadi kesalahan pada '/.test(gs)],
  ['LOCK-12: importKey_ handling tanda kutip lama tetap ada', /replace\(\/\^'\/, ''\)/.test(gs)],
  ['LOCK-13: aturan stok 0 urut paling belakang (§19.8) utuh',
    /var az=\(parseFloat\(a\.qty\)\|\|0\)===0,bz=\(parseFloat\(b\.qty\)\|\|0\)===0;if\(az!==bz\)return az\?1:-1;/.test(html)],
];
LOCK.forEach(([n, ok]) => t(n, ok));

console.log('\n=== encoding ===');
[['Code.gs', '\r\n'], ['index.html', '\r\n'], ['sw.js', '\r\n'], ['manifest.json', '\n']].forEach(([f, eol]) => {
  const b = fs.readFileSync(path.join(ROOT, f));
  const c = b.toString('utf8');
  const utama = eol === '\r\n' ? (c.match(/\r\n/g) || []).length : (c.match(/(?<!\r)\n/g) || []).length;
  const lain = eol === '\r\n' ? (c.match(/(?<!\r)\n/g) || []).length : (c.match(/\r\n/g) || []).length;
  t('ENC: ' + f + ' tanpa BOM/U+FFFD, EOL tunggal',
    b[0] !== 0xEF && !/\uFFFD/.test(c) && lain === 0 && utama > 0);
});

console.log('\n---- ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
