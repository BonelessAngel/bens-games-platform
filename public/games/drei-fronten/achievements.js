// Erfolge: Ziel, Fortschritt, Belohnung (Münzen) und manchmal ein Titel.
// progress(ctx) liefert den aktuellen Wert, goal den Zielwert. ctx = { stats, owned, totalCards }.

export const ACHIEVEMENTS = [
  { id: 'erster_sieg', icon: '⚔️', name: 'Erster Sieg', text: 'Gewinne eine Partie.', goal: 1, stat: 'wins', coins: 50 },
  { id: 'sieger_10', icon: '🏅', name: 'Erfahrener Kämpfer', text: 'Gewinne 10 Partien.', goal: 10, stat: 'wins', coins: 150 },
  { id: 'sieger_50', icon: '🎖️', name: 'Veteran', text: 'Gewinne 50 Partien.', goal: 50, stat: 'wins', coins: 400, title: 'Veteran' },
  { id: 'meister_1', icon: '👑', name: 'Meisterprüfung', text: 'Besiege einen ★★★-Gegner.', goal: 1, stat: 'masterWins', coins: 100, title: 'Bezwinger' },
  { id: 'meister_10', icon: '🐉', name: 'Schrecken der Meister', text: 'Besiege 10-mal einen ★★★-Gegner.', goal: 10, stat: 'masterWins', coins: 300, title: 'Kriegsfürst' },
  { id: 'serie_3', icon: '🔥', name: 'Heiße Serie', text: 'Gewinne 3 Partien hintereinander.', goal: 3, stat: 'streakMax', coins: 100 },
  { id: 'serie_5', icon: '☄️', name: 'Unaufhaltsam', text: 'Gewinne 5 Partien hintereinander.', goal: 5, stat: 'streakMax', coins: 250, title: 'Unaufhaltsam' },
  { id: 'makellos', icon: '💎', name: 'Makellos', text: 'Gewinne eine Partie, ohne ein Banner abzugeben.', goal: 1, stat: 'perfect', coins: 150, title: 'Makellos' },
  { id: 'trommel_sieg', icon: '🥁', name: 'Mit Pauken und Trompeten', text: 'Gewinne eine Runde, in der getrommelt wurde.', goal: 1, stat: 'drumRoundsWon', coins: 75 },
  { id: 'trommel_flucht', icon: '🏳️', name: 'Einschüchterung', text: 'Bring den Gegner mit deiner Trommel 3-mal zum Aufgeben.', goal: 3, stat: 'drumFolds', coins: 100 },
  { id: 'spiegel', icon: '🪞', name: 'Verkehrte Welt', text: 'Gewinne den Spiegelsee 3-mal.', goal: 3, stat: 'front_spiegelsee', coins: 75 },
  { id: 'hort', icon: '💰', name: 'Drachengold', text: 'Gewinne den Drachenhort 5-mal.', goal: 5, stat: 'front_drachenhort', coins: 75 },
  { id: 'nebel', icon: '🌫️', name: 'Durch den Nebel', text: 'Gewinne das Nebelmoor 5-mal.', goal: 5, stat: 'front_nebelmoor', coins: 75 },
  { id: 'alle_fronten', icon: '🏰', name: 'Totaler Triumph', text: 'Gewinne in einer Runde alle drei Fronten.', goal: 1, stat: 'sweeps', coins: 100 },
  { id: 'eigenes_deck', icon: '✏️', name: 'Deckbauer', text: 'Gewinne mit einem eigenen Deck.', goal: 1, stat: 'customWins', coins: 75 },
  { id: 'pakete_1', icon: '🎁', name: 'Neugierig', text: 'Öffne ein Paket.', goal: 1, stat: 'packs', coins: 25 },
  { id: 'pakete_10', icon: '📦', name: 'Paketjäger', text: 'Öffne 10 Pakete.', goal: 10, stat: 'packs', coins: 150 },
  { id: 'pakete_30', icon: '🏺', name: 'Schatzsucher', text: 'Öffne 30 Pakete.', goal: 30, stat: 'packs', coins: 400 },
  { id: 'legendaer', icon: '🌟', name: 'Legende!', text: 'Ziehe eine legendäre Karte aus einem Paket.', goal: 1, stat: 'legendaries', coins: 100, title: 'Glückskind' },
  { id: 'gold', icon: '✨', name: 'Pures Gold', text: 'Ziehe eine goldene Karte.', goal: 1, stat: 'goldens', coins: 150 },
  { id: 'gold_5', icon: '🪙', name: 'Goldschmied', text: 'Besitze 5 goldene Karten.', goal: 5, stat: 'goldenOwned', coins: 300, title: 'Goldschmied' },
  { id: 'sammler_35', icon: '📚', name: 'Sammler', text: 'Besitze 35 verschiedene Karten.', goal: 35, stat: 'owned', coins: 150 },
  { id: 'sammler_alle', icon: '🏛️', name: 'Großsammler', text: 'Besitze jede Karte.', goal: 'all', stat: 'owned', coins: 500, title: 'Großsammler' },
  { id: 'kampagne_1', icon: '📜', name: 'Der Weg beginnt', text: 'Schließe Kapitel 1 der Kampagne ab.', goal: 1, stat: 'chapters', coins: 50 },
  { id: 'kampagne_4', icon: '🗺️', name: 'Halbzeit', text: 'Schließe 4 Kapitel der Kampagne ab.', goal: 4, stat: 'chapters', coins: 150 },
  { id: 'kampagne_8', icon: '⚜️', name: 'Feldherr der drei Fronten', text: 'Schließe die ganze Kampagne ab.', goal: 8, stat: 'chapters', coins: 500, title: 'Feldherr' },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));

export function goalOf(achievement, ctx) {
  return achievement.goal === 'all' ? ctx.totalCards : achievement.goal;
}

export function progressOf(achievement, ctx) {
  return Math.min(goalOf(achievement, ctx), ctx.stats[achievement.stat] ?? 0);
}

// Erfolge, die erreicht, aber noch nicht abgeholt sind.
export function readyToClaim(ctx, claimed) {
  return ACHIEVEMENTS.filter((entry) => !claimed.includes(entry.id) && progressOf(entry, ctx) >= goalOf(entry, ctx));
}

export function titlesFor(claimed) {
  return ACHIEVEMENTS.filter((entry) => entry.title && claimed.includes(entry.id)).map((entry) => entry.title);
}
