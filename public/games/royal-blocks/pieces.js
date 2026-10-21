// Formen der Spielteile (wie bei Block Blast). '#' = Kästchen, '.' = leer. weight = wie oft die Form vorkommt.

const SHAPE_DEFS = [
  // Einzel und Linien
  { weight: 2, rows: ['#'] },
  { weight: 3, rows: ['##'] },
  { weight: 3, rows: ['#', '#'] },
  { weight: 3, rows: ['###'] },
  { weight: 3, rows: ['#', '#', '#'] },
  { weight: 2, rows: ['####'] },
  { weight: 2, rows: ['#', '#', '#', '#'] },
  { weight: 1, rows: ['#####'] },
  { weight: 1, rows: ['#', '#', '#', '#', '#'] },
  // Quadrate und Rechtecke
  { weight: 4, rows: ['##', '##'] },
  { weight: 1, rows: ['###', '###', '###'] },
  { weight: 1, rows: ['###', '###'] },
  { weight: 1, rows: ['##', '##', '##'] },
  // kleine Ecken
  { weight: 1.5, rows: ['#.', '##'] },
  { weight: 1.5, rows: ['.#', '##'] },
  { weight: 1.5, rows: ['##', '#.'] },
  { weight: 1.5, rows: ['##', '.#'] },
  // L-Formen
  { weight: 0.75, rows: ['#.', '#.', '##'] },
  { weight: 0.75, rows: ['.#', '.#', '##'] },
  { weight: 0.75, rows: ['##', '#.', '#.'] },
  { weight: 0.75, rows: ['##', '.#', '.#'] },
  { weight: 0.75, rows: ['###', '#..'] },
  { weight: 0.75, rows: ['###', '..#'] },
  { weight: 0.75, rows: ['#..', '###'] },
  { weight: 0.75, rows: ['..#', '###'] },
  // große Ecken
  { weight: 0.5, rows: ['#..', '#..', '###'] },
  { weight: 0.5, rows: ['..#', '..#', '###'] },
  { weight: 0.5, rows: ['###', '#..', '#..'] },
  { weight: 0.5, rows: ['###', '..#', '..#'] },
  // T-Formen
  { weight: 0.75, rows: ['###', '.#.'] },
  { weight: 0.75, rows: ['.#.', '###'] },
  { weight: 0.75, rows: ['#.', '##', '#.'] },
  { weight: 0.75, rows: ['.#', '##', '.#'] },
  // S/Z-Formen
  { weight: 0.75, rows: ['.##', '##.'] },
  { weight: 0.75, rows: ['##.', '.##'] },
  { weight: 0.75, rows: ['#.', '##', '.#'] },
  { weight: 0.75, rows: ['.#', '##', '#.'] },
];

function parse(rows) {
  const cells = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && cells.push([x, y])));
  return { w: rows[0].length, h: rows.length, cells };
}

export const SHAPES = SHAPE_DEFS.map((def, id) => ({ id, weight: def.weight, ...parse(def.rows) }));
const TOTAL_WEIGHT = SHAPES.reduce((sum, s) => sum + s.weight, 0);

export function randomShape(rng) {
  let pick = rng() * TOTAL_WEIGHT;
  for (const shape of SHAPES) {
    pick -= shape.weight;
    if (pick < 0) return shape;
  }
  return SHAPES[SHAPES.length - 1];
}

// Volles Deck 2..Ass, jeder Wert gleich wahrscheinlich.
export function randomRank(rng) {
  return 2 + Math.floor(rng() * 13);
}

export const JOKER_CHANCE = 1 / 25; // so viele Teile haben ein Joker-Kästchen

// Ein Teil hat immer eine Farbe (wie ein Block bei Block Blast) – so sieht man Flushs kommen.
// Selten ist ein Kästchen ein Joker ({ j: 1 }), der als beliebige Karte zählt.
export function randomPiece(rng) {
  const shape = randomShape(rng);
  const s = Math.floor(rng() * 4);
  const cards = shape.cells.map(() => ({ r: randomRank(rng), s }));
  if (rng() < JOKER_CHANCE) cards[Math.floor(rng() * cards.length)] = { j: 1 };
  return { shape: shape.id, w: shape.w, h: shape.h, s, cells: shape.cells, cards };
}

// Reproduzierbarer Zufall (Mulberry32). Der Zustand liegt in holder.rng, damit er mit dem Spielstand
// gespeichert wird – so bleibt die Tages-Challenge auch nach dem Neuladen für alle gleich.
export function nextRandom(holder) {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rngOf = (holder) => () => nextRandom(holder);
export const seededRng = (seed) => rngOf({ rng: seed >>> 0 });
