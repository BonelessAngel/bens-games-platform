// Unterschiede zwischen Staging und Produktion beim Build.

export const PLACEHOLDER = 'AUSFÜLLEN';

export function isStaging(mode) {
  return mode === 'staging' || mode === 'development';
}

// Benutzerkonten: seit Phase 3.6 in allen Umgebungen. Auf der Live-Seite erscheinen sie erst mit dem
// nächsten „veröffentlichen“; der Produktions-Deploy bricht ab, solange die Produktions-Datenbank fehlt.
// Zum Abschalten hier false zurückgeben (dann gibt es keine Kontoseiten und keinen Anmelde-Link).
export function accountsEnabled() {
  return true;
}

export const ACCOUNT_PAGES = {
  konto: 'konto/index.html',
  anmelden: 'konto/anmelden/index.html',
  registrieren: 'konto/registrieren/index.html',
  bestaetigen: 'konto/bestaetigen/index.html',
  passwortVergessen: 'konto/passwort-vergessen/index.html',
  passwortNeu: 'konto/passwort-neu/index.html',
};

// Link in der Kopfzeile; zeigt nach der Anmeldung den Namen und führt zu „Mein Konto“.
export function accountNav(mode) {
  if (!accountsEnabled(mode)) return '';
  // Profilbild und Name setzt src/scripts/nav.js (von jeder Seite geladen).
  return '<a href="/konto/anmelden/" data-account-link>Anmelden</a>';
}

export function robotsTxt(mode) {
  return isStaging(mode) ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n';
}

// Gewähltes Farbschema vor dem ersten Zeichnen setzen, damit nichts aufblitzt (siehe src/scripts/theme.js).
export const THEME_BOOT = '<script>try{var t=localStorage.getItem("bg-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>';

export function headTags(mode) {
  const tags = [THEME_BOOT];
  if (isStaging(mode)) tags.push('<meta name="robots" content="noindex, nofollow">');
  // Schaltet in den Skripten die Teile ein, die Konten und die API brauchen.
  if (accountsEnabled(mode)) tags.push('<meta name="bg-accounts" content="1">');
  return tags.join('\n  ');
}

export function environmentBanner(mode) {
  return isStaging(mode)
    ? '<div class="env-banner" role="note">Testumgebung – nicht öffentlich</div>'
    : '';
}

// Produktion darf nie mit unausgefüllten Pflichtangaben (z. B. im Impressum) gebaut werden.
export function assertNoPlaceholders(html, file, mode) {
  if (!isStaging(mode) && html.includes(PLACEHOLDER)) {
    throw new Error(`${file} enthält noch Platzhalter "${PLACEHOLDER}" – Produktions-Build abgebrochen.`);
  }
}
