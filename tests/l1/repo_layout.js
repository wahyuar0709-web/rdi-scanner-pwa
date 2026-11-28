/* L1: tata letak repo & referensi berkas (guard rilis).
 * Latar: 26-27 Nov 2026 unggahan "Add files via upload" menaruh js/format.js, tes, dan manifest di FOLDER UTAMA repo,
 * sehingga aplikasi memuat js/format.js lama dan halaman Stok gagal. Tes ini membuat kejadian seperti itu gagal di CI/lokal.
 * Yang diperiksa: (1) isi folder utama sesuai daftar yang diizinkan, (2) setiap <script src> ada di disk,
 * (3) setiap aset precache sw.js ada, (4) setiap js/*.js non-vendor ikut precache (kalau tidak, offline rusak),
 * (5) versi package.json sinkron dengan APP_VERSION. */
const fs = require('fs'), path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const t = (name, ok, ev) => { if (ok) { pass++; console.log('PASS | ' + name); } else { fail++; console.log('FAIL | ' + name + (ev ? ' | ' + ev : '')); } };
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// (1) folder utama
const ALLOWED_ROOT = new Set([
  '.git', '.github', '.opencode', '.gitattributes', '.gitignore', '.claspignore', '.editorconfig', '.clasp.json', '.clasprc.json',
  'AGENTS.md', 'CHANGELOG.md', 'DESIGN.md', 'PLAN.md', 'README.md', 'TESTING.md',
  'Code.gs', 'appsscript.json', 'index.html', 'scanner.html', 'sw.js', 'manifest.json',
  'icon-192.png', 'icon-512.png',
  'js', 'tests', 'anti-slop', 'apps-script', 'poc', 'package.json',
  'node_modules', 'package-lock.json', 'src'
]);
const rootEntries = fs.readdirSync(ROOT);
const stray = rootEntries.filter((n) => !ALLOWED_ROOT.has(n));
const hint = (n) => /_exec\.js$|^[a-z_0-9]+\.js$/.test(n) && n !== 'sw.js' ? ' -> kemungkinan tes: pindahkan ke tests/l1/ atau modul: js/'
  : n === 'sw_shell_manifest.json' ? ' -> pindahkan ke tests/l1/' : /\.patch$/.test(n) ? ' -> jangan di-commit' : '';
t('folder utama hanya berisi berkas yang diizinkan (tidak ada file nyasar)', stray.length === 0, stray.map((n) => n + hint(n)).join('; '));

// (2) <script src> di halaman
['index.html', 'scanner.html'].forEach((page) => {
  const html = read(page);
  const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]).filter((s) => !/^(https?:)?\/\//.test(s));
  const missing = srcs.filter((s) => !fs.existsSync(path.join(ROOT, s.split('?')[0])));
  t(page + ': semua <script src> lokal ada di disk (' + srcs.length + ' berkas)', missing.length === 0, 'hilang: ' + missing.join(', '));
});

// (3)+(4) aset precache sw.js
const sw = read('sw.js');
const assetsBlock = (sw.match(/const ASSETS = \[([\s\S]*?)\];/) || [])[1] || '';
const assets = [...assetsBlock.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
t('sw.js ASSETS terbaca (' + assets.length + ' entri)', assets.length >= 10);
const missingAssets = assets.filter((a) => !fs.existsSync(path.join(ROOT, a)));
t('setiap aset precache sw.js ada di disk', missingAssets.length === 0, 'hilang: ' + missingAssets.join(', '));
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /\.js$/.test(f));
const notPrecached = jsFiles.filter((f) => assets.indexOf('js/' + f) < 0);
t('setiap js/*.js ikut precache sw.js (offline)', notPrecached.length === 0, 'tidak ikut: ' + notPrecached.join(', '));

// (5) versi
const appVer = (read('index.html').match(/APP_VERSION\s*=\s*'v?([^']+)'/) || [])[1];
const pkgVer = JSON.parse(read('package.json')).version;
t('package.json version sinkron dengan APP_VERSION (major.minor)', !!appVer && pkgVer.split('.').slice(0, 2).join('.') === appVer.split('.').slice(0, 2).join('.'), 'APP_VERSION=' + appVer + ' package.json=' + pkgVer);

console.log('=== repo_layout: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
