// Jídlogic — Service Worker (PWA shell cache)
// v13 — 2026-04-23: obousměrný handshake — wrapper posílá ACK 'wrapper-hidden'
// do iframe po dokončení fade, Obedy.html čeká na ACK před spuštěním loading
// animation (jinak kroky 0-2 běžely skryté pod wrapperem). Fallback timeout
// zkrácen 12s → 3s. Bump pro re-cache index.html.
// v12 — 2026-04-23: wrapper loading overlay přidán do index.html (brand SVG +
// pulsující tečky, fade-out na postMessage 'jidlogic-ready' z Obedy.html nebo
// 12s fallback timeout). Pokrývá hluchý interval mezi OS splash a GAS
// iframe response. Bump pro re-cache nového index.html.
// v11 — 2026-04-22: allow="microphone" přidán na iframe (Web Speech API).
// v10 — 2026-04-22: index.html zjednodušen (welcome modal jednorázově místo
// auth-gate/postMessage handshake). SW shell drží jen minimum — index.html +
// manifest + hlavní ikony. Ostatní PNG ikony se cachují on-demand v fetch
// handleru (aby případný chybějící soubor nezablokoval SW install skrz
// atomic cache.addAll()). Před bylo v9 s plným bundle a race conditions
// na GitHub Pages propagation mohla addAll hodit do fail stavu → SW
// nezaktualizoval → user stuck na staré index.html.
var CACHE_NAME = 'jidlogic-shell-v13';
var CORE_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg?v=20260422',
];

// Install — cache jen minimální core shell (idempotentní, robustní)
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CORE_SHELL);
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

// Fetch — lokální shell = cache-first + on-demand fill. Cizí origin (GAS iframe)
// necháme projít na síť (nelze cachovat cross-origin content).
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;  // GAS, Google, QR API

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      // Pokus se stáhnout a uložit do cache (pro offline zásobu ikon, pngek)
      return fetch(e.request).then(function(response) {
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, copy); });
        }
        return response;
      }).catch(function() {
        // Offline a neexistuje v cache — vrať co jde (neblokuj SW)
        return new Response('', { status: 503 });
      });
    })
  );
});
