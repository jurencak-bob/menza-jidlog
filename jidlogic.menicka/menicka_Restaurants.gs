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
      return {
        id: String(r.id),
        nazev: r['název'] || '',
        mesto: r['město'] || '',
        url: r.url || '',
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
    if (existing) return existing;
    return _registerMenza_();
  }

  var parsed = _parseMenickaUrl_(input);
  if (!parsed) {
    throw new Error('Vlož kompletní URL z menicka.cz (např. https://www.menicka.cz/17-restaurace-...html).');
  }

  var existing2 = Restaurants_byId_(parsed.id);
  if (existing2) return existing2;

  // Stáhne info z profile stránky. Pokud fetch padne nebo parser nedoká
  // nazev / mesto vytáhnout, máme fallback ze slugu URL.
  var info = { nazev: null, mesto: null };
  try {
    info = Scraper_fetchRestaurantInfo_(parsed.url);
  } catch (e) {
    Logger.log('Info fetch selhal pro id=' + parsed.id + ': ' + e.message);
  }

  if (!info.nazev) {
    info.nazev = _slugToName_(parsed.slug);
  }
  if (!info.nazev) {
    throw new Error('Nepodařilo se zjistit ani odvodit název restaurace.');
  }
  // Město může zůstat prázdné — uživatel ho doplní přes UI ✏️.

  var rec = {
    id: String(parsed.id),
    nazev: info.nazev,
    mesto: info.mesto || '',
    url: parsed.url,
    vychozi: false
  };

  _appendRowMapped_(SHEETS.RESTAURACE, {
    id: rec.id,
    'název': rec.nazev,
    'město': rec.mesto,
    url: rec.url,
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
    url: rec.url,
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
function _registerMenza_() {
  var rec = {
    id: MENZA_RESTAURACE_ID,
    nazev: MENZA_INFO.nazev,
    mesto: MENZA_INFO.mesto,
    url: MENZA_INFO.url,
    vychozi: false
  };
  _appendRowMapped_(SHEETS.RESTAURACE, {
    id: rec.id,
    'název': rec.nazev,
    'město': rec.mesto,
    url: rec.url,
    'aktivní': 1,
    'výchozí': 0
  });
  Restaurants_invalidate_();
  return rec;
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
