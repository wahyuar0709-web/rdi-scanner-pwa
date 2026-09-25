/* L1 revisi bug (2026-09-25): kolom MIN Inventori dihapus (atur di Detail Barang)
 * + garis antar baris kolom AKSI diselaraskan (td flex → wrap span).
 * Ukuran: thead master 10 kolom tanpa minStock, _buildTableHtml tanpa minCell,
 * colspan 10, AKSI td tetap table-cell. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

t('MIN: sortByColumn(minStock) dihapus dari header', src.indexOf("sortByColumn('minStock'") === -1);
t('MIN: data-tt="Stok Minimum" (th) dihapus', src.indexOf('data-tt="Stok Minimum"') === -1);
t('MIN: var minCell tidak ada di _buildTableHtml', src.indexOf('var minCell=') === -1 && src.indexOf("'+minCell+'") === -1);
t('MIN: colspan="11" tidak tersisa (jadi 10)', src.indexOf('colspan="11"') === -1, 'masih ada');
t('MIN: colspan="10" dipakai 2x (empty + no-GAS)', (src.split('colspan="10"').length - 1) === 2, 'count=' + (src.split('colspan="10"').length - 1));
t('MIN: input detail barang tetap ada (idd-min-input)', /id="idd-min-input"/.test(src));
t('MIN: editor alert page tetap ada (min-stock-input)', /class="min-stock-input"/.test(src));

t('AKSI: td class="c u-flex-cc-g5" tidak dipakai lagi', src.indexOf('<td class="c u-flex-cc-g5">') === -1);
t('AKSI: tombol dibungkus span u-flex-cc-g5 di dalam td', src.indexOf('<td class="c"><span class="u-flex-cc-g5"><button') !== -1);
t('AKSI: penutup span sebelum </td> pada builder', src.indexOf("</svg></button>':'')+'</span></td>'") !== -1);

// thead master tbl-main: 10 <th>
const tbl = src.indexOf('<table class="tbl-main">');
t('AKSI: tabel tbl-main ada', tbl !== -1);
if (tbl !== -1) {
  const thEnd = src.indexOf('</thead>', tbl);
  const ths = (src.slice(tbl, thEnd).match(/<th\b/g) || []).length;
  t('AKSI: jumlah <th> master = 10', ths === 10, 'dapat ' + ths);
}

console.log('---- ui07_master_min_aksi: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
