// Jídlogic — Service Worker (PWA shell cache)
// v6 — 2026-04-22: Loader a auth-gate v index.html mají místo emoji 📋/🔒
// SVG ikony (brand koncept F + Lucide lock). Bump nutný, aby se nová
// index.html stáhla při dalším otevření PWA.
var CACHE_NAME = 'jidlogic-shell-v8';
var SHELL_URLS = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg?v=20260422',
  'icon-192.png?v=20260422',
  'icon-512.png?v=20260422',
  'apple-touch-icon.png?v=20260422',
  'favicon-32.png?v=20260422',
  'favicon-16.png?v=20260422',
];

// Install — cache shell
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_URLS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — shell = cache-first, vše ostatní = network-only
// (GAS iframe obsah nelze cachovat — jiná doména)
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  if (url.origin === self.location.origin) {
    // Lokální shell soubory — cache first, fallback network
    e.respondWith(
      caches.match(e.request).then(function(r) {
        return r || fetch(e.request);
      })
    );
  }
  // Cizí origin (GAS, Google, QR API…) — necháme projít na síť
});
