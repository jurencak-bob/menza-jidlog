/**
 * Parser.gs — HTML z menicka.cz iframe → strukturovaný JSON menu.
 *
 * Iframe struktura (zjednodušeně):
 *   <h2>Pondělí 20.4.2026</h2>
 *   <table class='menu'>
 *     <tr class='soup [photomenu]'><td colspan='2' class='food'>0, 33l Polévka <em title='Lepek'>1</em><em title='Mléko'>7</em></td><td class='prize'>39 Kč</td></tr>
 *     <tr class='main [photomenu]'><td class='no'>1.</td><td class='food'>300g Hlavní jídlo <em title='Lepek'>1</em></td><td class='prize'>159 Kč</td></tr>
 *     ...
 *   </table>
 *   <h2>Sobota 25.4.2026 <span class='dnes'>« dnes</span></h2>
 *   <table class='menu'>...</table>
 *
 * Sekci pro dnešek poznáme podle `<span class='dnes'>` u h2 nadpisu.
 */

var DNES_RE = /<span\s+class=['"]dnes['"]/i;
var H2_RE = /<h2[^>]*>/gi;
// Řádky bez ceny obsahující tento text jsou informativní (zavřeno, dovolená,
// menu nezadáno apod.), ne reálné jídlo.
var INFO_RE = /^(pro tento den nebylo|tento den (?:je\s+)?zavř|restaurace (?:má\s+)?(?:tento\s+den\s+)?zavř|restaurace má tento den|dnes je zavř|dovolen|sváteč|nedělní pauza)/i;

function Parser_parseMenu_(html, restauraceId) {
  var menu = {
    restaurace_id: String(restauraceId),
    datum: _today_(),
    polevky: [],
    hlavni_jidla: [],
    piti: [],
    dezerty: []
  };

  try {
    var section = _todaySection_(html);
    if (!section) return menu;

    var tableMatch = section.match(/<table[^>]+class=['"]menu['"][^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) return menu;
    var tableHtml = tableMatch[1];

    var trRe = /<tr[^>]+class=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/tr>/gi;
    var trMatch;
    while ((trMatch = trRe.exec(tableHtml)) !== null) {
      var classes = trMatch[1];
      var rowHtml = trMatch[2];

      var item = _parseRow_(rowHtml);
      if (!item) continue;

      // Info řádky (zavřeno, menu nezadáno, dovolená) — bez ceny + typický text
      if (!item.cena && item.nazev && INFO_RE.test(item.nazev)) {
        if (!menu.info) menu.info = item.nazev;
        continue;
      }

      if (/\bsoup\b/.test(classes)) {
        menu.polevky.push(item);
      } else if (/\bmain\b/.test(classes)) {
        menu.hlavni_jidla.push(item);
      }
      // <tr class='info'> a podobné se vynechá
    }
  } catch (e) {
    Logger.log('Parse error pro ' + restauraceId + ': ' + e.message);
    menu.chyba = e.message;
  }

  return menu;
}

/**
 * Vyřízne ze stránky kus HTML mezi h2 dneška (h2 obsahující <span class='dnes'>)
 * a dalším h2 nebo do konce body.
 */
function _todaySection_(html) {
  var dnesIdx = html.search(DNES_RE);
  if (dnesIdx === -1) return null;

  // Najdi nejbližší <h2 před pozicí "dnes" markeru
  var startIdx = html.lastIndexOf('<h2', dnesIdx);
  if (startIdx === -1) return null;

  // Konec sekce = další <h2 po startu (nebo konec souboru)
  var nextH2Idx = html.indexOf('<h2', startIdx + 3);
  var endIdx = nextH2Idx === -1 ? html.length : nextH2Idx;

  return html.substring(startIdx, endIdx);
}

function _parseRow_(rowHtml) {
  var foodMatch = rowHtml.match(/<td[^>]*class=['"][^'"]*food[^'"]*['"][^>]*>([\s\S]*?)<\/td>/i);
  if (!foodMatch) return null;
  var foodHtml = foodMatch[1];

  var priceMatch = rowHtml.match(/<td[^>]*class=['"][^'"]*prize[^'"]*['"][^>]*>([\s\S]*?)<\/td>/i);
  var priceText = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // Číslo jídla z <td class='no'>1.</td> (typické pro hlavní jídla)
  var noMatch = rowHtml.match(/<td[^>]*class=['"][^'"]*\bno\b[^'"]*['"][^>]*>([\s\S]*?)<\/td>/i);
  var cislo = null;
  if (noMatch) {
    var noText = noMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    var n = noText.match(/^(\d+)\.?$/);
    if (n) cislo = n[1];
  }

  // Alergeny: <em title='Vejce'>3</em>
  var alergeny = [];
  var emRe = /<em[^>]*>(\d+)<\/em>/gi;
  var emMatch;
  while ((emMatch = emRe.exec(foodHtml)) !== null) {
    alergeny.push(emMatch[1]);
  }

  // Vyčisti food text — nejprve odstranit <em>...</em> i s obsahem
  // (alergeny už máme zvlášť), pak teprve strip ostatních tagů a normalizace.
  var foodText = foodHtml
    .replace(/<em[^>]*>[\s\S]*?<\/em>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Některé restaurace dávají alergeny jako prostý text na konec názvu
  // ("Italská minestrone 1, 9" / "Pizza 4 sezóny 1, 7"). Strip + případně
  // doplnit do alergeny, pokud parser z <em> nic nevytáhl. Validace 1–14
  // (EU číslování alergenů) brání falešně pozitivnímu shodu na koncové číslo
  // v samotném názvu.
  var trailingAllergens = foodText.match(/\s+(\d{1,2}(?:\s*,\s*\d{1,2})*)\s*$/);
  if (trailingAllergens) {
    var nums = trailingAllergens[1].split(/\s*,\s*/).map(function(s) { return s.trim(); }).filter(Boolean);
    var allValid = nums.length > 0 && nums.every(function(n) {
      var v = parseInt(n, 10);
      return v >= 1 && v <= 14;
    });
    if (allValid) {
      foodText = foodText.substring(0, foodText.length - trailingAllergens[0].length).trim();
      if (alergeny.length === 0) alergeny = nums;
    }
  }

  // Detekce množství:
  //   - "0, 33l", "0,33l", "0.33l" → polévka v litrech
  //   - "300g" → hlavní jídlo v gramech
  var mnozstvi = null;
  var ml = foodText.match(/^(\d+[,.]?\s?\d*)\s*l\b\s+/i);
  if (ml) {
    mnozstvi = ml[1].replace(/[,\s]+/g, '.').replace(/\.+/g, '.') + 'l';
    foodText = foodText.substring(ml[0].length).trim();
  } else {
    var mg = foodText.match(/^(\d+)\s*g\b\s+/i);
    if (mg) {
      mnozstvi = mg[1] + 'g';
      foodText = foodText.substring(mg[0].length).trim();
    }
  }

  var cena = priceText.replace(/\s+/g, ' ').trim();
  if (!cena && !foodText) return null;

  return {
    cislo: cislo,
    nazev: foodText,
    cena: cena,
    mnozstvi: mnozstvi,
    alergeny: alergeny.length ? alergeny : null
  };
}

/**
 * Z profile stránky restaurace (https://www.menicka.cz/<id>-<slug>.html)
 * vytáhne název, město a plnou adresu. Vrací objekt — hodnoty mohou být null,
 * pokud stránka má nestandardní strukturu. Caller (Restaurants_register_) má
 * fallback na slug z URL.
 *
 * Strategie:
 *   - Název / Město: meta description → title → fallback z adresy
 *   - Adresa: vždy parsuje <div class='adresa'> (plný řetězec — ulice + PSČ +
 *     město), bere se i jako fallback městu (poslední comma-část)
 *
 * Plná adresa se ukládá do listu Restaurace a později se posílá do Nominatim
 * pro přesnější geocoding (úroveň ulice místo city centra).
 */
function Parser_extractRestaurantInfo_(html) {
  var nazev = null;
  var mesto = null;
  var adresa = null;

  // 1. Meta description (univerzální pattern napříč profile stránkami)
  var descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']Denní menu\s+(.+?),\s*([^,]+?),/i);
  if (descMatch) {
    nazev = _decodeHtml_(descMatch[1]).trim().replace(/^Restaurace\s+/i, '');
    mesto = _decodeHtml_(descMatch[2]).trim();
  }

  // 2. Title fallback pro nazev / mesto
  if (!nazev || !mesto) {
    var titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      var t = _decodeHtml_(titleMatch[1]).trim();
      // Akceptuje obě varianty: "Restaurace XXX v Yyyy, ..." i "XXX v Yyyy, ..."
      var titleParts = t.match(/^(?:Restaurace\s+)?(.+?)\s+v\s+([^,|]+)/i);
      if (titleParts) {
        if (!nazev) nazev = titleParts[1].trim();
        // Město v title je často v lokativu ("Zlíně"), takže pokud z desc už
        // máme nominativ, raději ho zachovat.
        if (!mesto) mesto = titleParts[2].trim();
      }
    }
  }

  // 3. <div class='adresa'> — plná adresa pro geocoding + fallback městu
  var adresaMatch = html.match(/<div\s+class=['"][^'"]*adresa[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i);
  if (adresaMatch) {
    var addr = adresaMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (addr) {
      adresa = _normalizeAddress_(_decodeHtml_(addr));
      if (!mesto) {
        var parts = adresa.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (parts.length > 0) mesto = parts[parts.length - 1];
      }
    }
  }

  return { nazev: nazev || null, mesto: mesto || null, adresa: adresa || null };
}

/**
 * Normalizuje adresu z menicka.cz formátu:
 *   "Bartošova, 4393, 76001, Zlín"  →  "Bartošova 4393, 76001, Zlín"
 *   "Lešetín I, 676, 760 01, Zlín"  →  "Lešetín I 676, 760 01, Zlín"
 *   "V Kruhu , 2, 160 0, Praha 6"   →  "V Kruhu 2, 160 0, Praha 6"
 *
 * Spojí první dvě čárkou oddělené části mezerou, pokud druhá je číslo popisné
 * (čistě digit, případně se slashem nebo písmenem). Říms. číslice ve street
 * jsou zachovány (jsou to písmena, neobjedou se na druhé pozici samy).
 *
 * Geocoding pak dostane standardnější formát (Nominatim/Photon mu rozumí líp).
 */
function _normalizeAddress_(addr) {
  if (!addr) return addr;
  var parts = String(addr).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  // Pattern pro číslo popisné: digits, volitelně /digits nebo -digits, volitelně 1 písmeno
  // Pokrývá: "4393", "220/2", "23a", "12-5", "1234A".
  if (parts.length >= 2 && /^\d+([\/\-]\d+)?[a-z]?$/i.test(parts[1])) {
    parts = [parts[0] + ' ' + parts[1]].concat(parts.slice(2));
  }
  return parts.join(', ');
}

/**
 * Parser pro tiskovou verzi profilu (`tisk-profil.php?restaurace=<id>`).
 *
 * HTML je velmi jednoduché:
 *   <h1>Bowling Pizza Komín</h1>
 *   <img class='logo_restaurace' src='foto/logo/5757-jl_strana1.jpg' ... />
 *
 * Vrací `{ nazev, foto_url }` s absolutní URL obrázku. Pokud něco chybí,
 * vrací null v daném poli (caller dělá merge s ostatními zdroji).
 */
function Parser_extractPrintProfile_(html) {
  var nazev = null;
  var fotoUrl = null;

  var h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    var t = _decodeHtml_(h1[1].replace(/<[^>]+>/g, '')).trim();
    if (t) nazev = t.replace(/^Restaurace\s+/i, '');
  }

  // <img class='logo_restaurace' src='...'> — class a src můžou být v libovolném pořadí
  var imgTag = html.match(/<img[^>]*class=['"][^'"]*logo_restaurace[^'"]*['"][^>]*>/i);
  if (imgTag) {
    var srcMatch = imgTag[0].match(/src=['"]([^'"]+)['"]/i);
    if (srcMatch) {
      var src = srcMatch[1].trim();
      if (src) {
        if (/^https?:\/\//i.test(src)) {
          fotoUrl = src;
        } else {
          fotoUrl = 'https://www.menicka.cz/' + src.replace(/^\/+/, '');
        }
      }
    }
  }

  return { nazev: nazev, foto_url: fotoUrl };
}

function _decodeHtml_(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
