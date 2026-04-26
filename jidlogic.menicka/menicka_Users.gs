/**
 * Users.gs — uživatelé. Auto-create při první návštěvě, sledování posledního přístupu.
 */

var USER_UPDATABLE = ['sledovane_restaurace', 'skryte_restaurace', 'oblibena_jidla', 'dieta', 'restaurace_overrides'];
var _USER_CACHE_TTL = 300;

function Users_findByEmail_(email) {
  var key = String(email).toLowerCase();
  var cacheKey = 'user_' + key;
  var cache = CacheService.getScriptCache();
  var hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  var rows = _readAll_(SHEETS.UZIVATELE);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].email).toLowerCase() === key) {
      cache.put(cacheKey, JSON.stringify(rows[i]), _USER_CACHE_TTL);
      return rows[i];
    }
  }
  return null;
}

function Users_invalidate_(email) {
  CacheService.getScriptCache().remove('user_' + String(email).toLowerCase());
}

function Users_ensure_(email) {
  var user = Users_findByEmail_(email);
  if (user) {
    Users_touchVisit_(user);
    _selfHealSubscriptions_(user);
    return user;
  }

  // První návštěva — pod zámkem aby se neudělaly dva řádky pro paralelní requesty
  var lock = LockService.getDocumentLock();
  lock.tryLock(10000);
  try {
    user = Users_findByEmail_(email);
    if (user) {
      Users_touchVisit_(user);
      _selfHealSubscriptions_(user);
      return user;
    }
    return Users_create_(email);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Self-heal pro existujícího uživatele: pokud `sledovane_restaurace` je
 * prázdné (po orphan cleanup nebo manual edit v sheetu), doplní mu defaulty.
 * Z pohledu uživatele se chovají jako kdyby si je sám přidal.
 */
function _selfHealSubscriptions_(user) {
  var ids = _parseIdList_(user.sledovane_restaurace);
  if (ids.length > 0) return;

  var defaults = Restaurants_listDefault_();
  if (defaults.length === 0) return;

  var csv = defaults.join(',');
  _setRowFields_(SHEETS.UZIVATELE, user._row, { sledovane_restaurace: csv });
  user.sledovane_restaurace = csv;
  Users_invalidate_(user.email);
  Logger.log('Self-heal pro ' + user.email + ': sledovane_restaurace = ' + csv);
}

function Users_create_(email) {
  var defaults = Restaurants_listDefault_().join(',');
  var now = new Date();

  var rowNum = _appendRowMapped_(SHEETS.UZIVATELE, {
    email: email,
    sledovane_restaurace: defaults,
    oblibena_jidla: '',
    dieta: '',
    vytvoreno: now,
    posledni_pristup: now,
    pocet_navstev: 1
  });

  var user = {
    _row: rowNum,
    email: email,
    sledovane_restaurace: defaults,
    oblibena_jidla: '',
    dieta: '',
    vytvoreno: now,
    posledni_pristup: now,
    pocet_navstev: 1,
    novy: true
  };

  Users_invalidate_(email);
  return user;
}

function Users_touchVisit_(user) {
  var dnes = _today_();
  var lastDate = _formatDate_(user.posledni_pristup);
  if (lastDate === dnes) return;

  var navstevy = (parseInt(user.pocet_navstev, 10) || 0) + 1;
  var now = new Date();

  _setRowFields_(SHEETS.UZIVATELE, user._row, {
    posledni_pristup: now,
    pocet_navstev: navstevy
  });

  user.posledni_pristup = now;
  user.pocet_navstev = navstevy;
  Users_invalidate_(user.email);
}

function Users_updateSettings_(email, payload) {
  var user = Users_findByEmail_(email);
  if (!user) throw new Error('Uživatel nenalezen');

  var updates = {};
  USER_UPDATABLE.forEach(function(f) {
    if (payload && payload[f] !== undefined) {
      updates[f] = payload[f];
      user[f] = payload[f];
    }
  });

  if (Object.keys(updates).length === 0) return user;

  var lock = LockService.getDocumentLock();
  lock.tryLock(5000);
  try {
    _setRowFields_(SHEETS.UZIVATELE, user._row, updates);
  } finally {
    lock.releaseLock();
  }

  Users_invalidate_(email);
  return user;
}
