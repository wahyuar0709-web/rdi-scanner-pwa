/* L1: fmtNum (js/format.js) + kontrak pemakaian di index.html (audit UX 2026-11 #12).
 * Standar: CLDR/ICU id-ID -> ribuan titik, desimal koma. fmtNum HANYA untuk tampilan; nilai yang dibaca ulang tetap mentah. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'format.js'), 'utf8'), ctx);
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const eq = (n, a, b) => { if (a === b) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + ' -> ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); } };
const F = ctx.fmtNum;

eq('0', F(0), '0'); eq('5', F(5), '5'); eq('999 (tanpa pemisah)', F(999), '999'); eq('1000 -> 1.000', F(1000), '1.000');
eq('12500 -> 12.500', F(12500), '12.500'); eq('1234567 -> 1.234.567', F(1234567), '1.234.567');
eq('2.5 -> 2,5 (koma desimal)', F(2.5), '2,5'); eq('12500.5 -> 12.500,5', F(12500.5), '12.500,5');
eq('string numerik "1500"', F('1500'), '1.500'); eq('string "2.5"', F('2.5'), '2,5'); eq('negatif -1500', F(-1500), '-1.500');
eq('0.1+0.2 dibulatkan 3 desimal', F(0.1 + 0.2), '0,3'); eq('1.23456 -> 1,235', F(1.23456), '1,235'); eq('".5" -> 0,5', F('.5'), '0,5');
eq("'-' dikembalikan apa adanya", F('-'), '-'); eq("'' dikembalikan ''", F(''), '');
eq('null -> ""', F(null), ''); eq('undefined -> ""', F(undefined), '');
eq('teks "N/A" apa adanya', F('N/A'), 'N/A'); eq('teks "A-01" (kode) apa adanya', F('A-01'), 'A-01');
eq('"1,5" (koma sudah desimal id) apa adanya, tidak dirusak', F('1,5'), '1,5');
eq('NaN -> "NaN" (bukan angka), tidak melempar', F(NaN), 'NaN');
// hubungan dengan parseQty: nilai mentah input tetap titik-desimal, tampilan koma; TIDAK boleh dibaca balik
eq('fmtQty(1500) (nilai input) tetap mentah "1500"', ctx.fmtQty(1500), '1500');
eq('parseQty("1500") = 1500', ctx.parseQty('1500'), 1500);
eq('PERINGATAN: parseQty("1.500") = 1.5 -> hasil fmtNum tak boleh dibaca balik', ctx.parseQty(F(1500)), 1.5);
// pesan penjaga stok memakai format tampilan
const g = ctx.stockGuard('KELUAR', 20000, 'A-01', 12500, [{ rak: 'A-01', qty: 12500 }]);
eq('pesan penjaga stok memakai ribuan id-ID', /12\.500/.test(g.message), true);

// kontrak index.html
const js = idx.slice(idx.indexOf('<script'));
const nonAttr = (js.match(/xe\(fmtNum\(/g) || []).length;
eq('>=20 titik tampil memakai xe(fmtNum(...)) (ditemukan ' + nonAttr + ')', nonAttr >= 20, true);
eq('tidak ada xe(<var>.qty) mentah yang tersisa untuk tampilan', (js.match(/xe\((?:r|it|e|d|x)\.(?:qty|saldoSesudah)(?:\|\|(?:0|'-'|''))?\)/g) || []).length, 0);
eq('KPI dashboard (total/masuk/keluar) diformat', /getElementById\('dash-masuk'\)\.textContent=fmtNum\(/.test(js) && /getElementById\('dash-keluar'\)\.textContent=fmtNum\(/.test(js) && /getElementById\('dash-total'\)\.textContent=fmtNum\(/.test(js), true);
eq('pratinjau saldo sesudah memakai fmtNum', /el\.textContent=fmtNum\(after\)\+' '\+unit;/.test(js), true);
// KEAMANAN: nilai yang dibaca ulang TIDAK boleh lewat fmtNum
const bad = [];
[/\.value\s*=\s*fmtNum\(/g, /value="'\s*\+\s*(?:xe\()?fmtNum\(/g, /data-[\w-]+="'\s*\+\s*(?:xe\()?fmtNum\(/g, /parse(?:Float|Int)\(fmtNum\(/g, /Number\(fmtNum\(/g, /qty:\s*fmtNum\(/g, /payload[^;]*fmtNum\(/g].forEach((re) => { const m = js.match(re); if (m) bad.push(re.source + ' x' + m.length); });
eq('fmtNum tidak dipakai pada .value / atribut value / data-* / parse / payload', bad.length, 0);
console.log('PASS | number_format_exec | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
