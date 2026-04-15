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
 *  Každý pracovní den se skript automaticky spustí dvakrát
 *  (ve výchozím nastavení v ~10:45 a ~12:00). Při každém spuštění:
 *
 *    1. Zkontroluje, jestli je pracovní den (So+Ne přeskakuje).
 *    2. Podívá se, jestli v Google Sheetu už existuje list "Jídlog".
 *       Pokud ne (někdo ho smazal, přejmenoval…), vytvoří nový
 *       i s formátováním a hlavičkou.
 *    3. Ověří, jestli pro dnešek už nejsou data zapsaná
 *       (aby se nezapisovala duplicitně).
 *    4. Připojí se k webu UTB WebKredit a stáhne aktuální jídelníček
 *       — polévky, obědy, obědy ostatní, minutky a pizzy
 *       s cenami (studentská i plná).
 *    5. Zapíše jídla do sheetu (nejnovější den je vždy nahoře)
 *       — pokud je SHEET_ENABLED zapnutý.
 *    6. Odešle denní menu do Google Chat prostoru/prostorů
 *       jako přehledný seznam s kategoriemi — pokud je CHAT_ENABLED
 *       zapnutý a CHAT_WEBHOOKS obsahují platné webhook URL.
 *    7. Smaže záznamy starší než nastavený počet dnů (výchozí 10).
 *    8. Přeformátuje celý list — dnešní den tmavě zeleně (bílý
 *       tučný text), starší dny střídavě ve dvou odstínech šedé.
 *    9. Pošle e-mail s výsledkem — buď seznam jídel, nebo info
 *       že se stažení nezdařilo (s odkazy na sheet a WebKredit).
 *
 *  VÝSTUPNÍ KANÁLY (nezávisle konfigurovatelné):
 *  ──────────────────────────────────────────────
 *  Skript má tři výstupní kanály, z nichž každý lze samostatně
 *  zapnout nebo vypnout v konfiguraci:
 *    - Google Sheet (SHEET_ENABLED) — historie jídelníčku v tabulce
 *    - Google Chat  (CHAT_ENABLED)  — denní menu jako zpráva v chatu
 *    - E-mail       (EMAIL_MODE)    — notifikace o výsledku stažení
 *
 *  RETRY LOGIKA:
 *  ─────────────
 *  Pokud první pokus (~10:45) neuspěje (menza ještě nenahrála menu),
 *  odešle do Google Chatu zprávu s odkazem na web jídelníčku
 *  a Google Sheet (aby si kolegové mohli oběd zapsat ručně).
 *  Druhý pokus (~12:00) zkusí stáhnout znovu. Pokud ani ten
 *  neuspěje, odešle e-mail o neúspěchu. Pokud první pokus uspěl,
 *  druhý vidí, že data už jsou zapsaná a nic nedělá.
 *
 *  SETUP (první nasazení):
 *  ───────────────────────
 *  1. Otevři Google Sheet → Rozšíření → Apps Script
 *  2. Vlož celý tento kód (nahraď výchozí obsah)
 *  3. Uprav sekci UŽIVATELSKÁ KONFIGURACE níže (e-mail, časy apod.)
 *  4. Pro Google Chat: v cílovém prostoru vytvoř webhook
 *     (Nastavení → Integrace → Webhooky) a vlož URL do CHAT_WEBHOOKS
 *  5. Spusť funkci  setupTriggers()  jednou ručně (▶ Run)
 *     → Google požádá o povolení (přístup k sheetu, e-mailu, internetu)
 *  6. Hotovo — od teď se menu stahuje automaticky.
 *
 *  RUČNÍ TEST:   spusť  manualRun()    — okamžitě stáhne a zapíše
 *  RESET:        spusť  removeTriggers() — vypne automatické spouštění
 *
 *  POZNÁMKA K TRIGGERŮM:
 *  Po jakékoliv změně časů v konfiguraci (TRIGGER_1, TRIGGER_2)
 *  je potřeba znovu spustit setupTriggers(), aby se staré triggery
 *  nahradily novými. Samotná změna čísla v konfiguraci nestačí.
 * ═══════════════════════════════════════════════════════════════════
 */


/* ┌─────────────────────────────────────────────────────────────────┐
   │  UŽIVATELSKÁ KONFIGURACE — uprav dle potřeby                   │
   │                                                                 │
   │  Toto je jediná část, kterou bys měl(a) upravovat.             │
   │  Vše ostatní níže je logika skriptu — funguje sama.            │
   └─────────────────────────────────────────────────────────────────┘ */

const USER = {
  // Název listu (tabu) v Google Sheetu, kam se zapisuje historie.
  // Pokud list s tímto názvem neexistuje, skript ho automaticky vytvoří.
  SHEET_NAME:     'Jídlog 👨‍🍳',

  // Kolik dnů historie uchovávat. Starší záznamy se při každém
  // spuštění automaticky mažou. Např. 10 = posledních 10 prac. dnů.
  MAX_DAYS:       10,

  // ID menzy ve WebKredit systému UTB.
  // 3 = hlavní menza. Jiné menzy mají jiná čísla.
  CANTEEN_ID:     3,

  // Příjemci e-mailových notifikací.
  // Více příjemců se odděluje čárkou BEZ mezer:
  //   'jan@firma.cz,petra@firma.cz,karel@firma.cz'
  EMAIL:          'bohumil.jurencak@blogic.cz',

  // Kdy posílat e-mail:
  //   'both'    = při úspěchu i neúspěchu (doporučeno)
  //   'failure' = jen když se stažení nezdaří
  //   'success' = jen když se stažení podaří
  //   'none'    = žádné maily (tiché zpracování)
  EMAIL_MODE:     'both',

  // ── Výstupní kanály ─────────────────────────────────────────────
  // Každý kanál lze nezávisle zapnout (true) nebo vypnout (false).

  // Zápis do Google Sheetu (list Jídlog).
  // Pokud nepotřebuješ historii v sheetu a chceš jen notifikace,
  // nastav na false.
  SHEET_ENABLED:  true,

  // Odesílání denního menu do Google Chat prostoru/prostorů.
  // Zpráva obsahuje přehledný seznam jídel s kategoriemi.
  CHAT_ENABLED:   true,

  // Webhook URL pro Google Chat prostory.
  // Každý prostor má svůj vlastní webhook — vytvoříš ho v:
  //   Google Chat → prostor → Nastavení (⚙) → Integrace → Webhooky
  // Webhook URL má tvar:
  //   https://chat.googleapis.com/v1/spaces/XXXXX/messages?key=...&token=...
  //
  // Můžeš zadat více webhooků (= posílat do více prostorů najednou):
  //   ['https://chat.googleapis.com/...webhook1...', 'https://chat.googleapis.com/...webhook2...']
  CHAT_WEBHOOKS:  [
    'https://chat.googleapis.com/v1/spaces/AAQAzZSZw0E/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=IUjrHzBMdbZN2V1JOTwj79zaNPU4XWJdijxWG2Ko8Pw',
  ],

  // Časy automatického spouštění — [hodina, minuta].
  // TRIGGER_1 = první pokus, TRIGGER_2 = záložní pokus (retry).
  // Minuty mohou být jen: 0, 15, 30 nebo 45 (omezení Google).
  // Po změně je nutné znovu spustit setupTriggers()!
  TRIGGER_1:      [10, 45],   // ~10:45 — první pokus
  TRIGGER_2:      [12, 0],    // ~12:00 — záložní pokus

  // Časová zóna — ovlivňuje triggery, formátování datumů i víkend-check.
  // Pro ČR/SR ponech 'Europe/Prague'.
  TIMEZONE:       'Europe/Prague',

  // Odkaz na webový jídelníček — vkládá se do notifikačního e-mailu
  // a do Google Chat zprávy při neúspěšném stažení.
  MENZA_WEB_URL:  'https://jidelnicek.utb.cz/webkredit/Ordering/Menu?canteen=3',

  // Přímý odkaz na Google Sheet pro zápis obědů — zobrazuje se v chat
  // notifikaci při neúspěchu, aby si kolegové mohli oběd zapsat ručně.
  // Může jít o jiný sheet, než ve kterém běží tento Apps Script.
  OBEDY_SHEET_URL:      'https://docs.google.com/spreadsheets/d/1KVMtzJoIpkMxiAPgm3qg3o-pSlWsDO9TQWTS_X4GbzE/edit?gid=1704001489#gid=1704001489',

  // Písmo pro celý list (název fontu z Google Fonts / systémových fontů).
  // Příklady: 'Proxima Nova', 'Arial', 'Roboto', 'Open Sans'
  FONT_FAMILY:    'Proxima Nova',

  // Barvy a styl řádků v sheetu — rozlišení podle data.
  // Aktuální den je výrazně zvýrazněný, starší dny se střídají ve dvou
  // odstínech šedé pro lepší vizuální oddělení.
  COLORS: {
    // Hlavička tabulky (první řádek)
    header_bg:    '#1e400f',   // hlavička: tmavě zelené pozadí
    header_font:  '#FFFFFF',   // hlavička: bílý text
    header_weight:'bold',      // hlavička: tučný text ('bold' / 'normal')

    // Dnešní den (aktuální jídelníček)
    today_bg:     '#2E7D32',   // dnešek: tmavě zelené pozadí
    today_font:   '#FFFFFF',   // dnešek: bílá barva textu
    today_weight: 'bold',      // dnešek: tučný text ('bold' / 'normal')

    // Starší dny (historie) — střídají se dva odstíny pro oddělení dnů
    gray_1:       '#F5F5F5',   // lichý den: světle šedá
    gray_2:       '#E0E0E0',   // sudý den: tmavší šedá
    old_font:     '#000000',   // starší dny: černá barva textu
    old_weight:   'normal',    // starší dny: netučný text ('bold' / 'normal')
  },

  // Styl textu v Google Chat zprávě (denní menu).
  // Každý prvek má stejné 4 vlastnosti:
  //   color  — barva textu (hex kód, např. '#000000')
  //   weight — tučnost ('bold' / 'normal')
  //   italic — kurzíva (true / false)
  //   font   — název fontu (např. 'Proxima Nova', 'Lobster', '')
  //            Prázdný řetězec '' = výchozí font Google Chatu.
  CHAT_STYLE: {
    // Názvy sekcí/kategorií (Polévky, Obědy, Minutky…)
    section: { color: '#000000', weight: 'bold',   italic: false, font: 'Proxima Nova' },

    // Název jídla
    food:    { color: '#000000', weight: 'bold',   italic: false, font: 'Proxima Nova' },

    // Cena (studentská)
    price:   { color: '#5D4037', weight: 'normal', italic: true,  font: '' },
  },
};


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
};


/* ══════════════════════════════════════════════════════════════════
   HLAVNÍ FUNKCE
   ─────────────
   Toto je „mozek" celého skriptu. Spouští se automaticky
   v nastavených časech (triggery) nebo ručně přes manualRun().
   Koordinuje všechny kroky: kontrola dne, stažení, zápis, úklid.
   ══════════════════════════════════════════════════════════════════ */

function fetchAndSaveMenu() {
  // Zjisti aktuální datum a den v týdnu (v české časové zóně)
  var now        = new Date();
  var todayStr   = Utilities.formatDate(now, USER.TIMEZONE, 'yyyy-MM-dd');
  var dow        = getDayOfWeek_(now);   // 0 = Ne, 1 = Po, … 6 = So
  var currentHr  = parseInt(Utilities.formatDate(now, USER.TIMEZONE, 'HH'));

  // Zjisti, jestli jsme v „retry" fázi (= po prvním neúspěšném pokusu).
  // Pokud aktuální hodina je blíž k druhému triggeru, jsme v retry.
  var midpoint   = Math.floor((USER.TRIGGER_1[0] + USER.TRIGGER_2[0]) / 2);
  var isRetry    = currentHr >= midpoint;

  // O víkendu menza nevaří → přeskoč (a neposílej žádný mail)
  if (dow === 0 || dow === 6) {
    Logger.log('Víkend (' + INTERNAL.DAY_NAMES[dow] + ') — přeskakuji.');
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

  // Kontrola duplicit: pokud pro dnešek už máme data, nic neděláme.
  // To nastane, když první trigger (~10:45) uspěl a teď běží druhý (~12:00).
  // Kontrolujeme i při vypnutém sheetu — duplikát znamená, že Chat
  // zpráva už byla také odeslána.
  if (isTodayAlreadySaved_(sheet, todayStr)) {
    Logger.log('Menu pro ' + todayStr + ' již existuje — přeskakuji.');
    return;
  }

  // Připoj se k WebKredit API a stáhni dnešní jídelníček
  var menuItems = fetchMenuFromAPI_(todayStr);

  // Pokud API nevrátilo žádná jídla…
  if (!menuItems || menuItems.length === 0) {
    Logger.log('Menu pro ' + todayStr + ' není dostupné.');

    if (!isRetry) {
      // První pokus (~10:45) neuspěl → pošleme info do Google Chatu,
      // aby kolegové věděli, že se mají podívat na web a zapsat si ručně.
      // E-mail zatím neposíláme (ještě přijde retry ve ~12:00).
      sendFailureToChat_(todayStr, dow);
    } else {
      // Retry (~12:00) také neuspěl → pošleme e-mail o neúspěchu.
      // Chat notifikace už šla při prvním pokusu.
      sendNotification_(false, todayStr, null, ss.getUrl());
    }
    return;
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

  // ── Výstup 2: Odeslání do Google Chatu (pokud je zapnutý) ──
  sendToGoogleChat_(menuItems, todayStr, dow);

  // ── Výstup 3: E-mail s výsledkem (pokud je notifikace zapnutá) ──
  sendNotification_(true, todayStr, menuItems, ss.getUrl());

  Logger.log('✅ Zpracování dokončeno pro ' + todayStr + ' (' + menuItems.length + ' položek)');
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
 */
function applyDateFormatting_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;   // jen hlavička, nic k formátování

  var numCols  = INTERNAL.HEADERS.length;
  var todayStr = Utilities.formatDate(new Date(), USER.TIMEZONE, 'yyyy-MM-dd');

  // Nastav font pro celý datový rozsah (jednotný vzhled)
  var allData = sheet.getRange(2, 1, lastRow - 1, numCols);
  allData.setFontFamily(USER.FONT_FAMILY);

  // Přečti všechna data ze sloupce A (každý řádek = jedno jídlo)
  var dateVals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  // Projdi řádky, seskup je podle data a přiřaď barvy
  var lastDate   = null;    // poslední zpracované datum
  var grayToggle = 0;       // střídání dvou odstínů šedé (0/1)

  for (var i = 0; i < dateVals.length; i++) {
    var row = i + 2;   // řádek v sheetu (1 = hlavička)
    var range = sheet.getRange(row, 1, 1, numCols);

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

    if (ds === todayStr) {
      // Dnešek: zvýrazněný (výchozí: tmavě zelené pozadí, bílý tučný text)
      range.setBackground(USER.COLORS.today_bg);
      range.setFontColor(USER.COLORS.today_font);
      range.setFontWeight(USER.COLORS.today_weight);
    } else {
      // Starší dny: střídavě dva odstíny šedé
      var bg = grayToggle === 0 ? USER.COLORS.gray_1 : USER.COLORS.gray_2;
      range.setBackground(bg);
      range.setFontColor(USER.COLORS.old_font);
      range.setFontWeight(USER.COLORS.old_weight);
    }
  }

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
    var cenaSTU      = item.price  != null ? Math.ceil(item.price)  : '';
    var cenaPlna     = item.price2 != null ? Math.ceil(item.price2) : '';
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
   ZÁPIS DO SHEETU
   ────────────────
   Nová data se vkládají hned pod hlavičku (řádek 2),
   takže nejnovější den je vždy nahoře. Starší záznamy
   se tím automaticky posouvají dolů.
   ══════════════════════════════════════════════════════════════════ */

function writeMenuRows_(sheet, menuItems, todayStr, dow, now) {
  // Připrav české jméno dne (Po, Út, St…) a timestamp stažení
  var dayName   = INTERNAL.DAY_NAMES[dow];
  var timestamp = Utilities.formatDate(now, USER.TIMEZONE, 'dd.MM.yyyy, HH:mm');

  // Každé jídlo = jeden řádek v tabulce
  var rows = menuItems.map(function(item) {
    return [
      todayStr,         // A: Datum (2026-04-14)
      dayName,          // B: Den (Po)
      item.kategorie,   // C: Kategorie (polévka / oběd / …)
      item.cislo,       // D: Číslo (1, o1, m1…)
      item.name,        // E: Název jídla
      item.cena_stu,    // F: Cena studentská/zaměstnanecká (Kč)
      item.cena_plna,   // G: Cena plná (pro veřejnost/externisty)
      timestamp,        // H: Kdy proběhlo stažení (13.04.2026, 09:34)
    ];
  });

  // Vlož nové řádky pod hlavičku (posunou se stávající data dolů)
  sheet.insertRowsAfter(1, rows.length);
  var range = sheet.getRange(2, 1, rows.length, INTERNAL.HEADERS.length);
  range.setValues(rows);

  // Nastavení formátování: datum, zarovnání sloupců
  sheet.getRange(2, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, 5, rows.length, 1).setHorizontalAlignment('left');    // E: Jídlo doleva
  sheet.getRange(2, 6, rows.length, 2).setHorizontalAlignment('center');  // F+G: ceny na střed
  sheet.getRange(2, 8, rows.length, 1).setHorizontalAlignment('center');  // H: timestamp na střed
  range.setVerticalAlignment('middle');

  // Poznámky (notes) s přesnou cenou z API — zobrazí se po najetí myší.
  // Cena je formátovaná na 2 desetinná místa s čárkou (český formát).
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


/* ══════════════════════════════════════════════════════════════════
   ÚKLID STARÝCH ZÁZNAMŮ
   ──────────────────────
   Po každém zápisu se skript podívá, jestli v sheetu nejsou
   záznamy starší než USER.MAX_DAYS dnů. Pokud ano, smaže je.
   Díky tomu se sheet nerozrůstá donekonečna.
   ══════════════════════════════════════════════════════════════════ */

function pruneOldEntries_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;   // jen hlavička, nic k mazání

  // Vypočítej hraniční datum (dnes minus MAX_DAYS)
  var cutoff    = new Date();
  cutoff.setDate(cutoff.getDate() - USER.MAX_DAYS);
  var cutoffStr = Utilities.formatDate(cutoff, USER.TIMEZONE, 'yyyy-MM-dd');

  // Přečti všechna data ze sloupce A
  // (data jsou od nejnovějšího nahoře → staré jsou na konci)
  var dateVals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  // Najdi první řádek, který je starší než hraniční datum
  var firstOldIdx = -1;
  for (var i = 0; i < dateVals.length; i++) {
    var ds;
    if (dateVals[i][0] instanceof Date) {
      ds = Utilities.formatDate(dateVals[i][0], USER.TIMEZONE, 'yyyy-MM-dd');
    } else {
      ds = String(dateVals[i][0]);
    }
    if (ds < cutoffStr) {
      firstOldIdx = i;
      break;   // vše odtud dolů je starší → smazat
    }
  }

  // Smaž všechny řádky od nalezeného místa až do konce
  if (firstOldIdx >= 0) {
    var startRow = firstOldIdx + 2;   // +1 hlavička, +1 protože indexujeme od 0
    var count    = lastRow - startRow + 1;
    if (count > 0) {
      sheet.deleteRows(startRow, count);
      Logger.log('Smazáno ' + count + ' starých řádků.');
    }
  }
}


/* ══════════════════════════════════════════════════════════════════
   POMOCNÁ FUNKCE — den v týdnu
   ─────────────────────────────
   Vrací číslo dne v týdnu (0 = neděle, 1 = pondělí, … 6 = sobota)
   pro českou časovou zónu. Řeší správně i přechod letní/zimní čas.
   ══════════════════════════════════════════════════════════════════ */

function getDayOfWeek_(date) {
  var dateStr = Utilities.formatDate(date, USER.TIMEZONE, 'yyyy-MM-dd');
  var parts   = dateStr.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getDay();
}

/**
 * Zformátuje číslo na 2 desetinná místa s čárkou (český formát).
 * Příklad: 83.5 → "83,50",  19 → "19,00",  114.333 → "114,33"
 */
function formatPrice_(value) {
  return value.toFixed(2).replace('.', ',');
}


/* ══════════════════════════════════════════════════════════════════
   NASTAVENÍ TRIGGERŮ (automatické spouštění)
   ──────────────────────────────────────────
   Triggery = časovače, které říkají Google „spusť tuto funkci
   každý den v daný čas". Nastavují se jednorázově.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Vytvoří dva denní triggery podle časů v konfiguraci.
 *
 * ▶ Spusť tuto funkci JEDNOU ručně z Apps Script editoru.
 *   Při prvním spuštění Google požádá o povolení přístupu
 *   k sheetu, e-mailu a internetu — stačí jednou odsouhlasit.
 *
 * Pokud triggery už existují, nejdřív je smaže a vytvoří nové
 * (bezpečné pro opakované spouštění).
 */
function setupTriggers() {
  // Odstraň případné staré triggery pro tuto funkci
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'fetchAndSaveMenu') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Trigger 1 — první pokus (výchozí ~10:45)
  ScriptApp.newTrigger('fetchAndSaveMenu')
    .timeBased()
    .everyDays(1)
    .atHour(USER.TRIGGER_1[0])
    .nearMinute(USER.TRIGGER_1[1])
    .inTimezone(USER.TIMEZONE)
    .create();

  // Trigger 2 — záložní pokus / retry (výchozí ~12:00).
  // Pokud první trigger uspěl, tento se spustí, ale díky kontrole
  // duplicit zjistí, že data už jsou, a tiše skončí.
  ScriptApp.newTrigger('fetchAndSaveMenu')
    .timeBased()
    .everyDays(1)
    .atHour(USER.TRIGGER_2[0])
    .nearMinute(USER.TRIGGER_2[1])
    .inTimezone(USER.TIMEZONE)
    .create();

  Logger.log('✅ Triggery nastaveny: ~' +
    USER.TRIGGER_1[0] + ':' + String(USER.TRIGGER_1[1]).padStart(2, '0') + ' a ~' +
    USER.TRIGGER_2[0] + ':' + String(USER.TRIGGER_2[1]).padStart(2, '0') +
    ' (' + USER.TIMEZONE + ')');
}

/**
 * Odstraní všechny triggery tohoto skriptu.
 * Po spuštění se skript přestane automaticky spouštět.
 * Chceš-li ho znovu zapnout, spusť setupTriggers().
 */
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });
  Logger.log('Všechny triggery odstraněny.');
}


/* ══════════════════════════════════════════════════════════════════
   E-MAILOVÉ NOTIFIKACE
   ─────────────────────
   Po každém pokusu o stažení (úspěšném i neúspěšném) může
   skript odeslat e-mail. Chování řídí USER.EMAIL_MODE.
   E-mail obsahuje výsledek, seznam jídel (při úspěchu)
   a přímé odkazy na Google Sheet a web WebKredit.
   ══════════════════════════════════════════════════════════════════ */

function sendNotification_(success, todayStr, menuItems, sheetUrl) {
  // Zjisti, jestli se podle nastavení má mail vůbec posílat
  var mode = (USER.EMAIL_MODE || 'both').toLowerCase();
  if (mode === 'none') return;                       // maily vypnuté
  if (mode === 'success' && !success) return;        // chceme jen úspěch, ale toto je neúspěch
  if (mode === 'failure' && success) return;          // chceme jen neúspěch, ale toto je úspěch

  // Sestav předmět e-mailu (s emoji pro rychlou vizuální orientaci)
  var emoji   = success ? '\u2705' : '\u274C';       // ✅ nebo ❌
  var subject = emoji + ' Jídelníček UTB \u2014 ' + todayStr;

  // Sestav tělo e-mailu
  var body = '';

  if (success) {
    // Úspěch: seznam stažených jídel
    body += 'Menu pro ' + todayStr + ' bylo úspěšně uloženo (' + menuItems.length + ' položek).\n\n';
    body += formatMenuForEmail_(menuItems);
  } else {
    // Neúspěch: informace o selhání a možné příčiny
    body += 'Menu pro ' + todayStr + ' se nepodařilo stáhnout.\n';
    body += 'Oba pokusy (~' + USER.TRIGGER_1[0] + ':' + String(USER.TRIGGER_1[1]).padStart(2, '0') +
             ' i ~' + USER.TRIGGER_2[0] + ':' + String(USER.TRIGGER_2[1]).padStart(2, '0') +
             ') skončily bez výsledku.\n\n';
    body += 'Možné příčiny:\n';
    body += '  - WebKredit API je nedostupné\n';
    body += '  - Menza dnes nemá nabídku (svátek, prázdniny)\n';
    body += '  - Jídelníček ještě nebyl nahrán\n';
  }

  // Přidej odkazy na sheet a jídelníček
  body += '\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n';
  body += '\uD83D\uDCCA  Google Sheet:  ' + sheetUrl + '\n';
  body += '\uD83C\uDF5D  WebKredit:     ' + USER.MENZA_WEB_URL + '\n';

  // Odešli mail na všechny příjemce (oddělené čárkou v USER.EMAIL)
  MailApp.sendEmail({
    to:      USER.EMAIL,
    subject: subject,
    body:    body,
  });

  Logger.log('E-mail odeslán na ' + USER.EMAIL + ' (' + (success ? 'úspěch' : 'neúspěch') + ')');
}

/**
 * Připraví čitelný text s menu pro e-mail.
 * Jídla jsou seskupená podle kategorie s cenami.
 *
 * Příklad výstupu:
 *   POLÉVKA
 *     Gulášová — 19/32 Kč
 *
 *   OBĚD
 *     1. Krůtí medailonky — 95 Kč
 *     2. Cizrnové kari — 86 Kč
 *
 *   MINUTKY
 *     m1. Smažený řízek — 110/139 Kč
 *
 *   PIZZA
 *     p1. Margherita — 89/115 Kč
 */
function formatMenuForEmail_(menuItems) {
  var lines        = [];
  var lastCategory = '';

  for (var i = 0; i < menuItems.length; i++) {
    var item = menuItems[i];

    // Při změně kategorie vložíme nadpis (POLÉVKA, OBĚD…)
    if (item.kategorie !== lastCategory) {
      if (lines.length > 0) lines.push('');   // prázdný řádek jako oddělení
      lines.push(item.kategorie.toUpperCase());
      lastCategory = item.kategorie;
    }

    // Pořadové číslo (pokud má — polévka nemá)
    var prefix = item.cislo ? (item.cislo + '. ') : '';

    // Cena: pokud existuje i plná cena, zobrazí se jako STU/plná Kč
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
   GOOGLE CHAT — ODESÍLÁNÍ DENNÍHO MENU
   ──────────────────────────────────────
   Pošle denní menu jako zprávu do Google Chat prostoru/prostorů
   přes webhook(y). Zpráva je ve formátu seznamu s kategoriemi:

     🍽️ Jídelníček – Po 13. dubna

     🥣 *Polévky*
       po1 – Gulášová polévka · 28 Kč
       po2 – Vývar s nudlemi · 22 Kč

     🍛 *Obědy*
       1 – Smažený řízek · 84 Kč
       …

   Pokud je CHAT_ENABLED vypnutý (false), nic se neodesílá.
   Pokud webhook URL není nastavený, zapíše varování do logu.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Odešle denní menu do všech nakonfigurovaných Google Chat prostorů.
 *
 * @param {Object[]} menuItems — pole jídel (výstup z parseItems_)
 * @param {string}   todayStr  — datum ve formátu yyyy-MM-dd
 * @param {number}   dow       — den v týdnu (0=Ne, 1=Po, … 6=So)
 */
function sendToGoogleChat_(menuItems, todayStr, dow) {
  // Kontrola: je Chat výstup zapnutý?
  if (!USER.CHAT_ENABLED) return;

  // Kontrola: jsou nastavené webhooky?
  var webhooks = USER.CHAT_WEBHOOKS || [];
  if (webhooks.length === 0 ||
      (webhooks.length === 1 && webhooks[0] === 'SEM_VLOŽ_WEBHOOK_URL_Z_GOOGLE_CHAT')) {
    Logger.log('⚠️ CHAT_WEBHOOKS nejsou nastavené — zpráva do Google Chatu nebyla odeslána.');
    return;
  }

  // Sestav card payload s menu a hyperlinky
  var cardPayload = formatMenuForChat_(menuItems, todayStr, dow);

  // Odešli do všech nakonfigurovaných prostorů
  sendChatPayload_(webhooks, cardPayload, 'menu');
}

/**
 * Odešle do Google Chatu informaci, že se jídelníček nepodařilo stáhnout.
 * Zpráva obsahuje odkaz na webový jídelníček a Google Sheet (jako klikací
 * hyperlinky), aby si uživatelé mohli oběd vybrat a zapsat ručně.
 *
 * Používá formát „cards v2", který umožňuje HTML hypertextové odkazy
 * (na rozdíl od prostého textu, kde by se zobrazily jen surové URL).
 */
function sendFailureToChat_(todayStr, dow) {
  if (!USER.CHAT_ENABLED) return;

  var webhooks = USER.CHAT_WEBHOOKS || [];
  if (webhooks.length === 0 ||
      (webhooks.length === 1 && webhooks[0] === 'SEM_VLOŽ_WEBHOOK_URL_Z_GOOGLE_CHAT')) {
    return;
  }

  // Sestav české datum pro zprávu (např. "Po 14. dubna")
  var dateText = formatCzechDate_(todayStr, dow);

  // Zpráva jako card s HTML hyperlinky a dnešním datem
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
 * Pomocná funkce: odešle JSON payload do všech Chat webhooků.
 * Používají ji sendToGoogleChat_ (úspěch) i sendFailureToChat_ (neúspěch).
 *
 * @param {string[]} webhooks — pole webhook URL
 * @param {Object}   payload  — JSON objekt k odeslání
 * @param {string}   label    — popis pro log ('menu' / 'failure')
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

/**
 * Zformátuje menu pro Google Chat jako cards v2 payload.
 * Používá HTML pro formátování (tučné, hyperlinky).
 *
 * Výsledná karta:
 *   Záhlaví: 🍽️ Jídelníček – Po 13. dubna
 *   Tělo:    seznam jídel s kategoriemi (HTML)
 *   Patička: 📋 Menza (hyperlink)  ✏️ Zápis obědů (hyperlink)
 *
 * @param {Object[]} menuItems — pole jídel
 * @param {string}   todayStr  — datum yyyy-MM-dd
 * @param {number}   dow       — den v týdnu
 * @return {Object}  cards v2 payload pro Google Chat webhook
 */
function formatMenuForChat_(menuItems, todayStr, dow) {
  // Emoji a názvy pro každou kategorii
  var CAT_LABELS = {
    'polévka':       { emoji: '🥣', label: 'Polévky' },
    'oběd':          { emoji: '🍛', label: 'Obědy' },
    'oběd ostatní':  { emoji: '🍲', label: 'Obědy ostatní' },
    'minutky':       { emoji: '⏳', label: 'Minutky' },
    'pizza':         { emoji: '🍕', label: 'Pizza' },
  };

  // České datum pro záhlaví
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

    // Název jídla a cena — styl z konfigurace
    var foodHtml  = styleChatText_(item.name, USER.CHAT_STYLE.food);
    var pricePart = item.cena_stu !== ''
      ? ' · ' + styleChatText_(item.cena_stu + ' Kč', USER.CHAT_STYLE.price)
      : '';

    html += '  ' + item.cislo + ' – ' + foodHtml + pricePart + '<br>';
  }

  // Řádek s odkazy: 📋 Menza  ✏️ Zápis obědů
  html += '<br>📋 <a href="' + USER.MENZA_WEB_URL + '">Menza</a>' +
          '  ✏️ <a href="' + USER.OBEDY_SHEET_URL + '">Zápis obědů</a>' +
          '<br><br><font size="1"><i>Za správnost jídelníčku a cen nikdo neručí. Za zápis obědů odpovídá každý jedlík sám — cenu si prosím ověř.</i></font>';

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
 * Pomocná funkce: převede datum na český formát "Po 13. dubna".
 *
 * @param {string} todayStr — datum yyyy-MM-dd
 * @param {number} dow      — den v týdnu (0=Ne … 6=So)
 * @return {string} české datum
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
 * Pomocná funkce: obalí text HTML tagy podle konfigurace stylu.
 * Každý styl má 4 vlastnosti: color, weight, italic, font.
 *
 * @param {string} text  — text k formátování
 * @param {Object} style — objekt {color, weight, italic, font}
 * @return {string} HTML řetězec
 */
function styleChatText_(text, style) {
  var html = text;
  if (style.weight === 'bold') html = '<b>' + html + '</b>';
  if (style.italic) html = '<i>' + html + '</i>';
  var fontAttr = style.font ? ' face="' + style.font + '"' : '';
  return '<font color="' + style.color + '"' + fontAttr + '>' + html + '</font>';
}


/* ══════════════════════════════════════════════════════════════════
   RUČNÍ SPUŠTĚNÍ
   ──────────────
   Pro testování nebo okamžité stažení. Spusť z editoru (▶ Run)
   a skript okamžitě provede vše — stáhne, zapíše, pošle mail.
   ══════════════════════════════════════════════════════════════════ */

function manualRun() {
  fetchAndSaveMenu();
}
