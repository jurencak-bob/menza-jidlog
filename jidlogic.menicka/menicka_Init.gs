/**
 * Init.gs — inicializace sheetu, nastavení triggerů.
 *
 * Spusť `initializeMenicka` jednou ručně z editoru po prvním otevření projektu.
 */

function initializeMenicka() {
  var ss = _ss_();

  Object.keys(SHEETS).forEach(function(key) {
    _ensureSheet_(ss, SHEETS[key], SHEET_HEADERS[key]);
  });

  Config_seedDefaults_();
  setupTriggers_();

  // Po schema migration doplň menze adresu / souřadnice z hard-coded defaultů,
  // pokud má prázdná pole (typicky po prvním běhu po přidání nových sloupců).
  Restaurants_reconcileMenza_();

  Logger.log('Menicka inicializována. URL: ' + ss.getUrl());
  return { url: ss.getUrl() };
}

function _ensureSheet_(ss, name, requiredHeaders) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, requiredHeaders.length)
      .setValues([requiredHeaders])
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }

  // Migrace — doplní chybějící sloupce na konec, existující data zachová
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var existingMap = {};
  existing.forEach(function(h, i) { if (h) existingMap[h] = i + 1; });

  requiredHeaders.forEach(function(h) {
    if (!existingMap[h]) {
      var nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue(h).setFontWeight('bold');
    }
  });

  if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Vymaže CacheService klíče (config, restaurace, dnešní + včerejší menu mapy)
 * a zároveň smaže všechny řádky z listu `Menu Cache`. Spusť ručně po změně
 * listů `⚙️ Konfigurace` / `Restaurace`, nebo když chceš začít s čistým
 * stavem (např. po zásadní změně parsovače).
 */
function clearAllCaches() {
  var cache = CacheService.getScriptCache();
  var dnes = _today_();
  var vcera = Utilities.formatDate(new Date(Date.now() - 86400000), TZ, 'yyyy-MM-dd');

  cache.removeAll([
    'config_v1',
    'restaurants_active_v1',
    'restaurants_active_v2',
    'menu_map_' + dnes,
    'menu_map_' + vcera
  ]);

  var sheet = _sheet_(SHEETS.MENU_CACHE);
  var lastRow = sheet.getLastRow();
  var smazano = 0;
  if (lastRow >= 2) {
    sheet.deleteRows(2, lastRow - 1);
    smazano = lastRow - 1;
  }

  Logger.log('Cache vyčištěna: CacheService klíče (config, restaurace, menu '
    + dnes + ' + ' + vcera + ') + ' + smazano + ' řádků v Menu Cache listu');
  return { ok: true, smazanoRadku: smazano };
}

/**
 * One-shot migrace: pro každý řádek v listu Restaurace, kde název má tvar
 * "Restaurace <číslo>" (placeholder z předchozí verze), se pokusí stáhnout
 * info z `url` sloupce. Pokud `url` není validní profile URL z menicka.cz,
 * řádek smaže (uživatel ho přidá znovu přes UI).
 *
 * Spusť ručně po nasazení nové verze.
 */
function repairRestaurants() {
  var rows = _readAll_(SHEETS.RESTAURACE);
  var sheet = _sheet_(SHEETS.RESTAURACE);
  var opraveno = 0, smazano = 0, prozatkano = 0;
  var deleteRows = [];
  var deletedIds = [];

  rows.forEach(function(r) {
    var nazev = String(r['název'] || '').trim();
    var isPlaceholder = /^Restaurace\s+\d+$/i.test(nazev) || !nazev;
    if (!isPlaceholder) {
      prozatkano++;
      return;
    }

    var url = String(r.url || '').trim();
    var parsed = _parseMenickaUrl_(url);

    if (!parsed) {
      deleteRows.push(r._row);
      deletedIds.push(String(r.id));
      smazano++;
      Logger.log('Mazání: id=' + r.id + ', url="' + url + '" není profile URL');
      return;
    }

    try {
      var info = Scraper_fetchRestaurantInfo_(parsed.url);
      _setRowFields_(SHEETS.RESTAURACE, r._row, {
        'název': info.nazev,
        'město': info.mesto,
        url: parsed.url
      });
      opraveno++;
      Logger.log('Opraveno: id=' + r.id + ' → ' + info.nazev + ' (' + info.mesto + ')');
    } catch (e) {
      deleteRows.push(r._row);
      deletedIds.push(String(r.id));
      smazano++;
      Logger.log('Mazání: id=' + r.id + ', fetch profilu selhal: ' + e.message);
    }
  });

  // Smaž řádky od konce, aby se neposouvaly indexy
  deleteRows.sort(function(a, b) { return b - a; });
  deleteRows.forEach(function(rowNum) { sheet.deleteRow(rowNum); });

  // Vyčisti ta ID i ze sledovane_restaurace všech uživatelů
  var orphansClean = 0;
  deletedIds.forEach(function(id) {
    orphansClean += _removeRestaurantFromAllUsers_(id);
  });
  if (orphansClean > 0) {
    Logger.log('Cleanup orphan subscriptions: dotčeno ' + orphansClean + ' řádků v Uživatelé');
  }

  Restaurants_invalidate_();

  Logger.log('repairRestaurants hotovo: opraveno=' + opraveno + ', smazáno=' + smazano + ', ponecháno=' + prozatkano);
  return { opraveno: opraveno, smazano: smazano, ponechano: prozatkano, orphansClean: orphansClean };
}

/**
 * Admin utility: hromadně přidá sledované restaurace pro daný email.
 * Použij když si uživatel nedopatřením smazal vše a chceš mu to obnovit.
 *
 * Před spuštěním uprav konstanty EMAIL a URLS níže (přímo v editoru)
 * a uloží se před spuštěním (Cmd+S).
 */
function bulkAddRestaurantsForUser() {
  var EMAIL = 'bohumil.jurencak@blogic.cz';
  var URLS = [
    // Přidej sem URLs restaurací, které chceš obnovit, např.:
    // 'https://www.menicka.cz/3538-radegastovna-rex.html',
  ];

  if (!URLS.length) {
    Logger.log('Edituj URLS array v menicka_Init.gs:bulkAddRestaurantsForUser a spusť znovu.');
    return;
  }

  var ok = 0, fail = [];
  URLS.forEach(function(url) {
    try {
      Restaurants_addToUser_(EMAIL, url);
      ok++;
      Logger.log('OK: ' + url);
    } catch (e) {
      fail.push({ url: url, chyba: e.message });
      Logger.log('CHYBA: ' + url + ' — ' + e.message);
    }
  });

  Logger.log('bulkAddRestaurantsForUser hotovo: ok=' + ok + ', chyby=' + fail.length);
  return { ok: ok, chyby: fail };
}

/**
 * One-shot: pro každý řádek v Restaurace bez `foto_url` zkusí stáhnout
 * tiskovou verzi profilu a doplnit URL loga. Skipuje řádky, kde už foto_url
 * je vyplněné (= idempotentní, bezpečné spustit opakovaně).
 *
 * Spusť ručně po `initializeMenicka` (která přidala sloupec foto_url do listu).
 */
function backfillRestaurantPhotos() {
  var rows = _readAll_(SHEETS.RESTAURACE);
  var doplneno = 0, preskoceno = 0, selhalo = 0;

  rows.forEach(function(r) {
    if (r.foto_url) { preskoceno++; return; }
    var id = String(r.id);
    if (!id || id === MENZA_RESTAURACE_ID) { preskoceno++; return; }

    var print = Scraper_fetchPrintProfile_(id);
    if (print.foto_url) {
      _setRowFields_(SHEETS.RESTAURACE, r._row, { foto_url: print.foto_url });
      doplneno++;
      Logger.log('foto_url pro id=' + id + ' → ' + print.foto_url);
    } else {
      selhalo++;
      Logger.log('foto_url pro id=' + id + ' nenalezeno');
    }
  });

  Restaurants_invalidate_();
  Logger.log('backfillRestaurantPhotos hotovo: doplneno=' + doplneno + ', preskoceno=' + preskoceno + ', selhalo=' + selhalo);
  return { doplneno: doplneno, preskoceno: preskoceno, selhalo: selhalo };
}

/**
 * One-shot: pro každý řádek v Restaurace bez `adresa` re-fetchne profile
 * z menicka.cz a doplní adresu (a foto_url, pokud taky chybí). Skipuje řádky,
 * kde už `adresa` je vyplněná, plus Menzu UTB (není na menicka.cz).
 *
 * Po doplnění adresy spustí ručně `backfillRestaurantCoords()` — souřadnice
 * z plné adresy budou přesnější (úroveň ulice).
 *
 * Mezi calls 0.5s pause — menicka.cz nemá explicitní rate limit, ale buďme slušní.
 */
function backfillRestaurantAddresses() {
  var rows = _readAll_(SHEETS.RESTAURACE);
  var doplneno = 0, preskoceno = 0, selhalo = 0;

  rows.forEach(function(r) {
    if (r['adresa']) { preskoceno++; return; }
    var id = String(r.id);
    if (!id || id === MENZA_RESTAURACE_ID) { preskoceno++; return; }
    if (!r.url) { preskoceno++; return; }

    try {
      var info = Scraper_fetchRestaurantInfo_(r.url);
      if (info.adresa) {
        _setRowFields_(SHEETS.RESTAURACE, r._row, { 'adresa': info.adresa });
        doplneno++;
        Logger.log('adresa pro id=' + id + ' → ' + info.adresa);
      } else {
        selhalo++;
        Logger.log('adresa pro id=' + id + ' nenalezena na menicka.cz');
      }
    } catch (e) {
      selhalo++;
      Logger.log('adresa pro id=' + id + ' fetch chyba: ' + e.message);
    }
    Utilities.sleep(500);
  });

  Restaurants_invalidate_();
  Logger.log('backfillRestaurantAddresses hotovo: doplneno=' + doplneno + ', preskoceno=' + preskoceno + ', selhalo=' + selhalo);
  return { doplneno: doplneno, preskoceno: preskoceno, selhalo: selhalo };
}

/**
 * Projde existující řádky v listu Restaurace a aplikuje `_normalizeAddress_`
 * na sloupec `adresa`. Spojí "Ulice, ČísloPopisné" do "Ulice ČísloPopisné"
 * (geocoding pak rozumí líp). Idempotentní — pokud je adresa už znormalizovaná,
 * nedělá nic. Po doběhnutí doporučeno `clearNominatimBackoff()` +
 * `backfillRestaurantCoords()` pro re-geocode s lepším formátem.
 */
function normalizeRestaurantAddresses() {
  var rows = _readAll_(SHEETS.RESTAURACE);
  var zmeneno = 0, beze_zmeny = 0;

  rows.forEach(function(r) {
    var orig = String(r['adresa'] || '').trim();
    if (!orig) { beze_zmeny++; return; }
    var fixed = _normalizeAddress_(orig);
    if (fixed !== orig) {
      _setRowFields_(SHEETS.RESTAURACE, r._row, { 'adresa': fixed });
      zmeneno++;
      Logger.log('id=' + r.id + ': "' + orig + '" → "' + fixed + '"');
    } else {
      beze_zmeny++;
    }
  });

  Restaurants_invalidate_();
  Logger.log('normalizeRestaurantAddresses hotovo: zmeneno=' + zmeneno + ', beze_zmeny=' + beze_zmeny);
  return { zmeneno: zmeneno, beze_zmeny: beze_zmeny };
}

/**
 * Pro každý řádek v Restaurace bez `lat/lon` zkusí přes Nominatim zjistit
 * souřadnice — primárně z plné `adresy` (úroveň ulice), fallback `město`.
 * Skipuje řádky, kde už lat (idempotentní). Mezi calls 1.1s pause kvůli
 * Nominatim rate limitu (1 req/s).
 *
 * Volá se:
 *   - Ručně po `initializeMenicka` přes editor (jednorázový backfill)
 *   - Automaticky půlnočním triggerem (zpracuje nové, ke kterým FE async
 *     geocoding selhal — typicky max pár záznamů denně)
 */
function backfillRestaurantCoords() {
  var rows = _readAll_(SHEETS.RESTAURACE);
  var doplneno = 0, preskoceno = 0, selhalo = 0;

  rows.forEach(function(r) {
    var hasLat = r.lat !== '' && r.lat != null;
    if (hasLat) { preskoceno++; return; }
    var adresa = String(r['adresa'] || '').trim();
    var mesto = String(r['město'] || '').trim();
    if (!adresa && !mesto) { preskoceno++; return; }

    var geo = Geo_geocodeRestaurant_(adresa, mesto);
    if (geo) {
      _setRowFields_(SHEETS.RESTAURACE, r._row, { lat: geo.lat, lon: geo.lon });
      doplneno++;
      Logger.log('lat/lon pro id=' + r.id + ' (' + (adresa || mesto) + ') → ' + geo.lat + ', ' + geo.lon);
    } else {
      selhalo++;
      Logger.log('lat/lon pro id=' + r.id + ' (' + (adresa || mesto) + ') nenalezeno');
    }
    Utilities.sleep(1500);  // Nominatim rate limit: 1 req/s + margin pro fallback adresa→město
  });

  Restaurants_invalidate_();
  Logger.log('backfillRestaurantCoords hotovo: doplneno=' + doplneno + ', preskoceno=' + preskoceno + ', selhalo=' + selhalo);
  return { doplneno: doplneno, preskoceno: preskoceno, selhalo: selhalo };
}

/**
 * Pro každého uživatele v listu Uživatelé odstraní ze `sledovane_restaurace`
 * ID, která neodpovídají žádné aktuální restauraci v listu Restaurace.
 * Spusť ručně, pokud máš podezření na orphan IDs (např. po manuálním smazání
 * řádku v Restaurace).
 */
function cleanupOrphanSubscriptions() {
  var registered = {};
  Restaurants_listActive_().forEach(function(r) { registered[r.id] = true; });

  var users = _readAll_(SHEETS.UZIVATELE);
  var changed = 0;

  users.forEach(function(u) {
    var ids = _parseIdList_(u.sledovane_restaurace);
    var filtered = ids.filter(function(id) { return registered[id]; });
    if (filtered.length !== ids.length) {
      _setRowFields_(SHEETS.UZIVATELE, u._row, {
        sledovane_restaurace: filtered.join(',')
      });
      Users_invalidate_(u.email);
      changed++;
      Logger.log('Cleanup ' + u.email + ': ' + ids.join(',') + ' → ' + filtered.join(','));
    }
  });

  Logger.log('cleanupOrphanSubscriptions hotovo: dotčeno ' + changed + ' uživatelů');
  return { changed: changed };
}

/**
 * One-shot migrace: vezme klíč `default_restaurace` z `⚙️ Konfigurace` a pro
 * každé v něm uvedené ID nastaví v listu Restaurace `výchozí=1`. Pokud ID
 * v Restaurace neexistuje, ID se ignoruje.
 *
 * Spusť ručně po `repairRestaurants` pokud chceš zachovat výchozí restaurace
 * z předchozí verze.
 */
function migrateDefaultsFromConfig() {
  var configIds = Config_defaultRestauraceIds_();
  if (configIds.length === 0) {
    Logger.log('default_restaurace v Konfiguraci je prázdná, nic k migraci.');
    return { migrated: 0 };
  }

  var rows = _readAll_(SHEETS.RESTAURACE);
  var migrated = 0;

  rows.forEach(function(r) {
    if (configIds.indexOf(String(r.id)) !== -1) {
      _setRowFields_(SHEETS.RESTAURACE, r._row, { 'výchozí': 1 });
      migrated++;
      Logger.log('výchozí=1 pro id=' + r.id);
    }
  });

  Restaurants_invalidate_();
  Logger.log('migrateDefaultsFromConfig hotovo: migrated=' + migrated);
  return { migrated: migrated };
}

/**
 * Public wrapper — aby šel `setupTriggers_` spustit ručně z dropdownu Apps
 * Script editoru. Funkce s podtržítkem na konci jsou totiž v GAS považované
 * za privátní a editor je nezobrazí.
 *
 * Volej po každé úpravě klíče `trigger_casy` v listu `⚙️ Konfigurace`.
 */
function setupTriggers() {
  return setupTriggers_();
}

/**
 * Vypíše do Logger.log (View → Executions) všechny aktuálně registrované
 * triggery — funkci, typ a (pro time-based) hodinu + timezone. Diagnostika
 * pro „proč mi nefungují automatické refreshe".
 */
function listTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) {
    Logger.log('ŽÁDNÉ TRIGGERY. Spusť setupTriggers().');
    return { count: 0 };
  }

  var summary = [];
  triggers.forEach(function(t) {
    var line = t.getHandlerFunction() + ' | ' + t.getEventType();
    try {
      if (t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
        line += ' | atHour=' + t.getTriggerSourceId();
      }
    } catch (e) { /* některé sourceId nejsou exposed */ }
    summary.push(line);
    Logger.log(line);
  });
  return { count: triggers.length, triggery: summary };
}

function setupTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var f = t.getHandlerFunction();
    if (f === 'refreshAllMenus' || f === 'clearTodaysCache' || f === 'backfillRestaurantCoords') {
      ScriptApp.deleteTrigger(t);
    }
  });

  var config = Config_get_();
  var hours = [];

  if (config.trigger_casy) {
    String(config.trigger_casy).split(',').forEach(function(s) {
      var h = parseInt(s.trim(), 10);
      if (!isNaN(h) && h >= 0 && h <= 23) hours.push(h);
    });
  }

  if (hours.length === 0) {
    [config.trigger_cas_1, config.trigger_cas_2].forEach(function(v) {
      var h = parseInt(v, 10);
      if (!isNaN(h) && h >= 0 && h <= 23) hours.push(h);
    });
  }

  hours = hours.filter(function(h, i) { return hours.indexOf(h) === i; }).sort(function(a, b) { return a - b; });

  hours.forEach(function(h) {
    // .nearMinute(0) → fire blízko :00 každé hodiny. Bez ní GAS rozhazuje fire
    // čas náhodně v rámci celé hodiny (až ~45 min jitter). S nearMinute typicky
    // ±5 min. Vzor podle parent Jídlogic projektu (Menza.feed.js).
    ScriptApp.newTrigger('refreshAllMenus')
      .timeBased()
      .atHour(h)
      .nearMinute(0)
      .everyDays(1)
      .inTimezone(TZ)
      .create();
  });

  // Cleanup trigger po obědě — `cache_konec_hodina` v Konfiguraci (default 17).
  var endHour = parseInt(config.cache_konec_hodina, 10);
  if (isNaN(endHour) || endHour < 0 || endHour > 23) endHour = 17;
  ScriptApp.newTrigger('clearTodaysCache')
    .timeBased()
    .atHour(endHour)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(TZ)
    .create();

  // Backfill geo coords v půlnoci — zpracuje restaurace, kterým FE async
  // geocoding selhal (Nominatim down, timeout, denial). Idempotentní, takže
  // pokud nic nechybí, prostě skipuje vše.
  ScriptApp.newTrigger('backfillRestaurantCoords')
    .timeBased()
    .atHour(0)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(TZ)
    .create();

  Logger.log('Triggery: refreshAllMenus pro hodiny ' + JSON.stringify(hours) +
             ', clearTodaysCache v ' + endHour + ':00, backfillRestaurantCoords v 0:00');
  return { refreshHours: hours, cleanupHour: endHour, geoBackfillHour: 0 };
}
