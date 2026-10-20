#!/usr/bin/env python3
"""UI smoke test Jídlogicu (Obedy.html) v lokálním prohlížeči.

K ČEMU: Ostrá aplikace je za přihlášením Google, automaticky ji otestovat nejde.
  Skript proto vezme lokální Obedy.html, podvrhne backend (google.script.run)
  daty z dnešního menu z API menzy a v Playwrightu (systémový Chrome) projde
  hlavní obrazovky na mobilu i desktopu. Kontroluje chyby v konzoli, okno
  „Co je nového", řádek gramáž · zbývá N ks, volby v Nastavení, přetékání
  na úzkém telefonu a shodu verze na všech 4 místech. Ukládá screenshoty.

KDY: Před deployem změn frontendu (Obedy.html). Nic nemění v projektu ani
  v GAS, jen čte API menzy a zapisuje do script_python/ui_smoke_out/.
  Idempotentní, pouštět lze kdykoli. Exit kód 1 = některá kontrola selhala.

JAK:
  python3 script_python/ui_smoke.py                    # dnešní menu (o víkendu nejbližší dostupné)
  python3 script_python/ui_smoke.py --date 2026-10-13  # konkrétní den z API menzy
  python3 script_python/ui_smoke.py --headed           # viditelný prohlížeč
  python3 script_python/ui_smoke.py --help              # výpis parametrů a použití
  Závislosti: python playwright (pip install playwright), Google Chrome, node.
  --yes / -y (nebo běh z cronu) nenabízí zobrazení logu.
"""
import sys
from run_ui import Console, make_parser, bold_yellow, green, red

# argumenty parsovat brzy, aby --help fungoval i bez dalších závislostí
parser = make_parser("UI smoke test Obedy.html (Playwright + mock backend + menu z API menzy).")
parser.add_argument("--date", help="den menu YYYY-MM-DD (default dnes, jinak nejbližší dostupný)")
parser.add_argument("--headed", action="store_true", help="spustit viditelný prohlížeč")
args = parser.parse_args()

import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "ui_smoke_out")
API = "https://jidelnicek.utb.cz/webkredit/Api/Ordering"
CANTEEN = 3

con = Console(__file__, "Jídlogic: UI smoke test", False)
con.start()
os.makedirs(os.path.join(OUT, "shots"), exist_ok=True)

results = []  # (ok, název, detail)


def check(ok, name, detail=""):
    results.append((bool(ok), name, detail))
    line = ("OK    " if ok else "CHYBA ") + name + (f" ({detail})" if detail else "")
    con.out(green(line) if ok else red(line), log=not ok)


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "jidlogic-ui-smoke"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


# --- 1) menu z API menzy ---
con.out("Stahuji menu z API menzy ...")
ordering = fetch_json(f"{API}/Ordering?CanteenId={CANTEEN}")
dates = []
for d in ordering.get("dates", []):
    utc = datetime.fromisoformat(d["date"].replace("Z", "").split(".")[0]).replace(tzinfo=timezone.utc)
    local = (utc + timedelta(hours=2)).date()  # API dává půlnoc CET/CEST v UTC; +2 h spolehlivě trefí den
    dates.append((local.isoformat(), d["date"]))
if not dates:
    con.out(red("API menzy nevrátilo žádné dny."), log=True)
    sys.exit(1)
want = args.date or date.today().isoformat()
pick = next((x for x in dates if x[0] == want), None) or next((x for x in dates if x[0] >= want), dates[-1])
if pick[0] != want:
    con.out(bold_yellow(f"Menu pro {want} není, beru {pick[0]}"))
menu_url = f"{API}/Menu?Dates={urllib.parse.quote(pick[1])}&CanteenId={CANTEEN}"
menu_path = os.path.join(OUT, "menu.json")
with open(menu_path, "w", encoding="utf-8") as f:
    json.dump(fetch_json(menu_url), f, ensure_ascii=False)
con.out(f"Menu: {pick[0]}", log=True)

# --- 2) mock data: parsování přes skutečné parseItems_ z Menza.feed.js ---
# Část jídel dostane uměle nízké počty (1, 2, 4), ať jde otestovat hranice
# 5 ks a oranžová barva bez ohledu na to, kolik toho menza zrovna má.
NODE_JS = r"""
const fs=require('fs'),vm=require('vm');
const [feed,menuJson,today]=process.argv.slice(2);
const ctx={Logger:{log:()=>{}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(feed,'utf8'),ctx);
const d=JSON.parse(fs.readFileSync(menuJson,'utf8'));
const raw=[];for(const g of d.groups||[])for(const r of g.rows||[])if(r.item)raw.push(r.item);
ctx.__raw=raw;
const items=vm.runInContext('parseItems_(__raw)',ctx);
const key=(k,n)=>vm.runInContext('vyprodanoKlic_('+JSON.stringify(k)+','+JSON.stringify(n)+')',ctx);
const low=[1,2,4];let li=0;
const counts={},keys=[];
for(const it of items){ if(typeof it.pocet!=='number')continue;
  let n=it.pocet; if(n>0&&li<low.length)n=low[li++];
  counts[key(it.kategorie,it.name)]=n; if(n===0)keys.push(key(it.kategorie,it.name)); }
const strip=it=>({kategorie:it.kategorie,cislo:it.cislo,name:it.name,cena_stu:it.cena_stu,cena_plna:it.cena_plna,gramaz:it.gramaz});
const extras=[
 {kategorie:'bez oběda',cislo:'__BEZ_OBEDA__',name:'Tento den oběd mimo menzu.',cena_stu:'0',cena_plna:'0',tooltip:'Nepovinná volba'}];
const vlastni={kategorie:'oběd ostatní',cislo:'__OSTATNI_VLASTNI__',name:'Salát, zmrzka, krabička…',cena_stu:'',cena_plna:'',tooltip:'Vlastní položka'};
let its=items.map(strip);let lo=-1;its.forEach((x,i)=>{if(x.kategorie==='oběd ostatní')lo=i});its.splice(lo+1,0,{...vlastni});
const DATA={days:[{date:today,dayName:'Út',items:its.concat(extras),fetchedAt:'10:00'}],todayStr:today,menzaUrl:'',
 vyprodano:keys.sort(),pocty:counts,
 user:{email:'test@blogic.cz',nick:'Test',registered:true,avatarUrl:'',introSeen:true,guestBannerHidden:true,favorites:'',favoritesEnabled:false,privacyMode:'detail',role:'user',lastAdminAction:null},
 permissions:{},kodVerze:'X',jidlogicExecUrl:'',cardStats:{},selections:{},dailySums:{},
 creditHistory:[{date:'01.10.2026',dateIso:'2026-10-01',type:'dobití',amount:500,note:''}],
 closures:[],closureRanges:[],nextWorkingDay:null,config:{CARD_LIMIT:6,EDIT_DAYS_BACK:5},
 dashboardUrl:'',jidlogicUrl:'',pwaUrl:'',obedyUrl:'',menickaUrl:''};
process.stdout.write(JSON.stringify(DATA));
"""
con.out("Skládám mock data ...")
proc = subprocess.run(["node", "-", os.path.join(ROOT, "Menza.feed.js"), menu_path, pick[0]],
                      input=NODE_JS, capture_output=True, text=True)
if proc.returncode != 0:
    con.out(red("node selhal: " + proc.stderr.strip()[:500]), log=True)
    sys.exit(1)
DATA = json.loads(proc.stdout)
pocty = DATA["pocty"]
con.out(f"Jídel: {len(DATA['days'][0]['items'])}, s počtem kusů: {len(pocty)}, vyprodáno: {len(DATA['vyprodano'])}", log=True)

# --- 3) verze na všech 4 místech + NOVINKY ---
html = open(os.path.join(ROOT, "Obedy.html"), encoding="utf-8").read()
js_be = open(os.path.join(ROOT, "obedy.js"), encoding="utf-8").read()
versions = {
    "CLIENT_VERSION": re.search(r"var CLIENT_VERSION = '([^']+)'", html),
    "loading-version": re.search(r'<div class="loading-version"[^>]*>\s*(v\d{8}\.\d+)\s*</div>', html),
    "menu-version": re.search(r'<div class="menu-version">\s*(v\d{8}\.\d+)\s*</div>', html),
    "JIDLOGIC_VERSION": re.search(r"var JIDLOGIC_VERSION = '([^']+)'", js_be),
}
versions = {k: (m.group(1).strip() if m else None) for k, m in versions.items()}
check(len(set(versions.values())) == 1 and None not in versions.values(),
      "verze shodná na 4 místech", ", ".join(f"{k}={v}" for k, v in versions.items()))
nov = re.search(r"var NOVINKY = \[\s*\{ verze: '([^']+)'", html)
cv = versions["CLIENT_VERSION"] or ""
check(nov and nov.group(1) <= cv, "NOVINKY: nejnovější záznam není novější než CLIENT_VERSION",
      f"NOVINKY[0]={nov.group(1) if nov else '?'}")

# --- 4) harness HTML ---
mock = """<script>
window.__calls = [];
window.__DATA = %s;
window.__mocks = {
  obedyNactiData: function(){ return JSON.parse(JSON.stringify(window.__DATA)); },
  obedyVerzeStavu: function(){ return 'v0'; },
  obedyVerzeKodu: function(){ return %s; },
  obedyVyprodanoDnes: function(){ return {date: window.__DATA.todayStr, keys: window.__DATA.vyprodano, counts: window.__DATA.pocty}; },
  obedyNactiKreditProFrontend: function(){ return window.__DATA.creditHistory; },
  obedyStavFronty: function(){ return {pending:0,total:0,failed:false}; }
};
function mkRunner(ok, fail){
  return new Proxy({}, { get: function(_, name){
    if (name === 'withSuccessHandler') return function(f){ return mkRunner(f, fail); };
    if (name === 'withFailureHandler') return function(f){ return mkRunner(ok, f); };
    if (name === 'withUserObject') return function(){ return mkRunner(ok, fail); };
    return function(){ var a = [].slice.call(arguments); window.__calls.push(name);
      setTimeout(function(){ var m = window.__mocks[name]; ok && ok(m ? m.apply(null, a) : null); }, 30); };
  }});
}
window.google = { script: { run: mkRunner(null, null), host: { close: function(){} } } };
</script>""" % (json.dumps(DATA, ensure_ascii=False), json.dumps(cv))
harness = os.path.join(OUT, "index.html")
with open(harness, "w", encoding="utf-8") as f:
    f.write(html.replace("<?!= include('Help') ?>", "").replace("<head>", "<head>" + mock, 1))

# --- 5) průchod v prohlížeči ---
from playwright.sync_api import sync_playwright

def expected_meta(mode, limit):
    """Kolik řádků s počtem kusů má být vidět (vyprodáno se ukazuje vždy)."""
    return sum(1 for n in pocty.values() if n == 0 or mode == "vzdy" or n <= limit)


def shot(page, name, full=False):
    page.screenshot(path=os.path.join(OUT, "shots", name + ".png"), full_page=full)


con.out("Spouštím prohlížeč ...")
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=not args.headed)
    url = "file://" + harness

    def new_page(w, h, mobile=True):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2,
                            is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page()
        pg.on("console", lambda m: errs.append(f"{w}px console.{m.type}: {m.text}") if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(f"{w}px pageerror: {e}"))
        pg.goto(url)
        pg.wait_for_timeout(2500)
        return pg

    pg = new_page(390, 844)
    check(pg.evaluate("document.getElementById('novinky-overlay').classList.contains('open')"),
          "Co je nového: okno se ukáže po prvním načtení")
    shot(pg, "01_mobil_novinky")
    pg.evaluate("closeNovinkyModal()")
    pg.reload(); pg.wait_for_timeout(2500)
    check(not pg.evaluate("document.getElementById('novinky-overlay').classList.contains('open')"),
          "Co je nového: po obnovení se znovu neukáže")

    rows = pg.evaluate("[...document.querySelectorAll('.food-item')].map(e=>({so:e.classList.contains('sold-out'),"
                       "meta:(e.querySelector('.food-meta')||{}).textContent||'',"
                       "gram:(e.querySelector('.food-name .food-meta-ai')||{}).textContent||''}))")
    sold_rows = [r for r in rows if r["so"]]
    check(len(sold_rows) == len(DATA["vyprodano"]), "vyprodaná jídla přeškrtnutá",
          f"{len(sold_rows)} z {len(DATA['vyprodano'])}")
    check(all("vyprodáno" in r["meta"] for r in sold_rows), "u vyprodaných je slovo „vyprodáno“")
    n_cnt = sum(1 for r in rows if re.search(r"zbýv|vyprodáno", r["meta"]))
    check(n_cnt == expected_meta("limit", 5), "kusy jen do 5 ks (výchozí)", f"vidět {n_cnt}, čekáno {expected_meta('limit', 5)}")
    with_g = sum(1 for it in DATA["days"][0]["items"] if it.get("gramaz"))
    n_g = sum(1 for r in rows if re.search(r"\d+(,\d+)? (g|kg|ml|l|dcl)\b", r["gram"]))
    # Od v20261018.22 je výchozí řádkový režim: gramáž (i AI hodnoty) drobně
    # pod názvem jídla, pod pill jen při volbě „pod číslem jídla" / jediné hodnotě.
    check(n_g == with_g, "gramáž pod názvem u všech jídel, která ji mají (řádkový režim)", f"{n_g} z {with_g}")
    shot(pg, "02_mobil_menu", full=True)

    if sold_rows:
        pg.locator(".food-item.sold-out .food-meta").first.click(); pg.wait_for_timeout(300)
        check(pg.evaluate("document.querySelector('.food-item.sold-out').classList.contains('selected')"),
              "vyprodané jídlo jde vybrat (ťuk na řádek s info)")

    pg.evaluate("toggleMenu()"); pg.wait_for_timeout(400)
    pg.evaluate("openSettingsView()"); pg.wait_for_timeout(500)
    shot(pg, "03_mobil_nastaveni")
    pg.select_option("#pocet-mode", "vzdy"); pg.wait_for_timeout(300)
    n_all = pg.evaluate("[...document.querySelectorAll('.food-meta')].filter(e=>/zbýv|vyprodáno/.test(e.textContent)).length")
    check(n_all == expected_meta("vzdy", 5), "volba „vždy“ ukáže všechny počty", f"{n_all} z {expected_meta('vzdy', 5)}")
    pg.evaluate("toggleFoodMeta('gramaz'); toggleFoodMeta('pocet')"); pg.wait_for_timeout(300)
    check(pg.evaluate("document.querySelectorAll('.food-meta, .food-num-gram, .food-meta-ai').length") == 0,
          "vypnutí obou voleb skryje gramáž i kusy")
    pg.evaluate("toggleFoodMeta('gramaz'); toggleFoodMeta('pocet'); setPocetMode('limit')")
    pg.evaluate("toggleMenu()"); pg.wait_for_timeout(300)
    pg.evaluate("toggleTheme()"); pg.wait_for_timeout(300)
    shot(pg, "04_mobil_dark", full=True)
    pg.evaluate("toggleTheme()")
    pg.locator(".info-btn").first.click(); pg.wait_for_timeout(300)
    shot(pg, "05_mobil_tooltip")

    # krabička už není samostatná položka; vlastní cena umí vzorec „=89+10" (v20261015.01)
    kp = new_page(1280, 900, mobile=False)
    kp.evaluate("closeNovinkyModal()")
    check(kp.evaluate("!DATA.days[selectedIndex].items.some(x=>x.cislo===KRABICKA_CISLO)"),
          "krabička se nenabízí jako samostatná položka")
    inp = kp.locator(".food-custom-price").first
    inp.click(); inp.fill("=89+10"); kp.locator(".date-long").first.click(); kp.wait_for_timeout(200)
    st = kp.evaluate("""(()=>{const e=document.querySelector('.food-custom-price'); const b=document.getElementById('btn-confirm');
        const i=DATA.days[selectedIndex].items.findIndex(x=>x.cislo===VLASTNI_CISLO);
        return [e.value, customPrices[i], customFormulas[i], b.disabled];})()""")
    check(st[0] == "99" and st[1] == 99 and st[2] == "=89+10", "vzorec =89+10: po opuštění pole ukáže 99", str(st))
    check(not st[3], "vzorec: tlačítko uložit aktivní", str(st))
    inp.click(); kp.wait_for_timeout(100)
    check(inp.input_value() == "=89+10", "vzorec: při editaci se ukáže zpět", inp.input_value())
    inp.fill("=89+"); kp.wait_for_timeout(100)
    check(kp.evaluate("document.querySelector('.food-custom-price').classList.contains('invalid')"),
          "neplatný vzorec: pole červeně", inp.input_value())
    inp.fill(""); inp.type("4a5,b"); kp.wait_for_timeout(100)
    check(inp.input_value() == "45", "pole bere jen znaky z kalkulačky (4a5,b → 45)", inp.input_value())
    check(not kp.evaluate("document.getElementById('calc-pad')?.classList.contains('open')||false"),
          "počítač: bez „=“ se miniklávesnice neukáže")
    inp.type("+10"); kp.wait_for_timeout(100)
    check(inp.input_value() == "=45+10", "operátor bez „=“ doplní „=“ (45+10 → =45+10)", inp.input_value())
    check(kp.evaluate("document.getElementById('calc-pad').classList.contains('open')"),
          "počítač: po „=“ vyskočí miniklávesnice")
    inp.press("Enter"); kp.wait_for_timeout(150)
    check(inp.input_value() == "55" and not kp.evaluate("document.getElementById('calc-pad').classList.contains('open')"),
          "Enter: zavře klávesnici a ukáže výsledek 55", inp.input_value())
    kp.context.close()

    # neuložený výběr: připomínka, zachování při přepnutí dne a obnově dat (v20261015.04)
    # Výška 600 px (ne 900): lišta se ukazuje jen když je btn-confirm mimo viewport.
    # O víkendu má menu z API jen ~2 položky, stránka je krátká a při 900 px bylo
    # tlačítko vidět → lišta se správně neukázala a test neměl co testovat (pád
    # 2026-10-18). Při 600 px je tlačítko pod ohybem i s víkendovým menu.
    up = new_page(1280, 600, mobile=False)
    up.evaluate("closeNovinkyModal()")
    check(up.evaluate("Object.keys(drafts).length===0 && !document.getElementById('unsaved-bar')?.classList.contains('show')"),
          "po startu žádné falešné „neuloženo“")
    up.evaluate("""(()=>{const d0=DATA.days[0], p=d0.date.split('-'), y=new Date(+p[0],+p[1]-1,+p[2]-1);
        const iso=y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');
        DATA.days.push(Object.assign({}, d0, {date: iso})); computeSavedFingerprints(); buildOpenIndices(); renderDatepicker();})()""")
    vi = up.locator(".food-custom-price").first
    vi.click(); vi.type("=5+5"); vi.press("Enter"); up.wait_for_timeout(150)
    up.evaluate("window.scrollTo(0,0)"); up.wait_for_timeout(400)
    bar = up.evaluate("[document.getElementById('unsaved-bar').classList.contains('show'), document.querySelector('#unsaved-bar .ub-text').textContent]")
    check(bar[0] and "není uložený" in bar[1], "rozepsáno a tlačítko mimo obrazovku: lišta „Výběr není uložený“", bar[1])
    shot(up, "09_neulozeno_lista")
    st = up.evaluate("""(()=>{selectDay(1); const t=document.getElementById('toast-msg').textContent;
        const b=document.querySelector('#unsaved-bar .ub-text').textContent; return [t, b, Object.keys(drafts).length];})()""")
    check("zůstal neuložený" in st[0], "přepnutí dne: upozornění, že výběr zůstal neuložený", st[0])
    check("Neuložený výběr i na" in st[1], "lišta ukazuje den s neuloženým výběrem", st[1])
    st = up.evaluate("""(()=>{selectDay(0); const i=DATA.days[0].items.findIndex(x=>x.cislo===VLASTNI_CISLO);
        return [customPrices[i], customFormulas[i], document.getElementById('btn-confirm').disabled];})()""")
    check(st[0] == 10 and st[1] == "=5+5" and not st[2], "návrat na den: rozepsaný výběr zůstal (10 Kč, =5+5)", str(st))
    st = up.evaluate("""(()=>{selectDay(selectedIndex); const i=DATA.days[0].items.findIndex(x=>x.cislo===VLASTNI_CISLO);
        return [customPrices[i], customFormulas[i]];})()""")
    check(st[0] == 10 and st[1] == "=5+5", "obnova dat na pozadí: rozepsaný výběr se nesmaže", str(st))
    up.evaluate("window.scrollTo(0,0)"); up.wait_for_timeout(300)
    up.locator("#unsaved-bar button").click(); up.wait_for_timeout(600)
    st = up.evaluate("[Object.keys(drafts).length, document.getElementById('unsaved-bar').classList.contains('show'), document.getElementById('btn-confirm').textContent.trim()]")
    check(st[0] == 0 and not st[1] and "zaevidován" in st[2], "Potvrdit z lišty uloží a lišta zmizí", str(st))
    up.context.close()

    # dotyk: systémová klávesnice nahrazená miniklávesnicí, psaní jen přes ni (v20261015.02)
    tp = new_page(390, 844, mobile=True)
    tp.evaluate("closeNovinkyModal()")
    tin = tp.locator(".food-custom-price").first
    tin.tap(); tp.wait_for_timeout(250)
    check(tp.evaluate("document.getElementById('calc-pad').classList.contains('open')") and tin.get_attribute("inputmode") == "none",
          "mobil: klepnutí do pole otevře miniklávesnici místo systémové")
    for k in ["=", "8", "9", "+", "1", "0", "back", "0"]:
        tp.locator(f'#calc-pad .calc-key[data-k="{k}"]').tap(); tp.wait_for_timeout(40)
    check(tin.input_value() == "=89+10", "mobil: =89+10 naťukané na miniklávesnici (vč. mazání)", tin.input_value())
    tp.locator('#calc-pad .calc-key[data-k="enter"]').tap(); tp.wait_for_timeout(200)
    check(tin.input_value() == "99", "mobil: Enter → 99", tin.input_value())
    shot(tp, "08_mobil_kalkulacka")
    tp.context.close()

    for w in (320, 390):
        sp = new_page(w, 760)
        sp.evaluate("closeNovinkyModal(); toggleMenu()"); sp.wait_for_timeout(300)
        sp.evaluate("openSettingsView()"); sp.wait_for_timeout(500)
        r = sp.evaluate("(()=>{const p=document.querySelector('.panel.settings').getBoundingClientRect();"
                        "const w=document.getElementById('pocet-limit-wrap').getBoundingClientRect();"
                        "return [Math.round(p.right), Math.round(w.right)]})()")
        check(r[1] <= r[0], f"Nastavení {w}px: řádek s počtem kusů nepřetéká", f"panel {r[0]}, prvek {r[1]}")
        shot(sp, f"06_nastaveni_{w}")
        sp.context.close()

    dp = new_page(1280, 900, mobile=False)
    dp.evaluate("closeNovinkyModal()"); dp.wait_for_timeout(200)
    shot(dp, "07_desktop_menu", full=True)
    b.close()

check(not errs, "žádné chyby v konzoli", "; ".join(errs)[:400])

# --- 6) souhrn ---
fail = [r for r in results if not r[0]]
souhrn = f"Kontrol: {len(results)}, selhalo: {len(fail)}"
con.out(red(souhrn) if fail else green(souhrn), log=True)
con.out(f"Screenshoty: {os.path.join(OUT, 'shots')}")
con.offer_log()
sys.exit(1 if fail else 0)
