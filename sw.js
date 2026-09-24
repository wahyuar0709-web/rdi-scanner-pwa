const CACHE = 'rdi-stok-v17'; // bump cache whenever the app shell changes
const ASSETS = [
  './',
  './index.html',
  './scanner.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './jsQR.min.js',
  './qrcode.min.js',
  './js/util.js'
];

self.addEventListener('install', e => {
  // skipWaiting di dalam waitUntil agar benar-benar menunggu pre-cache selesai
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Jangan cache request ke GAS (data harus selalu live)
  if (e.request.url.includes('script.google.com')) return;
  // Hanya intercept GET (POST/PUT jangan di-cache/di-rewrite)
  if (e.request.method !== 'GET') return;

  // HTML / navigasi → NETWORK-FIRST: selalu coba versi terbaru dulu,
  // baru fallback ke cache kalau offline. Ini mencegah HP "terjebak"
  // di versi lama walau sudah deploy ulang.
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // hanya cache res.ok — res 4xx/5xx jangan masuk cache
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(r => r || caches.match('./index.html'))
        )
    );
    return;
  }

  // Asset statis lain (manifest, ikon, jsQR dll) → cache-first,
  // lalu network + simpan ke cache (untuk asset yang belum pernah di-precache)
  e.respondWith(
    caches.match(e.request).then(r => {
      if (r) return r;
      return fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
