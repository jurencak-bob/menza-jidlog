# CHANGELOG

Verzování: `vYYYYMMDD.NNN` (datum + tisíciny). Counter resetuje každý den.

Před přechodem na datumový formát byly verze `Menicka 0.5` až `Menicka 1.6` (semver-style). Z důvodu konzistence s parent Jídlogic projektem (datum + setiny) přepnuto.

---

## v20260427.001 – v20260427.002 — 2026-04-27

**`clearAllCaches` čistí i list `Menu Cache`** ([menicka_Init.gs:53](menicka_Init.gs#L53)).
Předtím mazal jen CacheService klíče (in-memory) a v listu zůstávaly persistentní řádky → uživatel je tam viděl po `clearAllCaches` a divil se. Teď list smaže taky (ponechá jen header) a vrátí `{ ok, smazanoRadku }`.

**Menza UTB má vlastní external-link** v kartě ([menicka_view.html:1107](menicka_view.html#L1107)): pokud `rest.id === 'menza'`, ikona vede na vlastní web app `…?app=obedy` místo `MENZA_INFO.url`. Pro ostatní restaurace zůstává `rest.url` z menicka.cz beze změny.

---

## v20260426.002 – v20260426.013 — 2026-04-26

**Refresh schedule z Konfigurace** — přepnuto z hardcoded 9 + 11 na CSV `trigger_casy` (default `9,10,11,12,13,14`). Helpery v [menicka_Util.gs:145](menicka_Util.gs#L145): `_scheduleHours_`, `_scheduleEndHour_`, `_isOutsideRefreshWindow_`. Bootstrap v [menicka_Code.gs:31](menicka_Code.gs#L31) je posílá do FE jako `STATE.schedule`.

**Daily cleanup v 17:00** — nový trigger `clearTodaysCache` ([menicka_Cache.gs:122](menicka_Cache.gs#L122)) maže dnešní řádky z `Menu Cache` po obědě. Hodina je v `cache_konec_hodina` (default 17). `setupTriggers_` registruje 6 refresh triggerů (9–14) + 1 cleanup. Public wrapper `setupTriggers()` aby šel spustit z editoru.

**Manuální refresh per karta** ([menicka_Restaurants.gs:160](menicka_Restaurants.gs#L160), `Restaurants_refreshMenuFor_`):
- Klik na 🔄 ikonu vlevo od „Jídelníček z DD.MM. HH:MM" stáhne menu ručně.
- Server-side **15-min cooldown** (`tooEarly` flag s `ageMin`) — chrání před spamem.
- Server-side **soft-lock** přes CacheService 30 s (`locked` flag) — zabrání paralelním fetchům té samé restaurace z více klientů.
- **Mimo refresh okno** (před prvním triggerem / po 17:00) server vrátí `outsideHours` flag, FE zobrazí toast s časy z konfigurace. FE má symetrický check v `canRefreshMenu` + `isOutsideRefreshWindow` pro disabled stav ikony.
- Ikona je purple (`--accent`) pokud lze refreshnout, šedá s vysvětlujícím tooltipem jinak.

**Schedule banner** — když je cache prázdná a hodina je mimo okno, místo „nic ke zobrazení" se ukáže panel s Lucide ikonou:
- před prvním triggerem (např. `<9:00`): `sun` + „Dnešní jídelníčky se zatím nestahovaly. První aktualizace v X:00, dál po hodinách do Y:00."
- po cleanupu (`>=17:00`): `moon` + „Čas oběda už je za námi. Jídelníčky byly vyčištěny v Y:00."

**Layout karet — vertikální stack** vlevo, external-link icon vpravo: název → město → refresh-info pod sebou. Container queries odstraněny (resize už neořezává nesprávně). Refresh-info je `🔄 Jídelníček z DD.MM. HH:MM` (formát `formatAktualizovano`); fallback „Čas stažení neznámý" pro staré cache záznamy bez timestampu. Timestamp je v `menu.aktualizovano` (zapisuje `Cache_storeMenu_`).

**Sloupcové zobrazení 1–4** (dropdown v Nastavení); na mobilu vždy 1, dropdown skrytý. **Skrýt restaurace bez menu** toggle (default ON) odfiltruje karty s `menu.info` nebo prázdné.

**Oblíbená jídla** — keyword matching v `oblibena_jidla` (CSV), při zaškrtnutí „Skrýt neoblíbená hlavní jídla" filtruje `hlavni_jidla`. Polévky vždy zachovány. Když má restaurace oblíbený jen polévkový keyword (žádné hlavní), menu se nefiltruje (jinak by zbyla jen polévka, což user neočekává).

**Loading default = `📡` (radar) emoji** místo brand SVG. Sync lišta má `×` dismiss + IT Crowd hláška jako placeholder ve fallback stavu.

**Nastavení v slide panelu** v burger menu se 4 předvolbami (font size, sloupce, …). Toggle pro skrývání restaurací bez menu.

---

## v20260426.001 — 2026-04-26

**Verzování přepnuto na datumový formát** (tisíciny pro Meníčka, parent Jídlogic používá setiny).
- `deploy.sh` parsuje `vYYYYMMDD.NNN`, bumpuje counter pro stejný den nebo resetuje na `.001` pro nový den.
- `LC_NUMERIC=C` v awk eliminuje českou čárku v desetinných číslech.

**PWA wrapper na GitHub Pages** (`menicka.html`) — samostatná Add to Home Screen aplikace na `https://jurencak-bob.github.io/menza-jidlog/menicka.html`. Sdílí ikony s parent Jídlogic, ale vlastní manifest (start_url, name).
- `menicka.html` — iframe wrapper s loading overlay (🍽️ + plate-wobble), fallback panel po 3 s timeoutu.
- `menicka-manifest.json` — PWA manifest.
- `sw.js` v14 — cache shell + nové soubory.
- `menicka_view.html` posílá `postMessage('menicka-ready')` parent oknu pro fade-out wrapper overlay.

---

## Menicka 1.6 — 2026-04-25

**Drag-and-drop přes Sortable.js** s touch podporou (mobil). Nahrazuje šipky `▲▼` z předchozí verze.
- CDN `https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js`
- Drag handle `⋮⋮` vlevo od checkboxu, `cursor: grab`.
- Animation 150 ms, ghost class, chosen class, drag class pro vizuální feedback.
- `delayOnTouchOnly: 100ms` proti misdragům.

---

## Menicka 1.5 — 2026-04-25

**UI redesign sledovaných restaurací**:
- Pořadové číslo `1.` `2.` `…` vlevo, mění se podle drag pořadí.
- Checkbox **= visible/hidden**, ne remove (per-user `skryte_restaurace` sloupec). Default checked.
- 🗑️ popelnice (místo `×`) pro **smazání ze sledovaných**, min-1 invariant.
- Stravovací omezení a RSS sekce v Nastavení skryté `hidden` atributem (kompletně implementované, čekající na schválení).

**`skryte_restaurace` sloupec** v Uživatelé. `Restaurants_removeFromUser_` při smazání čistí i ze skrytých.

---

## Menicka 1.4 — 2026-04-25

**UTB Menza integrace** (`menicka_Menza.gs`):
- ID `"menza"` (string, odlišuje od numerických menicka.cz IDs).
- Endpointy `/Ordering` (seznam dnů) + `/Menu` (jídla).
- Mapping: polévka → polevky, oběd / oběd ostatní / pizza → hlavni_jidla, minutky → ignored.
- **Plné ceny** (`item.price2`), nikoli studentské.
- Tlačítko "Menzu UTB" pod URL inputem v Nastavení.
- Routing v `Restaurants_fetchMenuFor_` a `refreshAllMenus` podle id (menza vs. iframe).

**Číslování jídel** (`item.cislo` z `<td class='no'>1.</td>`) v parser. UI `flex` layout v `.item-name` aby text wrapoval pod `.item-text`, ne pod číslo.

---

## Menicka 1.3 — 2026-04-25

**Sloupcové zobrazení**: dropdown 1–4 v Nastavení. Mobile (`max-width: 700px`) vždy 1 sloupec, dropdown skrytý.

**Skrýt restaurace bez menu** toggle (default ON) — restaurace s `menu.info` nebo prázdná se v hlavním seznamu nezobrazí.

**Šipky `▲▼` pro reorder** sledovaných restaurací (později nahrazeno drag-and-drop).

---

## Menicka 1.2 — 2026-04-25

**Race condition fix** — `Restaurants_addToUser_`, `removeFromUser_`, `setOverride_` všechny obalené `LockService.getDocumentLock()` + `Users_invalidate_(email)` před read. Předtím cached user objekt mohl mít stale `sledovane_restaurace` a append by přepsal sheet stale + jen new ID (= ostatní restaurace zmizely).

---

## Menicka 1.1 — 2026-04-25

**Detekce info řádků** v parseru — řádky bez ceny obsahující "Pro tento den nebylo zadáno", "tento den zavřeno", "dovolená" atd. uloží do `menu.info` místo polévek. UI a RSS pak zobrazí jen text bez sekcí Polévky/Hlavní jídla.

---

## Menicka 1.0 — 2026-04-25

**Per-user override názvu/města restaurace** — sloupec `restaurace_overrides` v Uživatelé jako JSON. Globální záznam v Restaurace zůstává jako fallback. URL **nelze měnit přes edit** (musí remove + re-add).

**2-stage `addRestaurant`**:
1. Server registruje + vrací response (~1-2 s, jen profile fetch).
2. Frontend volá `fetchMenuForRestaurant` separátně pro stažení menu (~1-2 s).
Bez tohoto trvalo `addRestaurant` 3-5 s blokujících.

**Slug fallback** v `Restaurants_register_` — pokud parser z profile stránky nedá název (např. nestandardní HTML), `_slugToName_` z URL slugu vyrobí lidsky čitelný název (`radegastovna-rex` → `Radegastovna Rex`). Město zůstane prázdné, uživatel doplní přes ✏️.

**Meta description jako primární zdroj** názvu/města (`<meta name="description" content="Denní menu <NAZEV>,<MESTO>, …">`). Title fallback pro restaurace bez prefixu "Restaurace ".

---

## Menicka 0.5 — 2026-04-24

**Velký redesign — URL-only flow**:
- Vstup pro registraci je VŽDY plná URL z menicka.cz (`<id>-<slug>.html`).
- Bez URL nelze garantovat reálný název → registrace odmítnuta.
- Sloupec `výchozí` v Restaurace nahradil `default_restaurace` v Konfiguraci.
- `repairRestaurants` admin funkce pro one-shot migraci dat.
- `cleanupOrphanSubscriptions` pro vyčištění orphans z user.sledovane_restaurace.

**Browser User-Agent** povinný v `_menickaFetch_` (jinak menicka.cz vrací prázdné menu = bot detection).

**HTML strukturní parser** (`<table class='menu'>`, `<tr class='soup'>`, `<tr class='main'>`, `<td class='food'>`, `<td class='prize'>`, `<em title>`) místo plain-text parsingu, který fungoval špatně (cena na samostatném `<td>` po stripnutí tagů byla na jiné řádce než název).

**Bug fix _todaySection_**: regex `<h2[^>]*>[\s\S]*?<span class='dnes'>` chytal od **první** h2 (pondělí) až po `class='dnes'` u soboty místo soboty samé. Opraveno: `lastIndexOf('<h2', dnesIdx)` najde přímo h2 dneška.

---

## Menicka 0.4 a starší — 2026-04-24

**Modulární refactor** monolitického `menicka-script.gs` (750 řádků) do 9 modulů s prefixem `menicka_`:
- Util, Auth, Config, Users, Restaurants, Cache, Scraper, Parser, Init, Code

**Workspace-only auth** přes `Session.getActiveUser()` + `access: DOMAIN` v manifestu (zrušen API klíč `'jurencak-2026'` který byl plaintext v HTML).

**Šablonová cache** (`CacheService` 5–10 min TTL) pro config, restaurants, user, menu_map.

**Auto-create uživatele** s defaulty z config + `_selfHealSubscriptions_` pro existující uživatele s prázdným seznamem.

**Triggery** `refreshAllMenus` v 9:00 a 11:00 Europe/Prague (timezone-aware).

**Server-rendered bootstrap** — JSON injekt do HTML šablony, žádný extra round-trip pro startup.

**RSS feed** přes Drive XML soubory (1 per uživatel, sdílený s Anyone with link). Skryté v UI od v1.5.

**deploy.sh** v0 — push + bump 0.X verze + redeploy. Locale-fix LC_NUMERIC=C přidaný později.
