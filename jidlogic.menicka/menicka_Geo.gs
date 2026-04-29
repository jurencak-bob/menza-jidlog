/**
 * Geo.gs — geocoding přes OpenStreetMap Nominatim + haversine vzdálenost.
 *
 * Nominatim je free, bez API klíče, rate-limited na 1 req/s a vyžaduje
 * identifikační User-Agent. Pro Meníčka BE volume (~stovky podniků) bohatě
 * stačí. Výsledky cachujeme 24 h v CacheService — opakovaná volání pro
 * stejné město neútočí service.
 *
 * Volá se z `Restaurants_register_` při registraci nové restaurace, plus
 * z admin funkce `backfillRestaurantCoords()` pro doplnění existujících.
 */

var NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
var NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
var PHOTON_URL = 'https://photon.komoot.io/api';
var PHOTON_REVERSE_URL = 'https://photon.komoot.io/reverse';
var NOMINATIM_UA = 'Menicka-BE/1.0 (+https://blogic.cz)';
var GEO_CACHE_TTL = 86400;  // 24 h
var NOMINATIM_BACKOFF_KEY = 'nominatim_429_backoff';
var NOMINATIM_BACKOFF_TTL = 3600;  // 1 h pauza po 429 (Nominatim soft-ban)

/**
 * Free-form text (adresa nebo město) → { lat, lon }. Vrací null pokud Nominatim
 * selhal nebo nic nenašel. Cache 24 h per query (lowercase, trimmed).
 *
 * Plná adresa ("Bartoňova 4393, 76001, Zlín") dává úroveň ulice (~10–50 m).
 * Pouhé město ("Zlín") dává jen city centrum (~1 km off od reality).
 * Caller volí podle dostupnosti.
 */
/**
 * Free-form text → { lat, lon, source }. Zkusí Nominatim, pak Photon (oba
 * OSM-based, ale různá infrastruktura). Cache 24 h per query, sdílená napříč
 * providery (jakmile někdo z nich uspěje, drží se).
 *
 * `source` v výsledku = 'nominatim' | 'photon' — kvůli debugování.
 */
function Geo_geocode_(query) {
  if (!query) return null;
  var normalized = String(query).toLowerCase().trim();
  if (!normalized) return null;

  var cache = CacheService.getScriptCache();
  var key = 'geo_q_' + normalized.substring(0, 200);
  var hit = cache.get(key);
  if (hit) {
    try {
      var parsed = JSON.parse(hit);
      return parsed;  // může být null (negative cache) i objekt
    } catch (e) { /* fall through */ }
  }

  // 1. Nominatim (preferovaný — robustní data pro CZ)
  var result = _geocodeNominatim_(normalized);
  if (result) {
    cache.put(key, JSON.stringify(result), GEO_CACHE_TTL);
    return result;
  }

  // 2. Photon fallback (Komoot, OSM data, jiná infrastruktura, vlastní rate limit)
  result = _geocodePhoton_(normalized);
  if (result) {
    cache.put(key, JSON.stringify(result), GEO_CACHE_TTL);
    return result;
  }

  // Negativní cache jen pokud aspoň jeden provider odpověděl validně bez výsledku
  // (rate-limit / network error necachujeme — zkusí se znovu příště).
  return null;
}

function _geocodeNominatim_(normalized) {
  var cache = CacheService.getScriptCache();
  if (cache.get(NOMINATIM_BACKOFF_KEY)) {
    Logger.log('Nominatim skip (backoff active) pro "' + normalized + '"');
    return null;
  }
  var url = NOMINATIM_URL +
    '?q=' + encodeURIComponent(normalized + ', Czech Republic') +
    '&format=json&limit=1';
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': NOMINATIM_UA }
    });
    var code = resp.getResponseCode();
    if (code === 429) {
      cache.put(NOMINATIM_BACKOFF_KEY, '1', NOMINATIM_BACKOFF_TTL);
      Logger.log('Nominatim HTTP 429 pro "' + normalized + '" — backoff aktivován na ' + NOMINATIM_BACKOFF_TTL + 's');
      return null;
    }
    if (code !== 200) {
      Logger.log('Nominatim HTTP ' + code + ' pro "' + normalized + '"');
      return null;
    }
    var arr = JSON.parse(resp.getContentText());
    if (!arr || !arr.length) {
      Logger.log('Nominatim: nic pro "' + normalized + '"');
      return null;
    }
    var lat = parseFloat(arr[0].lat);
    var lon = parseFloat(arr[0].lon);
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat: lat, lon: lon, source: 'nominatim' };
  } catch (e) {
    Logger.log('Nominatim error pro "' + normalized + '": ' + e.message);
    return null;
  }
}

function _geocodePhoton_(normalized) {
  // Photon: lang param podporuje jen default/de/en/fr — `cs` vrací HTTP 400.
  // Bez lang param vrátí výsledky v původním jazyce (CZ → české názvy přímo).
  var url = PHOTON_URL +
    '?q=' + encodeURIComponent(normalized + ', Czech Republic') +
    '&limit=1';
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': NOMINATIM_UA }
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('Photon HTTP ' + resp.getResponseCode() + ' pro "' + normalized + '"');
      return null;
    }
    var data = JSON.parse(resp.getContentText());
    if (!data.features || !data.features.length) {
      Logger.log('Photon: nic pro "' + normalized + '"');
      return null;
    }
    var coords = data.features[0].geometry && data.features[0].geometry.coordinates;
    if (!coords || coords.length < 2) return null;
    var lon = parseFloat(coords[0]);  // GeoJSON: [lon, lat]
    var lat = parseFloat(coords[1]);
    if (isNaN(lat) || isNaN(lon)) return null;
    Logger.log('Photon fallback OK pro "' + normalized + '" → ' + lat + ', ' + lon);
    return { lat: lat, lon: lon, source: 'photon' };
  } catch (e) {
    Logger.log('Photon error pro "' + normalized + '": ' + e.message);
    return null;
  }
}

/**
 * Wrapper — preferuje adresu (přesnost ulice), fallback na město (přesnost
 * city centrum). Když ani jedno nedá výsledek, vrací null.
 */
function Geo_geocodeRestaurant_(adresa, mesto) {
  if (adresa) {
    var r = Geo_geocode_(adresa);
    if (r) return r;
  }
  if (mesto) {
    return Geo_geocode_(mesto);
  }
  return null;
}

/**
 * Reverse geocoding: lat/lon → city name přes Nominatim reverse API.
 * Cache 24 h per (lat, lon) zaokrouhleno na 3 desetinná místa (~110 m granul.).
 * Vrací { city, display } — `city` je první z addr.city / town / village /
 * municipality, `display` je formátovaný full string. Null pokud Nominatim selhal.
 */
function Geo_reverseGeocode_(lat, lon) {
  if (lat == null || lon == null) return null;
  var latNum = parseFloat(lat);
  var lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) return null;

  var key = 'geo_rev2_' + latNum.toFixed(3) + '_' + lonNum.toFixed(3);
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* fall through */ }
  }

  // 1. Nominatim
  var result = _reverseGeocodeNominatim_(latNum, lonNum);
  if (result && result.city) {
    cache.put(key, JSON.stringify(result), GEO_CACHE_TTL);
    return result;
  }

  // 2. Photon fallback
  result = _reverseGeocodePhoton_(latNum, lonNum);
  if (result && result.city) {
    cache.put(key, JSON.stringify(result), GEO_CACHE_TTL);
    return result;
  }

  return result;  // může být null nebo objekt s prázdným city
}

function _reverseGeocodeNominatim_(lat, lon) {
  var cache = CacheService.getScriptCache();
  if (cache.get(NOMINATIM_BACKOFF_KEY)) {
    Logger.log('Nominatim reverse skip (backoff active)');
    return null;
  }
  var url = NOMINATIM_REVERSE_URL +
    '?format=json&accept-language=cs&zoom=14' +
    '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon);
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': NOMINATIM_UA }
    });
    var code = resp.getResponseCode();
    if (code === 429) {
      cache.put(NOMINATIM_BACKOFF_KEY, '1', NOMINATIM_BACKOFF_TTL);
      Logger.log('Nominatim reverse HTTP 429 — backoff aktivován na ' + NOMINATIM_BACKOFF_TTL + 's');
      return null;
    }
    if (code !== 200) {
      Logger.log('Nominatim reverse HTTP ' + code);
      return null;
    }
    var data = JSON.parse(resp.getContentText());
    var addr = data.address || {};
    var city = addr.city || addr.town || addr.village || addr.municipality
            || addr.suburb || addr.county || addr.city_district || '';
    return { city: city, display: data.display_name || '', source: 'nominatim' };
  } catch (e) {
    Logger.log('Nominatim reverse chyba: ' + e.message);
    return null;
  }
}

function _reverseGeocodePhoton_(lat, lon) {
  // Photon `lang=cs` vrací 400 — bez lang vrátí původní jazyk (pro CZ česky).
  var url = PHOTON_REVERSE_URL +
    '?lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon);
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': NOMINATIM_UA }
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('Photon reverse HTTP ' + resp.getResponseCode());
      return null;
    }
    var data = JSON.parse(resp.getContentText());
    if (!data.features || !data.features.length) return null;
    var props = data.features[0].properties || {};
    var city = props.city || props.locality || props.county || props.district || '';
    var displayParts = [props.street, props.housenumber, props.city, props.country].filter(Boolean);
    Logger.log('Photon reverse fallback OK → city=' + city);
    return { city: city, display: displayParts.join(', '), source: 'photon' };
  } catch (e) {
    Logger.log('Photon reverse chyba: ' + e.message);
    return null;
  }
}

// Backward-compat — `Geo_geocodeCity_` byl staršího jména. Teď deleguje
// na Geo_geocode_, který je generický. Smazat až nikdo nezavolá.
function Geo_geocodeCity_(city) {
  return Geo_geocode_(city);
}

/**
 * Admin: vymaže Nominatim backoff flag — pokud člověk ví, že rate-limit už
 * dávno vypršel, ale cache ještě drží zákaz. Spusť ručně z editoru.
 */
function clearNominatimBackoff() {
  CacheService.getScriptCache().remove(NOMINATIM_BACKOFF_KEY);
  Logger.log('Nominatim backoff flag smazán.');
  return { ok: true };
}

/**
 * Haversine — vzdálenost mezi dvěma body v km. FE má vlastní implementaci
 * (filter běží lokálně), tahle je pro server-side checks pokud bychom je
 * v budoucnu potřebovali (např. RSS filter podle polohy).
 */
function Geo_distanceKm_(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  var R = 6371;
  var toRad = function(d) { return d * Math.PI / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.asin(Math.sqrt(a));
}
