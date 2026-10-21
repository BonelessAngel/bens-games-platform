// Anzeige und Bedienung von Royal Blocks.

import {
  POWER_COSTS, SIZE, STREAK_GRACE, blastAt, canPlace, createGame, findFullLines, fitsAnywhere, foldTray, hasLockedLines, idx,
  missionText, placePiece, previewPlacement, recolorPiece, requirementFor, streakMultiplier, updateOver, useFreeContinue,
} from './game.js';
import {
  GIFT_DAYS, JACKPOT_GROWTH, JACKPOT_START, SCRATCH_EVERY, chestReward, dailyGift, emptyStats, jackpotWin, levelFromXp, levelReward,
  praiseFor, recordMove, recordRound, scratchPrize, xpForRound,
} from './progress.js';
import { createScratchCard } from './scratch.js';
import { HANDS, SUITS, rankLabel } from './poker.js';
import {
  setMusicEnabled, setMusicIntensity, setSoundEnabled, setVibrationEnabled, sounds, startMusic, stopMusic, unlockAudio, vibrate,
} from './audio.js';
import { burst, chips as chipBurst, initFx, suitColor } from './fx.js';
import { load, save } from './storage.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const version = root.dataset.version;

const els = {
  app: $('app'),
  board: $('board'),
  tray: $('tray'),
  slots: [...document.querySelectorAll('.slot')],
  drag: $('drag'),
  score: $('score'),
  best: $('best'),
  bestLabel: $('best-label'),
  streak: $('streak'),
  preview: $('preview'),
  banner: $('banner'),
  req: $('req'),
  reqHand: $('req-hand'),
  reqNext: $('req-next'),
  mission: $('mission'),
  missionText: $('mission-text'),
  missionReward: $('mission-reward'),
  chips: $('chips'),
  powers: [...document.querySelectorAll('.powers .power')],
};

// Designs: Farbwelten (CSS-Variablen) und Kachel-Stile; Preise in Chips.
const THEMES = [
  { id: 'neon', name: 'Neon', price: 0, color: '#0d0420' },
  { id: 'gold', name: 'Gold-Casino', price: 1500, color: '#041a12' },
  { id: 'ice', name: 'Eis', price: 3000, color: '#06182a' },
  { id: 'retro', name: 'Retro-Arcade', price: 5000, color: '#000000' },
];
const TILE_STYLES = [
  { id: 'standard', name: 'Standard', price: 0 },
  { id: 'glass', name: 'Glas', price: 1000 },
  { id: 'pixel', name: 'Pixel', price: 2000 },
  { id: 'chip', name: 'Chip', price: 4000 },
];

// ---------- Gespeicherte Daten ----------

const settings = {
  sound: true, music: true, vibration: true, seenHelp: false, theme: 'neon', tiles: 'standard', mode: 'free',
  ...load('settings', {}),
};
const saveSettings = () => save('settings', settings);
let wallet = Math.max(0, Number(load('chips', 0)) || 0);
let xp = Math.max(0, Number(load('xp', 0)) || 0);
let jackpot = Math.max(JACKPOT_START, Number(load('jackpot', JACKPOT_START)) || JACKPOT_START);
const stats = { ...emptyStats(), ...load('stats', {}) };
let scratchReady = Boolean(load('scratch-ready', false));
let returnTo = 'menu'; // wohin "Zurück" aus Designs/Statistik führt
const owned = new Set(load('owned', ['neon', 'standard']));
owned.add('neon').add('standard');

setSoundEnabled(settings.sound);
setVibrationEnabled(settings.vibration);
setMusicEnabled(settings.music);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayLabel = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
// gleicher Tag → gleicher Startwert für alle (FNV-1a über das Datum)
function daySeed(day) {
  let h = 0x811c9dc5;
  for (const ch of `royal-blocks-${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}
function randomSeed() {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

const saveKey = (mode) => (mode === 'daily' ? 'daily' : 'game');

function freshGame(mode) {
  return mode === 'daily' ? createGame(daySeed(today()), 'daily', today()) : createGame(randomSeed(), 'free');
}

function loadGame(mode) {
  const saved = load(saveKey(mode), null);
  const valid =
    saved && Array.isArray(saved.board) && saved.board.length === SIZE * SIZE && Array.isArray(saved.tray) &&
    typeof saved.rng === 'number' && saved.mission && (mode !== 'daily' || saved.day === today());
  if (!valid) return null;
  updateOver(saved);
  return saved;
}

function getBest(mode) {
  if (mode === 'daily') {
    const d = load('daily-best', null);
    return d && d.day === today() ? d.score : 0;
  }
  return Number(load('best', 0)) || 0;
}
function setBest(mode, score) {
  if (mode === 'daily') save('daily-best', { day: today(), score });
  else save('best', score);
}

let mode = settings.mode === 'daily' ? 'daily' : 'free';
let state = loadGame(mode) ?? freshGame(mode);
let best = getBest(mode);
let bestAtStart = best;
let shownScore = state.score;

function persist() {
  save(saveKey(mode), state);
}

function addChips(n) {
  wallet += n;
  save('chips', wallet);
  renderWallet();
}
function spendChips(n) {
  if (wallet < n) return false;
  wallet -= n;
  save('chips', wallet);
  renderWallet();
  return true;
}

// ---------- Größe ----------

let cell = 40;
let gap = 3;

// Handy und Tablet hochkant: alles untereinander. Breite Bildschirme quer (z. B. iPad): Feld links, Rest rechts.
function layout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const wide = W >= 900 && W > H * 1.15;
  const tablet = W >= 700;
  els.app.classList.toggle('wide', wide);
  root.classList.toggle('tablet', tablet);
  gap = W < 380 ? 2 : tablet ? 4 : 3;
  let pieceSize;
  if (wide) {
    const side = Math.round(Math.min(440, Math.max(340, W * 0.32)));
    const byHeight = (H - 48 - 2 - 9 * gap) / 8;
    const byWidth = (W - side - 80 - 2 - 9 * gap) / 8;
    cell = Math.max(28, Math.floor(Math.min(byHeight, byWidth, 100)));
    root.style.setProperty('--side', `${side}px`);
    // Teile stehen rechts untereinander: jedes Teil (bis 5 Kästchen) muss in ein Drittel der Ablage passen
    const trayHeight = els.tray.getBoundingClientRect().height || H / 2;
    pieceSize = Math.floor(Math.min(cell * 0.6, (side - 24) / 5.3, (trayHeight / 3 - 10) / 5.3));
  } else {
    const w = Math.min(W, tablet ? 780 : 560) - 24;
    // Kopfzeile, Mindesthand + Auftrag, Vorschau, Spezialzüge, Abstände
    const h = H - (tablet ? 74 : 60) - (tablet ? 58 : 50) - 26 - (tablet ? 50 : 42) - 8 - 30;
    const byWidth = (w - 2 - 9 * gap) / 8;
    const byHeight = (h - 2 - 9 * gap) / 11.2; // 8 Feld-Reihen + Ablage
    cell = Math.max(22, Math.floor(Math.min(byWidth, byHeight, tablet ? 92 : 60)));
    pieceSize = Math.floor(cell * 0.56);
  }
  root.style.setProperty('--cell', `${cell}px`);
  root.style.setProperty('--gap', `${gap}px`);
  root.style.setProperty('--piece', `${pieceSize}px`);
}

// ---------- Darstellung ----------

function tile(card, style = settings.tiles) {
  const el = document.createElement('div');
  el.className = card.j ? `tile joker t-${style}` : `tile s${card.s} t-${style}${card.g ? ' golden' : ''}`;
  const r = document.createElement('span');
  r.className = 'r';
  r.textContent = card.j ? '★' : rankLabel(card.r);
  const s = document.createElement('span');
  s.className = 's';
  s.textContent = card.j ? 'JOKER' : SUITS[card.s];
  el.append(r, s);
  return el;
}

const cellEls = [];
function buildBoard() {
  for (let i = 0; i < SIZE * SIZE; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.i = String(i);
    els.board.append(el);
    cellEls.push(el);
  }
}

const cardKey = (card) => (card ? (card.j ? 'j' : `${card.r}${card.s}${card.g ? 'g' : ''}`) + settings.tiles : '');

function renderBoard(popCells = []) {
  state.board.forEach((card, i) => {
    const el = cellEls[i];
    const key = cardKey(card);
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.replaceChildren();
    if (card) {
      const t = tile(card);
      if (popCells.includes(i)) t.classList.add('pop');
      el.append(t);
    }
  });
}

function pieceEl(piece) {
  const el = document.createElement('div');
  el.className = 'piece';
  piece.cells.forEach(([x, y], k) => {
    const t = tile(piece.cards[k]);
    t.style.gridColumn = String(x + 1);
    t.style.gridRow = String(y + 1);
    el.append(t);
  });
  return el;
}

function renderTray(deal = false) {
  els.slots.forEach((slot, i) => {
    const piece = state.tray[i];
    slot.replaceChildren();
    slot.classList.toggle('empty', !piece);
    slot.classList.remove('dragging');
    slot.classList.toggle('no-fit', Boolean(piece) && !fitsAnywhere(state.board, piece));
    if (piece) {
      const el = pieceEl(piece);
      if (deal) el.classList.add('deal');
      slot.append(el);
    }
  });
}

function renderStreak() {
  if (state.streak >= 2) {
    els.streak.textContent = `SERIE ${state.streak} · ×${streakMultiplier(state.streak)}`;
    els.streak.classList.toggle('fading', state.grace < STREAK_GRACE);
  } else {
    els.streak.textContent = '';
  }
  setMusicIntensity(state.streak);
}

const fmt = (n) => n.toLocaleString('de-DE');

function renderScore() {
  els.bestLabel.textContent = mode === 'daily' ? `Tagesrekord ${dayLabel(today())}` : 'Rekord';
  els.best.textContent = fmt(best);
  const from = shownScore;
  const to = state.score;
  shownScore = to;
  if (from === to) {
    els.score.textContent = fmt(to);
    return;
  }
  els.score.classList.add('bump');
  const t0 = performance.now();
  const dur = Math.min(900, 250 + Math.abs(to - from) / 4);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    els.score.textContent = fmt(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
    else els.score.classList.remove('bump');
  };
  requestAnimationFrame(step);
}

function renderReq() {
  const { level, next } = requirementFor(state.lines);
  els.reqHand.textContent = HANDS[level].name;
  const left = next ? next.lines - state.lines : 0;
  els.reqNext.textContent = next ? `noch ${left} ${left === 1 ? 'Reihe' : 'Reihen'} bis ${HANDS[next.level].name}` : '';
}

function renderMission() {
  els.missionText.textContent = missionText(state.mission);
  els.missionReward.textContent = `+${state.mission.reward}`;
}

function renderWallet() {
  els.chips.textContent = fmt(wallet);
  $('shop-chips').textContent = fmt(wallet);
  for (const btn of document.querySelectorAll('[data-power]')) {
    const kind = btn.dataset.power;
    const affordable = wallet >= POWER_COSTS[kind];
    const usable = kind !== 'blast' || hasLockedLines(state);
    btn.disabled = !affordable || !usable;
    btn.classList.toggle('active', powerMode === kind);
  }
}

// Volle Reihen, die liegen bleiben mussten, sind gesperrt.
function renderLocked() {
  for (const el of cellEls) {
    el.classList.remove('locked', 'lock-head');
    delete el.dataset.left;
  }
  for (const line of findFullLines(state.board)) {
    for (const i of line.cells) cellEls[i].classList.add('locked');
    // Zähler am Ende der Reihe: so viele Züge, bis sie zerbröselt
    const left = state.locked?.[`${line.type}:${line.index}`];
    if (left) {
      const head = cellEls[line.cells[line.cells.length - 1]];
      head.classList.add('lock-head');
      head.dataset.left = String(left);
    }
  }
  renderNearFull();
}

function renderLevel() {
  const { level, into, need } = levelFromXp(xp);
  $('lvl').textContent = `Lv ${level}`;
  $('lvl-fill').style.width = `${Math.round((100 * into) / need)}%`;
}

function renderAll() {
  layout();
  renderBoard();
  renderLocked();
  renderTray();
  renderStreak();
  renderScore();
  renderReq();
  renderMission();
  renderWallet();
  renderLevel();
  renderJackpot();
  renderFever();
}

function renderJackpot() {
  $('jackpot').textContent = fmt(jackpot);
  $('start-jackpot').textContent = fmt(jackpot);
}

// Fieber: Feld glüht, Musik auf voller Stärke
function renderFever() {
  const on = (state.fever ?? 0) > 0;
  els.app.classList.toggle('fever', on);
  if (on) {
    els.streak.textContent = `FIEBER ×2 · noch ${state.fever} ${state.fever === 1 ? 'Zug' : 'Züge'}`;
    setMusicIntensity(99);
  }
}

// ---------- Ziehen ----------

let drag = null;
let ghost = { cells: [], marked: [] };

function clearGhost() {
  for (const i of ghost.cells) cellEls[i].classList.remove('ghost', 'g0', 'g1', 'g2', 'g3', 'gj');
  for (const i of ghost.marked) cellEls[i].classList.remove('will-clear', 'will-block', 'hand-card');
  ghost = { cells: [], marked: [] };
  if (!powerMode) els.preview.replaceChildren();
}

function showGhost(piece, x, y) {
  clearGhost();
  piece.cells.forEach(([dx, dy], k) => {
    const i = idx(x + dx, y + dy);
    const card = piece.cards[k];
    cellEls[i].classList.add('ghost', card.j ? 'gj' : `g${card.s}`);
    ghost.cells.push(i);
  });
  const lines = previewPlacement(state, piece, x, y) ?? [];
  for (const line of lines) {
    for (const i of line.cells) cellEls[i].classList.add(line.ok ? 'will-clear' : 'will-block');
    if (line.ok) for (const i of line.handCells) cellEls[i].classList.add('hand-card');
    ghost.marked.push(...line.cells);
    const tag = document.createElement('span');
    tag.className = line.ok ? `tag t${line.hand.level >= 4 ? 2 : 1}` : 'tag bad';
    tag.textContent = line.ok ? `${line.hand.name} ×${line.hand.mult}` : `${line.hand.name} – zu schwach`;
    els.preview.append(tag);
  }
}

function boardOrigin() {
  const r = els.board.getBoundingClientRect();
  return { x: r.left + 1 + gap, y: r.top + 1 + gap };
}

const DRAG_LIFT = 0.5; // Abstand Teil–Finger in Kästchen
const SNAP_RADIUS = 1.2; // so weit (in Kästchen) springt das Teil zur nächsten freien Stelle
const SNAP_OFFSETS = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [dx, dy]));

function moveDrag(e) {
  const { piece } = drag;
  const pw = piece.w * cell + (piece.w - 1) * gap;
  const ph = piece.h * cell + (piece.h - 1) * gap;
  const left = e.clientX - pw / 2;
  // Mit dem Finger schwebt das Teil knapp darüber, damit man sieht, wohin es kommt –
  // aber nah genug, dass auch die unterste Reihe bequem erreichbar ist.
  const top = drag.touch ? e.clientY - ph - cell * DRAG_LIFT : e.clientY - ph / 2;
  els.drag.style.transform = `translate(${left}px, ${top}px)`;

  const o = boardOrigin();
  const pitch = cell + gap;
  const fx = (left - o.x) / pitch;
  const fy = (top - o.y) / pitch;
  // Einrasten: genaue Stelle, sonst die nächste freie Stelle in der Nähe (wie bei Block Blast)
  const spot = SNAP_OFFSETS.map(([dx, dy]) => [Math.round(fx) + dx, Math.round(fy) + dy])
    .filter(([cx, cy]) => Math.hypot(cx - fx, cy - fy) <= SNAP_RADIUS && canPlace(state.board, piece, cx, cy))
    .sort((a, b) => Math.hypot(a[0] - fx, a[1] - fy) - Math.hypot(b[0] - fx, b[1] - fy))[0];
  const [x, y] = spot ?? [Math.round(fx), Math.round(fy)];
  const valid = Boolean(spot);
  if (valid && (drag.x !== x || drag.y !== y || !drag.valid)) showGhost(piece, x, y);
  if (!valid && drag.valid) clearGhost();
  Object.assign(drag, { x, y, valid });
}

function onSlotDown(e) {
  const slotEl = e.currentTarget;
  const slot = Number(slotEl.dataset.slot);
  const piece = state.tray[slot];
  if (!piece || drag || document.querySelector('.overlay:not([hidden])')) return;
  e.preventDefault();
  unlockAudio();
  if (powerMode === 'recolor') {
    openSuitPicker(slot);
    return;
  }
  if (state.over || powerMode) return;
  sounds.pickup();
  if (piece.cards.some((c) => c.j)) sounds.joker();
  drag = { slot, piece, pointerId: e.pointerId, touch: e.pointerType !== 'mouse', valid: false, x: null, y: null };
  els.drag.className = 'drag on';
  els.drag.replaceChildren(pieceEl(piece));
  slotEl.classList.add('dragging');
  try {
    slotEl.setPointerCapture(e.pointerId);
  } catch {
    // nicht schlimm, die Fenster-Ereignisse reichen
  }
  moveDrag(e);
}

function endDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  clearGhost();
  if (e.type === 'pointerup' && d.valid) {
    els.drag.className = 'drag';
    place(d.slot, d.x, d.y);
    return;
  }
  // Losgelassen über dem Feld, aber passt nicht: deutlich zeigen (rot + Schütteln + Vibration), auch ohne Ton
  const box = els.board.getBoundingClientRect();
  const overBoard =
    e.type === 'pointerup' &&
    e.clientX > box.left - cell && e.clientX < box.right + cell && e.clientY > box.top - cell && e.clientY < box.bottom + cell * 2;
  if (e.type === 'pointerup') sounds.invalid();
  if (overBoard) {
    els.drag.classList.add('invalid');
    els.board.classList.remove('board-invalid');
    void els.board.offsetWidth;
    els.board.classList.add('board-invalid');
    setTimeout(() => els.board.classList.remove('board-invalid'), 500);
    vibrate([30, 40, 30]);
  }
  // zurück in die Ablage
  setTimeout(() => {
    // schon das nächste Teil in der Hand? Dann nicht dazwischenfunken
    if (drag) {
      els.slots[d.slot].classList.remove('dragging');
      return;
    }
    const r = els.slots[d.slot].getBoundingClientRect();
    const pw = d.piece.w * cell;
    const ph = d.piece.h * cell;
    els.drag.classList.add('back');
    els.drag.style.transform = `translate(${r.left + r.width / 2 - pw / 2}px, ${r.top + r.height / 2 - ph / 2}px) scale(${(parseFloat(root.style.getPropertyValue('--piece')) || cell * 0.56) / cell})`;
    setTimeout(() => {
      if (!drag) els.drag.className = 'drag';
      els.slots[d.slot].classList.remove('dragging');
    }, 180);
  }, overBoard ? 320 : 0);
}

// ---------- Zug ausführen ----------

function cellCenter(i) {
  const r = cellEls[i].getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
}

// Nacheinander erscheinende Schriftzüge (Hand → Auftrag → neue Mindesthand)
let bannerAt = 0;
function queueBanner(fn, minDelay = 0) {
  const now = performance.now();
  const start = Math.max(now + minDelay, bannerAt);
  bannerAt = start + 1250;
  setTimeout(fn, start - now);
}

function place(slot, x, y) {
  const res = placePiece(state, slot, x, y);
  if (!res) return;
  sounds.place();
  vibrate(8);

  const required = requirementFor(state.lines - res.lines.length).level;
  if (res.lines.length) clearEffects(res);
  if (res.crumbled) {
    flyOut(res.crumbled.removed, new Set(), 0.6);
    setTimeout(() => sounds.invalid(), 150);
  }
  renderBoard(res.placed.filter((i) => !res.removed.has(i)));
  renderLocked();
  if (res.blocked.length) blockedEffects(res, required);
  renderTray(res.dealt);
  renderStreak();
  renderReq();

  if (res.chips) {
    addChips(res.chips);
    sounds.chips(res.chips);
  }
  if (res.golden) goldEffects(res);
  if (res.feverStart) queueBanner(feverEffects);
  renderFever();
  for (const line of res.lines) {
    const win = jackpotWin(line.hand.level, jackpot);
    if (!win) continue;
    const full = line.hand.level >= 9;
    jackpot = full ? JACKPOT_START : jackpot - win;
    save('jackpot', jackpot);
    addChips(win);
    stats.jackpots++;
    renderJackpot();
    queueBanner(() => jackpotEffects(win, full));
  }
  if (res.mission) queueBanner(() => missionEffects(res.mission));
  renderMission();
  if (res.levelUp) queueBanner(levelUpEffects, 300);
  renderWallet();
  recordMove(stats, res, state.streak);
  save('stats', stats);

  if (state.score > best) {
    if (best > 0 && bestAtStart === best) sounds.record();
    best = state.score;
    setBest(mode, best);
  }
  renderScore();
  persist();

  if (res.over) setTimeout(gameOver, Math.max(700, bannerAt - performance.now()));
}

function flyOut(removed, handCells, power, popLevel = null) {
  const popTimes = [];
  for (const [i, card] of removed) {
    const { x, y, r } = cellCenter(i);
    const el = tile(card);
    el.classList.add('fx-tile');
    if (handCells.has(i)) el.classList.add('hand');
    el.style.setProperty('--size', `${r.width}px`);
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
    // Welle entlang der Reihe
    const delay = (i % SIZE) * 22 + Math.floor(i / SIZE) * 22;
    el.style.animationDelay = `${delay}ms`;
    document.body.append(el);
    setTimeout(() => el.remove(), 900 + delay);
    const popAt = (handCells.has(i) ? 450 : 200) + delay;
    popTimes.push(popAt);
    setTimeout(() => burst(x, y, suitColor(card.j ? -1 : card.s), power), popAt);
  }
  // Plopp-Kette: jedes Kästchen ein Ton, immer etwas höher (gleichzeitige zusammengefasst)
  if (popLevel === null) return;
  [...new Set(popTimes)].sort((a, b) => a - b).slice(0, 18).forEach((at, k) => setTimeout(() => sounds.pop(k, popLevel), at));
}

// Punkte fliegen von der Reihe zur Punktanzeige
function flyPoints(line) {
  const boxes = line.cells.map((i) => cellEls[i].getBoundingClientRect());
  const x = boxes.reduce((s, b) => s + b.left + b.width / 2, 0) / boxes.length;
  const y = boxes.reduce((s, b) => s + b.top + b.height / 2, 0) / boxes.length;
  const target = els.score.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fly-points';
  el.textContent = `+${fmt(line.points)}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.append(el);
  setTimeout(() => {
    el.classList.add('go');
    el.style.transform = `translate(-50%, -50%) translate(${target.left + target.width / 2 - x}px, ${target.top + target.height / 2 - y}px) scale(0.5)`;
  }, 650);
  setTimeout(() => {
    el.remove();
    els.score.classList.remove('hit');
    void els.score.offsetWidth;
    els.score.classList.add('hit');
  }, 1300);
}

// Leere Kästchen in Reihen, denen nur noch 1–2 fehlen, leuchten leicht
function renderNearFull() {
  for (const el of cellEls) el.classList.remove('near');
  for (let k = 0; k < SIZE; k++) {
    for (const cells of [
      Array.from({ length: SIZE }, (_, x) => idx(x, k)),
      Array.from({ length: SIZE }, (_, y) => idx(k, y)),
    ]) {
      const empty = cells.filter((i) => !state.board[i]);
      if (empty.length >= 1 && empty.length <= 2) for (const i of empty) cellEls[i].classList.add('near');
    }
  }
}

function clearEffects(res) {
  const handCells = new Set(res.lines.flatMap((l) => l.handCells));
  const top = res.lines.reduce((a, b) => (b.hand.level > a.hand.level ? b : a));
  const level = top.hand.level;
  flyOut(res.removed, handCells, 1 + level * 0.25, level);
  for (const line of res.lines) flyPoints(line);

  const box = els.board.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  if (level >= 4) setTimeout(() => chipBurst(cx, cy, 8 + level * 3), 350);
  if (res.tableClear) setTimeout(() => chipBurst(cx, cy, 40), 500);

  const tier = level >= 7 ? 3 : level >= 4 ? 2 : level >= 2 ? 1 : 0;
  const extras = [];
  if ([...res.removed.values()].some((c) => c.j)) extras.push('Joker!');
  if (res.golden) extras.push('Gold ×2!');
  if (res.feverMult > 1) extras.push('Fieber ×2');
  if (res.lines.length > 1) extras.push(`Kombo ×${res.combo}`);
  if (res.streak > 1) extras.push(`Serie ×${res.streakMult}`);
  if (res.tableClear) extras.push('Tisch leer!');
  if (res.near) extras.push(`Fast ein ${res.near.name}!`);
  bannerAt = 0;
  // Kombos groß feiern: 2 Reihen "Doppel!", ab 3 "MEGA-KOMBO" mit Blitz über den ganzen Bildschirm
  const mega = res.combo >= 3;
  if (mega) megaComboEffects(res);
  queueBanner(() =>
    showBanner({
      praise: mega ? `Mega-Kombo ×${res.combo}!` : res.combo === 2 ? 'Doppel!' : praiseFor(level, res.combo),
      title: mega ? res.lines.map((l) => l.hand.name).join(' + ') : top.hand.name,
      tier: mega ? 3 : res.combo === 2 ? Math.max(tier, 2) : tier,
      extra: extras.join(' · '),
      points: `+${fmt(res.points)}  ·  +${res.chips} Chips`,
    }),
  );

  sounds.clear(level, res.streak, res.combo);
  if (res.tableClear) setTimeout(() => sounds.tableClear(), 400);
  vibrate(level >= 4 || res.combo > 1 ? [25, 40, 45] : 22);
  shake(level >= 7 || res.tableClear ? 'shake-big' : level >= 4 || res.combo > 1 ? 'shake' : null);
}

function shake(kind) {
  if (!kind) return;
  els.app.classList.remove('shake', 'shake-big');
  void els.app.offsetWidth;
  els.app.classList.add(kind);
  setTimeout(() => els.app.classList.remove(kind), 800);
}

// Eine volle Reihe war zu schwach: sie bleibt gesperrt liegen.
function blockedEffects(res, required) {
  for (const line of res.blocked) {
    for (const i of line.cells) {
      const el = cellEls[i];
      el.classList.remove('blocked-flash');
      void el.offsetWidth;
      el.classList.add('blocked-flash');
      setTimeout(() => el.classList.remove('blocked-flash'), 700);
    }
  }
  sounds.blocked();
  vibrate([60, 40, 60]);
  if (!res.lines.length) {
    const weakest = res.blocked.reduce((a, b) => (b.hand.level < a.hand.level ? b : a));
    bannerAt = 0;
    queueBanner(() =>
      showBanner({
        title: res.near ? `Fast ein ${res.near.name}!` : 'Zu schwach',
        tier: 'bad',
        extra: `${weakest.hand.name} – nötig: ${HANDS[required].name}`,
        points: 'Reihe gesperrt',
      }),
    );
  }
}

// Drei oder mehr Reihen auf einmal: Blitz, Chips-Regen, großes Beben
function megaComboEffects(res) {
  const flash = document.createElement('div');
  flash.className = 'flash';
  document.body.append(flash);
  setTimeout(() => flash.remove(), 700);
  sounds.mega(res.combo);
  vibrate([40, 30, 60, 30, 90]);
  const box = els.board.getBoundingClientRect();
  for (let k = 0; k < res.combo; k++) {
    setTimeout(() => chipBurst(box.left + box.width * (0.25 + 0.25 * (k % 3)), box.top + box.height / 2, 18), 200 + k * 150);
  }
}

// Goldene Karte abgeräumt: Gold-Regen
function goldEffects(res) {
  const gold = [...res.removed].filter(([, c]) => c.g).map(([i]) => cellCenter(i));
  setTimeout(() => {
    for (const { x, y } of gold) {
      chipBurst(x, y, 10);
      burst(x, y, suitColor(-1), 2.5);
    }
    sounds.chips(30);
  }, 400);
  vibrate([15, 30, 15, 30, 15]);
}

function feverEffects() {
  sounds.levelUp();
  vibrate([30, 20, 30, 20, 30, 20, 60]);
  showBanner({ title: 'Fieber!', tier: 3, extra: 'Alles zählt doppelt', points: '' });
  shake('shake-big');
}

function jackpotEffects(win, full) {
  sounds.record();
  setTimeout(() => sounds.tableClear(), 300);
  vibrate([50, 40, 50, 40, 120]);
  const box = els.board.getBoundingClientRect();
  for (let k = 0; k < 4; k++) setTimeout(() => chipBurst(box.left + box.width / 2, box.top + box.height / 2, 30), k * 250);
  showBanner({ title: full ? 'JACKPOT!' : 'Teil-Jackpot!', tier: 3, extra: full ? 'Royal Flush räumt alles ab' : 'Straight Flush: ein Viertel', points: `+${fmt(win)} Chips` });
  shake('shake-big');
}

function missionEffects(mission) {
  sounds.mission();
  vibrate([20, 30, 20]);
  const box = els.mission.getBoundingClientRect();
  chipBurst(box.left + box.width / 2, box.top + box.height / 2, 14);
  showBanner({ title: 'Auftrag erfüllt!', tier: 'up', extra: missionText(mission), points: `+${mission.reward} Chips` });
  els.mission.classList.remove('done');
  void els.mission.offsetWidth;
  els.mission.classList.add('done');
}

function levelUpEffects() {
  const { level } = requirementFor(state.lines);
  sounds.levelUp();
  vibrate([30, 30, 30, 30, 60]);
  showBanner({ title: 'Neue Mindesthand', tier: 'up', extra: HANDS[level].name, points: '' });
  els.req.classList.remove('level-up');
  void els.req.offsetWidth;
  els.req.classList.add('level-up');
}

function showBanner({ praise, title, tier, extra, points }) {
  els.banner.replaceChildren();
  if (praise) {
    const pr = document.createElement('div');
    pr.className = 'praise';
    pr.textContent = praise;
    els.banner.append(pr);
  }
  const name = document.createElement('div');
  name.className = `hand-name tier${tier}`;
  name.textContent = title;
  els.banner.append(name);
  if (extra) {
    const ex = document.createElement('div');
    ex.className = 'extra';
    ex.textContent = extra.toUpperCase();
    els.banner.append(ex);
  }
  if (points) {
    const pts = document.createElement('div');
    pts.className = 'points';
    pts.textContent = points;
    els.banner.append(pts);
  }
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => els.banner.replaceChildren(), tier === 3 ? 1900 : 1250);
}

// ---------- Spezialzüge ----------

let powerMode = null; // 'blast' | 'recolor' während man ein Ziel antippt
let pickerSlot = null;

function hint(text) {
  const tag = document.createElement('span');
  tag.className = 'tag t2';
  tag.textContent = text;
  els.preview.replaceChildren(tag);
}

function setPowerMode(kind) {
  powerMode = kind;
  els.board.classList.toggle('targeting', kind === 'blast');
  for (const slot of els.slots) slot.classList.toggle('targeting', kind === 'recolor');
  if (kind === 'blast') hint('Tippe eine gesperrte Reihe an');
  else if (kind === 'recolor') hint('Tippe ein Teil an');
  else els.preview.replaceChildren();
  renderWallet();
}

function cancelPower() {
  setPowerMode(null);
  closeOverlays();
  if (state.over) gameOver();
}

function usePower(kind) {
  unlockAudio();
  if (powerMode === kind) {
    cancelPower();
    return;
  }
  if (wallet < POWER_COSTS[kind]) return;
  if (kind === 'fold') {
    if (!spendChips(POWER_COSTS.fold)) return;
    foldTray(state);
    sounds.power();
    closeOverlays();
    setPowerMode(null);
    renderTray(true);
    persist();
    if (state.over) setTimeout(gameOver, 600);
    return;
  }
  if (kind === 'blast' && !hasLockedLines(state)) return;
  closeOverlays();
  setPowerMode(kind);
}

function onBoardDown(e) {
  if (powerMode !== 'blast') return;
  const el = e.target.closest('.cell');
  if (!el) return;
  e.preventDefault();
  const res = blastAt(state, Number(el.dataset.i));
  if (!res) {
    sounds.invalid();
    return;
  }
  spendChips(POWER_COSTS.blast);
  sounds.power();
  setTimeout(() => sounds.clear(2, 0, res.lines.length), 120);
  vibrate([40, 30, 80]);
  flyOut(res.removed, new Set(), 1.6);
  shake('shake');
  setPowerMode(null);
  renderBoard();
  renderLocked();
  renderTray();
  renderWallet();
  persist();
  if (state.over) setTimeout(gameOver, 800);
}

function openSuitPicker(slot) {
  pickerSlot = slot;
  const piece = state.tray[slot];
  const box = $('suit-buttons');
  box.replaceChildren();
  SUITS.forEach((symbol, s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `suit-btn s${s}`;
    btn.dataset.suit = String(s);
    btn.textContent = symbol;
    btn.disabled = piece.s === s;
    box.append(btn);
  });
  openOverlay('suit-picker');
}

function chooseSuit(s) {
  if (pickerSlot === null || !spendChips(POWER_COSTS.recolor)) return;
  recolorPiece(state, pickerSlot, s);
  pickerSlot = null;
  sounds.power();
  closeOverlays();
  setPowerMode(null);
  renderTray();
  persist();
  if (state.over) setTimeout(gameOver, 600);
}

// ---------- Designs ----------

function applyDesign() {
  root.dataset.theme = settings.theme;
  root.dataset.tiles = settings.tiles;
  const theme = THEMES.find((t) => t.id === settings.theme);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', theme?.color ?? '#0d0420');
}

function shopItem(item, kind) {
  const el = document.createElement('div');
  el.className = 'shop-item';
  const swatch = document.createElement('div');
  swatch.className = 'swatch';
  swatch.dataset.theme = kind === 'theme' ? item.id : settings.theme;
  const style = kind === 'tiles' ? item.id : settings.tiles;
  [[14, 0], [13, 1], [12, 2], [11, 3]].forEach(([r, s]) => swatch.append(tile({ r, s }, style)));
  const name = document.createElement('div');
  name.className = 'shop-name';
  name.textContent = item.name;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn small-btn';
  const active = kind === 'theme' ? settings.theme === item.id : settings.tiles === item.id;
  if (active) {
    btn.textContent = 'Aktiv';
    btn.disabled = true;
    el.classList.add('active');
  } else if (owned.has(item.id)) {
    btn.textContent = 'Wählen';
    btn.dataset.use = `${kind}:${item.id}`;
  } else {
    btn.textContent = `${fmt(item.price)} Chips`;
    btn.dataset.buy = `${kind}:${item.id}`;
    btn.disabled = wallet < item.price;
    btn.classList.add('gold');
  }
  el.append(swatch, name, btn);
  return el;
}

function renderShop() {
  $('shop-themes').replaceChildren(...THEMES.map((t) => shopItem(t, 'theme')));
  $('shop-tiles').replaceChildren(...TILE_STYLES.map((t) => shopItem(t, 'tiles')));
  renderWallet();
}

function useDesign(kind, id) {
  if (kind === 'theme') settings.theme = id;
  else settings.tiles = id;
  saveSettings();
  applyDesign();
  renderShop();
  renderBoard();
  renderTray();
}

function buyDesign(kind, id) {
  const item = (kind === 'theme' ? THEMES : TILE_STYLES).find((t) => t.id === id);
  if (!item || owned.has(id) || !spendChips(item.price)) return;
  owned.add(id);
  save('owned', [...owned]);
  sounds.record();
  useDesign(kind, id);
}

// ---------- Fenster ----------

function openOverlay(id) {
  for (const el of document.querySelectorAll('.overlay')) el.hidden = el.id !== id;
}
function closeOverlays() {
  for (const el of document.querySelectorAll('.overlay')) el.hidden = true;
}

function renderSettings() {
  $('sound-state').textContent = settings.sound ? 'an' : 'aus';
  $('music-state').textContent = settings.music ? 'an' : 'aus';
  $('vibration-state').textContent = settings.vibration ? 'an' : 'aus';
  $('mode-btn').textContent = mode === 'daily' ? 'Freies Spiel' : `Tages-Challenge ${dayLabel(today())}`;
}

function startGame(newMode, fresh) {
  mode = newMode;
  settings.mode = mode;
  saveSettings();
  state = (!fresh && loadGame(mode)) || freshGame(mode);
  best = getBest(mode);
  bestAtStart = best;
  shownScore = state.score;
  persist();
  closeOverlays();
  setPowerMode(null);
  els.banner.replaceChildren();
  renderAll();
  renderTray(true);
  renderSettings();
  if (state.over) gameOver();
}

function gameOver() {
  if (!state.over) return;
  sounds.gameOver();
  vibrate([40, 60, 40]);
  $('final-score').textContent = fmt(state.score);
  $('final-best-label').textContent = mode === 'daily' ? 'Tagesrekord' : 'Rekord';
  $('final-best').textContent = fmt(best);
  $('final-hand').textContent = state.bestHand >= 0 ? HANDS[state.bestHand].name : '–';
  $('final-lines').textContent = fmt(state.lines);
  $('final-chips').textContent = fmt(state.chips);
  $('new-record').hidden = !(state.score > bestAtStart && state.score > 0);
  const canFree = state.freeContinue !== false;
  const canFold = wallet >= POWER_COSTS.fold;
  const canBlast = wallet >= POWER_COSTS.blast && hasLockedLines(state);
  $('free-continue').hidden = !canFree;
  $('rescue').hidden = !canFree && !canFold && !canBlast;
  $('go-decide').hidden = Boolean(state.rewarded);
  $('go-reward').hidden = !state.rewarded;
  if (state.rewarded) showLevel(xp, xp, []);
  $('scratch-btn').hidden = !scratchReady;
  renderWallet();
  openOverlay('gameover');
}

// Das nächste noch nicht freigeschaltete Design (günstigstes zuerst) – Geschenk für jedes 5. Level
function nextLockedDesign() {
  const all = [...THEMES.map((t) => ({ ...t, kind: 'theme' })), ...TILE_STYLES.map((t) => ({ ...t, kind: 'tiles' }))];
  return all.filter((d) => !owned.has(d.id)).sort((a, b) => a.price - b.price)[0] ?? null;
}

// Runde beenden: Truhe öffnen, Erfahrung gutschreiben, Level-Belohnungen verteilen.
function openChest() {
  if (!state.over || state.rewarded) return;
  state.rewarded = true;
  const reward = chestReward(state, Math.random);
  const before = xp;
  xp += xpForRound(state);
  save('xp', xp);
  persist();
  // Runde zählt für Statistik, Jackpot wächst, jede 3. Runde gibt es ein Rubbellos
  recordRound(stats, state);
  save('stats', stats);
  jackpot += JACKPOT_GROWTH;
  save('jackpot', jackpot);
  renderJackpot();
  if (stats.games % SCRATCH_EVERY === 0) {
    scratchReady = true;
    save('scratch-ready', true);
  }
  $('scratch-btn').hidden = !scratchReady;

  const messages = [];
  const levelBefore = levelFromXp(before).level;
  const levelAfter = levelFromXp(xp).level;
  let levelChips = 0;
  for (let level = levelBefore + 1; level <= levelAfter; level++) {
    const lr = levelReward(level);
    levelChips += lr.chips;
    let text = `Level ${level}! +${lr.chips} Chips`;
    const design = lr.design ? nextLockedDesign() : null;
    if (design) {
      owned.add(design.id);
      save('owned', [...owned]);
      text += ` · Neues Design: ${design.name}`;
    } else if (lr.design) {
      levelChips += 250;
      text += ' · +250 Bonus-Chips';
    }
    messages.push(text);
  }

  $('go-decide').hidden = true;
  $('go-reward').hidden = false;
  const chest = $('chest');
  chest.classList.remove('open');
  $('chest-reward').textContent = '';
  setTimeout(() => {
    chest.classList.add('open');
    sounds.mission();
    vibrate([30, 40, 60]);
    const box = chest.getBoundingClientRect();
    chipBurst(box.left + box.width / 2, box.top + box.height / 3, reward.bonus ? 50 : 22);
    $('chest-reward').textContent = reward.bonus ? `BONUS ×3! +${fmt(reward.chips)} Chips` : `+${fmt(reward.chips)} Chips`;
    addChips(reward.chips + levelChips);
    sounds.chips(reward.chips);
  }, 450);
  setTimeout(() => showLevel(before, xp, messages), 1100);
}

function showLevel(fromXp, toXp, messages) {
  const from = levelFromXp(fromXp);
  const to = levelFromXp(toXp);
  $('go-level').textContent = String(to.level);
  $('go-xp').textContent = toXp > fromXp ? `+${fmt(toXp - fromXp)} EP · ${fmt(to.into)} / ${fmt(to.need)}` : `${fmt(to.into)} / ${fmt(to.need)} EP`;
  const fill = $('go-xp-fill');
  fill.style.transition = 'none';
  fill.style.width = `${to.level > from.level ? 0 : Math.round((100 * from.into) / from.need)}%`;
  void fill.offsetWidth;
  fill.style.transition = '';
  fill.style.width = `${Math.round((100 * to.into) / to.need)}%`;
  const box = $('level-up');
  box.hidden = !messages.length;
  box.replaceChildren(...messages.map((text) => Object.assign(document.createElement('div'), { textContent: text })));
  if (messages.length) {
    sounds.levelUp();
    shake('shake');
  }
  renderLevel();
}

// Tagesgeschenk beim ersten Start des Tages
let pendingGift = null;
let giftReturn = null; // Fenster, das nach dem Abholen wieder erscheint
function checkGift(returnTo = null) {
  giftReturn = returnTo;
  pendingGift = dailyGift(load('gift', null), today());
  if (!pendingGift) return false;
  const days = $('gift-days');
  days.replaceChildren(
    ...GIFT_DAYS.map((chips, k) => {
      const el = document.createElement('div');
      el.className = 'gift-day';
      if (k < Math.min(pendingGift.streak, GIFT_DAYS.length)) el.classList.add('done');
      if (k === Math.min(pendingGift.streak, GIFT_DAYS.length) - 1) el.classList.add('today');
      el.textContent = `Tag ${k + 1}\n${chips}`;
      return el;
    }),
  );
  $('gift-text').textContent = pendingGift.streak > 1 ? `${pendingGift.streak} Tage in Folge – weiter so!` : 'Schön, dass du da bist!';
  $('gift-chips').textContent = `+${fmt(pendingGift.chips)} Chips`;
  openOverlay('gift');
  return true;
}

function claimGift() {
  if (!pendingGift) return;
  save('gift', { day: pendingGift.day, streak: pendingGift.streak });
  addChips(pendingGift.chips);
  sounds.mission();
  sounds.chips(pendingGift.chips);
  vibrate([20, 30, 40]);
  const box = $('gift-chips').getBoundingClientRect();
  chipBurst(box.left + box.width / 2, box.top, 30);
  pendingGift = null;
  if (giftReturn) openOverlay(giftReturn);
  else closeOverlays();
}

// ---------- Startbildschirm, Statistik, Teilen, Rubbellos ----------

// Regeln in zwei kurzen Schritten; die Knöpfe unten bleiben immer sichtbar
let helpPage = 1;
function showHelp(page) {
  helpPage = page;
  for (const el of document.querySelectorAll('.help-page')) el.hidden = Number(el.dataset.page) !== page;
  $('help-toggle').textContent = page === 1 ? 'Pokerhände ›' : '‹ Zurück';
  document.querySelectorAll('.help-dots i').forEach((dot, k) => dot.classList.toggle('on', k + 1 === page));
  openOverlay('help');
}

function visibleOverlay() {
  return document.querySelector('.overlay:not([hidden])')?.id ?? null;
}

function renderStart() {
  const { level, into, need } = levelFromXp(xp);
  $('start-level').textContent = String(level);
  $('start-xp').style.width = `${Math.round((100 * into) / need)}%`;
  $('start-chips').textContent = fmt(wallet);
  $('start-best').textContent = fmt(getBest('free'));
  renderJackpot();
  const freeGame = mode === 'free' ? state : loadGame('free');
  $('start-play').textContent = freeGame && freeGame.moves > 0 && !freeGame.over ? 'Weiterspielen' : 'Spielen';
  const dailyBest = getBest('daily');
  $('start-daily').textContent = `Tages-Challenge ${dayLabel(today())}${dailyBest ? ` · Rekord ${fmt(dailyBest)}` : ''}`;
}

function showHome() {
  setPowerMode(null);
  renderStart();
  openOverlay('start');
}

function renderStats() {
  const level = levelFromXp(xp).level;
  const rows = [
    ['Runden gespielt', fmt(stats.games)],
    ['Rekord', fmt(Math.max(stats.bestScore, getBest('free')))],
    ['Ø Punkte pro Runde', fmt(stats.games ? Math.round(stats.totalScore / stats.games) : 0)],
    ['Reihen abgeräumt', fmt(stats.lines)],
    ['Beste Serie', fmt(stats.bestStreak)],
    ['Goldkarten', fmt(stats.golden)],
    ['Fieber ausgelöst', fmt(stats.fevers)],
    ['Jackpots', fmt(stats.jackpots)],
    ['Aufträge erfüllt', fmt(stats.missions)],
    ['Chips verdient', fmt(stats.chipsEarned)],
    ['Level', fmt(level)],
  ];
  $('stats-list').replaceChildren(
    ...rows.flatMap(([label, value]) => [
      Object.assign(document.createElement('dt'), { textContent: label }),
      Object.assign(document.createElement('dd'), { textContent: value }),
    ]),
  );
  const table = $('stats-hands');
  table.replaceChildren();
  for (const hand of [...HANDS].reverse()) {
    const tr = document.createElement('tr');
    const count = stats.hands[hand.level] || 0;
    if (!count) tr.classList.add('none');
    tr.append(
      Object.assign(document.createElement('td'), { textContent: hand.name }),
      Object.assign(document.createElement('td'), { textContent: `${fmt(count)}×` }),
    );
    table.append(tr);
  }
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 2200);
}

// Teilen über das Teilen-Menü des Geräts (WhatsApp, Nachrichten …); sonst Text in die Zwischenablage.
async function shareScore() {
  const score = state.over ? state.score : Math.max(stats.bestScore, best);
  const hand = state.bestHand >= 0 ? ` mit ${HANDS[state.bestHand].name}` : '';
  const url = new URL('./', location.href).href;
  const text = `Ich habe ${fmt(score)} Punkte bei Royal Blocks geschafft${hand}! Schaffst du mehr?`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Royal Blocks', text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Text kopiert – jetzt einfach einfügen!');
  } catch {
    // abgebrochen oder nicht erlaubt – nichts tun
  }
}

function openScratch() {
  if (!scratchReady) return;
  const prize = scratchPrize(Math.random);
  $('scratch-reward').textContent = '';
  $('scratch-done').hidden = true;
  openOverlay('scratch');
  createScratchCard($('scratch-area'), prize, (card) => {
    scratchReady = false;
    save('scratch-ready', false);
    $('scratch-btn').hidden = true;
    addChips(prize.chips);
    $('scratch-reward').textContent = `+${fmt(prize.chips)} Chips${prize.tier >= 2 ? ' – Volltreffer!' : ''}`;
    $('scratch-done').hidden = false;
    const box = card.getBoundingClientRect();
    chipBurst(box.left + box.width / 2, box.top + box.height / 2, 12 + prize.tier * 12);
    if (prize.tier >= 2) sounds.record();
    else sounds.mission();
    sounds.chips(prize.chips);
    vibrate(prize.tier >= 2 ? [40, 30, 40, 30, 80] : [20, 30, 20]);
  });
}

const actions = {
  resume() {
    closeOverlays();
    if (!settings.seenHelp) {
      settings.seenHelp = true;
      saveSettings();
      checkGift();
    }
  },
  'free-continue'() {
    if (!useFreeContinue(state)) return;
    sounds.power();
    closeOverlays();
    renderTray(true);
    persist();
    if (state.over) setTimeout(gameOver, 600);
  },
  'open-chest': openChest,
  'claim-gift': claimGift,
  home: showHome,
  play() {
    if (mode !== 'free') startGame('free', false);
    closeOverlays();
    if (state.over) gameOver();
  },
  'play-daily': () => startGame('daily', false),
  stats() {
    returnTo = visibleOverlay() ?? 'menu';
    renderStats();
    openOverlay('stats');
  },
  share: shareScore,
  scratch: openScratch,
  'scratch-done': () => openOverlay('gameover'),
  back: () => {
    if (returnTo === 'start') renderStart();
    openOverlay(returnTo);
  },
  help: () => showHelp(1),
  'help-page': () => showHelp(helpPage === 1 ? 2 : 1),
  shop() {
    returnTo = visibleOverlay() ?? 'menu';
    renderShop();
    openOverlay('shop');
  },
  sound() {
    settings.sound = !settings.sound;
    setSoundEnabled(settings.sound);
    saveSettings();
    renderSettings();
  },
  music() {
    settings.music = !settings.music;
    setMusicEnabled(settings.music);
    saveSettings();
    renderSettings();
  },
  vibration() {
    settings.vibration = !settings.vibration;
    setVibrationEnabled(settings.vibration);
    saveSettings();
    renderSettings();
    vibrate(20);
  },
  'switch-mode': () => startGame(mode === 'daily' ? 'free' : 'daily', false),
  new: () => openOverlay('confirm-new'),
  'new-confirm': () => startGame(mode, true),
  'cancel-power': cancelPower,
};

const EXAMPLES = {
  'royal-flush': [[10, 1], [11, 1], [12, 1], [13, 1], [14, 1]],
  'straight-flush': [[5, 0], [6, 0], [7, 0], [8, 0], [9, 0]],
  quads: [[9, 0], [9, 1], [9, 2], [9, 3]],
  'full-house': [[13, 0], [13, 1], [13, 2], [4, 3], [4, 1]],
  flush: [[2, 2], [6, 2], [9, 2], [11, 2], [14, 2]],
  straight: [[6, 3], [7, 1], [8, 0], [9, 2], [10, 3]],
  trips: [[7, 0], [7, 1], [7, 2]],
  'two-pair': [[5, 0], [5, 1], [12, 2], [12, 3]],
  pair: [[14, 0], [14, 1]],
  high: [[13, 3]],
};

function buildHandTable() {
  const table = $('hand-table');
  table.replaceChildren();
  for (const hand of [...HANDS].reverse()) {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = hand.name;
    const ex = document.createElement('td');
    const row = document.createElement('div');
    row.className = 'ex';
    for (const [r, s] of EXAMPLES[hand.id]) row.append(tile({ r, s }, 'standard'));
    ex.append(row);
    const mult = document.createElement('td');
    mult.textContent = `×${hand.mult}`;
    tr.append(name, ex, mult);
    table.append(tr);
  }
}

// ---------- Start ----------

applyDesign();
buildBoard();
buildHandTable();
initFx($('fx'));
for (const el of document.querySelectorAll('[data-cost]')) el.textContent = POWER_COSTS[el.dataset.cost];
$('version').textContent = version === 'dev' ? '(Entwicklung)' : `v${version}`;
renderSettings();
renderAll();

for (const slot of els.slots) slot.addEventListener('pointerdown', onSlotDown);
els.board.addEventListener('pointerdown', onBoardDown);
window.addEventListener('pointermove', (e) => {
  if (drag && e.pointerId === drag.pointerId) moveDrag(e);
});
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('resize', layout);
document.addEventListener('contextmenu', (e) => e.preventDefault());

$('menu-btn').addEventListener('click', () => {
  unlockAudio();
  if (powerMode) setPowerMode(null);
  openOverlay('menu');
});
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action], [data-power], [data-suit], [data-buy], [data-use]');
  if (!target || target.disabled) return;
  unlockAudio();
  if (target.dataset.action) actions[target.dataset.action]?.();
  else if (target.dataset.power) usePower(target.dataset.power);
  else if (target.dataset.suit) chooseSuit(Number(target.dataset.suit));
  else if (target.dataset.buy) buyDesign(...target.dataset.buy.split(':'));
  else if (target.dataset.use) useDesign(...target.dataset.use.split(':'));
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (powerMode || !$('suit-picker').hidden) cancelPower();
  else if (state.over) return;
  else if (document.querySelector('.overlay:not([hidden])')) actions.resume();
  else openOverlay('menu');
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    persist();
    stopMusic();
  } else if (settings.music) {
    startMusic();
  }
});

// iPhone/iPad: Ton erst nach einer echten Berührung freischalten – bei jeder Art von Eingabe versuchen
for (const type of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(type, unlockAudio, { capture: true, passive: true });

if (state.over) gameOver();
else if (!settings.seenHelp) showHelp(1);
else {
  showHome();
  checkGift('start');
}

// Offline-Betrieb (nur im gebauten Spiel; beim Entwickeln würde der Cache stören)
if (version !== 'dev' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}
