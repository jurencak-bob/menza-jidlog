/**
 * Config.gs — globální konfigurace v listu "⚙️ Konfigurace"
 */

var CONFIG_DEFAULTS = {
  default_restaurace: '',
  cache_ttl_hodin: 12,
  // CSV s hodinami pro auto-refresh (Europe/Prague). Při změně spusť setupTriggers().
  trigger_casy: '9,10,11,12,13,14',
  // Hodina, kdy se denně vyčistí cache jídelníčků (po obědě). Po této době
  // uživatelé vidí banner „Čas oběda už je za námi". Při změně spusť setupTriggers().
  cache_konec_hodina: 17,
  // Legacy klíče (zachované kvůli starým instalacím — `trigger_casy` má prioritu).
  trigger_cas_1: 9,
  trigger_cas_2: 11
};

var _CONFIG_CACHE_KEY = 'config_v1';
var _CONFIG_CACHE_TTL = 600;

function Config_get_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(_CONFIG_CACHE_KEY);
  if (hit) return JSON.parse(hit);

  var rows = _readAll_(SHEETS.KONFIGURACE);
  var config = {};
  Object.keys(CONFIG_DEFAULTS).forEach(function(k) { config[k] = CONFIG_DEFAULTS[k]; });
  rows.forEach(function(r) {
    var key = r['klíč'];
    if (key) config[key] = r['hodnota'];
  });

  cache.put(_CONFIG_CACHE_KEY, JSON.stringify(config), _CONFIG_CACHE_TTL);
  return config;
}

function Config_invalidate_() {
  CacheService.getScriptCache().remove(_CONFIG_CACHE_KEY);
}

function Config_defaultRestauraceIds_() {
  return _parseIdList_(Config_get_().default_restaurace);
}

function Config_seedDefaults_() {
  var existing = {};
  _readAll_(SHEETS.KONFIGURACE).forEach(function(r) {
    if (r['klíč']) existing[r['klíč']] = true;
  });

  var sheet = _sheet_(SHEETS.KONFIGURACE);
  Object.keys(CONFIG_DEFAULTS).forEach(function(k) {
    if (!existing[k]) sheet.appendRow([k, CONFIG_DEFAULTS[k]]);
  });

  Config_invalidate_();
}
