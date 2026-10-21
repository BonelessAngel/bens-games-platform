// Pokerhände erkennen: Aus beliebig vielen Karten (eine volle Reihe hat 8) wird die beste Hand aus 5 Karten gesucht.
// Eine Karte ist { r, s }: r = Wert 2..14 (11 Bube, 12 Dame, 13 König, 14 Ass), s = Farbe 0..3 (siehe SUITS).

export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_NAMES = ['Pik', 'Herz', 'Karo', 'Kreuz'];
const RANK_LABELS = { 11: 'B', 12: 'D', 13: 'K', 14: 'A' };

export const rankLabel = (r) => RANK_LABELS[r] ?? String(r);

// Reihenfolge = Stärke. mult ist der Faktor für die Punkte einer abgeräumten Reihe.
export const HANDS = [
  { id: 'high', name: 'Hohe Karte', mult: 1 },
  { id: 'pair', name: 'Paar', mult: 2 },
  { id: 'two-pair', name: 'Zwei Paare', mult: 3 },
  { id: 'trips', name: 'Drilling', mult: 4 },
  { id: 'straight', name: 'Straße', mult: 5 },
  { id: 'flush', name: 'Flush', mult: 6 },
  { id: 'full-house', name: 'Full House', mult: 8 },
  { id: 'quads', name: 'Vierling', mult: 12 },
  { id: 'straight-flush', name: 'Straight Flush', mult: 20 },
  { id: 'royal-flush', name: 'Royal Flush', mult: 50 },
].map((hand, level) => ({ ...hand, level }));

const result = (level, used) => ({ level, ...HANDS[level], used });

// Sucht in einer Liste von Karten-Indizes die höchste Straße. Das Ass zählt auch als 1 (A-2-3-4-5).
// Gibt die Indizes der 5 Karten zurück (höchste zuerst) oder null.
function findStraight(cards, indices) {
  const byRank = new Map();
  for (const i of indices) if (!byRank.has(cards[i].r)) byRank.set(cards[i].r, i);
  for (let top = 14; top >= 5; top--) {
    const run = [];
    for (let r = top; r > top - 5; r--) {
      const rank = r === 1 ? 14 : r;
      if (!byRank.has(rank)) break;
      run.push(byRank.get(rank));
    }
    if (run.length === 5) return { top, used: run };
  }
  return null;
}

const DECK = Array.from({ length: 52 }, (_, k) => ({ r: 2 + (k % 13), s: Math.floor(k / 13) }));
const MAX_WILD = 3; // mehr Joker in einer Reihe kommen praktisch nie vor; weitere zählen als Pik-2

// Beste Hand; Joker ({ j: 1 }) werden durch die Karte ersetzt, die die stärkste Hand ergibt.
// used enthält die Positionen der Karten, die die Hand bilden (Joker eingeschlossen).
export function evaluateHand(cards) {
  const jokers = [];
  cards.forEach((c, i) => c.j && jokers.push(i));
  if (!jokers.length) return evaluatePlain(cards);

  const work = cards.slice();
  for (const i of jokers.slice(MAX_WILD)) work[i] = DECK[0];
  const wild = jokers.slice(0, MAX_WILD);
  let best = null;
  const tryAll = (k) => {
    if (best?.level === 9) return;
    if (k === wild.length) {
      const r = evaluatePlain(work);
      if (!best || r.level > best.level) best = r;
      return;
    }
    for (const card of DECK) {
      work[wild[k]] = card;
      tryAll(k + 1);
    }
  };
  tryAll(0);
  return best;
}

// "Fast!": Hat genau eine Karte zu einer stärkeren Hand (ab Straße) gefehlt? Gibt die Hand zurück oder null.
export function nearMiss(cards, level) {
  const plain = cards.filter((c) => !c.j);
  const bySuit = [0, 1, 2, 3].map((s) => plain.filter((c) => c.s === s));
  if (level < 9 && bySuit.some((list) => new Set(list.filter((c) => c.r >= 10).map((c) => c.r)).size === 4)) return HANDS[9];
  if (level < 5 && bySuit.some((list) => list.length === 4)) return HANDS[5];
  if (level < 4) {
    const ranks = new Set(plain.map((c) => c.r));
    if (ranks.has(14)) ranks.add(1);
    for (let low = 1; low <= 10; low++) {
      let count = 0;
      for (let r = low; r < low + 5; r++) if (ranks.has(r)) count++;
      if (count === 4) return HANDS[4];
    }
  }
  return null;
}

// Farbe eines Flushs (für Aufträge wie "Flush in Herz"); null, wenn die Hand kein Flush ist.
export function flushSuit(cards, hand) {
  if (![5, 8, 9].includes(hand.level)) return null;
  const real = hand.used.map((i) => cards[i]).find((c) => !c.j);
  return real ? real.s : null;
}

function evaluatePlain(cards) {
  const all = cards.map((_, i) => i);
  const byHigh = (a, b) => cards[b].r - cards[a].r;

  const bySuit = [[], [], [], []];
  for (const i of all) bySuit[cards[i].s].push(i);
  const flushSuits = bySuit.filter((list) => list.length >= 5);

  let straightFlush = null;
  for (const list of flushSuits) {
    const found = findStraight(cards, list);
    if (found && (!straightFlush || found.top > straightFlush.top)) straightFlush = found;
  }
  if (straightFlush) return result(straightFlush.top === 14 ? 9 : 8, straightFlush.used);

  const byRank = new Map();
  for (const i of [...all].sort(byHigh)) {
    if (!byRank.has(cards[i].r)) byRank.set(cards[i].r, []);
    byRank.get(cards[i].r).push(i);
  }
  // Gruppen: größte zuerst, bei Gleichstand der höhere Wert
  const groups = [...byRank.values()].sort((a, b) => b.length - a.length || cards[b[0]].r - cards[a[0]].r);

  if (groups[0].length >= 4) return result(7, groups[0].slice(0, 4));
  if (groups[0].length >= 3 && groups[1]?.length >= 2) {
    return result(6, [...groups[0].slice(0, 3), ...groups[1].slice(0, 2)]);
  }
  if (flushSuits.length) {
    const best = flushSuits.map((list) => [...list].sort(byHigh).slice(0, 5)).sort((a, b) => {
      for (let k = 0; k < 5; k++) if (cards[a[k]].r !== cards[b[k]].r) return cards[b[k]].r - cards[a[k]].r;
      return 0;
    })[0];
    return result(5, best);
  }
  const straight = findStraight(cards, all);
  if (straight) return result(4, straight.used);
  if (groups[0].length === 3) return result(3, groups[0]);
  if (groups[0].length === 2 && groups[1]?.length === 2) return result(2, [...groups[0], ...groups[1]]);
  if (groups[0].length === 2) return result(1, groups[0]);
  return result(0, [groups[0][0]]);
}
