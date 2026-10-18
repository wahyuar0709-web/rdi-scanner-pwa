/* L1 PERF v15.33 (2026-10-16): penjaga regresi statis paket perbaikan lag.
 *
 * Konteks: audit lag menemukan hotspot pada (a) fallback fuzzy SINKRON yang
 * memindai seluruh katalog tiap lookup non-exact (0,3-1,8 dtk utk 1-5 rb baris),
 * (b) refresh getData penuh tiap transaksi, (c) decode kamera resolusi penuh
 * di scanner rak, (d) fetch getRakBreakdownAll berulang, (e) splash boot
 * menunggu data GAS, (f) font CDN render-blocking.
 *
 * Suite ini menjaga perbaikan tsb TIDAK kembali ke pola lama (regression guard):
 * 1. fuzzy pass-2 hanya utk katalog kecil (FUZZY_FULL_SCAN_MAX) + pass async
 *    beranggaran waktu dengan token run (batal saat ketik baru / dropdown tutup)
 * 2. lookup non-exact memakai findBestItemFuzzy_ (bukan loop sinkron penuh)
 * 3. kamera master/rak throttle 160 ms + downscale 480 px
 * 4. pasca-transaksi: patch lokal + getItem ringan + refresh katalog gabungan
 *    90 dtk (bukan getData penuh tiap kali)
 * 5. peta rak dipakai bersama (_rakMapFromRows_/_rakRowsFromMap_)
 * 6. DASH_CACHE_TTL 60 dtk; splash boot tidak menunggu data; guard _dataLoading
 * 7. font non-blocking; sw.js HTML network-first + batas waktu 2,5 dtk; CACHE v42
 * 8. review-fix 2026-10-16b (F-1/F-2/F-4/F-5/F-6): peta rak tidak diisi saat error;
 *    batch memicu refresh katalog langsung; dashboard boot tanpa getData ganda;
 *    id item dikunci saat submit; highlight pilihan tidak hilang saat re-render async
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' -> ' + detail : '')); }
}
function cnt(str) { let c = 0, i = 0; while ((i = src.indexOf(str, i)) !== -1) { c++; i += str.length; } return c; }

// --- P-1: fuzzy async beranggaran waktu utk autocomplete ---
t('P-1: token run _acFuzzySeq terdeklarasi', cnt('var _acFuzzySeq={scan:0,hist:0};') === 1);
t('P-1: _acRenderScored terdefinisi & dipanggil dari acShow',
  cnt('function _acRenderScored(ctx,q,scored,pend,keepSel){') === 1 && cnt('_acRenderScored(ctx,q,scored,!!fzRun);') === 1);
t('P-1: _acFuzzyAsync terdefinisi & dipanggil',
  cnt('function _acFuzzyAsync(ctx,q,run,scored,needFuzzy){') === 1 && cnt('_acFuzzyAsync(ctx,q,fzRun,scored,needFuzzy)') === 1);
t('P-1: pass async dicek token run (batal saat query berubah)',
  cnt('if(_acFuzzySeq[ctx]!==run)return;') === 1);
t('P-1: pass async beranggaran waktu (<= ~22ms per chunk)',
  cnt('if(performance.now()-t0>22)break;') === 1);
t('P-1: acHide membatalkan pass async yang masih jalan',
  cnt('if(_acFuzzySeq)_acFuzzySeq[ctx]++;') === 1);
t('P-1: status "Mencari..." tampil saat pass async berjalan',
  cnt('if(pend){drop.innerHTML=') === 1);

// --- P-2: lookup non-exact memakai pemilih terbatas (bukan loop sinkron penuh) ---
t('P-2: findBestItemFuzzy_ terdefinisi', cnt('function findBestItemFuzzy_(raw){') === 1);
t('P-2: FUZZY_FULL_SCAN_MAX=400 (fuzzy penuh hanya utk katalog kecil)',
  cnt('var FUZZY_FULL_SCAN_MAX=400;') === 1);
t('P-2: loop fuzzy sinkron lama SUDAH TIDAK ADA lagi',
  cnt('allRows.forEach(function(r){var res=fuzzyMatch(r,raw.toLowerCase());') === 0);
t('P-2: kedua lookup (scan + riwayat) memakai findBestItemFuzzy_',
  cnt('var best=findBestItemFuzzy_(raw);') === 2);
t('P-2: pass-1 murah (cheapOnly=true) dijalankan di acShow & findBestItemFuzzy_',
  cnt('fuzzyMatch(r,q,true)') === 2, 'dapat ' + cnt('fuzzyMatch(r,q,true)'));
t('P-2: pass-2 penuh di helper DIKUNCI katalog kecil (<= FUZZY_FULL_SCAN_MAX)',
  cnt('if(!best&&allRows.length<=FUZZY_FULL_SCAN_MAX){') === 1);

// --- P-3: kamera (throttle + downscale) ---
t('P-3: scanFrameMaster throttle 160 ms', cnt('if(now-window._lastScanAtMaster<160){') === 1);
t('P-3: scanFrameRak throttle 160 ms', cnt('if(now-window._lastScanAtRak<160){') === 1);
t('P-3: decode resolusi penuh di scanner master SUDAH TIDAK ADA',
  cnt('canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage') === 0);
t('P-3: downscale 480 px dipakai minimal di 3 kamera',
  cnt('var maxDim=480;var scale=Math.min(1,maxDim/Math.max(vw,vh));') >= 3,
  'dapat ' + cnt('var maxDim=480;var scale=Math.min(1,maxDim/Math.max(vw,vh));'));

// --- P-4: pasca-transaksi (patch lokal + refresh gabungan) ---
t('P-4: signature baru silentRefreshAfterTransaksi(itemId,saldoSesudah)',
  cnt('function silentRefreshAfterTransaksi(itemId,saldoSesudah){') === 1);
const srA = src.indexOf('function silentRefreshAfterTransaksi(itemId,saldoSesudah){');
const srB = src.indexOf('function ', srA + 10);
const srBody = src.slice(srA, srB);
t('P-4: body silentRefresh TIDAK memanggil getData penuh', srBody.indexOf("'getData'") === -1);
t('P-4: refresh katalog digabung (coalesced) 90 dtk',
  cnt('var _dataRefreshTimer=null;var DATA_REFRESH_COALESCE_MS=90000;') === 1);
t('P-4: baris item di-patch lokal dari saldoSesudah (respons server)',
  cnt('function _patchRowFromItem(itemId,saldoSesudah){') === 1 && cnt('row.qty=String(saldoSesudah)') === 1);
t('P-4: penyegaran item memakai getItem ringan (bukan katalog penuh)',
  cnt("gasGet({action:'getItem',id:itemId})") === 1);
t('P-4: kedua call-site transaksi tunggal mengirim id + saldoSesudah',
  cnt('silentRefreshAfterTransaksi(_itemIdSubmit,result&&result.saldoSesudah)') === 2);

// --- P-5: peta rak dipakai bersama ---
t('P-5: helper _rakMapFromRows_ & _rakRowsFromMap_ terdefinisi',
  cnt('function _rakMapFromRows_(rows){') === 1 && cnt('function _rakRowsFromMap_(map){') === 1);
t('P-5: tab Rak memakai ulang peta (tidak fetch tiap buka)',
  cnt('if(_rakBreakdownMap){rakBreakdownAll=_rakRowsFromMap_(_rakBreakdownMap);renderRakList();return;}') === 1);
t('P-5: dashboard rak memakai ulang peta bila tersedia',
  cnt('_rakBreakdownMap?Promise.resolve({status:') === 1);

// --- P-6: TTL dashboard + splash + guard memuat ---
t('P-6: DASH_CACHE_TTL 60000 & tidak ada sisa nilai 20000',
  cnt('var DASH_CACHE_TTL=60000;') >= 1 && cnt('DASH_CACHE_TTL=20000') === 0);
t('P-6: splash boot TIDAK menunggu data (race lama dihapus)',
  cnt('Promise.race([Promise.all([dataReady,minWait]),maxWait])') === 0 &&
  cnt('minWait.then(function(){hideBootSplash();if(hasValidSession())_applyHashTab();});') === 1);
t('P-6: tab hash diterapkan ulang setelah data siap',
  cnt('dataReady.then(function(){if(hasValidSession())_applyHashTab();})') === 1);
t('P-6: flag _dataLoading diset saat loadData mulai',
  cnt('var _dataLoading=false;function loadData(){_dataLoading=true;') === 1);
t('P-6: tab Alert menampilkan status memuat (bukan CTA) saat data masih dimuat',
  cnt('if(!allRows.length&&_dataLoading){') === 1);
t('P-6: katalog kosong saat memuat menampilkan "Memuat" (tabel + kartu)',
  cnt("_dataLoading?'<div class=\"empty-state\"><p>Memuat data dari spreadsheet...</p></div>'") === 2);
t('P-6: guard dilepas di sukses & error loadData',
  cnt('_applySort();_dataLoading=false;renderTable(filteredRows);renderCatFilter();') === 1 &&
  cnt("if(result.status==='error'){_dataLoading=false;showStatus('sbar-load','s-err'") === 1 &&
  cnt('Refresh\';_dataLoading=false;showStatus(\'sbar-load\',\'s-err\'') === 1);
t('P-6: tab aktif yang butuh data dirender ulang saat data tiba',
  cnt("if(document.getElementById('section-rak')&&document.getElementById('section-rak').classList.contains('active')&&typeof loadRakList==='function')loadRakList();") === 1);

// --- Review-fix 2026-10-16b (F-1/F-2/F-4/F-5/F-6) ---
t('REV-F1: peta rak TIDAK diisi saat getRakBreakdownAll gagal (masih bisa retry)',
  cnt("_rakBreakdownLoading=false;if(!res||res.status!=='ok')return;") === 1);
t('REV-F2: selesai batch memicu refresh katalog langsung (bukan tunggu coalesce)',
  cnt('function _refreshAfterBatch(){') === 1 && cnt('_refreshAfterBatch();') === 3);
t('REV-F4: dashboard boot tidak memicu getData ganda saat data masih dimuat',
  cnt('if(!allRows.length&&_dataLoading)return;') === 1);
t('REV-F4: dashboard dirender ulang saat data tiba (bila tab dashboard aktif)',
  cnt("else if(document.getElementById('section-dashboard')&&document.getElementById('section-dashboard').classList.contains('active')&&typeof loadDashboard==='function')loadDashboard();") === 1);
t('REV-F5: id item dikunci saat submit (bukan saat respons tiba)',
  cnt('var _itemIdSubmit=currentItem.id;') === 1);
t('REV-F6: highlight _acIdx dipertahankan saat re-render async',
  cnt('function _acRenderScored(ctx,q,scored,pend,keepSel){') === 1 &&
  cnt('_acRenderScored(ctx,q,scored,false,true)') === 1);

// --- Font: non-blocking ---
t('FONT: link Google Fonts non-blocking (media=print + onload media=all)',
  cnt('rel="stylesheet" media="print" onload="this.media=\'all\'"') === 1);

// --- sw.js: network-first + batas waktu + cache v42 ---
t('SW: CACHE rdi-stok-v42', /CACHE = 'rdi-stok-v42'/.test(sw));
t('SW: HTML network-first dgn batas waktu 2,5 dtk (fallback cache)',
  sw.indexOf('2500') !== -1 && sw.indexOf("'TIMEOUT'") !== -1);
t('SW: precache aset inti tetap ada (guard LOCK-7 tidak dilanggar)',
  sw.indexOf('html2pdf') !== -1);

// --- package.json ---
t('PKG: version 15.33.0', /"version":\s*"15\.33\.0"/.test(pkg));

// --- jejak alasan perubahan (komentar PERF) ---
t('DOC: komentar PERF 2026-10-16 hadir di >= 8 titik perubahan',
  cnt('PERF 2026-10-16') >= 8, 'dapat ' + cnt('PERF 2026-10-16'));

console.log('---- perf_pass_v1533: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
