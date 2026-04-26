/**
 * Cache.gs — práce s listem "Menu Cache" (denní snapshoty menu)
 */

var _MENU_CACHE_TTL = 600;

function Cache_getMenuMap_(datum) {
  var key = 'menu_map_' + datum;
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var rows = _readAll_(SHEETS.MENU_CACHE);
  var map = {};
  rows.forEach(function(r) {
    if (_formatDate_(r.datum) === datum && r.data) {
      try {
        map[String(r.restaurace_id)] = JSON.parse(r.data);
      } catch (e) { /* skip corrupted row */ }
    }
  });

  // CacheService limit ~100 kB / klíč — v opačném případě neukládáme
  var serialized = JSON.stringify(map);
  if (serialized.length < 90000) {
    cache.put(key, serialized, _MENU_CACHE_TTL);
  }
  return map;
}

function Cache_storeMenu_(datum, restauraceId, menu) {
  var sheet = _sheet_(SHEETS.MENU_CACHE);
  var lastRow = sheet.getLastRow();
  var datumStr = String(datum);
  var ridStr = String(restauraceId);
  var aktualizovano = new Date();
  var headers = _headers_(sheet);

  if (lastRow >= 2) {
    var keys = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === datumStr && String(keys[i][1]) === ridStr) {
        var rowNum = i + 2;
        _setRowFields_(SHEETS.MENU_CACHE, rowNum, {
          data: JSON.stringify(menu),
          aktualizovano: aktualizovano
        });
        Cache_invalidate_(datum);
        return;
      }
    }
  }

  _appendRowMapped_(SHEETS.MENU_CACHE, {
    datum: datumStr,
    restaurace_id: ridStr,
    data: JSON.stringify(menu),
    aktualizovano: aktualizovano
  });
  Cache_invalidate_(datum);
}

function Cache_invalidate_(datum) {
  CacheService.getScriptCache().remove('menu_map_' + datum);
}

function Cache_pruneOld_(keepDate) {
  var sheet = _sheet_(SHEETS.MENU_CACHE);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var rowsToDelete = [];
  for (var i = 0; i < dates.length; i++) {
    if (String(dates[i][0]) !== String(keepDate)) rowsToDelete.push(i + 2);
  }

  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }
  return rowsToDelete.length;
}

/**
 * Smaže záznamy: jiné datum než keepDate, nebo dnešní datum pro ID, které
 * není v keepIds. Tj. cache zůstane = aktuálně sledované restaurace pro dnešek.
 */
function Cache_pruneStale_(keepDate, keepIds) {
  var sheet = _sheet_(SHEETS.MENU_CACHE);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var keepSet = {};
  (keepIds || []).forEach(function(id) { keepSet[String(id)] = true; });

  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var rowsToDelete = [];
  for (var i = 0; i < values.length; i++) {
    var datum = String(values[i][0]);
    var rid = String(values[i][1]);
    if (datum !== String(keepDate) || !keepSet[rid]) {
      rowsToDelete.push(i + 2);
    }
  }

  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }
  Cache_invalidate_(keepDate);
  return rowsToDelete.length;
}

/**
 * Smaže cache záznam pro konkrétní (datum, restauraceId).
 * Volá se při odebrání restaurace z posledního uživatele.
 */
function Cache_removeForRestaurant_(datum, restauraceId) {
  var sheet = _sheet_(SHEETS.MENU_CACHE);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var datumStr = String(datum);
  var ridStr = String(restauraceId);
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();

  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === datumStr && String(values[i][1]) === ridStr) {
      sheet.deleteRow(i + 2);
    }
  }
  Cache_invalidate_(datum);
}
