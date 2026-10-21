// Speichert Rekord, Einstellungen und die laufende Runde lokal im Browser. Nichts davon verlässt das Gerät.
// Der Speicher kann fehlen (privates Fenster, blockierte Website-Daten) – dann läuft das Spiel einfach ohne.

const PREFIX = 'royal-blocks:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Speichern nicht möglich – das Spiel läuft trotzdem weiter.
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // siehe save()
  }
}
