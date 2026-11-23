/* L1: .u-hide{display:none!important} tidak boleh menahan elemen yang di-display lewat JS (style.display).
 * Bug 2026-11: #trx-submit-bar (tombol "Simpan Transaksi") tidak pernah tampil karena u-hide menang atas style.display='block'. */
const fs = require('fs'), path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); } };

ok('.u-hide dasar tetap display:none!important', /\.u-hide\{display:none!important\}/.test(idx));
['block', 'flex'].forEach((d) => ok('override .u-hide[style*="display: ' + d + '"] ada', idx.indexOf('.u-hide[style*="display: ' + d + '"]{display:' + d + '!important}') >= 0));
const m = idx.match(/function showScanStep\(name\)\{[^\n]*\}/);
ok('showScanStep menampilkan #trx-submit-bar lewat style.display (kontrak yang bergantung pada override)', !!m && /subBar\.style\.display=\(name==='transaksi'\)\?'block':'none'/.test(m[0]));
const clash = (idx.match(/<[^>]*\bu-hide\b[^>]*style="[^"]*display[^"]*"[^>]*>|<[^>]*style="[^"]*display[^"]*"[^>]*\bu-hide\b[^>]*>/g) || []);
ok('tidak ada elemen markup yang sekaligus u-hide + display inline (override akan menampilkannya)', clash.length === 0, clash.slice(0, 2));
console.log('PASS | ui_uhide_inline_display_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
