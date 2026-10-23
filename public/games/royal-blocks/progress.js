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

export const ACHIEVEMENTS = {
  royal_flush: { name: 'Königliche Hand', icon: '👑' },
  jackpots_10: { name: 'Jackpot-Legende', icon: '💰' },
  level_25: { name: 'Casino-Profi', icon: '🏆' },
  gift_7: { name: 'Sieben Tage Glück', icon: '🎁' },
  pro_25000: { name: 'Profi mit 25.000', icon: '🔥' },
};

export function earnedAchievements({ stats = {}, xp = 0, gift = null, proBest = 0 } = {}) {
  const earned = [];
  if (Number(stats.hands?.[9]) > 0) earned.push('royal_flush');
  if (Number(stats.jackpots) >= 10) earned.push('jackpots_10');
  if (levelFromXp(Math.max(0, Number(xp) || 0)).level >= 25) earned.push('level_25');
  if (Number(gift?.streak) >= 7) earned.push('gift_7');
  if (Number(proBest) >= 25_000) earned.push('pro_25000');
  return earned;
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

// ---------- Jackpot ----------
// Wächst mit jeder beendeten Runde. Royal Flush gewinnt alles, Straight Flush ein Viertel.
export const JACKPOT_START = 500;
export const JACKPOT_GROWTH = 40;
export function jackpotWin(level, pot) {
  if (level >= 9) return pot;
  if (level === 8) return Math.round(pot / 4);
  return 0;
}

// ---------- Statistik ----------
export const emptyStats = () => ({
  games: 0, totalScore: 0, bestScore: 0, lines: 0, bestStreak: 0, hands: new Array(10).fill(0),
  golden: 0, fevers: 0, jackpots: 0, missions: 0, chipsEarned: 0,
});

export function recordMove(stats, res, streak) {
  for (const line of res.lines) stats.hands[line.hand.level]++;
  stats.lines += res.lines.length;
  stats.golden += res.golden || 0;
  if (res.feverStart) stats.fevers++;
  if (res.mission) stats.missions++;
  stats.chipsEarned += res.chips || 0;
  stats.bestStreak = Math.max(stats.bestStreak, streak);
}

export function recordRound(stats, state) {
  stats.games++;
  stats.totalScore += state.score;
  stats.bestScore = Math.max(stats.bestScore, state.score);
}

// ---------- Rubbellos ----------
// Jede 3. beendete Runde gibt es ein Los. Drei Felder; je mehr gleiche, desto mehr Chips.
export const SCRATCH_EVERY = 3;
const SYMBOLS = ['♠', '♥', '♦', '♣'];
export function scratchPrize(rand) {
  const roll = rand();
  const pick = () => SYMBOLS[Math.floor(rand() * SYMBOLS.length)];
  if (roll < 0.04) return { chips: 750, symbols: ['♛', '♛', '♛'], tier: 3 };
  if (roll < 0.17) {
    const s = pick();
    return { chips: 250, symbols: [s, s, s], tier: 2 };
  }
  if (roll < 0.5) {
    const s = pick();
    const other = SYMBOLS.find((x) => x !== s);
    const symbols = [s, s, other];
    const k = Math.floor(rand() * 3);
    [symbols[k], symbols[2]] = [symbols[2], symbols[k]];
    return { chips: 100, symbols, tier: 1 };
  }
  const start = Math.floor(rand() * SYMBOLS.length);
  return { chips: 40, symbols: [0, 1, 2].map((k) => SYMBOLS[(start + k) % SYMBOLS.length]), tier: 0 };
}
