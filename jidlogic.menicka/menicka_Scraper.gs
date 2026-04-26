/**
 * Scraper.gs — stahování HTML z menicka.cz
 *
 * Server vyžaduje browser User-Agent. Bez něj `api/iframe/?id=<id>` vrací
 * stránku, kde každý den má `Pro tento den nebylo zadáno menu` (bot detection).
 * HTML je v windows-1250.
 */

var MENICKA_API = 'https://www.menicka.cz/api/iframe/?id=';
var MENICKA_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function _menickaFetch_(url) {
  return UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': MENICKA_UA }
  });
}

function Scraper_fetchHtml_(restauraceId) {
  var url = MENICKA_API + restauraceId;
  var response = _menickaFetch_(url);
  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('HTTP ' + code + ' pro ' + url);
  }
  return Utilities.newBlob(response.getContent()).getDataAsString('windows-1250');
}

/**
 * Stáhne profile stránku restaurace (https://www.menicka.cz/<id>-<slug>.html)
 * a vrátí název + město. Hard-fail: pokud cokoliv selže, vyhazuje error.
 */
function Scraper_fetchRestaurantInfo_(profileUrl) {
  if (!profileUrl) throw new Error('Chybí URL profilu restaurace.');

  var resp = _menickaFetch_(profileUrl);
  var code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error('Profil restaurace nedostupný (HTTP ' + code + ').');
  }
  var html = Utilities.newBlob(resp.getContent()).getDataAsString('windows-1250');
  return Parser_extractRestaurantInfo_(html);
}

/**
 * Sjednocená množina ID, pro která se má stahovat menu:
 *   - výchozí restaurace (Restaurace.výchozí=1)
 *   - sjednocení sledovane_restaurace všech uživatelů
 *
 * Filtrováno tak, že vrací jen ID restaurací, které jsou registrované
 * (existuje řádek v listu Restaurace).
 */
function Scraper_collectIds_() {
  var registered = {};
  Restaurants_listActive_().forEach(function(r) { registered[r.id] = true; });

  var watching = {};
  Restaurants_listDefault_().forEach(function(id) {
    if (registered[id]) watching[id] = true;
  });
  _readAll_(SHEETS.UZIVATELE).forEach(function(u) {
    _parseIdList_(u.sledovane_restaurace).forEach(function(id) {
      if (registered[id]) watching[id] = true;
    });
  });

  return Object.keys(watching);
}

/**
 * Stáhne menu pro všechny aktuálně sledované restaurace. Volá se z time-based
 * triggeru. Cache pro IDs, které už nikdo nesleduje, se vyčistí.
 */
function refreshAllMenus() {
  var ids = Scraper_collectIds_();
  var dnes = _today_();
  var uspechy = 0;
  var neuspechy = [];

  // Cache cleanup: smaž vše pro datum != dnes a vše pro ID mimo aktivní množinu
  Cache_pruneStale_(dnes, ids);

  ids.forEach(function(id) {
    try {
      var menu = _fetchMenuByDataSource_(id);
      Cache_storeMenu_(dnes, id, menu);
      uspechy++;
    } catch (e) {
      neuspechy.push({ id: id, chyba: e.message });
      Logger.log('Refresh ' + id + ' selhal: ' + e.message);
    }
  });

  Cache_invalidate_(dnes);

  // Po stažení nových menu regeneruj RSS pro aktivní uživatele
  try {
    Rss_publishAll_();
  } catch (e) {
    Logger.log('RSS publish chyba: ' + e.message);
  }

  Logger.log('Refresh hotov. OK=' + uspechy + ', chyby=' + neuspechy.length);
  return { uspechy: uspechy, neuspechy: neuspechy };
}
