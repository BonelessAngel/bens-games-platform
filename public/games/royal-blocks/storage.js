// Speichert Rekord, Einstellungen und die laufende Runde lokal im Browser. Nichts davon verlässt das Gerät.
// Der Speicher kann fehlen (privates Fenster, blockierte Website-Daten) – dann läuft das Spiel einfach ohne.

const PREFIX = 'royal-blocks:';
const KEY_RE = /^[a-z0-9-]{1,64}$/;
const listeners = new Set();

function touch() {
  const t = Date.now();
  localStorage.setItem(PREFIX + 'sync-t', JSON.stringify(t));
  for (const listener of listeners) listener(t);
  return t;
}

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
    if (key !== 'sync-t') touch();
  } catch {
    // Speichern nicht möglich – das Spiel läuft trotzdem weiter.
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
    if (key !== 'sync-t') touch();
  } catch {
    // siehe save()
  }
}

export function onSave(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function exportSnapshot() {
  const values = {};
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const fullKey = localStorage.key(index);
      if (!fullKey?.startsWith(PREFIX)) continue;
      const key = fullKey.slice(PREFIX.length);
      if (KEY_RE.test(key)) values[key] = localStorage.getItem(fullKey);
    }
  } catch {
    // Ein leerer Stand ist weiterhin gültig und kann später erneut gesichert werden.
  }
  let t = 0;
  try { t = Number(JSON.parse(values['sync-t'] ?? '0')) || 0; } catch { t = 0; }
  return { version: 1, t, values };
}

export function importSnapshot(snapshot, now = Date.now()) {
  if (!snapshot || snapshot.version !== 1 || typeof snapshot.values !== 'object' || Array.isArray(snapshot.values)) return false;
  const entries = Object.entries(snapshot.values);
  if (entries.some(([key, value]) => !KEY_RE.test(key) || typeof value !== 'string')) return false;
  if (entries.reduce((sum, [key, value]) => sum + key.length + value.length, 0) > 500_000) return false;
  try {
    for (const [key, value] of entries) localStorage.setItem(PREFIX + key, value);
    localStorage.setItem(PREFIX + 'sync-t', JSON.stringify(now));
    return true;
  } catch {
    return false;
  }
}

function parsed(snapshot, key, fallback) {
  try { return JSON.parse(snapshot?.values?.[key] ?? JSON.stringify(fallback)); } catch { return fallback; }
}

export function hasProgress(snapshot) {
  const game = parsed(snapshot, 'game', null);
  const pro = parsed(snapshot, 'pro', null);
  const stats = parsed(snapshot, 'stats', {});
  const owned = parsed(snapshot, 'owned', []);
  return Number(parsed(snapshot, 'chips', 0)) > 0 || Number(parsed(snapshot, 'xp', 0)) > 0 ||
    Number(stats.games) > 0 || Number(game?.moves) > 0 || Number(pro?.moves) > 0 ||
    (Array.isArray(owned) && owned.some((id) => !['neon', 'standard'].includes(id)));
}

export function snapshotSummary(snapshot) {
  const xp = Math.max(0, Number(parsed(snapshot, 'xp', 0)) || 0);
  const chips = Math.max(0, Number(parsed(snapshot, 'chips', 0)) || 0);
  return { xp, chips, t: Math.max(0, Number(snapshot?.t) || 0) };
}
