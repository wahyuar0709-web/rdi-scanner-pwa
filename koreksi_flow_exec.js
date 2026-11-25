/* L1: alur Koreksi transaksi di detail riwayat (audit UX 2026-11 #7) + label jenis PINDAH.
 * Ledger append-only -> koreksi = entri LAWAN (Masuk<->Keluar), qty/rak sama, alasan wajib. PINDAH tidak bisa dikoreksi di sini. */
const fs = require('fs'), path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); } };
const cut = (a, b) => { const i = idx.indexOf(a); return i < 0 ? '' : idx.slice(i, idx.indexOf(b, i + a.length)); };

const modal = cut('id="modal-hist-card-detail"', 'id="section-dashboard"');
ok('tombol Koreksi ada di modal detail riwayat & terhubung ke koreksiFromHistCard()', /id="hist-koreksi-btn"[^>]*onclick="koreksiFromHistCard\(\)"/.test(modal));
ok('koreksiFromHistCard diekspor ke window (handler inline harus global)', /window\.koreksiFromHistCard=koreksiFromHistCard;/.test(idx));
const k = cut('function koreksiFromHistCard(){', 'function _applyPendingKoreksi(){');
ok("jenis koreksi = kebalikan (MASUK->KELUAR, KELUAR->MASUK)", /jenis:j==='MASUK'\?'KELUAR':'MASUK'/.test(k));
ok('hanya MASUK/KELUAR yang bisa dikoreksi', /if\(j!=='MASUK'&&j!=='KELUAR'\)return;/.test(k));
const d = cut('function showHistCardDetail(cardKey){', 'function closeHistCardDetail(){');
ok('tombol disembunyikan untuk viewer, tanpa itemId, dan jenis selain MASUK/KELUAR', /viewer-mode/.test(d) && /!r\.itemId/.test(d) && /_kj!=='MASUK'&&_kj!=='KELUAR'/.test(d));
ok('detail menamai PINDAH sebagai "Pindah Rak" (dulu "Barang Keluar")', /'Pindah Rak':'Barang Keluar'/.test(d) && /'swap':'down'/.test(d));
const a = cut('function _applyPendingKoreksi(){', 'function closeHistCardDetail(){');
ok('form diisi: jenis, qty (desimal), rak, keterangan berawalan KOREKSI', /setJenis\(k\.jenis\)/.test(a) && /parseQty\(k\.qty\)/.test(a) && /KOREKSI atas transaksi /.test(a));
ok('dipanggil setelah item termuat di lookupItem (bukan di goTransaksiFromCekStok)', cut('function lookupItem(', 'function goToTransaksi').indexOf('_applyPendingKoreksi()') > 0 && cut('function goTransaksiFromCekStok(', 'function lookupItem(').indexOf('_applyPendingKoreksi') < 0);
const s = cut('function submitTransaksi(){', 'return;}', );
const sub = idx.slice(idx.indexOf('function submitTransaksi(){'), idx.indexOf('function submitTransaksi(){') + 2200);
ok('submit menolak koreksi tanpa alasan (>=3 huruf)', /_kp&&ket\.indexOf\(_kp\)===0&&ket\.slice\(_kp\.length\)\.trim\(\)\.length<3/.test(sub) && /Isi alasan koreksi/.test(sub));
ok('state koreksi dibersihkan saat kembali ke langkah awal', /if\(name==='input'\)\{_koreksiPrefix='';_koreksiPending=null;\}/.test(idx));
console.log('PASS | koreksi_flow_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
