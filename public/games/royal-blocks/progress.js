// Belohnungen über die Runden hinweg: Spieler-Level, Truhe am Rundenende, Tagesgeschenk, Lob-Rufe.
// Reine Rechenregeln ohne Anzeige; gespeichert wird in main.js.

// Erfahrung einer Runde: Punkte und abgeräumte Reihen zählen, damit auch kurze Runden etwas bringen.
export function xpForRound(state) {
  return Math.max(10, Math.round(state.score / 150) + state.lines * 5);
}

// Erfahrung für den Schritt von Level n zu n+1. Am Anfang geht es schnell, später langsamer.
export const xpToNext = (level) => 400 + (level - 1) * 150;

export function levelFromXp(xp) {
  let level = 1;
  let rest = xp;
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, need: xpToNext(level) };
}

// Belohnung beim Erreichen eines Levels. Jedes 5. Level schaltet ein Design frei (wenn noch eins fehlt).
export function levelReward(level) {
  return { chips: 50 + level * 10, design: level % 5 === 0 };
}

// Truhe am Rundenende: je besser die Runde, desto mehr Chips; selten ein dreifacher Bonus.
export const CHEST_BONUS_CHANCE = 0.12;
export function chestReward(state, rand) {
  const base = Math.min(300, 15 + Math.round(state.score / 600) + state.lines * 2);
  const bonus = rand() < CHEST_BONUS_CHANCE;
  return { chips: bonus ? base * 3 : base, bonus };
}

// Tagesgeschenk: wächst mit jedem Tag in Folge (bis Tag 7), danach bleibt es beim Maximum.
export const GIFT_DAYS = [50, 75, 100, 125, 150, 200, 300];

const dayNumber = (day) => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86400000);

// last: { day, streak } vom letzten Abholen (oder null). Gibt null zurück, wenn heute schon abgeholt.
export function dailyGift(last, today) {
  if (last?.day === today) return null;
  const consecutive = last && dayNumber(today) - dayNumber(last.day) === 1;
  const streak = consecutive ? last.streak + 1 : 1;
  return { day: today, streak, chips: GIFT_DAYS[Math.min(streak, GIFT_DAYS.length) - 1] };
}

// Lob beim Abräumen, passend zur Stärke der Hand und zur Kombo
const PRAISE = ['Okay!', 'Gut!', 'Schön!', 'Klasse!', 'Super!', 'Super!', 'Wahnsinn!', 'Unglaublich!', 'Legendär!', 'Königlich!'];
export function praiseFor(level, combo) {
  const step = Math.min(PRAISE.length - 1, level + (combo > 1 ? combo : 0));
  return PRAISE[step];
}
