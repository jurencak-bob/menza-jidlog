/**
 * Util.gs — konstanty, sheet helpery, drobné funkce
 */

var WORKSPACE_DOMAIN = 'blogic.cz';
var TZ = 'Europe/Prague';

var SHEETS = {
  KONFIGURACE: '⚙️ Konfigurace',
  RESTAURACE:  'Restaurace',
  UZIVATELE:   'Uživatelé',
  MENU_CACHE:  'Menu Cache'
};

var SHEET_HEADERS = {
  KONFIGURACE: ['klíč', 'hodnota'],
  RESTAURACE:  ['id', 'název', 'město', 'url', 'aktivní', 'výchozí'],
  UZIVATELE:   ['email', 'sledovane_restaurace', 'skryte_restaurace', 'oblibena_jidla', 'dieta', 'vytvoreno', 'posledni_pristup', 'pocet_navstev', 'rss_drive_id', 'restaurace_overrides'],
  MENU_CACHE:  ['datum', 'restaurace_id', 'data', 'aktualizovano']
};

function _ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function _sheet_(name) {
  var s = _ss_().getSheetByName(name);
  if (!s) throw new Error('List "' + name + '" neexistuje. Spusť initializeMenicka().');
  return s;
}

function _headers_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function _readAll_(sheetName) {
  var sheet = _sheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = { _row: r + 1 };
    for (var c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = values[r][c];
    }
    rows.push(obj);
  }
  return rows;
}

function _appendRowMapped_(sheetName, fields) {
  var sheet = _sheet_(sheetName);
  var headers = _headers_(sheet);
  var row = headers.map(function(h) {
    return (h && fields[h] !== undefined) ? fields[h] : '';
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

// 1 read + 1 write bez ohledu na počet polí
function _setRowFields_(sheetName, rowNum, fields) {
  var sheet = _sheet_(sheetName);
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var rowRange = sheet.getRange(rowNum, 1, 1, lastCol);
  var current = rowRange.getValues()[0];

  var changed = false;
  Object.keys(fields).forEach(function(k) {
    var idx = headers.indexOf(k);
    if (idx >= 0) {
      current[idx] = fields[k];
      changed = true;
    }
  });

  if (changed) rowRange.setValues([current]);
}

function _today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function _formatDate_(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.length >= 10 ? d.substring(0, 10) : d;
  return Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd');
}

function _parseIdList_(raw) {
  if (!raw) return [];
  return String(raw).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

function _truthy_(val) {
  if (val === true || val === 1) return true;
  var s = String(val).toUpperCase();
  return s === '1' || s === 'TRUE' || s === 'ANO';
}

/**
 * Validuje a parsuje vstup od uživatele. Akceptuje POUZE plnou URL z menicka.cz
 * formátu `https://www.menicka.cz/<id>-<slug>.html` — bez ní nelze spolehlivě
 * získat název a město restaurace.
 *
 * @return { id, url } | null  (null pokud vstup není validní URL)
 */
function _parseMenickaUrl_(input) {
  if (!input) return null;
  var s = String(input).trim();
  var m = s.match(/^https?:\/\/(?:www\.)?menicka\.cz\/(\d+)-([a-z0-9-]+)\.html(?:[?#].*)?$/i);
  if (!m) return null;
  return {
    id: m[1],
    slug: m[2],
    url: 'https://www.menicka.cz/' + m[1] + '-' + m[2] + '.html'
  };
}

/**
 * Slug "radegastovna-rex" → "Radegastovna Rex". Odstraní prefix "restaurace-"
 * (často v URL, ne v lidsky čitelném názvu) a každé slovo s velkým prvním písmenem.
 */
function _slugToName_(slug) {
  if (!slug) return '';
  var s = String(slug).replace(/^restaurace-/i, '');
  return s
    .split('-')
    .filter(Boolean)
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(' ');
}

function _xmlEscape_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
