// Gate distribusi service worker: nama CACHE harus naik setiap kali aset shell berubah.
// Alasan: aset di ASSETS disajikan cache-first (sw.js), jadi perbaikan di js/*.js
// TIDAK sampai ke perangkat yang sudah install bila nama CACHE tetap sama
// (browser tidak reinstall SW karena byte sw.js identik -> precache tidak jalan ulang).
// Sumber kebenaran tunggal: tests/l1/sw_shell_manifest.json (cache + hash shell).
// Regenerasi setelah perubahan shell yang disengaja:
//   node tests/l1/sw_shell_cache_gate.js --print
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');
const MANIFEST = path.join(__dirname, 'sw_shell_manifest.json');

let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok === true) { pass++; console.log('PASS | ' + name + (ev ? ' | ' + ev : '')); }
  else if (ok === false) { fail++; console.log('FAIL | ' + name + ' | ' + ev); }
  else console.log(ok + ' | ' + name + ' | ' + ev);
}

function normalize(buf) {
  return Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

function shellAssets(swSrc) {
  const block = swSrc.match(/const ASSETS = \[([\s\S]*?)\];/);
  if (!block) return null;
  return [...block[1].matchAll(/'([^']+)'/g)]
    .map(m => m[1])
    .filter(p => p.startsWith('./') && p !== './')
    .map(p => p.replace(/^\.\//, ''));
}

function shellHash(assets) {
  const h = crypto.createHash('sha256');
  for (const rel of assets) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return { hash: null, missing: rel };
    const fileHash = crypto.createHash('sha256').update(normalize(fs.readFileSync(abs))).digest('hex');
    h.update(rel + '\0' + fileHash + '\n');
  }
  return { hash: h.digest('hex'), missing: null };
}

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const cacheName = (sw.match(/const CACHE\s*=\s*'([^']+)'/) || [])[1] || null;
const assets = shellAssets(sw);
const computed = assets ? shellHash(assets) : { hash: null, missing: '(ASSETS tidak terbaca)' };

if (process.argv.includes('--print')) {
  const next = {
    cache: cacheName,
    files: assets ? assets.length : 0,
    hash: computed.hash,
    note: 'Regenerasi: node tests/l1/sw_shell_cache_gate.js --print',
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n');
  console.log('manifest ditulis | ' + JSON.stringify(next));
  process.exit(0);
}

let manifest = null;
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) { manifest = null; }

t('manifest gate ada dan JSON valid', !!manifest, manifest ? 'ok' : 'tests/l1/sw_shell_manifest.json tidak valid');

t('sw.js mendefinisikan CACHE berpola rdi-stok-v<N>',
  !!cacheName && /^rdi-stok-v\d+$/.test(cacheName), 'CACHE=' + cacheName);

t('daftar ASSETS terbaca dari sw.js', !!assets && assets.length > 0,
  assets ? assets.length + ' aset' : 'gagal parse blok ASSETS');

t('semua aset ASSETS ada di disk', !!assets && !computed.missing,
  computed.missing ? 'hilang: ' + computed.missing : 'ok');

if (manifest) {
  t('CACHE di sw.js sama dengan manifest (naikkan keduanya bersamaan)',
    cacheName === manifest.cache, 'sw.js=' + cacheName + ' manifest=' + manifest.cache);

  t('jumlah aset shell sama dengan manifest',
    !!assets && assets.length === manifest.files,
    'hitung=' + (assets ? assets.length : '?') + ' manifest=' + manifest.files);

  const same = !!computed.hash && computed.hash === manifest.hash;
  t('hash aset shell sama dengan manifest (shell tidak berubah tanpa bump CACHE)',
    same,
    same ? 'sha256=' + String(computed.hash).slice(0, 16) + '…' : 'hitung=' + String(computed.hash).slice(0, 16) + '… manifest=' + String(manifest.hash).slice(0, 16) + '… -> ubah CACHE lalu jalankan: node tests/l1/sw_shell_cache_gate.js --print');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail) process.exitCode = 1;
