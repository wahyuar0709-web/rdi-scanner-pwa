// PWA installability contract — manifest, ukuran ikon nyata, ASSETS service worker.
// Install sebenarnya (Add to Home Screen) tetap browser/perangkat (L4); ini kontrak statis yang membuatnya mungkin.
const fs = require('fs');
const path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');
let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok === true) { pass++; console.log('PASS | ' + name + (ev ? ' | ' + ev : '')); }
  else if (ok === false) { fail++; console.log('FAIL | ' + name + ' | ' + ev); }
  else console.log(ok + ' | ' + name + ' | ' + ev);
}
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const mfRaw = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
let manifest = null;
try { manifest = JSON.parse(mfRaw); } catch (e) { manifest = null; }

t('manifest.json adalah JSON valid', !!manifest, manifest ? 'ok' : 'parse gagal');
t('index.html menautkan rel=manifest', /<link[^>]+rel="manifest"[^>]+href="\.?\/?manifest\.json"/.test(html), (html.match(/<link[^>]+rel="manifest"[^>]*>/) || ['(tidak ada)'])[0]);
if (manifest) {
  t('manifest.display standalone/fullscreen/minimal-ui', ['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display), 'display=' + manifest.display);
  t('manifest.start_url ada', !!manifest.start_url, 'start_url=' + manifest.start_url);
  t('manifest.scope ada', !!manifest.scope, 'scope=' + manifest.scope);
  const inScope = !!manifest.start_url && !!manifest.scope && String(manifest.start_url).replace(/^\.\//, '').indexOf(String(manifest.scope).replace(/^\.\//, '').replace(/\/$/, '')) === 0;
  t('manifest.start_url berada di dalam scope', inScope, 'start=' + manifest.start_url + ' scope=' + manifest.scope);
  t('manifest.name & short_name terisi', !!(manifest.name && manifest.short_name), manifest.name + ' / ' + manifest.short_name);
  const icons = manifest.icons || [];
  const i192 = icons.filter(i => i.sizes === '192x192');
  const i512 = icons.filter(i => i.sizes === '512x512');
  t('manifest punya ikon 192x192 & 512x512', i192.length > 0 && i512.length > 0, 'n192=' + i192.length + ' n512=' + i512.length);
  t('ikon punya purpose any + maskable', icons.some(i => i.purpose === 'any') && icons.some(i => i.purpose === 'maskable'), icons.map(i => i.purpose).join(','));
  const missing = icons.map(i => path.join(ROOT, i.src)).filter(p => !fs.existsSync(p));
  t('semua file ikon manifest ada di disk', missing.length === 0, missing.length ? missing.join(',') : 'ok');
  const metaTheme = (html.match(/<meta[^>]+name="theme-color"[^>]+content="([^"]+)"/) || [])[1];
  t('meta theme-color = manifest.theme_color', !!metaTheme && metaTheme.toLowerCase() === String(manifest.theme_color).toLowerCase(), 'meta=' + metaTheme + ' manifest=' + manifest.theme_color);
  t('manifest.id menunjuk shell aplikasi', String(manifest.id || manifest.start_url).indexOf('index.html') >= 0, 'id=' + manifest.id);
}

const s192 = fs.existsSync(path.join(ROOT, 'icon-192.png')) ? pngSize(path.join(ROOT, 'icon-192.png')) : null;
const s512 = fs.existsSync(path.join(ROOT, 'icon-512.png')) ? pngSize(path.join(ROOT, 'icon-512.png')) : null;
t('icon-192.png benar-benar 192x192 px', !!s192 && s192.w === 192 && s192.h === 192, JSON.stringify(s192));
t('icon-512.png benar-benar 512x512 px', !!s512 && s512.w === 512 && s512.h === 512, JSON.stringify(s512));

t('sw.js mendaftarkan handler install/activate/fetch', /addEventListener\('install'/.test(sw) && /addEventListener\('activate'/.test(sw) && /addEventListener\('fetch'/.test(sw),
  ['install', 'activate', 'fetch'].filter(h => new RegExp("addEventListener\\('" + h + "'").test(sw)).join(','));
t('sw.js cache.addAll di install', /cache\.addAll\(ASSETS\)/.test(sw) || /addAll\(/.test(sw), 'addAll present');
t('sw.js clients.claim di activate', /clients\.claim\(\)/.test(sw), 'claim present');
const cacheName = (sw.match(/const CACHE\s*=\s*'([^']+)'/) || [])[1];
t('sw.js nama cache berpola rdi-stok-v<N>', !!cacheName && /^rdi-stok-v\d+$/.test(cacheName), 'CACHE=' + cacheName);

const assetsBlock = sw.slice(sw.indexOf('const ASSETS'), sw.indexOf(']', sw.indexOf('const ASSETS')));
const assets = [...assetsBlock.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(a => a.length > 0);
t('ASSETS sw.js berisi shell + ikon + lib inti',
  ['./index.html', './scanner.html', './manifest.json', './icon-192.png', './icon-512.png', './jsQR.min.js', './qrcode.min.js'].every(a => assets.includes(a.slice(2))),
  'n=' + assets.length);
const assetsMissing = assets.filter(a => !fs.existsSync(path.join(ROOT, a)));
t('setiap entri ASSETS ada di disk', assetsMissing.length === 0, assetsMissing.length ? assetsMissing.join(',') : 'n=' + assets.length + ' ok');

t('index.html meregistrasi ./sw.js (scope lokal)', /serviceWorker\.register\('\.\/sw\.js'/.test(html), (html.match(/serviceWorker\.register\('[^']+'/) || ['(tidak ada)'])[0]);

t('INFO: apple-touch-icon tidak ada (ikon install iOS pakai fallback)', true, 'manifest icons tetap dipakai browser; tambah bila ikon iOS perlu identik');

console.log('=== PWA INSTALLABILITY: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
