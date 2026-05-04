/**
 * Code.gs — entry pointy: doGet a veřejné funkce volatelné z google.script.run
 */

function doGet() {
  // Autentizace musí proběhnout před renderem; chyby vrátíme jako jednoduchý HTML
  var email;
  try {
    email = currentUser_();
  } catch (e) {
    return _renderError_(e.message);
  }

  var data;
  try {
    data = _bootstrap_(email);
  } catch (e) {
    return _renderError_('Chyba inicializace: ' + e.message);
  }

  var t = HtmlService.createTemplateFromFile('menicka_view');
  // < escape proti </script> breakout-u a aby JSON byl validní v <script> bloku
  t.bootstrapJson = JSON.stringify(data).replace(/</g, '\\u003c');

  return t.evaluate()
    .setTitle('LunchHunter PE')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function _bootstrap_(email) {
  var user = Users_ensure_(email);
  var restaurace = Restaurants_resolveForUser_(email);
  var dnes = _today_();
  var menu = Cache_getMenuMap_(dnes);

  return {
    user: _userPublic_(user),
    restaurace: restaurace,
    menu: menu,
    datum: dnes,
    schedule: {
      triggerHours: _scheduleHours_(),
      cacheClearHour: _scheduleEndHour_()
    }
  };
}

function _userPublic_(user) {
  var rssId = String(user.rss_drive_id || '').trim();
  return {
    email: user.email,
    sledovane_restaurace: String(user.sledovane_restaurace || ''),
    skryte_restaurace: String(user.skryte_restaurace || ''),
    oblibena_jidla: String(user.oblibena_jidla || ''),
    dieta: String(user.dieta || ''),
    rss_url: rssId ? Rss_urlForId_(rssId) : null,
    novy: !!user.novy
  };
}

function _renderError_(message) {
  var safeMsg = String(message)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">' +
    '<title>LunchHunter PE — chyba</title>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
    'background:#F7F7FA;color:#2D2D3A;padding:32px;line-height:1.5}' +
    '.box{max-width:560px;margin:64px auto;padding:24px;background:#fff;' +
    'border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08)}' +
    'h1{color:#6B2D8B;margin-bottom:12px;font-size:1.2rem}</style></head><body>' +
    '<div class="box"><h1>LunchHunter PE</h1><p>' + safeMsg + '</p></div></body></html>'
  ).setTitle('LunchHunter PE');
}

// === Veřejné funkce volatelné z google.script.run ===

function bootstrap() {
  return _bootstrap_(currentUser_());
}

function updateSettings(payload) {
  var email = currentUser_();
  return _userPublic_(Users_updateSettings_(email, payload || {}));
}

function addRestaurant(menickaUrl) {
  return Restaurants_addToUser_(currentUser_(), menickaUrl);
}

function removeRestaurant(restauraceId) {
  return Restaurants_removeFromUser_(currentUser_(), restauraceId);
}

function updateRestaurant(restauraceId, payload) {
  var email = currentUser_();
  var rid = String(restauraceId);
  Restaurants_setOverride_(email, rid, payload || {});

  // Save → re-fetch katalogu z menicka.cz (jen prázdná pole — adresa, foto_url,
  // lat/lon). Tahle cesta slouží jako "pasivní backfill" pro restaurace
  // registrované před přidáním nových sloupců. Pokud cokoliv selže, override
  // už proběhl, takže UI vždy dostane validní výsledek.
  try {
    Restaurants_refreshCatalogInfo_(rid);
  } catch (e) {
    Logger.log('updateRestaurant refresh fail: ' + e.message);
  }

  // Vrať aktuální verzi (po overrides + případném catalog refresh)
  var resolved = Restaurants_resolveForUser_(email);
  for (var i = 0; i < resolved.length; i++) {
    if (resolved[i].id === rid) return resolved[i];
  }
  return null;
}

/**
 * Stáhne dnešní menu pro jednu restauraci. FE volá hned po addRestaurant,
 * aby uživatel viděl menu bez čekání na celý refresh.
 */
function fetchMenuForRestaurant(restauraceId) {
  currentUser_();
  return Restaurants_fetchMenuFor_(restauraceId);
}

/**
 * Ruční refresh menu pro jednu restauraci. Klient volá kliknutím na 🔄 ikonu.
 * Server respektuje 15-min cooldown a soft-lock.
 */
function refreshMenuFor(restauraceId) {
  currentUser_();
  return Restaurants_refreshMenuFor_(restauraceId);
}

/**
 * Reverse geocoding: lat/lon → město. FE volá po získání user pozice, aby v
 * status řádce mohlo zobrazit "kde si myslíme že jste". Cache 24 h.
 */
function reverseGeocode(lat, lon) {
  currentUser_();
  return Geo_reverseGeocode_(lat, lon);
}

/**
 * Lehký endpoint — pro každý dnešní záznam v Menu Cache vrátí jen `aktualizovano`
 * timestamp. FE polluje a porovnává s lokálními ts; když najde novější, ví že
 * server-side proběhla aktualizace (trigger v 9-14 nebo manual refresh jiného
 * uživatele) a může re-fetchnout to konkrétní menu bez F5.
 *
 * Vrací { restauraceId: ISOtimestamp, ... }. Bez plného menu data — minimální
 * payload pro časté volání (typicky 50-200 B).
 */
function getMenuTimestamps() {
  currentUser_();
  var dnes = _today_();
  var rows = _readAll_(SHEETS.MENU_CACHE);
  var result = {};
  rows.forEach(function(r) {
    if (_formatDate_(r.datum) !== dnes) return;
    var data;
    try { data = JSON.parse(r.data); } catch (e) { return; }
    if (data && data.aktualizovano) {
      result[String(r.restaurace_id)] = data.aktualizovano;
    }
  });
  return result;
}

/**
 * Async geocoding pro jednu restauraci — FE volá po `addRestaurant` na pozadí,
 * aby `addRestaurant` byl rychlý. Vrací { lat, lon } nebo null. Idempotentní:
 * pokud už restaurace má souřadnice, vrátí je beze změny (žádný fetch).
 *
 * Geo: primárně přes plnou adresu (úroveň ulice), fallback město (city centrum).
 */
function geocodeRestaurant(restauraceId) {
  currentUser_();
  var rid = String(restauraceId);
  var rec = Restaurants_byId_(rid);
  if (!rec) throw new Error('Restaurace ' + rid + ' nenalezena.');
  if (rec.lat != null && rec.lon != null) {
    return { lat: rec.lat, lon: rec.lon, source: 'cached' };
  }

  var geo = Geo_geocodeRestaurant_(rec.adresa, rec.mesto);
  if (!geo) return null;

  // Najdi řádek a updatuj. Sheet read+write jednou — ne přes Restaurants_listActive_ cache.
  var rows = _readAll_(SHEETS.RESTAURACE);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === rid) {
      _setRowFields_(SHEETS.RESTAURACE, rows[i]._row, { lat: geo.lat, lon: geo.lon });
      Restaurants_invalidate_();
      return { lat: geo.lat, lon: geo.lon, source: rec.adresa ? 'address' : 'city' };
    }
  }
  return null;
}

/**
 * Manuální spuštění refreshe (kromě denního triggeru). Vyžaduje workspace login.
 */
function refreshNow() {
  currentUser_();
  return refreshAllMenus();
}

/**
 * Vygeneruje (nebo obnoví) RSS feed pro aktuálního uživatele a vrátí jeho URL.
 * Při prvním volání vytvoří soubor v Drive a uloží jeho ID do uživatelova řádku.
 */
function getRssUrl() {
  var email = currentUser_();
  var user = Users_findByEmail_(email);
  if (!user) throw new Error('Uživatel nenalezen');
  var url = Rss_publishForUser_(user);
  return { rss_url: url };
}
