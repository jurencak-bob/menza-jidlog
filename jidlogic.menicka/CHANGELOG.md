# CHANGELOG

Verzování: `vYYYYMMDD.NNN` (datum + tisíciny). Counter resetuje každý den.

Před přechodem na datumový formát byly verze `Menicka 0.5` až `Menicka 1.6` (semver-style). Z důvodu konzistence s parent Jídlogic projektem (datum + setiny) přepnuto.

---

## v20260429.001 – v20260429.002 — 2026-04-29

**Rebrand na meníčka BE** — _Blogic Edition_ (pro veřejnou tvář) / _Bob Edition_ (insider humor). Brand změny: header `meníčka` + outlinovaný badge `BE` (subtle, muted), `<title>`, error pages, GAS `setTitle`, RSS feed title, PWA manifest, footer (původní „meníčka by Bob" → „meníčka BE", BE už nese ten význam). Důsledné lowercase „meníčka" všude — odlišení od third-party brand `Meníčka.cz` (zdroj dat). Reference na zdroj `Meníčka.cz` v parser komentáři zachována.

**Cols slider auto-bump po addRestaurant** ([menicka_view.html:2196](menicka_view.html#L2196)) — po úspěšném `addRestaurant` se `updateColsSlider() + setCols(maxCols())` automaticky promítne nový max. Předtím slider zůstal na původní hodnotě a nová karta padla na další řádek, dokud user ručně nesáhl na slider. Konzistentně s userovým očekáváním „přidám podnik, vidím ho vedle ostatních".

**Info ikona 22 → 24px + stroke 2.2** ([menicka_view.html:315](menicka_view.html#L315)) — `.info-btn svg` v nastavení (přidat restauraci) byla na 22px optikou subjektivně malá, navýšeno + tlustší stroke pro lepší čitelnost.

---

## v20260428.003 — 2026-04-28

**`nearMinute(0)` na všech triggerech** ([menicka_Init.gs:347](menicka_Init.gs#L347)) — bez ní GAS scheduler rozhazuje fire čas v rámci celé hodiny (až ~45 min jitter), refresh i cleanup pak fired pozdě (např. 17:45 místo 17:00). S `nearMinute(0)` typicky ±5 min od cílové minuty. Vzor podle parent Jídlogic projektu (`Menza.feed.js`). **Pozor:** stávající registrované triggery zůstávají bez `nearMinute` dokud někdo ručně nespustí `setupTriggers()` z editoru.

---

## v20260428.002 — 2026-04-28

**Bug fix: cleanup cache nemazal — `String(Date)` vs `_formatDate_`** ([menicka_Cache.gs](menicka_Cache.gs)) — `_today_()` vrací `"2026-04-28"`, ale Google Sheets autoformátuje takový string na Date object při zápisu. Při čtení `getValues()` vrátil Date instance, takže `String(dates[i][0])` produkovalo `"Mon Apr 28 2026 …"` — nikdy se nenamatchovalo se string datumem. `Cache_getMenuMap_` používal `_formatDate_(r.datum) === datum`, takže čtení menu fungovalo. 5 míst, co mazalo / hledalo existující řádek používalo naivně `String(...)`: `Cache_storeMenu_` (find existing), `Cache_pruneOld_`, `Cache_pruneStale_`, `clearTodaysCache`, `Cache_removeForRestaurant_` — všechna teď používají `_formatDate_()` pro porovnání. Cleanup v 17:00 logoval „smazáno 0 řádků" a tvářil se, že běžel.

---

## v20260428.001 — 2026-04-28

**Drawer Nastavení** ([menicka_view.html](menicka_view.html)) — předěláno z inline `display:none/block` na drawer pattern:
- **Desktop**: roll-down panel pod hlavičkou (max-width 800px, max-height `calc(100vh - 80px)`, `transform: translateY(-110% → 0)`, header z-index 700 → modál se zaroluje pod hlavičku jako pod „dveře"). Trigger: cog ikona v hlavičce. Zavírá se přes chevron-up close-handle obdélník vyčnívající ze spodního okraje (vyrůstá z modálu, default muted, hover accent), Esc, klik na backdrop.
- **Mobil**: slide-out z prava (max-width 560px, fullwidth pod 540px, transform translateX 100%→0). Trigger: avatar s iniciálami z emailu (`emailToInitials`, vzor podle Jídlogic Obedy.html). Drawer header obsahuje avatar 42×42 + jméno (derivované z email local part, `emailToDisplayName`) + email + close X. Mobile zavírá X v drawer-headeru.
- **Container queries** na `.settings` (`container-name: drawer`) → `.fav-list` grid 1/2/3 sloupce podle reálné šířky panelu (ne viewport).

**Drag karet za záhlaví** (desktop only) — Sortable.js na `#restaurants` gridu, handle `.card-header`, filter pro klikatelné prvky (`.card-link, .card-hide-btn, .card-refresh-btn`). Reorder mapuje pořadí přes `visibleIds()` zpět do `sledovane_restaurace` tak, aby skryté/odfiltrované karty zůstaly na svých absolutních pozicích.

**Eye-off ikona v hlavičce karty** (desktop only) — klik = uloží do `skryte_restaurace` + toast „Skryto. Znovu zobrazit v Nastavení."

**Padding 20px mezi sticky hlavičkou a kartami** — `.restaurants-wrap` má `padding-top: 20px` (předtím 0, karty nalepené na header).

**Logo restaurace v UI zakomentováno** — backend dál fetchuje `foto_url`, jen se nerendruje (komentáře v kódu instruují, co odkomentovat pro re-enable).

---

## v20260427.009 – v20260427.015 — 2026-04-27

**Menza dělená do 4 sekcí** ([menicka_Menza.gs](menicka_Menza.gs)) — Polévky / Oběd / Oběd ostatní / Pizza, podle členění UTB webkredit. Nové menu klíče `obed`, `obed_ostatni`, `pizza` (vedle stávajícího `polevky`); `hlavni_jidla` zůstává pro non-menza zdroje. Per-kategorie counter pro číslování (oběd 1–5, oběd ostatní 1–2, pizza 1–2). FE `MAIN_KEYS` = `['hlavni_jidla', 'obed', 'obed_ostatni', 'pizza']` — `isMenuEmpty`, `hasFavoriteMain`, `hasFavoriteAny` a `onlyDish` filter berou všechny hlavní sekce.

**Trailing allergen strip** ([menicka_Parser.gs:124](menicka_Parser.gs#L124)) — některé restaurace dávají alergeny jako prostý text na konec názvu (`"Italská minestrone 1, 9"`). Parser detekuje koncový pattern `\s+\d{1,2}(,\s*\d{1,2})*\s*$`, validuje 1–14 (EU číslování) a strippuje. Pokud `<em>` parser z původního HTML nic nedostal, uloží stripnuté hodnoty jako `alergeny`.

**Failure detection v cooldownu** ([menicka_Restaurants.gs:172](menicka_Restaurants.gs#L172)) — když poslední fetch byl chyba (UTB blip, parser exception, generic „nepodařilo načíst" / „selhal" string), `Restaurants_refreshMenuFor_` přeskakuje 15-min cooldown. `Menza_fetchTodayMenu_` označuje fetch failures `menu.transient_error = true`. FE má symetrickou detekci v `isFailedMenu(menu)` + `canRefreshMenu(ts, menu)`, label tlačítka říká „Poslední pokus se nepodařil" a tooltip „Klikni pro nové stažení". Bez toho se zaseknutý error cache na 15 min stal blokujícím.

**Gramáž z UTB Menzy** ([menicka_Menza.gs:39](menicka_Menza.gs#L39)) — regex zachytává hodnotu i jednotku zvlášť (např. `120g`, `0.33l`), místo aby se stripovala. Hodnota se uloží do `mnozstvi` jako u iframe parseru. Nový toggle „Zobrazit gramáž / objem u jídel" v Nastavení (default ON, localStorage `menicka_show_mnozstvi`) — vypne malé štítky pod položkami.

**Justice for Nature v patičce** — odkaz + logo z `justicefornature.org`. Zdrojové logo je bílé, takže CSS filter `invert(1)` v light módu na tmavé, dark mód nativní. Vlastní třída `footer-logo-j4n` (ne sdílená s `footer-logo-img` u blogicu, kde se aplikuje `invert(1) hue-rotate(180deg)` jen v dark).

---

## v20260427.003 – v20260427.008 — 2026-04-27

**Footer paralelní s Jídlogic** ([menicka_view.html](menicka_view.html)) — `meníčka by Bob · Jídlogic · blogic logo`. Logo míří na blogic.cz, prostřední odkaz na Jídlogic deploy (`?app=obedy`). Dark mode má `filter: invert(1) hue-rotate(180deg)` na PNG logu — černé části se invertují na bílé, oranžová tečka zůstává.

**Banner / tooltip používají hodinová okna místo přesných časů.** Místo "9:00" teď "9:00–10:00" (Google atHour() trigger fire window má až ~15 min jitter, přesný čas nejde určit). Subtext pod bannerem to vysvětluje jednou pro všechny stavy. Refresh tlačítko mimo okno hlásí "Aktualizovat lze jen v okně 9:00–17:00".

**Diagnostika triggerů** — `listTriggers()` admin funkce vypíše do Logger.log všechny registrované triggery. Pomohlo identifikovat, že po změně schedule se musí ručně spustit `setupTriggers()`.

**Filtr „Skrýt jídla, která nejsou oblíbená"** ([menicka_view.html:830](menicka_view.html#L830)) — přejmenováno z "Skrýt neoblíbená hlavní jídla", přidána Lucide `info` ikona vpravo s nativním tooltipem: „Pokud má restaurace oblíbenou jen polévku, zobrazí se pro daný podnik kompletní jídelníček." `stopPropagation` zabrání toggle při kliku na ikonu.

**Logo restaurace z menicka.cz tisk-profilu** ([menicka_Parser.gs:206](menicka_Parser.gs#L206), [menicka_Scraper.gs:46](menicka_Scraper.gs#L46)):
- Nový sloupec `foto_url` v listu Restaurace.
- `Parser_extractPrintProfile_` čte `<h1>` (název) + `<img class='logo_restaurace'>` (foto). Print verze `tisk-profil.php?restaurace=<id>` má čisté HTML bez nav/JS.
- Při registraci restaurace 2 fetche: `profile.html` (název + město) + `tisk-profil.php` (foto). Pokud profile parser selže s názvem, fallback je print parser, pak slug.
- `backfillRestaurantPhotos()` admin funkce — idempotentní doplnění fota pro existující restaurace.
- 40×40 zaoblený thumbnail vlevo v hlavičce karty, lazy-loaded, `onerror="this.remove()"` při 404.
- **Defaultně skrytý** — toggle v Nastavení „Zobrazit logo restaurace v hlavičce karty" (localStorage `menicka_show_thumb`, default OFF). Pod ním poznámka: „Logo se ukáže jen u restaurací, pro které se ho podařilo získat z menicka.cz."

**Refresh ikona — loading state + tooltipy per stav** ([menicka_view.html:1228](menicka_view.html#L1228)):
- `STATE.loadingMenu[id]` flag track in-flight fetchů (manual refresh i fetch po addRestaurant).
- CSS `@keyframes refresh-spin` — ikona se otáčí 1 s/rev během loadingu.
- Každý ze stavů má vlastní tooltip i label: loading („Stahuji jídelníček…"), can-refresh („Aktualizovat jídelníček…"), čerstvé („Jídelníček je čerstvý…"), mimo okno (range message), nikdy nestaženo („Jídelníček ještě nebyl stažen — refresh proběhne automaticky v dalším okně.").
- Refresh row se ukáže vždy (i bez menu), aby uživatel měl konzistentní UX.

**Vlastní číslování restaurace má prioritu** ([menicka_view.html:1306](menicka_view.html#L1306)) — pokud `item.nazev` začíná na `^\d+\.\s+` (např. „1. Grilovaná kotleta"), použije se to jako display number a z textu se odstraní. Jinak fallback na `item.cislo` z parseru. Řeší duplicitu „1.   1. Grilovaná…", kterou vytvářely restaurace, co si číslují jídla samy.

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

**Verzování přepnuto na datumový formát** (tisíciny pro meníčka, parent Jídlogic používá setiny).
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
