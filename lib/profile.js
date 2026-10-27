// Gemeinsame Regeln für Spielerprofile (Profil-Seite und „Mein Konto“).

/** Seltenheit eines Abzeichens aus dem Anteil der Spieler, die es haben (0..1). */
export function rarityOf(share) {
  const p = typeof share === 'number' && share >= 0 ? share : 1;
  const percent = Math.max(1, Math.round(p * 100));
  const text = p < 0.25 ? `nur ${percent} % der Spieler` : `${percent} % der Spieler`;
  if (p <= 0.05) return { id: 'legendary', label: 'Legendär', text };
  if (p <= 0.15) return { id: 'epic', label: 'Episch', text };
  if (p <= 0.35) return { id: 'rare', label: 'Selten', text };
  return { id: 'common', label: 'Gewöhnlich', text };
}

/** Banner (wie api/src/Profiles.php) – für die Vorschau in „Mein Konto“. */
export const BANNERS = ['nacht', 'neon', 'aurora', 'lava', 'sternenstaub', 'royal', 'gold', 'galaxie', 'casino'];
