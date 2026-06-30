const CACHE = 'rdi-stok-v2'; // ⚠ NAIKKAN angka ini (v3, v4, ...) SETIAP kali deploy versi baru
const ASSETS = [
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Jangan cache request ke GAS (data harus selalu live)
  if (e.request.url.includes('script.google.com')) return;

  // HTML / navigasi → NETWORK-FIRST: selalu coba versi terbaru dulu,
  // baru fallback ke cache kalau offline. Ini mencegah HP "terjebak"
  // di versi lama walau sudah deploy ulang.
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Asset statis lain (manifest, ikon dll) → cache-first tetap OK
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
