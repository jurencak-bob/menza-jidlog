/**
 * menicka_Debug.gs — pomocné funkce pro ladění parseru a inspekci HTML.
 * Spouští se ručně z editoru. Hodí se, když Parser_parseMenu_ vrátí prázdno
 * a chceš vědět, jestli problém je ve fetchi, encoding-u, nebo regexu.
 */

/**
 * Stáhne HTML pro ID z `debug_id` v `⚙️ Konfigurace` (default: první ID
 * z `default_restaurace`) a zaloguje syrové HTML + parsed JSON.
 */
function debugFetch() {
  var config = Config_get_();
  var id = String(config.debug_id || '').trim() ||
           _parseIdList_(config.default_restaurace)[0];
  if (!id) {
    Logger.log('Nastav v ⚙️ Konfigurace klíč "debug_id" nebo doplň "default_restaurace".');
    return;
  }
  return _debugDump_(id);
}

function _debugDump_(id) {
  Logger.log('=== Fetch ID ' + id + ' ===');
  var html;
  try {
    html = Scraper_fetchHtml_(id);
  } catch (e) {
    Logger.log('FETCH FAILED: ' + e.message);
    return null;
  }

  Logger.log('HTML délka: ' + html.length + ' znaků');

  // Vytáhni text bez HTML tagů (stejně jako parser) a uložím prvních ~2000 znaků
  var text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                 .replace(/<[^>]+>/g, '\n')
                 .replace(/\n+/g, '\n')
                 .trim();
  Logger.log('--- Plain text (prvních 2000 znaků) ---');
  Logger.log(text.substring(0, 2000));

  // Hledej pozici "dnes" — to je signál, jestli stránka má menu pro dnešek
  var dnes = Utilities.formatDate(new Date(), TZ, 'd.M.');
  var year = new Date().getFullYear();
  var idx = text.indexOf(dnes + year);
  if (idx === -1) idx = text.indexOf(dnes + (year - 1));
  if (idx === -1) idx = text.indexOf(dnes);
  Logger.log('--- Pozice dnešního data "' + dnes + '" v textu: ' + idx + ' ---');

  Logger.log('--- Parser výstup ---');
  var menu = Parser_parseMenu_(html, id);
  Logger.log(JSON.stringify(menu, null, 2));

  return menu;
}
