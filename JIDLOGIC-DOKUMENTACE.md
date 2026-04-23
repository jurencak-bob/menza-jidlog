# Jídlogic — Dokumentace projektu

**Webová aplikace pro výběr a evidenci obědů**
Autor: Bob (blogic.cz) | Platforma: Google Apps Script | Stav: produkce (duben 2026)

---

## Přehled

Jídlogic je webová aplikace běžící na Google Apps Script, která umožňuje zaměstnancům blogic.cz vybírat si obědy z jídelníčku menzy UTB, evidovat útratu a spravovat kredit na sdílené stravenské kartě. Aplikace je součástí většího projektu **Menza jídelníček** (JídLOG), který stahuje jídelníček z webu menzy a publikuje ho přes Google Chat notifikace a ICS kalendář.

### Hlavní funkce

- **Datepicker** s klasifikací dnů (pracovní / víkend / svátek / odstávka / jídelníček ještě nebyl stažen) — autoritativně generovaný serverem při každém requestu
- **Zápis oběda**: standardně + / − tlačítky, **quick-pick** kliknutím na pill čísla jídla
- **Polévky** se neúčastní quick-picku (jsou doplněk k obědu, ne náhrada) — disabled pill + tooltip
- **Kredit**: dobíjení, korekce cílovou částkou (ne delta), zobrazení v side-menu hlavičce
- **Sdílená karta**: asynchronní propis do externího sheetu přes frontu + jednorázový trigger
- **Intro modál** s autorizačním guardem (@blogic.cz) + dismissable host banner (UserProperties)
- **PWA** (Add to Home Screen) přes wrapper na GitHub Pages
- **Mobile-first UX**: swipe mezi dny, pull-to-refresh, responsivní datum + badges + cena nad qty
- **Sync badge** v hlavičce (sync ok / syncing / sync error) s tooltipem; při syncing a sync error se pod hlavičkou zobrazí full-width informační pruh s detailem (ETA odpočet, důvod selhání, tlačítko „Rozumím, vyčistit")
- **Storno = přepsání** řádků ve Výběr obědů (model B — Kredit obsahuje jen příjmy, výdaje sumou)
- **Kvartální archivace** (`archivujKvartal_`) + měsíční e-mailová připomínka
- **Light/dark režim** (localStorage), animované loading overlay s jídly

---

## Architektura

```
┌───────────────────────────────────────────────────────────┐
│              Google Apps Script (Menza project)          │
│                                                          │
│   Menza.feed.gs             obedy.gs                     │
│   ┌──────────────┐          ┌──────────────────────┐     │
│   │ doGet()      │          │ obedyNactiData()     │     │
│   │ ?app=obedy → │────────▶ │ obedyUlozVyber()     │     │
│   │   Obedy.html │          │ obedyDobijKredit()   │     │
│   │              │          │ obedyUlozKorekci()   │     │
│   │ loadConfig_()│────▶ USER│ obedyNactiKreditPro  │     │
│   │ nactiMenuPro │          │   Frontend()         │     │
│   │   Web()      │          │ obedyPotvrdIntro()   │     │
│   │ ceskyStatni  │          │ obedySkryjHostBanner()│    │
│   │   Svatek_()  │          │ obedyStavFronty()    │     │
│   │ velikonocni  │          │ obedyDiagnostika     │     │
│   │   Nedele_()  │          │   Fronty()           │     │
│   └──────────────┘          │ obedyVynutZpracovani │     │
│                             │   Fronty()           │     │
│   ┌──────────────┐          └──────────┬───────────┘     │
│   │ ICS feed     │                     │                 │
│   │ GitHub Pages │          ┌──────────▼───────────┐     │
│   └──────────────┘          │   Sheets API         │     │
│                             │   • Výběr obědů 🍽️   │     │
│                             │   • Kredit           │     │
│                             │   • Uživatelé        │     │
│                             │   • Jídlog 👨‍🍳      │     │
│                             │   • ⚙️ Konfigurace   │     │
│                             │   • Ext. sheet ─────────▶ Zápisový sheet
│                             └──────────────────────┘     │
│                                                          │
│   ┌──────────────┐                                       │
│   │ Obedy.html   │  SPA; google.script.run ──────────────│
│   │ ~4 500 ř.    │                                       │
│   └──────────────┘                                       │
└───────────────────────────────────────────────────────────┘
```

PWA wrapper: `index.html` + `manifest.json` + `sw.js` na GitHub Pages (`jurencak-bob/menza-jidlog`) obtáčí GAS exec URL v iframe.

---

## Soubory

| Soubor | Řádků (~) | Popis |
|---|---:|---|
| `obedy.gs` | 2 400 | Backend: autorizace, CRUD, kredit, korekce, ext. sheet fronta, diagnostika |
| `Obedy.html` | 5 600 | Frontend: UI, CSS (light/dark + responsive), SPA logika, quick-pick, intro modal |
| `Help.html` | 130 | Obsah sekcí Nápovědy (include do Obedy.html přes `<?!= include('Help') ?>`) |
| `Menza.feed.gs` | 3 500 | Menu scraper, config, routing, klasifikace closed dnů, české svátky |
| `Dashboard.html` | 1 370 | JídLOG dashboard — uspaný, dostupný jen přes `?app=jidlog` |
| `index.html` + `sw.js` + `manifest.json` | — | PWA wrapper (GitHub Pages) |
| `icon.svg`, `icon-192.png`, `icon-512.png` | — | PWA ikony |

---

## Konfigurace

Veškerá konfigurace na listu **`⚙️ Konfigurace`** v hlavním Menza sheetu.

| Klíč | Výchozí | Popis |
|---|---|---|
| URL sheet obědů | *(prázdné)* | URL externího zápisového sheetu (včetně `#gid=...`) |
| Jídlogic — limit karty | 6 | Max jídel na sdíleném sheetu / den; po limitu plná cena |
| Jídlogic — editace zpětně (dní) | 5 | Kolik dní zpětně lze editovat výběr |
| Časové pásmo | Europe/Prague | Pro formátování dat |
| 1. pokus — hodina/minuta | 10:00 | Scraping TRIGGER_1 |
| Notifikace — hodina/minuta | 10:45 | TRIGGER_NOTIFY (kontrolní mail) |
| 2. pokus — hodina/minuta | 12:00 | Scraping TRIGGER_2 (fallback) |
| USER.EMAIL | *(volitelné)* | Správce — dostává notifikace o selhání propisu. Pokud prázdné, fallback na `Session.getEffectiveUser()` (owner GAS skriptu) přes helper `adminEmail_()` |
| CLOSURES | `[]` | Pole MM-DD rozsahů pro odstávky menzy |

**Načtení:**
- `loadConfig_()` v Menza.feed.gs → populuje globální `USER` objekt
- `najdiKonfiguracniList_(ss)` — tolerantní finder (fuzzy match) pro případ Unicode normalizace emoji v názvu listu (NFC vs NFD)
- `loadConfigCached_()` v obedy.gs — cachuje USER po 5 min
- `nactiObedyKonfiguraci_()` — bridge USER → OBEDY objekt v obedy.gs
- `diagnostikaListu()` — helper pro zjištění duplicitních nebo špatně pojmenovaných listů (vypíše do Logger names + char codes)

---

## Datový model — Google Sheets listy

### List `Uživatelé`

Mapování email → přezdívka v ext. sheetu + příznak aktivity. Identifikace v Jídlogic = email; displayové jméno se odvozuje z emailu přes `emailToNick_()` (křestní) a `emailToFullName_()` (celé jméno).

| Sloupec | Typ | Příklad |
|---|---|---|
| A: Email | string | bohumil.jurencak@blogic.cz |
| B: Přezdívka v zápisovém sheetu | string | Bob |
| C: Aktivní | ANO/NE | ANO |

Pouze uživatelé s **Aktivní = ANO** mají právo zapisovat. Ostatní z @blogic.cz mají host režim (jen čtení). Fresh read přes `najdiUzivateleFresh_()` ve všech write operacích — cache by jinak 5 min držela starý stav a deaktivovaný user by mohl dál zapisovat.

**Jak se hledá sloupec v ext. sheetu:** skript scanuje prvních ~10 řádků ext. sheetu a hledá buňku rovnou sloupci B listu Uživatelé (case-insensitive, trim). Pořadí sloupců v ext. sheetu může být libovolné. Pokud hlavička chybí → FATAL error + mail.

### List `Výběr obědů 🍽️`

Záznamy vybraných jídel po řádcích. 11 sloupců.

| Sloupec | Typ | Popis |
|---|---|---|
| A: Datum | date | yyyy-mm-dd |
| B: Čas zápisu | string | yyyy-mm-dd HH:mm |
| C: Email | string | identita zapisujícího |
| D: Kategorie | string | polévka, oběd, pizza, oběd ostatní, bez oběda |
| E: Č. jídla | string | „1", „pz2", „o1", `__BEZ_OBEDA__` (marker) |
| F: Název jídla | string | |
| G: Ks | number | počet kusů |
| H: Cena/ks (Kč) | number | |
| I: Celkem (Kč) | number | Ks × Cena/ks |
| J: Typ ceny | enum | studentská / plná |
| K: Poznámka | string | |

### List `Kredit`

Evidence **jen příjmů a korekcí** (model B, od 2026-04-19). Výdaje nejsou, počítají se sumou z Výběr obědů. 8 sloupců.

| Sloupec | Typ | Popis |
|---|---|---|
| A: Datum | date | datum operace |
| B: Čas | string | čas operace |
| C: Email | string | identita |
| D: Typ | enum | dobití / korekce / čerpání (uzávěrka) |
| E: Částka (Kč) | number | kladná (dobití), dle znaménka (korekce), záporná (uzávěrka) |
| F: Způsob | string | jen pro dobití (Na pokladně / Převodem / …) |
| G: Zůstatek (Kč) | number | *(nepoužívá se — počítá se programově)* |
| H: Poznámka | string | detail; pro korekci: `Korekce X → Y Kč — důvod` |

**Zůstatek** = `SUM(E v Kreditu)` − `SUM(I ve Výběr obědů)` → `spoctiZustatek_(ss, email)`.

**Korekce — model:**
- `obedyUlozKorekci(dayDate, targetAmount, reason)` — uživatel zadává **cílovou částku** (kolik zaplatil), NE delta.
- Backend spočítá `puvodni = suma I z Výběr obědů pro email+den`, pak `rozdil = targetAmount − puvodni`.
- **Přepíše** existující korekce pro ten den: smaže staré řádky v Kreditu (typ=korekce, email, dayDate) + appendne nový pokud `rozdil ≠ 0`.
- Důvod: mobilní klávesnice nenabízí „−", cílová částka je intuitivnější.

**Archivace — `archivujKvartal_(rok, kvartal, dryRun)`** (ručně z GAS editoru):
1. Sečte výdaje za kvartál per uživatel
2. Zapíše do Kreditu 1 řádek/uživatele s typem `čerpání (uzávěrka)` a zápornou sumou
3. Smaže zdrojové řádky z Výběr obědů
4. `dryRun=true` (default) → jen vypíše, co by udělal

**Automatická připomínka** — `posliPripomenkuArchivace_()` + měsíční trigger (1. den, 4:00). Běží každý měsíc, ale mail posílá jen leden/duben/červenec/říjen. Instalace přes `nainstalujTriggerArchivace()` (ručně 1×).

### Externí zápisový sheet (jiný soubor)

Sdílený sheet, kam se propisují útraty a dobíjení.

- **Řádky**: 1 řádek na každý den (sloupec A: datum — Date objekt nebo text „pátek 17.4")
- **Sloupce**: 1 sloupec na osobu — hlavička v prvních ~10 řádcích = přezdívka z listu Uživatelé
- **Hodnoty**: záporná částka za oběd (např. −86), kladná za dobití
- **Poznámky**: detail jídel + zapsal {Plné jméno} z appky Jídlogic + datum/čas

**Oběd** → zapíše se na daný den, `cell.setValue(-celkem)` **přepisuje** předchozí hodnotu (1 den = 1 oběd).
**Dobití** → zapíše se na řádek **předchozí neděle** (týdenní organizace karty), `cell.setValue(existing + amount)` **přičítá** (aby nesmazalo útraty).

### List `Jídlog 👨‍🍳` (USER.SHEET_NAME)

Stahuje Menza.feed.gs scraper z webu menzy UTB. 10 sloupců: Datum, Den, Kategorie, Č., Název, Cena STU, Cena plná, Alergeny, Tag, Staženo.

---

## Backend API (obedy.gs)

### Veřejné funkce (volané z frontendu přes `google.script.run`)

| Funkce | Parametry | Vrací | Popis |
|---|---|---|---|
| `obedyGetUser()` | — | `{email, nick, registered, avatarUrl}` | Legacy — info o uživateli |
| `obedyNactiData()` | — | viz níže | **Hlavní** data fetch — menu + výběry + kredit + user + config |
| `obedyUlozVyber(dayDate, items)` | `'yyyy-mm-dd', [{cislo, name, kategorie, ks, cenaKs, typCeny, poznamka}]` | `{ok, message, celkem}` | Uloží výběr jídel pro den (storno = přepíše) |
| `obedyDobijKredit(amount, method, dateStr)` | `number, string, 'yyyy-mm-dd'` | `{ok, balance}` | Nabití kreditu (zapíše na řádek předchozí neděle v ext. sheetu) |
| `obedyUlozKorekci(dayDate, targetAmount, reason)` | `'yyyy-mm-dd', number, string` | `{ok, puvodni, cilova, rozdil}` | Korekce — zadává se **cílová částka** |
| `obedyZustatekKreditu()` | — | `number` | Aktuální zůstatek |
| `obedyPocetPolevek(dayDate)` | `'yyyy-mm-dd'` | `number` | Počet polévek uživatele za den |
| `obedyNactiKreditProFrontend()` | — | `creditHistory[]` | Re-fetch creditHistory (po save operaci, update side-menu badge) |
| `obedyVerzeStavu()` | — | `string\|null` | Lightweight fingerprint uživatelových dat pro multi-device sync polling |
| `obedyPotvrdIntro()` | — | `{ok}` | Uloží „intro viděno" do UserProperties |
| `obedySkryjHostBanner()` | — | `{ok}` | Uloží „host banner zavřen" do UserProperties |
| `obedyStavFronty()` | — | `{pending, total, failed, lastError, lastAction, lastErrorAt, mailSent, mailTo, mailError, etaAt, now}` | Stav async fronty ext. sheetu (`pending` = jobů pro aktuálního uživatele, `total` = všechny joby ve frontě napříč uživateli) |
| `obedyResetChybuFronty()` | — | `{ok}` | Vymaže cache poslední FATAL chyby |

### `obedyNactiData` — response shape

```js
{
  blocked: false,               // true pro ne-blogic uživatele (modál zůstane)
  days: [{                      // kompletní range od nejstaršího v Menza sheetu po dneška
    date, dayName, items,
    closed, noService,
    reason, reasonMessage,      // pro closed dny: 'weekend'|'holiday'|'no-service'|'not-yet-loaded'
    holidayName,                // jen pro reason='holiday'
    reopenDate,                 // jen pro reason='no-service'
    fetchedAt,
  }],
  todayStr: 'yyyy-MM-dd',
  menzaUrl,
  user: {
    email, nick, registered, avatarUrl,
    introSeen: boolean,         // UserProperties — už klikl „Rozumím"
    guestBannerHidden: boolean, // UserProperties — host zavřel oranžový banner
  },
  cardStats: { 'yyyy-MM-dd': {people, meals, soups} },
  selections: { 'yyyy-MM-dd': [{cislo, ks}] },
  dailySums:  { 'yyyy-MM-dd': number },   // suma Celkem pro korekci (zobrazuje se „původní cena")
  creditHistory: [{ date, dateIso, type, amount, note }],
  closures: [['MM-DD', 'MM-DD'], ...],
  closureRanges: [{from, to}],
  config: { CARD_LIMIT, EDIT_DAYS_BACK },
  dashboardUrl, jidlogicUrl, pwaUrl, obedyUrl,
}
```

Funkce je obalená try/catch s `phase` trackingem — při chybě vrací `[obedyNactiData phase=<phase>] <msg>` + stack do Logger.

### Bezpečnostní gate

- **`jePovolenyEmail_(email)`** — regex `/@blogic\.cz$/i`. Prázdný email nebo jiná doména → false.
- V `obedyNactiData` → vrací `{blocked:true, user:{...}}` bez dat.
- Ve všech write/read endpointech (`obedyUlozVyber`, `obedyDobijKredit`, `obedyUlozKorekci`, `obedySkryjHostBanner`, `obedyPotvrdIntro`, `obedyNactiKreditProFrontend`, `obedyResetChybuFronty`, `obedyVerzeStavu`) → throw / return null.
- **Fresh read** přes `najdiUzivateleFresh_()` místo cachované varianty — kontroluje `Aktivní` stav okamžitě (bez 5 min prodlevy).

### UserProperties (per-Google-účet, persistent)

| Klíč | Hodnota | Čte | Zapisuje |
|---|---|---|---|
| `jidlogic_intro_seen_v1` | `'1'` | `introJizVidelUzivatel_()` | `obedyPotvrdIntro()` |
| `jidlogic_guest_banner_hidden_v1` | `'1'` | `hostBannerZavreny_()` | `obedySkryjHostBanner()` |

Proč UserProperties a ne localStorage: GAS HtmlService iframe má nestabilní origin (sandboxuje se); iOS Safari v PWA blokuje 3rd-party storage. UserProperties je per-account, cross-device. LocalStorage se používá jen jako rychlý fast-path cache.

### Klíčové interní funkce (výběr)

| Funkce | Popis |
|---|---|
| `najdiUzivatele_(email)` / `najdiUzivateleCached_` / `najdiUzivateleFresh_` | Lookup uživatele (cached vs fresh pro write ops) |
| `nactiVyberUzivatele_(ss, email)` | `{selections, sums}` — sums pro korekci |
| `nactiStatistiky_(ss)` | Per-den {people, meals, soups} napříč uživateli |
| `nactiKredit_(ss, email)` | Historie kreditu s dateIso pro frontend keyování |
| `smazVyberUzivatele_(sheet, email, dayDate)` | Batch přepis místo N×deleteRow (storno) |
| `spoctiZustatek_(ss, email)` | Zůstatek (SUM Kredit − SUM Výběr obědů) |
| `archivujKvartal_` / `posliPripomenkuArchivace_` | Kvartální uzávěrka + připomínka |
| `naplnujExtSheetZapis_` / `naplnujExtSheetDobiti_` | Enqueue do OBEDY_EXT_QUEUE |
| `naplanujExtSheetTrigger_(props)` | Vytvoří/obnoví one-shot trigger; detekce stale ETA |
| `zpracujExtSheetFrontu()` | Zpracuje frontu (LockService, retry 3×) |
| `zapisDoExternSheetu_` / `zapisDobitiDoExternSheetu_` | Fyzický write do ext. sheetu |
| `najdiSloupecProExtSheet_` | Najde sloupec podle hlavičky (scan prvních 10 řádků) |
| `posliMailSelhaniZapisu_(job, reason, action)` | FATAL notifikace uživateli + správci; ukládá do cache pro sync badge / info pruh |
| `obedyDiagnostikaFronty()` | Ruční — vypíše stav fronty, ETA, triggery |
| `obedyVynutZpracovaniFronty()` | Ruční — vynutí okamžité zpracování |

### Menza.feed.gs — klíčové funkce pro Jídlogic

| Funkce | Popis |
|---|---|
| `nactiMenuProWeb()` | Čte list Jídlog + generuje klasifikované closed dny |
| `klasifikujZavrenyDen_(dateStr, dt)` (inner) | Reason: weekend / holiday / no-service / not-yet-loaded |
| `ceskyStatniSvatek_(dt)` | Pevné + pohyblivé (Velký pátek, Velikonoční pondělí) — Gaussův Computus |
| `velikonocniNedele_(year)` | Easter Sunday computation |
| `notYetLoadedMessage_()` (inner) | Dynamická zpráva podle času vs. TRIGGER_1/TRIGGER_2 z configu |
| `najdiKonfiguracniList_(ss)` | Tolerantní finder (exact → NFC normalize → fuzzy „onfigurac") |
| `diagnostikaListu()` | Ruční — vypíše všechny listy + char codes pro debug |
| `isInClosure_(dateStr)` | Test CLOSURES z configu |
| `najdiReopenDate_(dateStr)` | Pro odstávkový den najde první pracovní den po konci rozsahu |
| `expandujClosures_()` | Rozbalí MM-DD rozsahy na konkrétní yyyy-MM-dd kolem dneška |

---

## Frontend (Obedy.html)

### UI komponenty

- **Intro modal** (`#intro-overlay`, z-index 10000) — první spuštění + auth guard. Blogic logo, text, tlačítko „Rozumím, pokračovat" (disabled dokud backend nepotvrdí @blogic.cz email). Pokud email není valid → modal přepne do error stavu s „Přepnout Google účet" odkazem.
- **Header** — logo Blogic + „Jídlogic" (bez podnázvu) + **sync badge** (jen pro registrované, `.guest-hide`) + **avatar s iniciálami** (`<div class="user-avatar">`, jediný trigger side-menu; hamburger button neexistuje).
- **Sync badge** (`.sync-badge`) — CSS varianty `--ok` (zelená, tmavě zelený text) / `--syncing` (oranžová, pulzující tečka, černý text) / `--error` (červená, bílý text). Na hover / focus tooltip s krátkou hlavičkou (override `::after` — kotvený POD element a doprava, aby neodjel mimo sticky header). Klik na badge v produkci UI nereaguje (stav řídí `pollSyncStatus` / `setSyncUi`).
- **Sync bar** (`.sync-bar`) — full-width pruh pod hlavičkou, viditelný jen při syncing / error (CSS `--syncing` žlutý / `--error` červený). Obsah vycentrovaný do `max-width: 760px` (mřížka jako container). Title + detail řádky (důvod, doporučený postup, info o mailu) + u error tlačítko „Rozumím, vyčistit" (`dismissSyncError` → `obedyResetChybuFronty`). Při pending běží 1s tik pro ETA.
- **Datepicker** (`.datepicker`) — horizontální scroll s pills: den + číslo + zkrácený měsíc. `touch-action: pan-x` (enables tap uvnitř pan-y body). Dny:
  - Fialový velký tile = vybraný pracovní den
  - Šedý velký tile `.active-closed` = vybraný closed den (dnešek víkend/svátek/not-yet-loaded)
  - Šedý přeškrtnutý malý = viditelný closed den
- **Toggles v side-menu** — `📅 Víkendy a svátky` a `🚫 Odstávky menzy` (localStorage). Dnešek se neschovává defaultně, ale schová se když toggle je OFF (chování „OFF + dnes víkend" → vybere se Pá jako fallback). Toggle ON → auto-přepne na dnešek.
- **Host banner** (`#guest-banner`) — **oranžový** (`#FFF3E0` / `#F0C987` / `#8A5A00`), dismissovatelný křížkem. Po zavření → UserProperties + localStorage cache.
- **PWA install nudge** (`#pwa-nudge`, `initPwaNudge()`) — subtilní banner vpravo dole pro mobilní uživatele, kteří nejsou v PWA módu a nezavřeli nudge za posledních 30 dní (`jidlogic-pwa-dismissed` localStorage). Android/Chrome využívá `beforeinstallprompt` event, iOS Safari otevře `#ios-install-overlay` modal s návodem (Share → Add to Home Screen). Delay 2 s od `initUI` — nenaskočí hned po načtení.
- **Menu karta** (`.menu-card`) — kategorie + jídla. Grid layout `44px 1fr auto`:
  - **food-num-col**: fixní sloupec pro outlined pill (quick-pick)
  - **food-name**: zalomení slov, neteče pod číslo
  - **food-controls**: desktop flex row (cena + qty); mobil flex column (cena jako pastel badge nad qty)
- **Quick-pick pill** (`.food-num`): outlined fialový (`rgba(107,45,139,0.35)` border, 1px). Hover → vybarvení. Klik → `quickPickStart(i)` → modál.
- **Quick-pick disabled** (`.food-num.disabled`) u polévek — šedé přerušované, kurzor `help`. Klik → tooltip (fixed position, z-index 10000) „Polévky nelze zvolit rychlou volbou. Použij + / − vpravo u ceny."
- **Summary panel** — seznam vybraných jídel, řádek korekce (✏️), celkem. Na mobilu bez počtu jídel („Celkem" místo „Celkem (X jídel)").
- **Barvy řádků — dual-state (v20260422.08+)** — `renderMenu` porovnává `quantities[i]` (UI state) vs. `DATA.selections[day.date]` (DB state) a přidává na `.food-item` jednu ze dvou tříd:
  - `.food-item.saved` = qty>0 a qty===savedQty → **fialový border vlevo + pozadí** (brand accent, „uloženo, nic nečeká")
  - `.food-item.dirty` = qty !== savedQty (nové / změněné / pending remove) → **oranžový border + pozadí** („čeká na Potvrdit výběr")
  - `.selected` helper class pro qty-controls visibility zahrnuje i dirty remove (qty=0, savedQty>0) aby user viděl `− 0 +` a mohl undo.
  - Na mobilu `.food-controls .food-price` badge také přebírá fialová/oranžová barva přes selektor `.food-item.saved/dirty .food-controls .food-price`. Default (mimo výběr) transparent — žádný badge.
- **Tap-to-toggle flow** (v20260422.04+) — `.food-name.tappable` + `.food-price.tappable` s `onclick="tapAddItem(i)"`. `tapAddItem` toggle: qty=0→1, qty=1→0, qty≥2 no-op (class `.qty-locked` deaktivuje hover). Hit area rozšířená padding + min-height. Bez tapu jsou `− 0 +` controls schované (`.qty-controls` default display:none).
- **Info tooltip v první kategorii** (v20260422.03+) — `<span class="info-wrap">` s Lucide `info` ikonou + popover. Text: „Jak vybírat — Tap na jídlo → přepíná 0↔1; Tlačítka −/+ ubírají/přidávají; Číslo vlevo = rychlá volba". Zobrazuje se jen v editable dnech pro ne-host, umístěno vpravo v prvním category-header.
- **Side-menu** — tappable hlavička (avatar + jméno + email + 💰 kredit badge) → otevře history modal. Credit barvy: zelená ≥0 / červená <0 / šedá 0. Pod položkami menu-version `vYYYYMMDD.xx`.
- **Modály** — dobití, historie (s CSV exportem), korekce (cílová částka), QR, Conflict („oběd jinde" vs. oběd), Help (Nápověda), Quick-pick confirm.
- **Menu-card header banner** — „🕒 Jídelníček načten DD.MM.YYYY, HH:MM" nad první kategorií (jen u dnů s daty, skryté u closed / noService). Zdroj: `day.fetchedAt` = sloupec J „Staženo" v listu `Jídlog 👨‍🍳` (zapsaný scraperem `writeMenuRows_` v Menza.feed.gs).
- **Loading overlay** (`.loading-overlay`) — Poletující jídelní emoji (🍴🥄🍕🍎🥐🍰🥣🍞🧀☕🥕🍩 + 16 dalších) místo math symbolů. 7 vtipných kroků (Spojuji → Kuchaře → odpověď na Ultimátní otázku → „…42…" → Menu → Talíře → Kredit).
- **Toast** — červený banner dole (5 s default, různé timings pro specific cases).

### Stavový management

```javascript
DATA = {}              // Hlavní data z backendu
selectedIndex = 0      // Vybraný den (index v DATA.days)
todayIndex = -1        // Index dneška v DATA.days (z findTodayIndex)
openIndices = []       // Indexy dnů vhodných pro slider (non-hidden)
quantities = []        // Počty ks per jídlo na aktuálním dni (reset při selectDay)
savedFingerprints = {} // Uložené otisky výběru per den (detekce změn)
corrections = {}       // Lokální korekce, inicialně plněné z creditHistory[type=korekce]
creditHistory = []     // Z backendu, live refresh přes syncCreditFromBackend
isGuest = false        // !DATA.user.registered
introSeen = false      // localStorage cache pro fast-path intro modal skip
quickPickIdx = -1      // Index jídla čekajícího na potvrzení v modálu
```

### Fingerprint systém (detekce změn)

Seřazený string `"cislo:ks,cislo:ks"` per-den. `confirmFingerprint` aktivní jen pokud se liší od `savedFingerprints[day.date]`.

### Cenová logika (2026-04-20 přepracovaná — shared counters)

Dva SDÍLENÉ counters napříč všemi uživateli (viz `feedback_pricing_rules.md`):

- **Jídla** (non-soup: oběd, oběd ostatní, minutky, pizza): 1–6 = studentská, 7+ = plná, `CARD_LIMIT = 6`
- **Polévky**: 1 = studentská, 2+ = plná; mají vlastní counter, NEpočítají do 6-meal limit
- **Marker „oběd mimo menzu"**: cena 0, nepočítá se do žádného counter

**Authoritative pricing je na backendu** (`obedy.js` → `spoctiPricing_`). Klient v `updateSummary` počítá jen optimistický preview pro UI. Server při `obedyUlozVyber`:
1. `nactiStatistiky_` — fresh read Výběr obědů (všichni, kromě markeru)
2. `spoctiMojeProDen_` — moje stávající (budou přepsány)
3. `spoctiFrontuProDen_(dayDate, email)` — pending joby OSTATNÍCH v OBEDY_EXT_QUEUE
4. `projectedMeals = (freshAll.meals − mine.meals) + queuedOthers.meals`
5. `projectedSoups = (freshAll.soups − mine.soups) + queuedOthers.soups`
6. `spoctiPricing_(items, projectedMeals, projectedSoups)` → rozdělí `ks` na student / plná, vrátí warnings
7. Opravené items jdou jak do Výběr obědů, tak do queue jobu (ext sheet bude konzistentní)

**Response pole `pricingWarnings`** (array of strings) — klient ukáže jako warning toast, pokud některé kusy přepadly na plnou cenu.

**LockService** (15s timeout) serializuje souběžné saves — dva uživatelé ukládající ve stejný okamžik se zpracují sekvenčně, druhý vidí změny prvního. Queue reconciliation (Phase 2, idea #31) není potřeba pro 99 % případů.

- **Korekce**: manuální úprava cílovou částkou → přepíše řádek v Kreditu

### Gestura na mobilu (swipe + pull-to-refresh)

Listenery na `document` (ne na `.container` — pokrývá celý viewport). Swipe handler:
- `shouldIgnoreTarget(t)` — ignoruje tap na `.qty-btn`, `button`, `a`, `input`, `textarea`, `select`, `.datepicker`, `.modal-overlay`, `#side-menu`, `.dp-controls`
- **Horizontální swipe** (>60px H, <60px V) → `najdiSousedniViditelnyDen_` + `selectDay`. Najde příští non-hidden den (i closed s viditelnou hláškou)
- **Pull-to-refresh** (>90px dolů, <60px H, scroll na vrchu) → `refreshDataInPlace()` (ne `window.location.reload()` — v GAS iframu dává bílou stránku)

iOS fix: `body { touch-action: pan-y }` + `.datepicker { touch-action: pan-x }` + `.dp-item { touch-action: manipulation }`. Plus `-webkit-tap-highlight-color` pro vizuální feedback.

### Responsivní breakpoint 640px

- Datum krátké („ČT 16.4.") místo „Čtvrtek 16. dubna"
- Stats badges vertikálně (pod sebou, stretch šířka)
- Cena jako pastel badge nad − [qty] + (stejná šířka jako qty-controls)
- Plná cena (`/ 123`) v tooltipu (místo v badge)

### Téma (light/dark)

CSS proměnné v `:root` a `[data-theme="dark"]`. Tlačítko v side-menu, localStorage. Hlavní barvy: fialová `#6B2D8B`, oranžová `#E67E22`, zelená `#27AE60`.

---

## Asynchronní fronta (ext. sheet)

Zápisy probíhají asynchronně, aby neblokovali uživatele (~3 s úspora).

```
Uživatel uloží výběr / dobije kredit / udělá korekci
    │
    ▼
naplnujExtSheetZapis_() / naplnujExtSheetDobiti_()
    │
    ├── Vytvoří job: {type, dayDate|sundayDate, email, nick, extNick, celkem|amount, ...}
    ├── Uloží do ScriptProperties('OBEDY_EXT_QUEUE')
    └── naplanujExtSheetTrigger_(props)
          │
          ├── Zjistí existující triggery + ETA (OBEDY_QUEUE_ETA)
          ├── Live = ETA v budoucnosti NEBO právě fired (max 2 min zpět) → ponecháme
          ├── Orphan = ETA null + existuje trigger, NEBO ETA starší > 2 min → smaž + nový
          └── ETA = now + 60s (pro frontend sync bar odpočet „za N s")
              │
              ▼
        zpracujExtSheetFrontu()  ← LockService (ochrana proti souběhu)
              │
              ├── Smaže ETA (OBEDY_QUEUE_ETA)
              ├── Načte frontu z ScriptProperties
              ├── Pro každý job:
              │     ├── type === 'dobiti' → zapisDobitiDoExternSheetu_(job)
              │     └── else             → zapisDoExternSheetu_(job, job.url)
              │
              ├── FATAL chyba (sloupec/řádek nenalezen) → posliMailSelhaniZapisu_
              │   (mail + cache chyby pro sync badge, job se zahodí)
              ├── Přechodná chyba → zpět do fronty, max 3 retry
              ├── Smaže trigger
              └── Pokud zbývají failed joby → nový trigger za 120 s
```

### Hledání řádku v ext. sheetu

Sloupec A může obsahovat Date objekty nebo textové popisky ("pátek 17.4"). Kód umí obojí.

### Hledání sloupce v ext. sheetu

`najdiSloupecProExtSheet_(extSheet, extNick)` scanuje prvních ~10 řádků (header area může být odsazený) a hledá buňku rovnou `extNick` (case-insensitive, trim).

### Sync badge & info pruh (`obedyStavFronty`)

Backend vrací:
- `pending` — počet jobů ve frontě pro aktuálního uživatele
- `total` — celkem jobů ve frontě napříč všemi uživateli (pro kontext „N tvoje / M ve frontě" v info pruhu, když čekají i zápisy kolegů)
- `failed` — `true` pokud je v cache FATAL chyba (TTL 24 h)
- `lastError`, `lastAction`, `lastErrorAt`, `mailSent`, `mailTo`, `mailError` — detail poslední chyby
- `etaAt` (ms since epoch) + `now` (server time) — pro client-side odpočet s kompenzací time offsetu

Frontend poll každých 15 s po save op (max 5 min). `setSyncUi(state)` (vstup: `'synced' | 'pending' | 'failed'` — historické názvy z backendu, mapují se na CSS `--ok / --syncing / --error`) aktualizuje badge + pruh v jedné funkci a spravuje ETA tikač:

- `failed` → červený pruh: titulek „❌ Poslední zápis do sdíleného sheetu selhal (před N min)" + **Důvod:** `lastError` + **Co s tím:** `lastAction` + ℹ️ info o mailu + tlačítko „Rozumím, vyčistit" (`dismissSyncError` → `obedyResetChybuFronty`). Badge `--error` s tooltipem „Poslední propis… — detaily ve stavovém pruhu."
- `pending > 0` → žlutý pruh: „⏳ Čekám na propis do sdíleného sheetu (N položek)" — nebo „(N tvoje / M ve frontě)" když `total > pending` (ve frontě jsou i zápisy kolegů) — + ETA řádek („Odbavení fronty za ~ N s" s 1s tikačem, jinak fallback text „asynchronně na pozadí — obvykle do 1 minuty"). Badge `--syncing` s pulzující tečkou.
- Else → pruh skrytý, badge `--ok` zelený, tooltip „Vše propsané do sdíleného sheetu."

Pruh je `display: block; width: 100%`, obsah vycentrovaný do `max-width: 760px` (mřížka jako `.container`). Tooltip na badge je overridovaný — kotvený POD element a vpravo (default `bottom: 100%` by v sticky hlavičce odjel mimo viewport), `min-width: 260px`, reset uppercase/letter-spacing zděděných z badge. Badge je skrytý pro hosty (`.guest-hide`).

### Notifikace při selhání (`posliMailSelhaniZapisu_`)

| Důvod | Výskyt |
|---|---|
| Sloupec s přezdívkou nenalezen | Hlavička v ext. sheetu neobsahuje `extNick` z listu Uživatelé |
| Řádek pro den nenalezen | Sloupec A neobsahuje dnešní datum (nebo datum předchozí neděle u dobití) |
| Prázdná přezdívka | List Uživatelé sloupec B (Přezdívka v zápisovém sheetu) je prázdný |

Mail obsahuje: uživatele, den, částku, typ (oběd/dobití), důvod, návod. Data v Jídlogic (Výběr/Kredit) zůstávají OK — propsalo se nakonec jen do sdíleného sheetu.

Zároveň se ukládá do cache (`obedy_lastfail_<email>`, TTL 24 h) — frontend to přes `obedyStavFronty` čte a zobrazuje červený dot.

---

## Intro modál + auth guard

**Tok:**

```
1. showIntroOverlay() nebo fast-path skip (localStorage.introSeen=true)
2. init() volá obedyNactiData()
3. Backend vrací user.introSeen + user.email
4. updateIntroAfterAuth(user):
   - blocked → zůstává v error stavu
   - valid @blogic.cz + introSeen → hideIntroOverlay()
   - valid @blogic.cz + !introSeen → tlačítko „Rozumím" enable
   - invalid email → error stav: „Přepnout Google účet" link + „Načíst znovu"
5. Klik „Rozumím" → dismissIntro():
   - localStorage.setItem('jidlogic.intro.seen.v1', '1')
   - google.script.run.obedyPotvrdIntro() → UserProperties
   - hideIntroOverlay()
```

**Ticker s retry** — pokud backend nevrátí do 10 s, přidá se do modálu tlačítko „Backend visí — zkusit znovu" (volá `init()`).

**Host banner** — stejný vzor (localStorage cache + UserProperties autoritativní), `obedySkryjHostBanner` endpoint. Dismissovatelný křížkem v pravém horním rohu banneru.

---

## Multi-device sync (od 2026-04-20)

Cíl: když user změní data na jednom zařízení (např. mobil), druhé zařízení (desktop s otevřeným tabem) se má do ~minuty aktualizovat bez ručního refreshe.

**Mechanismus — polling fingerprint:**

Backend `obedyVerzeStavu()` vrací krátký hash aktuálního stavu uživatele (count + sum řádků z Výběr obědů + Kredit). Lightweight — jen scan 2 sheetů, žádné menu/stats/ext sheet logic.

Frontend polluje každých 60 s:
- Guard `document.visibilityState === 'visible'` — když tab není viditelný, polling se pauzuje (šetří baterii + GAS quota)
- Guard `!isGuest && !DATA.blocked` — nerunning pro hosta a ne-blogic
- První poll uloží baseline (`lastSyncVersion`)
- Další poll: pokud hash ≠ baseline → toast „↻ Data se změnila jinde — obnovuji…" + `refreshDataInPlace()`

**Vlastní save operace:**

Po `obedyUlozVyber` / `obedyDobijKredit` / `obedyUlozKorekci` success volá frontend `syncCreditFromBackend()`, který zavolá `resetSyncBaseline_()` (nastaví `lastSyncVersion = null`). Další poll jen uloží novou verzi, nevyvolá toast → user nevidí falešnou hlášku „změnilo se jinde" po vlastní akci.

`refreshDataInPlace()` také volá `resetSyncBaseline_()` — fresh data = fresh baseline.

**Detekce stale `DATA.todayStr`:**

Při dlouhém otevření appky (user nechal tab přes půlnoc) může být `DATA.todayStr` zamrzlé. Fix ve dvou vrstvách:

1. `ziskejDnesStr_()` — helper vrací aktuální yyyy-MM-dd v Europe/Prague TZ přes `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' })`. `isDayEditable(dayDate)` ho volá místo čtení z `DATA.todayStr`. Frontend tak vždy správně klasifikuje editovatelné dny, bez ohledu na stáří DATA.
2. `visibilitychange` handler — když user přepne zpět na tab a `ziskejDnesStr_() !== DATA.todayStr`, spustí se `refreshDataInPlace()`. Datepicker se překreslí s novým „dneškem".

---

## Storno logika (model B — od 2026-04-19)

Opakované uložení výběru za stejný den:

1. `smazVyberUzivatele_(sheet, email, dayDate)` smaže všechny dosavadní řádky Výběru obědů pro user+den
2. Batch zapíše nové řádky (tento výběr)
3. `spoctiZustatek_` se přepočítá sám — čte aktuální sumy, žádný „storno" stav neexistuje
4. V ext. sheetu: `cell.setValue(-celkem)` přepíše předchozí hodnotu

**Rozdíl oproti modelu A** (pre 2026-04-19): Dříve se do Kreditu zapisovalo `čerpání` a při re-save se měnilo na `storno` (`setDataValidation` hack). Staré storna zůstávají (neopravujeme), `spoctiZustatek_` je ignoruje (`rowType === 'storno' → continue`).

---

## Routing

| URL | Cíl |
|---|---|
| `...exec` | Jídlogic (výchozí) |
| `...exec?app=obedy` | Jídlogic (explicitní — PWA wrapper používá) |
| `...exec?app=jidlog` | JídLOG dashboard (záchranný deep-link) |
| `...exec?app=dashboard` | Alias k `?app=jidlog` |
| `...exec?format=ics` | ICS kalendářový feed |

Od „uspání" JídLOG (2026-04-18): Jídlogic je výchozí. Dashboard.html zůstává, ale v žádném UI se na něj neodkazuje.

---

## ICS kalendářový feed

Generuje se po každém úspěšném stažení menu a publikuje na GitHub Pages přes Contents API. Odkaz byl odstraněn z Chat patičky a mail notifikací (synchronizace Google Calendar má takové zpoždění, že matlo).

**URL pro ruční přidání:**
- GitHub Pages: `https://jurencak-bob.github.io/menza-jidlog/menza.ics`
- GAS doGet fallback: `https://script.google.com/.../exec?format=ics`

---

## Oprávnění

| Role | Podmínka | Práva |
|---|---|---|
| Registrovaný | @blogic.cz + Aktivní=ANO v Uživatelé | Plný přístup |
| Host | @blogic.cz, ne v Uživatelé nebo Aktivní=NE | Jen prohlížení; oranžový banner (dismissable) |
| Cizí (ne-blogic) | Jiná doména | **Blokován intro modálem**; backend vrací `{blocked:true}` |

Bezpečnostní gate `jePovolenyEmail_` je ve všech write endpointech — defense in depth proti přímým google.script.run voláním.

---

## Optimalizace výkonu

- **CacheService** pro config (5 min TTL) — šetří ~1,5 s
- **CacheService** pro user lookup (v `najdiUzivateleCached_`) — šetří ~0,8 s; **write ops používají `najdiUzivateleFresh_`** (fresh read, okamžitá reakce na deaktivaci)
- **Batch zápis** (`setValues` místo N × `appendRow`) — šetří ~2 s
- **Batch delete** (`clearContent` + `setValues` místo N × `deleteRow`)
- **Async ext. sheet** (fronta + trigger) — šetří ~3 s z UX
- **Optimistic UI** (confirmSelection) — save proběhne instantně, rollback při failure
- **Fast path intro modal** (localStorage cache) — v běžném případě modál neblikne
- **`obedyNactiData` jako one-shot** — jeden velký request místo mnoha malých
- **`obedyNactiKreditProFrontend`** — lightweight endpoint pro live kreditní badge po save (nenačítá celé DATA)

---

## Diagnostické funkce (ručně z GAS editoru)

| Funkce | Účel |
|---|---|
| `diagnostikaListu()` | Vypíše všechny listy + char codes (pro duplicity / Unicode mismatch) |
| `obedyDiagnostikaFronty()` | Vypíše stav OBEDY_EXT_QUEUE + ETA + počet triggerů |
| `obedyVynutZpracovaniFronty()` | Vynutí okamžité zpracování fronty (obejde 60s trigger) |
| `archivujKvartal_(rok, kvartal, dryRun)` | Kvartální uzávěrka (dryRun=true default) |
| `nainstalujTriggerArchivace()` / `odinstalujTriggerArchivace()` | Správa trigger pro měsíční připomínku |

---

## Verzování

Formát `v<YYYYMMDD>.<xx>` v div `.menu-version` na spodku side-menu:
- `YYYYMMDD` — datum posledního deploye
- `.xx` — dvoumístný counter, reset na `01` každý den, inkrementuje s každým dalším deployem v tomtéž dni

Příklad: `v20260420.01` → `v20260420.02` → `v20260421.01` (po půlnoci reset)

User si může ověřit, že iframe / PWA cache načetla novou verzi.

---

## Známé omezení a úmyslná rozhodnutí

- **PWA přes wrapper**: GAS HtmlService běží v sandbox iframe → `manifest.json` nefunguje přímo. Řešení: `index.html` na GitHub Pages obtáčí GAS URL.
- **Google avatar**: GAS nemá API pro profilový obrázek → zobrazuje iniciály z emailu.
- **Storno v ext. sheetu**: Při re-save téhož dne se v ext. sheetu jen přepíše hodnota (správně). Storno historie se nevede — zdrojem pravdy je list Výběr obědů.
- **Korekce neputuje do ext. sheetu**: Úmyslně — korekce je interní úprava kreditu, ext. sheet nadále ukazuje plnou cenu jídel dne. (Potvrzeno v dialogu.)
- **Polévky v quick-picku**: Disabled. Polévka je doplněk k obědu, ne náhrada — musí přes + / −.
- **Datepicker bez budoucnosti**: Nezobrazuje dny po dnešku, pokud v Menza sheetu nejsou reálná data. Další den „naskočí" po půlnoci (server generuje dynamicky při každém requestu).
- **Víkendy jsou skryté defaultně**: Toggle v side-menu, když je OFF a dnes je víkend → dnešek zmizí, vybere se nejbližší minulý pracovní. Toggle ON → dnešek se automaticky přepne.
- **Ext. sheet gid**: URL s `#gid=...` umí najít konkrétní list. Jinak fallback na první list.
- **Přezdívka v ext. sheetu nenalezena**: FATAL → mail uživateli + správci, zápis se zahodí (žádný fallback).
- **UserProperties jsou per-Google-účet**: Intro / host banner dismiss cross-device synchronizovaný bez našeho úsilí (Google to dělá za nás).

---

## Nedávné fixy a helpery (kontext pro údržbu)

### `vlozNahoru_(sheet, rows)` — nejnovější nahoře v Kredit a Výběr obědů

Nový řádek jde na pozici 2 (za hlavičku), ostatní se posunou dolů. Používá `sheet.insertRowsBefore(2, N)` + `setValues`. Používá se v `obedyUlozVyber`, `obedyDobijKredit`, `obedyUlozKorekci`. Výhoda: nejnovější záznam je hned vidět, bez scrollování dolů.

### `adminEmail_()` — fallback na owner skriptu

Pro operační notifikace (`posliMailSelhaniZapisu_`, `posliPripomenkuArchivace_`) místo povinné konfigurace `USER.EMAIL`:
1. `USER.EMAIL` z Konfigurace (pokud je nastaveno — podporuje víc adminů oddělených čárkou)
2. Fallback `Session.getEffectiveUser().getEmail()` — owner GAS skriptu (= typicky Bob)

Notifikace dorazí i bez explicitní konfigurace. `USER.EMAIL` je teď `volitelné`.

### `najdiKonfiguracniList_(ss)` — tolerantní finder

Řeší Unicode normalizaci u `⚙️ Konfigurace`:
1. Exact `getSheetByName` (rychlá cesta)
2. NFC normalize všech názvů + porovnání (Windows vs macOS character form)
3. Fuzzy match podle keywordu „onfigurac" (case-insensitive, substring)

Pokud nic nenajde → volá `vytvorKonfiguraci` a pokud ani tak ne → throw s jasnou chybou + návrh spustit `diagnostikaListu()`.

### TZ fix v `naplnujExtSheetDobiti_` (2026-04-20)

Původní kód používal `today.getDay()`, což čte v **serverové TZ** (obvykle UTC). Volání po půlnoci v Praze (CEST +2h) pak vidělo předchozí den jako UTC neděli → dobití šlo 7 dní zpět místo jednoho. Fix:
```js
var isoDow = parseInt(Utilities.formatDate(new Date(), OBEDY.TIMEZONE, 'u'), 10);
var dow = isoDow % 7;  // JS konvence: 0=Ne, 1=Po, …
```

### Fallback v `zapisDobitiDoExternSheetu_`

Pokud ext sheet nemá řádek pro „předchozí neděli":
1. Primární: `job.sundayDate`
2. Fallback: iterativně 1–7 dní zpět od neděle (nejčastější: ext sheet má jen Po–Pá, dojdeme na pátek)
3. Fallback: 1–7 dní dopředu (pokud ani zpětně není nic)
4. Else → FATAL s jasným reason

### Orphan trigger detection v `naplanujExtSheetTrigger_`

Rozlišuje live vs. orphan:
- **Live** = ETA v budoucnosti NEBO max 2 min zpětně (trigger právě běží)
- **Orphan** = ETA null + existuje trigger, NEBO ETA starší než 2 min

Při orphan se stávající trigger smaže a vytvoří čerstvý. Řeší případ, kdy trigger fired, ETA se smazala na začátku `zpracujExtSheetFrontu`, ale lock fail / exception zabránil cleanup — trigger visí, enqueue nevytvoří nový, fronta uvízne.

### Strukturovaný podpis v ext sheet poznámkách

Nový formát (od 2026-04-20):
```
{detail operace}

Zapsal: {plné jméno}
Kdy: {dd.MM.yyyy HH:mm}
Zdroj: Jídlogic appka
```

Aplikuje se v `zapisDoExternSheetu_` i `zapisDobitiDoExternSheetu_`. Staré poznámky zůstávají ve starém formátu; nové zápisy a přepisy dostanou nový podpis.

### Diagnostické funkce (ručně z GAS editoru)

| Funkce | Účel |
|---|---|
| `diagnostikaListu()` | Vypíše všechny listy + char codes (duplicity / Unicode mismatch) |
| `obedyDiagnostikaFronty()` | Stav OBEDY_EXT_QUEUE + ETA + počet triggerů |
| `obedyVynutZpracovaniFronty()` | Vynutí okamžité zpracování fronty (obejde 60s trigger) |
| `archivujKvartal_(rok, kvartal, dryRun)` | Kvartální uzávěrka (dryRun=true default) |
| `nainstalujTriggerArchivace()` / `odinstalujTriggerArchivace()` | Správa trigger pro měsíční připomínku |

---

## Historie zásadních změn

| Datum | Změna |
|---|---|
| 2026-04-17 | Inicializace Jídlogic (route `?app=obedy`) |
| 2026-04-18 | „Uspání" JídLOG — Jídlogic jako výchozí; ICS link odstraněn z Chat |
| 2026-04-19 | Model B kreditu (Kredit = jen příjmy); email místo přezdívky jako identita; intro modal + host banner dismiss; quick-pick; korekce = cílová částka; klasifikace closed dnů (weekend/holiday/not-yet-loaded); mobile responsive (krátké datum, stacked badges, price badge); české svátky; UserProperties; sync popup ETA; fresh authorization pro write ops |
| 2026-04-20 | **TZ fix v dobiti** (Europe/Prague místo server TZ); **orphan trigger detection** + lock-fail logging; **`vlozNahoru_`** (nejnovější zápis nahoře v Kredit + Výběr obědů); **`adminEmail_` fallback** na `Session.getEffectiveUser()` (`USER.EMAIL` je teď volitelné); **fallback hledání neděle ±7 dní** v ext sheetu; **strukturovaný podpis** „Zapsal/Kdy/Zdroj" v poznámkách ext sheetu; **multi-device sync polling** (`obedyVerzeStavu` endpoint + 60 s interval); **stale `DATA.todayStr` fix** (`ziskejDnesStr_` + `visibilitychange` auto-refresh); **readonly banner** + zámek ikona v datepickeru; tolerantní konfigurace (`najdiKonfiguracniList_`); phase tracking v `obedyNactiData`; `diagnostikaListu` helper. Kompletní update nápovědy + dokumentace. |
| 2026-04-20 (p.m.) | **Sync UI refactor**: dot + floating popup → **pill badge** vedle avataru + **full-width info pruh** pod hlavičkou. `setSyncDot` → `setSyncUi`, `renderSyncPopup` → `renderSyncBar`, smazány `toggleSyncPopup / closeSyncPopup / syncPopupOutsideHandler`; `dismissSyncError` zachován (teď sedí v pruhu). Tlačítko „Rozumím, vyčistit" přesunuto z popupu do error pruhu. Badge skrytý pro hosty (`.guest-hide`). Tooltip override — kotvený pod element (v sticky header by default mizel nad viewport), povolený wrap, reset uppercase. **Avatar cleanup**: odstraněn oranžový `::after` dot (burger indikátor), avatar je teď čistě kruh s iniciálami a zároveň jediný trigger side-menu. **Jídelníček načten DD.MM.YYYY, HH:MM** — banner v hlavičce karty menu (zdroj: sloupec J „Staženo" v `Jídlog 👨‍🍳` listu, propisovaný `writeMenuRows_` přes `nactiMenuProWeb` → `day.fetchedAt`). **Název app sjednocen** — odstraněn podnázev „Zapiš oběd" z hlavičky i z `setTitle('Jídlogic')`; link text „Zapiš oběd" v Chat/email notifikacích zůstává (tam je to call-to-action, ne název). Loading step 3 přepsán: „Hledám odpověď na Ultimátní otázku…". Verze bump .14 → .17. |

---

*Tato dokumentace je udržována manuálně — při zásadních změnách aktualizovat paralelně s verzí v `.menu-version`. Drobné UI změny se neopisují, pouze změny datového modelu, endpointů, bezpečnosti a UX konceptu.*
| 2026-04-20 (pozdě) | **Sync polish** — terminologie „sdílená karta" → „sdílený sheet", „Jídlogic listy" → „Jídlogic db" (fyzická „stravenská karta" a „limit karty" nechány); „sdílený sheet" prolinkován do všech textů (bar, intro, nápověda) přes `.ext-sheet-link` + helper `extSheetLink()`. **Race condition fix** v sync flow: `startSyncPolling()` přesunut z immediate call do success callbacku `obedyUlozVyber` / `obedyDobijKredit` — první poll dřív vracel pending:0, protože běžel před tím, než server stihl zařadit job do fronty. **Topup optimistic flow** — modál se zavře hned po submit (žádný „Ukládám…" screen), optimistický push do `creditHistory`, backend na pozadí; rollback + error toast při failure. Odstraněny `showTopupResult` + `retryTopupForm` + `#topup-result` HTML. **Toast auto-coloring** — 4 varianty (info / success / warning / error) podle prefixu zprávy (`↻` / `✓` / `✗` nebo „Chyba"), fallback warning. Původně všechny toasty červené = matoucí „error". **Backend `obedyStavFronty.total`** — přidán počet všech zápisů ve frontě napříč uživateli (pro info pruh „N tvoje / M ve frontě" když čekají i zápisy kolegů). **Dark mode** pro sync badge / bar — tlumené tinted barvy pro čitelnost v dark tématu. **PWA install nudge** (idea #24 HOTOVO) — subtilní banner pro mobily mimo PWA režim, Android/Chrome přes `beforeinstallprompt`, iOS přes návod v `#ios-install-overlay` modalu, 30denní cooldown. Verze .17 → .23. |
| 2026-04-20 (noc) | **Pricing refactor** — oba counters (jídla + polévky) jsou teď SDÍLENÉ napříč uživateli (dříve polévka byla per-user, opraveno po upřesnění Bob). Polévky NEpočítají do 6-meal card limit. `nactiStatistiky_` oddělil meals/soups. Nové helpery `spoctiMojeProDen_`, `spoctiFrontuProDen_`, `spoctiPricing_`. `obedyUlozVyber` teď autoritativně přepisuje typCeny + cenaKs na základě fresh + queue inspekce (LockService serializuje). Response má `pricingWarnings` pole, klient ukazuje warning toast. **Avatar tier colors** (v produkci): `.user-avatar` bez border, bg dle kreditu (fialová > 200, oranžová 1–200, červená ≤ 0 s ripple pulse). `refreshMenuCredit` + `tierFromBalance` + "Na kartě:" prefix + restrukturalizovaný side-menu-header (user-row flex + credit pod). Verze .25 → .30. |
| 2026-04-20 (pozdě noc) | **Ikony Lucide Fáze 1** (idea #30 HOTOVO) — emoji v UI nahrazeny inline Lucide SVG ikonami s emoji fallbackem. Knihovna `ICONS` (~40 ikon) + helper `icon(name)` vrací `<span class="icon"><svg…/><span class="icon-fallback">emoji</span></span>`. Default CSS zobrazí SVG; rollback přes `document.documentElement.classList.add('icons-off')` přepne na emoji. Nahrazeny: sync UI (badge + bar: `triangle-alert`, `refresh-cw`, `mail`), day-stats (`users`, `utensils-crossed`, `soup`), menu card (`clock` banner + `CAT_ICON` map: `soup`/`utensils`/`cooking-pot`/`timer`/`pizza`/`ban`), side-menu (9 položek: `external-link`, `table-2`, `monitor-smartphone`, `qr-code`, `credit-card`, `line-chart`, `sun-moon`, `calendar`, `calendar-off`, `help-circle`), banners (`triangle-alert`, `lock`, `megaphone`, `ban`, `calendar`), info-banner odstávek (`store-off`, `triangle-alert`), Help.html h4 hlavičky (16 sekcí), Korekce modal (`pencil-line`). Ikony volené dle uživatelského výběru (prototyp v `Obedy-preview.html`). Verze .31 → .33. |
| 2026-04-22 | **Kontrola karty: diktování zakázáno + útrata počítána za všechny uživatele + input fix pro desetinnou čárku** (v20260422.22) — *(1)* Diktování přes Web Speech API vypnuto — cross-browser/OS permission chování bylo nespolehlivé. Tlačítko mic skryté přes CSS `.card-check-mic { display: none !important; }`, JS zůstává pro pohodlný re-enable. Help sekce updatována. *(2)* Útrata v summary teď **počítá součet všech uživatelů** (ne jen přihlášeného) — karta je sdílená, rozdíl Před−Po pokrývá útraty všech kolegů. Nový helper `spoctiUtrDneVsichni_(ss, dayDate)` pendant k Q sloupci „Obědy celkem" v ext sheetu. Label „Útrata dnes (všichni)". *(3)* **Bug fix — desetinná čárka**: `card-check-value` i `corr-target` inputy měly `type="number"`, který v českém locale nepovoluje `,` (browser invaliduje hodnotu, `.value` se vyčistí → celý input se promaže při napsání čárky). Změna na `type="text"` + `inputmode="decimal"`, sanitize přes regex v oninput drží validní formát (číslice + max 2 desetinná místa). Topup input (`topup-amount`, step="1", jen celá čísla) beze změny. |
| 2026-04-22 | **„Těš se, zítra" — přísnější logika zobrazení** (v20260422.25) — Bob reportoval: ve čtvrtek ráno (pracovní den, scraping ještě neskončil) se zobrazovalo „Těš se, další pracovní den je Pá 24.04.2026" — nesmysl, když dnes je pracovní den. Nová logika: hláška **jen když** `isToday && DATA.nextWorkingDay === tomorrow && day.reason !== 'not-yet-loaded'`. Tj.: (a) dnes je closed (víkend/svátek/poslední den odstávky) a (b) zítra je pracovní den a (c) nejsme v stavu `not-yet-loaded` (= dnes je pracovní den bez stažené menu, těšit se neplatí). Text zkrácen na **„Těš se, zítra zase vaříme."** (bez data, protože to VŽDY je zítra). Pro odstávky: pokud `reopenDate === tomorrow`, „Provoz začíná znovu: zítra" místo data. Nový helper `ziskejZitrekStr_()` — pendant `ziskejDnesStr_()`, vrací yyyy-MM-dd zítřka v Europe/Prague TZ. |
| 2026-04-22 | **Stav karty modal — UX úpravy po produkčním testu** (v20260422.24) — *(1)* **Inputy nepromazávat na focus** — hodnota zůstává, `input.select()` ji označí aby user mohl rovnou přepisovat (iOS Safari fix: `setTimeout 0`). *(2)* **Vždy 2 desetinná místa v inputu** — `input.value = prefill.toFixed(2).replace('.',',')`; nový helper `normalizeCardCheckInput(el)` běží na `onblur` (když user napíše „1,5" → po opuštění fieldu „1,50"). *(3)* **Info pod inputem zjednodušeno** — nový format „Dnes uloženo 1,50 Kč 23.04. 13:10, Bohumil Jurencak" (jen pro uloženou hodnotu; odhady/prefill bez info textu). FE helper `emailToFullNameFE(email)` (ekvivalent `emailToFullName_` z backendu, bez diakritiky — „Bohumil Jurencak"), `formatDateDM_(iso)` pro „DD.MM." bez roku. *(4)* **Útrata + rozdíl vždy s „Kč" jednotkou** — nový helper `formatKcUnit(n)` = `formatKc(n) + ' Kč'`. Celá čísla bez setin („0 Kč"), desetinná s 2 místy („1,50 Kč"). *(5)* **Záporný rozdíl orámovat** — pokud `Před − Po < 0` (karta narostla, anomálie), strong element dostane class `.negative` → oranžové pozadí + padding + color (stejné jako `.food-item.dirty .food-price` badge). *(6)* **Match sekce „Sedí/Nesedí" úplně odstraněna** — uživatel to vidí z barvy rozdílu (černá = OK, oranžová badge = anomálie). |
| 2026-04-22 | **BUG FIX: Kontrola karty se nepropisuje do ext sheetu** (v20260422.23) — root cause identifikovaný přes `obedyDiagnostikaKontrolaKarty` helper: fronta `OBEDY_EXT_QUEUE` byla prázdná i po save (0 jobů). `obedyUlozKontrolaKarty` chyběl úvodní `loadConfigCached_()` + `nactiObedyKonfiguraci_()`, které běží v `obedyUlozVyber` i `obedyDobijKredit`. Bez nich zůstalo `OBEDY.EXT_SHEET_URL` na default prázdné → `naplnujExtSheetKontrolaKarty_` silent-returnule bez push do queue. FE vidí success (Jídlogic DB zápis proběhl), ale ext sheet nikdy nedostane žádost. Fix: přidáno `loadConfigCached_() + nactiObedyKonfiguraci_()` na začátek `obedyUlozKontrolaKarty` a preventivně i `obedyNactiKontrolaKarty`. Po deploy se další zápis Před/Po korektně propíše do sloupců R/S ext sheetu. Také rozšířen diagnostický helper `obedyDiagnostikaKontrolaKarty` — vypisuje dnešní řádek (hledání dayDate match) + posledních 5 řádků sheetu pro verify. |
| 2026-04-23 | **Sync lišta: × dismiss + IT Crowd hláška v error** (v20260423.15) — *(1)* **Close × btn** v pravém horním rohu obou sync lišt (syncing i error). Syncing lišta: klik na × → **dočasný dismiss** (session-only in-memory flag `syncBarDismissed` se snapshotem aktuálního `syncState`). Pokud se state nezmění (pending count, failed flag, lastErrorAt), lišta zůstává skrytá; při jakékoli změně flag se zruší a lišta se objeví znovu. Error lišta: × = **jen vizuální dismiss** bez backend resetu, doplňuje existující `„Rozumím, vyčistit"` btn (který volá `obedyResetChybuFronty`). *(2)* **IT Crowd hláška v error liště** — nový `.bar-line` pod info o Jídlogic db: „Pokud chyba přetrvává, zkus klasiku z IT Crowd: **„Have you tried turning it off and on again?"** Zavři Jídlogic a otevři znovu." Vtipná připomínka, ne-fans dostanou konkrétní akci. *(3)* CSS: `.sync-bar` position:relative; `.bar-close` absolute top-right, 28×28 circle, rgba background + hover. Dark mode + active feedback (scale 0.92). |
| 2026-04-23 | **Loading overlay: default state = 📡 místo brand SVG** (v20260423.14) — Bob reportoval: při přechodu z wrapperu do Obedy overlay viděl **stejný text „Spojuji se s menzou…" dvakrát** — jednou s brand SVG (HTML default v Obedy od v04), pak s 📡 (emoji krok 0 po startLoadingAnimation). HTML default pro `.loading-plate` změněn na `emoji-mode` class + text `📡`. Brand přítomnost v Obedy overlay drží **corner watermark** v pravém dolním rohu (z v06, 32×32 opacity 0.55). Wrapper loading v index.html má brand SVG (navazuje na OS splash), Obedy overlay má emoji (visually distinct, nevzniká dojem „dvou stejných kroků"). Přechod wrapper → Obedy: brand SVG (wrapper) → fade → 📡 (Obedy, krok 0) + text „Spojuji se s menzou…". |
| 2026-04-23 | **Burger menu → „Nastavení" s integrovanými uživatelskými předvolbami** (v20260423.13) — Bob pref: konsolidace 4 položek do jedné pod „Nastavení". **Varianta C — slide panely v side-menu:** po kliku na „Nastavení" se side-menu přepne do druhého panelu (slide doleva, 0.28 s ease); back button „← Zpět" vrací. Uživatel neopouští kontext side-menu. **Struktura:** `.side-menu-panels` flex container s `overflow:hidden`, uvnitř dva `.panel` absolute-positioned, transformem přepínané (0 / 100%, -100% / 0). Header (avatar, kredit) zůstává mimo panely — sdílený. **Přesunuty do settings panelu:** Tmavý režim, Zavřené dny, Oblíbená jídla, Soukromí v sheetu (viz memory #44). **V hlavním panelu:** nová položka „Nastavení" s ikonou Lucide `user-cog` (Bob vybral z prototypu — varianta C, user + ozubené kolo = explicit „user settings"). **Esc key:** první Esc v settings panelu → zpět na main; druhý → zavřít menu. **closeMenu()** při zavírání resetuje `.settings-view` class — při příštím otevření user vidí main (mental model: menu je vždy fresh). **Reduced-motion** respektováno (transition: none na panel). **Prototyp:** `Nastaveni-prototyp.html` ve workspace pro reference (gitignored, nedeploynovaný). **Help.html:** „V side-menu máš Oblíbená/Soukromí" → „V burger menu → Nastavení → …". |
| 2026-04-23 | **Oblíbená jídla: toggle → klikatelná položka, enabled je derived** (v20260423.12) — Bob pref: side-menu už nemá toggle přepínač pro Oblíbená jídla. Nahrazeno obyčejnou `.side-menu-item` (jako Soukromí v sheetu, Nápověda atd.), klik otevře modal s klíčovými slovy. **Logika:** zvýraznění v menu card aktivní pouze pokud `favKeywords.length > 0` (derived z DATA.user.favorites). Prázdná textarea + uložit = implicitně vypnuto. `DATA.user.favoritesEnabled` flag je nadále součást backend schématu (ponechán pro kompatibilitu), ale na FE se pro gating nepoužívá. `toggleFavorites()` odstraněno (byl tam i existující bug — single-slash komentáře místo `//` dělaly regex literály → ON→OFF path nikdy nefungoval). `refreshFavoritesToggle()` zachováno jako no-op (ostatní call-sites). **Help.html:** text přeformulován — „V side-menu klikni na… Zvýraznění je aktivní, dokud máš vyplněná klíčová slova. Vypneš smazáním textarey + save." |
| 2026-04-23 | **Stav karty: zvýraznění přeneseno z prefilled na loading + backdrop už nezavírá** (v20260423.11) — Bob pref. *(1)* **Prefilled styling zrušen** — původní záměr ve v08/09 bylo „upozornit user, že hodnota je z DB", ale správně má zvýraznění signalizovat „načítám, nelze psát". CSS `.card-check-input-row input.prefilled` + keyframes `prefilled-pulse` pryč; JS `applyCardCheckModal` už class nepřidává; HTML oninput nemaže. **Loading state zesílen** — původní jemný shimmer nahrazen kombinací: intenzivnější gradient (`var(--cat-bg)` ↔ `rgba(107,45,139,0.28)` shimmer peak), accent border, **duální animace** (`card-check-shimmer` 1.2 s linear + `card-check-loading-pulse` 1.6 s ease-in-out halo). Dark mode má tonalnější variantu. Reduced-motion zruší obě animace. *(2)* **Backdrop už nezavírá modal** — `onclick="closeCardCheckModal(event)"` odstraněn z `.modal-overlay`. Bob reportoval, že klik kamkoli v prostoru backdropu (běžný vedle úzkého modal-boxu) modal nechtěně zavřel, klávesnice zmizela, user ztratil rozepsanou hodnotu. Zavírání zůstává jen přes **×** a **Zavřít** btn (jak × tak Zavřít volají `closeCardCheckModal()` bez eventu). Původní target-check logika uvnitř fce odstraněna — už není potřeba. **Help.html** update: bod o „tlumeném fialovém pozadí při historii" přeformulován na „fialově bliká při načítání, psát nelze". |
| 2026-04-23 | **Mobile keyboard — Enter na money inputech = uložit** (v20260423.10) — Bob reportoval, že po tap do inputu vyskočí mobilní klávesnice, ale chybí tlačítko pro potvrzení + uložení volby. **Fix:** na třech money inputech (`card-check-value`, `corr-target`, `topup-amount`) přidán **`enterkeyhint="done"`** (OS klávesnice ukáže explicitně „Hotovo" na iOS / zelenou ✓ na Androidu) + **onkeydown handler**, který při stisku Enter zavolá příslušnou save fci (`saveCardCheckValue()` / `saveCorrection()` / `saveTopup()`) + `event.preventDefault()`. `!event.isComposing` guard pro IME (asijské jazyky). Pro `topup-amount` rozšířen existující onkeydown — Enter spustí save, ostatní blokace (+/-/e/E) zachované. **Pozn.:** pokud save btn je disabled (žádná změna hodnoty), Enter jen nic neudělá — stejné jako klik na tlačítko. |
| 2026-04-23 | **Tisícový separátor v displayi + zesílení prefilled inputu** (v20260423.09) — *(1)* **Nový helper `formatKcDisplay(n)`** s NBSP (`\u00A0`) tisícovým separátorem: „1 234,50", „12 345", „1 000 000". Regex `/\B(?=(\d{3})+(?!\d))/g` vkládá NBSP zleva po třech číslicích. Záporné + desetinné číslo podporované. `formatKcUnit` přesměrován na `formatKcDisplay`. **Migrace 11 display call-sitů**: cena jídla (quick-pick pill + tooltip plné ceny), subtotal per-item, korekce v summary (řádek + total), kredit v side menu („Na kartě"), historie kreditu (balance + tabulka), korekce modal (info „Původní / Stávající"), Stav karty summary + info, food tooltip. **Inputy (`corr-target`, `card-check-value`, `topup-amount`) NECHÁNY bez separátoru** — plain formát pro editaci (sanitize, caret, backspace bezproblémové). Pokud by Bob chtěl mezery i v inputech, varianta B uložena jako **#44** v backlog. **CSV export** beze změny (technický formát). *(2)* **Prefilled input zesílený**: intenzivnější brand-fialové pozadí (14% opacity z `rgba(107, 45, 139, ...)`), accent border + halo box-shadow + 2× pulse animace (`@keyframes prefilled-pulse`, 1.2 s ease-out) přitáhne pozornost hned po otevření modálu, pak se zklidní na stabilní halo. Reduced-motion respektováno. Dark mode zesílený (22% opacity). |
| 2026-04-23 | **Stav karty — úvod kratší, prefilled input zvýrazněn, info text přeformulován** (v20260423.08) — *(1)* Úvodní text: z „Dnes, Čt 23.04.2026. Zapiš hodnoty ze čtečky u menzy před a po obědě — Jídlogic porovná rozdíl s dnešní útratou." na **„Zapiš dnešní zůstatek na kartě (23.4.), vyčteš to ze čtečky před menzou."** Datum v úvodu teď v DD.MM. formátu (`formatDateDM_` místo `fmtDateCZ`). *(2)* **Prefilled input**: když je hodnota natažená z DB (`prefill !== null` — ať už dnešní záznam nebo odhad z lastPo/pred), input dostane class `.prefilled` → tlumené brand-fialové pozadí (`var(--cat-bg)`) + accent border. Vizuální signál, že hodnota je „natažená z DB, ne čerstvý zápis". `oninput` handler class sundá, jakmile user začne psát. Dark mode má tlumenější variant (`rgba(176, 125, 216, 0.14)`). *(3)* **Info text pod inputem**: z „Dnes uloženo 1,50 Kč 23.4. 13:10, Bohumil Jurencak" na **„Dnes (23.4.) zapsal/a/o Bohumil Jurencak v 13:10 1,50 Kč."** Čitelnější slovosled, „zapsal/a/o" pokrývá rody bez genderové detekce. **Help.html** update sekce Stav karty — přidán popis prefilled visual. |
| 2026-04-23 | **Loading overlay — poletující emoji na pozadí odstraněny** (v20260423.07) — Bob pref: 18 náhodných jídelních emoji (🍴🥄🍕…) plovoucích zdola nahoru přes `math-float` animaci bylo vizuálně rušivé při čtení kroků progresu. Odstraněn HTML div `<div class="math-bg">`, CSS `.math-bg` + `@keyframes math-float`, pomocný z-index helper pro `.loading-plate/.loading-text/…` („musí být nad pozadím"). Z JS pryč `spawnMathSymbols()` funkce (~15 řádků SYMBOLS array + generování) i její volání v `startLoadingAnimation`. V gitu najdeš původní implementaci v `ab0aed8~1` pokud by někdy byla potřeba. Výsledek: klidnější loading, ve středu plate + text + bar + watermark v rohu. |
| 2026-04-23 | **Loading overlay — brand watermark v rohu** (v20260423.06) — doplnil jsem decentní brand SVG badge do pravého dolního rohu loading overlay. Kombo s emoji rotací: centrální plate rotuje přes 📡/🧑‍🍳/…/💰 (dynamika), watermark 32×32 v rohu drží brand přítomnost (jistota). Bez animace, opacity 0.55 (light) / 0.45 (dark), pointer-events none. `aria-hidden` — pro screen readers neviditelný, čistě visual. Alternativní varianta „verze appky pod progress barem" uložena do backlog ideas jako **#43** (nízká priorita, ~25 min). |
| 2026-04-23 | **Loading overlay — emoji zpátky v krocích** (v20260423.05) — vrátil jsem emoji do `loadingSteps`, kterými jsem v v20260422.20 nahradil stabilním brand SVG (důvod tehdy: „clipboard 📋 ≠ brand"). Bob reportoval, že bez dynamiky je loading nudný → zpět všech 7, jen 📋 nahrazeno 📜 (svitek = jídelní lístek, víc kulinárně-brandové, bez mismatch). Mapping: 📡 Spojuji se s menzou → 🧑‍🍳 Hledám kuchaře → 🔍 Hledám odpověď… → 🐬 42 → 📜 Načítám menu → 🍽️ Připravuji talíře → 💰 Počítám kredit. **HTML default** loading-plate zůstává brand SVG (plynulý navaz z wrapper overlay — user nepozná, že jde o dva překryvy). První `advanceLoading()` přepne class na `.loading-plate.emoji-mode` a naplní `textContent` = emoji kroku 0 (📡). Pak rotace po 3.5 s, jako původně. **Finish/Error** zůstávají Lucide check-circle (zelený) / x-circle (červený) — emoji ✅/❌ jsou vizuálně chaotičtější. `plate-wobble` animace zůstává pro emoji i brand SVG (base class `.loading-plate` ji definuje, `emoji-mode` jen přepíše width/height/font-size). SW beze změny, Obedy.html only. |
| 2026-04-23 | **Loading overlay — díra mezi fade a krokem 0 vyplněna** (v20260423.04, SW beze změny) — po v20260423.03 Bob reportoval: wrapper se objeví, pak ~3 s díra „na obrazovce nic", pak začne „Spojuji se s menzou…". Root cause dvojí: *(1)* HTML default pro loading-text byl „Připravuji talíře…" (text z kroku 5), takže během čekání na rozjezd animace vypadal overlay nesrozumitelně. *(2)* Listener pro `wrapper-hidden` ACK byl registrován až uvnitř `startLoadingAnimationWhenReady()`, volaném z `init()` na konci skriptu — na mobilu parsing zbytku skriptu trvá 2-3 s, ACK (co chodí ~450 ms po handshake) odletěl do prázdna a animace se rozjela až na 600 ms fallback po init. **Fix:** *(A)* HTML default-state loading-overlay odpovídá kroku 0 (text „Spojuji se s menzou…", bar 10 %, „1 / 7"). *(B)* Early listener pro `wrapper-hidden` registrovaný hned za `fireEarlyHandshake` na začátku scriptu — nastavuje `wrapperHiddenFlag` + volitelný `wrapperHiddenCallback`. `startLoadingAnimationWhenReady` pak flag jen zkontroluje: pokud už ACK dorazil, start hned; pokud ne, nasadí callback a 600 ms fallback. Kombinací A+B user vidí: wrapper fade → plynule Obedy overlay s krokem 0 (static do doby, než animace rozjede, ale vizuálně konzistentní) → animace pokračuje. **SW bez bumpu** (index.html beze změny, jen Obedy.html). |
| 2026-04-23 | **Loading overlay — obousměrný handshake, kroky už neběží na pozadí** (v20260423.03, SW v12→v13) — Bob reportoval: PWA loading začíná vizuálně od kroku 2 („ultimátní otázka…"), kroky 0 a 1 probíhají skryté. Root cause: Obedy.html v `init()` volal `startLoadingAnimation()` hned, zatímco wrapper overlay v iframe parent (index.html) vise dokud nedorazí handshake (nebo 12 s fallback). Pokud handshake z nějakého důvodu nedorazí (cross-origin edge case, iOS Safari PWA), wrapper visí 12 s a Obedy kroky mezitím běží skryté. **Fix:** obousměrný handshake. (1) Obedy.html nová funkce `startLoadingAnimationWhenReady()` — pokud je v iframe, čeká na postMessage `{type:'wrapper-hidden'}` z wrapperu; fallback 600 ms (wrapper fade 400 ms + 200 ms safety); mimo iframe start hned. (2) index.html `fadeOutWrapperLoading` po dokončení fade (450 ms) pošle do iframe `postMessage({type:'wrapper-hidden'})`. (3) Fallback timeout v index.html zkrácen **12 s → 3 s** (postMessage je obvykle rychlý, 12 s byla zbytečná čekačka při selhání). **Checkpoint:** git tag `checkpoint-v20260423.02-funkcni` na commit `9ad3c1b` = stav před fixem (funkční PWA wrapper, ale kroky na pozadí). **Rollback:** `git reset --hard checkpoint-v20260423.02-funkcni` + clasp push/deploy. |
| 2026-04-23 | **PWA wrapper loading overlay** (v20260423.02, SW v11→v12) — Bob reportoval: po kliku na PWA ikonu OS splash zmizí a ~2 s následuje prázdná obrazovka (`#F7F7FA`), než GAS iframe doručí Obedy.html. Nic se neděje → user si říká „zatuhlo to". **Fix:** přidán `.wrapper-loading` overlay v index.html (z-index 10, nad iframe=1, pod welcome=20) se stejnou estetikou jako Obedy.html loading-overlay — brand SVG (Jídlogic koncept F) + `wrapper-plate-wobble` animace 1.4 s + text „Otevírám Jídlogic" s pulsujícími tečkami (`@keyframes wrapper-dots` 4-step content animation). Fade-out (400 ms) se trigger-uje **postMessage 'jidlogic-ready'** z Obedy.html (`fireEarlyHandshake` už existuje, dřív byl deprecated no-op — teď zase funkční). V ten moment už Obedy.html vnitřní loading-overlay renderuje, takže fade-out je pro user nepostřehnutelný přechod mezi dvěma překryvy stejného schématu. **Fallback 12 s timeout** pokud handshake nedorazí (cookie blocking, GAS 5xx, Google sign-in page) — overlay zmizí sám, user vidí iframe content a může reagovat. **Dark mode:** pozadí + text color tinted. **Reduced motion:** animace none, tečky static `…`. **SW bump v11→v12** aby PWA instance re-cachovaly nový index.html. **Pozn.:** `index.html` se hostuje na GitHub Pages (ne v GAS), deploy přes `git push`. |
| 2026-04-23 | **Kontrola karty — loading state inputu při otevření modalu** (v20260423.01) — Bob reportoval: modal se otevře, input je prázdný, user začne psát → async fetch `obedyNactiKontrolaKarty` doběhne a `applyCardCheckModal` mu hodnotu **tvrdě přepíše pod rukou** (race condition). Fix varianta A (disabled input se shimmer efektem): `openCardCheckModal` teď nastaví `input.disabled=true` + class `.loading` (CSS `@keyframes card-check-shimmer` 1.2 s linear, respektuje `prefers-reduced-motion`) + placeholder „Načítám poslední stav…". `applyCardCheckModal` na konci fetch odblokuje input a sundá shimmer; failure handler totéž (aby user aspoň mohl napsat novou hodnotu, i když historii neznáme). Visuální signal „počkej sekundu" je jednoznačný, race condition fyzicky nemožná. Pro případný zrychlený UX později: při druhém otevření téže session by šel cache `cardCheckData` → okamžitý prefill + tichý refetch na pozadí (zatím nenasazeno, cache by stárla mezi obědy).  **Help.html:** bullet „Klikni do inputu → hodnota se vymaže" přeformulován (od v20260422.24 se nemaže, jen označí přes `.select()`) + přidán krok o loading stavu. |
| 2026-04-22 | **Mic permission v iframe — `allow="microphone"`** (PWA wrapper, SW v10→v11) — Bob reportoval, že v PWA mikrofon pro Kontrolu karty diktování nejde pustit, i když v Chrome je povolený. Root cause: iframe v `index.html` měl `allow="clipboard-write"` bez `microphone` → prohlížeč automaticky zamítá Web Speech API request z iframe (`not-allowed` chyba), nezávisle na OS / browser settings. Fix: `allow="clipboard-write; microphone"`. Nyní při prvním kliknutí na mic v Kontrola karty modalu prohlížeč vyvolá OS prompt pro `script.google.com` mic permission; po povolení Web Speech API funguje. |
| 2026-04-22 | **PWA wrapper zjednodušen — welcome modal místo auth-gate** (v20260422.21, SW v9→v10) — odstraněn celý auth-gate overlay, postMessage handshake, Storage Access API logika, 3s timeout ladění. Nahrazeno **jednorázovým welcome modalem** na first-run (localStorage flag `jidlogic-welcomed`). Obsah: vítací text, seznam požadavků (přihlášení @blogic.cz + povolené cookies), amber „fallback note" s odkazem na přímou GAS URL pro případ cookie blocking v iframe. Po kliknutí „Rozumím, pokračovat" se flag uloží a modál se už nikdy nezobrazí. **Proč:** dřívější auth-gate detekoval cookie blocking (Chrome Tracking Protection) nespolehlivě — false positives u validních blogic userů. PostMessage handshake z Obedy.html → PWA wrapper dříve fungoval, ale přes den se Chrome cookie policy pravděpodobně zpřísnila (původní `v20260422.13` logika ráno fungovala, odpoledne nefungovala). Místo boje s prohlížečem — **trust, but explain**: user je dospělý, poví mu se, co potřebuje, a pokud appka nejede, má escape hatch v modalu. **SW v9 → v10:** přechod z plného ikona bundle v SHELL_URLS (9 souborů — race condition s GitHub Pages propagation potenciálně shodila install) na **minimal core shell** (4 soubory) + **on-demand caching** ikon přes fetch handler. Robustnější proti failed resource. Early postMessage v Obedy.html **zachovaný** (deprecated ale neškodí) pro případ, že by PWA wrapper někdy handshake znovu potřeboval. |
| 2026-04-22 | **Auth-gate: Storage Access API pokus + fallback „Otevřít přímo"** (PWA wrapper, SW v8→v9) — experimentální přístup k řešení Chrome Tracking Protection bez opuštění iframe. Feature detect `document.requestStorageAccessFor` (Chrome 120+, enterprise/experimental) → pokud je dostupná, v auth-gate se zobrazí tlačítko **„Povolit cookies v iframe"**. Klik zavolá `requestStorageAccessFor('https://script.google.com/')` — prohlížeč vyskočí OS prompt s žádostí o povolení cookies pro Google uvnitř iframe. Pokud user potvrdí → iframe se reloaduje, cookies projdou, Obedy.html se načte normálně. Pokud browser API nepodporuje nebo user odmítne → fallback „Otevřít Jídlogic přímo" v novém tabu (bez iframe). **Pozn.:** API je experimentální a nefunguje ve všech browserech/kombinacích. Pokud nefunguje ani na Bob's Chrome mobile, zkusíme další alternativy (full-page redirect místo iframe, nebo navigace přímo na GAS URL jako PWA start_url). |
| 2026-04-22 | **Auth-gate: „Otevřít přímo" tlačítko pro Chrome Tracking Protection** (PWA wrapper, SW v7→v8) — Bob potvrdil, že GAS URL funguje v Chrome mobile PŘÍMO, ale NE v iframe přes `jurencak-bob.github.io`. Root cause: Chrome Mobile 2024+ **Tracking Protection** blokuje třetí-stranné cookies pro `script.google.com` v iframe kontextu → GAS vrátí Google sign-in page (user nebude cookie-recognized), iframe nezavedle Obedy.html → žádný postMessage → auth-gate. Není to regrese kódu, je to prohlížeč. **Fix (workaround):** `auth-gate` text přepsán jako vysvětlení cookie problému + **primární tlačítko „Otevřít Jídlogic přímo"** → href direct na GAS URL (`target="_blank"`, otevře nový tab bez iframe). Sekundární „Přepnout Google účet" zůstává pro případy jiných příčin (není blogic, není signed in). SW bump v7 → v8 pro re-fetch. **Trvalé řešení (future work):** přechod na Storage Access API pro iframe + user gesture trigger, případně redesign bez iframe (PWA pointing directly at GAS URL, ztráta custom manifestu/SW kontrolu). Pro teď: Otevřít přímo je praktický workaround. |
| 2026-04-22 | **Loading overlay — centrální ikona Jídlogic místo rotace emojů** (v20260422.20) — dřív centrální `.loading-plate` rotovala přes 7 emojů (📡 → 🧑‍🍳 → 🔍 → 🐬 → **📋** → 🍽️ → 💰) v krocích po 3,5 s; Bob reportoval, že to vypadá nekonzistentně (clipboard ≠ brand). Teď: SVG Jídlogic logo (koncept F) stále, jen `plate-wobble` puls animace; text se dál mění podle fází. Při `finishLoading` → přepnutí na Lucide `check-circle` (zelený, `plate-success-pulse` animace); při `showLoadingError` → Lucide `x-circle` (červený, `plate-error-shake`). `loadingSteps` array má jen `text` + `pct` (emoji field odstraněn). Respektuje `prefers-reduced-motion`. Matematické/jídelní symboly v pozadí (`#math-bg`) zůstávají — dekorativní layer beze změny. |
| 2026-04-22 | **Auth-gate false positive fix — early postMessage + delší timeout** (v20260422.20 + PWA wrapper SW v6→v7) — Bob reportoval: v PWA režimu s validním @blogic.cz účtem viděl auth-gate („nejsi přihlášen"). Příčina: `postMessage('jidlogic-ready')` byl uvnitř `initUI()`, která běží AŽ po `obedyNactiData()` (2–5 s na GAS). Index.html timeout 1,2 s → auth-gate se ukázal DŘÍV než dorazil signál; pokud backend selhal (`withFailureHandler`), postMessage nikdy nedorazil → auth-gate trvalý. **Fix:** (1) Nová IIFE `fireEarlyHandshake` na začátku Obedy.html script blocku — postMessage se odešle **okamžitě** jak začne script běžet, bez čekání na backend. Druhý postMessage z `initUI()` zůstává pro user-info payload po načtení dat. (2) Index.html timeout z 1200 ms → **3000 ms** (safety margin pro pomalá zařízení/sítě). (3) SW bump v6 → v7 pro re-cache index.html. **Poznámka k cookie blocking:** pokud uživatel má v prohlížeči zablokované třetí-stranné cookies (iOS Safari ITP default, některé Chrome nastavení), GAS cross-origin iframe nedostane auth cookie → vrátí vlastní sign-in page → Obedy.html se nenačte → auth-gate se správně ukáže. To není regrese, ale skutečný limit — user musí povolit cookies pro `script.google.com` nebo otevřít aplikaci v non-PWA režimu. Auth-gate to v textu už zmiňuje („V prohlížeči máš problém se soubory cookie nebo iframe"). |
| 2026-04-22 | **Kontrola karty — redesign modálu (UX fix)** (v20260422.19) — 2-input modál z `.18` měl bug (klik do 2. inputu zavíral modal, prav. kvůli event bubbling skrz backdrop onclick) a UX problém (musíš řešit 2 inputy zároveň). Nová struktura: **jeden dropdown** (Stav před / Stav po) + **jeden input** s prefill + **jedno Uložit** aktivní jen když hodnota ≠ uložená. **Prefill logika:** pokud dnes už uloženo → ukáže hodnotu; pro „Stav před" bez dnešního záznamu → pokus o `lastPo` (nejnovější „Stav Po" z předchozích dnů pro tohoto uživatele, backend helper `najdiPosledniStavPo_`); pro „Stav po" → dnešní pred jako první odhad. Po kliknutí do inputu se hodnota **vymaže** (onfocus) aby user mohl napsat novou. **Desetinné hodnoty:** nová funkce `sanitizeCardCheckInput()` povoluje max 2 místa za čárkou (setiny Kč). **Speech API:** permission pre-check přes `navigator.mediaDevices.getUserMedia({audio:true})` — vyvolá OS dialog při první žádosti, pokud už dřív odmítnuto, ukáže toast s návodem (ikona zámku → Mikrofon → Povolit). Chybové kódy Web Speech API (`not-allowed`, `no-speech`, `audio-capture`, `network`, `aborted`, `service-not-allowed`, `language-not-supported`) přeloženy do čitelné češtiny. **closeCardCheckModal** přepsán — přesnější check cílů (backdrop, křížek, Zavřít) s použitím `closest()` fallback pro nested elementy. |
| 2026-04-22 | **Kontrola karty** (idea #33, Phase 1, v20260422.18) — nová feature pro sběr stavu karty Před/Po obědem ze čtečky u vstupu do menzy. **Backend:** nový list `Kontrola karty 💳` v Jídlogic DB (A Datum, B Email, C Čas Před, D Stav Před, E Čas Po, F Stav Po), jeden řádek na (den, uživatel) s přepisem. `zajistiListKontrolaKarty_` idempotentní migrace. Endpointy `obedyNactiKontrolaKarty()` a `obedyUlozKontrolaKarty(typ, amount)` — backend striktně dovoluje zápis jen pro dnešek (Europe/Prague TZ), guest-hide. Pomocné funkce `spoctiUtrDneProUzivatele_` (součet útraty z Výběr obědů) a `obedyNactiKontrolaKartyData_`. **Ext sheet:** nový queue type `kontrolaKarty` v OBEDY_EXT_QUEUE; dispatcher v `zpracujExtSheetFrontu` přidán (dobiti/kontrolaKarty/default=lunch). `zapisKontrolaKartyDoExternSheetu_` najde řádek dne (stejně jako lunch) + hlavičku sloupce „Karta před" / „Karta po" přes existující `najdiSloupecProExtSheet_`; zapíše číslo do buňky + strukturovanou poznámku (Zapsal, Kdy, Zdroj: Jídlogic). **Frontend:** nová položka „Kontrola karty" v burger menu (Lucide `credit-card` ikon, guest-hide). Modal `#card-check-overlay` se dvěma inputy (Před / Po) + mic tlačítkem (Web Speech API, `lang=cs-CZ`, parsing číslic z transcriptu) + individuální Uložit. Feature detection přes `window.SpeechRecognition || webkitSpeechRecognition` — pokud chybí, body dostane `.no-speech-api` class a mic buttony jsou skryté (Firefox). Summary pod inputy: Jídlogic útrata dne, rozdíl (Před−Po), shoda s tolerancí 0,01 Kč. Optimistic sync UI (pending badge, polling po save). Help sekce nová „Kontrola karty" před „Soukromí v sheetu". |
| 2026-04-22 | **Dokončení #35 — ikona v loaderu + auth-gate** (PWA wrapper, sw.js v5→v6) — `index.html` `.loader-icon` (📋) → inline SVG kopie Jídlogic ikony (72×72, `pulse` animace zachována). `.auth-gate .gate-lock` (🔒) → Lucide `lock` SVG (32×32, bílé stroke na fialovém kruhu). Font-size styl odstraněn, přidán `.gate-lock svg` selector s `stroke: currentColor` (respektuje dark mode svg color overrides). Tímto je koncept F (talíř s quick-pick pillem) ve **všech pěti místech** — home screen PWA, manifest, hlavička Obedy.html, loader před iframe handshake, auth-gate pro non-blogic uživatele. |
| 2026-04-22 | **Jídlogic ikona i v hlavičce appky** (v20260422.17) — 🍽️ emoji v `.header-title.app-title` (vedle textu „Jídlogic") nahrazeno inline SVG s novým konceptem F. Blogic logo zůstává v patičce (refactor .02). `<span class="app-logo">` wrapper + CSS `width/height: 26px` pro header kontext. Inline SVG (ne `<img>`) protože Obedy.html je servováno z GAS a k PWA assetům na GitHub Pages nedosáhne — kopie SVG zdroje přímo v HTML drží vizuál in-sync s `icon.svg`. V budoucnu když se bude měnit design, updatovat oba zdroje naráz. |
| 2026-04-22 | **Nová PWA ikona — koncept F „talíř s quick-pick pillem"** (idea #35 HOTOVO, 2026-04-22) — `icon.svg` přepsán: fialové pozadí zrušené, nově světle šedé (`#F7F7FA`) rounded-square pozadí s bílým talířem (stroke `#6B2D8B` 22 px), pale-purple vnitřní kruh (`#E9D5F4`), bílý pill ellipsa se stejným fialovým strokem + vycentrovaný bold `1` (`#6B2D8B`) font-size 116 — přímý odkaz na quick-pick pill, kde user klikne na číslo jídla. Odráží hlavní interakci appky. **Asset bundle:** `icon-192.png`, `icon-512.png` (PWA core), `apple-touch-icon.png` (180×180, iOS), `favicon-32.png` + `favicon-16.png` (browser tab). Generace přes ImageMagick (`convert -density 300 -background none icon.svg -resize ...`). `manifest.json`: všechny `icon` URL mají `?v=20260422` cache-buster + zachovány `purpose: any` a `purpose: maskable` pro 192/512. `index.html`: přidány `<link rel="icon">` pro PNG 16/32 + `<link rel="apple-touch-icon">` pro 180 + 192. `sw.js`: bump `jidlogic-shell-v3` → `v5` + shell cache obsahuje všechny nové ikony s cache-buster query. Na ploše telefonu se po hard-reinstallu PWA objeví nová ikona. |
| 2026-04-22 | **Validace inputů v dobití + korekci — blokace zápornky na úrovni klávesnice** (v20260422.16) — `topup-amount` a `corr-target` měly jen JS validaci na `saveTopup()`/`saveCorrection()` — browser dovolil minus napsat (atribut `min` je hint, ne blokace). Přidáno `onkeydown` blokující `-`, `+`, `e`, `E` (vědecký zápis) + `oninput` sanitizace (topup: jen číslice; correction: číslice + jeden desetinný oddělovač `.`/`,`). JS validace v `saveTopup`/`saveCorrection` zůstává jako safety net. **Poznámka pro budoucí #34 Migraci z ext sheetu:** ve sdíleném sheetu jsou útraty uložené jako **záporné hodnoty** (odčítání od karty) — je to přirozené v tom kontextu. Blokace v inputu Jídlogicu se týká jen **ručního dobití** (vždy kladné) a **cílové částky korekce** (absolutní suma, co jsem skutečně zaplatil, nikdy negativní). Při čtení ext sheetu se záporné hodnoty normálně přijmou, jen se při mappingu do Jídlogic modelu převedou na příslušný typ (útrata vs. dobití). |
| 2026-04-22 | **Fix: badge ceny na mobilu zarovnaný se šířkou − / +** (v20260422.15) — `.food-price.tappable` má v desktopu `margin: -4px -4px` pro rozšířenou hit area (tap-to-toggle). V mobilním `@media (max-width:640px)` blocku `.food-controls .food-price` přepisuje padding, ale **ne margin** — badge se vtahoval o 4 px dovnitř parent boxu, působil „přilepený" na ±tlačítka a nebyl zarovnaný od začátku − do konce +. Fix: explicitní `margin: 0` v obou mobile selektorech (`.food-controls .food-price` + `.food-controls .food-price.tappable` — druhý kvůli override stejné specificity). Vertikální padding zvýšen z 2 px na 4 px pro lepší tap-target na mobilu. Desktop beze změny. |
| 2026-04-22 | **Animované přesýpací hodiny + sjednocený toggle zavřených dnů** (ideas #37+#38 HOTOVO, v20260422.14) — *Idea #37:* `day.reason === 'not-yet-loaded'` (pracovní den před stažením menu, typicky ráno) teď má **amber animované přesýpací hodiny** v closed-day větvi `renderMenu`. CSS `.hourglass-waiting` (amber `#F59E0B` light / `#FBBF24` dark) obaluje `icon('hourglass')`; `@keyframes hourglass-flip` je **stepped flip** (3s cyklus: 0–45% klid vertikálně, 45–50% flip o 180°, 50–95% klid překlopené, 95–100% dolet na 360° pro plynulý reset) — ladí se decentním pulsem víkendového slunce. Respektuje `prefers-reduced-motion`. *Idea #38:* dva původní toggly v side-menu („Víkendy a svátky" + „Odstávky menzy") sjednoceny do jednoho **„Zavřené dny"** (`closed-days-toggle` + `toggleClosedDays()` + `updateClosedDaysToggleUI()`). Lokální storage migrace: nový klíč `jidlogic-closed-days`; pokud ještě neexistuje, spojí staré `jidlogic-weekends` + `jidlogic-closures` (OR logika) a staré klíče smaže. **Dnešní closed den je vždy viditelný v datepickeru** (bez ohledu na toggle) — `isDayHidden()` vrací false pro `day.date === DATA.todayStr`, takže user vidí aktuální stav. Nová hláška **„Těš se, další pracovní den je DD.MM.YYYY"** se zobrazí v detail-cardě dnešního closed dne (noService bez `reopenDate`, víkend, svátek, not-yet-loaded) — backend `obedyNactiData` teď vrací `nextWorkingDay` přes nový helper `najdiDalsiPracovniDen_` (v `Menza.feed.js`, iteruje den po dni od zítřka, skip víkend/svátek/odstávka, limit 366 dní). Nová ikona `smile` v `ICONS`. Help.html „Datepicker" sekce přepsána (unified toggle + amber hourglass + dnešek vždy viditelný). Verze .13 → .14. |
| 2026-04-22 | **Help dual-state barvy + auth gate pro non-blogic** (v20260422.13) — *Help.html* rozšířena o sekci „Barvy řádků" v „Jak si zapíšu oběd" (fialová=saved, oranžová=dirty, s vysvětlením mobile cena-badge). *JIDLOGIC-DOKUMENTACE.md* rozšířena sekce Frontend o popis dual-state systému, tap-to-toggle flow a info tooltip. *Auth gate pro non-blogic* (GHPages wrapper): `index.html` má teď **tři vrstvy vstupu**: (1) primární — loader mizí po `postMessage({type:'jidlogic-ready'})` z iframe (Obedy.html `initUI` nově posílá tento handshake), (2) sekundární — `iframe.onload + 1.2 s timeout`: pokud přišel onload ale ne ready message, zobraz auth-gate overlay (user je v Google login/error page), (3) tvrdý 8 s timeout pro síťový fail. **Auth-gate overlay** má lock ikonu, popis „Jídlogic je jen pro @blogic.cz" s nápovědou k možným příčinám, tlačítko „Přihlásit / přepnout Google účet" (→ accounts.google.com/AccountChooser) a „Načíst znovu". Dark mode podporovaný. Gate je mimo GAS scope → řeší problém, že dříve non-blogic user viděl jen Google error page bez kontextu. **Deploy této změny je dvoustupňový**: Obedy.html → clasp (GAS), index.html → git push (GHPages). Verze .12 → .13. |
| 2026-04-22 | **Soukromí v ext sheetu** (idea #36 HOTOVO, v20260422.12) — per-user volba úrovně detailu v poznámkách buněk sdíleného sheetu. Dva režimy: **`detail`** (default, plné názvy jídel — „1. Smažený sýr, brambory (89 Kč)") a **`anonym`** (jen kategorie+č+cena — „oběd · č.1 · 89 Kč"). Audit trail (podpis, celkem) zachován v obou režimech. **Backend:** nový sloupec F „Soukromí" v listu Uživatelé s drop-down validací; auto-migrace přes `doplnHeaderSoukromi_` (analogický s D/E helpery). `najdiUzivatele_` vrací `privacyMode`; `obedyNactiData.user.privacyMode` propagace do frontendu; nový endpoint `obedyUlozPrivacyMode(mode)`; `naplnujExtSheetZapis_` rozšířen o parametr `privacyMode` v payload; `zapisDoExternSheetu_` generuje noteParts podle `job.privacyMode` (detail/anonym switch). Cache bump `obedy_user_v4_` → `v5_`. **Frontend:** nová položka „Soukromí v sheetu" v burger menu (guest-hide, ikona Lucide eye-off), modal `#privacy-overlay` se dvěma radio buttons (detail/anonym) se stylem `.privacy-radio`, JS funkce `openPrivacyModal / closePrivacyModal / savePrivacyModal`. Nová Help sekce před „Oblíbená jídla". Dobití / korekce nedotčené (bez citlivého obsahu). Verze .11 → .12. |
| 2026-04-22 | **Cena badge jen pro vybraná jídla (mobile)** (v20260422.11) — na mobilu (<640px) měla `.food-controls .food-price` trvale fialový badge (`rgba(107,45,139,0.10)`), i když user jídlo vůbec nevybral (qty=0). Nyní je **default transparent** a badge se zobrazí jen u `.food-item.saved` (fialový) nebo `.food-item.dirty` (oranžový) — ladí se zbytkem dual-state palety. Na desktopu beze změny (hover efekt v `.food-price.tappable:hover` už funguje správně). Verze .10 → .11. |
| 2026-04-22 | **Čas u čerpání (oběd) v historii kreditu** (v20260422.10) — `nactiKredit_` agregoval výdaje per-day a ztrácel čas (výstup byl `dd.MM.yyyy —`). Nově během agregace vybírá čas **nejnovějšího zápisu** dne (`vData[j][1]` = sloupec B „Čas zápisu" z listu Výběr obědů) a připojuje ho k datu v formátu `dd.MM.yyyy HH:mm`. Pokud řádek nemá platný Date time (jen string fallback), použije string. Pokud neexistuje žádný čas, fallback na `—` (původní chování). Tolerantní pro smíšená data (Date + string). Verze .09 → .10. |
| 2026-04-22 | **Auto-doplnění hlaviček D/E v listu Uživatelé** (v20260422.09) — sloupce D („Oblíbená") a E („Oblíbená aktivní") z idea #32 měly auto-migraci ve `obedyUlozOblibena` jen pro `lastCol < 4`. Pokud user už měl data v D/E bez hlavičky, migrace se přeskočila. Nový helper `doplnHeaderyOblibene_(sheet)` idempotentně doplní obě hlavičky (fialové pozadí, bold, center, text „Oblíbená" / „Oblíbená aktivní") pokud D1/E1 buňka neobsahuje správný popis; přidá i data validation ANO/NE pro E2:E100. Helper se volá z `zajistiListUzivatele_` při každém `obedyZajistiListy_` — tj. při `obedyNactiData` (první fáze). Verze .08 → .09. |
| 2026-04-22 | **Dual-state barvy řádků (saved / dirty)** (v20260422.08) — dříve jediná class `.food-item.selected` = vše qty>0 v oranžové. Rozlišení mezi „uloženo v DB beze změny" a „čeká na potvrzení" chybělo. Nové dvě vzájemně vylučovací třídy: **`.saved`** (fialová, brand accent) pro `qty > 0 && qty === savedQty` + **`.dirty`** (oranžová) pro `qty !== savedQty` (jakákoli změna — new / change / remove). `.selected` zachována jako helper pro qty-controls visibility a nově zahrnuje i `qty === 0 && savedQty > 0` (dirty remove) — user vidí `− 0 +` aby mohl undo. `savedQty` se lookupuje z `DATA.selections[day.date]` podle `item.cislo`. Po `confirmSelection()` se sync přes renderMenu → bývalé dirty jídlo okamžitě zfialoví jako saved. Verze .07 → .08. |
| 2026-04-22 | **Ext sheet podpis zkrácen** (v20260422.07) — v poznámkách buněk v externím sheetu se místo „Zdroj: Jídlogic appka" zapisuje nově **„Zdroj: Jídlogic"**. Zápisy v `zapisDoExternSheetu_` (obědy) a `zapisDobitiDoExternSheetu_` (dobití) aktualizovány. Detektor `detectExternalExtSheetEdit_` rozpoznává **obě varianty** podpisu (`indexOf('Zdroj: Jídlogic') >= 0` — kratší podřetězec zachytí i historickou „Jídlogic appka") → backward compat, historické buňky se neoznačí jako externí. Testy rozšířeny o assert pro nový podpis. Verze .06 → .07. |
| 2026-04-22 | **Tap-to-toggle + loading tweaks** (v20260422.06) — *(1) Tap chování změněno z add na toggle:* qty=0 → +1, qty=1 → 0 (odebere), qty≥2 → no-op (musí přes −/+). Chrání před náhodným odebráním vyššího počtu. `tapAddItem` přepsán s inline guardy. *(2) Rozšířená hit area:* `.food-name.tappable` teď `display: block` + padding 8px + min-height 36px + negativní margin kompenzace — klikatelná celá „buňka" řádku, ne jen text. Hover/active subtle background feedback. *(3) `.food-item.qty-locked` class* (qty≥2) přidaná v renderMenu → vypíná cursor pointer a hover efekt u tappable oblastí. *(4) Tooltip v category-header i Help sekce „Jak si zapíšu oběd"* aktualizovány na toggle logiku. *(5) Loading texty cleanup:* „Ultimátní" → „ultimátní" (malé u) + odstraněny koncové trojtečky u „Hledám odpověď…"; „…našel jsem číslo 42…" → jen „42". Verze .05 → .06. |
| 2026-04-22 | **Víkendové oranžové animované slunce** (v20260422.05) — `day.reason === 'weekend'` ikona obalena do `<span class="sun-weekend">` s barvou amber-500 (`#F59E0B`, dark `#FBBF24`). Celý svg rotuje 60s pomalu, 8 paprsků (`path:nth-child(2..9)`) pulsuje opacity 0.45↔1 s 0.3s stagger delay → vlnovitý „shine" efekt. Circle (středové slunce) se nemění. Respektuje `prefers-reduced-motion`. Verze .04 → .05. |
| 2026-04-22 | **Tap-to-add flow** (v20260422.04) — Nový výchozí způsob výběru jídla: qty controls `− 0 +` už NEJSOU viditelné od začátku. V čistém menu je jen **název + cena**. **Klik/tap na název nebo cenu** → přidá 1 ks; první přidání zobrazí `− 1 +` tlačítka; další tap na stejný řádek → qty = 2, 3, … Tlačítka `− / +` fungují standardně (každý klik ±1; qty=0 je skryje). Implementováno přes: CSS `.qty-controls { display: none }` výchozí → `.food-item.selected .qty-controls { display: flex }`, CSS `.tappable` class s `cursor: pointer` + hover color accent, `renderMenu` přidá onclick + class na food-name a food-price pro editable dny a ne-host uživatele, nová funkce `tapAddItem(idx)` jako alias pro `changeQty(idx, +1)` využívající všechny existující guards (marker hard limit 1, conflict modals). Text tooltipu v category-header i Help sekce „Jak si zapíšu oběd" aktualizovány. Quick-pick pill beze změny (otevře modal, uloží 1× nahradí výběr). Verze .03 → .04. |
| 2026-04-22 | **„i" tooltip v category-header** (v20260422.03) — V prvním category-header v menu card (typicky POLÉVKY, v dnech bez polévek první jiná kategorie) vpravo drobná **ⓘ ikona** (Lucide `info`). Klik otevře popover tooltip: „Jak vybírat — Tlačítka − / + ubírají/přidávají ks; Číslo vlevo = rychlá volba (uloží 1× a nahradí celý dnešní výběr); Polévky nejdou přes rychlou volbu — musí přes +." Struktura: `<span class="info-wrap">` (position: relative) obsahuje button + tip sourozence (NE div uvnitř button — invalid HTML). Zavírá se × v tipu, kliknutím mimo, nebo klávesou ESC. Zobrazuje se jen pro editable dny a ne-host uživatele. Dark mode: invertované barvy. Mobile: `max-width: calc(100vw - 40px)` aby neprolezl viewport. Verze .02 → .03. |
| 2026-04-22 | **Layout refactor: header + date-sub + mobile day-stats** (v20260422.02) — *(1) Header:* Blogic logo přesunuto z levého rohu hlavičky do patičky (jako decentní firemní brand); v hlavičce teď primárně **název appky „Jídlogic"** v brand fialové, tučnější font. `.header-title.app-title` styl override. Patička dostala `.footer-blogic` link s obrázkem (opacity 0.7 → 1 na hover). *(2) Date-sub:* odstraněn duplicitní text „Můžeš upravit svůj výběr" / „Pouze náhled" / „Vyber si jídla…" — editable stav je vidět z přítomnosti +/− tlačítek a tlačítka „Potvrdit", readonly má vlastní oranžový banner. Místo duplicity je tam teď **`day.fetchedAt`** (Jídelníček načten DD.MM.YYYY, HH:MM) — sanity info o času stažení. Současně odstraněn stejný banner z hlavičky menu card (duplicitní). *(3) Day-stats mobile layout:* dříve column (pod sebou vpravo), teď **row** (3 badge vedle sebe, `flex: 1; justify-content: space-between`) uvnitř `.date-row` s `flex-direction: column` — tj. header → fetchedAt → 3 badge → menu-card. Desktop beze změny. Help sekce „Kdy je jídelníček" updatována („Pod datumem" místo „V hlavičce karty menu"). |
| 2026-04-22 | **Version counter fix** — Claude 21.–22.4. chybně pokračoval v prefixu `20260420.XX` místo resetu na nový den. Aktuální stav kódu (closed day Lucide ikony + conflict modal fix) přeznačen z `v20260420.50` na **`v20260422.01`** (první deploy 22. dubna). Memory `feedback_version_footer.md` doplněno o explicitní varování před touto chybou. |
| 2026-04-22 | **Dva drobné icon fixy** (verzováno jako `v20260420.50`, retroaktivně měla být `v20260422.01`) — (1) Closed day reason ikony pro weekend a not-yet-loaded dostaly Lucide ekvivalenty: nové `sun` (☀️, emoji fallback 🌴) a `hourglass` (přesný ekvivalent ⏳). `renderMenu` v closed-day větvi nyní používá pro všechny 4 stavy `icon()` helper (weekend, holiday, not-yet-loaded, no-service). (2) Quick-pick conflict modal (varování „přepíše stávající výběr") mělo ⚠️ v textu bez Lucide wrapperu — obaleno v `icon('triangle-alert')`. |
| 2026-04-22 | **Bug fix: dnešek „not-yet-loaded" mizel z datepickeru** — `isDayHidden` nekompromisně skrývala všechny `closed && !noService` dny při vypnutém `showWeekends` toggle (default OFF). `not-yet-loaded` (pracovní den před stažením menu, typicky ráno) je klasifikovaný jako `closed: true` → spadlo to do této větve → dnešní den se v datepickeru vůbec neobjevoval, dokud menza nezveřejnila menu. Oprava: `isDayHidden` nyní respektuje `day.reason !== 'not-yet-loaded'` — pracovní den bez menu zůstává vždy viditelný (toggle víkendů se ho netýká). Objevil Bob 22.4.2026 dopoledne. Verze .48 → .49. |
| 2026-04-21 (noc) | **Swipe návrat ke standardu** — animace v `touchend` vrácena na **standardní carousel pattern** (iOS Photos / Instagram / Material You): stará karta letí ve směru prstu, nová přichází z opačné strany. `slideOut = dx > 0 ? +winW : -winW`, slide-in z `-slideOut`. (.47 měla obrácenou logiku „nový obsah ze strany prstu" jako experiment, .48 návrat na standard pro lepší předvídatelnost.) Rubber-band ještě snížen `dx * 0.2` → `dx * 0.1` (jen jemný náznak gesta). Mapping dne beze změny: swipe doprava = starší. Verze .47 → .48. |
| 2026-04-21 (noc) | **Burger menu kredit + swipe doladění** — *Side-menu header:* `menu-user-credit` přesunut z block-level pod `user-row` dovnitř pravého textového sloupce (`.user-text`) — kredit je teď zarovnaný **pod jménem a emailem** (ne pod celým řádkem s avatarem). `.user-text { flex: 1; min-width: 0 }` + `margin-top: 6px` na credit (dříve 12px). *Swipe touchend animace:* (1) rubber-band displacement snížen z `dx * 0.4` na `dx * 0.2` — méně „gumové", pevnější odezva; (2) **nový jídelníček přilétá ze strany prstu** (ne z opačné jako standard carousel). Stará karta letí proti směru prstu („uhýbá" přitahované nové). `slideIn = dx > 0 ? +winW : -winW`, `slideOut = -slideIn`. Konzistentní s mental modelem „přitahuju si nový den". Verze .46 → .47. |
| 2026-04-21 (noc) | **Readonly den: skrýt „1×" u markeru** — v `renderMenu` pro neditable dny (historie) se u vybraného item zobrazuje `qty×`. Pro marker „Tento den oběd mimo menzu." to ale nedávalo smysl — je to binární flag (byl / nebyl), ne počet. Změna `else if (isSelected)` → `else if (isSelected && !isMarker)`. V editable režimu beze změny (marker má +/− controls s hard-limit 1). Konzistentní se skrýváním `qty×` v summary (verze .43). Verze .45 → .46. |
| 2026-04-21 (noc) | **Readonly den: pill disabled všem jídlům** — dříve v readonly dnu (starší než `EDIT_DAYS_BACK`) měly polévky `disabled` pill (šedý, přerušovaný okraj), ale ostatní jídla měly normální vzhled pillu (fialový okraj) — jen onclick byl prázdný. Vizuální rozpor: pill vypadal klikatelný, ale nic nedělal. Fix v `renderMenu`: `pillCls += (isSoup || !editable) ? ' disabled' : ''` — v readonly dnu dostanou všechna jídla disabled styl. Onclick logika beze změny (editable=false → ''). Verze .44 → .45. |
| 2026-04-21 (noc) | **Tooltip ceny zarovnán vpravo** — default `[data-tooltip]::after` pattern je centrovaný (`left:50%; transform:translateX(-50%)`), na mobilu u `.food-price` badge přetékal mimo pravý okraj viewportu. Override `.food-price[data-tooltip]::after { left:auto; right:0 }` lícuje pravý okraj tooltipu s pravým okrajem badge; šipka `::before` zůstává nad středem badge přes `right:50%; transform:translateX(50%)`. Konzistentní na mobilu i desktopu. Verze .43 → .44. |
| 2026-04-21 (noc) | **Summary: marker zjednodušení** — v sekci „Tvůj výběr" pro řádek s markerem „Tento den oběd mimo menzu." (`MARKER_CISLO === '__BEZ_OBEDA__'`) přestáváme renderovat `qty×` a `subtotal` — zobrazí se jen název. `Celkem 0 Kč` v sekci souhrnu se vykresluje standardně (zůstává). Cílem je minimalistická stopa bez zbytečných „1×" a „0 Kč" pro marker. Verze .42 → .43. |
| 2026-04-21 (noc) | **Swipe inverzní mapping** — v `touchend` swipe handleru prohozeno `direction = (dx < 0) ? +1 : -1` na `(dx > 0) ? +1 : -1`. `DATA.days` je sestupné (index 0 = dnes, vyšší = starší), `direction +1` znamená starší den. Nově: **swipe doprava = předchozí den (starší)**, **swipe doleva = následující den (novější, blíž k dnešku)**. Slide-out animace sleduje směr prstu (karta letí do strany gesta, nový obsah přichází z opačné strany — carousel feel). Záměrně proti standardnímu carousel patternu — odpovídá user mental modelu „šipka doprava = zpět v čase". Help sekce aktualizována. Verze .41 → .42. |
| 2026-04-21 (pozdní večer) | **Ext sheet external-edit detection** (idea #31 Variant A HOTOVO) — lehká defense-in-depth vrstva v `zapisDoExternSheetu_`. Před `cell.setValue(-celkem)` se přečte `cell.getValue()` + `cell.getNote()`. Pure helper `detectExternalExtSheetEdit_(prevValue, prevNote, newTotal)` rozhodne, zda obsah vypadá jako externí úprava (poznámka neobsahuje „Zdroj: Jídlogic appka" a buňka není prázdná / default 0). Pokud ANO → log warning + admin email (`posliMailManualniEditExt_`). **Žádná auto-korekce cen ani Kreditu** — Jídlogic pokračuje autoritativně, je to jen observability signal. Edge cases testované v `obedy.tests.js` (`test_detectExtEdit_*`, 8 nových testů, 10 case-variant verifikováno i v node mimo GAS). Plná #31 (re-price reconciliation) parkována do implementace #17 (Admin role), viz ideas. Verze .40 → .41. |
| 2026-04-21 (večer) | **Save overlay + testy + #18 audit** — (idea #21 doladění + #28 rozšíření + #18 HOTOVO). *Idea #21:* save flow je už optimistic UI (tlačítko se po kliku okamžitě mění na „Oběd byl zaevidován", sync-badge flipne na pending, backend na pozadí) — původní spec byl zastaralý. Přidána jen *success flash* animace (`@keyframes btn-saved-flash` — krátký zelený flash 900ms po úspěšném save), aby byl feedback zřetelnější než jen změna textu. Respektuje `prefers-reduced-motion`. *Idea #28:* `obedy.tests.js` rozšířen z 17 na 25 registrovaných testů — nové edge cases (`test_spoctiPricing_ignoresMarker`, `test_spoctiPricing_polevkaNepocitaDoMealLimit`, `test_spoctiPricing_mealsBoundarySplit`, `test_spoctiFronta_emptyItemsArray`) + helper funkce testy (`test_emailToNick_*`, `test_emailToFullName_*`, `test_formatDateCz_*`). *Idea #18:* auditováno a označeno HOTOVO — marker „Tento den oběd mimo menzu" (`BEZ_OBEDA_KATEGORIE`) v `obedyNactiData` + filtry v `nactiStatistiky_`/`nactiKredit_`/`spoctiPricing_` přesně pokrývají spec. Verze .39 → .40. |
| 2026-04-21 (p.m.) | **Oblíbená jídla** (idea #31 HOTOVO) — nová per-user feature pro zvýraznění oblíbených jídel v menu. Uživatel v side-menu zapne přepínač → otevře se modal s textareou pro comma-separated klíčová slova (např. `rajská, mrkvový`). Pokud jídlo dnešního dne obsahuje některé z klíčových slov (case-insens + bez diakritiky, substring match), quick-pick pill se jemně pulsuje růžovou (`@keyframes favorite-pulse`, 2.2 s) a za názvem je statické Lucide `heart` srdíčko. Animace respektuje `prefers-reduced-motion`. Zvýraznění platí jen pro dnešek a pouze dokud uživatel neuloží výběr (po uložení `DATA.selections[today]` bude neprázdné → `showFavorites = false` v `renderMenu()`, zvýraznění zmizí okamžitě). **Backend:** list Uživatelé rozšířen na 5 sloupců (A=Email, B=Přezdívka, C=Aktivní, D=Oblíbená, **E=Oblíbená aktivní**). Oddělení D a E umožňuje vypnout feature bez ztráty hodnot. Auto-migration: pokud D1/E1 header chybí, `obedyUlozOblibena` je vytvoří. `najdiUzivatele_` rozšířen o `favorites`, `favoritesEnabled`, `rowIndex`. Cache bump `obedy_user_v3_` → `v4_`. Nový endpoint `obedyUlozOblibena(raw, enabled)` s trim/normalizací a invalidací cache. **Frontend:** nová položka v side-menu (guest-hide), modal `#favorites-overlay` s textareou, JS funkce `openFavoritesModal / saveFavoritesModal / cancelFavoritesModal / toggleFavorites` s cancel-rollback přes `favoritesSnapshot`. Matching přes `normalizeForMatch_` (`.toLocaleLowerCase('cs').normalize('NFD').replace(/[\u0300-\u036f]/g,'')`). Dark mode border `.food-num` fix (rgba pro tmavý background). Nové ikony v ICONS: `heart`, `heart-fill`. Verze .37 → .38. |
| 2026-04-21 | **Ikony Fáze 1 fix + Fáze 2** — *.34/.35 fixy:* (1) side-menu fallback emoji se zobrazovaly pod SVG — `.icon-fallback` nyní globálně skrytý (nejen `.icon > .icon-fallback`), + `.menu-icon > svg` width/height 1em; (2) datepicker zámky 🔒 a 🚫 vykreslené přes CSS `content:` — nahrazeno inline SVG přes `mask-image` (lock, currentColor) a `background-image` (ban, fixní šedá), s rollback fallbackem přes `html.icons-off { content: '🔒' }`. *Fáze 2 (.36):* modal h3 hlavičky (Rychlá volba → `check`, Dobití → `credit-card`, Historie → `line-chart`, PWA iOS + PWA mobile → `monitor-smartphone`), PWA nudge banner (📱 → `monitor-smartphone`), intro screen ✓/✗ (`check`/`x`), CSV export tlačítko (📥 → `download`), showError ❌ (→ `x-circle`). Help.html body — emoji odkazující na UI prvky nahrazeny odpovídajícími Lucide ikonami (📅 calendar, 🚫 calendar-off, 🔒 lock, 💳 credit-card, ✏️ pencil-line, 📱 qr-code, 📊 line-chart, 🕒 clock). Barevné tečky 🟢🟡🔴 v Help ponecháné — vizuálně odpovídají barevné tečce na sync-badge. Nové ikony v ICONS: `x`, `x-circle`, `download`. |
