/**
 * Restaurants.gs — globální katalog restaurací + per-user sledování.
 *
 * Princip: jedna restaurace = jeden řádek v listu Restaurace, sdílený mezi
 * všemi uživateli. Per-user je jen sloupec `sledovane_restaurace` v Uživatelé.
 * Menu se stahuje per restauraci, ne per uživatele.
 *
 * Vstup pro registraci je VŽDY plná URL z menicka.cz formátu
 * `https://www.menicka.cz/<id>-<slug>.html`. Bez ní nelze garantovat reálný
 * název a město → registrace je odmítnuta.
 *
 * Invariant: každý uživatel musí sledovat alespoň 1 restauraci. Odebrání
 * poslední je odmítnuto na frontendu i serveru.
 */

var _RESTAURANTS_CACHE_KEY = 'restaurants_active_v2';
var _RESTAURANTS_CACHE_TTL = 600;

function Restaurants_listActive_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(_RESTAURANTS_CACHE_KEY);
  if (hit) return JSON.parse(hit);

  var rows = _readAll_(SHEETS.RESTAURACE);
  var active = rows
    .filter(function(r) { return _truthy_(r['aktivní']); })
    .map(function(r) {
      var lat = parseFloat(r.lat);
      var lon = parseFloat(r.lon);
      return {
        id: String(r.id),
        nazev: r['název'] || '',
        mesto: r['město'] || '',
        adresa: r['adresa'] || '',
        url: r.url || '',
        foto_url: r.foto_url || '',
        lat: isNaN(lat) ? null : lat,
        lon: isNaN(lon) ? null : lon,
        vychozi: _truthy_(r['výchozí'])
      };
    });

  cache.put(_RESTAURANTS_CACHE_KEY, JSON.stringify(active), _RESTAURANTS_CACHE_TTL);
  return active;
}

function Restaurants_invalidate_() {
  CacheService.getScriptCache().remove(_RESTAURANTS_CACHE_KEY);
}

function Restaurants_byId_(id) {
  var list = Restaurants_listActive_();
  var sid = String(id);
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === sid) return list[i];
  }
  return null;
}

function Restaurants_listDefault_() {
  return Restaurants_listActive_()
    .filter(function(r) { return r.vychozi; })
    .map(function(r) { return r.id; });
}

/**
 * Zaregistruje restauraci podle plné URL z menicka.cz. Pokud restaurace už
 * existuje, vrátí ji beze změny (žádný refresh info, žádný extra fetch).
 */
function Restaurants_register_(input) {
  // Speciální zkratka pro Menzu UTB
  if (String(input).trim().toLowerCase() === MENZA_RESTAURACE_ID) {
    var existing = Restaurants_byId_(MENZA_RESTAURACE_ID);
    if (existing) {
      // DB záznam existuje, ale může mít prázdná pole (registrace před přidáním
      // sloupců adresa/lat/lon). Reconcile doplní z hard-coded defaultů.
      Restaurants_reconcileMenza_();
      return Restaurants_byId_(MENZA_RESTAURACE_ID);  // re-read po reconcile
    }
    return _registerMenza_();
  }

  var parsed = _parseMenickaUrl_(input);
  if (!parsed) {
    throw new Error('Vlož kompletní URL z menicka.cz (např. https://www.menicka.cz/17-restaurace-...html).');
  }

  var existing2 = Restaurants_byId_(parsed.id);
  if (existing2) return existing2;

  // Stáhne info z profile stránky (název + město). Print profil je 2. zdroj
  // pro název a jediný zdroj pro foto_url (logo restaurace).
  // Pokud cokoliv padne, máme fallback ze slugu URL pro název, prázdné pro
  // ostatní pole.
  var info = { nazev: null, mesto: null };
  try {
    info = Scraper_fetchRestaurantInfo_(parsed.url);
  } catch (e) {
    Logger.log('Info fetch selhal pro id=' + parsed.id + ': ' + e.message);
  }

  var print = Scraper_fetchPrintProfile_(parsed.id);  // soft-fail uvnitř

  if (!info.nazev) info.nazev = print.nazev;
  if (!info.nazev) info.nazev = _slugToName_(parsed.slug);
  if (!info.nazev) {
    throw new Error('Nepodařilo se zjistit ani odvodit název restaurace.');
  }
  // Město může zůstat prázdné — uživatel ho doplní přes UI ✏️.

  // Bez sync geocode — addRestaurant musí být co nejrychlejší. Souřadnice
  // doplní FE async přes `geocodeRestaurant(id)` po success addu, nebo
  // půlnoční backfill trigger pro chybějící.
  var rec = {
    id: String(parsed.id),
    nazev: info.nazev,
    mesto: info.mesto || '',
    adresa: info.adresa || '',
    url: parsed.url,
    foto_url: print.foto_url || '',
    lat: null,
    lon: null,
    vychozi: false
  };

  _appendRowMapped_(SHEETS.RESTAURACE, {
    id: rec.id,
    'název': rec.nazev,
    'město': rec.mesto,
    'adresa': rec.adresa,
    url: rec.url,
    foto_url: rec.foto_url,
    lat: '',
    lon: '',
    'aktivní': 1,
    'výchozí': 0
  });

  Restaurants_invalidate_();
  return rec;
}

/**
 * Přidá restauraci do uživatelových sledovaných. Pokud restaurace v katalogu
 * neexistuje, registruje ji (jeden UrlFetch na profile). Menu se NESTAHUJE —
 * frontend si ho dotáhne separátně přes `fetchMenuForRestaurant`, aby tahle
 * funkce vrátila response co nejdřív.
 */
function Restaurants_addToUser_(email, input) {
  var rec = Restaurants_register_(input);

  // Force fresh read + lock kvůli race conditions: bez toho cached user objekt
  // mohl mít stale `sledovane_restaurace` a append by přepsal sheet starým
  // stavem + jen nově přidané ID (= ostatní restaurace by zmizely).
  var lock = LockService.getDocumentLock();
  lock.tryLock(10000);
  try {
    Users_invalidate_(email);
    var user = Users_findByEmail_(email);
    if (!user) throw new Error('Uživatel nenalezen');

    var ids = _parseIdList_(user.sledovane_restaurace);
    if (ids.indexOf(rec.id) === -1) {
      ids.push(rec.id);
      Users_updateSettings_(email, { sledovane_restaurace: ids.join(',') });
    }

    return { restaurace: rec, sledovane: ids };
  } finally {
    lock.releaseLock();
  }
}

var REFRESH_MIN_AGE_MS = 15 * 60 * 1000;
var REFRESH_LOCK_TTL_S = 30;

/**
 * Vynucené stažení menu pro jednu restauraci (ruční refresh z FE).
 * Respektuje 15-min cooldown — pokud bylo menu stažené před méně než 15 min,
 * vrátí existující data s flagem `tooEarly`.
 *
 * Soft-lock přes CacheService zabrání paralelním fetchům té samé restaurace
 * z více klientů. Pokud je lock obsazený, vrátí flag `locked`.
 */
function Restaurants_refreshMenuFor_(restauraceId) {
  var rid = String(restauraceId);
  var dnes = _today_();

  var menuMap = Cache_getMenuMap_(dnes);
  var existing = menuMap[rid];

  // Mimo refresh okno (před prvním triggerem / po cleanupu) nedává smysl
  // stahovat — cache je stejně prázdná nebo se chystá k smazání.
  if (_isOutsideRefreshWindow_()) {
    return {
      id: rid,
      menu: existing,
      outsideHours: true,
      firstHour: _scheduleHours_()[0],
      endHour: _scheduleEndHour_()
    };
  }

  // Cooldown přeskoč, pokud poslední fetch byl chyba (UTB API blip, parse
  // failure, …) — uživatel by jinak čekal 15 min na nic. Detekce přes:
  //   - explicitní `transient_error` (nový flag z Menza fetche)
  //   - `chyba` (parser exception z menicka.cz iframe)
  //   - info string obsahující "nepodařilo" / "chyba" / "selhalo" — pokrývá
  //     i staré cache záznamy bez explicitního flagu
  var isFailureCache = existing && (
    existing.transient_error === true ||
    !!existing.chyba ||
    (existing.info && /nepoda[řr]ilo|chyba|selhal/i.test(existing.info))
  );

  if (existing && existing.aktualizovano && !isFailureCache) {
    var ageMs = Date.now() - new Date(existing.aktualizovano).getTime();
    if (ageMs < REFRESH_MIN_AGE_MS) {
      return {
        id: rid,
        menu: existing,
        tooEarly: true,
        ageMin: Math.floor(ageMs / 60000)
      };
    }
  }

  var cache = CacheService.getScriptCache();
  var lockKey = 'refresh_lock_' + rid;
  if (cache.get(lockKey)) {
    return { id: rid, menu: existing, locked: true };
  }
  cache.put(lockKey, '1', REFRESH_LOCK_TTL_S);

  try {
    var menu = _fetchMenuByDataSource_(rid);
    Cache_storeMenu_(dnes, rid, menu);
    return { id: rid, menu: menu, refreshed: true };
  } catch (e) {
    return { id: rid, menu: existing, chyba: e.message };
  } finally {
    cache.remove(lockKey);
  }
}

/**
 * Stáhne dnešní menu pro jednu restauraci a uloží do cache. Volá se z FE
 * po přidání restaurace, aby uživatel viděl menu hned. Pokud cache už
 * existuje, jen ji vrátí.
 */
function Restaurants_fetchMenuFor_(restauraceId) {
  var rid = String(restauraceId);
  var dnes = _today_();

  var menuMap = Cache_getMenuMap_(dnes);
  if (menuMap[rid]) return { id: rid, menu: menuMap[rid], cached: true };

  try {
    var menu = _fetchMenuByDataSource_(rid);
    Cache_storeMenu_(dnes, rid, menu);
    return { id: rid, menu: menu, cached: false };
  } catch (e) {
    return { id: rid, menu: null, chyba: e.message };
  }
}

/**
 * Routovací funkce: vybere správný zdroj podle ID.
 * - "menza" → UTB JSON API (menicka_Menza.gs)
 * - jinak  → menicka.cz iframe HTML
 */
function _fetchMenuByDataSource_(restauraceId) {
  if (String(restauraceId) === MENZA_RESTAURACE_ID) {
    return Menza_fetchTodayMenu_();
  }
  var html = Scraper_fetchHtml_(restauraceId);
  return Parser_parseMenu_(html, restauraceId);
}

/**
 * Odebere restauraci ze sledovaných. Defense-in-depth pravidlo: pokud by
 * uživateli zbylo 0 sledovaných, odmítne. Pokud po odebrání restauraci
 * nikdo nesleduje a není výchozí, vyčistí dnešní cache pro dané ID.
 */
function Restaurants_removeFromUser_(email, restauraceId) {
  var lock = LockService.getDocumentLock();
  lock.tryLock(10000);
  try {
    Users_invalidate_(email);
    var user = Users_findByEmail_(email);
    if (!user) throw new Error('Uživatel nenalezen');

    var rid = String(restauraceId);
    var current = _parseIdList_(user.sledovane_restaurace);

    if (current.indexOf(rid) === -1) {
      return { sledovane: current };
    }

    if (current.length === 1) {
      throw new Error('Musíš sledovat alespoň jednu restauraci. Nejdřív přidej další, pak můžeš odebrat tuto.');
    }

    var filtered = current.filter(function(id) { return id !== rid; });

    // Cleanup ze skrytých zároveň, aby orphan flagy nezůstaly viset
    var skryte = _parseIdList_(user.skryte_restaurace);
    var skryteFiltered = skryte.filter(function(id) { return id !== rid; });

    var updates = { sledovane_restaurace: filtered.join(',') };
    if (skryteFiltered.length !== skryte.length) {
      updates.skryte_restaurace = skryteFiltered.join(',');
    }
    Users_updateSettings_(email, updates);

    if (!_isWatchedByAnyone_(rid)) {
      Cache_removeForRestaurant_(_today_(), rid);
    }

    return { sledovane: filtered };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Per-user override pro název a město restaurace. Globální záznam v listu
 * Restaurace zůstává nedotčený (slouží jako fallback). URL měnit nelze —
 * uživatel musí restauraci odebrat a přidat znovu s novou URL.
 */
function Restaurants_setOverride_(email, restauraceId, payload) {
  var lock = LockService.getDocumentLock();
  lock.tryLock(10000);
  try {
    Users_invalidate_(email);
    var user = Users_findByEmail_(email);
    if (!user) throw new Error('Uživatel nenalezen');

    var rid = String(restauraceId);
    var registered = Restaurants_byId_(rid);
    if (!registered) throw new Error('Restaurace neexistuje v katalogu.');

    var nazev = (payload.nazev !== undefined) ? String(payload.nazev).trim() : null;
    var mesto = (payload.mesto !== undefined) ? String(payload.mesto).trim() : null;

    if (nazev !== null && !nazev) throw new Error('Název nesmí být prázdný.');

    var overrides = _parseUserOverrides_(user.restaurace_overrides);
    var existing = overrides[rid] || {};

    var newNazev = (nazev !== null) ? nazev : (existing.nazev || registered.nazev);
    var newMesto = (mesto !== null) ? mesto : (existing.mesto !== undefined ? existing.mesto : registered.mesto);

    if (newNazev === registered.nazev && newMesto === registered.mesto) {
      delete overrides[rid];
    } else {
      overrides[rid] = { nazev: newNazev, mesto: newMesto };
    }

    Users_updateSettings_(email, { restaurace_overrides: JSON.stringify(overrides) });

    return _applyOverride_(registered, overrides[rid]);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Re-fetch katalogových metadat pro restauraci (z menicka.cz). Doplňuje JEN
 * prázdná pole (adresa, foto_url, lat/lon) — název a město jsou stabilní a
 * mohou mít per-user overrides. Idempotentní: pokud nic nechybí, neudělá nic.
 *
 * Volá se:
 *   - Z `updateRestaurant` po Save edit formu (uživatel tak pasivně doplní data
 *     pro restaurace registrované před přidáním sloupců adresa/lat/lon).
 *   - Z admin backfillu `backfillRestaurantAddresses`.
 */
function Restaurants_refreshCatalogInfo_(restauraceId) {
  var rid = String(restauraceId);
  if (rid === MENZA_RESTAURACE_ID) return null;  // Menza není na menicka.cz

  var rows = _readAll_(SHEETS.RESTAURACE);
  var row = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === rid) { row = rows[i]; break; }
  }
  if (!row || !row.url) return null;

  var updates = {};
  var needsAddress = !row['adresa'];
  var needsFoto = !row.foto_url;

  if (needsAddress) {
    try {
      var info = Scraper_fetchRestaurantInfo_(row.url);
      if (info.adresa) updates['adresa'] = info.adresa;
    } catch (e) { Logger.log('refreshCatalogInfo profile fetch fail pro ' + rid + ': ' + e.message); }
  }

  if (needsFoto) {
    try {
      var print = Scraper_fetchPrintProfile_(rid);
      if (print.foto_url) updates.foto_url = print.foto_url;
    } catch (e) { Logger.log('refreshCatalogInfo print fetch fail pro ' + rid + ': ' + e.message); }
  }

  // Lat/lon — pokud chybí, geocoduj z (nově získané nebo existující) adresy
  var hasLat = row.lat !== '' && row.lat != null;
  if (!hasLat) {
    var addr = updates['adresa'] || row['adresa'] || '';
    var mesto = row['město'] || '';
    if (addr || mesto) {
      var geo = Geo_geocodeRestaurant_(addr, mesto);
      if (geo) {
        updates.lat = geo.lat;
        updates.lon = geo.lon;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    _setRowFields_(SHEETS.RESTAURACE, row._row, updates);
    Restaurants_invalidate_();
  }
  return Restaurants_byId_(rid);
}

/**
 * Vrací seznam aktivních restaurací s aplikovanými per-user overrides.
 * Použije se v bootstrap a v RSS publish.
 */
function Restaurants_resolveForUser_(email) {
  var user = email ? Users_findByEmail_(email) : null;
  var overrides = user ? _parseUserOverrides_(user.restaurace_overrides) : {};

  return Restaurants_listActive_().map(function(r) {
    return _applyOverride_(r, overrides[r.id]);
  });
}

function _applyOverride_(rec, override) {
  if (!override) return rec;
  return {
    id: rec.id,
    nazev: override.nazev || rec.nazev,
    mesto: (override.mesto !== undefined) ? override.mesto : rec.mesto,
    adresa: rec.adresa || '',
    url: rec.url,
    foto_url: rec.foto_url || '',
    lat: rec.lat,
    lon: rec.lon,
    vychozi: rec.vychozi,
    custom: true
  };
}

function _parseUserOverrides_(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

/**
 * Odstraní ID ze `sledovane_restaurace` u všech uživatelů, kteří ho mají.
 * Volá se z migračních funkcí po smazání restaurace z katalogu.
 */
function _removeRestaurantFromAllUsers_(restauraceId) {
  var rid = String(restauraceId);
  var users = _readAll_(SHEETS.UZIVATELE);
  var changed = 0;

  users.forEach(function(u) {
    var ids = _parseIdList_(u.sledovane_restaurace);
    var filtered = ids.filter(function(id) { return id !== rid; });
    if (filtered.length !== ids.length) {
      _setRowFields_(SHEETS.UZIVATELE, u._row, {
        sledovane_restaurace: filtered.join(',')
      });
      Users_invalidate_(u.email);
      changed++;
    }
  });

  return changed;
}

/**
 * Zaregistruje speciální Menzu UTB do listu Restaurace.
 */
// Hard-coded default pro Menzu UTB — jen adresa Fakulty aplikované informatiky
// (Nad Stráněmi 4511, Zlín), kde menza U5 reálně sídlí. Souřadnice se získávají
// dynamicky přes Nominatim/Photon stejně jako u ostatních restaurací (registrace
// uloží lat=null, FE async / půlnoční backfill geocoduje).
var MENZA_DEFAULTS = {
  adresa: 'Nad Stráněmi 4511, 760 05 Zlín'
};

function _registerMenza_() {
  var rec = {
    id: MENZA_RESTAURACE_ID,
    nazev: MENZA_INFO.nazev,
    mesto: MENZA_INFO.mesto,
    adresa: MENZA_DEFAULTS.adresa,
    url: MENZA_INFO.url,
    foto_url: '',
    lat: null,
    lon: null,
    vychozi: false
  };
  _appendRowMapped_(SHEETS.RESTAURACE, {
    id: rec.id,
    'název': rec.nazev,
    'město': rec.mesto,
    'adresa': rec.adresa,
    url: rec.url,
    foto_url: '',
    lat: '',
    lon: '',
    'aktivní': 1,
    'výchozí': 0
  });
  Restaurants_invalidate_();
  return rec;
}

/**
 * Pokud řádek menzy v listu Restaurace má prázdné pole `adresa`, doplní ho
 * z `MENZA_DEFAULTS.adresa`. DB hodnoty zůstanou nedotčené. Souřadnice se
 * neřeší — ty doplní backfill (Nominatim/Photon z adresy), stejně jako u
 * ostatních restaurací. Idempotentní.
 *
 * Volá se z `initializeMenicka` (schema migration) a z `Restaurants_register_`
 * když user přidá Menzu a ona už v listu je.
 */
function Restaurants_reconcileMenza_() {
  var rows = _readAll_(SHEETS.RESTAURACE);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) !== MENZA_RESTAURACE_ID) continue;
    var r = rows[i];
    var updates = {};
    if (!r['adresa']) updates['adresa'] = MENZA_DEFAULTS.adresa;
    // lat/lon se neřeší — doplní backfillRestaurantCoords() přes geocoding
    if (Object.keys(updates).length > 0) {
      _setRowFields_(SHEETS.RESTAURACE, r._row, updates);
      Restaurants_invalidate_();
      Logger.log('Menza reconcile: doplněno z defaultů → ' + Object.keys(updates).join(', '));
      return updates;
    }
    return null;  // Menza existuje, adresa vyplněná
  }
  return null;  // Menza v listu vůbec není (nikdy nebyla registrovaná)
}

/**
 * Vrací true pokud aspoň jeden uživatel restauraci sleduje, nebo je výchozí.
 */
function _isWatchedByAnyone_(restauraceId) {
  var rid = String(restauraceId);

  if (Restaurants_listDefault_().indexOf(rid) !== -1) return true;

  var users = _readAll_(SHEETS.UZIVATELE);
  for (var i = 0; i < users.length; i++) {
    var ids = _parseIdList_(users[i].sledovane_restaurace);
    if (ids.indexOf(rid) !== -1) return true;
  }
  return false;
}
