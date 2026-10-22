// Erfolge als Abzeichen. Spiele können eine achievements.json mitliefern ({ "<id>": { "name", "icon"? } });
// ohne Datei wird die ID lesbar gemacht („stars30“ → „Stars 30“, „first_win“ → „First Win“).

export function prettyAchievement(id) {
  return String(id)
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-zäöü])([A-ZÄÖÜ0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-zÄÖÜäöü])/g, '$1 $2')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** @param {Record<string, {name?: string, icon?: string}> | null} names */
export function achievementInfo(id, names) {
  const entry = names && typeof names === 'object' ? names[id] : null;
  const name = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 60) : prettyAchievement(id);
  const icon = typeof entry?.icon === 'string' && [...entry.icon].length <= 2 ? entry.icon : '🏅';
  return { id, name, icon };
}

const cache = new Map();

/** Lädt /games/<id>/achievements.json, falls das Spiel eine mitliefert. */
export function loadAchievementNames(gameId) {
  if (!cache.has(gameId)) {
    cache.set(gameId, fetch(`/games/${encodeURIComponent(gameId)}/achievements.json`, { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null));
  }
  return cache.get(gameId);
}
