# CHANGELOG

Verzování: `vYYYYMMDD.NNN` (datum + tisíciny). Counter resetuje každý den.

Před přechodem na datumový formát byly verze `Menicka 0.5` až `Menicka 1.6` (semver-style). Z důvodu konzistence s parent Jídlogic projektem (datum + setiny) přepnuto.

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
