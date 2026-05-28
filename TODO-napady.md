# Jídlogic — TODO / nápady k realizaci

Export z paměti (`project_improvement_ideas.md`) — stav k 2026-05-15.
Plná specifikace každého bodu je v memory; tady je kondenzát.

> Nečíslováno chronologicky — čísla odpovídají interním ID v memory (jsou nesouvislá, jak se nápady přidávaly).

---

## Top otevřené — rychlý přehled

| # | Název | Stručně | Odhad |
|---|---|---|---|
| #52 follow-up | Pricing — edit při plném počtu = historický context | Base fix HOTOVO v20260515.08: summary čte stored cenaKs/typCeny z DATA.selections (lock-in při confirmu, BE vrátí correctedItems, FE updatuje selections). Zbývá: když user edituje jídlo a karta je už mezitím přes limit, live preview ukazuje plnou cenu i pro ks, které byl v původním zápisu za stu. **Cíl:** editovat v rámci cen platných v době původního zápisu — tj. live preview by měl respektovat „už mám zapsanou pozici X na kartě, takže až do X kusů je za stu, nad to plná". Vyžaduje, aby preview pricing znal **moji historickou pozici v cardStats** (= co bylo `projectedMeals + mojeJidla` při původním confirmu). Možný flow: FE drží `lockedCardPosition[dayDate]` (= snapshot z confirmu) → live preview počítá od této pozice, ne od aktuálního cardStats. | — |
| #53 follow-up | Swipe carousel — vrátit ghost preview souseda | Base swipe HOTOVO v20260515.11: ghost preview dočasně vypnut, jen single-card slide animace (slide-out → selectDay → slide-in z opačné strany). Root cause potvrzen: synchronní `prerenderGhost` (2× selectDay v touchmove handleru ~100ms) blokoval main thread → touchend event se zpožďoval / dropnul → karta zůstávala v posunuté pozici. Zbývá: vrátit ghost preview souseda BĚHEM gesta (Bob: „není vidět, že se sune další den"). Cesty: (a) async ghost přes rAF mimo touchmove hot path — ale dual selectDay stále blokuje 100ms když firne; (b) refactor render funkcí na pure form (`renderMenu(rootEl, dayIdx)`, žádný side-effect na aktivní DOM, jen ~50ms a renderuje přímo do ghost) — clean, ale velký refactor 4 funkcí + 19 getElementById calls; (c) hybrid: vyrobit ghost jen pokud user gestikuje dlouho (`dx > threshold/2`) — preview pro pomalé záměrné swipy, žádné pro rychlé flicky. Doporučuju (b) — clean a deterministic. | — |
| #33 P2 | Kontrola karty — Phase 2 | Auto-shoda + alerting + historie + audit; rozšíření Phase 1 (sběr Před/Po HOTOVO) | — |
| #34 | Migrace z ext sheetu | Denní import útrat + dobití z ext sheetu; Phase 0 (interní mirror list) jako cesta k drop ext sheetu | ~13 h + admin manuál |
| #15 | Groq AI v Chatu | Stručné názvy jídel přes Groq, samostatný list „Chat menu" | — |
| #16 P2 | OS push notifikace | Fáze 1 (avatar badge) HOTOVO; chybí Web Push + FCM | — |
| #29 | Offline režim | Úroveň A: session-level queue + cache (3–4 h) | ~3–4 h |
| #42 | Porovnání Jídlogic vs ext sheet | Systematický diff útrat/dobití, modal s tabulkou rozporů | ~5 h MVP |
| #45 | Nativní PWA místo iframu | Strategický refactor: GAS JSON API + GH Pages frontend bez iframe | ~20 h |
| #47 | Zapsat za uživatele | Admin zápis jídla za jiného (stub hotov ve verzi .30) | — |
| #48 | RTG režim | Admin read-only impersonation (tiché, ne v nápovědě) | — |
| #50 | Sjednocení tooltip patternu | Tech-debt cleanup, low-prio | ~2 h |

Další otevřené (nižší priorita / doplňkové):

| # | Název | Stručně |
|---|---|---|
| #3 | Statistiky v sheetu | Průměrné ceny, nejčastější jídla, počet výpadků |
| #17 | Role „Správce" (Fáze 2–5) | Fáze 1 hotová (badge); chybí Read/Write/Management/Audit |
| #23 | Překladový list v Konfiguraci | List „🌐 Texty" + helper `t()` pro user-facing stringy |
| #26 | Admin: vyrovnání kreditu | `obedyVyrovnejKredit` — admin nastaví reálný zůstatek |
| #39 | Testy frontendu | Lightweight node + jsdom, 7 helperů × 4 cases ≈ 28 testů |
| #40 | Globální error boundary | Window.error hook + „Nahlásit" mailto |
| #41 | Read-only přehled sdíleného sheetu | Modal s tabulkou aktuálního týdne z ext sheetu |
| #43 | Verze pod progress barem | Brand SVG + verze na loading overlay |
| #44 | Tisícový separátor v inputech | NBSP v moneyinputech (focus-plain, blur-formatted) |

---

## Detaily otevřených bodů

### #15 — AI zjednodušení názvů jídel v Chatu (Groq)

**Cíl:** V Chat notifikaci stručný čitelný název jídla (hlavní + příloha). Dnes ořez za první čárkou ztrácí přílohu.

**Flow:**
1. 10:30 trigger — po stažení menu pošli celý dnešní jídelníček do Groq (`llama-3.1-8b-instant`)
2. Výsledek do nového listu „Chat menu 💬" (`Datum | Č. jídla | Zkrácený název`)
3. 10:45 trigger (notify) sáhne pro zkrácený název, fallback = ořez za čárkou

**Konfigurace:** `GROQ_ENABLED`, `GROQ_API_KEY` (Script Properties), `GROQ_MODEL`, `GROQ_TRIGGER_TIME`.

**Rozsah:** Jen Chat notifikace. Sheet/JídLOG/Jídlogic dál čtou originál z WebKredit API.

---

### #16 P2 — OS push notifikace přes PWA

Fáze 1 (in-app avatar badge) **HOTOVO**. Fáze 2 a 3 zbývají.

**Fáze 2 — Push přes Firebase Cloud Messaging:**
- Web Push API (Notifications + Service Worker)
- Permission request při prvním otevření (po user gesture)
- Subscription do listu „Push subscriptions" v Menza sheetu (nový endpoint `obedyRegistrujPush`)
- Trigger ~10:45 obejde subscriptions a pošle push
- iOS PWA vyžaduje VAPID + push server (GAS to neumí → FCM nebo Cloudflare Worker / Vercel)

**Fáze 3 — Opt-in toggle „Posílat notifikace" v side-menu.**

Edge cases: víkend/svátek → žádná notifikace; diff jen když přibylo menu; uživatel po výběru → badge zmizí.

---

### #17 — Role „Správce" (Fáze 2–5)

Fáze 1 (struktura + badge) **HOTOVO** (existuje role model admin/assistant/user, viz memory).

Zbývající fáze:
- **Fáze 2 — Read:** admin vidí data všech (přehled, historie kreditu jiných). Nová stránka „Přehled všech".
- **Fáze 3 — Write:** admin může zapsat za jiného (výběr + kredit). Dropdown „Za: …".
- **Fáze 4 — Management:** seznam uživatelů v UI (add/edit/deaktivovat).
- **Fáze 5 — Audit log + mail notifikace** cílovému uživateli.

Backend pattern: `jeSpravce_(email)` guard, audit poznámka `[admin: <email>]`, mail uživateli o admin akcích.

---

### #23 — Překladový / textový list v Konfiguraci

**Cíl:** User-facing texty měnit v Sheets bez redeploye.

**Datový model — nový list „🌐 Texty":**

| A: Klíč | B: Kontext | C: Text | D: Poznámka |
|---|---|---|---|
| `btn.confirm.ready` | Jídlogic | Potvrdit výběr | … |

Klíče hierarchické (tečková notace). Kontext: `Jídlogic` / `Chat` / `E-mail` / `JídLOG` / `Všude`.

**Backend:** helper `t(klic, defaultText)` + 5-min cache. `obedyNactiData` pošle frontendu hotový slovník `texts`.

**MVP scope:** ~16 klíčů — marker (`marker.name`, `marker.tooltip`, `marker.category_label`), tlačítka (`btn.confirm.*`), modal konfliktu, typy kreditu, guest banner.

**Fáze 2:** Chat / e-mail (smallprint, linky, subject lines).

---

### #26 — Admin: vyrovnání kreditu uživatele

**Cíl:** Admin explicitně nastaví aktuální zůstatek libovolného usera. Systém dopočte rozdíl → zápis do Kreditu jako `vyrovnání`.

**Use cases:** drift karta vs Jídlogic, onboarding s existujícím kreditem, po kvartální uzávěrce, korekce po bugu.

**Backend:** `obedyVyrovnejKredit(cilovyEmail, cilovyStav, duvod)` — guard `jeSpravce_`, povinný důvod, LockService, zápis do Kreditu typu `vyrovnání` (nový typ ve validaci), mail uživateli o změně.

**UI:** Modal v side-menu (admin-only). Dropdown uživatelů, aktuální stav, cílový stav, dopočet rozdílu (barevně), důvod (min ~10 znaků).

**Edge cases:** target = current → no-op; admin sám sobě OK (redundantní mail); cílový stav = 0 nebo záporný OK; deaktivovaný user OK.

**Závislost:** Fáze 1 z #17 (detekce `isAdmin`) — hotovo.

---

### #29 — Offline režim

**Constraint:** Jídlogic je iframe na cross-origin (gh-pages → script.google.com). SW nemůže interceptovat GAS requesty.

**Tři úrovně:**

**Úroveň A — Session-level (DOPORUČENO, ~3–4 h):**
- `navigator.onLine` + offline banner pod hlavičkou
- Queue save operací (oběd / topup / korekce) do localStorage s UUID
- Replay na `window.ononline` přes `google.script.run`
- Backend idempotency guard (`opId` v ScriptProperties cache, TTL 24 h)
- Read-only cache `DATA` v localStorage
- Sync badge varianta „📴 offline"

**Úroveň B (~2–3 h navíc):** iframe failover → minimal viewer v gh-pages SW cache.

**Úroveň C:** Full offline-first PWA — zahodit iframe, refaktor `google.script.run` → `fetch()` doPost. Pro 5 uživatelů overkill (= idea #45).

**Use cases:** Slabý 4G v menze, MHD tunel, mid-session signal drop. Nepokrývá první otevření offline.

---

### #33 P2 — Kontrola stavu karty (Phase 2)

**Phase 1 HOTOVO 2026-04-22:** uživatel zapíše stav karty Před/Po do listu `Kontrola karty 💳`, propisuje se do ext sheetu sloupců R/S, jen pro dnešní den.

**Phase 2 (zbývá):**
- **Automatická kontrola shody** na konci dne (delta = `(R − S) − |Q|`)
- **Alerting:** záporná delta → admin mail (typicky někdo zapomněl zápis)
- **Historický report:** „kdy karta sedla / nesedla" — barevně (zelená OK, oranžová warn > 5 Kč, červená < 0)
- **Multi-reading:** víc lidí denně, R = první čtení, S = poslední (timestampem)
- **Zpětné zadání** přes select dne (někdo si vzpomene večer)
- **Audit historie čtení** v listu (insert-only, žádný overwrite)
- **Edge case dobíjení během dne:** `delta = (R + dobití) − S − Q`

Cross-link s #42 (porovnání s ext sheet).

---

### #34 — Migrace z ext sheetu

**Cíl:** Postupně přesunout všechny uživatele z ručního zápisu do ext sheetu do Jídlogicu. Mezitím Jídlogic **denně importuje** per-user hodnoty z ext sheetu → user má historii útrat/dobití i bez aktivního používání.

**Phase 0 (DOPLNĚK 2026-05-04) — Interní mirror list:**
- Nový list `Přehled obědů 📊` uvnitř Jídlogic spreadsheetu (řádek = den, sloupec = extNick)
- Cell value = `-celkem`, cell note = strukturovaný audit blok (jako dnes v ext sheetu)
- **3× paralelní zápis** během přechodu: (1) Jídlogic db (Kredit + Výběr obědů) + (2) ext sheet + (3) interní mirror
- Po ověřeném paralelním běhu → drop ext sheet writes (flag v Konfiguraci → `if (false)` v call sitech)
- Sync zápis do mirror v rámci stejného `SpreadsheetApp` handle (atomicita s Jídlogic db)
- **Kontrola karty zůstává mimo mirror** (R/S sloupce nejsou per-user matrix)

**Phase 1 (původní spec) — Import ext → Jídlogic:**
- Sloupec F „Import z ext" v Uživatelé (ANO/NE)
- Sloupec „Zdroj" ve Výběr obědů a Kredit (`jidlogic` / `import-ext` / `baseline-import`)
- **Baseline manuálně** = 1 řádek v Kreditu před prvním importem (`baseline-import`)
- Trigger denně 23:30 → `importDennyZExtSheetu_` (7denní sweep, idempotent upsert)
- Kategorie `import-legacy` ve Výběr obědů — filtrovaná ze statistik, ale **započítaná do kreditu**
- Při konfliktu (user už zapsal sám) → import skipuje
- UI: ikona `download` v historii kreditu (ne-editable), readonly banner v jídelníčku
- Diagnostika `diagnostikaImportu()` v GAS editoru

**Prereq:** doplnit chybějící uživatele do listu Uživatelé (Kraken, Hyňa, Standa, Dan M, Hosté, Ondra, Vaňous, Katka, J. Netopil, Marek).

**Phase 2 (volitelně):** read-only mirror Jídlogic → ext sheet pro plně přešlé uživatele.

Odhad: ~13 h backend/frontend + ~30 min/user admin manuálních úkolů.

---

### #39 — Testy frontendu

**Cíl:** Pokrýt pure helpery v `Obedy.html` — dnes je `obedy.tests.js` jen pro backend (25 testů).

**Kandidáti:** `isDayHidden`, `computeSavedFingerprints`, `najdiSousedniViditelnyDen_`, `normalizeForMatch_`, `emailToNick_`, `fmtDateCZ`/`fmtDateShort`, `tierFromBalance`.

**Implementace:** node core + jsdom (malá dep). Harness načte inline `<script>` z Obedy.html, wrappuje v IIFE, exportuje helpery. Spouštění: `node obedy-frontend.tests.js`. Přidat do pre-deploy syntax checku.

Odhad: ~4 h. Nejlépe před startem #17 jako safety net.

---

### #40 — Globální error boundary + „Nahlásit"

**Cíl:** Zachytit JS errory v renderu/save, zobrazit error card místo prázdné stránky. Příprava pro debug v terénu (mobile dev tools = peklo).

**Komponenty:**
- `window.error` + `unhandledrejection` listenery
- `try/catch` wrappery kolem entrypointů: `renderMenu`, `renderDatepicker`, `confirmSelection`, `reloadData`, sync polling
- `showGlobalError(err, context)` → error card s ikonou `alert-triangle`, titulek, detail toggle (stack + UA + verze), 2 buttony („Znovu načíst" → `location.reload()`, „Nahlásit" → mailto admin@blogic.cz)
- Rate limit (flag `errorShown` v session)

Odhad: ~2.5 h. Priorita roste s prvním user-reportovaným incidentem „prázdná obrazovka".

---

### #41 — Read-only přehled sdíleného sheetu

**Cíl:** Snapshot aktuálního týdne ze sdíleného sheetu přímo v Jídlogicu — bez otvírání Google Sheets.

**UI:** Modal v side-menu („Kontrola sdíleného sheetu", `table-2` icon, guest-hide). Tabulka: řádky = uživatelé, sloupce = Po/Út/St/Čt/Pá + Dobíjení + Celkem týden. Hodnota + poznámka v tooltipu. Filtr „jen já" / „Všichni".

**Backend:** `obedyNactiSharedSheet({week, onlyMe})` → čte sheet přes `najdiRadekPodleNedele_`, vrací `{users: [{email, nick, days, dobiti, total}]}`. Cache 30 s.

**Groundwork pro #33 P2 a #34.** Odhad ~5.5 h.

---

### #42 — Srovnání částek Jídlogic vs sdílený sheet

**Cíl:** Systematicky porovnat Jídlogic DB se sdíleným sheetem. Rozšíření #33 jiným úhlem — #33 porovnává s **fyzickým zůstatkem z čtečky**, #42 s **obsahem buněk ext sheetu**.

**Endpoint `obedyKontrolaShody({week, onlyMe})`:**
- Per den: `jidlogicSuma` (z Výběr obědů) vs `extSheetHodnota` (absolutní)
- `rozdil = jidlogicSuma - extSheetHodnota` (tolerance < 0.01 = shoda)
- Vrací `{period, summary, rows: [{date, email, nick, jidlogic, extSheet, diff, note}]}`

**UI:** Modal s tabulkou rozporů (shody agregované do „N skryto"), filtry „jen já" / „Všichni", export CSV, admin-only button „Automaticky spravit" (přepíše Jídlogic + korekce).

**Fáze:** Phase 1 read-only (~5 h), Phase 2 admin fix (~1.5 h), Phase 3 daily monitoring (~1 h).

Dvě sekce v modálu (Obědy / Dobití) pro čistší mental model. Skip kvartální uzávěrky a marker „bez oběda".

---

### #43 — Verze pod progress barem na loading overlay

**Cíl:** Decentní brand SVG + verze („Jídlogic v20260423.05") jako pruh pod progress barem na loading overlay. Dnes verze jen v burger menu — debug v terénu by chtěl vidět rovnou.

**HTML/CSS:** `.loading-version-bar` flex row, monospace font, opacity 0.7. SVG 20×20.

**JS:** Helper na DOMContentLoaded přečte `.menu-version` v DOM a zkopíruje do `.loading-version-text` — jeden zdroj pravdy.

Odhad: ~25 min. Kosmetické, nízká priorita.

---

### #44 — Tisícový separátor v inputech

**Cíl:** NBSP mezi tisíci i v inputech peněz (korekce, stav karty, dobití). Dnes jen v display textech.

**Varianta B (focus-plain, blur-formatted):**
- `onblur` → reformat s NBSP („1 234,50")
- `onfocus` → strip NBSP zpět („1234,50") + `input.select()`
- Sanitize regex tolerantní k NBSP: `/[^\d, ]/g`
- Submit posílá vždy plain (už dnes přes `parseFloat(raw.replace(',','.'))`)

Edge cases: copy-paste z displaye, mobile keyboard `inputmode="decimal"`, Safari iOS setTimeout 0 finicky, caret position po blur.

Odhad: ~50 min. Kosmetika, nízká–střední priorita.

---

### #45 — Nativní PWA místo iframu

**Cíl:** Zrušit iframe architekturu („GH Pages wrapper → iframe na GAS HTML") a udělat plnohodnotné PWA s UI na GH Pages + GAS jen jako JSON API.

**Návrh:**
1. **GAS JSON API** — `doGet`/`doPost` vrací `ContentService` JSON. CacheService na menu.
2. **GH Pages nativně** — `index.html` + `script.js` obsahují celé UI. Auth přes Google Identity Services (GIS) + ID token (audience check, `hd=blogic.cz`)
3. **Service Worker** — cache app shell + data stale-while-revalidate

**Výhody:** rychlost (jen JSON, ne celé HTML), vlastní origin (push, Web Share, fullscreen), nativní pocit, offline mode (#29) zdarma.

**Úskalí:**
- **Auth flow** — explicit OAuth (GIS), GCP projekt s Client ID, 1–2× klik „Sign in" první návštěvu
- **CORS** — JSONP nebo Cloudflare Worker proxy
- **Duplicita UI** — Obedy.html ~8000+ řádků refactor (8–12 h)
- **Deploy flow** — 2 místa (clasp + git push), 2 verze (menu-version + sw.js cache)
- **Push nejsou zadarmo** — FCM + VAPID + permission flow

**Fázování:**
- **A** (malé): JSON API endpointy, volané z Obedy.html přes fetch — připravit půdu
- **B** (střední): GH Pages frontend paralelně, tester-only přes `?variant=native`
- **C** (velké): přepnout default, zrušit iframe
- **D** (volitelně): push, offline-first

Odhad MVP (bez push): ~20 h. Strategicky střední-vysoká, takticky nízká vs konkrétní user-value nápady (#33 P2, #34, #17/#26).

---

### #47 — Zapsat za uživatele (admin)

Stub hotov ve verzi .30 (refaktor pro `{ onBehalfOfEmail }` parametr u `obedyUlozVyber`). Plná funkčnost = Fáze 3 z #17 (Role Správce).

Cílová UX: dropdown „Za: …" v existujícím UI pro admin. Audit `[admin: <email>]` v poznámce, mail uživateli.

---

### #48 — RTG režim (admin read-only impersonation)

Tichá funkce — ne v nápovědě. Admin se může „dívat na appku očima uživatele" — vidí jeho výběry, kredit, statistiky, ale **nic nezapisuje**. Pro debug user reportů.

Implementace přes query param `?as=email` (gated `jeSpravce_`) + viditelný banner „🔍 RTG: prohlížíš jako {nick}" (pro admina samotného, ne vidí cílový user).

---

### #50 — Sjednocení tooltip patternu

**Cíl:** Sjednotit dva koexistující tooltip patterny → jeden floating (`.app-tip-popup` + `showAppTip`). Tech-debt cleanup.

**Co smazat:**
1. CSS pravidla pro `[data-tooltip].tooltip-open` a `[data-tooltip-long].tooltip-open` (class už nikdo netoggluje)
2. CSS hover `[data-tooltip*]:hover::after` (nahradit JS mouseenter/leave → `showAppTip`)
3. `data-tooltip` parsing helpers → render píše `class="app-tip-trigger" onclick="showAppTip(this)" data-detail="…"`
4. `.food-price[data-tooltip]::after` overrides (right:0)
5. `.food-num-tooltip` → nahradit `.app-tip-popup`, `showSoupTooltip` jako obal `showAppTip`

**Risk:** 6+ render míst, mouseenter timing vs CSS `:hover` (debounce na rychlé pohyby), QA napříč desktop/mobile.

Odhad: ~2 h. Nízká priorita — funguje to dnes (`.05` cílený fix vyřešil reálné problémy v overflow:hidden contextech).

---

## #3 — Statistiky v sheetu

Minimální spec v memory: průměrné ceny, nejčastější jídla, počet výpadků menzy. Bez detailní specifikace — k upřesnění až přijde priorita.

---

## Hotová historie (zkráceně, pro kontext)

| # | Název | Datum |
|---|---|---|
| #1 | Automatická validace konfigurace | — |
| #2 | Menu diff notifikace | — |
| #4 | Chat App pro výběr oběda (= Jídlogic) | 2026-04-17 |
| #6 | Web dashboard (blogic.cz design) | — |
| #7 | QR kód + ICS feed | — |
| #8 | Dashboard: čas načtení | — |
| #9 | Rozdělení triggerů (fetch / notify / retry) | — |
| #10 | Konfigurovatelný smallprint v chatu | — |
| #11 | Zkrácené názvy jídel v chatu | — |
| #12 | Přejmenování Dashboard→JídLOG | — |
| #13 | Animované pozadí dashboardu | — |
| #14 | PWA (Add to Home Screen) — iframe wrapper | — |
| #16 P1 | Avatar badge (in-app notifikace) | — |
| #17 P1 | Role Správce — struktura + badge | — |
| #18 | Explicitní „0 obědů" za den (marker) | 2026-04-19 |
| #19 | Viditelná odstávka menzy | 2026-04-19 |
| #20 | Swipe navigace mezi dny | 2026-04-19/20 |
| #21 | Optimistic UI + sync dot | 2026-04-19/21 |
| #22 | Zjednodušení UI historie kreditu + CSV | 2026-04-19 |
| #24 | Chytrá nabídka PWA installu | 2026-04-20 |
| #25 | Nápověda do Help.html | 2026-04-20 |
| #27 | UX gest na mobilu (rubber band + PTR) | 2026-04-20 |
| #28 | Testy backend sync flow | 2026-04-20/21 |
| #30 | Lucide ikony místo emoji (Fáze 1+2) | 2026-04-21 |
| #31 | Pricing — manual-edit detection (Variant A) | 2026-04-21 |
| #32 | Oblíbená jídla (zvýraznění v menu) | 2026-04-21 |
| #33 P1 | Kontrola karty — sběr Před/Po | 2026-04-22 |
| #35 | Nová ikona Jídlogic (koncept F) | 2026-04-22 |
| #36 | Soukromí v poznámkách ext sheetu (detail/anonym) | 2026-04-22 |
| #37 | Animované přesýpací hodiny pro not-yet-loaded | 2026-04-22 |
| #38 | Sjednocený toggle pro closed dny + dnes vždy | 2026-04-22 |

---

## Zdroj

- **Memory:** `project_improvement_ideas.md` (≈2700 řádků, plné specifikace včetně backendu, datových modelů a edge cases)
- **MEMORY.md index** (krátké hooky): viz Cowork
- **Související memory:**
  - `feedback_pricing_rules.md` — pricing pravidla
  - `feedback_no_column_letters.md` — ext sheet podle přezdívky
  - `project_kredit_model_b.md` — kredit model
  - `project_roles.md` — admin/assistant/user role
  - `project_jidlog_uspany.md` — JídLOG už není default
