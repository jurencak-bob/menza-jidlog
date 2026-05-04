# meníčka

Web app pro agregaci denních menu z restaurací (zdroje: [menicka.cz](https://www.menicka.cz) iframe + UTB Menza JSON API). Hostovaná v Google Apps Script (server + HtmlService UI), zabalená jako PWA wrapper na GitHub Pages pro mobil.

**UI brand:** uživatelům se aplikace prezentuje jako **„LunchHunter PE"** (Poacher Edition — data tahá z menicka.cz). **Code, repo subprojekt, localStorage klíče, funkce a komentáře dál používají „meníčka"** (interní dev terminologie).

**Live:** [https://jurencak-bob.github.io/menza-jidlog/lunchhunter.html](https://jurencak-bob.github.io/menza-jidlog/lunchhunter.html) (PWA wrapper) → iframuje GAS deploy `AKfycbw4…/exec`. (Soubor v repo přejmenován z `menicka.html` v 2026-05-04.)

**Vstup:** pouze přihlášení Google uživatelé z domény `@blogic.cz`.

---

## Architektura v jedné větě

Container-bound Apps Script projekt nad Google Sheetem. Cron-trigger každou hodinu od 9:00 do 14:00 stáhne menu pro všechny aktivně sledované restaurace, JSON cache uloží do listu `Menu Cache`. V 17:00 cleanup trigger smaže dnešní řádky (večer už menu nikdo nepotřebuje, navíc by mátla zítřejší ráno). UI je samostatná HtmlService šablona, která se přes `google.script.run` napojuje na server-side veřejné funkce.

### Datový model (4 listy v jednom sheetu)

| List | Účel | Klíčové sloupce |
|---|---|---|
| `⚙️ Konfigurace` | Globální settings | `klíč`, `hodnota` (klíče: `trigger_casy` CSV např. `9,10,11,12,13,14`, `cache_konec_hodina` např. `17`, `debug_id`, …) |
| `Restaurace` | Globální katalog | `id`, `název`, `město`, `url`, `aktivní`, `výchozí`, `foto_url` |
| `Uživatelé` | Per-user state | `email`, `sledovane_restaurace`, `skryte_restaurace`, `oblibena_jidla`, `dieta`, `vytvoreno`, `posledni_pristup`, `pocet_navstev`, `rss_drive_id`, `restaurace_overrides` |
| `Menu Cache` | JSON snapshoty menu | `datum`, `restaurace_id`, `data`, `aktualizovano` |

### Klíčový princip: shared katalog, per-user view

- **1 restaurace = 1 řádek v Restaurace navždy.** Sdílená napříč všemi uživateli.
- **Per-user** je jen `sledovane_restaurace` + `skryte_restaurace` + `restaurace_overrides` (vlastní název/město).
- **Menu se stahuje per-restauraci, ne per-user.** Refresh sjednotí všechna ID napříč uživateli + výchozí, stáhne každé právě 1×.
- **Cache cleanup**: když posledni uživatel restauraci odebere a není výchozí, dnešní cache pro to ID se smaže.

### Invariant

Každý uživatel **musí sledovat alespoň 1 restauraci**. Pokus o odebrání poslední je odmítnut na frontendu (disabled tlačítko 🗑️) i serveru (`Restaurants_removeFromUser_` throws).

---

## Soubory

```
jidlogic.menicka/
├── menicka_Util.gs        — konstanty, sheet helpery, _parseMenickaUrl_, slug→name
├── menicka_Auth.gs        — currentUser_() přes Session.getActiveUser
├── menicka_Config.gs      — globální config s CacheService (10 min TTL)
├── menicka_Users.gs       — auto-create, self-heal, touchVisit, updateSettings
├── menicka_Restaurants.gs — register, addToUser, removeFromUser, setOverride, _isWatchedByAnyone_
├── menicka_Cache.gs       — Menu Cache CRUD, prune stale, cache hit by datum+id
├── menicka_Scraper.gs     — fetchHtml (iframe HTML), refreshAllMenus trigger handler
├── menicka_Parser.gs      — HTML parser (table.menu/tr.soup/tr.main/td.food/td.prize)
├── menicka_Menza.gs       — UTB JSON API integrace (Ordering + Menu endpointy, plné ceny)
├── menicka_Geo.gs         — geocoding (Nominatim primárně + Photon fallback), reverse geocoding, haversine
├── menicka_Rss.gs         — RSS XML generátor (1 file v Drive per uživatel, sdílený link)
├── menicka_Init.gs        — initializeMenicka, repair*, cleanup*, migrace, triggers, backfill*
├── menicka_Debug.gs       — debugFetch, raw HTML dump
├── menicka_Code.gs        — doGet, _bootstrap_, public funkce pro google.script.run
├── menicka_view.html      — frontend (server-rendered bootstrap, Sortable.js drag)
├── appsscript.json        — manifest (DOMAIN access, OAuth scopes)
├── manifest.json          — PWA manifest (zatím nevyužitý — ignored claspem)
├── .clasp.json            — script ID
├── .claspignore           — ignore manifest.json + tooling
├── deploy.sh              — push + bump verze + redeploy v jednom kroku
├── README.md              — tenhle soubor
└── CHANGELOG.md           — historie verzí
```

**Pravidlo pojmenování:** všechny `.gs` a `.html` soubory v této složce mají prefix `menicka_` (kromě GAS/PWA standardních manifestů). Chrání před kolizí, kdyby se subprojekt někdy slučoval s parent GAS projektem.

---

## Jak to funguje

### Auth flow

1. Uživatel otevře PWA URL na github.io → wrapper iframuje GAS `/exec`.
2. GAS `doGet` volá `currentUser_()` ([menicka_Auth.gs:5](menicka_Auth.gs#L5)) → `Session.getActiveUser().getEmail()`.
3. Pokud email nepatří do `WORKSPACE_DOMAIN` (`blogic.cz`) → render error page.
4. Jinak `Users_ensure_` najde / vytvoří řádek v Uživatelé. Self-heal doplní výchozí restaurace, pokud má prázdné sledování.

### Bootstrap

`doGet` server-renderuje JSON do HTML šablony jako `BOOTSTRAP` proměnnou — žádný extra round-trip pro startup data. JSON obsahuje: user, restaurace (s aplikovanými per-user overrides), menu (cache pro dnešek), datum, **schedule** (`triggerHours`, `cacheClearHour` z Konfigurace).

### Refresh menu (cron každou hodinu 9:00–14:00 Europe/Prague)

Hodiny jsou v `trigger_casy` v listu `⚙️ Konfigurace` (CSV, default `9,10,11,12,13,14`). Po změně klíče spusť ručně `setupTriggers` — `setupTriggers_` ([menicka_Init.gs:247](menicka_Init.gs#L247)) smaže staré triggery a zaregistruje nové.

`refreshAllMenus()` ([menicka_Scraper.gs:75](menicka_Scraper.gs#L75)):
1. `Scraper_collectIds_` sjednotí ID napříč všemi `sledovane_restaurace` + výchozími.
2. `Cache_pruneStale_` smaže cache pro datum != dnes nebo ID, které se neobjevilo v unii.
3. Pro každé ID:
   - Pokud `id === "menza"` → `Menza_fetchTodayMenu_()` (UTB JSON API).
   - Jinak → `Scraper_fetchHtml_` (iframe HTML) + `Parser_parseMenu_`.
4. `Cache_storeMenu_` zapíše JSON (a do něj `aktualizovano` ISO timestamp pro FE).
5. Volitelně `Rss_publishAll_` regeneruje XML feedy (skrytá feature).

### Cleanup v 17:00

Trigger `clearTodaysCache` ([menicka_Cache.gs:122](menicka_Cache.gs#L122)) v hodinu `cache_konec_hodina` (default 17) smaže všechny dnešní řádky z listu `Menu Cache`. Důvod: po obědě už nikdo data nepotřebuje a ráno by stará data mátla uživatele.

### Manuální refresh per karta

🔄 ikona uvnitř každé karty volá `refreshMenuFor` ([menicka_Restaurants.gs:160](menicka_Restaurants.gs#L160)). Server-side ochrana:
- **Mimo refresh okno** (před `triggerHours[0]` / od `cache_konec_hodina`) → `outsideHours: true`. FE zobrazí toast „Aktualizovat lze jen v okně X:00–Y:00."
- **15-min cooldown** od posledního stažení → `tooEarly` flag s `ageMin`. **Bypass:** pokud poslední fetch byl chyba (UTB blip, parser exception, info string „nepodařilo načíst" / „selhal"), cooldown se přeskakuje a uživatel může klikat dokud nedostane funkční odpověď.
- **Soft-lock** přes CacheService 30 s → `locked` flag (zabrání paralelnímu fetchi téže restaurace z více klientů).
- Jinak → fetch + `Cache_storeMenu_` + `refreshed: true`.

FE má symetrický check (`canRefreshMenu(ts, menu)` + `isFailedMenu(menu)` + `isOutsideRefreshWindow` v menicka_view.html). Ikona je purple když lze, šedá s tooltipem jinak. Po failed fetchi label vedle ikony hlásí „Poslední pokus se nepodařil" + tlačítko se rovnou nabízí ke kliknutí.

### Schedule banner

Když je `STATE.menu` prázdné a hodina je mimo refresh okno, FE místo „Žádná data" ukáže panel s Lucide ikonou:
- `sun` + „Dnešní jídelníčky se zatím nestahovaly..." pokud `hour < triggerHours[0]`.
- `moon` + „Čas oběda už je za námi..." pokud `hour >= cacheClearHour`.

Texty obsahují konkrétní hodiny z Konfigurace, takže reagují na změnu schedulu bez code change.

### Stahování menicka.cz

Tři endpointy, všechny vyžadují browser User-Agent + `windows-1250` decoding:

| Endpoint | Použití | Co vrací |
|---|---|---|
| `api/iframe/?id=<id>` | denní menu | iframe HTML s tabulkou menu pro celý týden |
| `<id>-<slug>.html` | registrace | profile stránka — název + město z meta description / title |
| `tisk-profil.php?restaurace=<id>` | registrace + backfill | čistá tisková verze — `<h1>` název + `<img class='logo_restaurace'>` URL loga |

Detaily HTML struktury viz memory **reference_menicka_cz_endpoints**.

**Iframe parser** ([menicka_Parser.gs](menicka_Parser.gs)) hledá `<span class='dnes'>` markeru u `<h2>` aby určil dnešní den, pak iteruje `<tr class='soup'>` a `<tr class='main'>` v sousední `<table class='menu'>`. Info řádky bez ceny (`Pro tento den nebylo zadáno menu.`, `zavřeno`, `dovolená`) detekuje `INFO_RE` a uloží do `menu.info` místo polévky.

**Print parser** (`Parser_extractPrintProfile_`) vrací `{ nazev, foto_url }`. Soft-fail (vrací nuly při chybě) — caller v `Restaurants_register_` kombinuje s primárním profile parserem.

### Vlastní číslování restaurace má prioritu

Některé restaurace si v menicka.cz číslují jídla rovnou v `<td class='food'>` (např. „1. Grilovaná kotleta"). Frontend ([menicka_view.html](menicka_view.html), `renderCategory`) detekuje `^\d+\.\s+` na začátku `item.nazev`, použije to číslo a z textu odstraní — jinak by se zdvojovalo s `item.cislo` z `<td class='no'>`.

### Stahování UTB Menzy

`Menza_fetchTodayMenu_` ([menicka_Menza.gs:42](menicka_Menza.gs#L42)):
1. `GET /Ordering?CanteenId=3` → seznam dostupných dnů.
2. Najít dnešní datum, pokud chybí → `info: "Menza dnes nevaří."`.
3. `GET /Menu?Dates=<dt>&CanteenId=3` → položky.
4. Mapping: `polévka` → polevky, `oběd` → obed, `oběd ostatní` → obed_ostatni, `pizza` → pizza, `minutky` → minutky, ostatní (steril., obaly) → ignorováno. UI renderuje 5 sekcí zvlášť, číslování per-kategorie (oběd 1–5, oběd ostatní 1–2, pizza 1–2, minutky 1–N).
5. Cena: `item.price2` (plná, nikoli studentská).
6. Z `mealName` se odřezává prefix gramáže (`120g`, `0.33l`) a uloží do `mnozstvi` jako u iframe parseru.
7. Při fetch failure se `menu.transient_error = true` flag zapíše do cache, takže další manuální refresh přeskočí 15-min cooldown.

### Per-user overrides

Sloupec `restaurace_overrides` v Uživatelé je JSON `{"<id>": {nazev, mesto}, …}`. `Restaurants_setOverride_` updatuje, `Restaurants_resolveForUser_` aplikuje při bootstrap. URL nelze měnit (uživatel musí restauraci odebrat a znovu přidat s jinou URL).

### Frontend reorder

Sortable.js přes CDN. Dva drag-and-drop kontexty:

1. **Sledované restaurace v Nastavení** — drag handle `⋮⋮` u každé položky (desktop), drag z kdekoli na řádce (mobil). animation 150 ms, touch fallback.
2. **Karty jídelníčku v gridu** (desktop only) — drag z `.card-header` (kurzor `grab` signalizuje), filter vylučuje klikatelné prvky uvnitř (link / refresh / hide). Reorder se mapuje přes `visibleIds()` zpět do `sledovane_restaurace` tak, aby skryté/odfiltrované karty zůstaly na svých absolutních pozicích.

Po drop: `onEnd` callback získá nové pořadí ID, `STATE.user.sledovane_restaurace = newIds.join(',')`, `saveSettings({ sledovane_restaurace })` debounced 350 ms.

### Geo filter (od v20260429.007)

Filter podle vzdálenosti uživatele od restaurace. Slider 1/2/5/10/20/∞ km v Nastavení; ∞ = filter off. Default vypnutý — geolokace prompt přijde **až** při explicitním přesunu slideru z ∞.

**Klientská strana ([menicka_view.html](menicka_view.html)):**
- `STATE.geo` = `{ radiusKm, userLat, userLon, city, fetchedAt, error }`. `enabled` je derivace `radiusKm !== Infinity`.
- `requestGeoPosition_(onDone, options)` volá `navigator.geolocation.getCurrentPosition`. Pozice cachovaná 30 min v `sessionStorage`. Manuální „Obnovit polohu" tlačítko v Nastavení force-fetchuje (`maximumAge: 0`).
- Auto-refresh na `visibilitychange` při návratu na tab a stale > 15 min.
- `_haversineKm_(lat1, lon1, lat2, lon2)` v `visibleIds()` filtru. Restaurace bez `lat/lon` (legacy / geocode failed) zůstávají vidět — fail-safe.
- Header indikátor `locate-fixed` (accent purple) viditelný jen když filter aktivní; klik otevře Nastavení.

**Serverová strana ([menicka_Geo.gs](menicka_Geo.gs)):**
- `Geo_geocode_(query)` — Nominatim primárně, Photon (Komoot) fallback. Cache 24 h, sdílená napříč providery. Nominatim 429 → 1h backoff cache, další volání skipuje rovnou na Photon.
- `Geo_geocodeRestaurant_(adresa, mesto)` — preferuje plnou adresu (úroveň ulice ~50 m), fallback město (city center ~1 km).
- `Geo_reverseGeocode_(lat, lon)` — pro status řádek v Nastavení („Zlín • 49.23, 17.66" + odkaz Google Maps).

**Geocoding flow restaurace:**
1. `Restaurants_register_` uloží `adresa` (z parser meta description / `<div class='adresa'>`), lat/lon = null.
2. FE po `addRestaurant` success volá `geocodeRestaurant(id)` async — server zavolá `Geo_geocodeRestaurant_`, uloží lat/lon.
3. Půlnoční trigger `backfillRestaurantCoords()` zachytí podniky kde async failnul (Nominatim down, network blip).
4. Hardcoded vyjímky: Menza UTB má jen hardcoded adresu (Nad Stráněmi 4511, Zlín — FAI), souřadnice se geocodují jako u ostatních.

### Map-pin v hlavičce karty (od v20260429.009)

Lucide `map-pin` ikona — viditelná jen když `rest.adresa` (parsed z menicka.cz) existuje. Klik = `https://www.google.com/maps/search/?api=1&query={nazev}+{adresa}`. Název v query je nutný kvůli často chybnému formátování adres na menicka.cz (Google si pomůže tím, co pozná z databáze restaurací).

### Auto-poll fresh menu (od v20260429.023)

`getMenuTimestamps()` lehký endpoint vrací `{restauraceId: aktualizovano}` mapu pro dnešní cache. FE polluje každé 2 min (jen když tab visible) + immediate poll na `visibilitychange`. Když najde novější ts než lokálně, fetchne fresh menu pro daný card → uživatel uvidí refresh overlay + nový obsah bez F5. Use case: cron trigger v 9-14 hodin proběhne s otevřeným tabem, nebo manual refresh jiného uživatele se promítne k ostatním.

### Refresh overlay (od v20260429.023)

Když je `STATE.loadingMenu[id]` aktivní a karta má stará data (initial fetch ne), nad menu body se objeví světle šedá vrstva s blur 3px a centrovaný badge „Aktualizuji jídelníček". Konzistentní pozice 32 px od horní hrany body napříč všemi kartami (badge `position: absolute; top: 32px`). Karta sama je `display: flex; flex-direction: column` → body roste na celou výšku karty (která se v gridu napíná na nejvyšší).

### Custom JS tooltipy (od v20260429.006)

Native `title` attribute má pomalou appearance + nefunguje na mobile. Vlastní implementace: MutationObserver auto-migruje `title` → `data-tooltip` na všech elementech (i dynamicky vkládaných v `renderCard` / `renderSettings`). Single shared `<div class="tooltip">` v body, `position: fixed`, viewport-clamping (flip nahoru/dolů, clamp k MARGIN). Hover (desktop, 400 ms delay), focus (klávesnice, a11y), long-press (mobil, 500 ms). `white-space: pre-line` na `.tooltip` umožňuje multi-line přes `\n` v zdrojovém atributu.

### Oblíbená + Neoblíbená jídla (od v20260430.013)

Symetrické features — klíčová slova v Nastavení (oddělená čárkou, normalizováno bez diakritiky, case-insensitive substring match). Match → ikona vedle názvu + decentní podbarvení řádku.

- **Oblíbená:** Lucide `heart` (pulse animace 1.4 s), default červená. `oblibena_jidla` server-side (cross-device sync).
- **Neoblíbená:** Lucide `frown` (statický), default `gray`. Pouze localStorage. Toggle „Skrýt z výpisu" — odfiltruje neoblíbená jídla z menu (polévky se nikdy neskrývají, typicky jediná v menu).
- **Konflikt** (match oboje): pulsující amber `triangle-alert` ikona (stroke-width 3), neutrální řádek bez podbarvení. Tooltip dynamicky vypisuje konkrétní matchující slova z obou stran. Název je podtržený amber a klikatelný — otevře Nastavení, přepne na tab Jídla a zaostří dis-keywords input.

Per-theme paleta: `--fav-c-*` / `--fav-b-*` a `--dis-c-*` / `--dis-b-*` v `:root` a `[data-theme="dark"]`. JS `applyFavColor_(key)` / `applyDisColor_(key)` aplikuje přes `document.documentElement.style.setProperty('--fav-color', 'var(--fav-c-' + key + ')')`. `'default'` / `'none'` removeProperty → fallback. Plus B (bold), S (přeškrtnutí — pouze dis), barvy ručně + „Obnovit výchozí".

### Tabs v Nastavení (od v20260430.014)

Settings drawer rozdělen do 3 sticky tabů s Lucide ikonami:

| Tab | Ikona | Obsah |
|---|---|---|
| **Restaurace** | `store` | Sledované restaurace fav-list + Přidat URL |
| **Zobrazení** | `layout-grid` | Hide-empty toggle + Filtr podle polohy + Sloupcové zobrazení (cols / wide / font) |
| **Jídla** | `utensils` | `.taste-grid` se 2 fieldsety (Oblíbená + Neoblíbená) — desktop side-by-side, mobil pod sebou |

Aktivní tab persistován v `localStorage menicka_settings_active_tab`. Conflict-link click v menu přepne na tab Jídla a focusne `#opt-dis-keywords`. `setSettingsTab(name)` togluje `aria-selected` na buttonech a `hidden` na panelech. Klávesovou navigací (Tab) přístupné, role `tablist`/`tab`/`tabpanel`.

### Single-line fav-list (Variant A, od v20260430.001)

V Nastavení sledované restaurace v jednom řádku: `[≡] [N.] Název (Město) ............ [👁][✏][🗑]`. Šetří vertikální místo (důležité na mobilu při 14+ restauracích). `.fav-text` flex 1 1 auto, `.fav-meta` (město v závorkách) má `flex: 0 100 auto` — mizí 100× rychleji než název při shrinku. Multi-line tooltip přes `data-tooltip` ukazuje plné jméno + město.

**Akce řada (oko / tužka / koš)** je flex-sibling `.fav-text` v `.fav` (ne uvnitř, jak bylo původně) — fixní intrinsic šířka, akce vždy plně viditelné, název truncatuje místo akcí. Drag-from-anywhere přes Sortable.js `filter: 'button, input, a'` + `preventOnFilter: false`. Nad 14 restaurací max-height 480 px + scrollbar.

---

## Deployment

### První setup

1. Otevři Sheets → vytvoř prázdný Sheet → Rozšíření → Apps Script.
2. Zkopíruj script ID z URL.
3. `cd jidlogic.menicka/ && echo '{"scriptId":"...","rootDir":"."}' > .clasp.json`.
4. `clasp push` (nebo `./deploy.sh`).
5. V editoru spusť `initializeMenicka` ([menicka_Init.gs:7](menicka_Init.gs#L7)) → vytvoří 4 listy + triggery.
6. Deploy → New deployment → Web app → execute as ME, access DOMAIN.

### Další iterace

```bash
./deploy.sh
```

Skript provede: `clasp push` + parse aktuální verze z deployment description (`vYYYYMMDD.NNN` formát) + bump (counter ++ pro stejné datum, jinak `.001` pro nové datum) + `clasp create-version` + `clasp redeploy --deploymentId … -V <ver> -d <newVer>`. URL produkce zůstává stejné.

### PWA wrapper

V parent složce `menza-jidlog/`:
- `lunchhunter.html` — wrapper s `<iframe src="…GAS deploy URL…">` + loading overlay
- `lunchhunter-manifest.json` — PWA manifest (start_url, icons, theme)
- `sw.js` — service worker cachuje shell

Po `git push origin main` GitHub Pages za 1–3 min publikuje na [https://jurencak-bob.github.io/menza-jidlog/lunchhunter.html](https://jurencak-bob.github.io/menza-jidlog/lunchhunter.html).

---

## Admin / debug funkce

Spouštět ručně z Apps Script editoru:

| Funkce | Soubor:řádek | Účel |
|---|---|---|
| `initializeMenicka` | [menicka_Init.gs:7](menicka_Init.gs#L7) | Vytvořit / migrovat listy + nastavit triggery |
| `setupTriggers` | [menicka_Init.gs:243](menicka_Init.gs#L243) | Re-registrovat refresh + cleanup triggery podle aktuální Konfigurace (volej po změně `trigger_casy` / `cache_konec_hodina`) |
| `listTriggers` | [menicka_Init.gs:259](menicka_Init.gs#L259) | Vypíše všechny registrované triggery do Logger.log — diagnostika „proč mi nefungují automatické refreshe" |
| `backfillRestaurantPhotos` | [menicka_Init.gs:181](menicka_Init.gs#L181) | Pro řádky bez `foto_url` zkusí stáhnout logo z `tisk-profil.php` (idempotentní) |
| `backfillRestaurantAddresses` | [menicka_Init.gs](menicka_Init.gs) | Pro řádky bez `adresa` re-fetchne profile z menicka.cz, vytáhne `<div class='adresa'>`, doplní (idempotentní, 0.5 s pause mezi fetchy) |
| `backfillRestaurantCoords` | [menicka_Init.gs](menicka_Init.gs) | Pro řádky bez `lat/lon` zavolá Nominatim → Photon fallback, primárně z plné adresy. 1.5 s pause mezi calls. Volá ho i půlnoční trigger. |
| `normalizeRestaurantAddresses` | [menicka_Init.gs](menicka_Init.gs) | Spojí v existujících řádcích formát `Ulice, ČísloPopisné` → `Ulice ČísloPopisné`. Pro lepší geocoding po backfillu adres. Idempotentní. |
| `clearNominatimBackoff` | [menicka_Geo.gs](menicka_Geo.gs) | Vymaže 1h backoff flag po HTTP 429 — pro experimenty / když víš že soft-ban už dávno vypršel |
| `clearAllCaches` | [menicka_Init.gs:53](menicka_Init.gs#L53) | Vyčistit CacheService klíče **a smazat všechny řádky z listu `Menu Cache`** |
| `clearTodaysCache` | [menicka_Cache.gs:122](menicka_Cache.gs#L122) | Smaže jen dnešní řádky z `Menu Cache` (volá ho denní cleanup trigger v 17:00) |
| `repairRestaurants` | [menicka_Init.gs:78](menicka_Init.gs#L78) | Pro placeholder řádky v Restaurace zkusit doplnit info nebo smazat |
| `cleanupOrphanSubscriptions` | [menicka_Init.gs:181](menicka_Init.gs#L181) | Odebrat IDs z user.sledovane_restaurace, které nejsou v katalogu |
| `bulkAddRestaurantsForUser` | [menicka_Init.gs:147](menicka_Init.gs#L147) | Hromadné přidání URL pro daný email (po havárii) |
| `migrateDefaultsFromConfig` | [menicka_Init.gs:213](menicka_Init.gs#L213) | Z `default_restaurace` v config nastav `výchozí=1` v Restaurace |
| `refreshAllMenus` | [menicka_Scraper.gs:75](menicka_Scraper.gs#L75) | Stáhne menu pro aktivní restaurace (volá ho cron trigger každou hodinu 9–14) |
| `debugFetch` | [menicka_Debug.gs](menicka_Debug.gs) | Vypíše raw HTML + parser výstup pro `debug_id` z config |

---

## Co bylo zavrženo (a proč)

### URL `https://www.menicka.cz/restaurace/<id>` jako zdroj profile info
Vrací **404 Forpsi error page** — URL pattern neexistuje. Profil je výhradně na `https://www.menicka.cz/<id>-<slug>.html`.

### `https://www.menicka.cz/?id=<id>` jako zdroj
Vrací 302 redirect na **listing celého města** (`praha-1.html?fto=true`). Listing **neobsahuje iframe ID**, takže nelze spárovat 1:1 s konkrétní restaurací.

### Auto-registrace placeholder restaurací při refresh
Dříve jsme při auto-registraci vytvářeli řádek `Restaurace 17` / `Restaurace 66` jako fallback, když parser nedával název. Bob to zavrhl: *"Restaurace 17 nikomu nic neřekne."* Teď: registrace **vyžaduje plnou URL** + `_slugToName_` fallback (např. `radegastovna-rex` → `Radegastovna Rex`). Pokud ani slug není, throws.

### Editace URL přes UI
Bob řekl: *URL měnit nepůjde, prostě bude muset restauraci odebrat a přidat znovu s novým URL.* Důvod: měnit URL znamená měnit ID a tím rozbít data integrity (cache, RSS, sledování). Lepší je odebrat + přidat znovu.

### Šipky `▲▼` pro reorder
Funkční, ale uživatel chtěl drag-and-drop pro přirozenější UX (zejména na mobilu). Nahrazeno Sortable.js.

### Stahování menu z profile stránky (metoda 1)
Profile stránka má v sobě i menu, ale je 100+ KB (vs. iframe 14–28 KB). Iframe je lehčí endpoint a má stabilní strukturu, profile více decoration. Zachovali jsme jen profile pro **statické info** (název, město), iframe pro **denní menu**.

### Studentské ceny z Menzy
Bob: *"Stahuj zásadně plné ceny."* Tj. `item.price2`, ne `item.price`.

### External-link ikona Menzy → menicka.cz / oficiální web
Bob řekl: *„odkaz z ikony odkazující na menzu nepovede na ofiko web menzy, ale na vlastní obědy app."* Karta s `id === 'menza'` má v [menicka_view.html:1107](menicka_view.html#L1107) hardcoded URL parent Jídlogic appky `…?app=obedy` (tam má Bob pohodlnější objednávání) místo `MENZA_INFO.url`.

---

## Odložené featury (hidden, kompletně implementované)

- **RSS feed per uživatel** — Drive XML soubor s veřejným odkazem, regeneruje se po refreshAllMenus. UI tlačítko v Nastavení skryté `hidden` atributem.
- **Stravovací omezení** (vege, vegan, bezlepku, bezlaktozy, bezorechu) — chips v Nastavení, ukládají se do user.dieta. Chybí **detekční logika** která by označila vhodná jídla. Skryté.

Když je budeš chtít vrátit, smaž `hidden` atribut z příslušných `<div data-feature="…">` v menicka_view.html.

---

## Roadmap / nápady

### Aktivně diskutované, navrženo, čeká na rozhodnutí

- **Plnohodnotná Google auth s allowlistem** ([nápad 2026-04-29]) — sheet `Povolení` (typ: `domena|uzivatel`, hodnota, aktivní), default `domena=blogic.cz` + `uzivatel=jurencak@gmail.com`. `currentUser_()` rozšíření o lookup. **Pasti:** otevření web app na „Anyone with Google account" znamená zrušit workspace gate (URL bez `/a/macros/blogic.cz/`); biometrie (WebAuthn) jen jako per-device optimalizace, ne primární auth. **Plán fází:** F1 = sheet allowlist + currentUser_ check + error page (low risk); F2 = re-deploy na non-workspace + auth gate UI; F3 = WebAuthn biometric.
- **In-app search restaurací** ([nápad 2026-04-29]) — místo „kopíruj URL z menicka.cz" psát přímo do search inputu název. **Plán fází:** F1 = lokální search v `Restaurace` listu (instant, žádný API limit); F2 = fallback na menicka.cz scrape pokud lokálně nic — vyžaduje reverse-engineering jejich search endpointu (křehké).
- **Návrhy podle popularity** ([nápad 2026-04-29]) — při add restaurace nabídnout top N nejsledovanějších v okolí (mimo defaulty + uživatelovy stávající). Agregace z `Uzivatele.sledovane_restaurace`. **Pasti:** cold-start (sociální signál nedává smysl pod ~5 uživateli), privacy (leakuje agregátní info — pro `@blogic.cz` interní OK).

### Dlouhodobější nápady

- **Detekce vhodných jídel pro stravovací omezení** — heuristika z názvu jídla + alergenů (např. alergen 1 = lepek → bezlepek=false; "tofu" / "vegan" v názvu → vegan=true). Vyžaduje testovací datasety.
- **Oblíbená jídla** — `oblibena_jidla` sloupec existuje, dnes jen filter podle keywords. Návrh: ⭐ tlačítko u každého jídla v kartě → log do user.oblibena_jidla → zvýraznění při příštím výskytu (řešilo by problém manuálního dopisování klíčových slov).
- **Historie menu** — list `Menu Cache` udržuje jen dnes. Pokud chceme historii (statistiky "co jsme jedli minulý měsíc"), musíme zachovat starší řádky. Pravděpodobně nový list `Menu Historie` aby se nemíchalo s aktivním cache.
- **Notifikace přes Google Chat / email** — parent projekt (Jídlogic) tohle dělá pro UTB Menzu, mohli bychom analogicky pro restaurace ze sledování.
- **Sdílení sledovaného seznamu** mezi kolegy (něco jako "tvůj kolega Y má rád tyhle restaurace, přidat všechny?").
- **Manuální obnovení polohy** v hlavičce karty (vedle obnovení menu) — dnes je v Nastavení, ale když user otevírá geo filter status zřídka, refresh button v Nastavení je daleko od toho, co se chce — viz „seskupování akcí blízko ohniska pozornosti".

---

## Známá omezení

- **Cookies v iframe**: Chrome Mobile s Tracking Protection nebo Safari ITP může blokovat Google login uvnitř iframe → user uvidí Google sign-in místo appky. Wrapper má fallback panel s "Otevřít v novém tabu" odkazem (po 3 s timeoutu).
- **CDN dostupnost Sortable.js**: pokud `jsdelivr.net` nedostupné, drag-and-drop nefunguje. Aplikace zbytek funguje dál.
- **Workspace doménový login** povinný — externí uživatelé se nedostanou. Záměrně, protože executeAs USER_DEPLOYING + access DOMAIN spoléhá na to, že Google předá email jen workspace insiderům.

---

## Memory (poznatky pro budoucí konverzace)

V `~/.claude/projects/.../memory/`:
- `feedback_menicka_file_naming.md` — prefix pravidlo
- `feedback_code_references.md` — uvádět file:line u funkcí
- `project_menicka_deployment.md` — script ID, sheet ID, deploy URL
- `reference_menicka_cz_endpoints.md` — co o menicka.cz víme po reverse-engineeringu
