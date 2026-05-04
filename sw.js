// Jídlogic — Service Worker (PWA shell cache)
// v16 — 2026-05-04: lunchhunter.html — progress bar + delší fallback timeout
// (3 s → 5 s pro panel, 8 s → 10 s pro forced fade-out) + reformulace textu
// z alarmujícího „Načítání trvá příliš dlouho" na vlídnější „Trvá ti to
// dlouho?" Bump aby si user stáhl nový shell.
// v15 — 2026-05-04: menicka.html přejmenováno na lunchhunter.html (UI rebrand
// na LunchHunter PE). Manifest taky → lunchhunter-manifest.json. Bump cache
// vyvolá u stávajících uživatelů re-cache + activate, takže si stáhnou novou
// shell URL bez nutnosti hard-refresh. Pozor: existující bookmarks na staré
// menicka.html teď vrací 404 (GitHub Pages neredirektuje samo).
// v14 — 2026-04-26: přidáno menicka.html + menicka-manifest.json do shell cache
// (samostatná Meníčka PWA na stejném GitHub Pages origin). Iframe target je
// jiný GAS deploy (AKfycbw4… místo AKfycbxq…), ale wrapper se chová stejně.
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
var CACHE_NAME = 'jidlogic-shell-v20';
var CORE_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'lunchhunter.html',
  'lunchhunter-manifest.json',
  'lunchhunter-icon.svg?v=20260504',
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
