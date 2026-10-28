// Anzeige und Bedienung von Royal Blocks.

import {
  SIZE, STREAK_GRACE, blastAt, canPlace, createGame, findFullLines, fitsAnywhere, foldTray, hasLockedLines, idx,
  leaderboardBoard, missionText, placePiece, powerCost, powerRemaining, previewPlacement, recolorPiece, requirementFor, streakMultiplier,
  undoLastMove, updateOver, upgradeGameState, useFreeContinue, usePowerCharge,
} from './game.js';
import {
  ACHIEVEMENTS, GIFT_DAYS, JACKPOT_GROWTH, JACKPOT_START, SCRATCH_EVERY, chestReward, dailyGift, earnedAchievements,
  TIERED, TIERS, TIER_NAMES, emptyStats, jackpotWin, levelFromXp, levelReward, praiseFor, recordMove, recordRound, scratchPrize,
  tierProgress, xpForRound,
} from './progress.js';
import { createScratchCard } from './scratch.js';
import {
  ALL_ITEMS, COLLECTION, FREE_ITEMS, MYTHIC_ITEMS, RARITY, SETS, SHOP_ITEMS, SHOP_LABELS, SHOP_SETTING, THEMES, buyable, daysLeft,
  isLimited, limitedOpen, setBonus, setItems, setProgress,
} from './shop.js';
import {
  CHESTS, SLOT_BETS, SLOT_CHEAP_SPINS, SLOT_SYMBOLS, TICKETS, TICKET_ODDS, WHEEL, WHEEL_TOTAL, casinoDay, dropPool, openChestRoll, prestigeOpen,
  slotOdds, slotPrice, slotReturn, spinSlot, spinWheel, ticketPrize, wheelAngle, withCharm,
} from './casino.js';
import { HANDS, SUITS, rankLabel } from './poker.js';
import {
  jingle, setMusicEnabled, setMusicIntensity, setSoundEnabled, setSoundPack, setVibrationEnabled, sounds, startMusic, stopMusic, unlockAudio, vibrate,
} from './audio.js';
import { burst, chips as chipBurst, initFx, setFxStyle, suitColor } from './fx.js';
import { createPlatformClient, leaderboardPath } from './platform.js';
import { exportSnapshot, hasProgress, importSnapshot, load, onSave, save, snapshotSummary } from './storage.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const version = root.dataset.version;
const platform = createPlatformClient({ version });
platform.watchErrors(window);
platform.start();
$('platform-home').hidden = !platform.hosted;

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

// ---------- Gespeicherte Daten ----------

const settings = {
  sound: true, music: true, vibration: true, seenHelp: false, theme: 'neon', tiles: 'standard', mode: 'free',
  effect: 'effect-classic', background: 'bg-classic', cards: 'card-classic',
  frame: 'frame-classic', soundPack: 'sound-classic', jingle: 'jingle-none', chipStyle: 'chip-gold', charm: 'charm-none',
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
for (const id of FREE_ITEMS) owned.add(id);
let startBonusReady = Boolean(load('start-bonus', false));
const achievements = new Set(load('achievements', []).filter((id) => id in ACHIEVEMENTS));

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

const saveKey = (value) => (value === 'daily' ? 'daily' : value === 'pro' ? 'pro' : 'game');

function freshGame(value) {
  if (value === 'daily') return createGame(daySeed(today()), 'daily', today());
  const bonus = value === 'free' && startBonusReady;
  if (bonus) {
    startBonusReady = false;
    save('start-bonus', false);
  }
  return createGame(randomSeed(), value, null, { startBonus: bonus });
}

function loadGame(mode) {
  const saved = load(saveKey(mode), null);
  const valid =
    saved && Array.isArray(saved.board) && saved.board.length === SIZE * SIZE && Array.isArray(saved.tray) &&
    typeof saved.rng === 'number' && saved.mission && (mode !== 'daily' || saved.day === today());
  if (!valid) return null;
  upgradeGameState(saved);
  updateOver(saved);
  return saved;
}

function getBest(mode) {
  if (mode === 'daily') {
    const d = load('daily-best', null);
    return d && d.day === today() ? d.score : 0;
  }
  return Number(load(mode === 'pro' ? 'best-pro' : 'best', 0)) || 0;
}
function setBest(mode, score) {
  if (mode === 'daily') save('daily-best', { day: today(), score });
  else save(mode === 'pro' ? 'best-pro' : 'best', score);
}

let mode = ['free', 'daily', 'pro'].includes(settings.mode) ? settings.mode : 'free';
let state = loadGame(mode) ?? freshGame(mode);
let best = getBest(mode);
let bestAtStart = best;
let shownScore = state.score;

// Eine Royal-Blocks-Runde entspricht für Statistik und Rangliste einem Level.
// Die Zähler gelten für diesen Seitenbesuch; beim Verlassen endet die Sitzung als "abort".
let platformRound = null;
let gameplayActive = false;
let waitingWorker = null;
let reloadRequested = false;

function renderUpdateNotice() {
  const notice = $('update-notice');
  notice.hidden = !waitingWorker;
  const button = $('update-reload');
  button.disabled = gameplayActive;
  button.textContent = gameplayActive ? 'Neu laden nach der Runde' : 'Neu laden';
}

function hideLeaderboard() {
  $('leaderboard-result').hidden = true;
  $('leaderboard-rank').textContent = '';
}

function showLeaderboard(result, board) {
  hideLeaderboard();
  if (!result || result.listed === false || !Number.isInteger(result.week?.rank)) return;
  $('leaderboard-rank').textContent = `Platz ${result.week.rank} diese Woche`;
  $('leaderboard-link').href = leaderboardPath(board);
  $('leaderboard-result').hidden = false;
}

function startPlatformRound() {
  if (state.over) return;
  gameplayActive = true;
  renderUpdateNotice();
  if (platformRound) return;
  const board = leaderboardBoard(mode);
  if (!platform.beginLevel(board)) return;
  platformRound = { board, lines: 0, hands: new Array(HANDS.length).fill(0) };
  hideLeaderboard();
}

function trackPlatformMove(result) {
  if (!platformRound) return;
  platformRound.lines += result.lines.length;
  for (const line of result.lines) platformRound.hands[line.hand.level]++;
}

function platformData(round) {
  const data = { lines: round.lines };
  round.hands.forEach((count, level) => {
    if (count) data[`hand_${HANDS[level].id.replaceAll('-', '_')}`] = count;
  });
  return data;
}

function finishPlatformRound(result, { keepalive = false, showRank = false } = {}) {
  if (!platformRound) return;
  const round = platformRound;
  platformRound = null;
  renderUpdateNotice();
  platform.endLevel({ result, score: state.score, stars: 0, data: platformData(round) });
  void platform.flush({ keepalive });
  const score = platform.submitScore(round.board, state.score, { keepalive });
  if (showRank) void score.then((response) => showLeaderboard(response, round.board));
}

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
  // Breite des Rahmens (je nach Shop-Rahmen 1 bis 6 Pixel) auf beiden Seiten
  const edge = 2 * (parseFloat(getComputedStyle(els.board).borderLeftWidth) || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const wide = W >= 900 && W > H * 1.15;
  const tablet = W >= 700;
  els.app.classList.toggle('wide', wide);
  root.classList.toggle('tablet', tablet);
  els.tray.style.gridTemplateColumns = !wide && trayCols ? trayCols.map((w) => `minmax(0, ${w}fr)`).join(' ') : '';
  gap = W < 380 ? 2 : tablet ? 4 : 3;
  let pieceSize;
  if (wide) {
    const side = Math.round(Math.min(440, Math.max(340, W * 0.32)));
    const byHeight = (H - 48 - edge - 9 * gap) / 8;
    const byWidth = (W - side - 80 - edge - 9 * gap) / 8;
    cell = Math.max(28, Math.floor(Math.min(byHeight, byWidth, 100)));
    root.style.setProperty('--side', `${side}px`);
    // Teile stehen rechts untereinander: jedes Teil (bis 5 Kästchen) muss in ein Drittel der Ablage passen
    const trayHeight = els.tray.getBoundingClientRect().height || H / 2;
    pieceSize = Math.floor(Math.min(cell * 0.6, (side - 24) / 5.3, (trayHeight / 3 - 10) / 5.3));
  } else {
    const w = Math.min(W, tablet ? 780 : 560) - 24;
    // Alles außer Feld und Ablage tatsächlich messen (Kopfzeile, Mindesthand + Auftrag, Vorschau, Spezialzüge, Ränder)
    const style = getComputedStyle(els.app);
    const fixed = ['.top', '.info', '.preview', '.powers'].reduce((sum, sel) => {
      const el = els.app.querySelector(sel);
      const cs = getComputedStyle(el);
      return sum + el.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    }, 0) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 14;
    const byWidth = (w - edge - 9 * gap) / 8;
    const byHeight = (H - fixed - edge - 9 * gap) / 11; // 8 Feld-Reihen + mindestens 3 für die Ablage
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

// Breite der drei Fächer passend zu den Teilen: lange Teile bekommen mehr Platz.
// Nur beim Austeilen neu verteilt, damit nichts springt, wenn ein Teil abgelegt wird.
let trayCols = null;
function renderTray(deal = false) {
  if (deal || !trayCols) {
    trayCols = state.tray.map((piece) => Math.max(piece?.w ?? 2, 2) + 0.6);
    if (!els.app.classList.contains('wide')) els.tray.style.gridTemplateColumns = trayCols.map((w) => `minmax(0, ${w}fr)`).join(' ');
  }
  els.slots.forEach((slot, i) => {
    const piece = state.tray[i];
    slot.replaceChildren();
    slot.classList.toggle('empty', !piece);
    slot.classList.remove('dragging');
    slot.classList.toggle('no-fit', Boolean(piece) && !fitsAnywhere(state.board, piece));
    if (piece) {
      const el = pieceEl(piece);
      if (deal) el.classList.add('deal');
      el.style.setProperty('--size', `${traySize(slot, piece)}px`);
      slot.append(el);
    }
  });
}

// Größe der Kästchen in der Ablage: so groß wie möglich, aber jedes Teil passt in sein Fach.
// Kleine Teile werden also größer (gut greifbar), lange Teile passen trotzdem hinein.
function traySize(slot, piece) {
  const box = slot.getBoundingClientRect();
  const g = gap * 0.7;
  const max = cell * (els.app.classList.contains('wide') ? 0.62 : 0.8);
  if (!box.width || !box.height) return Math.floor(max);
  const byW = (box.width - 8 - (piece.w - 1) * g) / piece.w;
  const byH = (box.height - 8 - (piece.h - 1) * g) / piece.h;
  return Math.max(12, Math.floor(Math.min(max, byW, byH)));
}

// Nach einer Größenänderung die Teile in der Ablage neu einpassen
function fitTray() {
  els.slots.forEach((slot, i) => {
    const el = slot.querySelector('.piece');
    if (el && state.tray[i]) el.style.setProperty('--size', `${traySize(slot, state.tray[i])}px`);
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
  els.bestLabel.textContent = mode === 'daily' ? `Tagesrekord ${dayLabel(today())}` : mode === 'pro' ? 'Hart-Rekord' : 'Rekord';
  els.best.textContent = fmt(best);
  const from = shownScore;
  const to = state.score;
  // Lange Punktzahlen etwas kleiner, damit sie nie in Rekord oder Jackpot hineinragen
  // Platz in der Mitte: Breite der Kopfzeile minus Rekord links und Jackpot + Menü rechts
  const natural = (sel) => [...els.app.querySelector(sel).children].map((c) => {
    const range = document.createRange();
    range.selectNodeContents(c);
    return range.getBoundingClientRect().width;
  });
  const room = (els.app.querySelector('.top').clientWidth || window.innerWidth) - Math.max(...natural('.best')) -
    natural('.top-right').reduce((sum, w) => sum + w, 8) - 20;
  const base = root.classList.contains('tablet') ? 56 : 42;
  els.score.style.fontSize = fmt(to).length > 5 ? `${Math.max(24, Math.min(base, Math.floor(room / (fmt(to).length * 0.66))))}px` : '';
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
  const { level, next } = requirementFor(state.lines, state.mode);
  els.reqHand.textContent = HANDS[level].name;
  const left = next ? next.lines - state.lines : 0;
  els.reqNext.textContent = next ? `${HANDS[next.level].name} in ${left} ${left === 1 ? 'Reihe' : 'Reihen'}` : '';
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
    const cost = powerCost(state, kind);
    const remaining = powerRemaining(state, kind);
    const targetReady = kind === 'blast' ? hasLockedLines(state) : kind !== 'undo' || Boolean(state.undo);
    const funds = kind === 'undo' ? state.undoMeta?.wallet ?? wallet : wallet;
    btn.disabled = remaining <= 0 || funds < cost || !targetReady;
    const costLabel = btn.querySelector('[data-cost]');
    if (costLabel) costLabel.textContent = remaining > 0 ? `${fmt(cost)} · ${remaining}×` : 'aufgebraucht';
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
  const border = parseFloat(getComputedStyle(els.board).borderLeftWidth) || 0;
  return { x: r.left + border + gap, y: r.top + border + gap };
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
    els.drag.style.transform = `translate(${r.left + r.width / 2 - pw / 2}px, ${r.top + r.height / 2 - ph / 2}px) scale(${traySize(els.slots[d.slot], d.piece) / cell})`;
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
  const undoMeta = { wallet, jackpot, stats: structuredClone(stats), best };
  const res = placePiece(state, slot, x, y);
  if (!res) return;
  state.undoMeta = undoMeta;
  trackPlatformMove(res);
  sounds.place();
  vibrate(8);

  const required = requirementFor(state.lines - res.lines.length, state.mode).level;
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
    addChips(withCharm(res.chips, settings.charm));
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
  refreshAchievements();
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
  if (level >= 4 || mega) setTimeout(() => jingle(settings.jingle), 550);
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
  setTimeout(() => jingle(settings.jingle), 500);
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
  const cost = powerCost(state, kind);
  const funds = kind === 'undo' ? state.undoMeta?.wallet ?? wallet : wallet;
  if (powerRemaining(state, kind) <= 0 || funds < cost) return;
  if (kind === 'undo') {
    const result = undoLastMove(state);
    if (!result?.meta) return;
    wallet = result.meta.wallet - cost;
    jackpot = result.meta.jackpot;
    for (const key of Object.keys(stats)) delete stats[key];
    Object.assign(stats, result.meta.stats);
    best = result.meta.best;
    save('chips', wallet);
    save('jackpot', jackpot);
    save('stats', stats);
    setBest(mode, best);
    sounds.power();
    shownScore = state.score;
    renderAll();
    renderTray(true);
    persist();
    toast('Letzter Zug rückgängig');
    return;
  }
  if (kind === 'fold') {
    if (!spendChips(cost) || !usePowerCharge(state, kind)) return;
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
  const cost = powerCost(state, 'blast');
  if (!spendChips(cost) || !usePowerCharge(state, 'blast')) return;
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
  const cost = powerCost(state, 'recolor');
  if (pickerSlot === null || !spendChips(cost) || !usePowerCharge(state, 'recolor')) return;
  recolorPiece(state, pickerSlot, s);
  pickerSlot = null;
  sounds.power();
  closeOverlays();
  setPowerMode(null);
  renderTray();
  persist();
  if (state.over) setTimeout(gameOver, 600);
}

// ---------- Shop ----------

// Tageswerte und Zähler der Glücks-Ecke (Glücksrad, Automat, ausgegebene Chips, Sets)
let casino = casinoDay(load('casino', {}), today());
const saveCasino = () => save('casino', casino);
function refreshCasinoDay() {
  casino = casinoDay(casino, today());
}

// Im Shop ausgegebene Chips zählen für „Highroller“
function spend(n) {
  if (!spendChips(n)) return false;
  casino.spent = (casino.spent || 0) + n;
  saveCasino();
  return true;
}

function applyDesign(preview = {}) {
  root.dataset.theme = preview.theme ?? settings.theme;
  root.dataset.tiles = preview.tiles ?? settings.tiles;
  root.dataset.effect = preview.effects ?? settings.effect;
  root.dataset.background = preview.backgrounds ?? settings.background;
  root.dataset.cards = preview.cards ?? settings.cards;
  root.dataset.frame = preview.frames ?? settings.frame;
  root.dataset.chip = preview.chips ?? settings.chipStyle;
  setFxStyle(root.dataset.effect);
  setSoundPack(preview.sounds ?? settings.soundPack);
  const theme = THEMES.find((t) => t.id === root.dataset.theme);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', theme?.color ?? '#0d0420');
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const KIND_ICONS = {
  theme: '🎨', tiles: '🟦', effects: '✨', backgrounds: '🌌', cards: '🃏', frames: '🖼️',
  sounds: '🔊', jingles: '🎺', chips: '🪙', charms: '🍀', extras: '➕', limited: '⏳',
};
const ITEM_ICONS = {
  'effect-classic': '✦', 'effect-confetti': '🎊', 'effect-pixel': '▦', 'effect-fireworks': '🎆', 'effect-sparks': '✨',
  'sound-classic': '🎹', 'sound-retro': '👾', 'sound-casino': '🔔', 'sound-jazz': '🎷', 'sound-crystal': '💠',
  'jingle-none': '🔇', 'jingle-fanfare': '🎺', 'jingle-arcade': '🕹️', 'jingle-slot': '🎰', 'jingle-harp': '🪕', 'jingle-orchestra': '🎻',
  'jingle-spooky': '👻', 'jingle-bells': '🔔', 'jingle-midas': '🏛',
  'start-bonus': '⟳+1',
};

// Kleine Bühne mit Mini-Spielfeld im Stil des Artikels (übrige Einstellungen wie gerade gewählt)
function stage(kind, id, big = false) {
  const look = {
    theme: settings.theme, tiles: settings.tiles, cards: settings.cards, backgrounds: settings.background, frames: settings.frame,
    [kind]: id,
  };
  const box = el('div', `stage${big ? ' big' : ''}`);
  box.dataset.theme = look.theme;
  box.dataset.cards = look.cards;
  box.dataset.background = look.backgrounds;
  box.dataset.frame = look.frames;
  const board = el('div', 'board mini-board');
  const cards = [[14, 0], [13, 1], null, [12, 2], null, [11, 3], [10, 0], null];
  for (const card of cards) {
    const c = el('div', 'cell');
    if (card) c.append(tile({ r: card[0], s: card[1] }, look.tiles));
    board.append(c);
  }
  box.append(board);
  return box;
}

function swatch(item, kind) {
  if (['theme', 'tiles', 'cards', 'backgrounds', 'frames'].includes(kind)) return stage(kind, item.id);
  const box = el('div', 'swatch-icon');
  if (kind === 'chips') {
    const chip = el('span', 'chip-icon big');
    chip.dataset.chip = item.id;
    box.append(chip);
  } else if (kind === 'charms') {
    box.append(el('span', 'charm-icon', item.icon));
    if (item.bonus_chips) box.append(el('small', 'charm-bonus', `+${Math.round(item.bonus_chips * 100)} % Chips`));
  } else {
    box.textContent = ITEM_ICONS[item.id] ?? KIND_ICONS[kind];
  }
  return box;
}

function rarityTag(item) {
  if (!item.rarity) return el('span', 'rarity-tag r-free', 'Gratis');
  return el('span', `rarity-tag r-${item.rarity}`, RARITY[item.rarity].name);
}

let confirmBuy = null; // Kauf erst beim zweiten Tippen
function shopItem(item, kind) {
  const card = el('div', `shop-item${item.rarity ? ` r-${item.rarity}` : ''}`);
  const setting = SHOP_SETTING[kind];
  const active = setting ? settings[setting] === item.id : kind === 'extras' && startBonusReady;
  const has = kind === 'extras' ? startBonusReady : owned.has(item.id);
  if (active) card.classList.add('active');
  const now = today();
  if (!has && !buyable(item, now)) card.classList.add('locked');
  if (isLimited(item)) card.classList.add('limited');
  card.append(swatch(item, kind));
  const head = el('div', 'shop-item-head');
  head.append(el('strong', 'shop-name', item.name), rarityTag(item));
  card.append(head);
  if (item.set) card.append(el('small', 'set-tag', `${SETS[item.set].icon} ${SETS[item.set].name}`));
  if (item.animated) card.append(el('small', 'set-tag', '✦ animiert'));
  if (limitedOpen(item, now)) {
    const left = daysLeft(item, now);
    card.append(el('small', 'limited-tag', `⏳ ${item.event} · ${left === 1 ? 'nur noch heute' : `noch ${left} Tage`}`));
  }

  const actions = el('div', 'shop-actions');
  if (['effects', 'sounds', 'jingles'].includes(kind) && item.id !== 'jingle-none') {
    const play = el('button', 'btn small-btn', kind === 'effects' ? 'Ansehen' : 'Anhören');
    play.type = 'button';
    play.dataset.preview = `${kind}:${item.id}`;
    actions.append(play);
  }
  const btn = el('button', 'btn small-btn');
  btn.type = 'button';
  if (active) {
    btn.textContent = kind === 'extras' ? 'Bereit' : 'Aktiv ✓';
    btn.disabled = true;
  } else if (has) {
    btn.textContent = 'Ausrüsten';
    btn.dataset.use = `${kind}:${item.id}`;
  } else if (item.bonus) {
    btn.textContent = `📖 Set ${SETS[item.bonus].name}`;
    btn.disabled = true;
  } else if (item.rarity === 'mythic') {
    btn.textContent = '🏛 Prestige-Truhe';
    btn.disabled = true;
  } else if (isLimited(item) && !limitedOpen(item, now)) {
    btn.textContent = now < item.from ? 'Bald erhältlich' : 'Nicht mehr erhältlich';
    btn.disabled = true;
  } else if (!buyable(item, now)) {
    btn.textContent = '🎁 Nur aus Truhen';
    btn.disabled = true;
  } else {
    const sure = confirmBuy === `${kind}:${item.id}`;
    btn.textContent = sure ? `Sicher? ${fmt(item.price)}` : fmt(item.price);
    btn.prepend(el('span', 'chip-icon'));
    btn.dataset.buy = `${kind}:${item.id}`;
    btn.disabled = wallet < item.price;
    btn.classList.add('gold', 'price');
    if (sure) btn.classList.add('sure');
  }
  actions.append(btn);
  card.append(actions);
  return card;
}

let shopMain = 'buy';
let shopCat = 'theme';

// Gerade erhältliche Aktions-Artikel (Halloween, Wochen-Artikel …)
const openLimited = () => ALL_ITEMS.filter((item) => limitedOpen(item, today()));
// Im Shop sichtbar: alles außer Aktions-Artikeln, die man nicht hat und gerade nicht kaufen kann
const visibleIn = (kind) => SHOP_ITEMS[kind].filter((item) => !isLimited(item) || owned.has(item.id) || limitedOpen(item, today()));

function luckReady() {
  refreshCasinoDay();
  return !casino.wheel;
}
function albumReady() {
  return Object.keys(SETS).some((id) => setProgress(id, owned).complete && !owned.has(setBonus(id)?.id));
}
// Neue Aktion, die man sich noch nicht angesehen hat
function limitedNew() {
  const seen = new Set(settings.seenLimited ?? []);
  return openLimited().some((item) => !seen.has(item.id) && !owned.has(item.id));
}
function renderDots() {
  $('luck-dot').hidden = !luckReady();
  $('album-dot').hidden = !albumReady();
  $('buy-dot').hidden = !limitedNew();
  $('start-shop-dot').hidden = !luckReady() && !albumReady() && !limitedNew();
}

function renderShop() {
  refreshCasinoDay();
  for (const tab of document.querySelectorAll('[data-shop-main]')) {
    const on = tab.dataset.shopMain === shopMain;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
  }
  const cats = $('shop-cats');
  cats.hidden = shopMain !== 'buy';
  if (shopMain === 'buy') {
    const offers = openLimited();
    if (shopCat === 'limited' && !offers.length) shopCat = 'theme';
    const kinds = [...(offers.length ? ['limited'] : []), ...Object.keys(SHOP_ITEMS)];
    cats.replaceChildren(...kinds.map((kind) => {
      const b = el('button', `${kind === shopCat ? 'active' : ''}${kind === 'limited' ? ' cat-limited' : ''}`);
      b.type = 'button';
      b.dataset.shopCat = kind;
      b.setAttribute('role', 'tab');
      b.append(el('span', '', KIND_ICONS[kind]), document.createTextNode(kind === 'limited' ? 'Aktion' : SHOP_LABELS[kind]));
      return b;
    }));
    if (shopCat === 'limited') {
      settings.seenLimited = [...new Set([...(settings.seenLimited ?? []), ...offers.map((item) => item.id)])].slice(-60);
      saveSettings();
    }
  }
  const body = $('shop-body');
  if (shopMain === 'buy') body.replaceChildren(buyView());
  else if (shopMain === 'luck') body.replaceChildren(luckView());
  else body.replaceChildren(albumView());
  renderDots();
  renderWallet();
}

function buyView() {
  const wrap = el('div');
  const notes = {
    charms: 'Ein Glücksbringer bringt mehr Chips (nicht mehr Punkte). Es wirkt immer nur einer.',
    sounds: 'Sound-Pakete ändern den Klang aller Spielgeräusche.',
    jingles: 'Jingles spielen bei starken Pokerhänden und beim Jackpot.',
    extras: 'Der Start-Bonus gibt dir in der nächsten Normal-Runde einmal Passen extra.',
  };
  if (shopCat === 'limited') {
    const offers = openLimited();
    for (const event of [...new Set(offers.map((item) => item.event))]) {
      const items = offers.filter((item) => item.event === event);
      const left = Math.min(...items.map((item) => daysLeft(item, today())));
      const head = el('div', `event-head${event === 'Halloween' ? ' halloween' : ''}`);
      head.append(
        el('strong', '', event === 'Halloween' ? '🎃 Halloween' : '⭐ Wochen-Artikel'),
        el('span', '', left === 1 ? 'Nur noch heute!' : `Nur noch ${left} Tage`),
      );
      wrap.append(head);
      const grid = el('div', 'shop-grid');
      grid.append(...items.map((item) => shopItem(item, item.kind)));
      wrap.append(grid);
    }
    wrap.append(el('p', 'shop-note', 'Aktions-Artikel gibt es nur für kurze Zeit – danach verschwinden sie aus dem Shop. Was du gekauft hast, behältst du. Jeden Montag kommt ein neuer Wochen-Artikel.'));
    return wrap;
  }
  if (notes[shopCat]) wrap.append(el('p', 'shop-note', notes[shopCat]));
  const grid = el('div', 'shop-grid');
  grid.append(...visibleIn(shopCat).map((item) => shopItem(item, shopCat)));
  wrap.append(grid);
  return wrap;
}

function luckCard({ cls, icon, title, text, button, data, disabled, odds }) {
  const card = el('div', `luck-card ${cls}`);
  const art = el('div', 'luck-art', icon);
  const copy = el('div', 'luck-copy');
  copy.append(el('strong', '', title), el('small', '', text));
  const actions = el('div', 'luck-actions');
  const btn = el('button', 'btn small-btn gold price');
  btn.type = 'button';
  Object.assign(btn.dataset, data);
  btn.disabled = Boolean(disabled);
  btn.append(...button);
  actions.append(btn);
  if (odds) {
    const o = el('button', 'link-btn', 'Chancen');
    o.type = 'button';
    o.dataset.odds = odds;
    actions.append(o);
  }
  card.append(art, copy, actions);
  return card;
}
const priceLabel = (price) => [el('span', 'chip-icon'), document.createTextNode(fmt(price))];

function luckView() {
  const wrap = el('div', 'luck');
  wrap.append(el('h3', '', 'Jeden Tag'));
  const wheelFree = !casino.wheel;
  wrap.append(luckCard({
    cls: 'wheel-card', icon: '🎡', title: 'Glücksrad', text: wheelFree ? 'Heute gratis drehen!' : 'Morgen wieder gratis',
    button: [document.createTextNode(wheelFree ? 'Gratis drehen' : 'Ansehen')], data: { action: 'open-wheel' }, odds: 'wheel',
  }));
  wrap.append(luckCard({
    cls: 'slot-card', icon: '🎰', title: 'Spielautomat', text: casino.spins < SLOT_CHEAP_SPINS ? `Einsatz ${SLOT_BETS.join(' / ')} · noch ${SLOT_CHEAP_SPINS - casino.spins} Drehs zum Normalpreis` : `Heute schon ${casino.spins} Drehs – jetzt teurer`,
    button: [document.createTextNode('Spielen')], data: { action: 'open-slot' }, odds: 'slot',
  }));
  wrap.append(el('h3', '', 'Truhen'));
  // Prestige-Truhe: erst, wenn die feste Sammlung komplett ist – vorher als Ziel mit Fortschritt
  const have = COLLECTION.filter((item) => owned.has(item.id)).length;
  if (prestigeOpen(owned)) {
    const mythicHave = MYTHIC_ITEMS.filter((item) => owned.has(item.id)).length;
    wrap.append(luckCard({
      cls: 'chest-card c-prestige', icon: '', title: CHESTS.prestige.name,
      text: `Goldene Prestige-Sachen (Mythisch) · ${mythicHave}/${MYTHIC_ITEMS.length} gesammelt`,
      button: priceLabel(CHESTS.prestige.price), data: { chest: 'prestige' }, disabled: wallet < CHESTS.prestige.price, odds: 'chest:prestige',
    }));
  } else {
    const teaser = el('div', 'luck-card prestige-teaser');
    const copy = el('div', 'luck-copy');
    copy.append(
      el('strong', '', '🏛 Prestige-Truhe'),
      el('small', '', `Erscheint, wenn du alles gesammelt hast: ${have}/${COLLECTION.length} – darin warten goldene Prestige-Sachen.`),
    );
    const bar = el('div', 'xp-bar');
    const fill = el('i');
    fill.style.width = `${Math.round((100 * have) / COLLECTION.length)}%`;
    bar.append(fill);
    copy.append(bar);
    teaser.append(el('div', 'luck-art', '🔒'), copy);
    wrap.append(teaser);
  }
  for (const [type, chest] of Object.entries(CHESTS)) {
    if (type === 'prestige') continue;
    const best = Object.keys(chest.odds).at(-1);
    wrap.append(luckCard({
      cls: `chest-card c-${type}`, icon: '', title: chest.name,
      text: `${Object.keys(chest.odds).map((r) => RARITY[r].name).join(' · ')}${best === 'legendary' ? ` – ${Math.round(chest.odds.legendary * 100)} % Legendär` : ''}`,
      button: priceLabel(chest.price), data: { chest: type }, disabled: wallet < chest.price, odds: `chest:${type}`,
    }));
  }
  wrap.append(el('h3', '', 'Rubbellose'));
  for (const [type, ticket] of Object.entries(TICKETS)) {
    wrap.append(luckCard({
      cls: `ticket-card t-${type}`, icon: '🎟️', title: ticket.name, text: `Bis zu ${fmt(ticket.price * 10)} Chips`,
      button: priceLabel(ticket.price), data: { ticket: type }, disabled: wallet < ticket.price, odds: `ticket:${type}`,
    }));
  }
  wrap.append(el('p', 'shop-note', 'Hier wird nur mit Chips aus dem Spiel gespielt – nie mit echtem Geld. Alle Gewinnchancen findest du unter „Chancen“.'));
  return wrap;
}

function albumView() {
  const wrap = el('div', 'album');
  wrap.append(el('p', 'shop-note', 'Sammle alle Teile eines Sets – dann gibt es einen exklusiven Bonus, den man nirgends kaufen kann.'));
  for (const [id, set] of Object.entries(SETS)) {
    const progress = setProgress(id, owned);
    const bonus = setBonus(id);
    const card = el('div', `album-set${progress.complete ? ' complete' : ''}`);
    const head = el('div', 'album-head');
    head.append(el('span', 'album-icon', set.icon), el('strong', '', set.name), el('span', 'album-count', `${progress.have}/${progress.total}`));
    const bar = el('div', 'xp-bar');
    const fill = el('i');
    fill.style.width = `${Math.round((100 * progress.have) / progress.total)}%`;
    bar.append(fill);
    const items = el('div', 'album-items');
    for (const item of setItems(id)) {
      const has = owned.has(item.id);
      const slot = el('div', `album-item${has ? ' have' : ''}${item.rarity ? ` r-${item.rarity}` : ''}`);
      slot.append(el('span', '', has ? KIND_ICONS[item.kind] : '?'), el('small', '', has ? item.name : SHOP_LABELS[item.kind]));
      slot.title = `${item.name} (${SHOP_LABELS[item.kind]})`;
      items.append(slot);
    }
    const reward = el('div', 'album-reward');
    reward.append(el('span', '', `Bonus: ${bonus.name} (${SHOP_LABELS[bonus.kind]})`));
    if (owned.has(bonus.id)) reward.append(el('b', 'done', 'Freigeschaltet ✓'));
    else if (progress.complete) {
      const claim = el('button', 'btn small-btn gold', 'Abholen!');
      claim.type = 'button';
      claim.dataset.claimSet = id;
      reward.append(claim);
    } else reward.append(el('b', '', '🔒'));
    card.append(head, bar, items, reward);
    wrap.append(card);
  }
  return wrap;
}

function useDesign(kind, id) {
  const setting = SHOP_SETTING[kind];
  if (!setting || !owned.has(id)) return;
  settings[setting] = id;
  saveSettings();
  applyDesign();
  layout();
  renderShop();
  renderBoard();
  renderTray();
  renderWallet();
}

function buyDesign(kind, id) {
  const item = SHOP_ITEMS[kind]?.find((entry) => entry.id === id);
  if (!item || !buyable(item, today()) || (kind === 'extras' ? startBonusReady : owned.has(id))) return;
  const key = `${kind}:${id}`;
  if (confirmBuy !== key) {
    confirmBuy = key;
    clearTimeout(buyDesign.timer);
    buyDesign.timer = setTimeout(() => {
      confirmBuy = null;
      if (!$('shop').hidden) renderShop();
    }, 3000);
    renderShop();
    return;
  }
  confirmBuy = null;
  if (!spend(item.price)) return;
  if (kind === 'extras') {
    startBonusReady = true;
    save('start-bonus', true);
    sounds.chips(item.price);
    renderShop();
    return;
  }
  owned.add(id);
  save('owned', [...owned]);
  sounds.record();
  toast(`${item.name} gekauft!`);
  refreshAchievements();
  useDesign(kind, id);
}

// Effekte, Sounds und Jingles kurz vorführen
function previewDesign(kind, id) {
  unlockAudio();
  if (kind === 'effects') {
    const box = document.querySelector(`[data-preview="${kind}:${id}"]`)?.getBoundingClientRect();
    setFxStyle(id);
    if (box) {
      burst(box.left + box.width / 2, box.top - 40, suitColor(1), 2.5);
      setTimeout(() => burst(box.left + box.width / 2, box.top - 40, suitColor(0), 2), 250);
    }
    setTimeout(() => setFxStyle(settings.effect), 900);
  } else if (kind === 'sounds') {
    setSoundPack(id);
    sounds.place();
    setTimeout(() => sounds.clear(4, 2, 1), 200);
    setTimeout(() => setSoundPack(settings.soundPack), 1800);
  } else if (kind === 'jingles') {
    jingle(id);
  }
}

// ---------- Glücks-Ecke ----------

let reveal = null; // gerade gezeigter Truhen-Inhalt
function grantItem(item) {
  owned.add(item.id);
  save('owned', [...owned]);
  refreshAchievements();
}

function showChest(type, result) {
  reveal = result;
  $('reveal-title').textContent = CHESTS[type].name;
  const chest = $('big-chest');
  chest.dataset.chest = type;
  chest.className = 'big-chest shaking';
  $('reveal-card').hidden = true;
  $('reveal-actions').hidden = true;
  openOverlay('reveal');
  sounds.power();
  vibrate([20, 60, 20, 60, 20]);
  setTimeout(() => {
    chest.className = `big-chest open glow-${result.rarity}`;
    const box = chest.getBoundingClientRect();
    chipBurst(box.left + box.width / 2, box.top + box.height / 3, result.rarity === 'legendary' ? 60 : 24);
    if (result.rarity === 'legendary' || result.rarity === 'epic') {
      sounds.record();
      jingle(settings.jingle === 'jingle-none' ? 'jingle-fanfare' : settings.jingle);
    } else sounds.mission();
    vibrate(result.rarity === 'legendary' ? [40, 30, 40, 30, 120] : [30, 40, 60]);
    const card = $('reveal-card');
    card.className = `reveal-card r-${result.rarity}`;
    card.replaceChildren(
      swatch(result.item, result.item.kind),
      el('strong', 'reveal-name', result.item.name),
      rarityTag(result.item),
      el('small', '', SHOP_LABELS[result.item.kind]),
    );
    if (result.duplicate) {
      card.append(el('div', 'dupe', `Schon im Besitz → +${fmt(result.chips)} Chips`));
      addChips(result.chips);
    } else {
      grantItem(result.item);
      card.append(el('div', 'new-item', 'NEU!'));
    }
    card.hidden = false;
    $('reveal-actions').hidden = false;
    $('reveal-equip').hidden = result.duplicate || !SHOP_SETTING[result.item.kind];
  }, 1400);
}

function buyChest(type) {
  const chest = CHESTS[type];
  if (!chest || !spend(chest.price)) return;
  casino.chests = (casino.chests || 0) + 1;
  saveCasino();
  showChest(type, openChestRoll(type, owned, Math.random));
}

let scratchSource = 'round'; // 'round' (Rundenende) oder 'shop'
function startTicket(type, paid = true) {
  const ticket = TICKETS[type];
  if (!ticket || (paid && !spend(ticket.price))) return;
  scratchSource = 'shop';
  showScratch(ticketPrize(type, Math.random), ticket.name);
}

// Glücksrad: Felder so groß wie ihre Chance
const WHEEL_COLORS = ['#ff3d8b', '#3ee8ff', '#9a2bff', '#ffb52e', '#4dff88', '#ff8a3d', '#ffd34d', '#c8f4ff'];
const WHEEL_ICONS = { 'Bronze-Truhe': '📦', 'Silber-Truhe': '💎', Glückslos: '🎟️' };
let wheelTurn = 0;
function buildWheel() {
  const disc = $('wheel-disc');
  let from = 0;
  const stops = WHEEL.map((field, k) => {
    const to = from + (field.weight / WHEEL_TOTAL) * 360;
    const stop = `${WHEEL_COLORS[k % WHEEL_COLORS.length]} ${from}deg ${to}deg`;
    from = to;
    return stop;
  });
  disc.style.background = `conic-gradient(${stops.join(', ')})`;
  disc.replaceChildren(...WHEEL.map((field, k) => {
    const label = el('span', 'wheel-label', WHEEL_ICONS[field.label] ?? field.label);
    label.style.transform = `rotate(${wheelAngle(k)}deg)`;
    return label;
  }));
}

function openWheel() {
  refreshCasinoDay();
  buildWheel();
  $('wheel-reward').textContent = '';
  $('wheel-spin').disabled = Boolean(casino.wheel);
  $('wheel-spin').textContent = casino.wheel ? 'Morgen wieder' : 'Gratis drehen!';
  $('wheel-info').textContent = casino.wheel ? 'Heute schon gedreht – morgen gibt es den nächsten Gratis-Dreh.' : 'Einmal am Tag gratis drehen';
  openOverlay('wheel');
}

function spinTheWheel() {
  refreshCasinoDay();
  if (casino.wheel) return;
  casino.wheel = true;
  saveCasino();
  const index = spinWheel(Math.random);
  const field = WHEEL[index];
  $('wheel-spin').disabled = true;
  wheelTurn += 360 * 6 + ((360 - wheelAngle(index) - (wheelTurn % 360)) % 360 + 360) % 360;
  $('wheel-disc').style.transform = `rotate(${wheelTurn}deg)`;
  sounds.power();
  for (let k = 0; k < 14; k++) setTimeout(() => sounds.pickup(), 120 + k * k * 18);
  setTimeout(() => {
    $('wheel-spin').textContent = 'Morgen wieder';
    if (field.chips) {
      addChips(field.chips);
      sounds.chips(field.chips);
      $('wheel-reward').textContent = `+${fmt(field.chips)} Chips`;
      const box = $('wheel-disc').getBoundingClientRect();
      chipBurst(box.left + box.width / 2, box.top + box.height / 2, 20);
    } else if (field.chest) {
      casino.chests = (casino.chests || 0) + 1;
      saveCasino();
      $('wheel-reward').textContent = field.label;
      setTimeout(() => showChest(field.chest, openChestRoll(field.chest, owned, Math.random)), 700);
    } else if (field.ticket) {
      $('wheel-reward').textContent = field.label;
      setTimeout(() => startTicket(field.ticket, false), 700);
    }
    renderDots();
  }, 4300);
}

// Spielautomat
let slotBet = SLOT_BETS[0];
let slotBusy = false;
const SLOT_ICON = Object.fromEntries(SLOT_SYMBOLS.map((s) => [s.id, s.icon]));
function renderSlot() {
  refreshCasinoDay();
  $('slot-bets').replaceChildren(...SLOT_BETS.map((bet) => {
    const b = el('button', `btn small-btn${bet === slotBet ? ' active' : ''}`);
    b.type = 'button';
    b.dataset.bet = String(bet);
    b.append(...priceLabel(bet));
    return b;
  }));
  const price = slotPrice(slotBet, casino.spins);
  $('slot-spin').disabled = slotBusy || wallet < price;
  $('slot-spin').textContent = price > slotBet ? `Drehen · ${fmt(price)} (Einsatz ${slotBet})` : `Drehen · ${slotBet}`;
  const cheap = SLOT_CHEAP_SPINS - casino.spins;
  $('slot-left').textContent = cheap > 0
    ? `Noch ${cheap} Drehs heute zum Normalpreis, danach wird es teurer · Guthaben ${fmt(wallet)} Chips`
    : `Heute schon ${casino.spins} Drehs – jeder Dreh kostet jetzt ${fmt(price)} Chips · Guthaben ${fmt(wallet)} Chips`;
}
function openSlot() {
  for (const strip of document.querySelectorAll('.reel-strip')) {
    if (!strip.childElementCount) strip.replaceChildren(el('div', 'reel-sym', '7'));
  }
  $('slot-result').textContent = 'Viel Glück!';
  $('slot-result').className = 'slot-result';
  renderSlot();
  openOverlay('slot');
}
function spinTheSlot() {
  refreshCasinoDay();
  if (slotBusy || !spend(slotPrice(slotBet, casino.spins))) return;
  casino.spins++;
  saveCasino();
  const bet = slotBet;
  const result = spinSlot(bet, Math.random);
  slotBusy = true;
  renderSlot();
  $('slot-result').textContent = '…';
  $('slot-result').className = 'slot-result';
  sounds.power();
  const strips = [...document.querySelectorAll('.reel-strip')];
  strips.forEach((strip, k) => {
    const n = 14 + k * 6;
    const symbols = Array.from({ length: n }, () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)].id);
    symbols.push(result.reels[k]);
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    strip.replaceChildren(...symbols.map((s) => el('div', `reel-sym s-${s}`, SLOT_ICON[s])));
    void strip.offsetHeight;
    strip.style.transition = `transform ${1.1 + k * 0.45}s cubic-bezier(0.15, 0.6, 0.25, 1.04)`;
    strip.style.transform = `translateY(calc(-${n} * var(--sym)))`;
    setTimeout(() => {
      sounds.place();
      vibrate(10);
    }, (1.1 + k * 0.45) * 1000);
  });
  setTimeout(() => {
    slotBusy = false;
    const box = $('slot-result');
    if (result.jackpot) {
      casino.slotJackpots = (casino.slotJackpots || 0) + 1;
      saveCasino();
      const missing = dropPool('legendary').filter((item) => !owned.has(item.id));
      jingle('jingle-orchestra');
      shake('shake-big');
      if (missing.length) {
        const item = missing[Math.floor(Math.random() * missing.length)];
        grantItem(item);
        box.textContent = `👑 JACKPOT! ${item.name} (Legendär)`;
      } else {
        addChips(result.win);
        box.textContent = `👑 JACKPOT! +${fmt(result.win)} Chips`;
      }
      box.className = 'slot-result win big';
      refreshAchievements();
    } else if (result.win) {
      addChips(result.win);
      sounds.chips(result.win);
      sounds.mission();
      box.textContent = `Gewinn: +${fmt(result.win)} Chips`;
      box.className = `slot-result win${result.win >= bet * 8 ? ' big' : ''}`;
    } else {
      box.textContent = 'Leider nichts – nochmal?';
      box.className = 'slot-result';
    }
    if (result.win || result.jackpot) {
      const r = box.getBoundingClientRect();
      chipBurst(r.left + r.width / 2, r.top, result.jackpot ? 60 : Math.min(40, 8 + result.win / bet * 2));
    }
    renderSlot();
  }, (1.1 + 2 * 0.45) * 1000 + 250);
}

// Gewinnchancen offen anzeigen
const pct = (p) => (p >= 0.1 ? `${Math.round(p * 1000) / 10} %` : p >= 0.001 ? `${Math.round(p * 10000) / 100} %` : `${Math.round(p * 100000) / 1000} %`);
let oddsReturn = 'shop';
function showOdds(what) {
  oddsReturn = visibleOverlay() ?? 'shop';
  const table = $('odds-table');
  const rows = [];
  let title = 'Gewinnchancen';
  let note = '';
  if (what.startsWith('chest:')) {
    const chest = CHESTS[what.slice(6)];
    title = chest.name;
    note = 'Jede Truhe enthält einen Gegenstand. Was du schon hast, wird zu Chips.';
    for (const [rarity, chance] of Object.entries(chest.odds)) rows.push([RARITY[rarity].name, pct(chance), `doppelt: ${fmt(RARITY[rarity].dupe)} Chips`]);
  } else if (what.startsWith('ticket:')) {
    const ticket = TICKETS[what.slice(7)];
    title = ticket.name;
    note = `Preis ${fmt(ticket.price)} Chips.`;
    for (const row of TICKET_ODDS) rows.push([row.label, pct(row.chance), row.times ? `${fmt(ticket.price * row.times)} Chips` : '–']);
  } else if (what === 'wheel') {
    title = 'Glücksrad';
    note = 'Jedes Feld ist so groß wie seine Chance.';
    for (const field of WHEEL) rows.push([`${WHEEL_ICONS[field.label] ?? '◉'} ${field.label}${field.chips ? ' Chips' : ''}`, pct(field.weight / WHEEL_TOTAL), '']);
  } else if (what === 'slot') {
    title = 'Gewinntabelle';
    note = `Jede Walze dreht unabhängig. Die ersten ${SLOT_CHEAP_SPINS} Drehs am Tag kosten den Einsatz, danach wird jeder Dreh teurer (alle 10 Drehs +50 %), die Gewinne bleiben gleich. Im Schnitt gibt der Automat ${Math.round(slotReturn() * 100)} von 100 gesetzten Chips zurück.`;
    for (const row of slotOdds()) rows.push([row.label, pct(row.chance), row.pays === 'jackpot' ? 'Legendärer Gegenstand' : `${row.pays} × Einsatz`]);
  }
  $('odds-title').textContent = title;
  $('odds-note').textContent = note;
  table.replaceChildren(...rows.map((cells) => {
    const tr = el('tr');
    tr.append(...cells.map((c) => el('td', '', c)));
    return tr;
  }));
  openOverlay('odds');
}

function claimSet(id) {
  const bonus = setBonus(id);
  if (!bonus || owned.has(bonus.id) || !setProgress(id, owned).complete) return;
  grantItem(bonus);
  casino.sets = [...new Set([...(casino.sets || []), id])];
  saveCasino();
  showChest('gold', { rarity: 'legendary', item: bonus, duplicate: false, chips: 0 });
  $('reveal-title').textContent = `Set ${SETS[id].name} komplett!`;
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
  $('mode-btn').textContent = mode === 'pro' ? 'Zu Normal wechseln' : levelFromXp(xp).level >= 10 ? 'Zu Hart wechseln' : 'Hart · ab Level 10';
  $('mode-btn').disabled = mode !== 'pro' && levelFromXp(xp).level < 10;
}

function startGame(newMode, fresh) {
  if (platformRound && (fresh || newMode !== mode)) finishPlatformRound(state.over ? 'lose' : 'abort');
  mode = newMode;
  settings.mode = mode;
  saveSettings();
  const saved = fresh ? null : loadGame(mode);
  // Eine fertige Runde, deren Truhe schon geöffnet ist, nicht wieder anzeigen: dann neu beginnen
  state = saved && !(saved.over && saved.rewarded) ? saved : freshGame(mode);
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
  else startPlatformRound();
}

function gameOver() {
  if (!state.over) return;
  gameplayActive = false;
  renderUpdateNotice();
  sounds.gameOver();
  vibrate([40, 60, 40]);
  $('final-score').textContent = fmt(state.score);
  $('final-best-label').textContent = mode === 'daily' ? 'Tagesrekord' : mode === 'pro' ? 'Hart-Rekord' : 'Rekord';
  $('final-best').textContent = fmt(best);
  $('final-hand').textContent = state.bestHand >= 0 ? HANDS[state.bestHand].name : '–';
  $('final-lines').textContent = fmt(state.lines);
  $('final-chips').textContent = fmt(state.chips);
  $('new-record').hidden = !(state.score > bestAtStart && state.score > 0);
  const canFree = state.freeContinue !== false;
  const canFold = powerRemaining(state, 'fold') > 0 && wallet >= powerCost(state, 'fold');
  const canBlast = powerRemaining(state, 'blast') > 0 && wallet >= powerCost(state, 'blast') && hasLockedLines(state);
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
  const all = Object.entries(SHOP_ITEMS).filter(([kind]) => kind !== 'extras' && kind !== 'charms')
    .flatMap(([kind, items]) => items.map((item) => ({ ...item, kind })));
  return all.filter((d) => buyable(d) && !owned.has(d.id)).sort((a, b) => a.price - b.price)[0] ?? null;
}

// Runde beenden: Truhe öffnen, Erfahrung gutschreiben, Level-Belohnungen verteilen.
function openChest() {
  if (!state.over || state.rewarded) return;
  finishPlatformRound('lose', { showRank: true });
  state.rewarded = true;
  const reward = chestReward(state, Math.random);
  reward.chips = withCharm(reward.chips, settings.charm);
  const before = xp;
  xp += xpForRound(state);
  save('xp', xp);
  persist();
  // Runde zählt für Statistik, Jackpot wächst, jede 3. Runde gibt es ein Rubbellos
  recordRound(stats, state);
  save('stats', stats);
  refreshAchievements();
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
  refreshAchievements();
  if (giftReturn) openOverlay(giftReturn);
  else {
    closeOverlays();
    startPlatformRound();
  }
}

// ---------- Patchnotes nach einem Update ----------
// Die Webseite liefert /neuigkeiten.json („Was ist neu?“). Einmal pro neuer Version zeigen, nicht für ganz neue Spieler.
let notesReturn = null;
async function showPatchNotes() {
  if (!platform.hosted || !/^\d+\.\d+\.\d+$/.test(version)) return;
  const seen = load('notes-seen', null);
  save('notes-seen', version);
  if (seen === version || (!seen && !stats.games)) return;
  let data = null;
  try {
    const response = await fetch('/neuigkeiten.json', { cache: 'no-store', credentials: 'same-origin' });
    data = response.ok ? await response.json() : null;
  } catch {
    return;
  }
  const minor = version.split('.').slice(0, 2).join('.');
  const note = (data?.['royal-blocks'] ?? []).find((n) => n.version === version || n.version === minor);
  if (!note || !Array.isArray(note.points)) return;
  $('notes-version').textContent = `Neu in Version ${minor}`;
  $('notes-title').textContent = String(note.title ?? 'Was ist neu?');
  $('notes-list').replaceChildren(...note.points.slice(0, 8).map((p) => Object.assign(document.createElement('li'), { textContent: String(p) })));
  const app = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  $('notes-reinstall').hidden = !(note.reinstall === true && app);
  notesReturn = visibleOverlay();
  openOverlay('notes');
}

// ---------- Startbildschirm, Statistik, Teilen, Rubbellos ----------

const dismissedAnnouncements = new Set(
  load('dismissed-announcements', []).filter((id) => Number.isInteger(id) && id >= 0).slice(-50),
);
let visibleAnnouncementId = null;
let cloudReady = false;
let cloudSaved = false;
let cloudTimer = null;
let cloudConflict = null;

function safePlatformLink(value, allowExternal = false) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (!allowExternal) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function platformLink(text, href) {
  const link = document.createElement('a');
  link.textContent = text;
  link.href = href;
  return link;
}

function boardLabel(board) {
  if (board === 'klassisch') return 'Klassisch';
  if (board === 'taeglich') return 'Täglich';
  if (board === 'standard') return 'Normal';
  if (board === 'profi') return 'Hart';
  return board;
}

function renderPlatformAccount(hub) {
  const container = $('platform-account');
  container.replaceChildren();
  const links = hub?.links ?? {};
  if (hub?.user) {
    const user = hub.user;
    const avatar = safePlatformLink(user.avatar_url);
    const picture = avatar?.startsWith('/avatars/')
      ? Object.assign(document.createElement('img'), { className: 'platform-avatar', src: avatar, alt: '' })
      : Object.assign(document.createElement('span'), { className: 'platform-initial', textContent: String(user.initial ?? '?').slice(0, 2) });
    const copy = Object.assign(document.createElement('span'), { className: 'platform-account-copy' });
    copy.append(
      Object.assign(document.createElement('strong'), { textContent: `Angemeldet als ${String(user.display_name ?? '')}` }),
      Object.assign(document.createElement('small'), {
        id: 'cloud-status', textContent: cloudSaved ? 'Fortschritt im Konto gesichert' : 'Fortschritt wird gesichert',
      }),
    );
    const best = user.listed !== false && Array.isArray(hub.best)
      ? hub.best.slice(0, 3).filter((item) => Number.isInteger(item?.rank) && item.rank > 0).sort((a, b) => a.rank - b.rank)[0]
      : null;
    if (best) copy.append(Object.assign(document.createElement('small'), {
      textContent: `🏆 Platz ${best.rank} in ${boardLabel(String(best.board ?? ''))}`,
    }));
    const actions = Object.assign(document.createElement('span'), { className: 'platform-account-actions' });
    const rankings = safePlatformLink(links.rankings);
    const profile = safePlatformLink(user.profile_url ?? links.account);
    if (rankings) actions.append(platformLink('Ranglisten', rankings));
    if (profile) actions.append(platformLink('Profil', profile));
    container.append(picture, copy, actions);
  } else {
    const copy = Object.assign(document.createElement('span'), { className: 'platform-account-copy' });
    copy.append(
      Object.assign(document.createElement('strong'), { textContent: 'Nur auf diesem Gerät – Anmelden' }),
      Object.assign(document.createElement('small'), { textContent: 'Mit Konto werden Punkte und Platzierungen gesichert.' }),
    );
    const actions = Object.assign(document.createElement('span'), { className: 'platform-account-actions' });
    const login = safePlatformLink(links.login);
    const register = safePlatformLink(links.register);
    if (login) actions.append(platformLink('Anmelden', login));
    if (register) actions.append(platformLink('Konto erstellen', register));
    container.append(copy, actions);
  }
  container.hidden = false;
}

function renderPlatformAnnouncement(hub) {
  const banner = $('platform-announcement');
  const announcement = Array.isArray(hub?.announcements)
    ? hub.announcements.find((item) => Number.isInteger(item?.id) && !dismissedAnnouncements.has(item.id))
    : null;
  if (!announcement) {
    visibleAnnouncementId = null;
    banner.hidden = true;
    return;
  }
  visibleAnnouncementId = announcement.id;
  banner.dataset.level = ['success', 'warning'].includes(announcement.level) ? announcement.level : 'info';
  $('announcement-title').textContent = String(announcement.title ?? 'Ankündigung');
  $('announcement-body').textContent = String(announcement.body ?? '');
  const link = $('announcement-link');
  const href = safePlatformLink(announcement.link, true);
  link.hidden = !href;
  if (href) link.href = href;
  banner.hidden = false;
}

function renderPlatformHub(hub) {
  if (!hub || !platform.hosted) return;
  renderPlatformAccount(hub);
  renderPlatformAnnouncement(hub);
}

$('announcement-dismiss').addEventListener('click', () => {
  if (visibleAnnouncementId === null) return;
  dismissedAnnouncements.add(visibleAnnouncementId);
  save('dismissed-announcements', [...dismissedAnnouncements].slice(-50));
  $('platform-announcement').hidden = true;
  visibleAnnouncementId = null;
});

void platform.fetchHub().then(renderPlatformHub);

function parseCloudSnapshot(save) {
  try {
    const snapshot = JSON.parse(save?.data);
    if (snapshot?.version !== 1 || typeof snapshot.values !== 'object' || Array.isArray(snapshot.values)) return null;
    return { ...snapshot, t: Math.max(Number(save.t) || 0, Number(snapshot.t) || 0) };
  } catch {
    return null;
  }
}

function sameProgress(a, b) {
  const clean = (snapshot) => Object.fromEntries(Object.entries(snapshot?.values ?? {}).filter(([key]) => key !== 'sync-t').sort());
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}

function saveDescription(label, snapshot) {
  const summary = snapshotSummary(snapshot);
  const date = summary.t ? new Date(summary.t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'älterer Stand';
  return `${label}: Level ${levelFromXp(summary.xp).level} · ${fmt(summary.chips)} Chips · ${date}`;
}

function showSaveConflict(local, remote) {
  cloudConflict = { local, remote };
  $('choose-local').textContent = saveDescription('Dieses Gerät', local);
  $('choose-cloud').textContent = saveDescription('Konto', remote);
  openOverlay('save-conflict');
}

function markCloudSaved() {
  cloudSaved = true;
  const status = $('cloud-status');
  if (status) status.textContent = 'Fortschritt im Konto gesichert';
}

async function uploadCloudSave({ keepalive = false } = {}) {
  if (!cloudReady || cloudConflict) return;
  let snapshot = exportSnapshot();
  if (!snapshot.t) {
    save('sync-t', Date.now());
    snapshot = exportSnapshot();
  }
  const data = JSON.stringify(snapshot);
  const result = await platform.putCloudSave(data, snapshot.t, [...achievements], { keepalive: keepalive && data.length < 55_000 });
  if (result?.conflict) {
    const remote = parseCloudSnapshot(result.save);
    if (remote && !sameProgress(snapshot, remote)) showSaveConflict(snapshot, remote);
    return;
  }
  if (result?.ok) markCloudSaved();
}

function scheduleCloudSave() {
  if (!cloudReady || cloudConflict || cloudTimer !== null) return;
  cloudTimer = setTimeout(() => {
    cloudTimer = null;
    void uploadCloudSave();
  }, 5_000);
}

function mergeCloudAchievements(ids) {
  const added = Array.isArray(ids) ? ids.filter((id) => id in ACHIEVEMENTS && !achievements.has(id)) : [];
  if (!added.length) return;
  for (const id of added) achievements.add(id);
  save('achievements', [...achievements]);
}

async function initCloudSave() {
  const result = await platform.loadCloudSave();
  if (!result) return;
  mergeCloudAchievements(result.achievements);
  const local = exportSnapshot();
  const remote = parseCloudSnapshot(result.save);
  if (!remote) {
    cloudReady = true;
    await uploadCloudSave();
    return;
  }
  if (!hasProgress(local)) {
    if (importSnapshot(remote)) location.reload();
    return;
  }
  if (!sameProgress(local, remote)) {
    showSaveConflict(local, remote);
    return;
  }
  cloudReady = true;
  markCloudSaved();
}

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
  $('start-play').textContent = freeGame && freeGame.moves > 0 && !freeGame.over ? 'Normal · weiterspielen' : 'Normal spielen';
  const dailyBest = getBest('daily');
  $('start-daily').textContent = `Tages-Challenge ${dayLabel(today())}${dailyBest ? ` · Rekord ${fmt(dailyBest)}` : ''}`;
  const proLevel = levelFromXp(xp).level;
  $('start-pro').disabled = proLevel < 10;
  $('start-pro').textContent = proLevel < 10 ? `🔒 Hart · ab Level 10 (du: ${proLevel})` : `🔥 Hart${getBest('pro') ? ` · Rekord ${fmt(getBest('pro'))}` : ''}`;
}

function showHome() {
  gameplayActive = false;
  renderUpdateNotice();
  setPowerMode(null);
  renderStart();
  renderDots();
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

function refreshAchievements(announce = true) {
  const unlocked = earnedAchievements({
    stats, xp, gift: load('gift', null), proBest: getBest('pro'), casino,
    legendary: ALL_ITEMS.some((item) => item.rarity === 'legendary' && owned.has(item.id)),
    setDone: Object.keys(SETS).some((id) => setProgress(id, owned).complete),
    prestigeDone: MYTHIC_ITEMS.every((item) => owned.has(item.id)),
  });
  const added = unlocked.filter((id) => !achievements.has(id));
  if (!added.length) return;
  for (const id of added) achievements.add(id);
  save('achievements', [...achievements]);
  // Erfolgsstufen bringen Chips (Bronze 50, Silber 150, Gold 500)
  const bonus = added.reduce((sum, id) => sum + (ACHIEVEMENTS[id].chips ?? 0), 0);
  if (bonus) addChips(bonus);
  const first = ACHIEVEMENTS[added[0]];
  const more = added.length > 1 ? ` (+${added.length - 1} weitere)` : '';
  if (announce) toast(`${first.icon} Erfolg: ${first.name}${more}${bonus ? ` · +${fmt(bonus)} Chips` : ''}${first.profile ? ' · auch im Profil!' : ''}`);
}

const MEDALS = { bronze: '🥉', silver: '🥈', gold: '🥇' };
function renderAchievements() {
  refreshAchievements(false);
  // Erfolgsstufen: eine Karte pro Kategorie mit drei Medaillen und Fortschritt zum nächsten Ziel
  const tierCards = TIERED.map((cat) => {
    const { value, reached, next } = tierProgress(cat, stats, casino);
    const card = el('div', `achievement tiered${reached ? ' unlocked' : ''}${reached === 3 ? ' maxed' : ''}`);
    const medals = el('div', 'medals');
    TIERS.forEach((tier, k) => {
      const medal = el('span', `medal${k < reached ? ' on' : ''}`, MEDALS[tier]);
      medal.title = `${TIER_NAMES[tier]}: ${fmt(cat.goals[k])} ${cat.unit} · +${ACHIEVEMENTS[`${cat.id}_${tier}`].chips} Chips`;
      medals.append(medal);
    });
    const bar = el('div', 'xp-bar');
    const fill = el('i');
    const from = reached ? cat.goals[reached - 1] : 0;
    fill.style.width = next ? `${Math.round((100 * (value - from)) / (next - from))}%` : '100%';
    bar.append(fill);
    card.append(
      el('span', 'achievement-icon', cat.icon), el('strong', '', cat.name), medals, bar,
      el('small', '', next ? `${fmt(value)} / ${fmt(next)} ${cat.unit}` : `Alle Stufen geschafft – ${fmt(value)} ${cat.unit}`),
    );
    return card;
  });
  const single = Object.entries(ACHIEVEMENTS).filter(([, a]) => !a.tier).map(([id, achievement]) => {
    const unlocked = achievements.has(id);
    const item = document.createElement('div');
    item.className = `achievement${unlocked ? ' unlocked' : ''}`;
    item.append(
      Object.assign(document.createElement('span'), { className: 'achievement-icon', textContent: unlocked ? achievement.icon : '🔒' }),
      Object.assign(document.createElement('strong'), { textContent: achievement.name }),
      Object.assign(document.createElement('small'), { textContent: unlocked ? 'Freigeschaltet ✓' : achievement.how }),
    );
    if (achievement.profile) {
      item.classList.add('profile');
      item.append(Object.assign(document.createElement('em'), { textContent: 'Schaltet auch etwas in deinem Profil auf bens-games.de frei' }));
    }
    return item;
  });
  const total = Object.keys(ACHIEVEMENTS).length;
  const done = Object.keys(ACHIEVEMENTS).filter((id) => achievements.has(id)).length;
  $('achievement-count').textContent = `${done} von ${total} Erfolgen · jede Stufe zählt auch auf bens-games.de`;
  $('achievement-list').replaceChildren(
    el('h3', 'achievement-group', 'Stufen: Bronze · Silber · Gold'), ...tierCards,
    el('h3', 'achievement-group', 'Besondere Erfolge'), ...single,
  );
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
  const url = platform.hosted
    ? new URL(leaderboardPath(leaderboardBoard(mode)), location.origin).href
    : new URL('./', location.href).href;
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

// Gratis-Los nach jeder 3. Runde
function openScratch() {
  if (!scratchReady) return;
  scratchSource = 'round';
  showScratch(scratchPrize(Math.random), 'Rubbellos', () => {
    scratchReady = false;
    save('scratch-ready', false);
    $('scratch-btn').hidden = true;
  });
}

function showScratch(prize, title, onReveal = () => {}) {
  $('scratch-title').textContent = title;
  $('scratch-reward').textContent = '';
  $('scratch-done').hidden = true;
  openOverlay('scratch');
  createScratchCard($('scratch-area'), prize, (card) => {
    onReveal();
    if (prize.chips) addChips(prize.chips);
    $('scratch-reward').textContent = prize.chips ? `+${fmt(prize.chips)} Chips${prize.tier >= 2 ? ' – Volltreffer!' : ''}` : 'Leider nichts – beim nächsten Mal!';
    $('scratch-done').hidden = false;
    const box = card.getBoundingClientRect();
    if (prize.chips) chipBurst(box.left + box.width / 2, box.top + box.height / 2, 12 + prize.tier * 12);
    if (prize.tier >= 2) sounds.record();
    else if (prize.chips) sounds.mission();
    else sounds.invalid();
    if (prize.chips) sounds.chips(prize.chips);
    vibrate(prize.tier >= 2 ? [40, 30, 40, 30, 80] : [20, 30, 20]);
  });
}

const actions = {
  resume() {
    closeOverlays();
    if (!settings.seenHelp) {
      settings.seenHelp = true;
      saveSettings();
      checkGift('start');
    }
    if (!visibleOverlay()) startPlatformRound();
  },
  'free-continue'() {
    if (!useFreeContinue(state)) return;
    sounds.power();
    gameplayActive = true;
    renderUpdateNotice();
    closeOverlays();
    renderTray(true);
    persist();
    if (state.over) setTimeout(gameOver, 600);
  },
  'open-chest': openChest,
  'claim-gift': claimGift,
  home: showHome,
  play() {
    if (mode !== 'free' || (state.over && state.rewarded)) return startGame('free', false);
    closeOverlays();
    if (state.over) gameOver();
    else startPlatformRound();
  },
  'play-daily': () => startGame('daily', false),
  'play-pro': () => {
    if (levelFromXp(xp).level < 10) return toast('Hart wird ab Level 10 freigeschaltet');
    startGame('pro', false);
  },
  async 'choose-local-save'() {
    if (!cloudConflict) return;
    cloudConflict = null;
    save('sync-t', Date.now());
    cloudReady = true;
    showHome();
    await uploadCloudSave();
  },
  'choose-cloud-save'() {
    if (!cloudConflict) return;
    const remote = cloudConflict.remote;
    cloudConflict = null;
    if (!importSnapshot(remote)) return toast('Kontostand konnte nicht geladen werden');
    save('achievements', [...achievements]);
    location.reload();
  },
  stats() {
    returnTo = visibleOverlay() ?? 'menu';
    renderStats();
    openOverlay('stats');
  },
  achievements() {
    returnTo = visibleOverlay() ?? 'start';
    renderAchievements();
    openOverlay('achievements');
  },
  share: shareScore,
  scratch: openScratch,
  'scratch-done': () => (scratchSource === 'shop' ? actions['shop-luck']() : openOverlay('gameover')),
  back: () => {
    if (returnTo === 'start') renderStart();
    openOverlay(returnTo);
  },
  help: () => showHelp(1),
  'help-page': () => showHelp(helpPage === 1 ? 2 : 1),
  shop() {
    const from = visibleOverlay();
    if (from !== 'shop') returnTo = from ?? 'menu';
    shopMain = 'buy';
    if (limitedNew()) shopCat = 'limited';
    renderShop();
    openOverlay('shop');
  },
  'shop-luck'() {
    shopMain = 'luck';
    renderShop();
    openOverlay('shop');
  },
  'open-wheel': openWheel,
  'wheel-spin': spinTheWheel,
  'open-slot': openSlot,
  'slot-spin': spinTheSlot,
  'reveal-equip'() {
    if (reveal && !reveal.duplicate) useDesign(reveal.item.kind, reveal.item.id);
    actions['reveal-done']();
  },
  'reveal-done'() {
    reveal = null;
    if (shopMain === 'album') renderShop();
    else shopMain = 'luck';
    renderShop();
    openOverlay('shop');
  },
  'odds-back': () => openOverlay(oddsReturn),
  'notes-done': () => (notesReturn ? openOverlay(notesReturn) : closeOverlays()),
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
  'switch-mode': () => startGame(mode === 'pro' ? 'free' : 'pro', false),
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
window.addEventListener('resize', () => {
  layout();
  fitTray();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

$('menu-btn').addEventListener('click', () => {
  unlockAudio();
  if (powerMode) setPowerMode(null);
  openOverlay('menu');
});
document.addEventListener('click', (e) => {
  const target = e.target.closest(
    '[data-action], [data-power], [data-suit], [data-buy], [data-use], [data-preview], [data-shop-main], [data-shop-cat], [data-chest], [data-ticket], [data-odds], [data-bet], [data-claim-set]',
  );
  if (!target || target.disabled) return;
  unlockAudio();
  const d = target.dataset;
  if (d.action) actions[d.action]?.();
  else if (d.power) usePower(d.power);
  else if (d.suit) chooseSuit(Number(d.suit));
  else if (d.buy) buyDesign(...d.buy.split(':'));
  else if (d.use) useDesign(...d.use.split(':'));
  else if (d.preview) previewDesign(...d.preview.split(':'));
  else if (d.shopMain) {
    shopMain = d.shopMain;
    confirmBuy = null;
    renderShop();
    $('shop-body').scrollTop = 0;
  } else if (d.shopCat) {
    shopCat = d.shopCat;
    confirmBuy = null;
    renderShop();
    $('shop-body').scrollTop = 0;
  } else if (d.chest) buyChest(d.chest);
  else if (d.ticket) startTicket(d.ticket);
  else if (d.odds) showOdds(d.odds);
  else if (d.bet) {
    slotBet = Number(d.bet);
    renderSlot();
  } else if (d.claimSet) claimSet(d.claimSet);
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
    void uploadCloudSave({ keepalive: true });
    stopMusic();
  } else if (settings.music) {
    startMusic();
  }
});

let endedByPageHide = false;
window.addEventListener('pagehide', () => {
  if (platformRound) finishPlatformRound(state.over ? 'lose' : 'abort', { keepalive: true });
  void uploadCloudSave({ keepalive: true });
  endedByPageHide = true;
});
window.addEventListener('pageshow', () => {
  if (endedByPageHide && !state.over && !visibleOverlay()) startPlatformRound();
  endedByPageHide = false;
});

// iPhone/iPad: Ton erst nach einer echten Berührung freischalten – bei jeder Art von Eingabe versuchen
for (const type of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(type, unlockAudio, { capture: true, passive: true });

if (state.over && !state.rewarded) gameOver();
else if (!settings.seenHelp) showHelp(1);
else {
  showHome();
  checkGift('start');
}
onSave(scheduleCloudSave);
void initCloudSave();
setTimeout(() => void showPatchNotes(), 1200);

// Offline-Betrieb (nur im gebauten Spiel; beim Entwickeln würde der Cache stören)
if (version !== 'dev' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then((registration) => {
      const offerUpdate = (worker) => {
        waitingWorker = worker;
        renderUpdateNotice();
      };
      if (registration.waiting) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && registration.active) offerUpdate(worker);
        });
      });
    }).catch(() => {});
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) location.reload();
  });
  $('update-reload').addEventListener('click', () => {
    if (!waitingWorker || gameplayActive) return;
    reloadRequested = true;
    $('update-reload').disabled = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });
}
