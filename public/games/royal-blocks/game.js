// Spielregeln ohne Anzeige: Feld, Teile setzen, Reihen abräumen, Punkte, Chips, Aufträge, Spezialzüge, Spielende.
// Der Zustand ist reines JSON (auch der Zufall) und kann direkt gespeichert werden.

import { HANDS, SUITS, evaluateHand, flushSuit, nearMiss } from './poker.js';
import { nextRandom, randomPiece, rngOf } from './pieces.js';

export const SIZE = 8;
export const CELL_POINTS = 10; // Punkte pro Kästchen einer abgeräumten Reihe, mal Faktor der Pokerhand
export const STREAK_GRACE = 3; // so viele Züge ohne Abräumen beendet die Serie
export const TABLE_CLEAR_BONUS = 2000; // Feld komplett leer
export const TABLE_CLEAR_CHIPS = 25;
const DEAL_ATTEMPTS = 25;

// Mindesthand: Eine volle Reihe verschwindet nur, wenn ihre Pokerhand mindestens so stark ist.
// Die Anforderung steigt mit der Zahl der abgeräumten Reihen (level = Index in HANDS).
export const REQUIREMENTS = [
  { lines: 0, level: 1 }, // Paar
  { lines: 10, level: 2 }, // Zwei Paare
];

// Gesperrte Reihen zerbröseln nach so vielen Zügen von selbst (ohne Punkte) – ein Fehler ist nie tödlich.
export const LOCK_MOVES = 5;

// Spezialzüge kosten Chips (die Chips selbst verwaltet die Anzeige, sie gelten über alle Runden).
// Eine Runde bringt laut Simulation etwa 250–350 Chips.
export const POWER_COSTS = { fold: 60, blast: 120, recolor: 40 };

export function requirementFor(lines) {
  let current = REQUIREMENTS[0];
  for (const step of REQUIREMENTS) if (lines >= step.lines) current = step;
  const next = REQUIREMENTS[REQUIREMENTS.indexOf(current) + 1] ?? null;
  return { level: current.level, next };
}

export const idx = (x, y) => y * SIZE + x;

// mode: 'free' (freies Spiel) oder 'daily' (Tages-Challenge, gleicher seed für alle).
export function createGame(seed, mode = 'free', day = null) {
  const state = {
    mode,
    day,
    rng: seed >>> 0,
    board: new Array(SIZE * SIZE).fill(null),
    tray: [],
    score: 0,
    streak: 0,
    grace: 0,
    moves: 0,
    lines: 0,
    bestHand: -1,
    chips: 0, // in dieser Runde verdient
    mission: null,
    missionsDone: 0,
    locked: {}, // gesperrte Reihen: "row:3" -> verbleibende Züge
    freeContinue: true, // einmal pro Runde gratis weiterspielen
    rewarded: false, // Truhe am Rundenende schon geöffnet
    over: false,
  };
  state.tray = dealTray(state.board, rngOf(state));
  state.mission = newMission(state);
  return state;
}

export function canPlace(board, piece, x, y) {
  if (x < 0 || y < 0 || x + piece.w > SIZE || y + piece.h > SIZE) return false;
  return piece.cells.every(([dx, dy]) => board[idx(x + dx, y + dy)] === null);
}

export function fitsAnywhere(board, piece) {
  for (let y = 0; y <= SIZE - piece.h; y++) {
    for (let x = 0; x <= SIZE - piece.w; x++) if (canPlace(board, piece, x, y)) return true;
  }
  return false;
}

// Hilfreiches Austeilen (wie bei Block Blast): Oft werden mehrere Sätze Teile ausprobiert und der genommen,
// mit dem sich die meisten Reihen abräumen lassen. Werte per Simulation eingestellt.
export const HELP = { chance: 0.6, candidates: 5 };

// Werte und Farben aus Reihen, denen nur noch wenige Kästchen fehlen
export function lineHints(board) {
  const ranks = [];
  const suits = [];
  const lines = [];
  for (let k = 0; k < SIZE; k++) {
    lines.push(Array.from({ length: SIZE }, (_, x) => idx(x, k)));
    lines.push(Array.from({ length: SIZE }, (_, y) => idx(k, y)));
  }
  for (const cells of lines) {
    const cards = cells.map((i) => board[i]).filter(Boolean);
    if (cards.length < SIZE - 3 || cards.length === SIZE) continue;
    for (const c of cards) {
      if (c.j) continue;
      ranks.push(c.r);
      suits.push(c.s);
    }
  }
  return { ranks, suits };
}

// Wie viele Reihen könnte dieses Teil bestenfalls abräumen?
function clearPotential(board, piece, requiredLevel) {
  let best = 0;
  for (let y = 0; y <= SIZE - piece.h; y++) {
    for (let x = 0; x <= SIZE - piece.w; x++) {
      if (!canPlace(board, piece, x, y)) continue;
      const next = board.slice();
      const cells = piece.cells.map(([dx, dy], k) => {
        const i = idx(x + dx, y + dy);
        next[i] = piece.cards[k];
        return i;
      });
      const ok = linesThrough(next, cells, requiredLevel).filter((l) => l.ok).length;
      if (ok > best) best = ok;
    }
  }
  return best;
}

// Drei neue Teile; mindestens eins davon soll passen (wenn das in einigen Versuchen gelingt).
export function dealTray(board, rng, requiredLevel = 0) {
  const hints = lineHints(board);
  const randomTray = () => {
    let tray;
    for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt++) {
      tray = [randomPiece(rng, hints), randomPiece(rng, hints), randomPiece(rng, hints)];
      if (tray.some((piece) => fitsAnywhere(board, piece))) break;
    }
    return tray;
  };
  if (rng() >= HELP.chance || board.every((c) => c === null)) return randomTray();

  let best = null;
  for (let k = 0; k < HELP.candidates; k++) {
    const tray = randomTray();
    const score = tray.reduce((sum, piece) => sum + clearPotential(board, piece, requiredLevel), 0);
    if (!best || score > best.score) best = { tray, score };
  }
  return best.tray;
}

export function updateOver(state) {
  state.over = !state.tray.some((p) => p && fitsAnywhere(state.board, p));
  return state.over;
}

// Alle vollen Reihen und Spalten mit ihrer Pokerhand. ok = stark genug zum Abräumen.
export function findFullLines(board, requiredLevel = 0) {
  const lines = [];
  for (let y = 0; y < SIZE; y++) {
    const cells = Array.from({ length: SIZE }, (_, x) => idx(x, y));
    if (cells.every((i) => board[i])) lines.push({ type: 'row', index: y, cells });
  }
  for (let x = 0; x < SIZE; x++) {
    const cells = Array.from({ length: SIZE }, (_, y) => idx(x, y));
    if (cells.every((i) => board[i])) lines.push({ type: 'col', index: x, cells });
  }
  for (const line of lines) {
    const cards = line.cells.map((i) => board[i]);
    line.hand = evaluateHand(cards);
    line.handCells = line.hand.used.map((k) => line.cells[k]);
    line.ok = line.hand.level >= requiredLevel;
    line.near = nearMiss(cards, line.hand.level);
    line.flushSuit = flushSuit(cards, line.hand);
  }
  return lines;
}

// Volle Reihen, die durch einen Zug neu entstehen (alte, gesperrte Reihen zählen nicht noch einmal).
function linesThrough(board, cells, requiredLevel) {
  const touched = new Set(cells);
  return findFullLines(board, requiredLevel).filter((line) => line.cells.some((i) => touched.has(i)));
}

export const streakMultiplier = (streak) => (streak > 1 ? 1 + 0.5 * (streak - 1) : 1);

// ---------- Aufträge ----------

// Je mehr Aufträge geschafft sind, desto schwerer werden sie.
export function newMission(state) {
  const rand = () => nextRandom(state);
  const d = state.missionsDone;
  const maxLevel = Math.min(7, 3 + Math.floor(d / 2));
  const options = [
    () => {
      const level = 3 + Math.floor(rand() * (maxLevel - 2));
      return { kind: 'hand', level, reward: [0, 0, 0, 20, 25, 25, 45, 80][level] };
    },
    () => ({ kind: 'flush', suit: Math.floor(rand() * 4), reward: 40 }),
    () => {
      const n = d >= 4 && rand() < 0.4 ? 3 : 2;
      return { kind: 'combo', n, reward: n === 3 ? 70 : 30 };
    },
    () => {
      const n = 3 + Math.min(2, Math.floor(rand() * (1 + d / 3)));
      return { kind: 'streak', n, reward: [0, 0, 0, 30, 50, 80][n] };
    },
  ];
  return options[Math.floor(rand() * options.length)]();
}

export function missionText(mission) {
  switch (mission.kind) {
    case 'hand':
      return `${HANDS[mission.level].name} oder besser`;
    case 'flush':
      return `Flush in ${SUITS[mission.suit]}`;
    case 'combo':
      return `${mission.n} Reihen mit einem Zug`;
    default:
      return `Serie ${mission.n} erreichen`;
  }
}

function missionDone(state, lines) {
  const m = state.mission;
  if (!m || !lines.length) return false;
  if (m.kind === 'hand') return lines.some((l) => l.hand.level >= m.level);
  if (m.kind === 'flush') return lines.some((l) => l.flushSuit === m.suit);
  if (m.kind === 'combo') return lines.length >= m.n;
  return state.streak >= m.n;
}

// ---------- Züge ----------

// Vorschau für die Anzeige: welche Reihen würde dieser Zug füllen, und reicht die Hand?
export function previewPlacement(state, piece, x, y) {
  if (!canPlace(state.board, piece, x, y)) return null;
  const next = state.board.slice();
  const cells = piece.cells.map(([dx, dy], k) => {
    const i = idx(x + dx, y + dy);
    next[i] = piece.cards[k];
    return i;
  });
  return linesThrough(next, cells, requirementFor(state.lines).level);
}

export function placePiece(state, slot, x, y) {
  const piece = state.tray[slot];
  if (state.over || !piece || !canPlace(state.board, piece, x, y)) return null;

  const placed = piece.cells.map(([dx, dy], k) => {
    const i = idx(x + dx, y + dy);
    state.board[i] = piece.cards[k];
    return i;
  });
  state.tray[slot] = null;
  state.moves++;

  const required = requirementFor(state.lines).level;
  const full = linesThrough(state.board, placed, required);
  const lines = full.filter((line) => line.ok);
  const blocked = full.filter((line) => !line.ok);

  const removed = new Map(); // Index -> Karte, damit die Anzeige die verschwindenden Karten zeigen kann
  for (const line of lines) for (const i of line.cells) removed.set(i, state.board[i]);
  for (const i of removed.keys()) state.board[i] = null;

  let linePoints = 0;
  let chips = 0;
  for (const line of lines) {
    line.points = CELL_POINTS * SIZE * line.hand.mult;
    linePoints += line.points;
    chips += line.hand.mult;
    state.bestHand = Math.max(state.bestHand, line.hand.level);
  }

  if (lines.length) {
    state.streak++;
    state.grace = STREAK_GRACE;
    state.lines += lines.length;
  } else if (state.streak) {
    state.grace--;
    if (state.grace <= 0) state.streak = 0;
  }

  const combo = lines.length;
  const streakMult = lines.length ? streakMultiplier(state.streak) : 1;
  const tableClear = lines.length > 0 && state.board.every((c) => c === null);
  const points =
    placed.length + Math.round(linePoints * combo * streakMult) + (tableClear ? Math.round(TABLE_CLEAR_BONUS * streakMult) : 0);
  state.score += points;
  if (tableClear) chips += TABLE_CLEAR_CHIPS;

  let mission = null;
  if (missionDone(state, lines)) {
    mission = state.mission;
    chips += mission.reward;
    state.missionsDone++;
    state.mission = newMission(state);
  }
  state.chips += chips;

  const crumbled = syncLocked(state, true);

  const levelUp = requirementFor(state.lines).level > required;
  // "Fast!" – nur zeigen, wenn die verpasste Hand stärker gewesen wäre als alles, was dieser Zug geschafft hat
  const bestLevel = Math.max(-1, ...lines.map((l) => l.hand.level));
  const near = full.map((l) => l.near).filter((h) => h && h.level > bestLevel).sort((a, b) => b.level - a.level)[0] ?? null;

  let dealt = false;
  if (state.tray.every((p) => p === null)) {
    state.tray = dealTray(state.board, rngOf(state), requirementFor(state.lines).level);
    dealt = true;
  }
  updateOver(state);

  return {
    placed, lines, blocked, removed, combo, streak: state.streak, streakMult, tableClear, points, chips,
    mission, near, levelUp, crumbled, dealt, over: state.over,
  };
}

const lineKey = (line) => `${line.type}:${line.index}`;

// Hält die Liste der gesperrten Reihen aktuell. tick = ein Zug ist vergangen: Zähler runter, bei 0 zerbröselt die Reihe.
export function syncLocked(state, tick = false) {
  state.locked ??= {};
  const removed = new Map();
  const lines = [];
  const full = new Map(findFullLines(state.board).map((line) => [lineKey(line), line]));
  for (const key of Object.keys(state.locked)) if (!full.has(key)) delete state.locked[key];
  for (const [key, line] of full) {
    if (!(key in state.locked)) {
      state.locked[key] = LOCK_MOVES;
    } else if (tick && --state.locked[key] <= 0) {
      lines.push(line);
      for (const i of line.cells) removed.set(i, state.board[i]);
    }
  }
  for (const i of removed.keys()) state.board[i] = null;
  if (removed.size) {
    // Reihen, die durch das Zerbröseln nicht mehr voll sind, sind wieder frei
    const still = new Set(findFullLines(state.board).map(lineKey));
    for (const key of Object.keys(state.locked)) if (!still.has(key)) delete state.locked[key];
  }
  return removed.size ? { lines, removed } : null;
}

// Einmal pro Runde gratis drei neue Teile, wenn nichts mehr passt.
export function useFreeContinue(state) {
  if (state.freeContinue === false) return false;
  state.freeContinue = false;
  foldTray(state);
  return true;
}

// Spezialzug "Passen": drei neue Teile.
export function foldTray(state) {
  state.tray = dealTray(state.board, rngOf(state), requirementFor(state.lines).level);
  updateOver(state);
  return true;
}

// Spezialzug "Sprengen": alle gesperrten Reihen durch dieses Kästchen verschwinden (ohne Punkte).
export function blastAt(state, cell) {
  const lines = findFullLines(state.board).filter((line) => line.cells.includes(cell));
  if (!lines.length) return null;
  const removed = new Map();
  for (const line of lines) for (const i of line.cells) removed.set(i, state.board[i]);
  for (const i of removed.keys()) state.board[i] = null;
  syncLocked(state);
  updateOver(state);
  return { lines, removed };
}

// Spezialzug "Farbe tauschen": ein Teil bekommt eine andere Farbe (Joker bleiben Joker).
export function recolorPiece(state, slot, suit) {
  const piece = state.tray[slot];
  if (!piece || piece.s === suit) return false;
  piece.s = suit;
  piece.cards = piece.cards.map((c) => (c.j ? c : { r: c.r, s: suit }));
  updateOver(state);
  return true;
}

export const hasLockedLines = (state) => findFullLines(state.board).length > 0;
