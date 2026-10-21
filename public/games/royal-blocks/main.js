// Anzeige und Bedienung von Royal Blocks.

import {
  POWER_COSTS, SIZE, STREAK_GRACE, blastAt, canPlace, createGame, findFullLines, fitsAnywhere, foldTray, hasLockedLines, idx,
  missionText, placePiece, previewPlacement, recolorPiece, requirementFor, streakMultiplier, updateOver,
} from './game.js';
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
  { id: 'gold', name: 'Gold-Casino', price: 800, color: '#041a12' },
  { id: 'ice', name: 'Eis', price: 1500, color: '#06182a' },
  { id: 'retro', name: 'Retro-Arcade', price: 2500, color: '#000000' },
];
const TILE_STYLES = [
  { id: 'standard', name: 'Standard', price: 0 },
  { id: 'glass', name: 'Glas', price: 600 },
  { id: 'pixel', name: 'Pixel', price: 1200 },
  { id: 'chip', name: 'Chip', price: 2000 },
];

// ---------- Gespeicherte Daten ----------

const settings = {
  sound: true, music: true, vibration: true, seenHelp: false, theme: 'neon', tiles: 'standard', mode: 'free',
  ...load('settings', {}),
};
const saveSettings = () => save('settings', settings);
let wallet = Math.max(0, Number(load('chips', 0)) || 0);
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

function layout() {
  const w = Math.min(window.innerWidth, 560) - 24;
  // Kopfzeile, Mindesthand + Auftrag, Vorschau, Spezialzüge, Abstände
  const h = window.innerHeight - 60 - 50 - 26 - 42 - 8 - 30;
  gap = window.innerWidth < 380 ? 2 : 3;
  const byWidth = (w - 2 - 9 * gap) / 8;
  const byHeight = (h - 2 - 9 * gap) / 11.2; // 8 Feld-Reihen + Ablage
  cell = Math.max(22, Math.floor(Math.min(byWidth, byHeight, 60)));
  root.style.setProperty('--cell', `${cell}px`);
  root.style.setProperty('--gap', `${gap}px`);
}

// ---------- Darstellung ----------

function tile(card, style = settings.tiles) {
  const el = document.createElement('div');
  el.className = card.j ? `tile joker t-${style}` : `tile s${card.s} t-${style}`;
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

const cardKey = (card) => (card ? (card.j ? 'j' : `${card.r}${card.s}`) + settings.tiles : '');

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
  for (const el of cellEls) el.classList.remove('locked');
  for (const line of findFullLines(state.board)) for (const i of line.cells) cellEls[i].classList.add('locked');
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

function moveDrag(e) {
  const { piece } = drag;
  const pw = piece.w * cell + (piece.w - 1) * gap;
  const ph = piece.h * cell + (piece.h - 1) * gap;
  const left = e.clientX - pw / 2;
  // Mit dem Finger schwebt das Teil darüber, damit man sieht, wohin es kommt.
  const top = drag.touch ? e.clientY - ph - cell * 1.1 : e.clientY - ph / 2;
  els.drag.style.transform = `translate(${left}px, ${top}px)`;

  const o = boardOrigin();
  const pitch = cell + gap;
  const x = Math.round((left - o.x) / pitch);
  const y = Math.round((top - o.y) / pitch);
  const valid = canPlace(state.board, piece, x, y);
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
  // zurück in die Ablage
  if (e.type === 'pointerup') sounds.invalid();
  const r = els.slots[d.slot].getBoundingClientRect();
  const pw = d.piece.w * cell;
  const ph = d.piece.h * cell;
  els.drag.classList.add('back');
  els.drag.style.transform = `translate(${r.left + r.width / 2 - pw / 2}px, ${r.top + r.height / 2 - ph / 2}px) scale(0.56)`;
  setTimeout(() => {
    els.drag.className = 'drag';
    els.slots[d.slot].classList.remove('dragging');
  }, 180);
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
  if (res.mission) queueBanner(() => missionEffects(res.mission));
  renderMission();
  if (res.levelUp) queueBanner(levelUpEffects, 300);
  renderWallet();

  if (state.score > best) {
    if (best > 0 && bestAtStart === best) sounds.record();
    best = state.score;
    setBest(mode, best);
  }
  renderScore();
  persist();

  if (res.over) setTimeout(gameOver, Math.max(700, bannerAt - performance.now()));
}

function flyOut(removed, handCells, power) {
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
    setTimeout(() => burst(x, y, suitColor(card.j ? -1 : card.s), power), (handCells.has(i) ? 450 : 200) + delay);
  }
}

function clearEffects(res) {
  const handCells = new Set(res.lines.flatMap((l) => l.handCells));
  const top = res.lines.reduce((a, b) => (b.hand.level > a.hand.level ? b : a));
  const level = top.hand.level;
  flyOut(res.removed, handCells, 1 + level * 0.25);

  const box = els.board.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  if (level >= 4) setTimeout(() => chipBurst(cx, cy, 8 + level * 3), 350);
  if (res.tableClear) setTimeout(() => chipBurst(cx, cy, 40), 500);

  const tier = level >= 7 ? 3 : level >= 4 ? 2 : level >= 2 ? 1 : 0;
  const extras = [];
  if ([...res.removed.values()].some((c) => c.j)) extras.push('Joker!');
  if (res.lines.length > 1) extras.push(`Kombo ×${res.combo}`);
  if (res.streak > 1) extras.push(`Serie ×${res.streakMult}`);
  if (res.tableClear) extras.push('Tisch leer!');
  if (res.near) extras.push(`Fast ein ${res.near.name}!`);
  bannerAt = 0;
  queueBanner(() =>
    showBanner({ title: top.hand.name, tier, extra: extras.join(' · '), points: `+${fmt(res.points)}  ·  +${res.chips} Chips` }),
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

function showBanner({ title, tier, extra, points }) {
  const name = document.createElement('div');
  name.className = `hand-name tier${tier}`;
  name.textContent = title;
  els.banner.replaceChildren(name);
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
  const canFold = wallet >= POWER_COSTS.fold;
  const canBlast = wallet >= POWER_COSTS.blast && hasLockedLines(state);
  $('rescue').hidden = !canFold && !canBlast;
  renderWallet();
  openOverlay('gameover');
}

const actions = {
  resume() {
    closeOverlays();
    if (!settings.seenHelp) {
      settings.seenHelp = true;
      saveSettings();
    }
  },
  back: () => openOverlay('menu'),
  help: () => openOverlay('help'),
  shop() {
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

if (state.over) gameOver();
else if (!settings.seenHelp) openOverlay('help');

// Offline-Betrieb (nur im gebauten Spiel; beim Entwickeln würde der Cache stören)
if (version !== 'dev' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}
