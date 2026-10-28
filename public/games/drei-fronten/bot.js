// Computer-Gegner: probiert viele zufällige Züge aus, spielt sie im Kopf durch und nimmt den besten.
// Er sieht nur, was ein Mensch auch sehen würde: keine fremde Hand, keine verdeckten Karten im Nebelmoor.

import { CARD_BY_ID, FRONT_BY_ID } from './cards.js';
import { applyTurn, baseEnergy, cardCost, checkPlan, energy, frontWeight, GOAL, sideTotal, slotLimit, ZUEGE } from './engine.js';

export const LEVELS = {
  lehrling: { name: 'Lehrling', samples: 24, noise: 0.18, sloppy: 0.25 },
  geselle: { name: 'Geselle', samples: 90, noise: 0.08, sloppy: 0.1 },
  kriegsherr: { name: 'Kriegsherr', samples: 320, noise: 0, sloppy: 0 },
};

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Was der Bot über das Feld weiß: verdeckte Karten des Gegners im Nebel werden zu einer Durchschnittskarte.
function knownState(state, p) {
  const copy = structuredClone(state);
  copy.rng = (Math.random() * 2 ** 32) >>> 0;
  copy.fronts.forEach((front) => {
    if (FRONT_BY_ID[front.id].rule !== 'nebel') return;
    front.sides[1 - p] = front.sides[1 - p].map((card) => ({ ...card, id: 'eisgeist', mod: 0 }));
  });
  copy.players[1 - p].hand = [];
  return copy;
}

// Geschätzte Chance, die Runde zu gewinnen (0–1).
export function roundChance(state, p) {
  const e = 1 - p;
  // Im letzten Zug kommt nur noch die gleichzeitige Antwort des Gegners, davor ist noch alles offen.
  const last = state.zug >= ZUEGE;
  const enemyReserve = state.zug === 1 ? 0 : baseEnergy(state) * (last ? 0.45 : 0.3);
  const sigma = last ? 3 : state.zug === 1 ? 5 : 4;
  const probs = state.fronts.map((front, fi) => {
    const own = front.sides[p].length ? sideTotal(state, fi, p) : 0;
    const enemy = front.sides[e].length ? sideTotal(state, fi, e) : 0;
    let margin;
    if (front.sides[p].length && !front.sides[e].length) margin = Math.max(own, 2) + 2;
    else if (!front.sides[p].length && front.sides[e].length) margin = -(Math.max(enemy, 2) + 2);
    else if (!front.sides[p].length) margin = 0;
    else margin = FRONT_BY_ID[front.id].rule === 'spiegel' ? enemy - own : own - enemy;
    return { q: sigmoid((margin - enemyReserve) / sigma), w: frontWeight(front) };
  });
  let chance = 0;
  for (let mask = 0; mask < 8; mask++) {
    let prob = 1;
    let mine = 0;
    let theirs = 0;
    probs.forEach(({ q, w }, i) => {
      const won = (mask >> i) & 1;
      prob *= won ? q : 1 - q;
      if (won) mine += w; else theirs += w;
    });
    chance += prob * (mine > theirs ? 1 : mine === theirs ? 0.5 : 0);
  }
  return chance;
}

function randomPlan(state, p, random) {
  const hand = [...state.players[p].hand].sort(() => random() - 0.5);
  const plan = [];
  let left = energy(state, p);
  const slots = state.fronts.map((front) => front.sides[p].length);
  for (const card of hand) {
    if (random() < 0.12) continue;
    const def = CARD_BY_ID[card.id];
    const fronts = [0, 1, 2].filter((fi) => cardCost(state, card.id, fi) <= left &&
      (def.type !== 'wesen' || slots[fi] < slotLimit(state.fronts[fi])));
    if (!fronts.length) continue;
    const fi = fronts[Math.floor(random() * fronts.length)];
    left -= cardCost(state, card.id, fi);
    if (def.type === 'wesen') slots[fi]++;
    plan.push({ uid: card.uid, front: fi });
  }
  return plan;
}

function evaluate(known, p, plan) {
  const sim = structuredClone(known);
  const plans = [];
  plans[p] = plan;
  plans[1 - p] = [];
  applyTurn(sim, plans, { frames: false });
  // Kleiner Bonus für eingesetzte Energie, damit der Bot nicht unnötig spart.
  return { chance: roundChance(sim, p), spent: plan.length };
}

// boldness (0 bis 0,3): wie gern der Gegner trommelt und blufft – je nach Persönlichkeit.
export function planBot(state, p, levelId = 'kriegsherr', random = Math.random, boldness = 0) {
  const level = LEVELS[levelId] ?? LEVELS.kriegsherr;
  const known = knownState(state, p);
  let best = { plan: [], score: -1, chance: 0 };
  for (let i = 0; i < level.samples; i++) {
    const plan = i === 0 ? [] : randomPlan(known, p, random);
    if (!checkPlan(known, p, plan).ok) continue;
    const { chance, spent } = evaluate(known, p, plan);
    const score = chance + spent * 0.004 + (level.noise ? (random() - 0.5) * level.noise : 0);
    if (score > best.score) best = { plan, score, chance };
  }
  // Der Lehrling vergisst manchmal eine Karte.
  if (level.sloppy && best.plan.length > 1 && random() < level.sloppy) best.plan = best.plan.slice(0, -1);
  return { plan: best.plan, chance: best.chance, drum: wantsDrum(state, p, best.chance, levelId, random, boldness) };
}

function wantsDrum(state, p, chance, levelId, random, boldness = 0) {
  if (state.drumUsed[p]) return false;
  if (levelId === 'lehrling') return state.zug === ZUEGE && chance > 0.8 - boldness && random() < 0.5 + boldness;
  if (state.zug === ZUEGE) return chance > 0.72 - boldness || (chance > 0.45 && random() < 0.08 + boldness);
  return chance > 0.88 - boldness;
}

// Antwort auf die Trommel des Gegners: mitgehen (true) oder aufgeben (false).
export function acceptDrum(state, p, chance, levelId = 'kriegsherr', boldness = 0) {
  if (state.banners[1 - p] + state.stakes >= (state.goal ?? GOAL)) return true;
  return chance >= (levelId === 'lehrling' ? 0.28 : 0.36) - boldness;
}
