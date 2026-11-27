/* L1: kontrak lintas-berkas index.html <-> js/format.js + perbaikan 3 bug (2026-11).
 * Akar bug 2 & 3 (tombol +/-, +5/+10, Pindah Rak "tidak bereaksi"): index.html baru terunggah tetapi js/format.js masih versi lama
 * -> ReferenceError diam-diam. Tes ini menjamin: (a) setiap fungsi format.js yang DIPAKAI index.html memang didefinisikan di format.js,
 * (b) penjaga integritas mencakup semuanya, (c) footer detail membungkus label, (d) pesan gagal Pindah Rak terlihat. */
const fs = require('fs'), path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fmt = fs.readFileSync(path.join(ROOT, 'js', 'format.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); } };

const NEW = ['parseQty', 'fmtQty', 'fmtNum', 'stockGuard', 'anomalyStats', 'isQtyAnomaly'];
NEW.forEach((n) => {
  ok('format.js mendefinisikan ' + n, new RegExp('function ' + n + '\\(').test(fmt));
  ok('index.html memakai ' + n + '() (kontrak aktif)', new RegExp('\\b' + n + '\\(').test(idx.replace(/function [^(]+\(/g, '')));
});
const g = idx.slice(idx.indexOf('PENJAGA INTEGRITAS'), idx.indexOf('BACK PERANGKAT'));
NEW.forEach((n) => ok('penjaga integritas memeriksa ' + n, g.indexOf("'" + n + "'") >= 0));
ok('penjaga menampilkan banner role=alert dan menyebut js/format.js', /role','alert'/.test(g) && /js\/format\.js/.test(g));
ok('penjaga tidak mengganggu bila lengkap (return awal)', /if\(!miss\.length\)return;/.test(g));
// semua fungsi global format.js yang dipanggil dari index.html lainnya (kontrak umum)
const defs = [...fmt.matchAll(/^function (\w+)\(/gm)].map((m) => m[1]);
ok('format.js mendefinisikan minimal 10 fungsi', defs.length >= 10, defs.length);

ok('footer detail: label boleh membungkus (white-space:normal) agar tidak keluar dari tombol',
  /\.item-detail-actions \.btn:not\(#idd-btn-trx\)\{[^}]*white-space:normal[^}]*\}/.test(idx));
ok('footer detail: 3 kolom sama lebar (minmax(0,1fr))', /\.item-detail-actions\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/.test(idx));
ok('footer detail: ikon disembunyikan di <=420px', /max-width:420px\)\{\.item-detail-actions \.btn:not\(#idd-btn-trx\) svg\{display:none\}/.test(idx));

const ps = idx.slice(idx.indexOf('function openPindahSheet(item){'), idx.indexOf("document.getElementById('pindah-overlay').classList.add('show')"));
ok('openPindahSheet: semua pesan gagal lewat _pindahNotice (tidak ada bar.textContent+return yang tersembunyi)', !/bar\.textContent='[^']*';return;/.test(ps) && (ps.match(/_pindahNotice\(bar,/g) || []).length === 3, (ps.match(/_pindahNotice\(bar,/g) || []).length);
ok('_pindahNotice menampilkan toast bila sheet belum terbuka', /function _pindahNotice\(bar,msg\)\{bar\.textContent=msg;if\(!document\.getElementById\('pindah-sheet'\)\.classList\.contains\('show'\)&&window\.rdiToast\)window\.rdiToast\(msg,4200\)/.test(idx));
ok('window.rdiToast diekspor dari modul Back', /window\.rdiToast=toast;/.test(idx));

// pemulihan mandiri saat cache service worker basi (laporan 2026-11-27: HP tetap memakai format.js lama dari cache SW v108 walau repo sudah benar)
ok('banner punya tombol "Perbarui sekarang"', /Perbarui sekarang/.test(g));
ok('tombol membersihkan service worker + Cache Storage lalu memuat ulang (bukan localStorage/IndexedDB, jadi antrean transaksi aman)', /getRegistrations\(\)/.test(g) && /r\.unregister\(\)/.test(g) && /caches\.delete\(/.test(g) && /location\.reload\(\)/.test(g) && !/localStorage|indexedDB/.test(g));
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
ok('sw.js: precache mengambil aset segar (cache:reload) agar instalasi SW tidak menyimpan salinan basi', /new Request\(u, \{ cache: 'reload' \}\)/.test(sw) && /addAll\(/.test(sw));
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'l1', 'sw_shell_manifest.json'), 'utf8'));
ok('nama CACHE di sw.js = manifest', sw.indexOf("const CACHE = '" + man.cache + "'") === 0, man.cache);
ok('CACHE sudah >= v109 (v108 sudah terlanjur terpasang di perangkat dengan format.js lama)', parseInt((man.cache.match(/v(\d+)$/) || [0, 0])[1], 10) >= 109, man.cache);
console.log('PASS | format_contract_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
