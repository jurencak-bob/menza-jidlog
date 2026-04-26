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
 * vytáhne název a město. Vrací objekt — hodnoty mohou být null, pokud
 * stránka má nestandardní strukturu. Caller (Restaurants_register_) má
 * fallback na slug z URL.
 *
 * Strategie (od nejspolehlivějšího):
 *   1. <meta name="description" content="Denní menu <NAZEV>,<MESTO>, ...">
 *   2. <title>[Restaurace ]<NAZEV> v <MESTO>, obědy, ... | Meníčka.cz</title>
 *   3. <div class='adresa'>Ulice, číslo, PSČ, Město</div> — jen pro město
 */
function Parser_extractRestaurantInfo_(html) {
  var nazev = null;
  var mesto = null;

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

  // 3. Fallback městu přes <div class='adresa'>
  if (!mesto) {
    var adresaMatch = html.match(/<div\s+class=['"][^'"]*adresa[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i);
    if (adresaMatch) {
      var addr = adresaMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      var parts = addr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (parts.length > 0) mesto = parts[parts.length - 1];
    }
  }

  return { nazev: nazev || null, mesto: mesto || null };
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
