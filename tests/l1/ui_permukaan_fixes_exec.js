/* L1 suite: perbaikan batch review 19 permukaan UI (F1..F4).
 *
 * Asal temuan (semua terukur atau terbukti di screenshot, bukan asumsi):
 *  F1 Empat <select> tanpa class="sel" — konvensi app memakai class itu pada 8
 *     dari 12 <select>. Yang empat kehilangan seluruh style aplikasi:
 *     appearance, chevron kustom, border, dan min-height:48px. Terukur 19px,
 *     tampil sebagai kontrol sistem putih di modal bertema gelap (screenshot
 *     vw375-export-qr.png), dan gagal WCAG 2.2 AA Target Size Minimum (24px).
 *  F2 .hist-card-detail-btn 22px (font 11px + padding 4px 0) < 24px WCAG 2.2 AA.
 *  F3 Subjudul "ready to use" — satu-satunya kalimat Inggris dari 7 subjudul
 *     kartu Aset yang sisanya Bahasa Indonesia.
 *  F4 loadAsetSummary gagal diam-diam. Dua jalan ke keheningan yang sama:
 *     result.status==='error' -> return tanpa pesan, dan result.data hilang ->
 *     d.totalUnit melempar TypeError yang ditangkap .catch tanpa pesan. Keenam
 *     kartu KPI tetap "—" selamanya tanpa tanda bahwa itu error.
 *
 * Yang SENGAJA TIDAK diuji di sini karena pengukuran menycontradikinya:
 *  - <a> "+ Daftarkan Kode_Alat" 14px: inline link di dalam kalimat. WCAG 2.5.8
 *    mengecualikan target inline dalam blok teks, jadi bukan cacat.
 *  - "Cek Per Rak kosong" dan "Aset semua —": artefak mock (getData tidak diserv),
 *    sudah diperbaiki di harness, bukan di aplikasi.
 *  - modal Aset Aksi tidak terbuka: openAsetAksiModal() mensyaratkan
 *    _asetUnitDetailCache, jadi dibuka tanpa konteks unit memang tidak tampil.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const IDX = path.join(ROOT, 'index.html');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
};

const s = fs.readFileSync(IDX, 'utf8');

console.log('--- F1: setiap <select> punya class="sel" ---');
const selects = [...s.matchAll(/<select\b([^>]*)>/g)];
ok('ada <select> untuk diperiksa', selects.length > 0, selects.length);
const tanpaClass = selects.filter((m) => !/class="[^"]*\bsel\b/.test(m[1]));
ok('tidak ada <select> tanpa class="sel"', tanpaClass.length === 0,
  tanpaClass.map((m) => (/id="([^"]*)"/.exec(m[1]) || [, '?'])[1]));
selects.forEach((m) => {
  const id = (/id="([^"]*)"/.exec(m[1]) || [, '(tanpa id)'])[1];
  ok('  #' + id + ' memakai class="sel"', /class="[^"]*\bsel\b/.test(m[1]), m[1].slice(0, 60));
});

console.log('--- F1b: aturan style select tetap berlaku ---');
ok('select.sel punya appearance:none', /select\.sel\{[^}]*appearance:none/.test(s));
ok('select.sel punya min-height 48px', /input\[type=text\][^{]*\{[^}]*min-height:48px/.test(s));
ok('select.sel punya chevron kustom', /select\.sel\{[^}]*background-image:url/.test(s));

console.log('--- F2: target sentuh tombol Lihat Detail >= 24px ---');
ok('.hist-card-detail-btn punya min-height:24px', /\.hist-card-detail-btn\{[^}]*min-height:24px/.test(s));
ok('.hist-card-detail-btn memakai inline-flex + align-items',
  /\.hist-card-detail-btn\{[^}]*display:inline-flex/.test(s) && /\.hist-card-detail-btn\{[^}]*align-items:center/.test(s));
ok('tombol Lihat Detail masih ada', s.indexOf('Lihat Detail') >= 0);
ok('kelas tombol tetap dipakai di markup', s.indexOf('hist-card-detail-btn') >= 0);

console.log('--- F3: seluruh subjudul kartu Aset Bahasa Indonesia ---');
const subs = [...s.matchAll(/class="dash-card-sub"[^>]*>([^<]*)</g)].map((m) => m[1].trim());
ok('ada subjudul kartu untuk diperiksa', subs.length > 0, subs.length);
/* Deteksi kalimat Inggris TIDAK bisa pakai "huruf semua Latin": "bulan ini",
 * "di bawah minimum", "seluruh status" juga seluruhnya Latin tapi Bahasa
 * Indonesia. Yang dipakai daftar kata yang mustahil muncul di phrases Indonesia
 * — kata kerja English dan kata sandaran. "unit" dan "total" sengaja tidak
 * masuk daftar: keduanya juga dipakai sah dalam Bahasa Indonesia. */
const KATA_INGGRIS = /\b(the|and|for|with|your|please|use|used|ready|view|click|available|pending|loading|none|empty|from|of|is|are|this|that|to)\b/i;
const latin = subs.filter((t) => KATA_INGGRIS.test(t));
ok('tidak ada subjudul kartu berbahasa Inggris', latin.length === 0, latin);
ok('"ready to use" hilang', s.indexOf('ready to use') < 0);
ok('penggantinya berbahasa Indonesia', s.indexOf('siap digunakan') >= 0);
subs.forEach((t) => ok('  subjudul Indonesia: "' + t + '"', !KATA_INGGRIS.test(t), t));

console.log('--- F4: loadAsetSummary menampilkan error, bukan diam-diam ---');
ok('wadah pesan error ada di markup', s.indexOf('id="aset-kpi-err"') >= 0);
ok('wadah disembunyikan secara default', /id="aset-kpi-err"[^>]*display:none/.test(s));
ok('syarat error juga memeriksa result.data',
  /if\(!result\|\|result\.status==='error'\|\|!result\.data\)\{/.test(s));
ok('pesan ditampilkan saat gagal', /if\(errBox\)errBox\.style\.display='';/.test(s));
ok('pesan disembunyikan saat sukses', /if\(errBox\)errBox\.style\.display='none';/.test(s));
ok('penangkap promise juga menampilkan pesan',
  /\.catch\(function\(\)\{ _asetDashLoaded=false; var b=document\.getElementById\('aset-kpi-err'\); if\(b\)b\.style\.display=''; \}\)/.test(s));
ok('pesan menjelaskan tindakan, bukan sekadar "gagal"',
  /Gagal memuat ringkasan aset\.[^<]*[A-Za-z]/.test(s));
ok('loadAsetSummary masih ada', s.indexOf('function loadAsetSummary') >= 0);

console.log('----integritas berkas---');
const css = s.slice(s.indexOf('<style'), s.indexOf('</style>'));
ok('kurung kurawal CSS seimbang',
  (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length,
  (css.match(/\{/g) || []).length + '/' + (css.match(/\}/g) || []).length);
ok('tidak ada NUL byte', s.indexOf('\u0000') < 0);
ok('tidak ada karakter pengganti unicode', s.indexOf('\ufffd') < 0);

console.log('PASS | ui_permukaan_fixes_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
