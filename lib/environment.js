// Unterschiede zwischen Staging und Produktion beim Build.

export const PLACEHOLDER = 'AUSFÜLLEN';

export function isStaging(mode) {
  return mode === 'staging' || mode === 'development';
}

export function robotsTxt(mode) {
  return isStaging(mode) ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n';
}

export function headTags(mode) {
  return isStaging(mode) ? '<meta name="robots" content="noindex, nofollow">' : '';
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
