# Meníčka

Web app pro agregaci denních menu z restaurací (zdroje: [menicka.cz](https://www.menicka.cz) iframe + UTB Menza JSON API). Hostovaná v Google Apps Script (server + HtmlService UI), zabalená jako PWA wrapper na GitHub Pages pro mobil.

**Live:** [https://jurencak-bob.github.io/menza-jidlog/menicka.html](https://jurencak-bob.github.io/menza-jidlog/menicka.html) (PWA wrapper) → iframuje GAS deploy `AKfycbw4…/exec`.

**Vstup:** pouze přihlášení Google uživatelé z domény `@blogic.cz`.

---

## Architektura v jedné větě

Container-bound Apps Script projekt nad Google Sheetem. Cron-trigger 2× denně stáhne menu pro všechny aktivně sledované restaurace, JSON cache uloží do listu `Menu Cache`. UI je samostatná HtmlService šablona, která se přes `google.script.run` napojuje na server-side veřejné funkce.

### Datový model (4 listy v jednom sheetu)

| List | Účel | Klíčové sloupce |
|---|---|---|
| `⚙️ Konfigurace` | Globální settings | `klíč`, `hodnota` |
| `Restaurace` | Globální katalog | `id`, `název`, `město`, `url`, `aktivní`, `výchozí` |
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
├── menicka_Rss.gs         — RSS XML generátor (1 file v Drive per uživatel, sdílený link)
├── menicka_Init.gs        — initializeMenicka, repair*, cleanup*, migrace, triggers
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

`doGet` server-renderuje JSON do HTML šablony jako `BOOTSTRAP` proměnnou — žádný extra round-trip pro startup data. JSON obsahuje: user, restaurace (s aplikovanými per-user overrides), menu (cache pro dnešek), datum.

### Refresh menu (cron 9:00 a 11:00 Europe/Prague)

`refreshAllMenus()` ([menicka_Scraper.gs:75](menicka_Scraper.gs#L75)):
1. `Scraper_collectIds_` sjednotí ID napříč všemi `sledovane_restaurace` + výchozími.
2. `Cache_pruneStale_` smaže cache pro datum != dnes nebo ID, které se neobjevilo v unii.
3. Pro každé ID:
   - Pokud `id === "menza"` → `Menza_fetchTodayMenu_()` (UTB JSON API).
   - Jinak → `Scraper_fetchHtml_` (iframe HTML) + `Parser_parseMenu_`.
4. `Cache_storeMenu_` zapíše JSON.
5. Volitelně `Rss_publishAll_` regeneruje XML feedy (skrytá feature).

### Stahování menicka.cz

Iframe URL `https://www.menicka.cz/api/iframe/?id=<id>`. **Vyžaduje browser User-Agent**, jinak server odpovídá `Pro tento den nebylo zadáno menu` na všech dnech (bot detection). Encoding `windows-1250` → konverze přes `Utilities.newBlob().getDataAsString()`. Detaily viz memory **reference_menicka_cz_endpoints**.

Parser hledá `<span class='dnes'>` markeru u `<h2>` aby určil dnešní den, pak iteruje `<tr class='soup'>` a `<tr class='main'>` v sousední `<table class='menu'>`.

Info řádky bez ceny (`Pro tento den nebylo zadáno menu.`, `Restaurace má tento den zavřeno.`) detekuje `INFO_RE` a uloží do `menu.info` místo polévky.

### Stahování UTB Menzy

`Menza_fetchTodayMenu_` ([menicka_Menza.gs:42](menicka_Menza.gs#L42)):
1. `GET /Ordering?CanteenId=3` → seznam dostupných dnů.
2. Najít dnešní datum, pokud chybí → `info: "Menza dnes nevaří."`.
3. `GET /Menu?Dates=<dt>&CanteenId=3` → položky.
4. Mapping: `polévka` → polevky, `oběd` / `oběd ostatní` / `pizza` → hlavni_jidla, `minutky` → ignorováno.
5. Cena: `item.price2` (plná, nikoli studentská).

### Per-user overrides

Sloupec `restaurace_overrides` v Uživatelé je JSON `{"<id>": {nazev, mesto}, …}`. `Restaurants_setOverride_` updatuje, `Restaurants_resolveForUser_` aplikuje při bootstrap. URL nelze měnit (uživatel musí restauraci odebrat a znovu přidat s jinou URL).

### Frontend reorder

Sortable.js přes CDN. Drag handle `⋮⋮`, animation 150 ms, touch fallback. Po drop:
1. `onEnd` callback získá nové pořadí ID.
2. `STATE.user.sledovane_restaurace = newIds.join(',')`.
3. `saveSettings({ sledovane_restaurace })` debounced 350 ms.

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
- `menicka.html` — wrapper s `<iframe src="…GAS deploy URL…">` + loading overlay
- `menicka-manifest.json` — PWA manifest (start_url, icons, theme)
- `sw.js` — service worker cachuje shell

Po `git push origin main` GitHub Pages za 1–3 min publikuje na [https://jurencak-bob.github.io/menza-jidlog/menicka.html](https://jurencak-bob.github.io/menza-jidlog/menicka.html).

---

## Admin / debug funkce

Spouštět ručně z Apps Script editoru:

| Funkce | Soubor:řádek | Účel |
|---|---|---|
| `initializeMenicka` | [menicka_Init.gs:7](menicka_Init.gs#L7) | Vytvořit / migrovat listy + nastavit triggery |
| `clearAllCaches` | [menicka_Init.gs:53](menicka_Init.gs#L53) | Vyčistit CacheService klíče (config, restaurace, menu_map) |
| `repairRestaurants` | [menicka_Init.gs:78](menicka_Init.gs#L78) | Pro placeholder řádky v Restaurace zkusit doplnit info nebo smazat |
| `cleanupOrphanSubscriptions` | [menicka_Init.gs:146](menicka_Init.gs#L146) | Odebrat IDs z user.sledovane_restaurace, které nejsou v katalogu |
| `bulkAddRestaurantsForUser` | [menicka_Init.gs:78cca](menicka_Init.gs) | Hromadné přidání URL pro daný email (po havárii) |
| `migrateDefaultsFromConfig` | [menicka_Init.gs:178cca](menicka_Init.gs) | Z `default_restaurace` v config nastav `výchozí=1` v Restaurace |
| `refreshAllMenus` | [menicka_Scraper.gs:75](menicka_Scraper.gs#L75) | Stáhne menu pro aktivní restaurace (volá ho cron trigger) |
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

---

## Odložené featury (hidden, kompletně implementované)

- **RSS feed per uživatel** — Drive XML soubor s veřejným odkazem, regeneruje se po refreshAllMenus. UI tlačítko v Nastavení skryté `hidden` atributem.
- **Stravovací omezení** (vege, vegan, bezlepku, bezlaktozy, bezorechu) — chips v Nastavení, ukládají se do user.dieta. Chybí **detekční logika** která by označila vhodná jídla. Skryté.

Když je budeš chtít vrátit, smaž `hidden` atribut z příslušných `<div data-feature="…">` v menicka_view.html.

---

## Roadmap / nápady

- **Detekce vhodných jídel pro stravovací omezení** — heuristika z názvu jídla + alergenů (např. alergen 1 = lepek → bezlepek=false; "tofu" / "vegan" v názvu → vegan=true). Vyžaduje testovací datasety.
- **Oblíbená jídla** — `oblibena_jidla` sloupec existuje, žádná UI ani logika. Návrh: ⭐ tlačítko u každého jídla v kartě → log do user.oblibena_jidla → zvýraznění při příštím výskytu.
- **Historie menu** — list `Menu Cache` udržuje jen dnes. Pokud chceme historii (statistiky "co jsme jedli minulý měsíc"), musíme zachovat starší řádky. Pravděpodobně nový list `Menu Historie` aby se nemíchalo s aktivním cache.
- **Notifikace přes Google Chat / email** — parent projekt (Jídlogic) tohle dělá pro UTB Menzu, mohli bychom analogicky pro restaurace ze sledování.
- **Sdílení sledovaného seznamu** mezi kolegy (něco jako "tvůj kolega Y má rád tyhle restaurace, přidat všechny?").

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
