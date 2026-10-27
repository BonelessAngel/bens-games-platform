// Glücks-Ecke im Shop: Truhen, Rubbellose, Glücksrad, Spielautomat, Glücksbringer.
// Reine Rechenregeln ohne Anzeige. Bezahlt wird nur mit Chips aus dem Spiel, nie mit echtem Geld.
// Alle Gewinnchancen stehen hier und werden im Spiel genau so angezeigt.

import { ALL_ITEMS, CHARMS, RARITY } from './shop.js';

// ---------- Truhen ----------
export const CHESTS = {
  bronze: { name: 'Bronze-Truhe', price: 400, odds: { common: 0.7, rare: 0.25, epic: 0.05 } },
  silver: { name: 'Silber-Truhe', price: 1200, odds: { rare: 0.6, epic: 0.32, legendary: 0.08 } },
  gold: { name: 'Gold-Truhe', price: 3000, odds: { epic: 0.75, legendary: 0.25 } },
};

export function rollRarity(odds, rand) {
  let roll = rand();
  const entries = Object.entries(odds);
  for (const [rarity, chance] of entries) {
    if (roll < chance) return rarity;
    roll -= chance;
  }
  return entries[entries.length - 1][0];
}

// Alles, was aus Truhen kommen kann: keine Gratis-Sachen, keine Set-Boni, keine Extras
export const dropPool = (rarity) => ALL_ITEMS.filter((item) => item.rarity === rarity && !item.bonus && item.kind !== 'extras');

// Ergebnis einer Truhe. Doppelte Sachen werden zu Chips (Wert je Seltenheit).
export function openChestRoll(type, owned, rand) {
  const chest = CHESTS[type];
  if (!chest) return null;
  const rarity = rollRarity(chest.odds, rand);
  const pool = dropPool(rarity);
  const item = pool[Math.floor(rand() * pool.length)];
  const duplicate = owned.has(item.id);
  return { rarity, item, duplicate, chips: duplicate ? RARITY[rarity].dupe : 0 };
}

// ---------- Rubbellose zum Kaufen ----------
export const TICKETS = {
  bronze: { name: 'Glückslos', price: 50 },
  silver: { name: 'Silberlos', price: 150 },
  gold: { name: 'Goldlos', price: 400 },
};
// Chance und Gewinn als Vielfaches des Lospreises
export const TICKET_ODDS = [
  { label: '♛ ♛ ♛', chance: 0.02, times: 10 },
  { label: '3 gleiche', chance: 0.1, times: 3 },
  { label: '2 gleiche', chance: 0.25, times: 1 },
  { label: 'nichts', chance: 0.63, times: 0 },
];
const SUITS = ['♠', '♥', '♦', '♣'];

export function ticketPrize(type, rand) {
  const price = TICKETS[type]?.price;
  if (!price) return null;
  const pick = () => SUITS[Math.floor(rand() * SUITS.length)];
  const roll = rand();
  if (roll < 0.02) return { chips: price * 10, symbols: ['♛', '♛', '♛'], tier: 3 };
  if (roll < 0.12) {
    const s = pick();
    return { chips: price * 3, symbols: [s, s, s], tier: 2 };
  }
  if (roll < 0.37) {
    const s = pick();
    const symbols = [s, s, SUITS.find((x) => x !== s)];
    const k = Math.floor(rand() * 3);
    [symbols[k], symbols[2]] = [symbols[2], symbols[k]];
    return { chips: price, symbols, tier: 1 };
  }
  const start = Math.floor(rand() * SUITS.length);
  return { chips: 0, symbols: [0, 1, 2].map((k) => SUITS[(start + k) % SUITS.length]), tier: 0 };
}

// ---------- Glücksrad: einmal am Tag gratis ----------
// Die Felder sind so groß wie ihre Chance – was man sieht, ist was man bekommt.
export const WHEEL = [
  { label: '50', chips: 50, weight: 24 },
  { label: '100', chips: 100, weight: 22 },
  { label: '150', chips: 150, weight: 18 },
  { label: 'Bronze-Truhe', chest: 'bronze', weight: 10 },
  { label: '250', chips: 250, weight: 12 },
  { label: 'Glückslos', ticket: 'bronze', weight: 7 },
  { label: '500', chips: 500, weight: 5 },
  { label: 'Silber-Truhe', chest: 'silver', weight: 2 },
];
export const WHEEL_TOTAL = WHEEL.reduce((sum, field) => sum + field.weight, 0);

export function spinWheel(rand) {
  let roll = rand() * WHEEL_TOTAL;
  for (let index = 0; index < WHEEL.length; index++) {
    if (roll < WHEEL[index].weight) return index;
    roll -= WHEEL[index].weight;
  }
  return WHEEL.length - 1;
}

// Mitte eines Feldes in Grad (0 = oben, im Uhrzeigersinn)
export function wheelAngle(index) {
  const before = WHEEL.slice(0, index).reduce((sum, field) => sum + field.weight, 0);
  return ((before + WHEEL[index].weight / 2) / WHEEL_TOTAL) * 360;
}

// ---------- Spielautomat ----------
// Jede Walze dreht unabhängig mit diesen Gewichten. Es wird nichts geschönt (keine künstlichen Beinahe-Gewinne).
export const SLOT_SYMBOLS = [
  { id: 'cherry', icon: '🍒', weight: 30 },
  { id: 'spade', icon: '♠', weight: 22 },
  { id: 'heart', icon: '♥', weight: 22 },
  { id: 'bell', icon: '🔔', weight: 14 },
  { id: 'seven', icon: '7', weight: 8 },
  { id: 'crown', icon: '👑', weight: 4 },
];
const SLOT_TOTAL = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
export const SLOT_BETS = [10, 25, 50];
export const SLOT_DAILY_SPINS = 20;
export const SLOT_PAYS = { crown: 'jackpot', seven: 50, bell: 20, spade: 8, heart: 8, cherry: 5 };
export const SLOT_TWO_CHERRIES = 2;
// Hauptgewinn: ein legendärer Gegenstand – wenn man schon alle hat, 200× Einsatz
export const SLOT_JACKPOT_TIMES = 200;

function reel(rand) {
  let roll = rand() * SLOT_TOTAL;
  for (const symbol of SLOT_SYMBOLS) {
    if (roll < symbol.weight) return symbol.id;
    roll -= symbol.weight;
  }
  return SLOT_SYMBOLS[0].id;
}

export function slotResult(reels, bet) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    if (SLOT_PAYS[a] === 'jackpot') return { win: bet * SLOT_JACKPOT_TIMES, jackpot: true };
    return { win: bet * SLOT_PAYS[a], jackpot: false };
  }
  const cherries = reels.filter((r) => r === 'cherry').length;
  if (cherries === 2) return { win: bet * SLOT_TWO_CHERRIES, jackpot: false };
  return { win: 0, jackpot: false };
}

export function spinSlot(bet, rand) {
  if (!SLOT_BETS.includes(bet)) return null;
  const reels = [reel(rand), reel(rand), reel(rand)];
  return { reels, ...slotResult(reels, bet) };
}

// Chance der Gewinnbilder – für die Gewinntabelle im Spiel
export function slotOdds() {
  const p = Object.fromEntries(SLOT_SYMBOLS.map((s) => [s.id, s.weight / SLOT_TOTAL]));
  const rows = SLOT_SYMBOLS.slice().reverse().map((s) => ({
    label: `${s.icon} ${s.icon} ${s.icon}`, chance: p[s.id] ** 3, pays: SLOT_PAYS[s.id],
  }));
  rows.push({ label: '2 × 🍒', chance: 3 * p.cherry ** 2 * (1 - p.cherry), pays: SLOT_TWO_CHERRIES });
  return rows;
}

// Durchschnittliche Auszahlung pro gesetztem Chip (unter 1: auf lange Sicht verliert man leicht)
export function slotReturn() {
  return slotOdds().reduce((sum, row) => sum + row.chance * (row.pays === 'jackpot' ? SLOT_JACKPOT_TIMES : row.pays), 0);
}

// ---------- Tageswerte (Glücksrad, Automat) ----------
export function casinoDay(casino, today) {
  const c = { spent: 0, slotJackpots: 0, chests: 0, sets: [], ...casino };
  if (c.day !== today) Object.assign(c, { day: today, wheel: false, spins: 0 });
  return c;
}

// ---------- Glücksbringer ----------
export function charmBonus(charmId) {
  return CHARMS.find((c) => c.id === charmId)?.bonus_chips ?? 0;
}
export function withCharm(chips, charmId) {
  return chips > 0 ? Math.round(chips * (1 + charmBonus(charmId))) : chips;
}
