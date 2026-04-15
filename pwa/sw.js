// JídLOG — Service Worker (PWA shell cache)
var CACHE_NAME = 'jidlog-shell-v1';
var SHELL_URLS = ['./', 'index.html', 'manifest.json', 'icon.svg'];

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
