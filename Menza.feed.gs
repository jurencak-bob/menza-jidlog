/**
 * ═══════════════════════════════════════════════════════════════════
 *  Menza Historie — Apps Script pro Google Sheets
 *  Automaticky stahuje denní jídelníček z UTB WebKredit
 *  a ukládá historii (max 10 dnů, od nejnovějšího) do listu.
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Autor: Bob (bohumil.jurencak@blogic.cz)
 *
 *  CO SKRIPT DĚLÁ:
 *  ───────────────
 *  Každý pracovní den se skript automaticky spustí třikrát
 *  (ve výchozím nastavení v ~10:00, ~10:45 a ~12:00):
 *
 *    Trigger 1 — FETCH (~10:00, funkce stahniMenu):
 *      Stáhne jídelníček z API a uloží do sheetu. Neposílá žádné
 *      notifikace. Data jsou ihned k dispozici pro dashboard,
 *      ICS kalendářový feed a webovou verzi.
 *
 *    Trigger 2 — NOTIFY (~10:45, funkce posliNotifikace):
 *      Přečte dnešní data ze sheetu a pošle je do Google Chat
 *      a e-mailem. Pokud data ještě nejsou (fetch selhal), přeskočí
 *      — dožene to retry trigger.
 *
 *    Trigger 3 — RETRY (~12:00, funkce stahniANotifikuj):
 *      Záložní pokus. Pokud data chybí, stáhne znovu + notifikuje.
 *      Pokud data existují, zkontroluje diff (změny v menu).
 *
 *  Při každém spuštění fetch/retry:
 *    1. Zkontroluje, jestli je pracovní den (So+Ne přeskakuje).
 *    2. Zkontroluje, jestli dnes není český státní svátek.
 *    3. Podívá se, jestli v Google Sheetu už existuje list "Jídlog".
 *       Pokud ne (někdo ho smazal, přejmenoval…), vytvoří nový
 *       i s formátováním a hlavičkou.
 *    4. Ověří, jestli pro dnešek už nejsou data zapsaná
 *       (aby se nezapisovala duplicitně).
 *    5. Připojí se k webu UTB WebKredit a stáhne aktuální jídelníček
 *       — polévky, obědy, obědy ostatní, minutky a pizzy
 *       s cenami (studentská i plná).
 *    6. Ověří kompletnost menu (jestli obsahuje klíčové kategorie).
 *       Pokud chybí a jde o první pokus, počká na retry.
 *    7. Zapíše jídla do sheetu (nejnovější den je vždy nahoře)
 *       — pokud je SHEET_ENABLED zapnutý.
 *    8. Smaže záznamy starší než nastavený počet dnů (výchozí 10).
 *    9. Přeformátuje celý list — dnešní den tmavě zeleně (bílý
 *       tučný text), starší dny střídavě ve dvou odstínech šedé.
 *
 *  VÝSTUPNÍ KANÁLY (nezávisle konfigurovatelné):
 *  ──────────────────────────────────────────────
 *  Skript má čtyři výstupní kanály, z nichž každý lze samostatně
 *  zapnout nebo vypnout v konfiguraci:
 *    - Google Sheet (SHEET_ENABLED) — historie jídelníčku v tabulce
 *    - Google Chat  (CHAT_ENABLED)  — denní menu jako zpráva v chatu
 *      Volba CHAT_SHORTEN_NAMES (výchozí ANO) zkrátí názvy jídel
 *      do první čárky — zobrazí hlavní jídlo bez přílohy.
 *    - E-mail       (EMAIL_MODE)    — notifikace o výsledku stažení
 *    - JídLOG web    (doGet)        — HTML stránka + ICS kalendářový feed
 *
 *  VALIDACE KONFIGURACE:
 *  ─────────────────────
 *  Po načtení konfigurace se automaticky spustí validace, která
 *  zkontroluje formáty URL, e-mailů, časů triggerů a dalších hodnot.
 *  Problémy se logují jako varování (neshazují skript).
 *
 *  MENU DIFF:
 *  ──────────
 *  Při retry triggeru, pokud menu pro dnešek už je v sheetu,
 *  skript stáhne aktuální data z API a porovná s uloženými.
 *  Pokud menza mezitím změnila jídelníček (jiné jídlo, cena,
 *  přidání/odebrání položky), aktualizuje sheet a pošle
 *  notifikaci do Chatu a e-mailem.
 *
 *  RETRY LOGIKA:
 *  ─────────────
 *  Stav retry se ukládá přes PropertiesService (ne podle hodiny),
 *  takže funguje spolehlivě i při zpožděném spuštění triggeru.
 *  Pokud fetch trigger neuspěje (nebo je menu neúplné), nastaví
 *  příznak „fail" pro dnešní datum. Retry trigger tento příznak
 *  vidí a ví, že jde o opakovaný pokus.
 *
 *  ČESKÉ STÁTNÍ SVÁTKY:
 *  ────────────────────
 *  Skript zná všechny české státní svátky včetně pohyblivých
 *  (Velký pátek, Velikonoční pondělí). O svátcích se nespouští,
 *  stejně jako o víkendech.
 *
 *  ODSTÁVKY MENZY:
 *  ───────────────
 *  Menza mívá delší odstávky (např. letní prázdniny). Ty se dají
 *  zadat ručně v konfiguraci (CLOSURES). Navíc skript automaticky
 *  detekuje sérii neúspěchů — po překročení limitu (SILENT_AFTER)
 *  přestane posílat failure notifikace. Jakmile se menu znovu
 *  objeví, notifikace se obnoví a pošle se zpráva „menza je zpět".
 *
 *  JÍDLOG WEB A ICS FEED:
 *  ──────────────────────
 *  Skript poskytuje webovou verzi jídelníčku (JídLOG) přes doGet().
 *  Na výchozí URL se zobrazí HTML stránka s datepickerem.
 *  S parametrem ?format=ics vrátí ICS kalendářový feed se všemi
 *  dostupnými dny — lze přidat do Google Calendar přes webcal://
 *  nebo „Přidat kalendář z URL". Feed se obnovuje každých 6 hodin.
 *  S parametrem ?format=qr přesměruje na QR kód dashboardu.
 *
 *  KONFIGURACE:
 *  ────────────
 *  Všechna nastavení jsou uložena v Google Sheetu v listu "⚙️ Konfigurace".
 *  Při prvním spuštění se tento list automaticky vytvoří s výchozími hodnotami.
 *  Stačí si otevřít ten list a upravit buňky — formátování buněk (barvy, fonty)
 *  slouží také jako konfigurace vizuálních stylů.
 *
 *  SETUP (první nasazení):
 *  ───────────────────────
 *  1. Otevři Google Sheet → Rozšíření → Apps Script
 *  2. Vlož celý tento kód (nahraď výchozí obsah)
 *  3. Přidej soubor Dashboard.html (Soubory → + → HTML)
 *  4. Pro Google Chat: v cílovém prostoru vytvoř webhook
 *     (Nastavení → Integrace → Webhooky) a vlož URL do konfiguračního listu
 *  5. Spusť funkci  nastavTriggery()  jednou ručně (▶ Run)
 *     → Google požádá o povolení (přístup k sheetu, e-mailu, internetu)
 *  6. Automaticky se vytvoří list "⚙️ Konfigurace" s výchozími hodnotami.
 *     Uprav si ho podle potřeby.
 *  7. Pro web dashboard: Nasadit → Nové nasazení → Web App
 *  8. Hotovo — menu se stahuje automaticky a dashboard je dostupný.
 *
 *  RUČNÍ TEST:   spusť  spustitRucne()    — okamžitě stáhne a zapíše
 *  RESET:        spusť  smazTriggery() — vypne automatické spouštění
 *
 *  POZNÁMKA K TRIGGERŮM:
 *  Po jakékoliv změně časů v konfiguraci (1. pokus, Notifikace, 2. pokus)
 *  je potřeba znovu spustit nastavTriggery(), aby se staré triggery
 *  nahradily novými. Samotná změna čísla v konfiguraci nestačí.
 * ═══════════════════════════════════════════════════════════════════
 */


/* ┌─────────────────────────────────────────────────────────────────┐
   │  KONFIGURACE                                                    │
   │                                                                 │
   │  Všechna nastavení jsou načítána z Google Sheetu.              │
   │  Globální objekt USER se inicializuje při startu.              │
   └─────────────────────────────────────────────────────────────────┘ */

var CONFIG_SHEET_NAME = '⚙️ Konfigurace';
var USER = null;  // Populován funkcí loadConfig_() při startu


/* ┌─────────────────────────────────────────────────────────────────┐
   │  INTERNÍ KONFIGURACE                                           │
   │                                                                 │
   │  Technické nastavení — normálně není třeba měnit.              │
   │  Obsahuje URL adresu API, mapování kategorií jídel,            │
   │  názvy dnů v týdnu a podobné věci.                             │
   └─────────────────────────────────────────────────────────────────┘ */

const INTERNAL = {
  // Adresa WebKredit API, ze které se stahuje jídelníček
  BASE_URL:     'https://jidelnicek.utb.cz/webkredit/Api/Ordering',

  // Mapování názvů kategorií z API na naše interní názvy.
  // API občas vrací "minutka" (jednotné číslo), proto mapujeme obojí.
  // Pizza se v API může objevit jako "Pizza" i "pizza".
  CATEGORY_MAP: {
    'polévka':       'polévka',
    'oběd':          'oběd',
    'oběd ostatní':  'oběd ostatní',
    'minutka':       'minutky',
    'minutky':       'minutky',
    'pizza':         'pizza',
  },

  // Pořadí, v jakém se kategorie zapisují do sheetu (shora dolů)
  CATEGORY_ORDER: ['polévka', 'oběd', 'oběd ostatní', 'minutky', 'pizza'],

  // České zkratky dnů v týdnu (index 0 = neděle, 6 = sobota)
  DAY_NAMES: ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'],

  // Vzor pro odstranění hmotnosti ze začátku názvu jídla.
  // Např. "120g Svíčková" → "Svíčková", "0,7l Kompot" → "Kompot"
  WEIGHT_RE: /^\d+[,.]?\d*\s*(g|kg|ml|l|dcl)\s+/i,

  // Hlavička tabulky (názvy sloupců)
  HEADERS: ['Datum', 'Den', 'Kategorie', 'Č.', 'Jídlog by Bob 👨‍🍳', 'Cena STU', 'Cena Plná', 'Staženo'],

  // České státní svátky — pevné datumy (MM-DD).
  // Pohyblivé svátky (Velký pátek, Velikonoční pondělí) se počítají
  // dynamicky funkcí computeEasterSunday_().
  FIXED_HOLIDAYS: [
    '01-01',   // Nový rok / Den obnovy samostatného českého státu
    '05-01',   // Svátek práce
    '05-08',   // Den vítězství
    '07-05',   // Den slovanských věrozvěstů Cyrila a Metoděje
    '07-06',   // Den upálení mistra Jana Husa
    '09-28',   // Den české státnosti
    '10-28',   // Den vzniku samostatného československého státu
    '11-17',   // Den boje za svobodu a demokracii
    '12-24',   // Štědrý den
    '12-25',   // 1. svátek vánoční
    '12-26',   // 2. svátek vánoční
  ],

  // Klíče v PropertiesService pro ukládání stavů mezi spuštěními.
  FAIL_PROP_KEY:          'firstAttemptFailDate',    // datum posledního neúspěšného prvního pokusu
  CONSEC_FAIL_COUNT_KEY:  'consecutiveFailCount',    // počet po sobě jdoucích neúspěšných dnů
  CONSEC_FAIL_DATE_KEY:   'consecutiveFailLastDate', // datum posledního započítaného neúspěchu
  WAS_SILENT_KEY:         'wasSilent',               // '1' pokud jsme v tichém režimu
};


/* ══════════════════════════════════════════════════════════════════
   NAČTENÍ KONFIGURACE Z SHEETU
   ──────────────────────────────
   Při startu se načítá celá uživatelská konfigurace z Google Sheetu.
   Pokud list neexistuje, vytvoří se s výchozími hodnotami.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Načte konfiguraci z listu "⚙️ Konfigurace" a naplní globální USER objekt.
 * Pokud list neexistuje, vytvoří se s výchozími hodnotami.
 * Volá se na začátku stahniANotifikuj_() a nastavTriggery().
 */
function loadConfig_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);

  // Pokud list neexistuje, vytvoř ho s výchozími hodnotami
  if (!configSheet) {
    vytvorKonfiguraci(ss);
    configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  }

  // Vyrob mapu label → řádek (sloupec A)
  var labelMap = {};
  var lastRow = configSheet.getLastRow();
  var labelRange = configSheet.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < labelRange.length; i++) {
    var label = String(labelRange[i][0]).trim();
    if (label) {
      labelMap[label] = i + 1;  // řádky jsou 1-indexed
    }
  }

  // Pomocné funkce pro čtení hodnot z sheetu
  function txt(label, defaultValue) {
    var row = labelMap[label];
    if (!row) return defaultValue;
    var val = configSheet.getRange(row, 2).getValue();
    return val ? String(val).trim() : defaultValue;
  }

  function num(label, defaultValue) {
    var row = labelMap[label];
    if (!row) return defaultValue;
    var val = configSheet.getRange(row, 2).getValue();
    return val ? parseInt(val, 10) : defaultValue;
  }

  function bool(label, defaultValue) {
    var row = labelMap[label];
    if (!row) return defaultValue;
    var val = String(configSheet.getRange(row, 2).getValue()).trim().toUpperCase();
    if (val === 'ANO') return true;
    if (val === 'NE') return false;
    return defaultValue;
  }

  function cellStyle(label) {
    var row = labelMap[label];
    if (!row) return {};
    var cell = configSheet.getRange(row, 2);
    return {
      bg: cell.getBackground() || '',
      fontColor: cell.getFontColor() || '',
      fontWeight: cell.getFontWeight() || 'normal',
      fontStyle: cell.getFontStyle() || 'normal',
      fontFamily: cell.getFontFamily() || '',
    };
  }

  // Načti webhooky (Webhook 1 až 5)
  var webhooks = [];
  for (var w = 1; w <= 5; w++) {
    var url = txt('Webhook ' + w, '').trim();
    if (url) webhooks.push(url);
  }

  // Načti odstávky (páry od/do)
  var closures = [];
  for (var c = 1; c <= 5; c++) {
    var fromLabel = 'Odstávka ' + c + ' — od (MM-DD)';
    var toLabel = 'Odstávka ' + c + ' — do (MM-DD)';
    var from = txt(fromLabel, '').trim();
    var to = txt(toLabel, '').trim();
    if (from && to) {
      closures.push([from, to]);
    }
  }

  // Načti povinné kategorie (čárkou oddělené)
  var requiredCatsStr = txt('Povinné kategorie (čárkou)', 'polévka,oběd');
  var requiredCats = requiredCatsStr.split(',').map(function(s) {
    return s.trim().toLowerCase();
  }).filter(function(s) { return s.length > 0; });

  // Načti barvy z formátování buněk
  var headerStyle = cellStyle('Hlavička');
  var todayStyle = cellStyle('Dnešní den');
  var grayStyle1 = cellStyle('Starší den (lichý)');
  var grayStyle2 = cellStyle('Starší den (sudý)');

  // Načti chat styly z formátování buněk
  var sectionStyle = cellStyle('Názvy kategorií');
  var foodStyle = cellStyle('Názvy jídel');
  var priceStyle = cellStyle('Ceny');
  var smallprintStyle = cellStyle('Smallprint');

  // Sestav globální USER objekt (validace proběhne po sestavení)
  USER = {
    SHEET_NAME:     txt('Název listu', 'Jídlog 👨‍🍳'),
    MAX_DAYS:       num('Počet dnů historie', 10),
    CANTEEN_ID:     num('ID menzy', 3),
    EMAIL:          txt('Příjemci', 'bohumil.jurencak@blogic.cz'),
    EMAIL_MODE:     txt('Režim', 'none'),
    SHEET_ENABLED:  bool('Zápis do Google Sheetu', true),
    CHAT_ENABLED:   bool('Odesílání do Google Chatu', true),
    CHAT_SHORTEN_NAMES: bool('Zkrátit názvy v Chatu', true),
    CHAT_WEBHOOKS:  webhooks,
    TRIGGER_1:      [num('1. pokus — hodina', 10), num('1. pokus — minuta', 0)],
    TRIGGER_NOTIFY: [num('Notifikace — hodina', 10), num('Notifikace — minuta', 45)],
    TRIGGER_2:      [num('2. pokus — hodina', 12), num('2. pokus — minuta', 0)],
    TIMEZONE:       txt('Časová zóna', 'Europe/Prague'),
    MENZA_WEB_URL:  txt('URL jídelníčku', 'https://jidelnicek.utb.cz/webkredit/Ordering/Menu?canteen=3'),
    OBEDY_SHEET_URL: txt('URL sheet obědů', 'https://docs.google.com/spreadsheets/d/1KVMtzJoIpkMxiAPgm3qg3o-pSlWsDO9TQWTS_X4GbzE/edit?gid=1704001489#gid=1704001489'),
    DASHBOARD_URL:   txt('URL dashboard', 'https://script.google.com/a/macros/blogic.cz/s/AKfycbxqAYO0PoeatQpr_Le8c5Eg1C1BUW81EA1dRDLyp2HtqP4-KHWaBCzA7-yCXuJd6OOm/exec'),
    LINK_ICON_MENZA:     txt('Ikona — Menza', '🌍'),
    LINK_ICON_OBEDY:     txt('Ikona — Zápis obědů', '✏️'),
    LINK_ICON_DASHBOARD: txt('Ikona — Dashboard', '📋'),
    LINK_ICON_QR:        txt('Ikona — QR kód', '🔳'),
    LINK_ICON_ICS:       txt('Ikona — Kalendář', '📆'),
    LINK_SEPARATOR:      txt('Oddělovač odkazů', '  '),
    FONT_FAMILY:    txt('Písmo', 'Proxima Nova'),
    REQUIRED_CATEGORIES: requiredCats,
    CLOSURES:       closures,
    SILENT_AFTER:   num('Utišit po N dnech', 3),
    COLORS: {
      header_bg:    headerStyle.bg || '#1e400f',
      header_font:  headerStyle.fontColor || '#FFFFFF',
      header_weight: headerStyle.fontWeight || 'bold',
      today_bg:     todayStyle.bg || '#2E7D32',
      today_font:   todayStyle.fontColor || '#FFFFFF',
      today_weight: todayStyle.fontWeight || 'bold',
      gray_1:       grayStyle1.bg || '#F5F5F5',
      gray_2:       grayStyle2.bg || '#E0E0E0',
      old_font:     grayStyle1.fontColor || '#000000',
      old_weight:   grayStyle1.fontWeight || 'normal',
    },
    CHAT_STYLE: {
      section: {
        color:  sectionStyle.fontColor || '#000000',
        weight: sectionStyle.fontWeight || 'bold',
        italic: sectionStyle.fontStyle === 'italic',
        font:   sectionStyle.fontFamily || 'Proxima Nova',
      },
      food: {
        color:  foodStyle.fontColor || '#000000',
        weight: foodStyle.fontWeight || 'bold',
        italic: foodStyle.fontStyle === 'italic',
        font:   foodStyle.fontFamily || 'Proxima Nova',
      },
      price: {
        color:  priceStyle.fontColor || '#5D4037',
        weight: priceStyle.fontWeight || 'normal',
        italic: priceStyle.fontStyle === 'italic',
        font:   priceStyle.fontFamily || '',
      },
      smallprint: {
        text:   txt('Smallprint text', 'Za správnost jídelníčku a cen nikdo neručí. Za zápis obědů odpovídá každý jedlík sám — cenu si prosím ověř.'),
        size:   num('Smallprint velikost', 1),
        color:  smallprintStyle.fontColor || '#9aa0a6',
        weight: smallprintStyle.fontWeight || 'normal',
        italic: smallprintStyle.fontStyle === 'italic',
        font:   smallprintStyle.fontFamily || '',
      },
    },
  };

  // Validace — zaloguje varování pro špatné hodnoty
  validateConfig_();
}


/* ══════════════════════════════════════════════════════════════════
   VALIDACE KONFIGURACE
   ─────────────────────
   Kontroluje formáty URL, e-mailů, časů triggerů a dalších hodnot.
   Neshazuje skript — pouze loguje varování, aby se chyby snadno
   dohledaly v Apps Script → Spuštění (Executions).
   ══════════════════════════════════════════════════════════════════ */

/**
 * Validuje konfiguraci v USER objektu. Vrátí pole varování (strings).
 * Pokud je vše OK, vrátí prázdné pole.
 * Varování se zároveň zalogují přes Logger.log().
 */
function validateConfig_() {
  var warnings = [];

  // ── URL webhooků ──
  for (var i = 0; i < USER.CHAT_WEBHOOKS.length; i++) {
    var wh = USER.CHAT_WEBHOOKS[i];
    if (!/^https:\/\/chat\.googleapis\.com\//.test(wh)) {
      warnings.push('Webhook ' + (i + 1) + ' nemá platný formát Google Chat URL: ' + wh);
    }
  }
  if (USER.CHAT_ENABLED && USER.CHAT_WEBHOOKS.length === 0) {
    warnings.push('Chat je zapnutý, ale nejsou nastaveny žádné webhooky.');
  }

  // ── E-maily ──
  var emails = USER.EMAIL.split(',');
  for (var e = 0; e < emails.length; e++) {
    var addr = emails[e].trim();
    if (addr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      warnings.push('Neplatný formát e-mailu: ' + addr);
    }
  }

  // ── Režim e-mailu ──
  var validModes = ['both', 'success', 'fail', 'none'];
  if (validModes.indexOf(USER.EMAIL_MODE) === -1) {
    warnings.push('Neznámý režim e-mailu: "' + USER.EMAIL_MODE + '". Platné: ' + validModes.join(', '));
  }

  // ── Časy triggerů (hodina 0–23, minuta 0–59) ──
  function checkTime(label, pair) {
    if (pair[0] < 0 || pair[0] > 23) warnings.push(label + ' — hodina mimo rozsah (0–23): ' + pair[0]);
    if (pair[1] < 0 || pair[1] > 59) warnings.push(label + ' — minuta mimo rozsah (0–59): ' + pair[1]);
  }
  checkTime('1. pokus', USER.TRIGGER_1);
  checkTime('Notifikace', USER.TRIGGER_NOTIFY);
  checkTime('2. pokus', USER.TRIGGER_2);

  // Logická kontrola — fetch < notifikace < retry
  var t1min = USER.TRIGGER_1[0] * 60 + USER.TRIGGER_1[1];
  var tNmin = USER.TRIGGER_NOTIFY[0] * 60 + USER.TRIGGER_NOTIFY[1];
  var t2min = USER.TRIGGER_2[0] * 60 + USER.TRIGGER_2[1];
  if (t1min >= tNmin) {
    warnings.push('1. pokus (' + USER.TRIGGER_1[0] + ':' + USER.TRIGGER_1[1] +
                  ') by měl být dříve než notifikace (' + USER.TRIGGER_NOTIFY[0] + ':' + USER.TRIGGER_NOTIFY[1] + ').');
  }
  if (tNmin >= t2min) {
    warnings.push('Notifikace (' + USER.TRIGGER_NOTIFY[0] + ':' + USER.TRIGGER_NOTIFY[1] +
                  ') by měla být dříve než 2. pokus (' + USER.TRIGGER_2[0] + ':' + USER.TRIGGER_2[1] + ').');
  }

  // ── Počet dnů historie ──
  if (isNaN(USER.MAX_DAYS) || USER.MAX_DAYS < 1 || USER.MAX_DAYS > 365) {
    warnings.push('Počet dnů historie mimo rozsah (1–365): ' + USER.MAX_DAYS);
  }

  // ── ID menzy ──
  if (isNaN(USER.CANTEEN_ID) || USER.CANTEEN_ID < 1) {
    warnings.push('ID menzy je neplatné: ' + USER.CANTEEN_ID);
  }

  // ── URL formát ──
  function checkUrl(label, url) {
    if (url && !/^https?:\/\/.+/.test(url)) {
      warnings.push(label + ' nemá platný URL formát: ' + url);
    }
  }
  checkUrl('URL jídelníčku', USER.MENZA_WEB_URL);
  checkUrl('URL sheet obědů', USER.OBEDY_SHEET_URL);
  checkUrl('URL dashboard', USER.DASHBOARD_URL);

  // ── Časová zóna ──
  try {
    Utilities.formatDate(new Date(), USER.TIMEZONE, 'yyyy');
  } catch (tzErr) {
    warnings.push('Neplatná časová zóna: "' + USER.TIMEZONE + '"');
  }

  // ── Odstávky (formát MM-DD) ──
  for (var c = 0; c < USER.CLOSURES.length; c++) {
    var pair = USER.CLOSURES[c];
    for (var p = 0; p < 2; p++) {
      if (!/^\d{2}-\d{2}$/.test(pair[p])) {
        warnings.push('Odstávka ' + (c + 1) + ' — neplatný formát data "' + pair[p] + '" (očekáván MM-DD)');
      }
    }
  }

  // ── Výpis varování ──
  if (warnings.length > 0) {
    Logger.log('⚠️ VALIDACE KONFIGURACE — nalezeno ' + warnings.length + ' problém(ů):');
    for (var w = 0; w < warnings.length; w++) {
      Logger.log('  ⚠️ ' + warnings[w]);
    }
  } else {
    Logger.log('✅ Konfigurace OK — žádné problémy.');
  }

  return warnings;
}


/**
 * Vytvoří konfigurační list "⚙️ Konfigurace" s výchozími hodnotami
 * a hezky formátovaným rozložením.
 */
function vytvorKonfiguraci(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.insertSheet(CONFIG_SHEET_NAME, 0);  // vložit na začátek

  // Nastav šířky sloupců
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 380);

  var row = 1;

  // Řádek 1: Titulní buňka (merged A1:B1)
  var titleRange = sheet.getRange(row, 1, 1, 2);
  titleRange.merge();
  titleRange.setValue('⚙️ Konfigurace Menza skriptu')
    .setBackground('#1e400f')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(14)
    .setFontFamily('Proxima Nova')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(row, 25);
  row++;

  // Pomocná funkce pro přidání sekce
  function addSection(title, items) {
    // Prázdný řádek
    row++;

    // Řádek s nadpisem sekce (merged A:B)
    var headerRange = sheet.getRange(row, 1, 1, 2);
    headerRange.merge();
    headerRange.setValue(title)
      .setBackground('#e8f5e9')
      .setFontWeight('bold')
      .setFontFamily('Proxima Nova');
    sheet.setRowHeight(row, 18);
    row++;

    // Položky sekce
    items.forEach(function(item) {
      var labelCell = sheet.getRange(row, 1);
      var valueCell = sheet.getRange(row, 2);

      labelCell.setValue(item.label);
      labelCell.setFontFamily('Proxima Nova');

      // Nastavení hodnoty podle typu
      if (item.style) {
        // Barevná buňka s formátováním
        valueCell.setValue(item.defaultValue || 'Ukázkový text');
        valueCell.setBackground(item.style.bg || '#FFFFFF');
        valueCell.setFontColor(item.style.fontColor || '#000000');
        valueCell.setFontWeight(item.style.weight || 'normal');
        if (item.style.italic) {
          valueCell.setFontStyle('italic');
        }
        if (item.style.font) {
          valueCell.setFontFamily(item.style.font);
        }
      } else {
        // Normální buňka
        if (item.type === 'number') {
          valueCell.setValue(item.defaultValue || 0);
        } else if (item.type === 'bool') {
          valueCell.setValue(item.defaultValue ? 'ANO' : 'NE');
        } else {
          valueCell.setValue(item.defaultValue || '');
        }
      }

      if (item.note) {
        valueCell.setNote(item.note);
      }

      sheet.setRowHeight(row, 20);
      row++;
    });
  }

  // Sekce a jejich obsah
  addSection('📋 OBECNÉ', [
    { label: 'Název listu', defaultValue: 'Jídlog 👨‍🍳', note: 'Název tabu v Google Sheetu, kam se zapisuje historie' },
    { label: 'Počet dnů historie', type: 'number', defaultValue: 10, note: 'Kolik dnů se uchovává (starší se mažou)' },
    { label: 'ID menzy', type: 'number', defaultValue: 3, note: '3 = hlavní menza UTB' },
    { label: 'Časová zóna', defaultValue: 'Europe/Prague', note: 'Pro ČR ponech Europe/Prague' },
    { label: 'URL jídelníčku', defaultValue: 'https://jidelnicek.utb.cz/webkredit/Ordering/Menu?canteen=3', note: 'Odkaz do notifikací' },
    { label: 'URL sheet obědů', defaultValue: 'https://docs.google.com/spreadsheets/d/1KVMtzJoIpkMxiAPgm3qg3o-pSlWsDO9TQWTS_X4GbzE/edit?gid=1704001489#gid=1704001489', note: 'Alternativa pro ruční zápis' },
    { label: 'URL dashboard', defaultValue: 'https://script.google.com/a/macros/blogic.cz/s/AKfycbxqAYO0PoeatQpr_Le8c5Eg1C1BUW81EA1dRDLyp2HtqP4-KHWaBCzA7-yCXuJd6OOm/exec', note: 'Veřejný web s jídelníčkem (Web App)' },
    { label: 'Ikona — Menza', defaultValue: '🌍', note: 'Emoji ikona před odkazem na menzu v Chatu' },
    { label: 'Ikona — Zápis obědů', defaultValue: '✏️', note: 'Emoji ikona před odkazem „Zapiš oběd" v Chatu' },
    { label: 'Ikona — Dashboard', defaultValue: '📋', note: 'Emoji ikona před odkazem „JídLOG" v Chatu' },
    { label: 'Ikona — QR kód', defaultValue: '🔳', note: 'Emoji ikona před odkazem na QR kód v Chatu' },
    { label: 'Ikona — Kalendář', defaultValue: '📆', note: 'Emoji ikona před odkazem „.ics" v Chatu' },
    { label: 'Oddělovač odkazů', defaultValue: '  ', note: 'Oddělovač mezi odkazy v patičce Chat zprávy (výchozí: 2 mezery)' },
    { label: 'Písmo', defaultValue: 'Proxima Nova', note: 'Písmo pro celý list (Proxima Nova, Arial, Roboto…)' },
    { label: 'Smallprint text', defaultValue: 'Za správnost jídelníčku a cen nikdo neručí. Za zápis obědů odpovídá každý jedlík sám — cenu si prosím ověř.', note: 'Disclaimer text pod patičkou Chat zprávy' },
    { label: 'Smallprint velikost', type: 'number', defaultValue: 1, note: 'Velikost písma smallprintu (HTML font size: 1–7, výchozí 1 = nejmenší)' },
  ]);

  addSection('📧 E-MAIL', [
    { label: 'Příjemci', defaultValue: 'bohumil.jurencak@blogic.cz', note: 'Odděleno čárkou bez mezer (jan@firma.cz,petra@firma.cz)' },
    { label: 'Režim', defaultValue: 'none', note: 'both/success/failure/none' },
  ]);

  addSection('📡 VÝSTUPNÍ KANÁLY', [
    { label: 'Zápis do Google Sheetu', type: 'bool', defaultValue: true, note: 'Zapnuto/vypnuto (ANO/NE)' },
    { label: 'Odesílání do Google Chatu', type: 'bool', defaultValue: true, note: 'Zapnuto/vypnuto (ANO/NE)' },
    { label: 'Zkrátit názvy v Chatu', type: 'bool', defaultValue: true, note: 'ANO = zobrazí jen text do první čárky (odřízne přílohu). NE = plný název.' },
  ]);

  addSection('💬 CHAT WEBHOOKY', [
    { label: 'Webhook 1', defaultValue: 'https://chat.googleapis.com/v1/spaces/AAQAzZSZw0E/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=IUjrHzBMdbZN2V1JOTwj79zaNPU4XWJdijxWG2Ko8Pw', note: 'URL z Google Chat webhookem' },
    { label: 'Webhook 2', defaultValue: '', note: 'Volitelný, pro další prostor' },
    { label: 'Webhook 3', defaultValue: '', note: 'Volitelný' },
    { label: 'Webhook 4', defaultValue: '', note: 'Volitelný' },
    { label: 'Webhook 5', defaultValue: '', note: 'Volitelný' },
  ]);

  addSection('⏰ TRIGGERY', [
    { label: '1. pokus — hodina', type: 'number', defaultValue: 10, note: 'Hodina stažení dat (0-23) — jen uloží do sheetu, neposílá notifikace' },
    { label: '1. pokus — minuta', type: 'number', defaultValue: 0, note: 'Minuta (0, 15, 30, 45)' },
    { label: 'Notifikace — hodina', type: 'number', defaultValue: 10, note: 'Hodina odeslání do Chatu a e-mailem (0-23)' },
    { label: 'Notifikace — minuta', type: 'number', defaultValue: 45, note: 'Minuta (0, 15, 30, 45)' },
    { label: '2. pokus — hodina', type: 'number', defaultValue: 12, note: 'Hodina retry / záložní pokus (0-23)' },
    { label: '2. pokus — minuta', type: 'number', defaultValue: 0, note: 'Minuta (0, 15, 30, 45)' },
  ]);

  addSection('✅ KOMPLETNOST MENU', [
    { label: 'Povinné kategorie (čárkou)', defaultValue: 'polévka,oběd', note: 'Odděleno čárkami (polévka, oběd, minutky, pizza…)' },
  ]);

  addSection('🔧 ODSTÁVKY MENZY', [
    { label: 'Odstávka 1 — od (MM-DD)', defaultValue: '', note: 'Např. 07-01 (1. července)' },
    { label: 'Odstávka 1 — do (MM-DD)', defaultValue: '', note: 'Např. 08-31 (31. srpna)' },
    { label: 'Odstávka 2 — od (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 2 — do (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 3 — od (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 3 — do (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 4 — od (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 4 — do (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 5 — od (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 5 — do (MM-DD)', defaultValue: '', note: '' },
  ]);

  addSection('🔇 AUTO-UTIŠENÍ', [
    { label: 'Utišit po N dnech', type: 'number', defaultValue: 3, note: '0 = vypnuto (notifikuj vždy)' },
  ]);

  // Sekce barev
  row++;
  var colorHeaderRange = sheet.getRange(row, 1, 1, 2);
  colorHeaderRange.merge();
  colorHeaderRange.setValue('🎨 BARVY SHEETU')
    .setBackground('#e8f5e9')
    .setFontWeight('bold')
    .setFontFamily('Proxima Nova');
  sheet.setRowHeight(row, 18);
  row++;

  var hintCell = sheet.getRange(row, 1, 1, 2);
  hintCell.merge();
  hintCell.setValue('Změň pozadí, barvu a tučnost buněk níže — skript je přečte jako nastavení.')
    .setFontStyle('italic')
    .setFontFamily('Proxima Nova')
    .setFontSize(9);
  sheet.setRowHeight(row, 24);
  row++;

  // Barevné buňky
  [
    { label: 'Hlavička', bg: '#1e400f', font: '#FFFFFF', weight: 'normal' },
    { label: 'Dnešní den', bg: '#2E7D32', font: '#FFFFFF', weight: 'normal' },
    { label: 'Starší den (lichý)', bg: '#F5F5F5', font: '#000000', weight: 'normal' },
    { label: 'Starší den (sudý)', bg: '#E0E0E0', font: '#000000', weight: 'normal' },
  ].forEach(function(colorItem) {
    var labelCell = sheet.getRange(row, 1);
    var valueCell = sheet.getRange(row, 2);

    labelCell.setValue(colorItem.label);
    labelCell.setFontFamily('Proxima Nova');

    valueCell.setValue('Ukázkový text');
    valueCell.setBackground(colorItem.bg);
    valueCell.setFontColor(colorItem.font);
    valueCell.setFontWeight(colorItem.weight);
    valueCell.setFontFamily('Proxima Nova');

    sheet.setRowHeight(row, 20);
    row++;
  });

  // Sekce chat stylů
  row++;
  var chatHeaderRange = sheet.getRange(row, 1, 1, 2);
  chatHeaderRange.merge();
  chatHeaderRange.setValue('💬 STYL CHATU')
    .setBackground('#e8f5e9')
    .setFontWeight('bold')
    .setFontFamily('Proxima Nova');
  sheet.setRowHeight(row, 18);
  row++;

  var chatHintCell = sheet.getRange(row, 1, 1, 2);
  chatHintCell.merge();
  chatHintCell.setValue('Změň barvu, tučnost, kurzívu a font buněk níže — skript je přečte jako nastavení.')
    .setFontStyle('italic')
    .setFontFamily('Proxima Nova')
    .setFontSize(9);
  sheet.setRowHeight(row, 24);
  row++;

  // Chatové style buňky
  [
    { label: 'Názvy kategorií', text: 'Polévky', font: 'Proxima Nova', weight: 'bold' },
    { label: 'Názvy jídel', text: 'Svíčková na smetaně', font: 'Proxima Nova', weight: 'normal' },
    { label: 'Ceny', text: '84 Kč', font: 'Proxima Nova', weight: 'normal', italic: true, color: '#5D4037' },
    { label: 'Smallprint', text: 'Ukázkový disclaimer', font: '', weight: 'normal', italic: true, color: '#9aa0a6' },
  ].forEach(function(styleItem) {
    var labelCell = sheet.getRange(row, 1);
    var valueCell = sheet.getRange(row, 2);

    labelCell.setValue(styleItem.label);
    labelCell.setFontFamily('Proxima Nova');

    valueCell.setValue(styleItem.text);
    valueCell.setFontColor(styleItem.color || '#000000');
    valueCell.setFontWeight(styleItem.weight || 'normal');
    if (styleItem.italic) {
      valueCell.setFontStyle('italic');
    }
    if (styleItem.font) {
      valueCell.setFontFamily(styleItem.font);
    }

    sheet.setRowHeight(row, 20);
    row++;
  });

  // Zmraz první řádek
  sheet.setFrozenRows(1);

  // Ochrana sloupce A (read-only na labely)
  var protection = sheet.protect().setDescription('Ochrana názvů konfigurací');
  protection.removeEditors([Session.getEffectiveUser()]);
}


/* ══════════════════════════════════════════════════════════════════
   AKTUALIZACE KONFIGURAČNÍHO LISTU
   ─────────────────────────────────
   Spusť ručně z Apps Script editoru: aktualizujKonfiguraci()
   Projde existující konfigurační list, najde chybějící řádky
   a doplní je s výchozími hodnotami. Existující hodnoty se
   NEPŘEPISUJÍ — přidají se jen nové položky.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Aktualizuje konfigurační list — doplní chybějící řádky.
 * Spusť ručně z menu Apps Script editoru.
 * BEZPEČNÉ: nepřepisuje existující hodnoty, neposílá žádné notifikace.
 */
function aktualizujKonfiguraci() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG_SHEET_NAME);

  if (!sheet) {
    Logger.log('Konfigurační list neexistuje — vytvářím nový.');
    vytvorKonfiguraci(ss);
    return;
  }

  // Kompletní seznam všech očekávaných label → výchozí hodnota + poznámka
  // Pořadí odpovídá vytvorKonfiguraci()
  var EXPECTED = [
    // 📋 OBECNÉ
    { label: 'Název listu', defaultValue: 'Jídlog 👨‍🍳', note: 'Název tabu v Google Sheetu, kam se zapisuje historie' },
    { label: 'Počet dnů historie', defaultValue: 10, note: 'Kolik dnů se uchovává (starší se mažou)' },
    { label: 'ID menzy', defaultValue: 3, note: '3 = hlavní menza UTB' },
    { label: 'Časová zóna', defaultValue: 'Europe/Prague', note: 'Pro ČR ponech Europe/Prague' },
    { label: 'URL jídelníčku', defaultValue: 'https://jidelnicek.utb.cz/webkredit/Ordering/Menu?canteen=3', note: 'Odkaz do notifikací' },
    { label: 'URL sheet obědů', defaultValue: '', note: 'Alternativa pro ruční zápis' },
    { label: 'URL dashboard', defaultValue: '', note: 'Veřejný web s jídelníčkem (Web App)' },
    { label: 'Ikona — Menza', defaultValue: '🌍', note: 'Emoji ikona před odkazem na menzu v Chatu' },
    { label: 'Ikona — Zápis obědů', defaultValue: '✏️', note: 'Emoji ikona před odkazem „Zapiš oběd" v Chatu' },
    { label: 'Ikona — Dashboard', defaultValue: '📋', note: 'Emoji ikona před odkazem „JídLOG" v Chatu' },
    { label: 'Ikona — QR kód', defaultValue: '🔳', note: 'Emoji ikona před odkazem na QR kód v Chatu' },
    { label: 'Ikona — Kalendář', defaultValue: '📆', note: 'Emoji ikona před odkazem „.ics" v Chatu' },
    { label: 'Oddělovač odkazů', defaultValue: '  ', note: 'Oddělovač mezi odkazy v patičce Chat zprávy (výchozí: 2 mezery)' },
    { label: 'Písmo', defaultValue: 'Proxima Nova', note: 'Písmo pro celý list' },
    { label: 'Smallprint text', defaultValue: 'Za správnost jídelníčku a cen nikdo neručí. Za zápis obědů odpovídá každý jedlík sám — cenu si prosím ověř.', note: 'Disclaimer text pod patičkou Chat zprávy' },
    { label: 'Smallprint velikost', defaultValue: 1, note: 'HTML font size (1–7, výchozí 1 = nejmenší)' },
    // 📧 E-MAIL
    { label: 'Příjemci', defaultValue: '', note: 'Odděleno čárkou' },
    { label: 'Režim', defaultValue: 'none', note: 'both/success/failure/none' },
    // 📡 VÝSTUPNÍ KANÁLY
    { label: 'Zápis do Google Sheetu', defaultValue: 'ANO', note: 'ANO/NE' },
    { label: 'Odesílání do Google Chatu', defaultValue: 'ANO', note: 'ANO/NE' },
    { label: 'Zkrátit názvy v Chatu', defaultValue: 'ANO', note: 'ANO = jen text do první čárky. NE = plný název.' },
    // 💬 CHAT WEBHOOKY
    { label: 'Webhook 1', defaultValue: '', note: 'URL z Google Chat webhookem' },
    { label: 'Webhook 2', defaultValue: '', note: 'Volitelný' },
    { label: 'Webhook 3', defaultValue: '', note: 'Volitelný' },
    { label: 'Webhook 4', defaultValue: '', note: 'Volitelný' },
    { label: 'Webhook 5', defaultValue: '', note: 'Volitelný' },
    // ⏰ TRIGGERY
    { label: '1. pokus — hodina', defaultValue: 10, note: 'Hodina stažení dat (0-23)' },
    { label: '1. pokus — minuta', defaultValue: 0, note: 'Minuta (0, 15, 30, 45)' },
    { label: 'Notifikace — hodina', defaultValue: 10, note: 'Hodina odeslání do Chatu a e-mailem (0-23)' },
    { label: 'Notifikace — minuta', defaultValue: 45, note: 'Minuta (0, 15, 30, 45)' },
    { label: '2. pokus — hodina', defaultValue: 12, note: 'Hodina retry (0-23)' },
    { label: '2. pokus — minuta', defaultValue: 0, note: 'Minuta (0, 15, 30, 45)' },
    // ✅ KOMPLETNOST MENU
    { label: 'Povinné kategorie (čárkou)', defaultValue: 'polévka,oběd', note: 'Odděleno čárkami' },
    // 🔧 ODSTÁVKY
    { label: 'Odstávka 1 — od (MM-DD)', defaultValue: '', note: 'Např. 07-01' },
    { label: 'Odstávka 1 — do (MM-DD)', defaultValue: '', note: 'Např. 08-31' },
    { label: 'Odstávka 2 — od (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 2 — do (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 3 — od (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 3 — do (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 4 — od (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 4 — do (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 5 — od (MM-DD)', defaultValue: '', note: '' },
    { label: 'Odstávka 5 — do (MM-DD)', defaultValue: '', note: '' },
    // 🔇 AUTO-UTIŠENÍ
    { label: 'Utišit po N dnech', defaultValue: 3, note: '0 = vypnuto' },
    // 🎨 BARVY + 💬 STYL — ty se nedoplňují automaticky (vyžadují formátování)
  ];

  // Přečti existující labely
  var lastRow = sheet.getLastRow();
  var existingLabels = {};
  if (lastRow > 0) {
    var labels = sheet.getRange(1, 1, lastRow, 1).getValues();
    for (var i = 0; i < labels.length; i++) {
      var lbl = String(labels[i][0]).trim();
      if (lbl) existingLabels[lbl] = true;
    }
  }

  // Najdi chybějící
  var missing = [];
  for (var m = 0; m < EXPECTED.length; m++) {
    if (!existingLabels[EXPECTED[m].label]) {
      missing.push(EXPECTED[m]);
    }
  }

  if (missing.length === 0) {
    Logger.log('✅ Konfigurace je aktuální — žádné chybějící položky.');
    SpreadsheetApp.getUi().alert('✅ Konfigurace je aktuální — nic nového k doplnění.');
    return;
  }

  // Doplň chybějící řádky na konec (před barevné sekce)
  // Najdi řádek s "🎨 BARVY SHEETU" — vložíme před něj
  var insertBeforeRow = lastRow + 1;
  if (lastRow > 0) {
    var allLabels = sheet.getRange(1, 1, lastRow, 1).getValues();
    for (var r = 0; r < allLabels.length; r++) {
      if (String(allLabels[r][0]).indexOf('🎨 BARVY') !== -1) {
        insertBeforeRow = r + 1; // 1-indexed
        break;
      }
    }
  }

  // Vlož nové řádky
  sheet.insertRowsBefore(insertBeforeRow, missing.length);

  for (var n = 0; n < missing.length; n++) {
    var rowNum = insertBeforeRow + n;
    var item = missing[n];

    sheet.getRange(rowNum, 1).setValue(item.label).setFontFamily('Proxima Nova');
    sheet.getRange(rowNum, 2).setValue(item.defaultValue);
    if (item.note) {
      sheet.getRange(rowNum, 2).setNote(item.note);
    }
    sheet.setRowHeight(rowNum, 20);
  }

  Logger.log('✅ Doplněno ' + missing.length + ' chybějících položek: ' +
             missing.map(function(i) { return i.label; }).join(', '));

  SpreadsheetApp.getUi().alert(
    '✅ Doplněno ' + missing.length + ' nových položek:\n\n' +
    missing.map(function(i) { return '• ' + i.label; }).join('\n') +
    '\n\nExistující hodnoty nebyly změněny.'
  );
}


/* ══════════════════════════════════════════════════════════════════
   VSTUPNÍ BODY (SAFE WRAPPERS)
   ────────────────────────────
   Tři funkce volané triggery (a spustitRucne). Každá obaluje svoji
   interní logiku try/catch blokem — pokud skript spadne na
   neočekávanou chybu, pošle nouzový e-mail.

   stahniMenu()          — fetch trigger (~10:00): stáhne + uloží, bez notifikací
   posliNotifikace()  — notify trigger (~10:45): pošle Chat + email z dat v sheetu
   stahniANotifikuj()       — retry trigger (~12:00): stáhne + uloží + notifikuje
   ══════════════════════════════════════════════════════════════════ */

function stahniANotifikuj() {
  try {
    stahniANotifikuj_();
  } catch (e) {
    // Nouzový e-mail — skript spadl na neočekávanou chybu
    Logger.log('❌ FATAL: ' + e.message + '\n' + e.stack);
    try {
      // Pokud USER není inicializován, zkus načíst config
      if (!USER) {
        loadConfig_();
      }
      var subject = '\u274C Menza skript — neočekávaná chyba';
      var body = 'Skript Menza.feed spadl na neočekávanou chybu.\n\n' +
                 'Chyba:   ' + e.message + '\n' +
                 'Stack:   ' + (e.stack || '(nedostupný)') + '\n' +
                 'Čas:     ' + Utilities.formatDate(new Date(), USER.TIMEZONE, 'dd.MM.yyyy HH:mm:ss') + '\n\n' +
                 'Zkontroluj Apps Script editor → Spuštění (Executions) pro detail.';
      MailApp.sendEmail({
        to:      USER.EMAIL,
        subject: subject,
        body:    body,
      });
    } catch (mailErr) {
      // Pokud selže i odeslání mailu, už nemůžeme nic dělat — aspoň zalogujeme
      Logger.log('❌ Nepodařilo se odeslat nouzový e-mail: ' + mailErr.message);
    }
  }
}


/**
 * Jen stáhne a uloží menu do sheetu BEZ odesílání notifikací.
 * Volá se z prvního triggeru (~10:00), aby byla data k dispozici
 * pro dashboard, ICS feed a kalendář dříve než jdou notifikace.
 */
function stahniMenu() {
  try {
    stahniANotifikuj_(true);
  } catch (e) {
    Logger.log('❌ FATAL (stahniMenu): ' + e.message + '\n' + e.stack);
    try {
      if (!USER) loadConfig_();
      MailApp.sendEmail({
        to:      USER.EMAIL,
        subject: '\u274C Menza skript — chyba při stahování',
        body:    'stahniMenu spadl na chybu.\n\n' + e.message + '\n' + (e.stack || ''),
      });
    } catch (mailErr) {
      Logger.log('❌ Nepodařilo se odeslat nouzový e-mail: ' + mailErr.message);
    }
  }
}


/**
 * Přečte dnešní menu ze sheetu a pošle notifikaci do Chatu a e-mailem.
 * Volá se z notify triggeru (~10:45). Pokud data ještě nejsou v sheetu
 * (fetch selhal), nepošle nic — retry trigger to dožene.
 */
function posliNotifikace() {
  try {
    posliNotifikace_();
  } catch (e) {
    Logger.log('❌ FATAL (posliNotifikace): ' + e.message + '\n' + e.stack);
    try {
      if (!USER) loadConfig_();
      MailApp.sendEmail({
        to:      USER.EMAIL,
        subject: '\u274C Menza skript — chyba při notifikaci',
        body:    'posliNotifikace spadl na chybu.\n\n' + e.message + '\n' + (e.stack || ''),
      });
    } catch (mailErr) {
      Logger.log('❌ Nepodařilo se odeslat nouzový e-mail: ' + mailErr.message);
    }
  }
}


/**
 * Interní logika pro odeslání notifikací z dat v sheetu.
 * Přečte dnešní řádky ze sheetu a pošle chat + email.
 */
function posliNotifikace_() {
  loadConfig_();

  var now      = new Date();
  var todayStr = Utilities.formatDate(now, USER.TIMEZONE, 'yyyy-MM-dd');
  var dow      = getDayOfWeek_(now);

  // Víkend / svátek / odstávka → nic neposílej
  if (dow === 0 || dow === 6) { Logger.log('Víkend — notifikace přeskočena.'); return; }
  if (isCzechHoliday_(todayStr)) { Logger.log('Svátek — notifikace přeskočena.'); return; }
  if (isInClosure_(todayStr)) { Logger.log('Odstávka — notifikace přeskočena.'); return; }

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(USER.SHEET_NAME);

  // Pokud sheet neexistuje nebo nemá data pro dnešek, přeskoč
  if (!sheet || !isTodayAlreadySaved_(sheet, todayStr)) {
    Logger.log('⚠️ Dnešní data ještě nejsou v sheetu — notifikace přeskočena (dožene retry).');
    return;
  }

  // Načti dnešní položky ze sheetu
  var menuItems = readSavedMenu_(sheet, todayStr);
  if (!menuItems || menuItems.length === 0) {
    Logger.log('⚠️ Dnešní data v sheetu prázdná — notifikace přeskočena.');
    return;
  }

  // Zkontroluj, zda jsme dnešní notifikaci už neposílali
  var props = PropertiesService.getScriptProperties();
  var notifiedDate = props.getProperty('NOTIFY_SENT_DATE');
  if (notifiedDate === todayStr) {
    Logger.log('ℹ️ Notifikace pro ' + todayStr + ' již odeslána — přeskakuji.');
    return;
  }

  // Odeslat Chat a email
  sendToGoogleChat_(menuItems, todayStr, dow);
  sendNotification_(true, todayStr, menuItems, ss.getUrl());

  // Pokud jsme byli v tichém režimu, pošleme „menza je zpět"
  if (props.getProperty(INTERNAL.WAS_SILENT_KEY) === '1') {
    sendResumedToChat_(todayStr, dow);
  }

  // Vyčisti příznaky neúspěchu (data existují → úspěch)
  props.deleteProperty(INTERNAL.FAIL_PROP_KEY);
  props.deleteProperty(INTERNAL.CONSEC_FAIL_COUNT_KEY);
  props.deleteProperty(INTERNAL.CONSEC_FAIL_DATE_KEY);
  props.deleteProperty(INTERNAL.WAS_SILENT_KEY);

  // Označ dnešní notifikaci jako odeslanou
  props.setProperty('NOTIFY_SENT_DATE', todayStr);

  Logger.log('✅ Notifikace odeslána pro ' + todayStr + ' (' + menuItems.length + ' položek)');
}


/* ══════════════════════════════════════════════════════════════════
   HLAVNÍ FUNKCE
   ─────────────
   Toto je „mozek" celého skriptu. Obsahuje logiku stahování
   a zápisu menu. Volá se ze safe wrapperů:
     - stahniMenu()     → skipNotify=true  (jen uloží, bez notifikací)
     - stahniANotifikuj()  → skipNotify=false (uloží + notifikuje)

   @param {boolean} skipNotify — true = jen uloží, nepošle chat/email
   ══════════════════════════════════════════════════════════════════ */

function stahniANotifikuj_(skipNotify) {
  // Načti konfiguraci z sheetu
  loadConfig_();

  // Zjisti aktuální datum a den v týdnu (v české časové zóně)
  var now        = new Date();
  var todayStr   = Utilities.formatDate(now, USER.TIMEZONE, 'yyyy-MM-dd');
  var dow        = getDayOfWeek_(now);   // 0 = Ne, 1 = Po, … 6 = So

  // ── Retry detekce přes PropertiesService ──
  // Spolehlivější než hádání z hodiny — funguje i při zpožděném triggeru.
  // Pokud pro dnešní datum existuje záznam o neúspěchu prvního pokusu,
  // víme, že tohle je retry (druhý pokus).
  var props   = PropertiesService.getScriptProperties();
  var isRetry = props.getProperty(INTERNAL.FAIL_PROP_KEY) === todayStr;

  // O víkendu a ve svátek menza nevaří → přeskoč (a neposílej žádný mail)
  if (dow === 0 || dow === 6) {
    Logger.log('Víkend (' + INTERNAL.DAY_NAMES[dow] + ') — přeskakuji.');
    return;
  }
  if (isCzechHoliday_(todayStr)) {
    Logger.log('Český státní svátek (' + todayStr + ') — přeskakuji.');
    return;
  }

  // Ruční odstávka menzy (prázdniny, rekonstrukce…)
  if (isInClosure_(todayStr)) {
    Logger.log('Odstávka menzy (' + todayStr + ') — přeskakuji.');
    return;
  }

  // Najdi nebo vytvoř list v Google Sheetu.
  // Sheet potřebujeme vždy — i když je SHEET_ENABLED vypnutý, protože
  // se z něj kontrolují duplicity (aby se menu nestáhlo dvakrát).
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(USER.SHEET_NAME);
  if (!sheet) {
    // List neexistuje (první spuštění, nebo ho někdo smazal) → vytvoříme nový
    sheet = createHistorySheet_(ss);
  }

  // Kontrola duplicit: pokud pro dnešek už máme data, zkontroluj diff.
  // To nastane, když fetch trigger (~10:00) uspěl a teď běží retry (~12:00).
  if (isTodayAlreadySaved_(sheet, todayStr)) {
    Logger.log('Menu pro ' + todayStr + ' již existuje — kontroluji změny (diff).');
    checkMenuDiff_(sheet, todayStr, dow);
    return;
  }

  // Připoj se k WebKredit API a stáhni dnešní jídelníček
  var menuItems = fetchMenuFromAPI_(todayStr);

  // Pokud API nevrátilo žádná jídla…
  if (!menuItems || menuItems.length === 0) {
    Logger.log('Menu pro ' + todayStr + ' není dostupné.');
    if (skipNotify) {
      // Při tichém fetchi jen zaloguj — notifikaci řeší notify/retry trigger
      Logger.log('ℹ️ skipNotify — neposílám failure notifikaci.');
      props.setProperty(INTERNAL.FAIL_PROP_KEY, todayStr);
    } else {
      handleFailure_(todayStr, dow, isRetry, ss, props);
    }
    return;
  }

  // ── Kontrola kompletnosti menu ──
  // Pokud chybí klíčové kategorie (polévka, oběd…) a jde o první pokus,
  // počkáme na retry — menza možná ještě nenahrála celý jídelníček.
  // Při retry zapíšeme i neúplné menu (lepší částečné než žádné).
  var missingCats = getMissingCategories_(menuItems);
  if (missingCats.length > 0 && !isRetry) {
    Logger.log('Menu je neúplné (chybí: ' + missingCats.join(', ') + ') — čekám na retry/notify.');
    // Zaznamenej neúspěch, aby druhý trigger věděl, že jde o retry
    props.setProperty(INTERNAL.FAIL_PROP_KEY, todayStr);
    if (!skipNotify) sendFailureToChat_(todayStr, dow);
    return;
  }
  if (missingCats.length > 0) {
    Logger.log('⚠️ Menu je neúplné i při retry (chybí: ' + missingCats.join(', ') +
               ') — zapisuji částečné menu.');
  }

  // ── Výstup 1: Zápis do Google Sheetu (pokud je zapnutý) ──
  if (USER.SHEET_ENABLED) {
    writeMenuRows_(sheet, menuItems, todayStr, dow, now);
    pruneOldEntries_(sheet);

    // Přeformátuj celý list — dnešek tmavě zeleně, starší dny střídavě šedě.
    // Voláme pokaždé, protože včerejší „zelené" řádky se musí přebarvit na šedé.
    applyDateFormatting_(sheet);

    Logger.log('✅ Uloženo ' + menuItems.length + ' položek do sheetu pro ' + todayStr);
  } else {
    Logger.log('ℹ️ Zápis do sheetu je vypnutý (SHEET_ENABLED = false).');
  }

  // ── Výstup 2 a 3: Notifikace (chat + email) ──
  // Pokud skipNotify=true (volání z stahniMenu), nepošleme nic —
  // notifikace jdou zvlášť přes posliNotifikace trigger.
  if (!skipNotify) {
    // Zkontroluj, zda notify trigger už neposlal notifikaci dříve
    var alreadyNotified = props.getProperty('NOTIFY_SENT_DATE') === todayStr;
    if (!alreadyNotified) {
      sendToGoogleChat_(menuItems, todayStr, dow);
      sendNotification_(true, todayStr, menuItems, ss.getUrl());

      // Pokud jsme byli v tichém režimu (série neúspěchů), pošleme
      // do Chatu zprávu „menza je zpět", aby kolegové věděli.
      if (props.getProperty(INTERNAL.WAS_SILENT_KEY) === '1') {
        sendResumedToChat_(todayStr, dow);
      }

      // Označ notifikaci jako odeslanou (zabrání duplicitě s notify triggerem)
      props.setProperty('NOTIFY_SENT_DATE', todayStr);
    } else {
      Logger.log('ℹ️ Notifikace pro ' + todayStr + ' již odeslána notify triggerem — přeskakuji.');
    }

    // Vyčisti všechny příznaky neúspěchu
    props.deleteProperty(INTERNAL.FAIL_PROP_KEY);
    props.deleteProperty(INTERNAL.CONSEC_FAIL_COUNT_KEY);
    props.deleteProperty(INTERNAL.CONSEC_FAIL_DATE_KEY);
    props.deleteProperty(INTERNAL.WAS_SILENT_KEY);
  } else {
    Logger.log('ℹ️ skipNotify=true — chat a email se nepošlou (čeká na notify trigger).');
  }

  Logger.log('✅ Zpracování dokončeno pro ' + todayStr + ' (' + menuItems.length + ' položek)');
}

/**
 * Zpracuje neúspěšný pokus o stažení menu.
 *
 * Logika:
 *   - První pokus dne: nastaví příznak, pošle info do Chatu.
 *   - Retry (druhý pokus dne): inkrementuje počítadlo po sobě
 *     jdoucích neúspěšných dnů. Pokud počítadlo překročí
 *     SILENT_AFTER, přepne se do tichého režimu (žádné notifikace).
 *   - V tichém režimu: jen loguje, neposílá nic.
 *
 * @param {string}  todayStr — datum yyyy-MM-dd
 * @param {number}  dow      — den v týdnu
 * @param {boolean} isRetry  — true pokud jde o druhý pokus
 * @param {Object}  ss       — SpreadsheetApp objekt
 * @param {Object}  props    — PropertiesService objekt
 */
function handleFailure_(todayStr, dow, isRetry, ss, props) {
  if (!isRetry) {
    // První pokus neuspěl → zaznamenej a pošli info do Chatu
    // (pokud nejsme v tichém režimu). E-mail zatím neposíláme.
    props.setProperty(INTERNAL.FAIL_PROP_KEY, todayStr);

    if (!isSilenced_(props, todayStr)) {
      sendFailureToChat_(todayStr, dow);
    } else {
      Logger.log('🔇 Tichý režim — failure chat notifikace potlačena.');
    }
    return;
  }

  // ── Retry také neuspěl → aktualizuj počítadlo po sobě jdoucích dnů ──
  incrementConsecFails_(props, todayStr);

  // Zjisti, jestli jsme (nově) v tichém režimu
  if (isSilenced_(props, todayStr)) {
    props.setProperty(INTERNAL.WAS_SILENT_KEY, '1');
    Logger.log('🔇 Tichý režim (den ' + getConsecFailCount_(props) +
               ') — failure notifikace potlačeny.');
  } else {
    // Ještě nejsme v tichém režimu → pošleme e-mail o neúspěchu
    sendNotification_(false, todayStr, null, ss.getUrl());
  }
}

/**
 * Inkrementuje počítadlo po sobě jdoucích neúspěšných dnů.
 * Počítá pouze jednou za den (kontroluje datum posledního inkrementa).
 */
function incrementConsecFails_(props, todayStr) {
  var lastDate = props.getProperty(INTERNAL.CONSEC_FAIL_DATE_KEY) || '';
  if (lastDate === todayStr) return;   // dnešek už započítaný

  var count = parseInt(props.getProperty(INTERNAL.CONSEC_FAIL_COUNT_KEY) || '0', 10);
  count++;
  props.setProperty(INTERNAL.CONSEC_FAIL_COUNT_KEY, String(count));
  props.setProperty(INTERNAL.CONSEC_FAIL_DATE_KEY, todayStr);
}

/**
 * Vrátí aktuální počet po sobě jdoucích neúspěšných dnů.
 */
function getConsecFailCount_(props) {
  return parseInt(props.getProperty(INTERNAL.CONSEC_FAIL_COUNT_KEY) || '0', 10);
}

/**
 * Vrátí true, pokud je aktivní tichý režim (série neúspěchů
 * překročila SILENT_AFTER). Pokud je SILENT_AFTER = 0,
 * tichý režim je vypnutý.
 */
function isSilenced_(props, todayStr) {
  var limit = USER.SILENT_AFTER || 0;
  if (limit === 0) return false;   // funkce vypnutá

  // Zjisti počet — ale pozor, retry ještě nemusel být započítaný,
  // takže se podíváme i na to, jestli dnes už počítadlo vzrostlo
  var count    = getConsecFailCount_(props);
  var lastDate = props.getProperty(INTERNAL.CONSEC_FAIL_DATE_KEY) || '';

  // Pokud dnes ještě nebyl retry (= todayStr není v lastDate),
  // počítáme s count+1 (protože se teprve započte)
  var effective = (lastDate === todayStr) ? count : count + 1;

  return effective > limit;
}


/* ══════════════════════════════════════════════════════════════════
   ČESKÉ STÁTNÍ SVÁTKY
   ────────────────────
   Kontrola, jestli dané datum je český státní svátek.
   Pokrývá všech 13 svátků — 11 s pevným datem + 2 pohyblivé
   (Velký pátek a Velikonoční pondělí, odvozené od data Velikonoc).
   ══════════════════════════════════════════════════════════════════ */

/**
 * Vrátí true, pokud zadané datum je český státní svátek.
 *
 * @param {string} dateStr — datum ve formátu yyyy-MM-dd
 * @return {boolean}
 */
function isCzechHoliday_(dateStr) {
  var parts = dateStr.split('-');
  var year  = parseInt(parts[0], 10);
  var mmdd  = parts[1] + '-' + parts[2];

  // Kontrola pevných svátků (11 svátků s neměnným datem)
  if (INTERNAL.FIXED_HOLIDAYS.indexOf(mmdd) >= 0) return true;

  // Kontrola pohyblivých svátků (závisí na datu Velikonoc)
  var easterSunday = computeEasterSunday_(year);

  // Velký pátek = Velikonoční neděle − 2 dny
  var goodFriday = new Date(easterSunday);
  goodFriday.setDate(goodFriday.getDate() - 2);

  // Velikonoční pondělí = Velikonoční neděle + 1 den
  var easterMonday = new Date(easterSunday);
  easterMonday.setDate(easterMonday.getDate() + 1);

  var gfStr = Utilities.formatDate(goodFriday, 'UTC', 'yyyy-MM-dd');
  var emStr = Utilities.formatDate(easterMonday, 'UTC', 'yyyy-MM-dd');

  return dateStr === gfStr || dateStr === emStr;
}

/**
 * Vypočítá datum Velikonoční neděle pro daný rok.
 * Používá Anonymní gregoriánský algoritmus (Computus).
 *
 * @param {number} year — rok (např. 2026)
 * @return {Date} datum Velikonoční neděle (UTC)
 */
function computeEasterSunday_(year) {
  var a = year % 19;
  var b = Math.floor(year / 100);
  var c = year % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);

  var month = Math.floor((h + l - 7 * m + 114) / 31);   // 3 = březen, 4 = duben
  var day   = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}


/* ══════════════════════════════════════════════════════════════════
   KONTROLA ODSTÁVEK MENZY
   ───────────────────────
   Ověří, jestli dnešní datum spadá do některého z období
   definovaných v USER.CLOSURES. Podporuje i přelom roku
   (např. '12-23' až '01-02').
   ══════════════════════════════════════════════════════════════════ */

/**
 * Vrátí true, pokud zadané datum spadá do některého z období
 * v USER.CLOSURES (ruční odstávky menzy).
 *
 * @param {string} dateStr — datum ve formátu yyyy-MM-dd
 * @return {boolean}
 */
function isInClosure_(dateStr) {
  var closures = USER.CLOSURES || [];
  if (closures.length === 0) return false;

  var mmdd = dateStr.slice(5);   // '04-14' z '2026-04-14'

  for (var i = 0; i < closures.length; i++) {
    var from = closures[i][0];   // např. '07-01'
    var to   = closures[i][1];   // např. '08-31'

    if (from <= to) {
      // Normální rozsah (nepřekračuje Nový rok)
      // Příklad: '07-01' až '08-31'
      if (mmdd >= from && mmdd <= to) return true;
    } else {
      // Přelom roku (od > do)
      // Příklad: '12-23' až '01-02' → platí pro prosinec NEBO leden
      if (mmdd >= from || mmdd <= to) return true;
    }
  }

  return false;
}


/* ══════════════════════════════════════════════════════════════════
   KONTROLA KOMPLETNOSTI MENU
   ──────────────────────────
   Ověří, jestli stažené menu obsahuje všechny klíčové kategorie
   definované v USER.REQUIRED_CATEGORIES. Pokud ne, vrátí seznam
   chybějících kategorií.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Vrátí pole chybějících povinných kategorií.
 * Pokud je menu kompletní, vrátí prázdné pole [].
 *
 * @param {Object[]} menuItems — pole jídel (výstup z parseItems_)
 * @return {string[]} chybějící kategorie
 */
function getMissingCategories_(menuItems) {
  var required = USER.REQUIRED_CATEGORIES || [];
  if (required.length === 0) return [];   // kontrola vypnutá

  // Zjisti, jaké kategorie jsou v menu přítomné
  var present = {};
  for (var i = 0; i < menuItems.length; i++) {
    present[menuItems[i].kategorie] = true;
  }

  // Vrať ty povinné, které v menu chybí
  var missing = [];
  for (var j = 0; j < required.length; j++) {
    if (!present[required[j]]) {
      missing.push(required[j]);
    }
  }
  return missing;
}


/* ══════════════════════════════════════════════════════════════════
   VYTVOŘENÍ LISTU
   ────────────────
   Pokud list se zadaným názvem (USER.SHEET_NAME) v sešitu
   neexistuje, tato funkce ho založí od nuly — s hlavičkou,
   správnými šířkami sloupců a barevným zvýrazněním.
   ══════════════════════════════════════════════════════════════════ */

function createHistorySheet_(ss) {
  // Vlož nový list (tab) do sešitu
  var sheet = ss.insertSheet(USER.SHEET_NAME);

  // Nastav hlavičku v prvním řádku (Datum, Den, Kategorie, …)
  var hr = sheet.getRange(1, 1, 1, INTERNAL.HEADERS.length);
  hr.setValues([INTERNAL.HEADERS])
    .setBackground(USER.COLORS.header_bg)
    .setFontColor(USER.COLORS.header_font)
    .setFontWeight(USER.COLORS.header_weight)
    .setFontFamily(USER.FONT_FAMILY)
    .setHorizontalAlignment('center');

  // Zmraz první řádek — hlavička zůstane viditelná při scrollování
  sheet.setFrozenRows(1);

  // Nastav šířky sloupců pro lepší čitelnost
  // (Datum=100, Den=45, Kategorie=120, Č.=40, Jídlo=350,
  //  Cena STU=80, Cena Plná=80, Staženo=130 pixelů)
  [100, 45, 120, 40, 350, 80, 80, 130].forEach(function(w, i) {
    sheet.setColumnWidth(i + 1, w);
  });

  // Formátování řádků se aplikuje až při prvním zápisu dat
  // (funkce applyDateFormatting_ potřebuje data ke zpracování)

  return sheet;
}

/**
 * Obarví řádky v sheetu podle data:
 *   - Dnešní den = tmavě zelené pozadí, bílý tučný text
 *   - Starší dny = střídavě dva odstíny šedé, černý netučný text
 *
 * Toto NENÍ podmíněné formátování (to by neumělo rozlišit "dnešek"),
 * ale přímé formátování, které se obnovuje při každém spuštění.
 *
 * Optimalizace: místo nastavování formátu řádek po řádku (= N×3
 * API volání) se barvy připraví do 2D polí a nastaví najednou
 * přes setBackgrounds/setFontColors/setFontWeights (= 3 API volání
 * celkem, bez ohledu na počet řádků).
 */
function applyDateFormatting_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;   // jen hlavička, nic k formátování

  var numRows  = lastRow - 1;
  var numCols  = INTERNAL.HEADERS.length;
  var todayStr = Utilities.formatDate(new Date(), USER.TIMEZONE, 'yyyy-MM-dd');

  // Nastav font pro celý datový rozsah (jednotný vzhled)
  var allData = sheet.getRange(2, 1, numRows, numCols);
  allData.setFontFamily(USER.FONT_FAMILY);

  // Přečti všechna data ze sloupce A (každý řádek = jedno jídlo)
  var dateVals = sheet.getRange(2, 1, numRows, 1).getValues();

  // Připrav 2D pole pro batch nastavení formátu
  var backgrounds = [];
  var fontColors  = [];
  var fontWeights = [];

  var lastDate   = null;    // poslední zpracované datum
  var grayToggle = 0;       // střídání dvou odstínů šedé (0/1)

  for (var i = 0; i < numRows; i++) {
    // Zjisti datum tohoto řádku
    var ds;
    if (dateVals[i][0] instanceof Date) {
      ds = Utilities.formatDate(dateVals[i][0], USER.TIMEZONE, 'yyyy-MM-dd');
    } else {
      ds = String(dateVals[i][0]);
    }

    // Při změně data přepni odstín šedé (pro alternování dnů)
    if (ds !== lastDate) {
      if (lastDate !== null) grayToggle = 1 - grayToggle;
      lastDate = ds;
    }

    // Vyber barvy pro tento řádek
    var bg, fc, fw;
    if (ds === todayStr) {
      bg = USER.COLORS.today_bg;
      fc = USER.COLORS.today_font;
      fw = USER.COLORS.today_weight;
    } else {
      bg = grayToggle === 0 ? USER.COLORS.gray_1 : USER.COLORS.gray_2;
      fc = USER.COLORS.old_font;
      fw = USER.COLORS.old_weight;
    }

    // Vyplň řádek pole (každý sloupec dostane stejnou barvu)
    var bgRow = [], fcRow = [], fwRow = [];
    for (var c = 0; c < numCols; c++) {
      bgRow.push(bg);
      fcRow.push(fc);
      fwRow.push(fw);
    }
    backgrounds.push(bgRow);
    fontColors.push(fcRow);
    fontWeights.push(fwRow);
  }

  // Aplikuj všechny formáty najednou (3 API volání místo N×3)
  allData.setBackgrounds(backgrounds);
  allData.setFontColors(fontColors);
  allData.setFontWeights(fontWeights);

  // Smaž případné staré podmíněné formátování (z předchozí verze skriptu)
  sheet.clearConditionalFormatRules();
}


/* ══════════════════════════════════════════════════════════════════
   KONTROLA DUPLICIT
   ─────────────────
   Protože data jsou v sheetu řazená od nejnovějšího,
   stačí se podívat na první datový řádek (řádek 2).
   Pokud tam je dnešní datum, data už máme.
   ══════════════════════════════════════════════════════════════════ */

function isTodayAlreadySaved_(sheet, todayStr) {
  // Pokud list nemá žádná data (jen hlavičku), nemůže být duplicita
  if (sheet.getLastRow() <= 1) return false;

  // Přečti datum z prvního datového řádku
  var val = sheet.getRange(2, 1).getValue();

  // Google Sheets může datum vrátit jako objekt Date nebo jako text
  if (val instanceof Date) {
    return Utilities.formatDate(val, USER.TIMEZONE, 'yyyy-MM-dd') === todayStr;
  }
  return String(val) === todayStr;
}


/* ══════════════════════════════════════════════════════════════════
   MENU DIFF — DETEKCE ZMĚN V JÍDELNÍČKU
   ──────────────────────────────────────
   Při druhém spuštění (retry trigger), pokud menu pro dnešek
   už je v sheetu, znovu stáhneme data z API a porovnáme s uloženými.
   Pokud menza mezitím změnila jídelníček, aktualizujeme sheet
   a pošleme notifikaci do Chatu a/nebo mailem.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Hlavní diff logika — přečte stará data ze sheetu, stáhne nová z API,
 * porovná a pokud jsou rozdíly, aktualizuje sheet a notifikuje.
 */
function checkMenuDiff_(sheet, todayStr, dow) {
  // Stáhni aktuální menu z API
  var newItems = fetchMenuFromAPI_(todayStr);
  if (!newItems || newItems.length === 0) {
    Logger.log('Diff: API nevrátilo data — nemůžu porovnat.');
    return;
  }

  // Přečti uložené menu ze sheetu
  var savedItems = readSavedMenu_(sheet, todayStr);
  if (savedItems.length === 0) {
    Logger.log('Diff: V sheetu nejsou data pro ' + todayStr + ' — nemůžu porovnat.');
    return;
  }

  // Porovnej
  var diff = computeMenuDiff_(savedItems, newItems);

  if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
    Logger.log('Diff: Menu se nezměnilo — vše OK.');
    return;
  }

  Logger.log('🔄 Diff: Nalezeny změny! Přidáno: ' + diff.added.length +
             ', Odebráno: ' + diff.removed.length + ', Změněno: ' + diff.changed.length);

  // Aktualizuj sheet — smaž staré řádky pro dnešek, zapiš nové
  if (USER.SHEET_ENABLED) {
    deleteTodayRows_(sheet, todayStr);
    var now = new Date();
    writeMenuRows_(sheet, newItems, todayStr, dow, now);
    applyDateFormatting_(sheet);
    Logger.log('🔄 Sheet aktualizován s novým menu.');
  }

  // Notifikace — do Chatu
  sendDiffToChat_(diff, todayStr, dow);

  // Notifikace — e-mail
  sendDiffEmail_(diff, todayStr);
}


/**
 * Přečte uložené menu ze sheetu pro daný den.
 * Vrátí pole objektů {kategorie, cislo, name, cena_stu, cena_plna}.
 */
function readSavedMenu_(sheet, todayStr) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, INTERNAL.HEADERS.length).getValues();
  var items = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var dateVal = row[0];
    var dateStr;
    if (dateVal instanceof Date) {
      dateStr = Utilities.formatDate(dateVal, USER.TIMEZONE, 'yyyy-MM-dd');
    } else {
      dateStr = String(dateVal);
    }

    if (dateStr !== todayStr) continue;

    items.push({
      kategorie: String(row[2]),
      cislo:     String(row[3]),
      name:      String(row[4]),
      cena_stu:  row[5] !== '' ? String(row[5]) : '',
      cena_plna: row[6] !== '' ? String(row[6]) : '',
    });
  }

  return items;
}


/**
 * Porovná staré a nové menu. Vrátí objekt s poli:
 *   added   — jídla v novém, ale ne ve starém
 *   removed — jídla ve starém, ale ne v novém
 *   changed — jídla se změněným názvem nebo cenou (klíč = kategorie+číslo)
 */
function computeMenuDiff_(oldItems, newItems) {
  // Klíč = kategorie|číslo (např. "oběd|1")
  function key(item) { return item.kategorie + '|' + item.cislo; }

  var oldMap = {};
  for (var i = 0; i < oldItems.length; i++) {
    oldMap[key(oldItems[i])] = oldItems[i];
  }

  var newMap = {};
  for (var j = 0; j < newItems.length; j++) {
    newMap[key(newItems[j])] = newItems[j];
  }

  var added = [], removed = [], changed = [];

  // Nová jídla (nebo změněná)
  for (var nk in newMap) {
    if (!oldMap[nk]) {
      added.push(newMap[nk]);
    } else {
      var o = oldMap[nk], n = newMap[nk];
      var diffs = [];
      // Trim — API občas vrátí název s přebytečnými mezerami
      if (o.name.trim() !== n.name.trim()) diffs.push('název');
      if (o.cena_stu.trim() !== n.cena_stu.trim()) diffs.push('cena STU');
      if (o.cena_plna.trim() !== n.cena_plna.trim()) diffs.push('cena plná');
      if (diffs.length > 0) {
        changed.push({ old: o, new: n, what: diffs });
      }
    }
  }

  // Odebraná jídla
  for (var ok in oldMap) {
    if (!newMap[ok]) {
      removed.push(oldMap[ok]);
    }
  }

  return { added: added, removed: removed, changed: changed };
}


/**
 * Smaže řádky pro daný den ze sheetu (příprava na přepis novými daty).
 */
function deleteTodayRows_(sheet, todayStr) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  // Hledáme od konce (aby mazání řádků neposouvalo indexy)
  for (var i = data.length - 1; i >= 0; i--) {
    var val = data[i][0];
    var dateStr;
    if (val instanceof Date) {
      dateStr = Utilities.formatDate(val, USER.TIMEZONE, 'yyyy-MM-dd');
    } else {
      dateStr = String(val);
    }
    if (dateStr === todayStr) {
      sheet.deleteRow(i + 2); // +2 = offset za hlavičku + 0-index
    }
  }
}


/**
 * Pošle diff notifikaci do Google Chatu (cards v2).
 */
function sendDiffToChat_(diff, todayStr, dow) {
  if (!USER.CHAT_ENABLED || USER.CHAT_WEBHOOKS.length === 0) return;

  var dayName = INTERNAL.DAY_NAMES[dow];
  var lines = [];

  lines.push(styleChatText_('🔄 Menu se změnilo! (' + dayName + ' ' + todayStr + ')', 'section'));

  if (diff.changed.length > 0) {
    lines.push('');
    lines.push(styleChatText_('Změněno:', 'section'));
    for (var c = 0; c < diff.changed.length; c++) {
      var ch = diff.changed[c];
      lines.push('• ' + ch.old.cislo + ': ' + shortenName_(ch.old.name.trim()) + ' → ' + styleChatText_(shortenName_(ch.new.name.trim()), 'food'));
      if (ch.what.indexOf('cena STU') !== -1) {
        lines.push('  💰 ' + ch.old.cena_stu + ' Kč → ' + ch.new.cena_stu + ' Kč');
      }
    }
  }

  if (diff.added.length > 0) {
    lines.push('');
    lines.push(styleChatText_('➕ Přidáno:', 'section'));
    for (var a = 0; a < diff.added.length; a++) {
      var ai = diff.added[a];
      lines.push('• ' + ai.cislo + ': ' + styleChatText_(shortenName_(ai.name), 'food') +
                 (ai.cena_stu ? ' — ' + styleChatText_(ai.cena_stu + ' Kč', 'price') : ''));
    }
  }

  if (diff.removed.length > 0) {
    lines.push('');
    lines.push(styleChatText_('➖ Odebráno:', 'section'));
    for (var r = 0; r < diff.removed.length; r++) {
      var ri = diff.removed[r];
      lines.push('• ~' + ri.cislo + ': ' + shortenName_(ri.name) + '~');
    }
  }

  var payload = {
    cardsV2: [{
      cardId: 'menuDiff',
      card: {
        header: {
          title: '🔄 Změna jídelníčku — ' + dayName + ' ' + todayStr,
          subtitle: 'Menza aktualizovala menu',
        },
        sections: [{
          widgets: [{
            textParagraph: { text: lines.join('\n') },
          }],
        }],
      },
    }],
  };

  sendChatPayload_(payload);
}


/**
 * Pošle diff notifikaci e-mailem.
 */
function sendDiffEmail_(diff, todayStr) {
  if (USER.EMAIL_MODE === 'none') return;

  var lines = ['Menza změnila dnešní jídelníček (' + todayStr + '):\n'];

  if (diff.changed.length > 0) {
    lines.push('ZMĚNĚNO:');
    for (var c = 0; c < diff.changed.length; c++) {
      var ch = diff.changed[c];
      lines.push('  ' + ch.old.cislo + ': ' + ch.old.name.trim() + '  →  ' + ch.new.name.trim() +
                 (ch.what.indexOf('cena STU') !== -1
                   ? '  (cena: ' + ch.old.cena_stu + ' Kč → ' + ch.new.cena_stu + ' Kč)'
                   : ''));
    }
    lines.push('');
  }

  if (diff.added.length > 0) {
    lines.push('PŘIDÁNO:');
    for (var a = 0; a < diff.added.length; a++) {
      var ai = diff.added[a];
      lines.push('  + ' + ai.cislo + ': ' + ai.name + (ai.cena_stu ? ' — ' + ai.cena_stu + ' Kč' : ''));
    }
    lines.push('');
  }

  if (diff.removed.length > 0) {
    lines.push('ODEBRÁNO:');
    for (var r = 0; r < diff.removed.length; r++) {
      var ri = diff.removed[r];
      lines.push('  - ' + ri.cislo + ': ' + ri.name);
    }
    lines.push('');
  }

  try {
    MailApp.sendEmail({
      to:      USER.EMAIL,
      subject: '🔄 Menza — změna jídelníčku (' + todayStr + ')',
      body:    lines.join('\n'),
    });
  } catch (e) {
    Logger.log('Diff e-mail se nepodařilo odeslat: ' + e.message);
  }
}


/* ══════════════════════════════════════════════════════════════════
   STAŽENÍ JÍDELNÍČKU Z WEBKREDIT API
   ────────────────────────────────────
   Komunikace s webem UTB probíhá ve dvou krocích:
     1. Nejdřív se zeptáme, jaká data (datumy) jsou k dispozici.
     2. Pak si vyžádáme konkrétní menu pro dnešní den.
   Pokud se cokoliv nezdaří (web neodpovídá, menu není
   nahráno…), funkce vrátí null a hlavní funkce to zpracuje.
   ══════════════════════════════════════════════════════════════════ */

function fetchMenuFromAPI_(todayStr) {
  // ── Krok 1: Zjisti, jaké dny jsou v systému k dispozici ──
  // (Endpoint "Ordering" vrací seznam datumů, pro které existuje menu)
  var orderingUrl = INTERNAL.BASE_URL + '/Ordering?CanteenId=' + USER.CANTEEN_ID;
  var orderResp   = fetchJSON_(orderingUrl);
  if (!orderResp) return null;   // API neodpovědělo

  // Projdi seznam dostupných datumů a najdi dnešek.
  // API vrací datumy v UTC (např. "2026-02-19T23:00:00Z" = 20.2. v CET),
  // proto je převádíme na lokální čas.
  var dates      = orderResp.dates || [];
  var todayParam = null;

  for (var i = 0; i < dates.length; i++) {
    try {
      var dt       = new Date(dates[i].date);
      var localStr = Utilities.formatDate(dt, USER.TIMEZONE, 'yyyy-MM-dd');
      if (localStr === todayStr) {
        todayParam = dates[i].date;    // našli jsme dnešek
        break;
      }
    } catch (e) { /* neplatné datum — přeskoč */ }
  }

  if (!todayParam) {
    Logger.log('Dnešní datum (' + todayStr + ') nenalezeno v Ordering API.');
    return null;   // dnešní menu v systému není (ještě nenahrané, nebo svátek)
  }

  // ── Krok 2: Stáhni konkrétní menu pro dnešní den ──
  var menuUrl  = INTERNAL.BASE_URL + '/Menu?Dates=' +
                 encodeURIComponent(todayParam) +
                 '&CanteenId=' + USER.CANTEEN_ID;
  var menuResp = fetchJSON_(menuUrl);
  if (!menuResp) return null;

  // API vrací jídla seskupená do „groups" (kategorií).
  // Z každé skupiny vytáhneme jednotlivé položky (items).
  var groups = menuResp.groups || [];
  var items  = [];
  for (var g = 0; g < groups.length; g++) {
    var rows = groups[g].rows || [];
    for (var r = 0; r < rows.length; r++) {
      if (rows[r].item) items.push(rows[r].item);
    }
  }

  // Pokud jsme našli jídla, zpracujeme je do přehledné struktury
  return items.length > 0 ? parseItems_(items) : null;
}

/**
 * Pomocná funkce: stáhne data z URL a vrátí je jako objekt.
 * Pokud se stažení nezdaří (chyba sítě, server neodpovídá…),
 * zapíše chybu do logu a vrátí null.
 */
function fetchJSON_(url) {
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      Logger.log('HTTP ' + resp.getResponseCode() + ' — ' + url);
      return null;
    }
    return JSON.parse(resp.getContentText());
  } catch (e) {
    Logger.log('Fetch error: ' + e.message);
    return null;
  }
}


/* ══════════════════════════════════════════════════════════════════
   ZPRACOVÁNÍ STAŽENÝCH DAT
   ─────────────────────────
   Surová data z API převedeme na přehledný seznam jídel.
   Každé jídlo dostane kategorii (polévka/oběd/minutky/pizza…),
   pořadové číslo, název (očištěný od gramáže) a obě ceny.
   ══════════════════════════════════════════════════════════════════ */

function parseItems_(items) {
  // Nejdřív roztřídíme jídla podle kategorie
  var byCategory = {};

  for (var i = 0; i < items.length; i++) {
    var item = items[i];

    // Zjisti kategorii jídla (polévka, oběd…) a namapuj na naši interní
    var kind = (item.mealKindName || '').trim().toLowerCase();
    var cat  = INTERNAL.CATEGORY_MAP[kind];
    if (!cat) continue;   // neznámá kategorie — přeskoč

    var name = (item.mealName || '').trim();
    if (!name) continue;   // jídlo bez názvu — přeskoč

    // Odstraň gramáž ze začátku názvu (např. "120g Svíčková" → "Svíčková")
    name = name.replace(INTERNAL.WEIGHT_RE, '');
    if (!name) continue;

    // Zajisti velké první písmeno
    name = name.charAt(0).toUpperCase() + name.slice(1);

    // Získej ceny (zaokrouhleno nahoru na celé Kč)
    // - cena_stu  = cena pro studenty/zaměstnance UTB
    // - cena_plna = plná cena (pro veřejnost, externisty)
    // Přesné (nezaokrouhlené) hodnoty z API ukládáme zvlášť
    // pro poznámky v buňkách sheetu.
    var cenaSTU      = item.price  != null ? String(Math.ceil(item.price))  : '';
    var cenaPlna     = item.price2 != null ? String(Math.ceil(item.price2)) : '';
    var cenaSTU_raw  = item.price  != null ? item.price  : null;
    var cenaPlna_raw = item.price2 != null ? item.price2 : null;

    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({
      name: name,
      cena_stu: cenaSTU, cena_plna: cenaPlna,
      cena_stu_raw: cenaSTU_raw, cena_plna_raw: cenaPlna_raw,
    });
  }

  // Sestav výsledný seznam ve správném pořadí
  // (polévka → oběd → oběd ostatní → minutky → pizza)
  // a přiřaď každému jídlu pořadové číslo:
  //   polévka: po1, po2…  |  oběd: 1, 2…  |  oběd ostatní: o1, o2…
  //   minutky: m1, m2…   |  pizza: pz1, pz2…
  var result = [];
  INTERNAL.CATEGORY_ORDER.forEach(function(cat) {
    var dishes = byCategory[cat] || [];
    dishes.forEach(function(dish, idx) {
      var num = '';
      if      (cat === 'polévka')       num = 'po' + (idx + 1);
      else if (cat === 'oběd')          num = String(idx + 1);
      else if (cat === 'oběd ostatní')  num = 'o' + (idx + 1);
      else if (cat === 'minutky')       num = 'm' + (idx + 1);
      else if (cat === 'pizza')         num = 'pz' + (idx + 1);

      result.push({
        kategorie:      cat,
        cislo:          num,
        name:           dish.name,
        cena_stu:       dish.cena_stu,
        cena_plna:      dish.cena_plna,
        cena_stu_raw:   dish.cena_stu_raw,
        cena_plna_raw:  dish.cena_plna_raw,
      });
    });
  });

  return result;
}


/* ══════════════════════════════════════════════════════════════════
   POMOCNÉ FORMÁTOVACÍ FUNKCE
   ──────────────────────────
   Formátování cen, českých datumů a HTML stylů pro Chat.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Naformátuje cenu na 2 desetinná místa s čárkou (český formát).
 * Příklad: 83.5 → "83,50", 19 → "19,00"
 *
 * @param {number} value — cena
 * @return {string} formátovaná cena
 */
function formatPrice_(value) {
  return value.toFixed(2).replace('.', ',');
}

/**
 * Naformátuje datum do českého tvaru.
 * Převede yyyy-MM-dd + index dne na tvar "Po 14. dubna".
 *
 * @param {string} todayStr — datum yyyy-MM-dd
 * @param {number} dow      — den v týdnu (0=Ne, 1=Po, …, 6=So)
 * @return {string} český datum
 */
function formatCzechDate_(todayStr, dow) {
  var MONTHS_GEN = [
    '', 'ledna', 'února', 'března', 'dubna', 'května', 'června',
    'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'
  ];
  var parts    = todayStr.split('-');
  var day      = parseInt(parts[2], 10);
  var monthIdx = parseInt(parts[1], 10);
  return INTERNAL.DAY_NAMES[dow] + ' ' + day + '. ' + MONTHS_GEN[monthIdx];
}

/**
 * Obalí text HTML tagy podle stylové konfigurace.
 * Aplikuje tučnost, kurzívu, barvu a font.
 *
 * @param {string} text  — text k formátování
 * @param {Object} style — {color, weight, italic, font}
 * @return {string} HTML-formátovaný text
 */
function styleChatText_(text, style) {
  var html = text;
  if (style.weight === 'bold') html = '<b>' + html + '</b>';
  if (style.italic) html = '<i>' + html + '</i>';
  var fontAttr = style.font ? ' face="' + style.font + '"' : '';
  return '<font color="' + style.color + '"' + fontAttr + '>' + html + '</font>';
}

/**
 * Zkrátí název jídla — vrátí text do první čárky.
 * Pokud čárka není, vrátí celý název beze změny.
 * Řídí se konfigurační volbou USER.CHAT_SHORTEN_NAMES.
 *
 * Příklad: "Svíčková na smetaně, houskový knedlík" → "Svíčková na smetaně"
 *
 * @param {string} name — název jídla
 * @return {string} zkrácený (nebo plný) název
 */
function shortenName_(name) {
  if (!USER.CHAT_SHORTEN_NAMES) return name;
  var idx = name.indexOf(',');
  return idx >= 0 ? name.substring(0, idx).trim() : name;
}

/**
 * Sestrojí HTML pro smallprint (disclaimer) v chatové zprávě.
 * Řídí se konfigurací: text, velikost, barva, font, tučnost, kurzíva.
 *
 * @param {Object} sp — objekt z USER.CHAT_STYLE.smallprint
 * @return {string} HTML
 */
function styleSmallprint_(sp) {
  var html = sp.text;
  if (sp.weight === 'bold') html = '<b>' + html + '</b>';
  if (sp.italic) html = '<i>' + html + '</i>';
  var fontAttr = sp.font ? ' face="' + sp.font + '"' : '';
  var colorAttr = sp.color ? ' color="' + sp.color + '"' : '';
  return '<font size="' + sp.size + '"' + colorAttr + fontAttr + '>' + html + '</font>';
}

/**
 * Odešle JSON payload do všech Google Chat webhooků.
 * Sdílená pomocná funkce pro sendToGoogleChat_, sendFailureToChat_
 * a sendResumedToChat_.
 *
 * @param {string[]} webhooks — pole webhook URL
 * @param {Object}   payload  — JSON objekt (typicky cards v2)
 * @param {string}   label    — popis pro log ('menu', 'failure', 'resumed')
 */
function sendChatPayload_(webhooks, payload, label) {
  for (var i = 0; i < webhooks.length; i++) {
    try {
      var options = {
        method:             'post',
        contentType:        'application/json; charset=UTF-8',
        payload:            JSON.stringify(payload),
        muteHttpExceptions: true,
      };
      var resp = UrlFetchApp.fetch(webhooks[i], options);
      if (resp.getResponseCode() === 200) {
        Logger.log('✅ Chat [' + label + '] odeslán do prostoru #' + (i + 1));
      } else {
        Logger.log('⚠️ Chat [' + label + '] webhook #' + (i + 1) + ' — HTTP ' +
                   resp.getResponseCode() + ': ' + resp.getContentText());
      }
    } catch (e) {
      Logger.log('❌ Chat [' + label + '] webhook #' + (i + 1) + ' — chyba: ' + e.message);
    }
  }
}


/* ══════════════════════════════════════════════════════════════════
   ZÁPIS DO SHEETU
   ───────────────
   Stažená jídla se zapíší pod hlavičku (řádek 2). Každé jídlo
   dostane svůj řádek. Existující data se posunou dolů.
   Přesné ceny z API se ukládají jako poznámky k buňkám.
   ══════════════════════════════════════════════════════════════════ */

function writeMenuRows_(sheet, menuItems, todayStr, dow, now) {
  // Český název dne (Po, Út, St…) a časové razítko
  var dayName   = INTERNAL.DAY_NAMES[dow];
  var timestamp = Utilities.formatDate(now, USER.TIMEZONE, 'dd.MM.yyyy, HH:mm');

  // Každé jídlo = jeden řádek v sheetu
  var rows = menuItems.map(function(item) {
    return [
      todayStr,         // A: Datum (2026-04-14)
      dayName,          // B: Den (Po)
      item.kategorie,   // C: Kategorie (polévka / oběd / …)
      item.cislo,       // D: Číslo (1, o1, m1, …)
      item.name,        // E: Název jídla
      item.cena_stu,    // F: Cena STU/zaměstnanecká (Kč)
      item.cena_plna,   // G: Cena plná (pro veřejnost)
      timestamp,        // H: Kdy staženo (14.04.2026, 09:34)
    ];
  });

  // Vlož nové řádky pod hlavičku (existující data se posunou dolů)
  sheet.insertRowsAfter(1, rows.length);
  var range = sheet.getRange(2, 1, rows.length, INTERNAL.HEADERS.length);
  range.setValues(rows);

  // Formátování: formát data, zarovnání sloupců
  sheet.getRange(2, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, 5, rows.length, 1).setHorizontalAlignment('left');    // E: Jídlo vlevo
  sheet.getRange(2, 6, rows.length, 2).setHorizontalAlignment('center');  // F+G: ceny na střed
  sheet.getRange(2, 8, rows.length, 1).setHorizontalAlignment('center');  // H: čas na střed
  range.setVerticalAlignment('middle');

  // Poznámky: přesné ceny z API — zobrazí se při najetí myší.
  // Formátovány na 2 desetinná místa s čárkou (český formát).
  for (var n = 0; n < menuItems.length; n++) {
    var mi = menuItems[n];
    if (mi.cena_stu_raw !== null) {
      sheet.getRange(2 + n, 6).setNote('Přesná cena: ' + formatPrice_(mi.cena_stu_raw) + ' Kč');
    }
    if (mi.cena_plna_raw !== null) {
      sheet.getRange(2 + n, 7).setNote('Přesná cena: ' + formatPrice_(mi.cena_plna_raw) + ' Kč');
    }
  }
}

/**
 * Odstraní záznamy starší než USER.MAX_DAYS.
 * Protože data jsou řazená od nejnovějšího, sloučíme všechny řádky
 * se stejným datem do jednoho bloku — a odstraníme bloky starší.
 */
function pruneOldEntries_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;   // jen hlavička

  // Přečti všechna data ze sloupce A (data)
  var dateRange = sheet.getRange(2, 1, lastRow - 1, 1);
  var dateVals  = dateRange.getValues();

  // Najdi skupiny řádků se stejným datem a jejich počty
  var dateGroups = [];   // [{date: '2026-04-14', count: 5}, ...]
  var lastDate = null;
  var count = 0;

  for (var i = 0; i < dateVals.length; i++) {
    var d;
    if (dateVals[i][0] instanceof Date) {
      d = Utilities.formatDate(dateVals[i][0], USER.TIMEZONE, 'yyyy-MM-dd');
    } else {
      d = String(dateVals[i][0]);
    }

    if (d !== lastDate) {
      if (lastDate !== null) {
        dateGroups.push({ date: lastDate, count: count });
      }
      lastDate = d;
      count = 1;
    } else {
      count++;
    }
  }
  if (lastDate !== null) {
    dateGroups.push({ date: lastDate, count: count });
  }

  // Smaž skupiny starší než MAX_DAYS
  var toDelete = [];  // seznam počtů řádků k smazání
  var maxDays = USER.MAX_DAYS || 10;

  for (var g = maxDays; g < dateGroups.length; g++) {
    toDelete.push(dateGroups[g].count);
  }

  // Smaž skupiny (od posledního řádku směrem nahoru, aby se neposunuly indexy)
  var rowToDelete = lastRow;  // poslední řádek
  for (var d = toDelete.length - 1; d >= 0; d--) {
    sheet.deleteRows(rowToDelete - toDelete[d] + 1, toDelete[d]);
    rowToDelete -= toDelete[d];
  }
}


/* ══════════════════════════════════════════════════════════════════
   ODESLÁNÍ DO GOOGLE CHATU
   ────────────────────────
   Formátuje seznam jídel jako cards v2 zprávu s HTML formátováním
   a odešle ji do všech nakonfigurovaných Google Chat webhooků.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Hlavní orchestrátor: odešle denní menu do všech Chat prostorů.
 * Sestaví cards v2 payload a odešle přes sendChatPayload_.
 *
 * @param {Object[]} menuItems — pole jídel
 * @param {string}   todayStr  — datum yyyy-MM-dd
 * @param {number}   dow       — den v týdnu (0-6)
 */
function sendToGoogleChat_(menuItems, todayStr, dow) {
  if (!USER.CHAT_ENABLED) return;

  var webhooks = USER.CHAT_WEBHOOKS || [];
  if (webhooks.length === 0 ||
      (webhooks.length === 1 && webhooks[0] === 'SEM_VLOŽ_WEBHOOK_URL_Z_GOOGLE_CHAT')) {
    Logger.log('⚠️ CHAT_WEBHOOKS nejsou nastavené — zpráva do Google Chatu nebyla odeslána.');
    return;
  }

  // Sestav cards v2 payload s menu a hypertextovými odkazy
  var cardPayload = formatMenuForChat_(menuItems, todayStr, dow);

  // Odešli do všech prostorů
  sendChatPayload_(webhooks, cardPayload, 'menu');
}

/**
 * Formátuje jídelníček jako Google Chat cards v2 payload.
 * Vytvoří kartu s hlavičkou (datum), sekcemi s emoji-kategoriemi
 * a HTML hypertextovými odkazy na web menzy a Google Sheet.
 *
 * Struktura karty:
 *   Header: 🍽️ Jídelníček – Po 14. dubna
 *   Body:   Jídla seskupená dle kategorií (🥣 Polévky, 🍛 Obědy…)
 *   Footer: Odkazy na web menzy a list obědů
 *
 * @param {Object[]} menuItems — pole jídel
 * @param {string}   todayStr  — datum yyyy-MM-dd
 * @param {number}   dow       — den v týdnu (0-6)
 * @return {Object} Cards v2 payload pro Google Chat webhook
 */
function formatMenuForChat_(menuItems, todayStr, dow) {
  // Emoji a labely pro každou kategorii
  var CAT_LABELS = {
    'polévka':       { emoji: '🥣', label: 'Polévky' },
    'oběd':          { emoji: '🍛', label: 'Obědy' },
    'oběd ostatní':  { emoji: '🍲', label: 'Obědy ostatní' },
    'minutky':       { emoji: '⏳', label: 'Minutky' },
    'pizza':         { emoji: '🍕', label: 'Pizza' },
  };

  // Český datum pro hlavičku
  var dateText = formatCzechDate_(todayStr, dow);

  // Sestav HTML tělo zprávy (seznam s kategoriemi)
  var html = '';
  var lastCat = '';
  for (var i = 0; i < menuItems.length; i++) {
    var item = menuItems[i];

    if (item.kategorie !== lastCat) {
      if (html) html += '<br>';
      var catInfo = CAT_LABELS[item.kategorie] || { emoji: '▪️', label: item.kategorie };
      html += catInfo.emoji + ' ' + styleChatText_(catInfo.label, USER.CHAT_STYLE.section) + '<br>';
      lastCat = item.kategorie;
    }

    // Název jídla (volitelně zkrácený do první čárky) a cena
    var foodHtml  = styleChatText_(shortenName_(item.name), USER.CHAT_STYLE.food);
    var pricePart = item.cena_stu !== ''
      ? ' · ' + styleChatText_(item.cena_stu + ' Kč', USER.CHAT_STYLE.price)
      : '';

    html += '  ' + item.cislo + ' – ' + foodHtml + pricePart + '<br>';
  }

  // Patička s odkazy (ikony a oddělovač konfigurovatelné)
  var sep = USER.LINK_SEPARATOR;
  html += '<br>' +
          USER.LINK_ICON_MENZA + ' <a href="' + USER.MENZA_WEB_URL + '">Menza</a>' + sep +
          USER.LINK_ICON_OBEDY + ' <a href="' + USER.OBEDY_SHEET_URL + '">Zapiš oběd</a>' + sep +
          USER.LINK_ICON_DASHBOARD + ' <a href="' + USER.DASHBOARD_URL + '">JídLOG</a>' + sep +
          USER.LINK_ICON_QR + ' <a href="' + USER.DASHBOARD_URL + '?format=qr">QR</a>' + sep +
          USER.LINK_ICON_ICS + ' <a href="' + USER.DASHBOARD_URL.replace(/^https?:\/\//, 'webcal://') + '?format=ics">.ics</a>' +
          '<br><br>' + styleSmallprint_(USER.CHAT_STYLE.smallprint);

  return {
    cardsV2: [{
      cardId: 'menuCard',
      card: {
        header: {
          title: '🍽️ Jídelníček – ' + dateText,
        },
        sections: [{
          widgets: [{
            textParagraph: { text: html }
          }]
        }]
      }
    }]
  };
}

/**
 * Odešle do Chatu zprávu o neúspěchu stažení.
 * Používá cards v2 s HTML hypertextovými odkazy na web menzy a sheet.
 *
 * @param {string} todayStr — datum yyyy-MM-dd
 * @param {number} dow      — den v týdnu (0-6)
 */
function sendFailureToChat_(todayStr, dow) {
  if (!USER.CHAT_ENABLED) return;

  var webhooks = USER.CHAT_WEBHOOKS || [];
  if (webhooks.length === 0 ||
      (webhooks.length === 1 && webhooks[0] === 'SEM_VLOŽ_WEBHOOK_URL_Z_GOOGLE_CHAT')) {
    return;
  }

  var dateText = formatCzechDate_(todayStr, dow);

  var cardPayload = {
    cardsV2: [{
      cardId: 'failureCard',
      card: {
        header: {
          title: '⚠️ Jídelníček na ' + dateText + ' se nepodařilo stáhnout',
        },
        sections: [{
          widgets: [{
            textParagraph: {
              text: 'Jídelníček: na <a href="' + USER.MENZA_WEB_URL + '">webu menzy</a>' +
                    ' a oběd si zapiš do <a href="' + USER.OBEDY_SHEET_URL + '">Google sheetu</a>.'
            }
          }]
        }]
      }
    }]
  };

  sendChatPayload_(webhooks, cardPayload, 'failure');
}

/**
 * Odešle do Chatu zprávu „Menza je zpět!" po zotavení ze série neúspěchů.
 * Používá cards v2 formát.
 *
 * @param {string} todayStr — datum yyyy-MM-dd
 * @param {number} dow      — den v týdnu (0-6)
 */
function sendResumedToChat_(todayStr, dow) {
  if (!USER.CHAT_ENABLED) return;

  var webhooks = USER.CHAT_WEBHOOKS || [];
  if (webhooks.length === 0 ||
      (webhooks.length === 1 && webhooks[0] === 'SEM_VLOŽ_WEBHOOK_URL_Z_GOOGLE_CHAT')) {
    return;
  }

  var dateText = formatCzechDate_(todayStr, dow);

  var cardPayload = {
    cardsV2: [{
      cardId: 'resumedCard',
      card: {
        header: {
          title: '🎉 Menza je zpět! — ' + dateText,
        },
        sections: [{
          widgets: [{
            textParagraph: {
              text: 'Po delší pauze se jídelníček opět podařilo stáhnout. ' +
                    'Denní menu najdeš v další zprávě.'
            }
          }]
        }]
      }
    }]
  };

  sendChatPayload_(webhooks, cardPayload, 'resumed');
}


/* ══════════════════════════════════════════════════════════════════
   E-MAILOVÉ NOTIFIKACE
   ────────────────────
   Podle nastavení EMAIL_MODE se odešle:
     - 'both':    e-mail bez ohledu na výsledek
     - 'success': jen když se menu stáhlo
     - 'failure': jen když se menu nestáhlo
     - 'none':    vůbec nic
   ══════════════════════════════════════════════════════════════════ */

/**
 * Odešle notifikační e-mail o výsledku stažení.
 * Respektuje nastavení EMAIL_MODE.
 *
 * @param {boolean}  success   — true = menu staženo, false = chyba
 * @param {string}   todayStr  — datum yyyy-MM-dd
 * @param {Object[]} menuItems — pole jídel (null při chybě)
 * @param {string}   sheetUrl  — odkaz na Google Sheet
 */
function sendNotification_(success, todayStr, menuItems, sheetUrl) {
  var mode = (USER.EMAIL_MODE || 'both').toLowerCase();
  if (mode === 'none') return;
  if (mode === 'success' && !success) return;
  if (mode === 'failure' && success) return;

  // Předmět e-mailu (s emoji pro rychlou orientaci)
  var emoji   = success ? '\u2705' : '\u274C';   // ✅ nebo ❌
  var subject = emoji + ' Jídelníček UTB \u2014 ' + todayStr;

  // Tělo e-mailu
  var body = '';

  if (success) {
    body += 'Menu pro ' + todayStr + ' bylo úspěšně uloženo (' + menuItems.length + ' položek).\n\n';
    body += formatMenuForEmail_(menuItems);
  } else {
    body += 'Menu pro ' + todayStr + ' se nepodařilo stáhnout.\n';
    body += 'Pokusy o stažení (~' + USER.TRIGGER_1[0] + ':' + String(USER.TRIGGER_1[1]).padStart(2, '0') +
             ' a retry ~' + USER.TRIGGER_2[0] + ':' + String(USER.TRIGGER_2[1]).padStart(2, '0') +
             ') skončily bez výsledku.\n\n';
    body += 'Možné příčiny:\n';
    body += '  - WebKredit API je nedostupné\n';
    body += '  - Menza dnes nemá nabídku (svátek, prázdniny)\n';
    body += '  - Jídelníček ještě nebyl nahrán\n';
  }

  // Odkazy na sheet a web
  body += '\n────────────────────\n';
  body += '📊  Google Sheet:  ' + sheetUrl + '\n';
  body += '🍝  WebKredit:     ' + USER.MENZA_WEB_URL + '\n';
  body += '📋  JídLOG:        ' + USER.DASHBOARD_URL + '\n';
  body += '🔳  QR kód:        ' + USER.DASHBOARD_URL + '?format=qr\n';
  body += '📆  .ics:          ' + USER.DASHBOARD_URL.replace(/^https?:\/\//, 'webcal://') + '?format=ics\n';

  // Odešli e-mail
  MailApp.sendEmail({
    to:      USER.EMAIL,
    subject: subject,
    body:    body,
  });

  Logger.log('E-mail odeslán na ' + USER.EMAIL + ' (' + (success ? 'úspěch' : 'neúspěch') + ')');
}

/**
 * Naformátuje jídelníček jako čitelný text pro tělo e-mailu.
 * Seskupí jídla podle kategorií s cenami STU/plná.
 *
 * Příklad výstupu:
 *   POLÉVKA
 *     Gulášová — 19/32 Kč
 *
 *   OBĚD
 *     1. Krůtí medailonky — 95/114 Kč
 *     2. Cizrnové kari — 86/103 Kč
 *
 * @param {Object[]} menuItems — pole jídel
 * @return {string} formátované menu pro e-mail
 */
function formatMenuForEmail_(menuItems) {
  var lines        = [];
  var lastCategory = '';

  for (var i = 0; i < menuItems.length; i++) {
    var item = menuItems[i];

    // Při změně kategorie vložíme hlavičku (POLÉVKA, OBĚD…)
    if (item.kategorie !== lastCategory) {
      if (lines.length > 0) lines.push('');   // prázdný řádek jako oddělovač
      lines.push(item.kategorie.toUpperCase());
      lastCategory = item.kategorie;
    }

    // Pořadové číslo (pokud existuje — polévka ho nemá)
    var prefix = item.cislo ? (item.cislo + '. ') : '';

    // Cena: pokud existují obě, zobraz jako STU/plná Kč
    var priceStr = '';
    if (item.cena_stu !== '' && item.cena_plna !== '') {
      priceStr = ' \u2014 ' + item.cena_stu + '/' + item.cena_plna + ' K\u010D';
    } else if (item.cena_stu !== '') {
      priceStr = ' \u2014 ' + item.cena_stu + ' K\u010D';
    }

    lines.push('  ' + prefix + item.name + priceStr);
  }

  return lines.join('\n') + '\n';
}


/* ══════════════════════════════════════════════════════════════════
   SPRÁVA TRIGGERŮ
   ───────────────
   Funkcí `nastavTriggery()` se vytvářejí a aktualizují automatické
   triggery. Funkce `smazTriggery()` je vypne.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Vytvoří nebo obnoví automatické triggery pro stahování jídelníčku.
 * Musí se spustit ručně (▶ Run) nebo přes menu Extensions → Apps Script → Run.
 *
 * Po spuštění požádá Google o povolení (přístup k Sheetu, e-mailu…).
 * Triggery se pak spouštějí automaticky podle nastaveného času.
 */
function nastavTriggery() {
  // Načti konfiguraci z sheetu
  loadConfig_();

  var MANAGED_FUNCTIONS = ['stahniANotifikuj', 'stahniMenu', 'posliNotifikace'];

  // Smaž staré triggery, aby se nezakládaly duplicitní
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (MANAGED_FUNCTIONS.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Trigger 1 — stažení dat (výchozí ~10:00)
  // Jen stáhne a uloží do sheetu, neposílá notifikace.
  // Data jsou pak k dispozici pro dashboard, ICS feed a kalendář.
  ScriptApp.newTrigger('stahniMenu')
    .timeBased()
    .everyDays(1)
    .atHour(USER.TRIGGER_1[0])
    .nearMinute(USER.TRIGGER_1[1])
    .inTimezone(USER.TIMEZONE)
    .create();

  // Trigger Notify — odeslání notifikací (výchozí ~10:45)
  // Přečte data ze sheetu a pošle Chat + email.
  ScriptApp.newTrigger('posliNotifikace')
    .timeBased()
    .everyDays(1)
    .atHour(USER.TRIGGER_NOTIFY[0])
    .nearMinute(USER.TRIGGER_NOTIFY[1])
    .inTimezone(USER.TIMEZONE)
    .create();

  // Trigger 2 — retry / záložní pokus (výchozí ~12:00)
  // Pokud data chybí, stáhne znovu + pošle notifikaci.
  ScriptApp.newTrigger('stahniANotifikuj')
    .timeBased()
    .everyDays(1)
    .atHour(USER.TRIGGER_2[0])
    .nearMinute(USER.TRIGGER_2[1])
    .inTimezone(USER.TIMEZONE)
    .create();

  Logger.log('✅ Triggery nastaveny: fetch ~' +
    USER.TRIGGER_1[0] + ':' + String(USER.TRIGGER_1[1]).padStart(2, '0') +
    ', notify ~' +
    USER.TRIGGER_NOTIFY[0] + ':' + String(USER.TRIGGER_NOTIFY[1]).padStart(2, '0') +
    ', retry ~' +
    USER.TRIGGER_2[0] + ':' + String(USER.TRIGGER_2[1]).padStart(2, '0') +
    ' (' + USER.TIMEZONE + ')');
}

/**
 * Vypne všechny automatické triggery.
 * Volej tuto funkci, pokud chceš skript dočasně zakázat.
 */
function smazTriggery() {
  var MANAGED_FUNCTIONS = ['stahniANotifikuj', 'stahniMenu', 'posliNotifikace'];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (MANAGED_FUNCTIONS.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });
  Logger.log('✅ Všechny triggery byly smazány.');
}


/* ══════════════════════════════════════════════════════════════════
   RUČNÍ TEST
   ──────────
   Funkce pro ruční spuštění stažení — obejde aktuální čas
   a spustí logiku ihned (bez čekání na trigger).
   ══════════════════════════════════════════════════════════════════ */

/**
 * Spusť stahniANotifikuj() okamžitě — bez čekání na trigger.
 * Praktické pro testování během vývoje.
 */
function spustitRucne() {
  Logger.log('═════════════════════════════════════════');
  Logger.log('🚀 Ruční spuštění — spustitRucne()');
  Logger.log('═════════════════════════════════════════');
  stahniANotifikuj();
  Logger.log('═════════════════════════════════════════');
}


/* ══════════════════════════════════════════════════════════════════
   POMOCNÉ FUNKCE
   ──────────────
   Obecné utility — zjištění dne v týdnu apod.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Vrátí den v týdnu (0 = neděle, 1 = pondělí, …, 6 = sobota)
 * pro dané datum v konfigurované časové zóně.
 *
 * Používá Utilities.formatDate (GAS-nativní) pro spolehlivý
 * převod do správné zóny.
 *
 * @param {Date} date — datum ke zjištění
 * @return {number} den v týdnu (0-6)
 */
function getDayOfWeek_(date) {
  var dateStr = Utilities.formatDate(date, USER.TIMEZONE, 'yyyy-MM-dd');
  var parts   = dateStr.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getDay();
}


/* ══════════════════════════════════════════════════════════════════
   WEB DASHBOARD
   ─────────────
   Veřejný web s jídelníčkem — servírovaný přes Apps Script doGet().
   Po nasazení jako Web App (Deploy → New deployment → Web app,
   Execute as: Me, Who has access: Anyone) získáš URL, kterou
   můžeš sdílet s kolegy.

   Dashboard zobrazuje:
     - Dnešní jídelníček (zvýrazněný)
     - Historii předchozích dnů (rozbalovací)
     - Přepínač světlý/tmavý režim
   ══════════════════════════════════════════════════════════════════ */

/**
 * Vstupní bod pro Web App — vrátí HTML stránku s jídelníčkem.
 * Google volá tuto funkci, když někdo otevře URL nasazené Web App.
 *
 * @param {Object} e — event objekt (parametry z URL)
 * @return {HtmlOutput} HTML stránka
 */
function doGet(e) {
  var params = e ? e.parameter : {};

  // ?format=ics → ICS kalendářový feed se všemi dostupnými dny
  if (params.format === 'ics') {
    return generateIcs_();
  }

  // ?format=qr → přesměruje na QR obrázek dashboardu
  if (params.format === 'qr') {
    loadConfig_();
    var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' +
                encodeURIComponent(USER.DASHBOARD_URL);
    return HtmlService.createHtmlOutput(
      '<html><head><meta http-equiv="refresh" content="0;url=' + qrUrl + '"></head>' +
      '<body><a href="' + qrUrl + '">QR kód</a></body></html>'
    );
  }

  // Výchozí: HTML dashboard
  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('Jídelníček UTB Menza')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/**
 * Vygeneruje ICS (iCalendar) feed se všemi dostupnými dny jako celodenní události.
 * Google Calendar / Apple Calendar si feed pravidelně stahuje a aktualizuje.
 * Volá se přes doGet(?format=ics).
 */
function generateIcs_() {
  loadConfig_();

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(USER.SHEET_NAME);

  // Hlavička kalendáře
  var cal = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Menza Feed//CS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:🍽️ UTB Menza',
    'X-WR-TIMEZONE:' + USER.TIMEZONE,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];

  // DTSTAMP — povinné pole dle RFC 5545, čas generování feedu
  var dtstamp = Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");

  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, INTERNAL.HEADERS.length).getValues();

    // Seskupení řádků podle data
    var dayMap = {};
    for (var i = 0; i < data.length; i++) {
      var dateVal = data[i][0];
      var dateStr = (dateVal instanceof Date)
        ? Utilities.formatDate(dateVal, USER.TIMEZONE, 'yyyy-MM-dd')
        : String(dateVal);
      if (!dayMap[dateStr]) dayMap[dateStr] = [];
      dayMap[dateStr].push(data[i]);
    }

    // Pro každý den vytvořit VEVENT
    var dates = Object.keys(dayMap).sort();
    for (var d = 0; d < dates.length; d++) {
      var ds = dates[d];
      var rows = dayMap[ds];

      // Sestavit popis z řádků menu
      var lines = [];
      var lastCat = '';
      for (var r = 0; r < rows.length; r++) {
        var cat = String(rows[r][2]);
        if (cat !== lastCat) {
          if (lines.length > 0) lines.push('');
          lines.push(cat.toUpperCase() + ':');
          lastCat = cat;
        }
        var name = String(rows[r][4]);
        var price = rows[r][5] !== '' ? ' — ' + rows[r][5] + ' Kč' : '';
        lines.push('  ' + rows[r][3] + ': ' + name + price);
      }

      var description = icsEscape_(lines.join('\\n'));
      var dayName = String(rows[0][1]); // Den v týdnu (Po, Út, ...)

      // DTSTART a DTEND (celodenní událost — DTEND = následující den dle RFC 5545)
      var dtStart = ds.replace(/-/g, '');
      var nextDay = new Date(ds + 'T12:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      var dtEnd = Utilities.formatDate(nextDay, 'UTC', 'yyyyMMdd');

      cal.push('BEGIN:VEVENT');
      cal.push('DTSTAMP:' + dtstamp);
      cal.push('DTSTART;VALUE=DATE:' + dtStart);
      cal.push('DTEND;VALUE=DATE:' + dtEnd);
      cal.push('SUMMARY:🍽️ Menza — ' + dayName + ' ' + ds);
      cal.push('DESCRIPTION:' + description);
      cal.push('UID:menza-' + ds + '@blogic.cz');
      cal.push('TRANSP:TRANSPARENT');
      cal.push('END:VEVENT');
    }
  }

  cal.push('END:VCALENDAR');

  return ContentService.createTextOutput(cal.join('\r\n'))
    .setMimeType(ContentService.MimeType.TEXT);
}


/**
 * Escapuje text pro ICS DESCRIPTION — speciální znaky dle RFC 5545.
 */
function icsEscape_(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * Vrátí data jídelníčku pro web dashboard.
 * Volá se z klientského JS přes google.script.run.
 *
 * @return {Object} { days: [{date, dayName, items, closed?}], todayStr, menzaUrl }
 *   Dny s daty mají items[], mezilehlé dny bez dat (víkendy aj.) mají closed:true.
 */
function nactiMenuProWeb() {
  loadConfig_();

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(USER.SHEET_NAME);
  if (!sheet) return { days: [], todayStr: '', menzaUrl: '' };

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { days: [], todayStr: '', menzaUrl: USER.MENZA_WEB_URL };

  // Přečti všechna data najednou (rychlejší než řádek po řádku)
  var data = sheet.getRange(2, 1, lastRow - 1, INTERNAL.HEADERS.length).getValues();

  // Seskup řádky podle data
  var days     = {};
  var dayOrder = [];

  for (var i = 0; i < data.length; i++) {
    var row     = data[i];
    var dateVal = row[0];
    var dateStr;
    if (dateVal instanceof Date) {
      dateStr = Utilities.formatDate(dateVal, USER.TIMEZONE, 'yyyy-MM-dd');
    } else {
      dateStr = String(dateVal);
    }

    if (!days[dateStr]) {
      days[dateStr] = {
        date:      dateStr,
        dayName:   String(row[1]),
        items:     [],
        fetchedAt: row[7] ? String(row[7]) : '',  // H: kdy staženo (14.04.2026, 09:34)
      };
      dayOrder.push(dateStr);
    }

    days[dateStr].items.push({
      kategorie: String(row[2]),
      cislo:     String(row[3]),
      name:      String(row[4]),
      cena_stu:  row[5] !== '' ? String(row[5]) : '',
      cena_plna: row[6] !== '' ? String(row[6]) : '',
    });
  }

  var todayStr = Utilities.formatDate(new Date(), USER.TIMEZONE, 'yyyy-MM-dd');
  var DAY_ABBR = ['Ne','Po','Út','St','Čt','Pá','So'];

  // Seřaď dny sestupně (nejnovější první)
  dayOrder.sort(function(a, b) { return a < b ? 1 : a > b ? -1 : 0; });

  // Mezi pracovní dny vlož víkendy/svátky s closed: true
  var daysWithGaps = [];
  for (var g = 0; g < dayOrder.length; g++) {
    daysWithGaps.push(days[dayOrder[g]]);

    // Pokud existuje další den, vyplň mezeru
    if (g < dayOrder.length - 1) {
      var curr = new Date(dayOrder[g] + 'T12:00:00');
      var next = new Date(dayOrder[g + 1] + 'T12:00:00');
      // Iteruj od curr-1 do next+1 a vlož zavřené dny
      var fill = new Date(curr.getTime() - 86400000); // den před curr
      while (fill.getTime() > next.getTime()) {
        var fStr = Utilities.formatDate(fill, USER.TIMEZONE, 'yyyy-MM-dd');
        if (!days[fStr]) {
          daysWithGaps.push({
            date:    fStr,
            dayName: DAY_ABBR[fill.getDay()],
            items:   [],
            closed:  true,
          });
        }
        fill = new Date(fill.getTime() - 86400000);
      }
    }
  }

  return {
    days:        daysWithGaps,
    todayStr:    todayStr,
    menzaUrl:    USER.MENZA_WEB_URL,
    obedyUrl:    USER.OBEDY_SHEET_URL,
    dashboardUrl: USER.DASHBOARD_URL,
  };
}
