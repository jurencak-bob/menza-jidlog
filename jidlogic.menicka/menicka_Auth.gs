/**
 * Auth.gs — workspace-only autentizace přes Session.getActiveUser()
 */

function currentUser_() {
  var email = '';
  try {
    email = Session.getActiveUser().getEmail();
  } catch (e) {
    throw new Error('Nepodařilo se zjistit přihlášeného uživatele.');
  }
  if (!email) {
    throw new Error('Aplikace je dostupná pouze pro přihlášené uživatele @' + WORKSPACE_DOMAIN);
  }
  if (!_isWorkspace_(email)) {
    throw new Error('Přístup pouze pro uživatele @' + WORKSPACE_DOMAIN);
  }
  return email.toLowerCase();
}

function _isWorkspace_(email) {
  return !!email && String(email).toLowerCase().endsWith('@' + WORKSPACE_DOMAIN.toLowerCase());
}
