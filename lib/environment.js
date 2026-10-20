// Unterschiede zwischen Staging und Produktion beim Build.

export const PLACEHOLDER = 'AUSFÜLLEN';

export function isStaging(mode) {
  return mode === 'staging' || mode === 'development';
}

// Benutzerkonten gibt es bis zum Abschluss von Phase 3 nur auf Staging (PLATTFORM-PLAN.md, Abschnitt 9).
export function accountsEnabled(mode) {
  return isStaging(mode);
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
  return `<a href="/konto/anmelden/" data-account-link>Anmelden</a>
        <script>
          fetch('/api/account/me', { credentials: 'same-origin' })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              const a = document.querySelector('[data-account-link]');
              if (d && a) { a.textContent = d.user.display_name; a.href = '/konto/'; }
            })
            .catch(() => {});
        </script>`;
}

export function robotsTxt(mode) {
  return isStaging(mode) ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n';
}

export function headTags(mode) {
  const tags = [];
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
