// Spielregeln von Drei Fronten – ohne Bildschirm, damit Tests und Computer-Gegner sie nutzen können.
// Der Spielzustand ist ein einfaches Objekt (mit structuredClone kopierbar), der Zufall ist an einen Startwert gebunden.
//
// Ablauf einer Runde: 3 Fronten werden gezogen, dann 3 Züge (Aufmarsch, Verstärkung, Finale).
// In jedem Zug planen beide verdeckt, dann wird aufgedeckt (applyTurn). Nach dem letzten Zug wird gewertet (scoreRound).

import { CARD_BY_ID, FRONT_BY_ID, FRONTS } from './cards.js';

export const GOAL = 4;
export const MAX_ROUNDS = 9;
export const HAND_LIMIT = 9;
export const START_HAND = 5;
export const MAX_ENERGY = 8;
// Züge pro Runde: Aufmarsch, Verstärkung, Finale – danach wird gewertet.
export const ZUEGE = 3;
export const ZUG_NAMEN = ['Aufmarsch', 'Verstärkung', 'Finale'];

// ---------- Zufall ----------

export function nextRandom(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle(state, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------- Aufbau ----------

// Sonderregeln (z. B. aus der Kampagne): goal = Banner zum Sieg, banners = Startbanner,
// fixedFront = diese Front ist jede Runde dabei, extraEnergy = Dauer-Bonus je Spieler.
export function createGame({ seed = 1, decks, names = ['Du', 'Gegner'], goal = GOAL, banners = [0, 0], fixedFront = null, extraEnergy = [0, 0] }) {
  const state = {
    rng: seed >>> 0,
    round: 0,
    zug: 1,
    phase: 'plan',
    goal,
    fixedFront: FRONT_BY_ID[fixedFront] ? fixedFront : null,
    extraEnergy: [...extraEnergy],
    banners: [...banners],
    stakes: 1,
    drumUsed: [false, false],
    energyBonus: [0, 0],
    initiative: 0,
    winner: null,
    nextUid: 1,
    lastFronts: [],
    players: decks.map((deck, index) => ({ name: names[index], deck: [...deck], hand: [], discard: [] })),
    fronts: [],
  };
  for (const player of state.players) shuffle(state, player.deck);
  for (let p = 0; p < 2; p++) draw(state, p, START_HAND);
  startRound(state);
  return state;
}

export function draw(state, p, count) {
  const player = state.players[p];
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (!player.deck.length) {
      if (!player.discard.length) break;
      player.deck = shuffle(state, player.discard);
      player.discard = [];
    }
    if (player.hand.length >= HAND_LIMIT) break;
    player.hand.push({ uid: state.nextUid++, id: player.deck.pop() });
    drawn++;
  }
  return drawn;
}

export function startRound(state) {
  for (const front of state.fronts) {
    for (let p = 0; p < 2; p++) {
      for (const card of front.sides[p]) if (!CARD_BY_ID[card.id].token) discardCard(state, card);
    }
  }
  state.round++;
  state.zug = 1;
  state.phase = 'plan';
  state.stakes = 1;
  state.drumUsed = [false, false];
  state.initiative = (state.round + 1) % 2;
  // Fronten der letzten Runde nicht sofort wiederholen.
  const pool = shuffle(state, FRONTS.filter((front) => !state.lastFronts.includes(front.id) && front.id !== state.fixedFront).map((front) => front.id));
  const ids = state.fixedFront ? shuffle(state, [state.fixedFront, ...pool.slice(0, 2)]) : pool.slice(0, 3);
  state.fronts = ids.map((id) => ({ id, sides: [[], []], shield: [false, false] }));
  state.lastFronts = state.fronts.map((front) => front.id).filter((id) => id !== state.fixedFront);
  if (state.round > 1) for (let p = 0; p < 2; p++) draw(state, p, 3);
}

export function nextZug(state) {
  state.zug++;
  state.phase = 'plan';
  for (let p = 0; p < 2; p++) draw(state, p, 2);
}

function discardCard(state, card) {
  if (CARD_BY_ID[card.id].token) return;
  state.players[card.owner].discard.push(card.id);
}

// ---------- Werte ----------

export function baseEnergy(state) {
  return Math.min(MAX_ENERGY, state.round + 3);
}

export function energy(state, p) {
  return baseEnergy(state) + state.energyBonus[p] + (state.extraEnergy?.[p] ?? 0);
}

export function slotLimit(front) {
  return FRONT_BY_ID[front.id].rule === 'eng' ? 2 : 3;
}

export function cardCost(state, cardId, frontIndex) {
  const def = CARD_BY_ID[cardId];
  const front = state.fronts[frontIndex];
  if (def.type === 'aktion' && front && FRONT_BY_ID[front.id].rule === 'turm') return Math.max(0, def.cost - 1);
  return def.cost;
}

// Rohstärke ohne Boni der Umgebung (für Mimik).
function rawPower(card) {
  return CARD_BY_ID[card.id].power + card.mod;
}

export function power(state, frontIndex, card) {
  const def = CARD_BY_ID[card.id];
  const front = state.fronts[frontIndex];
  const rule = FRONT_BY_ID[front.id];
  const own = front.sides[card.owner];
  const enemy = front.sides[1 - card.owner];
  let value = def.power + card.mod;
  if (def.ability === 'mimik') {
    const copies = enemy.filter((other) => CARD_BY_ID[other.id].ability !== 'mimik').map(rawPower);
    value = (copies.length ? Math.max(...copies) : def.power) + card.mod;
  }
  if (rule.element && def.element === rule.element) value += 2;
  if (rule.rule === 'blutmond') value += 1;
  if (rule.rule === 'ruinen' && def.cost >= 1 && def.cost <= 2) value += 2;
  if (rule.rule === 'frost' && def.element !== 'wasser' && def.ability !== 'stein') value -= 1;
  for (const other of own) if (other !== card && CARD_BY_ID[other.id].ability === 'huet') value += 1;
  if (def.ability === 'allein' && own.length === 1) value += 3;
  if (def.ability === 'wurzel') value += enemy.length;
  if (def.ability === 'schwarm') value += own.filter((other) => other !== card && CARD_BY_ID[other.id].element === 'wasser').length;
  if (def.ability !== 'stein') value -= enemy.filter((other) => CARD_BY_ID[other.id].ability === 'dornen').length;
  for (const other of state.fronts) {
    for (const ally of other.sides[card.owner]) if (ally !== card && CARD_BY_ID[ally.id].ability === 'weltenbaum') value += 1;
  }
  return Math.max(0, value);
}

export function sideTotal(state, frontIndex, p) {
  return state.fronts[frontIndex].sides[p].reduce((sum, card) => sum + power(state, frontIndex, card), 0);
}

// Gewinner einer Front: 0, 1 oder null (Gleichstand / leer).
export function frontWinner(state, frontIndex) {
  const front = state.fronts[frontIndex];
  const counts = front.sides.map((side) => side.length);
  if (!counts[0] && !counts[1]) return null;
  if (!counts[0]) return 1;
  if (!counts[1]) return 0;
  const totals = [sideTotal(state, frontIndex, 0), sideTotal(state, frontIndex, 1)];
  if (totals[0] === totals[1]) return null;
  const higher = totals[0] > totals[1] ? 0 : 1;
  return FRONT_BY_ID[front.id].rule === 'spiegel' ? 1 - higher : higher;
}

export function frontWeight(front) {
  return (FRONT_BY_ID[front.id].rule === 'hort' ? 2 : 1) * (front.double ? 2 : 1);
}

// ---------- Planen ----------

// plan = [{ uid, front }] in Legereihenfolge.
export function checkPlan(state, p, plan) {
  const hand = state.players[p].hand;
  const used = new Set();
  const slots = state.fronts.map((front) => front.sides[p].length);
  let cost = 0;
  for (const step of plan) {
    const card = hand.find((entry) => entry.uid === step.uid);
    if (!card || used.has(step.uid)) return { ok: false, error: 'Karte nicht auf der Hand.' };
    if (!Number.isInteger(step.front) || step.front < 0 || step.front > 2) return { ok: false, error: 'Unbekannte Front.' };
    used.add(step.uid);
    cost += cardCost(state, card.id, step.front);
    if (CARD_BY_ID[card.id].type === 'wesen') {
      slots[step.front]++;
      if (slots[step.front] > slotLimit(state.fronts[step.front])) return { ok: false, error: 'Diese Front ist voll.' };
    }
  }
  if (cost > energy(state, p)) return { ok: false, error: 'Nicht genug Energie.' };
  return { ok: true, cost };
}

export function planCost(state, p, plan) {
  return plan.reduce((sum, step) => {
    const card = state.players[p].hand.find((entry) => entry.uid === step.uid);
    return sum + (card ? cardCost(state, card.id, step.front) : 0);
  }, 0);
}

// ---------- Kriegstrommel ----------

// Gibt zurück, was passiert: { fold: Spieler, der aufgibt | null }.
// accept[p] = ob Spieler p eine gegnerische Trommel annimmt (nur wichtig, wenn genau einer trommelt).
export function resolveDrums(state, drums, accept) {
  const drummers = [0, 1].filter((p) => drums[p] && !state.drumUsed[p]);
  for (const p of drummers) state.drumUsed[p] = true;
  if (drummers.length === 1) {
    const other = 1 - drummers[0];
    if (!accept[other]) {
      endRoundByFold(state, other);
      return { fold: other };
    }
  }
  state.stakes += drummers.length;
  return { fold: null, raised: drummers.length };
}

function endRoundByFold(state, folder) {
  const winner = 1 - folder;
  state.banners[winner] += state.stakes;
  state.lastResult = { fold: folder, winner, stakes: state.stakes, fronts: [], points: [0, 0] };
  finishRound(state);
}

// ---------- Aufdecken ----------

export function view(state) {
  return state.fronts.map((front, fi) => ({
    id: front.id,
    weight: frontWeight(front),
    shield: [...front.shield],
    sides: front.sides.map((side) => side.map((card) => ({
      uid: card.uid, id: card.id, owner: card.owner, mod: card.mod, power: power(state, fi, card), zug: card.zug,
    }))),
    totals: [sideTotal(state, fi, 0), sideTotal(state, fi, 1)],
    winner: frontWinner(state, fi),
  }));
}

function protectedFrom(state, card, frontIndex, kind) {
  if (state.fronts[frontIndex].shield[card.owner]) return true;
  return kind === 'weaken' && CARD_BY_ID[card.id].ability === 'stein';
}

function locate(state, uid) {
  for (let fi = 0; fi < 3; fi++) {
    for (let p = 0; p < 2; p++) {
      const index = state.fronts[fi].sides[p].findIndex((card) => card.uid === uid);
      if (index >= 0) return { fi, p, index };
    }
  }
  return null;
}

export function applyTurn(state, plans, options = {}) {
  const frames = [];
  const log = (text, extra = {}) => { if (options.frames !== false) frames.push({ text, view: view(state), ...extra }); };
  const nameOf = (id) => CARD_BY_ID[id].name;
  const frontName = (fi) => FRONT_BY_ID[state.fronts[fi].id].name;

  const weaken = (target, fi, amount, source) => {
    if (protectedFrom(state, target, fi, 'weaken')) {
      log(`${nameOf(target.id)} ist geschützt.`, { focus: target.uid, float: '🛡️', source });
      return;
    }
    target.mod -= amount;
    log(`${nameOf(target.id)} −${amount}`, { focus: target.uid, float: `−${amount}`, bad: true, source });
  };
  const boost = (target, amount, source) => {
    target.mod += amount;
    log(`${nameOf(target.id)} +${amount}`, { focus: target.uid, float: `+${amount}`, source });
  };
  const destroy = (target, fi, source) => {
    if (protectedFrom(state, target, fi, 'destroy')) {
      log(`${nameOf(target.id)} ist geschützt.`, { focus: target.uid, float: '🛡️', source });
      return;
    }
    const side = state.fronts[fi].sides[target.owner];
    side.splice(side.indexOf(target), 1);
    const def = CARD_BY_ID[target.id];
    if (def.ability === 'phoenix' && state.players[target.owner].hand.length < HAND_LIMIT) {
      state.players[target.owner].hand.push({ uid: state.nextUid++, id: target.id });
      log(`${def.name} verbrennt – und kehrt auf die Hand zurück!`, { float: '🔥', source });
    } else {
      discardCard(state, target);
      log(`${def.name} wird zerstört!`, { float: '💀', bad: true, source });
    }
  };
  const strongest = (fi, p) => {
    const side = state.fronts[fi].sides[p];
    return side.reduce((best, card) => (!best || power(state, fi, card) > power(state, fi, best) ? card : best), null);
  };
  const weakest = (fi, p) => {
    const side = state.fronts[fi].sides[p];
    return side.reduce((best, card) => (!best || power(state, fi, card) < power(state, fi, best) ? card : best), null);
  };

  // Karten von der Hand nehmen.
  const queue = [];
  for (let p = 0; p < 2; p++) {
    const check = checkPlan(state, p, plans[p] ?? []);
    if (!check.ok) throw new Error(`Ungültiger Zug von Spieler ${p}: ${check.error}`);
    state.energyBonus[p] = 0;
    for (const step of plans[p] ?? []) {
      const hand = state.players[p].hand;
      const card = hand.splice(hand.findIndex((entry) => entry.uid === step.uid), 1)[0];
      queue.push({ p, uid: card.uid, id: card.id, front: step.front });
    }
  }

  // Reihenfolge: erst alle Wesen, dann Schilde, dann übrige Aktionen. Innerhalb abwechselnd, Initiative zuerst.
  const order = (list) => {
    const lanes = [state.initiative, 1 - state.initiative].map((p) => list.filter((entry) => entry.p === p));
    const result = [];
    for (let i = 0; i < Math.max(lanes[0].length, lanes[1].length); i++) {
      if (lanes[0][i]) result.push(lanes[0][i]);
      if (lanes[1][i]) result.push(lanes[1][i]);
    }
    return result;
  };
  const isType = (entry, type) => CARD_BY_ID[entry.id].type === type;
  const wesen = order(queue.filter((entry) => isType(entry, 'wesen')));
  const shields = order(queue.filter((entry) => CARD_BY_ID[entry.id].ability === 'schild'));
  const actions = order(queue.filter((entry) => isType(entry, 'aktion') && CARD_BY_ID[entry.id].ability !== 'schild'));

  for (const entry of wesen) {
    const card = { uid: entry.uid, id: entry.id, owner: entry.p, mod: 0, zug: state.zug };
    state.fronts[entry.front].sides[entry.p].push(card);
    log(`${state.players[entry.p].name}: ${nameOf(entry.id)} → ${frontName(entry.front)}`, { focus: card.uid, reveal: true, owner: entry.p, front: entry.front });
    revealWesen(card, entry.front);
  }
  for (const entry of [...shields, ...actions]) {
    log(`${state.players[entry.p].name}: ${nameOf(entry.id)} ⚡ ${frontName(entry.front)}`, { action: entry.id, owner: entry.p, front: entry.front });
    runAction(entry);
    state.players[entry.p].discard.push(entry.id);
  }

  if (state.zug === 1) {
    state.fronts.forEach((front, fi) => {
      if (FRONT_BY_ID[front.id].rule !== 'lawine') return;
      const all = [...front.sides[0], ...front.sides[1]];
      if (!all.length) return;
      const victim = all.reduce((low, card) => (power(state, fi, card) < power(state, fi, low) ? card : low));
      log(`Lawine am ${frontName(fi)}!`, { focus: victim.uid, float: '🏔️' });
      destroy(victim, fi, 'lawine');
    });
  }
  return frames;

  function revealWesen(card, fi) {
    const def = CARD_BY_ID[card.id];
    const p = card.owner;
    const e = 1 - p;
    const front = state.fronts[fi];
    const others = front.sides[p].filter((other) => other !== card);
    switch (def.ability) {
      case 'feuerrudel': {
        const count = others.filter((other) => CARD_BY_ID[other.id].element === 'feuer').length;
        if (count) boost(card, count, card.uid);
        break;
      }
      case 'glut': {
        const target = weakest(fi, e);
        if (target) weaken(target, fi, 1, card.uid);
        break;
      }
      case 'drachenfeuer':
        for (const target of [...front.sides[e]]) weaken(target, fi, 1, card.uid);
        for (const other of others) if (CARD_BY_ID[other.id].element === 'feuer') boost(other, 2, card.uid);
        break;
      case 'ziehen':
        if (draw(state, p, 1)) log(`${state.players[p].name} zieht 1 Karte.`, { source: card.uid });
        break;
      case 'krake': {
        const target = strongest(fi, e);
        if (target) weaken(target, fi, 2, card.uid);
        break;
      }
      case 'sporen':
        for (const other of others) boost(other, 1, card.uid);
        break;
      case 'rueckenwind':
        state.energyBonus[p] += 1;
        log(`Rückenwind: +1 Energie im nächsten Zug.`, { focus: card.uid, float: '+⚡', source: card.uid });
        break;
      case 'sturzflug': {
        const side = front.sides[e];
        if (side.length) weaken(side[Math.floor(nextRandom(state) * side.length)], fi, 1, card.uid);
        break;
      }
      case 'donner':
        for (const target of [...front.sides[e]]) weaken(target, fi, 1, card.uid);
        break;
      case 'dschinn':
        state.fronts.forEach((other, ofi) => { if (ofi !== fi) for (const ally of other.sides[p]) boost(ally, 1, card.uid); });
        break;
      case 'lauer':
        if (front.sides[e].length) boost(card, 2, card.uid);
        break;
      case 'fernfeuer': {
        const targets = state.fronts.flatMap((other, ofi) => (ofi === fi ? [] : other.sides[e].map((target) => ({ target, ofi }))));
        if (targets.length) {
          const pick = targets[Math.floor(nextRandom(state) * targets.length)];
          weaken(pick.target, pick.ofi, 2, card.uid);
        }
        break;
      }
      case 'locken': {
        const target = strongest(fi, e);
        const goals = [0, 1, 2].filter((ofi) => ofi !== fi && state.fronts[ofi].sides[e].length < slotLimit(state.fronts[ofi]));
        if (!target || !goals.length) break;
        if (protectedFrom(state, target, fi, 'destroy')) {
          log(`${nameOf(target.id)} ist geschützt.`, { focus: target.uid, float: '🛡️' });
          break;
        }
        const goal = goals[Math.floor(nextRandom(state) * goals.length)];
        front.sides[e].splice(front.sides[e].indexOf(target), 1);
        state.fronts[goal].sides[e].push(target);
        log(`${nameOf(target.id)} wird zu ${frontName(goal)} gelockt!`, { focus: target.uid, float: '🎶' });
        break;
      }
      case 'frostwelle':
        state.fronts.forEach((other, ofi) => { for (const target of [...other.sides[e]]) weaken(target, ofi, 1, card.uid); });
        break;
      case 'sprung': {
        const goals = [0, 1, 2].filter((ofi) => ofi !== fi && state.fronts[ofi].sides[p].length < slotLimit(state.fronts[ofi]));
        if (!goals.length) break;
        const gap = (ofi) => sideTotal(state, ofi, e) - sideTotal(state, ofi, p);
        const goal = goals.reduce((best, ofi) => (gap(ofi) > gap(best) ? ofi : best));
        if (gap(goal) <= gap(fi)) break;
        front.sides[p].splice(front.sides[p].indexOf(card), 1);
        state.fronts[goal].sides[p].push(card);
        log(`${def.name} fliegt zu ${frontName(goal)}!`, { focus: card.uid, float: '🪽' });
        break;
      }
      case 'schmied':
        for (const other of others) if (power(state, fi, other) <= 3) boost(other, 2, card.uid);
        break;
      default:
        break;
    }
  }

  function runAction(entry) {
    const p = entry.p;
    const e = 1 - p;
    const fi = entry.front;
    const front = state.fronts[fi];
    const fizzle = () => log(`… aber hier gibt es kein Ziel.`);
    switch (CARD_BY_ID[entry.id].ability) {
      case 'blitz': {
        const target = strongest(fi, e);
        if (target) weaken(target, fi, 3); else fizzle();
        break;
      }
      case 'feuerball': {
        const target = weakest(fi, e);
        if (target) destroy(target, fi); else fizzle();
        break;
      }
      case 'rune': {
        const target = weakest(fi, p);
        if (target) boost(target, 3); else fizzle();
        break;
      }
      case 'schild':
        front.shield[p] = true;
        log(`Ein Schild legt sich über ${frontName(fi)}.`, { float: '🛡️' });
        break;
      case 'teleport': {
        const mover = strongest(fi, p);
        const targets = [0, 1, 2].filter((ofi) => ofi !== fi && state.fronts[ofi].sides[p].length < slotLimit(state.fronts[ofi]));
        if (!mover || !targets.length) { fizzle(); break; }
        const gap = (ofi) => sideTotal(state, ofi, e) - sideTotal(state, ofi, p);
        const goal = targets.reduce((best, ofi) => (gap(ofi) > gap(best) ? ofi : best));
        front.sides[p].splice(front.sides[p].indexOf(mover), 1);
        state.fronts[goal].sides[p].push(mover);
        log(`${nameOf(mover.id)} springt zu ${frontName(goal)}!`, { focus: mover.uid, float: '🌀' });
        break;
      }
      case 'wolf':
        if (front.sides[p].length >= slotLimit(front)) { log('… aber die Front ist voll.'); break; }
        front.sides[p].push({ uid: state.nextUid++, id: 'geisterwolf', owner: p, mod: 0, zug: state.zug });
        log('Ein Geisterwolf erscheint!', { float: '🐺' });
        break;
      case 'schrei':
        state.fronts.forEach((other) => { for (const ally of other.sides[p]) boost(ally, 1); });
        break;
      case 'beben':
        for (const target of [...front.sides[0], ...front.sides[1]]) weaken(target, fi, 2);
        break;
      case 'raub':
        log(`${state.players[p].name} zieht ${draw(state, p, 2)} Karten.`);
        break;
      case 'flut':
        for (const target of [...front.sides[e]]) weaken(target, fi, 2);
        if (!front.sides[e].length) fizzle();
        break;
      case 'meteor':
        state.fronts.forEach((other, ofi) => { for (const target of [...other.sides[e]]) weaken(target, ofi, 2); });
        break;
      case 'regen':
        for (const ally of front.sides[p]) boost(ally, 2);
        if (!front.sides[p].length) fizzle();
        break;
      case 'griff': {
        const targets = front.sides[e].filter((target) => power(state, fi, target) <= 2);
        if (!targets.length) { fizzle(); break; }
        destroy(targets.reduce((low, target) => (power(state, fi, target) < power(state, fi, low) ? target : low)), fi);
        break;
      }
      case 'zeitriss':
        front.double = true;
        log(`Die Zeit reißt auf: ${frontName(fi)} zählt doppelt!`, { float: '⏳' });
        break;
      default:
        break;
    }
  }
}

// ---------- Wertung ----------

export function roundScore(state) {
  const fronts = state.fronts.map((front, fi) => ({
    totals: [sideTotal(state, fi, 0), sideTotal(state, fi, 1)],
    winner: frontWinner(state, fi),
    weight: frontWeight(front),
  }));
  const points = [0, 0];
  for (const front of fronts) if (front.winner !== null) points[front.winner] += front.weight;
  let winner = null;
  if (points[0] !== points[1]) winner = points[0] > points[1] ? 0 : 1;
  else {
    const sums = [0, 1].map((p) => fronts.reduce((sum, front) => sum + front.totals[p], 0));
    if (sums[0] !== sums[1]) winner = sums[0] > sums[1] ? 0 : 1;
  }
  return { fronts, points, winner };
}

export function scoreRound(state) {
  const result = { ...roundScore(state), stakes: state.stakes, fold: null };
  if (result.winner !== null) state.banners[result.winner] += state.stakes;
  state.lastResult = result;
  finishRound(state);
  return result;
}

function finishRound(state) {
  const [a, b] = state.banners;
  const goal = state.goal ?? GOAL;
  if (a >= goal || b >= goal || state.round >= MAX_ROUNDS) {
    state.phase = 'over';
    state.winner = a === b ? null : a > b ? 0 : 1;
  } else {
    state.phase = 'roundEnd';
  }
}
