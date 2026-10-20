// Ziel nach der Anmeldung, z. B. /konto/anmelden/?zurueck=/games/nova-bastion/
// Nur Pfade auf dieser Webseite – nie fremde Adressen (sonst könnte ein Link Nutzer nach dem Login wegleiten).
export function safeReturnPath(search) {
  const target = new URLSearchParams(search).get('zurueck') ?? '';
  const safe = /^\/(?!\/)[A-Za-z0-9\-._~/]*$/.test(target) && !target.includes('..');
  return safe ? target : '/konto/';
}
