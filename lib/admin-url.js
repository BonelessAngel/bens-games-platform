// Adresse der Zentrale zur aktuellen Webseite: staging.bens-games.de → admin-staging.bens-games.de, sonst admin.<domain>.
export function adminUrl(hostname) {
  const host = String(hostname || '').replace(/^www\./, '');
  if (host.startsWith('staging.')) return `https://admin-staging.${host.slice('staging.'.length)}/`;
  return `https://admin.${host}/`;
}
