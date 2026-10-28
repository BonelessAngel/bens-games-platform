// Sammlung, Münzen und Kartenpakete. Alles nur mit Spielmünzen – es gibt kein echtes Geld.

import { CARD_BY_ID, CARDS, DECKS, RARITIES } from './cards.js';
import { MAX_COPIES } from './decks.js';

export const START_COINS = 200;
export const PITY_LIMIT = 20;
// Chance je gezogener Karte, dass sie golden ist (nur Schmuck, nicht stärker).
export const GOLD_CHANCE = 0.03;

export const PACKS = {
  klein: { name: 'Kartenpaket', icon: '🎁', price: 100, size: 4, guarantee: 'selten', text: '4 Karten, mindestens 1 seltene' },
  gross: { name: 'Großes Paket', icon: '💎', price: 280, size: 8, guarantee: 'episch', text: '8 Karten, mindestens 1 epische' },
};

export const WEIGHTS = { gewoehnlich: 68, selten: 24, episch: 6.5, legendaer: 1.5 };
const ORDER = ['gewoehnlich', 'selten', 'episch', 'legendaer'];

// Zu Beginn besitzt man genau die Karten der beiden Startdecks.
export function startingOwned() {
  const owned = {};
  for (const deck of Object.values(DECKS)) {
    const counts = {};
    for (const id of deck.cards) counts[id] = (counts[id] ?? 0) + 1;
    for (const [id, count] of Object.entries(counts)) owned[id] = Math.max(owned[id] ?? 0, count);
  }
  return owned;
}

export function cleanOwned(data) {
  const owned = startingOwned();
  if (data && typeof data === 'object') {
    for (const [id, count] of Object.entries(data)) {
      if (!CARD_BY_ID[id] || CARD_BY_ID[id].token || !Number.isInteger(count)) continue;
      owned[id] = Math.max(owned[id] ?? 0, Math.min(MAX_COPIES, count));
    }
  }
  return owned;
}

export function ownedCount(owned) {
  return CARDS.filter((card) => (owned[card.id] ?? 0) > 0).length;
}

function rollRarity(random, minimum = 'gewoehnlich') {
  const allowed = ORDER.slice(ORDER.indexOf(minimum));
  const total = allowed.reduce((sum, rarity) => sum + WEIGHTS[rarity], 0);
  let roll = random() * total;
  for (const rarity of allowed) {
    roll -= WEIGHTS[rarity];
    if (roll < 0) return rarity;
  }
  return allowed[allowed.length - 1];
}

// Bevorzugt Karten, von denen man noch keine 2 hat – so sammelt sich die Sammlung schneller.
function pickCard(rarity, owned, random) {
  const pool = CARDS.filter((card) => card.rarity === rarity);
  const missing = pool.filter((card) => (owned[card.id] ?? 0) < MAX_COPIES);
  const from = missing.length && random() < 0.75 ? missing : pool;
  return from[Math.floor(random() * from.length)];
}

// Öffnet ein Paket. Gibt die gezogenen Karten, die neue Sammlung, die goldenen Karten,
// Münzen für überzählige Karten und den Pity-Zähler zurück.
export function openPack(packId, owned, pity = 0, random = Math.random, golden = {}) {
  const pack = PACKS[packId];
  const next = { ...owned };
  const nextGolden = { ...golden };
  const rarities = [];
  for (let i = 0; i < pack.size; i++) rarities.push(rollRarity(random, i === pack.size - 1 ? pack.guarantee : 'gewoehnlich'));
  let counter = pity + 1;
  if (rarities.includes('legendaer')) counter = 0;
  else if (counter >= PITY_LIMIT) {
    rarities[rarities.length - 1] = 'legendaer';
    counter = 0;
  }
  rarities.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  let refund = 0;
  const cards = rarities.map((rarity) => {
    const card = pickCard(rarity, next, random);
    const before = next[card.id] ?? 0;
    const shiny = !nextGolden[card.id] && random() < GOLD_CHANCE;
    if (shiny) {
      nextGolden[card.id] = true;
      if (before >= MAX_COPIES) return { id: card.id, rarity, isNew: false, refund: 0, golden: true };
      next[card.id] = before + 1;
      return { id: card.id, rarity, isNew: before === 0, refund: 0, golden: true };
    }
    if (before >= MAX_COPIES) {
      refund += RARITIES[rarity].refund;
      return { id: card.id, rarity, isNew: false, refund: RARITIES[rarity].refund };
    }
    next[card.id] = before + 1;
    return { id: card.id, rarity, isNew: before === 0, refund: 0 };
  });
  return { cards, owned: next, golden: nextGolden, refund, pity: counter };
}

// Münzen nach einer Partie.
// stars = Schwierigkeit des Gegners (1–3).
export function matchReward({ won, draw, stars = 1, banners, firstWinToday }) {
  const parts = [];
  if (won) parts.push(['Sieg', 40]);
  else if (draw) parts.push(['Unentschieden', 20]);
  else parts.push(['Tapfer gekämpft', 15]);
  if (banners > 0) parts.push([`${banners} Banner`, banners * 5]);
  if (won && stars >= 3) parts.push(['Meister besiegt (★★★)', 30]);
  else if (won && stars === 2) parts.push(['Gegner ★★ besiegt', 15]);
  if (won && firstWinToday) parts.push(['Erster Sieg heute', 60]);
  return { parts, total: parts.reduce((sum, [, coins]) => sum + coins, 0) };
}

// Zufälliges Deck mit 1–2 Elementen (+ Neutral) für den Computer-Gegner.
export function randomDeck(random = Math.random) {
  const elements = ['feuer', 'wasser', 'erde', 'luft'].sort(() => random() - 0.5).slice(0, 2);
  const pool = CARDS.filter((card) => elements.includes(card.element) || card.element === 'neutral');
  // Gute Kostenkurve wie bei den Startdecks: 9 billige, 8 mittlere, 3 teure Karten, höchstens 6 Aktionen.
  const band = (card) => (card.cost <= 2 ? 'low' : card.cost <= 4 ? 'mid' : 'high');
  const quota = { low: 9, mid: 8, high: 3 };
  const deck = [];
  const shuffled = [...pool].sort(() => random() - 0.5);
  const fits = (card, relaxed) => {
    if (deck.filter((id) => id === card.id).length >= MAX_COPIES) return false;
    if (deck.filter((id) => CARD_BY_ID[id].type === 'aktion').length >= 6 && card.type === 'aktion') return false;
    if (!relaxed && deck.filter((id) => band(CARD_BY_ID[id]) === band(card)).length >= quota[band(card)]) return false;
    return relaxed || card.rarity !== 'legendaer' || !deck.some((id) => CARD_BY_ID[id].rarity === 'legendaer');
  };
  for (const relaxed of [false, false, true]) {
    for (const card of shuffled) {
      if (deck.length >= 20) break;
      if (fits(card, relaxed)) deck.push(card.id);
    }
  }
  return deck;
}
