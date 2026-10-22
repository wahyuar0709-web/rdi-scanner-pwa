const CACHE = 'rdi-stok-v46'; // bump cache whenever the app shell changes
const ASSETS = [
  './',
  './index.html',
  './scanner.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './jsQR.min.js',
  './qrcode.min.js',
  './js/jspdf.min.js',
  './js/util.js',
  './js/cetak.js',
  './js/outbox.js',
  './js/format.js',
  './js/importexcel.js',
  // FIX PERF 2026-10-13: XLSX 861 KB tadinya CDN (tiap launch butuh internet).
  // Self-host + precache = satu kali unduh, seterusnya offline & instant.
  './js/xlsx.full.min.js',
  // FIX OFFLINE 2026-10-13: html2pdf 0.10.1 (885 KB) tadyanya CDN -> kartu stok
  // "Download PDF" tidak bisa dipakai tanpa internet. Self-host + precache.
  './js/html2pdf.bundle.min.js'
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

  // HTML / navigasi → NETWORK-FIRST dgn BATAS WAKTU (PERF 2026-10-16).
  // Dulu: navigasi SELALU menunggu jaringan selesai — di WiFi lambat itu
  // menahan boot beberapa detik. Sekarang: kalau jaringan belum selesai
  // dalam 2,5 dtk TAPI ada versi cache → sajikan cache dulu (boot instan);
  // unduhan jaringan tetap jalan di background dan memperbarui cache,
  // jadi buka berikutnya sudah versi terbaru. Offline / jaringan gagal
  // tetap fallback ke cache seperti sebelumnya.
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
    const net = fetch(e.request)
      .then(res => {
        // hanya cache res.ok — res 4xx/5xx jangan masuk cache
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      });
    const cached = caches.match(e.request).then(r => r || caches.match('./index.html'));
    e.respondWith(
      Promise.race([
        net,
        new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 2500))
      ]).then(out => {
        if (out === 'TIMEOUT') {
          net.catch(() => {}); // jangan biarkan unduhan background jadi unhandled rejection
          return cached.then(r => r || net);
        }
        return out;
      }).catch(() => cached)
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
