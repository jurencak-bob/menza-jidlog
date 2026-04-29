/**
 * menicka_Menza.gs — stahování dnešního menu z UTB Menzy přes JSON API.
 *
 * Speciální restaurace s id="menza" (string odlišuje od numerických
 * iframe-id menicka.cz). Endpointy:
 *   GET /Ordering?CanteenId=<id>      → seznam dostupných dnů
 *   GET /Menu?Dates=<dt>&CanteenId=<id> → položky pro daný den
 *
 * API kategorie → naše schéma (Menza si zachovává členění, ostatní zdroje
 * mají jen `polevky` + `hlavni_jidla`):
 *   "polévka"        → polevky
 *   "oběd"           → obed
 *   "oběd ostatní"   → obed_ostatni
 *   "pizza"          → pizza
 *   "minutky"        → minutky
 *   ostatní (steril., obaly, …) → ignorováno
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
  'oběd':         'obed',
  'oběd ostatní': 'obed_ostatni',
  'pizza':        'pizza',
  'minutky':      'minutky'
};

// "120g Svíčková" → mnozstvi="120g", nazev="Svíčková". Group 1 = hodnota,
// group 2 = jednotka. Hodnotu normalizujeme čárka→tečka.
var MENZA_WEIGHT_RE = /^(\d+[,.]?\d*)\s*(g|kg|ml|l|dcl)\s+/i;

function Menza_fetchTodayMenu_() {
  var dnes = _today_();
  var menu = {
    restaurace_id: MENZA_RESTAURACE_ID,
    datum: dnes,
    polevky: [],
    obed: [],
    obed_ostatni: [],
    pizza: [],
    minutky: [],
    hlavni_jidla: [],  // prázdné pro Menzu (FE renderuje obed/obed_ostatni/pizza/minutky zvlášť)
    piti: [],
    dezerty: []
  };

  // Krok 1: najdi v Ordering API token pro dnešní datum
  var orderResp = _menzaFetchJson_(MENZA_BASE_URL + '/Ordering?CanteenId=' + MENZA_CANTEEN_ID);
  if (!orderResp) {
    menu.info = 'Menzu se nepodařilo načíst.';
    menu.transient_error = true;
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
    menu.transient_error = true;
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

  // Krok 3: roztřiď do kategorií + per-kategorie číslování (1. 2. … oddělené
  // pro Oběd vs. Oběd ostatní vs. Pizza, jak to ukazuje webkredit menzy).
  var counters = { obed: 0, obed_ostatni: 0, pizza: 0, minutky: 0 };
  items.forEach(function(item) {
    var kind = String(item.mealKindName || '').trim().toLowerCase();
    var category = MENZA_KIND_MAP[kind];
    if (!category) return;

    var fullName = String(item.mealName || '').trim();
    var mnozstvi = null;
    var weightMatch = fullName.match(MENZA_WEIGHT_RE);
    var name = fullName;
    if (weightMatch) {
      mnozstvi = weightMatch[1].replace(',', '.') + weightMatch[2].toLowerCase();
      name = fullName.substring(weightMatch[0].length).trim();
    }
    if (!name) return;
    name = name.charAt(0).toUpperCase() + name.slice(1);

    var cislo = null;
    if (counters.hasOwnProperty(category)) {
      counters[category]++;
      cislo = String(counters[category]);
    }

    // Vždy bereme plnou cenu (price2). Studentská cena (price) se nezobrazuje.
    var cenaPlna = item.price2 != null ? Math.ceil(item.price2) : null;
    var cena = cenaPlna != null ? cenaPlna + ' Kč' : '';

    menu[category].push({
      cislo: cislo,
      nazev: name,
      cena: cena,
      mnozstvi: mnozstvi,
      alergeny: null
    });
  });

  // Pokud po filtraci žádná položka neprošla mapou, info — uživatel by jinak
  // viděl prázdnou kartu bez vysvětlení.
  if (menu.polevky.length === 0 && menu.obed.length === 0
      && menu.obed_ostatni.length === 0 && menu.pizza.length === 0
      && menu.minutky.length === 0) {
    menu.info = 'Menza dnes nemá v nabídce žádné jídlo.';
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
