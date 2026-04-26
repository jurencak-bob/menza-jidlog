/**
 * menicka_Menza.gs — stahování dnešního menu z UTB Menzy přes JSON API.
 *
 * Speciální restaurace s id="menza" (string odlišuje od numerických
 * iframe-id menicka.cz). Endpointy:
 *   GET /Ordering?CanteenId=<id>      → seznam dostupných dnů
 *   GET /Menu?Dates=<dt>&CanteenId=<id> → položky pro daný den
 *
 * API kategorie → naše schéma:
 *   "polévka"        → polevky
 *   "oběd"           → hlavni_jidla
 *   "oběd ostatní"   → hlavni_jidla
 *   "pizza"          → hlavni_jidla
 *   "minutky"/"minutka" → ignorováno
 *   menza nemá pití ani dezerty
 *
 * Pokud API vrací prázdno (víkend, prázdniny), `menu.info` obsahuje hlášku.
 */

var MENZA_RESTAURACE_ID = 'menza';
var MENZA_BASE_URL = 'https://jidelnicek.utb.cz/webkredit/Api/Ordering';
var MENZA_CANTEEN_ID = 3;

var MENZA_INFO = {
  nazev: 'Menza UTB',
  mesto: 'Zlín',
  url:   'https://jidelnicek.utb.cz'
};

// Kategorie z API → klíč v našem menu objektu. Hodnoty mimo mapu se ignorují.
var MENZA_KIND_MAP = {
  'polévka':      'polevky',
  'oběd':         'hlavni_jidla',
  'oběd ostatní': 'hlavni_jidla',
  'pizza':        'hlavni_jidla'
};

// "120g Svíčková" → "Svíčková"
var MENZA_WEIGHT_RE = /^\d+[,.]?\d*\s*(g|kg|ml|l|dcl)\s+/i;

function Menza_fetchTodayMenu_() {
  var dnes = _today_();
  var menu = {
    restaurace_id: MENZA_RESTAURACE_ID,
    datum: dnes,
    polevky: [],
    hlavni_jidla: [],
    piti: [],
    dezerty: []
  };

  // Krok 1: najdi v Ordering API token pro dnešní datum
  var orderResp = _menzaFetchJson_(MENZA_BASE_URL + '/Ordering?CanteenId=' + MENZA_CANTEEN_ID);
  if (!orderResp) {
    menu.info = 'Menzu se nepodařilo načíst.';
    return menu;
  }

  var dates = orderResp.dates || [];
  var todayParam = null;
  for (var i = 0; i < dates.length; i++) {
    try {
      var dt = new Date(dates[i].date);
      var localStr = Utilities.formatDate(dt, TZ, 'yyyy-MM-dd');
      if (localStr === dnes) {
        todayParam = dates[i].date;
        break;
      }
    } catch (e) { /* invalid date — skip */ }
  }

  if (!todayParam) {
    menu.info = 'Menza dnes nevaří.';
    return menu;
  }

  // Krok 2: stáhni jídla pro nalezené datum
  var menuUrl = MENZA_BASE_URL + '/Menu?Dates=' + encodeURIComponent(todayParam) + '&CanteenId=' + MENZA_CANTEEN_ID;
  var menuResp = _menzaFetchJson_(menuUrl);
  if (!menuResp) {
    menu.info = 'Menzu se nepodařilo načíst.';
    return menu;
  }

  var items = [];
  (menuResp.groups || []).forEach(function(g) {
    (g.rows || []).forEach(function(r) {
      if (r.item) items.push(r.item);
    });
  });

  if (items.length === 0) {
    menu.info = 'Menza dnes nemá zveřejněný jídelníček.';
    return menu;
  }

  // Krok 3: roztřiď do kategorií + číslování (jen pro hlavní jídla)
  var hlavniCounter = 0;
  items.forEach(function(item) {
    var kind = String(item.mealKindName || '').trim().toLowerCase();
    var category = MENZA_KIND_MAP[kind];
    if (!category) return;

    var name = String(item.mealName || '').trim().replace(MENZA_WEIGHT_RE, '');
    if (!name) return;
    name = name.charAt(0).toUpperCase() + name.slice(1);

    var cislo = null;
    if (category === 'hlavni_jidla') {
      hlavniCounter++;
      cislo = String(hlavniCounter);
    }

    // Vždy bereme plnou cenu (price2). Studentská cena (price) se nezobrazuje.
    var cenaPlna = item.price2 != null ? Math.ceil(item.price2) : null;
    var cena = cenaPlna != null ? cenaPlna + ' Kč' : '';

    menu[category].push({
      cislo: cislo,
      nazev: name,
      cena: cena,
      mnozstvi: null,
      alergeny: null
    });
  });

  // Pokud po filtraci žádná položka neprošla mapou, info — uživatel by jinak
  // viděl prázdnou kartu bez vysvětlení.
  if (menu.polevky.length === 0 && menu.hlavni_jidla.length === 0) {
    menu.info = 'Menza dnes nemá v nabídce polévky ani hlavní jídla.';
  }

  return menu;
}

function _menzaFetchJson_(url) {
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      Logger.log('Menza HTTP ' + resp.getResponseCode() + ' — ' + url);
      return null;
    }
    return JSON.parse(resp.getContentText());
  } catch (e) {
    Logger.log('Menza fetch error: ' + e.message);
    return null;
  }
}
