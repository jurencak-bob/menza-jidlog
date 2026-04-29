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
  var datumStr = _formatDate_(datum);  // normalizuje string i Date na "yyyy-MM-dd"
  var ridStr = String(restauraceId);
  var aktualizovano = new Date();
  var headers = _headers_(sheet);

  // Timestamp stažení do JSONu menu, ať si FE může spočítat stáří + zobrazit
  // datum/čas v hlavičce karty + rozhodnout o ručním refreshi.
  menu.aktualizovano = aktualizovano.toISOString();

  if (lastRow >= 2) {
    var keys = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < keys.length; i++) {
      // Porovnáváme přes _formatDate_ — Sheets převádí "yyyy-MM-dd" stringy na
      // Date objekty při zápisu, takže `String(keys[i][0])` by vrátilo
      // "Mon Apr 27 2026 …" a nikdy se nenamatchovalo se string datumem.
      if (_formatDate_(keys[i][0]) === datumStr && String(keys[i][1]) === ridStr) {
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

  var keepStr = _formatDate_(keepDate);
  var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var rowsToDelete = [];
  for (var i = 0; i < dates.length; i++) {
    if (_formatDate_(dates[i][0]) !== keepStr) rowsToDelete.push(i + 2);
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

  var keepStr = _formatDate_(keepDate);
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var rowsToDelete = [];
  for (var i = 0; i < values.length; i++) {
    var datum = _formatDate_(values[i][0]);
    var rid = String(values[i][1]);
    if (datum !== keepStr || !keepSet[rid]) {
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
 * Smaže všechny dnešní záznamy z Menu Cache. Volá se denně v `cache_konec_hodina`
 * (default 17:00) — po této době už menu nepotřebujeme, navíc by stará data
 * matla uživatele, kteří appku otevřou večer/noc.
 */
function clearTodaysCache() {
  var dnes = _today_();
  var sheet = _sheet_(SHEETS.MENU_CACHE);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('clearTodaysCache: prázdné, nic ke smazání');
    return { smazano: 0 };
  }

  var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var rowsToDelete = [];
  for (var i = 0; i < dates.length; i++) {
    // _formatDate_ normalizuje Date object i string na "yyyy-MM-dd". Sheets
    // autoformátuje datový string na Date při zápisu — `String(dates[i][0])` by
    // tady vrátil "Mon Apr 27 2026 …" a nikdy se nenamatchoval s `dnes`.
    if (_formatDate_(dates[i][0]) === dnes) rowsToDelete.push(i + 2);
  }

  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }

  Cache_invalidate_(dnes);
  Logger.log('clearTodaysCache: smazáno ' + rowsToDelete.length + ' řádků pro ' + dnes);
  return { smazano: rowsToDelete.length };
}

/**
 * Smaže cache záznam pro konkrétní (datum, restauraceId).
 * Volá se při odebrání restaurace z posledního uživatele.
 */
function Cache_removeForRestaurant_(datum, restauraceId) {
  var sheet = _sheet_(SHEETS.MENU_CACHE);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var datumStr = _formatDate_(datum);
  var ridStr = String(restauraceId);
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();

  for (var i = values.length - 1; i >= 0; i--) {
    if (_formatDate_(values[i][0]) === datumStr && String(values[i][1]) === ridStr) {
      sheet.deleteRow(i + 2);
    }
  }
  Cache_invalidate_(datum);
}
