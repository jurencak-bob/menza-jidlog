/**
 * Rss.gs — generuje RSS 2.0 feed pro každého uživatele jako veřejně sdílený soubor v Drive.
 *
 * Soubory leží v dedikované složce v Drive autora deploye. URL formátu
 * https://drive.google.com/uc?id=<id>&export=download je čitelná pro běžné RSS čtečky
 * (Feedly, Inoreader, NetNewsWire). ID souboru má 33 znaků → de facto secret token.
 */

var RSS_FOLDER_NAME = 'Menicka RSS Feeds';
var RSS_INACTIVE_DAYS = 14; // uživatelé bez návštěvy za N dní se nepublikují

function Rss_urlForId_(fileId) {
  return 'https://drive.google.com/uc?id=' + fileId + '&export=download';
}

function Rss_publishForUser_(user) {
  var ids = _parseIdList_(user.sledovane_restaurace);
  var dnes = _today_();
  var menuMap = Cache_getMenuMap_(dnes);
  var restMap = {};
  Restaurants_resolveForUser_(user.email).forEach(function(r) { restMap[r.id] = r; });

  var xml = _rssBuild_(user, ids, restMap, menuMap, dnes);
  var fileId = String(user.rss_drive_id || '').trim();
  var file = null;

  if (fileId) {
    try {
      file = DriveApp.getFileById(fileId);
      file.setContent(xml);
      // ujistíme se že share je veřejný (mohlo se ručně změnit)
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      file = null; // ID neplatné, vytvoříme nový
    }
  }

  if (!file) {
    var folder = _rssFolder_();
    var safeName = String(user.email).replace(/[^a-zA-Z0-9.-]/g, '_');
    file = folder.createFile('menicka-' + safeName + '.xml', xml, 'application/xml');
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fileId = file.getId();

    _setRowFields_(SHEETS.UZIVATELE, user._row, { rss_drive_id: fileId });
    user.rss_drive_id = fileId;
    Users_invalidate_(user.email);
  }

  return Rss_urlForId_(fileId);
}

function Rss_publishAll_() {
  var users = _readAll_(SHEETS.UZIVATELE);
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RSS_INACTIVE_DAYS);

  var published = 0;
  users.forEach(function(u) {
    if (!u.email) return;
    var lastVisit = u.posledni_pristup ? new Date(u.posledni_pristup) : null;
    if (lastVisit && lastVisit < cutoff) return;

    try {
      Rss_publishForUser_(u);
      published++;
    } catch (e) {
      Logger.log('RSS publish ' + u.email + ' selhal: ' + e.message);
    }
  });
  Logger.log('RSS publish: ' + published + ' uživatelů');
  return { published: published };
}

function _rssFolder_() {
  var folders = DriveApp.getFoldersByName(RSS_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(RSS_FOLDER_NAME);
}

function _rssBuild_(user, ids, restMap, menuMap, dnes) {
  var pubDate = new Date().toUTCString();
  var dnesPretty = _prettyDate_(dnes);

  var items = ids.map(function(id) {
    var rest = restMap[id] || {
      id: id,
      nazev: 'Restaurace ' + id,
      mesto: '',
      url: 'https://www.menicka.cz/restaurace/' + id
    };
    return _rssItem_(rest, menuMap[id], dnes, dnesPretty, pubDate);
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    '<title>Meníčka — ' + _xmlEscape_(user.email) + '</title>',
    '<link>https://www.menicka.cz/</link>',
    '<description>Denní menu sledovaných restaurací (' + _xmlEscape_(dnesPretty) + ')</description>',
    '<language>cs-cz</language>',
    '<lastBuildDate>' + pubDate + '</lastBuildDate>',
    '<pubDate>' + pubDate + '</pubDate>',
    '<ttl>360</ttl>',
    items.join('\n'),
    '</channel>',
    '</rss>',
    ''
  ].join('\n');
}

function _rssItem_(rest, menu, dnesIso, dnesPretty, pubDate) {
  var titleText = rest.nazev + ' — ' + dnesPretty;
  var description = _menuToHtml_(rest, menu);
  // CDATA escape pro vnořený ]]>
  var safeDesc = description.replace(/\]\]>/g, ']]]]><![CDATA[>');
  var guid = 'menicka-' + rest.id + '-' + dnesIso;

  return [
    '<item>',
    '<title>' + _xmlEscape_(titleText) + '</title>',
    '<link>' + _xmlEscape_(rest.url) + '</link>',
    '<description><![CDATA[' + safeDesc + ']]></description>',
    '<pubDate>' + pubDate + '</pubDate>',
    '<guid isPermaLink="false">' + guid + '</guid>',
    '</item>'
  ].join('\n');
}

function _menuToHtml_(rest, menu) {
  var head = '<p><strong>' + _xmlEscape_(rest.nazev) +
    (rest.mesto ? ' <span style="color:#888">(' + _xmlEscape_(rest.mesto) + ')</span>' : '') +
    '</strong></p>';

  if (!menu) return head + '<p><em>Menu zatím nestaženo.</em></p>';
  if (menu.chyba) return head + '<p><em>Chyba: ' + _xmlEscape_(menu.chyba) + '</em></p>';
  if (menu.info) return head + '<p><em>' + _xmlEscape_(menu.info) + '</em></p>';

  var parts = [head];
  function section(title, items) {
    if (!items || !items.length) return;
    parts.push('<h4 style="margin:8px 0 4px">' + _xmlEscape_(title) + '</h4>');
    parts.push('<ul style="margin:0;padding-left:20px">');
    items.forEach(function(it) {
      var prefix = it.cislo ? it.cislo + '. ' : '';
      var name = prefix + (it.mnozstvi ? it.mnozstvi + ' ' : '') + (it.nazev || '');
      var price = it.cena ? ' — <strong>' + _xmlEscape_(it.cena) + '</strong>' : '';
      var allergens = (it.alergeny && it.alergeny.length)
        ? ' <span style="color:#888;font-size:0.9em">[alergeny: ' + _xmlEscape_(it.alergeny.join(', ')) + ']</span>'
        : '';
      parts.push('<li>' + _xmlEscape_(name) + price + allergens + '</li>');
    });
    parts.push('</ul>');
  }
  section('Polévky', menu.polevky);
  section('Hlavní jídla', menu.hlavni_jidla);
  section('Pití', menu.piti);
  section('Dezerty', menu.dezerty);

  if (parts.length === 1) parts.push('<p><em>Pro dnešek nejsou žádné položky.</em></p>');
  return parts.join('');
}

function _prettyDate_(iso) {
  // 2026-04-25 → 25. 4. 2026
  if (!iso || iso.length < 10) return iso;
  var y = iso.substring(0, 4);
  var m = parseInt(iso.substring(5, 7), 10);
  var d = parseInt(iso.substring(8, 10), 10);
  return d + '. ' + m + '. ' + y;
}
