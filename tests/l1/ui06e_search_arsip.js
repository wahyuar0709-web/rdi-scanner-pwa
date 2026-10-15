/* L1 - REVISI: item terarsip harus tetap bisa ditemukan lewat panel cari.
 *
 * Latar (2026-10-15). Item yang stoknya 0 masuk arsip TPI. Sebelumnya
 * `_doFilter` membuang baris terarsip LEBIH DAHULU daripada menjalankan
 * pencarian:
 *
 *     if(!_showArsip && _isArsip(r)) return false;   // <- sebelum dicek q
 *
 * Akibatnya mengetik kata kunci di panel cari tidak pernah menemukan item
 * terarsip. Operator menyimpulkan item hilang, padahal ada - dan tidak ada
 * cara untuk membuktikannya dari halaman itu.
 *
 * Perbaikan: baris terarsip hanya disembunyikan bila sedang TIDAK mencari.
 *
 *     if(!_showArsip && !q && _isArsip(r)) return false;
 *
 * Yang dijaga gate ini, supaya tidak bisa regresi diam-diam:
 *   - hanya _doFilter yang berubah; daftar CETAK sengaja tidak, karena
 *     mengubah item mana yang ikut tercetak punya konsekuensi nyata
 *   - item terarsip yang muncul di pencarian tetap harus TERLIHAT sebagai
 *     terarsip: diredupkan, diberi badge, dan tombol transaksinya disembunyikan.
 *     Kalau tidak, perubahan ini justru menyembunyikan item aktif.
 *   - teks konfirmasi arsip tidak boleh lagi bertentangan dengan perilaku.
 *   - petunjuk hasil pencarian menyebut item terarsip, supaya operator tahu
 *     kenapa item "Habis" bisa muncul tanpa filter arsip dinyalakan.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond === true) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

/* Ambil seluruh badan sebuah fungsi supaya pemeriksaan tidak bisa salah
 * menyalin atribut dari fungsi lain yang kebetulan sama. */
function bodyOf(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const o = src.indexOf('{', i);
  let d = 0;
  for (let j = o; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); }
  }
  return null;
}

/* --- CAKUPAN: gate harus benar-benar menemukan kodenya --- */
const fDo = bodyOf('_doFilter');
const fHint = bodyOf('_updateSearchHint');
const fCetak = bodyOf('renderCetakList');
const fSel = bodyOf('cetakSelectAll');
const fDetail = bodyOf('toggleArchiveFromDetail');
const fCard = bodyOf('buildCardHtml');
const fReset = bodyOf('resetAllFilters');
const TOTAL_BODY = [fDo, fHint, fCetak, fSel, fDetail, fCard, fReset].filter(Boolean).length;
t('CAKUPAN: 7 fungsi target ditemukan (gate tidak hampa)', TOTAL_BODY === 7, TOTAL_BODY + '/7');
t('CAKUPAN: sumber cukup besar untuk jadi bukti', src.length > 400000, 'panjang ' + src.length);

/* --- 1. perilaku utama --- */
t('ARS-1: _doFilter menyembunyikan arsip HANYA saat tidak ada kata kunci',
  fDo !== null && fDo.indexOf('if(!_showArsip&&!q&&_isArsip(r))return false;') >= 0,
  'pola baru tidak ada di _doFilter');
t('ARS-2: pola lama (tanpa !q) sudah tidak ada di _doFilter',
  fDo !== null && fDo.indexOf('if(!_showArsip&&_isArsip(r))return false;') < 0,
  'pola lama masih ada');

/* --- 2. daftar cetak SENGAJA tidak berubah --- */
t('ARS-3: renderCetakList tetap menyaring arsip (sengaja tidak diubah)',
  fCetak !== null && fCetak.indexOf('if(!_showArsip&&_isArsip(r))return false;') >= 0);
t('ARS-4: cetakSelectAll tetap menyaring arsip (sengaja tidak diubah)',
  fSel !== null && fSel.indexOf('if(!_showArsip&&_isArsip(r))return false;') >= 0);

/* --- 3. item terarsip yang muncul di pencarian harus TERLIHAT --- */
t('ARS-5: kartu terarsip diberi kelas penanda', src.indexOf('ilc2-arsip') >= 0);
t('ARS-6: kartu terarsip diredupkan', /arsip\?'opacity:\.62':''/.test(src));
t('ARS-7: tombol transaksi disembunyikan untuk item terarsip',
  src.indexOf("r.id&&!_isArsip(r)?") >= 0);
t('ARS-8: lookup transaksi tetap menolak item terarsip',
  src.indexOf('_isArsip(exactRow)') >= 0);

/* --- 4. kejujuran teks --- */
t('ARS-9: teks konfirmasi tidak lagi claiming "tidak muncul di pencarian"',
  src.indexOf('tidak akan muncul lagi di Master List/pencarian transaksi') < 0);
t('ARS-10: teks konfirmasi menyebut masih bisa ditemukan lewat panel cari',
  fDetail !== null && fDetail.indexOf('masih bisa ditemukan lewat panel cari') >= 0);
t('ARS-11: _updateSearchHint menerima jumlah item terarsip',
  fHint !== null && fHint.indexOf('arsipN') >= 0);
t('ARS-12: jumlah terarsip diteruskan ke petunjuk hasil',
  fDo !== null && fDo.indexOf('filteredRows.filter(_isArsip).length') >= 0);
t('ARS-13: petunjuk menyinggung jumlah item terarsip di hasil',
  fHint !== null && fHint.indexOf('item diarsipkan') >= 0);

/* --- 5. filter arsip manual tetap berfungsi --- */
t('ARS-14: ada sakelar "tampilkan item yang diarsipkan"',
  src.indexOf('id="flt-show-arsip"') >= 0);
t('ARS-15: sakelar itu tetap menyalakan _showArsip',
  /function toggleShowArsip\(\)\{_showArsip=!!document\.getElementById\('flt-show-arsip'\)\.checked/.test(src));
t('ARS-16: reset filter mematikan kembali _showArsip',
  fReset !== null && fReset.indexOf('_showArsip=false') >= 0,
  'resetAllFilters tidak ditemukan atau tidak mematikan _showArsip');

/* --- 6. REVISI 2 (2026-10-15): stok 0 urut di paling belakang ---
 * Aturan ini TIDAK BOLEH ikut _sortDir: kalau ikut, memilih "stok naik"
 * justru menaikkan stok 0 ke paling atas - persis kebalikan dari yang
 * diminta. Dan hanya boleh diuji lewat filterTable/sortByColumn, karena
 * setSort tidak ada (lihat r2_qty0_last.js). */
const fSort = bodyOf('_sortCompare');
t('QTY-1: _sortCompare ada', fSort !== null);
t('QTY-2: ada prioritas stok 0 di awal comparator',
  fSort !== null && fSort.indexOf('var az=(parseFloat(a.qty)||0)===0,bz=(parseFloat(b.qty)||0)===0;') >= 0);
t('QTY-3: prioritas mengembalikan az?1:-1 (tidak dikalikan _sortDir)',
  fSort !== null && /if\(az!==bz\)return az\?1:-1;/.test(fSort),
  'pola "return az?1:-1" tidak ada');
t('QTY-4: prioritas TIDAK dikalikan _sortDir',
  fSort !== null && !/if\(az!==bz\)return az\?1:-1;[^;]*_sortDir/.test(fSort),
  'ada pengali _sortDir di aturan prioritas - stok 0 akan ikut terbalik');
t('QTY-5: prioritas placed SEBELUM logika pengurutan per-field',
  fSort !== null && fSort.indexOf('az!==bz') < fSort.indexOf("if(_sortField==='_idx')"),
  'prioritas tidak di awal comparator');
t('QTY-6: list utama tetap memakai comparator itu',
  /function _applySort\(\)\{filteredRows\.sort\(_sortCompare\);\}/.test(src));
t('QTY-7: comparator tidak dilewati di daftar cetak', /rows\.sort\(_sortCompare\)/.test(src));
t('QTY-8: penanda "Habis" untuk stok 0 masih ada', src.indexOf("'Habis'") >= 0);
t('QTY-9: tidak ada aturan auto-arsip stok 0 yang mengira/menulis kolom status',
  !/_isArsip\s*=\s*function[^}]*qty\s*===\s*0/.test(src));

console.log('\n---- ui06e_search_arsip: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
