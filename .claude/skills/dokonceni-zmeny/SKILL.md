---
name: dokonceni-zmeny
description: Standardní dokončovací cyklus každé implementace v Jídlogicu (CR + opravy + testy + deploy). Použít automaticky po každé dokončené změně kódu, Bob to vyžaduje pokaždé.
---

# Dokončovací cyklus změny (Jídlogic)

Po každé dokončené implementaci proveď VŠECHNY kroky, bez připomínání:

## 1. Nezávislé code review

- Spusť agenta (general-purpose) s čerstvým kontextem: adversariální CR,
  přesný popis co je nové + kde, na co se zaměřit (GAS quoty, LockService,
  CacheService invalidace, souběhy, XSS, indexace v renderMenu, perf kritické
  cesty load/doGet). U peněz (Kredit, ceny, import) dvojnásobná přísnost.
- Nálezy s P0/P1 zapracovat vždy, P2/P3 dle úvahy; sporná tvrzení OVĚŘIT
  (CR agenti občas hlásí nepravdy), produktové otázky nechat Bobovi.

## 2. Testy

- **Unit (pure funkce):** node `vm` harness nad příslušným souborem,
  vzor `scratchpad/import_tests/run_unit.js`. Pozor na cross-realm Date.
- **FE/integrační:** Playwright nad skutečnou Obedy.html s mock
  `google.script.run` (vzor `script_python/ui_smoke.py`, mock harness
  v scratchpadu). Testovat nové chování VČETNĚ vypnutých stavů a fallbacků.
- **GAS testy:** nové `test_` funkce do `obedy.tests.js` (spouští
  runAllTests v GAS editoru).
- **Smoke:** `python3 script_python/ui_smoke.py -y` musí projít (exit 0)
  před každým deployem změn Obedy.html. Nikdy nededeployovat přes červený smoke.
- Syntaxe GAS souborů: `node -e "new Function(require('fs').readFileSync('<soubor>','utf8'))"`.

## 3. Novinky + verze (u KAŽDÉ opravy i funkce)

- **Vždy sám vyhodnotit dopad na uživatele a zeptat se Boba** (2026-10-19):
  viditelná změna chování/vzhledu/nová možnost → **navrhnout konkrétní text
  novinky** jazykem uživatele a počkat na schválení. Interní drobnost
  (optimalizace, refaktor, oprava bez pozorovatelného dopadu) → novinku
  nenavrhovat, jen v odpovědi říct, že ji za novinkovou nepovažuju, a proč.
- Záznam do `NOVINKY` v Obedy.html; jeden den = jeden záznam (nové body
  nahoru, verze záznamu = nejnovější z daného dne, žádné duplicitní datumy).
- Bump verze na 4 místech: `CLIENT_VERSION`, `.loading-version`,
  `.menu-version` (Obedy.html), `JIDLOGIC_VERSION` (obedy.js) + handshake
  `version:` literály. Všechny musí být shodné (smoke to kontroluje).

## 4. Deploy

- **GAS appka** (`obedy.js`, `Obedy.html`, `Menza.feed.js`):
  `./JidlogicDeploy.sh "vYYYYMMDD.NN — popis"` (deploy dělám já, ne Bob;
  bez něj Bob vidí starý kód). Soubory jsou gitignored, jde přes clasp.
- **PWA wrapper** (`index.html`, `luncher.html`, `sw.js`, manifesty, ikony
  na GitHub Pages): nasazuje se commitem + pushem do tohoto repa, ne clasp.
  - Před pushem: každá položka `CORE_SHELL` v `sw.js` musí existovat
    (`curl` na GitHub Pages = 200). Mrtvá položka kdysi zablokovala
    aktualizace všem uživatelům (2026-10-19, viz komentář u v33 v sw.js).
  - Při smazání/přejmenování souboru zkontrolovat `CORE_SHELL` i odkazy
    v `index.html` / `luncher.html` (manifest, ikony).
  - Bump `CACHE_NAME` jen při změně `CORE_SHELL`; navigace jsou od v33
    network-first, takže změna HTML se k lidem dostane i bez bumpu.
  - Test wrapperu: Playwright nad `index.html` s iframe přepnutým na
    `about:blank` (harness MUSÍ ležet ve složce projektu, jinak relativní
    cesty hlásí falešné 404), světlý i tmavý režim, omezený pohyb.
  - Po pushi počkat na propagaci (`curl` s `?nocache=` na nový obsah).
- Nemíchat s Meníčka (jidlogic.menicka/) - oddělené deploye i commity.
- Po nasazení: aktualizovat memory (+ zrcadlit na Drive, složka
  „Claude memory - jidlogic") a říct Bobovi, co se nasadilo a co má
  případně udělat ručně (triggery, Script Properties).
