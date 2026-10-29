// Bildschirm von Drei Fronten: Startseite, Spielfeld, Dialoge. Die Regeln stehen in engine.js.

import { CARD_BY_ID, CARDS, DECKS, ELEMENTS, FRONT_BY_ID, RARITIES } from './cards.js';
import { cleanOwned, matchReward, openPack, ownedCount, PACKS, randomDeck, START_COINS, WEIGHTS } from './collection.js';
import * as E from './engine.js';
import { acceptDrum, planBot } from './bot.js';
import { createPlatformClient, leaderboardPath, platformHosted } from './platform.js';
import { OPPONENT_BY_ID, OPPONENTS } from './opponents.js';
import { CHAPTER_BY_ID, CHAPTERS } from './campaign.js';
import { TUTORIAL } from './tutorial.js';
import { createApiTransport, createLocalTransport, mirrorFrame, mirrorState } from './online.js';
import { ACHIEVEMENTS, goalOf, progressOf, readyToClaim, titlesFor } from './achievements.js';
import { play, setMusic, setSound, unlockAudio } from './audio.js';
import { cardBurst, confetti, frontEffect, FX_OF, shake } from './fx.js';
import {
  ALL_CARD_IDS, averageCost, canAdd, cleanDeck, copies, CUSTOM_IDS, DECK_SIZE, deckReady, enemyDeckFor, isCustom, MAX_COPIES, sortCards,
} from './decks.js';

const $ = (selector) => document.querySelector(selector);
const version = document.documentElement.dataset.version;
const STORE = 'drei-fronten:v1';
const STEP_MS = 650;
// Rangliste auf bens-games.de: Ruhm-Serie = Summe der Sterne besiegter Gegner ohne Niederlage dazwischen.
const BOARD = 'ruhm';
const platform = createPlatformClient({ version });

let state = null;
const ui = {
  page: 'home', filter: 'alle', plan: [], selected: null, drum: false, bot: null,
  busy: false, fast: false, reveal: false, frame: null, seen: new Set(),
};

// ---------- Speicher (nur dieses Gerät) ----------

const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);

function loadSave() {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(STORE) ?? '{}') ?? {};
  } catch { /* kaputter oder gesperrter Speicher: neu anfangen */ }
  const owned = cleanOwned(data.owned);
  const custom = Object.fromEntries(CUSTOM_IDS.map((id) => [id, cleanDeck(data.custom?.[id], owned)]));
  let deck = DECKS[data.deck] || isCustom(data.deck) ? data.deck : 'flammen';
  if (isCustom(deck) && !deckReady(custom[deck])) deck = 'flammen';
  return {
    deck,
    custom,
    owned,
    coins: Number.isInteger(data.coins) ? count(data.coins) : START_COINS,
    pity: count(data.pity),
    lastWinDay: typeof data.lastWinDay === 'string' ? data.lastWinDay : '',
    packsOpened: count(data.packsOpened),
    opponent: OPPONENT_BY_ID[data.opponent] ? data.opponent : data.level === 'kriegsherr' ? 'varok' : 'lio',
    wins: count(data.wins),
    losses: count(data.losses),
    streak: count(data.streak),
    rulesSeen: data.rulesSeen === true,
    tutorialDone: data.tutorialDone === true,
    golden: Object.fromEntries(Object.keys(data.golden ?? {}).filter((id) => CARD_BY_ID[id] && !CARD_BY_ID[id].token).map((id) => [id, true])),
    campaign: Math.min(CHAPTERS.length, count(data.campaign)),
    stats: Object.fromEntries(Object.entries(data.stats ?? {}).map(([key, value]) => [key, count(value)])),
    claimed: Array.isArray(data.claimed) ? data.claimed.filter((id) => ACHIEVEMENTS.some((entry) => entry.id === id)) : [],
    title: typeof data.title === 'string' ? data.title : '',
    sound: data.sound !== false,
    music: data.music !== false,
    ruhm: count(data.ruhm),
    ruhmBest: count(data.ruhmBest),
    dismissed: Array.isArray(data.dismissed) ? data.dismissed.filter(Number.isInteger).slice(-50) : [],
    lastVersion: typeof data.lastVersion === 'string' ? data.lastVersion.slice(0, 20) : '',
    t: count(data.t),
    syncedT: count(data.syncedT),
  };
}
const save = loadSave();
function write() {
  try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* privates Fenster */ }
}
// Speichern mit neuem Zeitstempel; mit Konto wird der Stand ein paar Sekunden später auch im Konto gesichert.
function store() {
  save.t = Date.now();
  write();
  scheduleCloud();
}

// ---------- Konto: Spielstand auf bens-games.de sichern (docs/spielstaende-api.md der Webseite) ----------

let cloudReady = false;
let cloudTimer = null;
let pendingRemote = null;

const hasProgress = (data) => (data.wins ?? 0) + (data.losses ?? 0) > 0 || (data.packsOpened ?? 0) > 0 || (data.campaign ?? 0) > 0;

function progressSummary(data) {
  const owned = Object.values(data.owned ?? {}).filter((value) => value > 0).length;
  return `${data.wins ?? 0} Siege · ${owned} Karten · Kampagne ${data.campaign ?? 0}/${CHAPTERS.length} · ${data.coins ?? 0} Münzen`;
}

function scheduleCloud() {
  if (!cloudReady) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => void pushCloud(), 5000);
}

async function pushCloud({ keepalive = false } = {}) {
  if (!cloudReady) return;
  clearTimeout(cloudTimer);
  cloudTimer = null;
  const result = await platform.putCloudSave(JSON.stringify(save), save.t, save.claimed, { keepalive });
  if (result?.ok) {
    save.syncedT = save.t;
    write();
  } else if (result?.conflict && result.save?.data) {
    applyRemote(result.save.data, result.save.t);
  }
}

// Konto-Stand übernehmen. Mitten in einer Partie erst danach, damit nichts verloren geht.
function applyRemote(data, t) {
  let parsed;
  try { parsed = JSON.parse(data); } catch { return; }
  if (!parsed || typeof parsed !== 'object') return;
  parsed.syncedT = t;
  parsed.t = t;
  if (!$('#game').hidden) { pendingRemote = parsed; return; }
  try { localStorage.setItem(STORE, JSON.stringify(parsed)); } catch { return; }
  location.reload();
}

async function connectAccount() {
  const remote = await platform.loadCloudSave();
  if (!remote) return;
  cloudReady = true;
  const cloud = remote.save;
  if (!cloud?.data) { void pushCloud(); return; }
  if (cloud.t === save.t) return;
  let parsed;
  try { parsed = JSON.parse(cloud.data); } catch { void pushCloud(); return; }
  if (!hasProgress(save)) { applyRemote(cloud.data, cloud.t); return; }
  if (save.syncedT) {
    // Dieses Gerät war schon verbunden: der neuere Stand gewinnt.
    if (cloud.t > save.t) applyRemote(cloud.data, cloud.t); else void pushCloud();
    return;
  }
  const body = h('div', 'save-choice');
  body.append(
    h('p', '', 'Auf diesem Gerät und in deinem Konto liegen verschiedene Spielstände. Welcher soll bleiben?'),
    h('p', 'save-option', `📱 Dieses Gerät: ${progressSummary(save)}`),
    h('p', 'save-option', `☁️ Konto: ${progressSummary(parsed)}`),
  );
  const choice = await dialog('Spielstand wählen', body, [
    { label: 'Dieses Gerät', value: 'local' }, { label: 'Konto', value: 'cloud', primary: true },
  ]);
  if (choice === 'cloud') applyRemote(cloud.data, cloud.t);
  else {
    store();
    void pushCloud();
  }
}

// ---------- Startseite: Anmeldung, Ankündigungen (docs/spiele-anbindung.md der Webseite) ----------

const safeLink = (link) => (typeof link === 'string' && (/^\/(?!\/)/.test(link) || /^https:\/\//.test(link)) ? link : null);

function linkButton(label, href, primary = false) {
  const link = h('a', primary ? 'big-btn small-btn' : 'plain-btn small-btn', label);
  link.href = href;
  return link;
}

function renderAccount(hub) {
  const box = $('#account-box');
  if (!hub) { box.hidden = true; return; }
  box.replaceChildren();
  box.hidden = false;
  const user = hub.user;
  const links = hub.links ?? {};
  if (user) {
    const avatar = h('div', 'account-avatar');
    if (safeLink(user.avatar_url)) {
      const image = h('img');
      image.src = user.avatar_url;
      image.alt = '';
      avatar.append(image);
    } else avatar.textContent = String(user.initial ?? '?').slice(0, 2);
    const text = h('div', 'account-text');
    const name = h('span', '', 'Angemeldet als ');
    name.append(h('b', '', String(user.display_name ?? '')));
    text.append(name, h('span', 'account-sub', 'Fortschritt wird im Konto gesichert'));
    const best = (hub.best ?? []).find((entry) => entry.board === BOARD);
    if (best?.rank) text.append(h('span', 'account-rank', `🏆 Platz ${best.rank} in der Ruhm-Rangliste`));
    box.append(avatar, text);
    const buttons = h('div', 'account-buttons');
    buttons.append(linkButton('Rangliste', leaderboardPath(BOARD)));
    if (safeLink(user.profile_url)) buttons.append(linkButton('Mein Profil', user.profile_url));
    box.append(buttons);
  } else {
    box.append(h('p', 'account-text', 'Mit Konto spielst du auf allen Geräten weiter und erscheinst in der Rangliste.'));
    const buttons = h('div', 'account-buttons');
    if (safeLink(links.login)) buttons.append(linkButton('Anmelden', links.login, true));
    if (safeLink(links.register)) buttons.append(linkButton('Konto erstellen', links.register));
    box.append(buttons);
  }
}

function renderAnnouncement(hub) {
  const box = $('#announcement');
  const entry = (hub?.announcements ?? []).find((item) => Number.isInteger(item.id) && !save.dismissed.includes(item.id));
  if (!entry) { box.hidden = true; return; }
  box.className = `announcement level-${['info', 'success', 'warning'].includes(entry.level) ? entry.level : 'info'}`;
  box.replaceChildren();
  const text = h('div', 'announcement-text');
  text.append(h('b', '', String(entry.title ?? '')));
  if (entry.body) text.append(h('span', '', String(entry.body)));
  const link = safeLink(entry.link);
  if (link) {
    const more = h('a', 'announcement-link', 'Mehr →');
    more.href = link;
    text.append(more);
  }
  const close = h('button', 'announcement-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Ausblenden');
  close.addEventListener('click', () => {
    save.dismissed = [...save.dismissed, entry.id].slice(-50);
    write();
    renderAnnouncement(hub);
  });
  box.append(text, close);
  box.hidden = false;
}

async function loadHub() {
  const hub = await platform.fetchHub();
  renderAccount(hub);
  renderAnnouncement(hub);
}

// Nach einem Update einmal die Neuigkeiten dieser Version zeigen (nicht beim allerersten Start).
async function showPatchNotes() {
  if (!/^\d+\.\d+\.\d+$/.test(version) || save.lastVersion === version) return;
  const previous = save.lastVersion;
  save.lastVersion = version;
  write();
  if (!previous || !platform.hosted) return;
  try {
    const response = await fetch('/neuigkeiten.json', { cache: 'no-store', credentials: 'same-origin' });
    const notes = response.ok ? (await response.json())['drei-fronten'] : null;
    const short = version.split('.').slice(0, 2).join('.');
    const entry = Array.isArray(notes) ? notes.find((item) => item.version === short || item.version === version) : null;
    if (!entry) return;
    const body = h('div', 'patch-notes');
    const list = h('ul');
    for (const point of entry.points ?? []) list.append(h('li', '', String(point)));
    body.append(list);
    await dialog(`Neu in Version ${short}: ${String(entry.title ?? '')}`, body, [{ label: 'Weiter', value: true, primary: true }]);
  } catch { /* offline: dann eben beim nächsten Mal nicht */ }
}

// Neue Version im Hintergrund geladen: Hinweis zeigen, aber nie mitten in einer Partie neu laden.
function watchUpdates(registration) {
  const offer = (worker) => {
    $('#update-banner').hidden = false;
    $('#update-btn').onclick = () => {
      if (!$('#game').hidden) { toast('Bitte erst die Partie beenden.'); return; }
      worker.postMessage({ type: 'SKIP_WAITING' });
    };
  };
  if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
    });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

// ---------- Kleine Helfer ----------

function h(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ui.fast ? Math.min(ms, 60) : ms));

function toast(text) {
  const element = $('#toast');
  element.textContent = text;
  element.classList.remove('show');
  void element.offsetWidth;
  element.classList.add('show');
}

function dialog(title, body, buttons) {
  return new Promise((resolve) => {
    $('#dialog-title').textContent = title;
    const box = $('#dialog-body');
    box.replaceChildren();
    if (typeof body === 'string') for (const line of body.split('\n')) box.append(h('p', '', line));
    else if (body) box.append(body);
    const row = $('#dialog-buttons');
    row.replaceChildren();
    for (const button of buttons) {
      const element = h('button', button.primary ? 'big-btn' : 'plain-btn', button.label);
      element.type = 'button';
      element.addEventListener('click', () => {
        $('#dialog').hidden = true;
        resolve(button.value);
      });
      row.append(element);
    }
    $('#dialog').hidden = false;
  });
}

// ---------- Karten zeichnen ----------

// Kartenbild aus karten/<id>.webp; fehlt es, bleibt das Emoji als Ersatz.
const missingArt = new Set();

function artElement(id, className) {
  const def = CARD_BY_ID[id];
  const box = h('div', className);
  if (missingArt.has(id)) {
    box.append(h('span', 'art-fallback', def.art));
    return box;
  }
  const image = h('img');
  image.src = `karten/${id}.webp`;
  image.alt = '';
  image.draggable = false;
  image.addEventListener('error', () => {
    missingArt.add(id);
    image.replaceWith(h('span', 'art-fallback', def.art));
  }, { once: true });
  box.append(image);
  return box;
}

// Gemaltes Symbol aus symbole/<name>.webp (Banner, Trommel, Energie, Krone, Schild, Münze, Paket, Sieg, Niederlage).
function symbol(name, className = 'sym') {
  const image = h('img', className);
  image.src = `symbole/${name}.webp`;
  image.alt = '';
  image.draggable = false;
  return image;
}

// Text mit Münz-Symbol dahinter, z. B. „+40 (Münze)“.
function coinText(text, className = '') {
  const box = h('span', `coin-text ${className}`.trim(), text);
  box.append(symbol('muenze', 'sym coin'));
  return box;
}

// Gegner-Porträt aus gegner/<id>.webp; fehlt es, dient das Kartenbild als Ersatz.
function avatarElement(opponent, className) {
  if (opponent.online) {
    const box = h('div', `${className} online-avatar`);
    if (opponent.avatarUrl) {
      const image = h('img');
      image.src = opponent.avatarUrl;
      image.alt = '';
      box.append(image);
    } else box.textContent = opponent.name.replace(/^Gast\s*/, '').slice(0, 2).toUpperCase();
    return box;
  }
  if (missingArt.has(`gegner:${opponent.id}`)) return artElement(opponent.portrait, className);
  const box = h('div', className);
  const image = h('img');
  image.src = `gegner/${opponent.id}.webp`;
  image.alt = `${opponent.name} ${opponent.title}`;
  image.draggable = false;
  image.addEventListener('error', () => {
    missingArt.add(`gegner:${opponent.id}`);
    box.replaceWith(artElement(opponent.portrait, className));
  }, { once: true });
  box.append(image);
  return box;
}

// golden: goldene Version zeigen (Standard: wenn man sie besitzt).
function cardElement(id, { cost, small, golden = Boolean(save.golden[id]) } = {}) {
  const def = CARD_BY_ID[id];
  const card = h('div', `card el-${def.element} ${def.type} rar-${def.rarity ?? 'gewoehnlich'}${small ? ' small' : ''}${golden ? ' golden' : ''}`);
  card.append(artElement(id, 'art'));
  card.append(h('span', 'cost', String(cost ?? def.cost)));
  if (def.type === 'wesen') card.append(h('span', 'power', String(def.power)));
  else card.append(h('span', 'kind', 'Aktion'));
  const name = h('div', 'name');
  if (def.rarity) {
    const gem = h('span', 'gem');
    gem.title = RARITIES[def.rarity].name;
    name.append(gem);
  }
  name.append(def.name);
  card.append(name);
  if (!small) card.append(h('div', 'text', def.text || 'Keine Fähigkeit – einfach stark.'));
  return card;
}

function chipElement(entry, { hidden, pending, focus } = {}) {
  if (hidden) {
    const chip = h('div', 'chip hidden-chip');
    chip.dataset.uid = entry.uid;
    const back = h('span', 'chip-art');
    const image = h('img');
    image.src = 'rueckseite.webp';
    image.alt = '';
    back.append(image);
    chip.append(back, h('span', 'chip-name', 'Verdeckt'), h('span', 'chip-power', '?'));
    return chip;
  }
  const def = CARD_BY_ID[entry.id];
  const shiny = entry.owner !== 1 && save.golden[entry.id];
  const chip = h('div', `chip el-${def.element}${pending ? ' pending' : ''}${focus ? ' focus' : ''}${shiny ? ' golden' : ''}`);
  if (!pending && !ui.seen.has(entry.uid)) {
    ui.seen.add(entry.uid);
    chip.classList.add('new');
  }
  chip.dataset.uid = entry.uid;
  const value = pending ? def.power : entry.power;
  const powerElement = h('span', 'chip-power', String(value));
  if (!pending && value > def.power) powerElement.classList.add('up');
  if (!pending && value < def.power) powerElement.classList.add('down');
  chip.append(artElement(entry.id, 'chip-art'), h('span', 'chip-name', def.name), powerElement);
  return chip;
}

function showInfo(id, extra) {
  if (ui.coach) { renderCoach(); return; }
  const info = $('#info');
  info.replaceChildren();
  if (!id) {
    info.append(h('span', 'hint', extra ?? ''));
    return;
  }
  const def = CARD_BY_ID[id];
  const thumb = artElement(id, 'info-art');
  thumb.title = 'Groß anzeigen';
  thumb.addEventListener('click', () => showCardBig(id));
  const body = h('div', 'info-body');
  const meta = def.type === 'wesen'
    ? ` · ${ELEMENTS[def.element].icon} ${ELEMENTS[def.element].name} · Kosten ${def.cost} · Stärke ${def.power}`
    : ` · Aktion · Kosten ${def.cost}`;
  body.append(h('b', '', def.name), h('span', 'meta', meta), h('div', 'info-text', def.text || 'Keine Fähigkeit – einfach stark.'));
  if (extra) body.append(h('div', 'info-extra', extra));
  info.append(thumb, body);
}

function showCardBig(id) {
  const def = CARD_BY_ID[id];
  const box = h('div', 'big-card');
  const card = cardElement(id);
  card.classList.add('huge');
  box.append(card);
  const meta = def.type === 'wesen'
    ? `${ELEMENTS[def.element].icon} ${ELEMENTS[def.element].name} · Kosten ${def.cost} · Stärke ${def.power}`
    : `Aktion · Kosten ${def.cost}`;
  box.append(h('p', 'big-meta', meta));
  if (def.rarity) {
    const have = save.owned[id] ?? 0;
    box.append(h('p', `big-rarity rar-text-${def.rarity}`, `${RARITIES[def.rarity].name} · Du besitzt ${have}/${MAX_COPIES}${save.golden[id] ? ' · ✨ golden' : ''}`));
  }
  dialog(def.name, box, [{ label: 'Schließen', value: true, primary: true }]);
}

// ---------- Spielfeld ----------

function isHiddenFront(fi) {
  return !ui.reveal && FRONT_BY_ID[state.fronts[fi].id].rule === 'nebel';
}

function render() {
  const view = ui.frame?.view ?? E.view(state);
  for (const p of [0, 1]) {
    const banners = $(`#banners-${p}`);
    banners.replaceChildren();
    for (let i = 0; i < state.goal; i++) banners.append(symbol(i < state.banners[p] ? 'banner' : 'banner-leer', i < state.banners[p] ? 'banner on' : 'banner'));
  }
  $('#round-label').textContent = `Runde ${state.round} · ${E.ZUG_NAMEN[state.zug - 1]} (${state.zug}/${E.ZUEGE})`;
  const stakes = state.stakes + (ui.drum ? 1 : 0);
  $('#stakes').replaceChildren(`Einsatz: ${stakes}`, symbol('banner', 'sym stake-banner'));
  $('#stakes').classList.toggle('hot', stakes > 1);

  const board = $('#board');
  board.replaceChildren();
  view.forEach((front, fi) => board.append(frontElement(front, fi)));
  renderHand();
  renderControls();
}

function frontElement(front, fi) {
  const def = FRONT_BY_ID[front.id];
  const column = h('div', `front ${def.element ? `el-${def.element}` : `rule-${def.rule}`}`);
  column.dataset.front = fi;
  column.style.setProperty('--front-img', `url("fronten/${front.id}.webp")`);
  const hidden = isHiddenFront(fi);
  const planned = ui.plan.filter((step) => step.front === fi).map((step) => handCard(step.uid));
  const pendingWesen = planned.filter((card) => CARD_BY_ID[card.id].type === 'wesen');
  const pendingActions = planned.filter((card) => CARD_BY_ID[card.id].type === 'aktion');

  if (selectedFits(fi)) column.classList.add('target');
  const winner = ui.reveal || !hidden ? front.winner : null;

  const enemy = h('div', 'side enemy-side');
  if (winner === 1) enemy.classList.add('leading');
  for (const card of front.sides[1]) enemy.append(chipElement(card, { hidden, focus: ui.frame?.focus === card.uid }));
  enemy.append(h('div', 'total', hidden && front.sides[1].length ? '?' : String(front.totals[1])));

  const tile = h('div', 'front-tile');
  const scenery = h('img', 'front-image');
  scenery.src = `fronten/${front.id}.webp`;
  scenery.alt = '';
  scenery.draggable = false;
  scenery.addEventListener('error', () => scenery.replaceWith(h('div', 'front-art', def.art)), { once: true });
  tile.append(scenery, h('div', 'front-name', def.name), h('div', 'front-text', def.text));
  if (front.weight > 1) tile.append(h('span', 'weight-mark', `×${front.weight}`));
  if (front.shield[0]) tile.append(symbol('schild', 'shield-mark own'));
  if (front.shield[1]) tile.append(symbol('schild', 'shield-mark enemy'));
  for (const card of pendingActions) {
    const badge = h('button', 'action-badge', `${CARD_BY_ID[card.id].art} ${CARD_BY_ID[card.id].name}`);
    badge.type = 'button';
    badge.addEventListener('click', (event) => { event.stopPropagation(); unplan(card.uid); });
    tile.append(badge);
  }

  const own = h('div', 'side own-side');
  if (winner === 0) own.classList.add('leading');
  own.append(h('div', 'total', String(front.totals[0])));
  for (const card of front.sides[0]) own.append(chipElement(card, { focus: ui.frame?.focus === card.uid }));
  for (const card of pendingWesen) {
    const chip = chipElement(card, { pending: true });
    chip.addEventListener('click', (event) => { event.stopPropagation(); unplan(card.uid); });
    own.append(chip);
  }
  const free = E.slotLimit(state.fronts[fi]) - front.sides[0].length - pendingWesen.length;
  for (let i = 0; i < free; i++) own.append(h('div', 'chip empty-slot'));

  column.append(enemy, tile, own);
  column.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (ui.selected !== null && !ui.busy) { placeSelected(fi); return; }
    if (chip?.dataset.uid) {
      const found = [...front.sides[0], ...front.sides[1]].find((card) => String(card.uid) === chip.dataset.uid);
      if (found && !(hidden && found.owner === 1)) showInfo(found.id, `Aktuelle Stärke: ${found.power}`);
      return;
    }
    showInfo(null, `${def.art} ${def.name}: ${def.text}`);
  });
  return column;
}

function handCard(uid) {
  return state.players[0].hand.find((card) => card.uid === uid);
}

function renderHand() {
  const hand = $('#hand');
  hand.replaceChildren();
  const planned = new Set(ui.plan.map((step) => step.uid));
  const left = E.energy(state, 0) - E.planCost(state, 0, ui.plan);
  for (const card of state.players[0].hand) {
    if (planned.has(card.uid)) continue;
    const element = cardElement(card.id);
    const cheapest = Math.min(...[0, 1, 2].map((fi) => E.cardCost(state, card.id, fi)));
    if (cheapest > left) element.classList.add('too-expensive');
    if (ui.selected === card.uid) element.classList.add('selected');
    if (ui.drag?.uid === card.uid) element.classList.add('dragging');
    element.addEventListener('click', () => selectCard(card.uid));
    element.addEventListener('pointerdown', (event) => startDrag(event, card));
    hand.append(element);
  }
  if (!hand.children.length) hand.append(h('div', 'hand-empty', 'Keine Karten mehr auf der Hand.'));
}

function renderControls() {
  const total = E.energy(state, 0);
  const used = E.planCost(state, 0, ui.plan);
  const energyElement = $('#energy');
  energyElement.replaceChildren(symbol('energie', 'energy-label'));
  for (let i = 0; i < total; i++) energyElement.append(h('span', i < total - used ? 'pip on' : 'pip', ''));
  energyElement.append(h('span', 'energy-text', `${total - used}/${total}`));
  const drum = $('#drum');
  drum.disabled = ui.busy || state.drumUsed[0];
  drum.classList.toggle('active', ui.drum);
  if (ui.match?.tutorial) drum.disabled = true;
  $('#ready').disabled = ui.busy;
  $('#ready').textContent = ui.busy ? '…' : ui.plan.length ? 'Aufdecken!' : 'Nichts legen';
  if (ui.coach) highlightCoach();
}

// ---------- Planen ----------

function selectedFits(fi) {
  if (ui.selected === null || ui.busy) return false;
  return E.checkPlan(state, 0, [...ui.plan, { uid: ui.selected, front: fi }]).ok;
}

// Karte nach oben aus der Hand ziehen und auf einer Front loslassen. Waagerecht wischen scrollt weiter die Hand.
function startDrag(event, card) {
  if (ui.busy || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const start = { x: event.clientX, y: event.clientY };
  let ghost = null;
  let hover = null;

  const frontAt = (x, y) => document.elementFromPoint(x, y)?.closest('.front');
  const setHover = (column) => {
    if (hover === column) return;
    hover?.classList.remove('drop-hover');
    hover = column;
    hover?.classList.add('drop-hover');
  };
  const move = (moveEvent) => {
    const dx = moveEvent.clientX - start.x;
    const dy = moveEvent.clientY - start.y;
    if (!ghost) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { stop(); return; }
      if (dy > -12 || Math.abs(dy) < Math.abs(dx)) return;
      ui.selected = card.uid;
      ui.drag = { uid: card.uid };
      showInfo(card.id, 'Zieh die Karte auf eine leuchtende Front.');
      render();
      ghost = cardElement(card.id);
      ghost.classList.add('drag-ghost');
      document.body.append(ghost);
    }
    moveEvent.preventDefault();
    ghost.style.left = `${moveEvent.clientX}px`;
    ghost.style.top = `${moveEvent.clientY}px`;
    const column = frontAt(moveEvent.clientX, moveEvent.clientY);
    setHover(column && selectedFits(Number(column.dataset.front)) ? column : null);
  };
  const up = (upEvent) => {
    const dropped = ghost ? frontAt(upEvent.clientX, upEvent.clientY) : null;
    const wasDragging = Boolean(ghost);
    stop();
    if (!wasDragging) return;
    ui.justDragged = true;
    setTimeout(() => { ui.justDragged = false; }, 50);
    if (dropped) placeSelected(Number(dropped.dataset.front));
    else {
      ui.selected = null;
      render();
    }
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', stop);
    ghost?.remove();
    setHover(null);
    if (ui.drag) {
      ui.drag = null;
      render();
    }
  };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', stop);
}

function selectCard(uid) {
  if (ui.busy || ui.justDragged) return;
  const card = handCard(uid);
  if (!coachAllowsCard(card.id)) return;
  if (ui.selected === uid) {
    ui.selected = null;
    showInfo(null, 'Zieh eine Karte auf eine Front – oder tippe erst die Karte, dann die Front an.');
  } else {
    ui.selected = uid;
    play('pick');
    const fits = [0, 1, 2].some((fi) => selectedFits(fi));
    showInfo(card.id, fits ? 'Tippe jetzt auf eine Front.' : 'Dafür reicht deine Energie nicht oder die Fronten sind voll.');
  }
  render();
}

function placeSelected(fi) {
  if (!coachAllowsPlace(handCard(ui.selected)?.id, fi)) return;
  const step = { uid: ui.selected, front: fi };
  const check = E.checkPlan(state, 0, [...ui.plan, step]);
  if (!check.ok) {
    toast(check.error);
    return;
  }
  ui.plan.push(step);
  ui.selected = null;
  play('place');
  showInfo(null, 'Geplant! Tippe die Karte auf dem Feld an, um sie zurückzunehmen.');
  render();
  coachAdvance('place');
}

function unplan(uid) {
  if (ui.busy) return;
  ui.plan = ui.plan.filter((step) => step.uid !== uid);
  // Spätere Karten könnten jetzt nicht mehr passen (z. B. weniger Energie durch Turm) – dann auch zurück.
  while (ui.plan.length && !E.checkPlan(state, 0, ui.plan).ok) ui.plan.pop();
  render();
}

// ---------- Ablauf ----------

function beginZug() {
  ui.plan = [];
  ui.selected = null;
  ui.drum = false;
  ui.busy = false;
  ui.fast = false;
  ui.reveal = false;
  ui.frame = null;
  const opponent = currentOpponent();
  ui.bot = ui.online ? null : ui.match?.tutorial ? tutorialBotPlan() : planBot(state, 1, opponent.level, Math.random, opponent.boldness);
  $('#log').textContent = state.zug === 1
    ? 'Aufmarsch: Lege verdeckt Karten an die Fronten.'
    : state.zug < E.ZUEGE
      ? 'Verstärkung: Du siehst jetzt den Gegner. Reagiere!'
      : 'Finale: Letzter Zug – danach wird gewertet!';
  showInfo(null, 'Zieh eine Karte auf eine Front – oder tippe erst die Karte, dann die Front an.');
  render();
  if (state.zug === 1 && !ui.match?.tutorial) toast(`Runde ${state.round} – neue Fronten!`);
  if (ui.match?.tutorial) startCoach(state.zug);
}

async function ready() {
  if (!state || ui.busy) return;
  if (!coachAllowsReady()) return;
  coachAdvance('ready');
  ui.busy = true;
  ui.selected = null;
  render();
  if (ui.online) {
    await onlineSubmit();
    return;
  }
  const gameId = ui.gameId;
  const stale = () => gameId !== ui.gameId || $('#game').hidden;
  const bot = ui.bot;
  const drums = [ui.drum, bot.drum && !state.drumUsed[1]];
  const accept = [true, true];
  if (drums[1]) play('drum');
  if (drums[1] && !drums[0]) {
    accept[0] = await dialog('🥁 Kriegstrommel!',
      `Der Gegner schlägt die Kriegstrommel. Wenn du mitgehst, zählt diese Runde ${state.stakes + 1} Banner.\nGibst du auf, bekommt er sofort ${state.stakes} Banner.`,
      [{ label: 'Aufgeben', value: false }, { label: 'Mitgehen!', value: true, primary: true }]);
    if (stale()) return;
  } else if (drums[0] && !drums[1]) {
    accept[1] = acceptDrum(state, 1, bot.chance, currentOpponent().level, currentOpponent().boldness);
    toast(accept[1] ? 'Der Gegner geht mit!' : 'Der Gegner gibt die Runde auf!');
    await sleep(900);
  } else if (drums[0] && drums[1]) {
    toast('Beide trommeln! Der Einsatz steigt doppelt.');
    await sleep(900);
  }
  await resolveTurn([ui.plan, bot.plan], drums, accept, stale);
}

// Die echte Partie: offline der Bildschirm-Stand selbst, online die gemeinsame Partie (Platz 0 und 1).
function engineState() {
  return ui.online?.canon ?? state;
}

// Bildschirm-Stand aus der gemeinsamen Partie: wer auf Platz 1 sitzt, sieht sie gespiegelt (er selbst ist unten).
function refreshView() {
  const canon = ui.online?.canon;
  if (canon) state = ui.online.seat === 1 ? mirrorState(canon) : canon;
}

// Löst einen Zug auf: Trommeln, Aufdecken, nächster Zug oder Wertung. plans, drums und accept in Spieler-Reihenfolge der Partie.
async function resolveTurn(plans, drums, accept, stale) {
  const game = engineState();
  const outcome = E.resolveDrums(game, drums, accept);
  refreshView();
  if (!ui.online && outcome.fold === 1 && drums[0]) bump('drumFolds');
  if (outcome.fold !== null) {
    await roundEnd();
    return;
  }
  let frames = E.applyTurn(game, plans);
  if (ui.online?.seat === 1) frames = frames.map(mirrorFrame);
  refreshView();
  ui.plan = [];
  await playFrames(frames, stale);
  ui.frame = null;
  if (stale()) return;
  if (game.zug < E.ZUEGE) {
    E.nextZug(game);
    refreshView();
    beginZug();
    return;
  }
  ui.reveal = true;
  render();
  $('#log').textContent = 'Wertung!';
  play('reveal');
  await sleep(1200);
  if (stale()) return;
  E.scoreRound(game);
  refreshView();
  await roundEnd();
}

function frameText(frame) {
  if (!frame.focus) return frame.text;
  for (const [fi, front] of frame.view.entries()) {
    const card = front.sides[1].find((entry) => entry.uid === frame.focus);
    if (card && isHiddenFront(fi)) return 'Im Nebel regt sich etwas …';
  }
  return frame.text;
}

async function playFrames(frames, stale) {
  for (const frame of frames) {
    if (stale()) return;
    ui.frame = frame;
    render();
    $('#log').textContent = frameText(frame);
    frameEffects(frame);
    if (frame.float) floatAt(frame.focus, frame.float, frame.bad);
    await sleep(frame.reveal ? STEP_MS : STEP_MS * 0.85);
  }
}

// Ton und Effekt passend zum Schritt: Aufdecken, Aktion, Stärkung, Schwächung, Zerstörung.
function frameEffects(frame) {
  if (frame.action) {
    const kind = FX_OF[CARD_BY_ID[frame.action].ability];
    frontEffect(frame.front, kind);
    play(kind === 'blitz' ? 'blitz' : kind === 'feuer' ? 'feuer' : kind === 'beben' ? 'beben' : kind === 'wasser' || kind === 'heilung' ? 'wasser' : kind === 'schild' ? 'schild' : 'magie');
    return;
  }
  if (frame.reveal) {
    const card = frame.view.flatMap((front) => [...front.sides[0], ...front.sides[1]]).find((entry) => entry.uid === frame.focus);
    const def = card && CARD_BY_ID[card.id];
    const hidden = card && card.owner === 1 && isHiddenFront(frame.front);
    if (def && !hidden && def.rarity === 'legendaer') {
      play('legend');
      cardBurst(frame.focus, 'legend');
      frontEffect(frame.front, 'gold');
    } else if (def && !hidden && FX_OF[def.ability]) {
      play('place');
      frontEffect(frame.front, FX_OF[def.ability]);
    } else {
      play('place');
    }
    return;
  }
  if (frame.float === '💀' || frame.float === '🏔️') { play('destroy'); shake($('#board')); return; }
  if (frame.float === '🔥') { play('feuer'); return; }
  if (frame.float === '🛡️') { play('schild'); return; }
  if (frame.bad) play('debuff');
  else if (frame.float?.startsWith('+')) play('buff');
  else if (frame.float) play('magie');
}

function floatAt(uid, text, bad) {
  const anchor = uid ? document.querySelector(`.chip[data-uid="${uid}"]`) : null;
  const float = h('div', `float${bad ? ' bad' : ''}`, text);
  const box = (anchor ?? $('#board')).getBoundingClientRect();
  float.style.left = `${box.left + box.width / 2}px`;
  float.style.top = `${box.top + (anchor ? 0 : box.height / 2)}px`;
  document.body.append(float);
  setTimeout(() => float.remove(), 1100);
}

async function roundEnd() {
  const result = state.lastResult;
  const opponent = currentOpponent();
  render();
  if (!ui.match?.tutorial) trackRound(result);
  const body = h('div', 'result');
  if (result.fold !== null) {
    body.append(h('p', '', result.fold === 0 ? 'Du hast aufgegeben.' : 'Der Gegner hat aufgegeben.'));
  } else {
    result.fronts.forEach((front, fi) => {
      const def = FRONT_BY_ID[state.fronts[fi].id];
      const row = h('div', `result-row ${front.winner === 0 ? 'won' : front.winner === 1 ? 'lost' : 'tie'}`);
      row.append(
        h('span', '', `${def.art} ${def.name}${front.weight > 1 ? ` (×${front.weight})` : ''}`),
        h('b', '', `${front.totals[0]} : ${front.totals[1]}`),
        h('span', '', front.winner === 0 ? '✅' : front.winner === 1 ? '❌' : '➖'),
      );
      body.append(row);
    });
  }
  const who = result.winner === 0 ? 'Du gewinnst' : 'Der Gegner gewinnt';
  body.append(h('p', 'result-line', result.winner === null ? 'Unentschieden – niemand bekommt ein Banner.' : `${who} ${result.stakes} Banner!`));
  body.append(h('p', 'result-score', `Stand: Du ${state.banners[0]} – ${state.banners[1]} ${opponent.name} (Ziel: ${state.goal})`));
  if (result.winner === 0) play('banner');

  if (ui.match?.tutorial) {
    await tutorialEnd(body);
    return;
  }
  if (state.phase === 'over' && ui.online) {
    await onlineMatchEnd(body);
    return;
  }
  if (state.phase === 'over') {
    await matchEnd(body);
    return;
  }
  await dialog(result.winner === 0 ? 'Runde gewonnen!' : result.winner === 1 ? 'Runde verloren' : 'Gleichstand', body,
    [{ label: 'Nächste Runde', value: true, primary: true }]);
  E.startRound(engineState());
  refreshView();
  beginZug();
}

// Zähler für Erfolge nach jeder Runde.
function trackRound(result) {
  if (result.fold === null) {
    result.fronts.forEach((front, fi) => {
      const id = state.fronts[fi].id;
      if (front.winner === 0 && ['spiegelsee', 'drachenhort', 'nebelmoor'].includes(id)) bump(`front_${id}`);
    });
    if (result.fronts.every((front) => front.winner === 0)) bump('sweeps');
  }
  if (result.winner === 0 && result.stakes > 1) bump('drumRoundsWon');
}

async function matchEnd(body) {
  const opponent = currentOpponent();
  const chapter = ui.match.chapter ? CHAPTER_BY_ID[ui.match.chapter] : null;
  const won = state.winner === 0;
  const today = new Date().toISOString().slice(0, 10);
  const reward = matchReward({
    won, draw: state.winner === null, stars: opponent.stars, banners: state.banners[0], firstWinToday: save.lastWinDay !== today,
  });
  if (won) {
    save.wins++;
    save.streak++;
    save.lastWinDay = today;
    bump('wins');
    if (opponent.stars >= 3) bump('masterWins');
    if (state.banners[1] === 0) bump('perfect');
    if (isCustom(save.deck)) bump('customWins');
    save.stats.streakMax = Math.max(save.stats.streakMax ?? 0, save.streak);
  } else if (state.winner === 1) {
    save.losses++;
    save.streak = 0;
  }
  save.coins += reward.total;
  if (won) {
    save.ruhm += opponent.stars;
    save.ruhmBest = Math.max(save.ruhmBest, save.ruhm);
  } else if (state.winner === 1) save.ruhm = 0;
  platform.endLevel({
    result: won ? 'win' : 'lose', score: state.banners[0], stars: opponent.stars,
    data: { deck: save.deck, gegner: opponent.id, runden: state.round, gegner_banner: state.banners[1] },
  });
  void platform.flush();

  // Kampagne: erstes Mal gewonnen → Kapitel freigeschaltet, Belohnung mit Karte.
  if (chapter && won && chapter.id > save.campaign) {
    save.campaign = chapter.id;
    save.stats.chapters = save.campaign;
    save.coins += chapter.reward.coins;
    reward.parts.push([`Kapitel ${chapter.id} geschafft`, chapter.reward.coins]);
    const card = chapter.reward.card;
    if ((save.owned[card] ?? 0) < MAX_COPIES) save.owned[card] = (save.owned[card] ?? 0) + 1;
    const gift = h('div', 'chapter-gift');
    gift.append(h('p', 'result-line', 'Neue Karte für deine Sammlung:'), cardElement(card, { small: true }));
    body.append(gift);
  }
  store();

  body.prepend(opponentQuote(opponent, won ? opponent.lose : opponent.win));
  const ruhmLine = h('p', 'ruhm-line', won ? `⚜️ Ruhm-Serie: ${save.ruhm} (Bestwert ${save.ruhmBest})` : (state.winner === 1 ? 'Deine Ruhm-Serie beginnt von vorn.' : ''));
  body.append(ruhmLine);
  if (won && platform.enabled) {
    void platform.submitScore(BOARD, save.ruhm).then((result) => {
      const rank = result?.listed !== false ? result?.week?.rank : null;
      if (!rank) return;
      ruhmLine.append(h('br'), `🏆 Platz ${rank} diese Woche – `);
      const link = h('a', '', 'Rangliste ansehen');
      link.href = leaderboardPath(BOARD);
      ruhmLine.append(link);
    });
  }
  if (won && save.streak > 1) body.append(h('p', 'result-line', `🔥 ${save.streak} Siege in Folge!`));
  const coins = h('div', 'reward');
  for (const [label, value] of reward.parts) {
    const row = h('div', 'reward-row');
    row.append(h('span', '', label), coinText(`+${value}`, 'reward-value'));
    coins.append(row);
  }
  const sum = h('div', 'reward-row reward-total');
  sum.append(h('span', '', 'Deine Münzen'), coinText(String(save.coins), 'reward-value'));
  coins.append(sum);
  body.append(coins);

  if (state.winner !== null) body.prepend(symbol(won ? 'sieg' : 'niederlage', 'result-symbol'));
  if (won) { play('win'); confetti(); } else if (state.winner === 1) play('lose');
  setTimeout(() => play('coins'), 900);
  const again = chapter ? (won ? 'Weiter zur Kampagne' : 'Nochmal versuchen') : 'Nochmal!';
  const choice = await dialog(won ? '🏆 Sieg!' : state.winner === 1 ? '💀 Niederlage' : 'Unentschieden', body,
    [{ label: 'Hauptmenü', value: 'menu' }, { label: again, value: 'again', primary: true }]);
  announceAchievements();
  if (choice !== 'again') showHub('home');
  else if (chapter && won) showHub('campaign');
  else startGame(ui.match);
}

function opponentQuote(opponent, text) {
  const box = h('div', 'quote');
  box.append(avatarElement(opponent, 'quote-art'));
  const words = h('div', 'quote-body');
  words.append(h('b', '', `${opponent.name} ${opponent.title}`), h('span', '', `„${text}“`));
  box.append(words);
  return box;
}

// ---------- Hauptbildschirm mit Menüleiste ----------

const DECK_INFO = {
  flammen: { icon: '🔥', name: 'Flammen & Sturm', sub: 'Angriff, Drachen, Blitze' },
  tiefen: { icon: '🌊', name: 'Wald & Tiefe', sub: 'Zäh, Tricks, Kartenziehen' },
  eigen1: { icon: '✏️', name: 'Eigenes Deck 1', sub: 'Selbst gebaut' },
  eigen2: { icon: '✏️', name: 'Eigenes Deck 2', sub: 'Selbst gebaut' },
};
// Welches Deck gerade auf der Karten-Seite angezeigt wird (nicht unbedingt das aktive).
let viewedDeck = null;

function deckCards(deckId) {
  return isCustom(deckId) ? save.custom[deckId] : DECKS[deckId].cards;
}

function currentOpponent() {
  if (ui.online?.opponent) return ui.online.opponent;
  return OPPONENT_BY_ID[ui.match?.opponent ?? save.opponent] ?? OPPONENTS[0];
}

function opponentDeck(opponent) {
  if (Array.isArray(opponent.deck)) return opponent.deck;
  // Varok spielt oft mit einem zufälligen Element-Deck – so trifft man auch auf Karten aus Paketen.
  if (opponent.deck === 'zufall' && Math.random() < 0.5) return randomDeck();
  return DECKS[enemyDeckFor(save.deck)].cards;
}

function bump(stat, amount = 1) {
  save.stats[stat] = (save.stats[stat] ?? 0) + amount;
}

// match = { opponent, chapter } – ohne Angabe: freies Duell gegen den gewählten Gegner.
async function startGame(match = { opponent: save.opponent }) {
  // Ein offener Online-Raum (Lobby oder Suche) würde sonst die Partie gegen den Computer kapern.
  if (ui.online) await onlineLeave();
  if (!deckReady(deckCards(save.deck))) save.deck = 'flammen';
  const chapter = match.chapter ? CHAPTER_BY_ID[match.chapter] : null;
  ui.match = { opponent: chapter ? chapter.opponent : match.opponent, chapter: chapter?.id ?? null };
  const opponent = currentOpponent();
  state = E.createGame({
    seed: (Math.random() * 2 ** 32) >>> 0,
    decks: [deckCards(save.deck), opponentDeck(opponent)],
    names: ['Du', opponent.name],
    ...(chapter?.rules ?? {}),
  });
  bump('games');
  store();
  platform.beginLevel(chapter ? `kapitel-${chapter.id}` : opponent.id);
  ui.gameId = (ui.gameId ?? 0) + 1;
  ui.seen.clear();
  $('#enemy-name').textContent = opponent.name;
  $('#enemy-avatar').replaceChildren(avatarElement(opponent, 'top-avatar'));
  $('#hub').hidden = true;
  $('#game').hidden = false;
  beginZug();
  const intro = h('div', 'intro');
  intro.append(opponentQuote(opponent, opponent.intro));
  if (chapter) intro.append(h('p', 'intro-tip', `📜 ${chapter.tip}`));
  await dialog(chapter ? `Kapitel ${chapter.id}: ${chapter.title}` : `Duell gegen ${opponent.name}`, intro,
    [{ label: 'Los geht’s!', value: true, primary: true }]);
}

function showHub(page = ui.page ?? 'home') {
  $('#game').hidden = true;
  if (pendingRemote) {
    const data = JSON.stringify(pendingRemote);
    pendingRemote = null;
    try { localStorage.setItem(STORE, data); } catch { /* bleibt lokal */ }
    location.reload();
    return;
  }
  $('#hub').hidden = false;
  showPage(page);
}

function showPage(page) {
  ui.page = page;
  for (const name of ['shop', 'decks', 'home', 'multi', 'campaign']) $(`#page-${name}`).hidden = name !== page;
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.page === (page === 'campaign' ? 'home' : page));
  renderHubTop();
  if (page === 'home') renderHome();
  if (page === 'campaign') renderCampaign();
  if (page === 'decks') renderDecks();
  if (page === 'shop') renderShop();
  if (page === 'multi') renderLobby();
  window.scrollTo(0, 0);
}

function renderHubTop() {
  const stats = $('#hub-stats');
  stats.replaceChildren(
    h('span', 'stat', `🏆 ${save.wins}`),
    h('span', 'stat', `💀 ${save.losses}`),
  );
  if (save.streak > 1) stats.append(h('span', 'stat hot', `🔥 ${save.streak}`));
  $('#hub-title').textContent = save.title ? `⚜️ ${save.title}` : '';
  const coins = h('span', 'stat coins');
  coins.append(symbol('muenze', 'sym coin'), String(save.coins));
  stats.append(coins);
}

// ---------- Shop und Pakete ----------

function renderShop() {
  const list = $('#pack-list');
  list.replaceChildren();
  for (const [id, pack] of Object.entries(PACKS)) {
    const box = h('div', `pack pack-${id}`);
    const art = h('div', 'pack-art');
    const back = h('img');
    back.src = 'rueckseite.webp';
    back.alt = '';
    art.append(back, symbol('paket', 'pack-icon'));
    if (id === 'gross') art.append(symbol('paket', 'pack-icon second'));
    const buy = h('button', 'big-btn small-btn');
    buy.append(coinText(String(pack.price)));
    buy.type = 'button';
    buy.disabled = save.coins < pack.price;
    buy.addEventListener('click', () => buyPack(id));
    box.append(art, h('b', 'pack-name', pack.name), h('span', 'pack-text', pack.text), buy);
    list.append(box);
  }
  const info = $('#shop-info');
  info.replaceChildren(
    h('p', '', `Sammlung: ${ownedCount(save.owned)} von ${CARDS.length} Karten · ${save.packsOpened} Pakete geöffnet`),
    h('p', '', `Spätestens alle 20 Pakete ist eine legendäre Karte dabei (noch ${Math.max(1, 20 - save.pity)}).`),
    h('p', '', 'Hast du eine Karte schon 2-mal, bekommst du dafür Münzen zurück.'),
  );
  const odds = h('div', 'odds');
  odds.append(h('span', '', 'Chance je Karte:'));
  for (const [rarity, info2] of Object.entries(RARITIES)) odds.append(h('span', `rar-text-${rarity}`, `${info2.name} ${String(WEIGHTS[rarity]).replace('.', ',')} %`));
  info.append(odds);
}

async function buyPack(packId) {
  const pack = PACKS[packId];
  if (save.coins < pack.price) return;
  save.coins -= pack.price;
  const result = openPack(packId, save.owned, save.pity, Math.random, save.golden);
  save.owned = result.owned;
  save.golden = result.golden;
  save.pity = result.pity;
  save.coins += result.refund;
  save.packsOpened++;
  bump('packs');
  bump('legendaries', result.cards.filter((entry) => entry.rarity === 'legendaer').length);
  bump('goldens', result.cards.filter((entry) => entry.golden).length);
  store();
  renderHubTop();
  play('click');
  await showPackOpening(pack, result);
  renderShop();
  renderHubTop();
  announceAchievements();
}

function showPackOpening(pack, result) {
  const box = h('div', 'opening');
  const row = h('div', 'opening-cards');
  const slots = result.cards.map((entry) => {
    const slot = h('button', `opening-slot rar-${entry.rarity}${entry.golden ? ' golden' : ''}`);
    slot.type = 'button';
    const back = h('img', 'opening-back');
    back.src = 'rueckseite.webp';
    back.alt = 'Verdeckte Karte';
    slot.append(back);
    slot.addEventListener('click', () => flip(slot, entry));
    row.append(slot);
    return { slot, entry };
  });
  const note = h('p', 'opening-note', 'Tippe die Karten an, um sie aufzudecken!');
  const all = h('button', 'plain-btn small-btn', 'Alle aufdecken');
  all.type = 'button';
  all.addEventListener('click', () => slots.forEach(({ slot, entry }, i) => setTimeout(() => flip(slot, entry), i * 180)));
  box.append(row, note, all);
  if (result.refund) box.append(h('p', 'opening-refund', `+${result.refund} Münzen für doppelte Karten`));

  function flip(slot, entry) {
    if (slot.classList.contains('open')) return;
    slot.classList.add('open');
    const card = cardElement(entry.id, { small: true, golden: Boolean(entry.golden) });
    if (entry.golden) card.append(h('span', 'new-badge gold-badge', '✨ GOLDEN'));
    else if (entry.isNew) card.append(h('span', 'new-badge', 'NEU!'));
    if (entry.refund) card.append(coinText(`+${entry.refund}`, 'refund-badge'));
    slot.replaceChildren(card);
    if (entry.golden) {
      play('gold');
      toast(`✨ GOLDENE KARTE: ${CARD_BY_ID[entry.id].name.replaceAll('\u00AD', '')}!`);
      return finish();
    }
    play(entry.rarity === 'legendaer' ? 'legend' : entry.rarity === 'episch' ? 'magie' : 'flip');
    if (entry.rarity === 'legendaer' || entry.rarity === 'episch') toast(`${entry.rarity === 'legendaer' ? '🌟 LEGENDÄR' : '💜 Episch'}: ${CARD_BY_ID[entry.id].name.replaceAll('­', '')}!`);
    return finish();
  }
  function finish() {
    if (slots.every(({ slot: other }) => other.classList.contains('open'))) note.textContent = 'Alle Karten sind jetzt in deiner Sammlung.';
  }
  return dialog(`${pack.icon} ${pack.name}`, box, [{ label: 'Super!', value: true, primary: true }]);
}

function renderHome() {
  const info = DECK_INFO[save.deck];
  const deckButton = $('#home-deck');
  deckButton.replaceChildren(
    h('span', 'home-deck-label', 'Dein Deck'),
    h('b', '', `${info.icon} ${info.name}`),
    h('span', 'home-deck-change', 'Ändern →'),
  );
  const next = Math.min(save.campaign + 1, CHAPTERS.length);
  const campaign = $('#campaign-btn');
  campaign.replaceChildren(
    h('span', 'home-action-icon', '📜'),
    h('b', '', 'Kampagne'),
    h('span', '', save.campaign >= CHAPTERS.length ? 'Alle Kapitel geschafft!' : `Kapitel ${next}: ${CHAPTER_BY_ID[next].title}`),
  );
  const ready = readyToClaim(achievementContext(), save.claimed).length;
  const achievements = $('#achievements-btn');
  achievements.replaceChildren(
    h('span', 'home-action-icon', '🏆'),
    h('b', '', 'Erfolge'),
    h('span', '', `${save.claimed.length}/${ACHIEVEMENTS.length} geschafft`),
  );
  if (ready) achievements.append(h('i', 'badge', String(ready)));

  const row = $('#opponent-choice');
  row.replaceChildren();
  for (const opponent of OPPONENTS) {
    const button = h('button', `opponent${opponent.id === save.opponent ? ' active' : ''}`);
    button.type = 'button';
    button.append(avatarElement(opponent, 'opponent-art'), h('b', '', opponent.name), h('span', 'stars', '★'.repeat(opponent.stars) + '☆'.repeat(3 - opponent.stars)));
    button.addEventListener('click', () => { play('click'); save.opponent = opponent.id; store(); renderHome(); });
    row.append(button);
  }
  const chosen = OPPONENT_BY_ID[save.opponent];
  $('#opponent-intro').textContent = `${chosen.name} ${chosen.title}: „${chosen.intro}“`;

  // Kurzinfo unter dem Kampf-Knopf: gegen wen, mit welchem Deck.
  $('#play-info').replaceChildren(
    avatarElement(chosen, 'play-info-art'),
    h('span', '', `gegen ${chosen.name} `),
    h('span', 'stars', '★'.repeat(chosen.stars) + '☆'.repeat(3 - chosen.stars)),
    h('span', 'play-info-deck', ` · ${DECK_INFO[save.deck].icon} ${DECK_INFO[save.deck].name}`),
  );
}

// ---------- Kampagne ----------

function renderCampaign() {
  const list = $('#chapter-list');
  list.replaceChildren();
  for (const chapter of CHAPTERS) {
    const done = chapter.id <= save.campaign;
    const open = chapter.id <= save.campaign + 1;
    const opponent = OPPONENT_BY_ID[chapter.opponent];
    const button = h('button', `chapter${done ? ' done' : ''}${open && !done ? ' next' : ''}${open ? '' : ' locked'}`);
    button.type = 'button';
    button.append(avatarElement(opponent, 'chapter-art'));
    const text = h('div', 'chapter-text');
    text.append(h('span', 'chapter-no', `Kapitel ${chapter.id}`), h('b', '', chapter.title), h('span', 'chapter-sub', `gegen ${opponent.name} ${opponent.title}`));
    button.append(text, h('span', 'chapter-state', done ? '✅' : open ? '▶' : '🔒'));
    button.addEventListener('click', () => (open ? openChapter(chapter) : toast('Schaff zuerst das Kapitel davor.')));
    list.append(button);
  }
}

async function openChapter(chapter) {
  play('click');
  const opponent = OPPONENT_BY_ID[chapter.opponent];
  const body = h('div', 'chapter-detail');
  body.append(opponentQuote(opponent, opponent.intro));
  body.append(h('p', 'chapter-story', chapter.story), h('p', 'intro-tip', `📜 ${chapter.tip}`));
  const reward = h('div', 'chapter-reward');
  const done = chapter.id <= save.campaign;
  reward.append(h('p', '', done ? 'Schon geschafft – du kannst es nochmal spielen (ohne Belohnung).' : `Belohnung: ${chapter.reward.coins} Münzen und diese Karte:`));
  if (!done) reward.append(cardElement(chapter.reward.card, { small: true }));
  body.append(reward);
  const go = await dialog(`Kapitel ${chapter.id}: ${chapter.title}`, body, [
    { label: 'Zurück', value: false }, { label: '⚔️ Kämpfen!', value: true, primary: true },
  ]);
  if (!go) return;
  if (!save.rulesSeen && await offerTutorial()) return;
  startGame({ chapter: chapter.id });
}

// ---------- Erfolge ----------

function achievementContext() {
  const stats = { ...save.stats, owned: ownedCount(save.owned), goldenOwned: Object.keys(save.golden).length };
  return { stats, totalCards: CARDS.length };
}

function announceAchievements() {
  ui.announced ??= new Set();
  const fresh = readyToClaim(achievementContext(), save.claimed).filter((entry) => !ui.announced.has(entry.id));
  if (!fresh.length) return;
  for (const entry of fresh) ui.announced.add(entry.id);
  play('achievement');
  toast(fresh.length === 1 ? `🏆 Erfolg geschafft: ${fresh[0].name}! Hol dir die Belohnung ab.` : `🏆 ${fresh.length} Erfolge geschafft! Hol dir die Belohnungen ab.`);
}

function achievementsBody() {
  const ctx = achievementContext();
  const box = h('div', 'achievements');
  const titles = titlesFor(save.claimed);
  if (titles.length) {
    const pick = h('div', 'title-pick');
    pick.append(h('b', '', 'Dein Titel: '));
    for (const title of ['', ...titles]) {
      const button = h('button', `filter-btn${save.title === title ? ' active' : ''}`, title || 'keiner');
      button.type = 'button';
      button.addEventListener('click', () => { save.title = title; store(); renderHubTop(); box.replaceWith(achievementsBody()); });
      pick.append(button);
    }
    box.append(pick);
  }
  const rank = (entry) => (save.claimed.includes(entry.id) ? 2 : progressOf(entry, ctx) >= goalOf(entry, ctx) ? 0 : 1);
  const sorted = [...ACHIEVEMENTS].sort((a, b) => rank(a) - rank(b));
  for (const entry of sorted) {
    const goal = goalOf(entry, ctx);
    const value = progressOf(entry, ctx);
    const claimed = save.claimed.includes(entry.id);
    const row = h('div', `achievement${claimed ? ' claimed' : value >= goal ? ' ready' : ''}`);
    row.append(h('span', 'achievement-icon', entry.icon));
    const text = h('div', 'achievement-text');
    text.append(h('b', '', entry.name), h('span', '', entry.text));
    const bar = h('div', 'bar');
    const fill = h('i');
    fill.style.width = `${Math.round((100 * value) / goal)}%`;
    bar.append(fill);
    text.append(bar, h('span', 'achievement-reward', `${value}/${goal} · ${entry.coins} Münzen${entry.title ? ` · Titel „${entry.title}“` : ''}`));
    row.append(text);
    if (claimed) row.append(h('span', 'achievement-done', '✅'));
    else if (value >= goal) {
      const claim = h('button', 'big-btn small-btn', 'Abholen');
      claim.type = 'button';
      claim.addEventListener('click', () => {
        save.claimed.push(entry.id);
        save.coins += entry.coins;
        store();
        play('coins');
        toast(`+${entry.coins} 🪙${entry.title ? ` – neuer Titel: ${entry.title}` : ''}`);
        renderHubTop();
        box.replaceWith(achievementsBody());
      });
      row.append(claim);
    }
    box.append(row);
  }
  return box;
}

async function showAchievements() {
  play('click');
  await dialog('🏆 Erfolge', achievementsBody(), [{ label: 'Schließen', value: true, primary: true }]);
  renderHome();
}

// ---------- Einstellungen ----------

async function showSettings() {
  const box = h('div', 'settings');
  const toggle = (label, key, apply) => {
    const button = h('button', 'toggle');
    button.type = 'button';
    const update = () => { button.textContent = `${label}: ${save[key] ? 'An' : 'Aus'}`; button.classList.toggle('on', save[key]); };
    update();
    button.addEventListener('click', () => { save[key] = !save[key]; store(); apply(save[key]); update(); play('click'); });
    return button;
  };
  box.append(toggle('🔊 Töne', 'sound', setSound), toggle('🎵 Musik', 'music', setMusic));
  const rules = h('button', 'plain-btn', '📖 So geht’s');
  rules.type = 'button';
  rules.addEventListener('click', () => { $('#dialog').hidden = true; showRules(); });
  box.append(rules);
  const practice = h('button', 'plain-btn', '🎓 Übungspartie');
  practice.type = 'button';
  practice.addEventListener('click', () => { $('#dialog').hidden = true; startTutorial(); });
  box.append(practice);
  await dialog('Einstellungen', box, [{ label: 'Fertig', value: true, primary: true }]);
}

function miniCard(id, count, onClick) {
  const card = cardElement(id, { small: true });
  if (count) card.append(h('span', 'count', `${count}×`));
  card.addEventListener('click', onClick);
  return card;
}

function renderDecks() {
  const deckId = viewedDeck ?? save.deck;
  const cards = deckCards(deckId);
  const custom = isCustom(deckId);

  const tabs = $('#deck-tabs');
  tabs.replaceChildren();
  for (const id of Object.keys(DECK_INFO)) {
    const info = DECK_INFO[id];
    const button = h('button', `deck-tab${id === deckId ? ' viewing' : ''}${id === save.deck ? ' active' : ''}`);
    button.type = 'button';
    button.append(h('b', '', `${info.icon} ${info.name}`), h('span', '', isCustom(id) ? `${deckCards(id).length}/${DECK_SIZE} Karten` : info.sub));
    if (id === save.deck) button.append(h('i', 'deck-active', 'Aktiv'));
    button.addEventListener('click', () => { viewedDeck = id; renderDecks(); });
    tabs.append(button);
  }

  const head = $('#deck-head');
  head.replaceChildren();
  const meta = h('div', 'deck-meta');
  meta.append(
    h('span', '', `${cards.length}/${DECK_SIZE} Karten`),
    h('span', '', `Ø Kosten ${averageCost(cards).toFixed(1)}`),
    h('span', '', `${cards.filter((id) => CARD_BY_ID[id].type === 'aktion').length} Aktionen`),
  );
  head.append(meta);
  const buttons = h('div', 'deck-buttons');
  if (deckId !== save.deck) {
    const use = h('button', 'big-btn small-btn', deckReady(cards) ? 'Dieses Deck benutzen' : `Noch ${DECK_SIZE - cards.length} Karten nötig`);
    use.type = 'button';
    use.disabled = !deckReady(cards);
    use.addEventListener('click', () => { save.deck = deckId; store(); toast(`${DECK_INFO[deckId].name} ist jetzt dein Deck.`); renderDecks(); });
    buttons.append(use);
  }
  if (custom) {
    const fill = h('button', 'plain-btn small-btn', 'Startdeck als Vorlage');
    fill.type = 'button';
    fill.addEventListener('click', async () => {
      const source = await dialog('Vorlage wählen', 'Das eigene Deck wird durch eine Kopie ersetzt.', [
        { label: '🔥 Flammen', value: 'flammen' }, { label: '🌊 Wald & Tiefe', value: 'tiefen' }, { label: 'Abbrechen', value: null },
      ]);
      if (!source) return;
      save.custom[deckId] = [...DECKS[source].cards];
      store();
      renderDecks();
    });
    const clear = h('button', 'plain-btn small-btn', 'Leeren');
    clear.type = 'button';
    clear.addEventListener('click', async () => {
      if (!(await dialog('Deck leeren?', 'Alle Karten werden aus diesem Deck entfernt.', [{ label: 'Nein', value: false }, { label: 'Ja, leeren', value: true, primary: true }]))) return;
      save.custom[deckId] = [];
      if (save.deck === deckId) save.deck = 'flammen';
      store();
      renderDecks();
    });
    buttons.append(fill, clear);
  }
  head.append(buttons);

  const inDeck = $('#deck-cards');
  inDeck.replaceChildren();
  const unique = sortCards([...new Set(cards)]);
  for (const id of unique) {
    inDeck.append(miniCard(id, copies(cards, id), () => {
      if (!custom) { showCardBig(id); return; }
      const list = save.custom[deckId];
      list.splice(list.lastIndexOf(id), 1);
      if (save.deck === deckId && !deckReady(list)) save.deck = 'flammen';
      store();
      renderDecks();
    }));
  }
  if (!unique.length) inDeck.append(h('p', 'empty-note', 'Noch leer. Tippe unten auf Karten, um sie hinzuzufügen.'));

  $('#collection-count').textContent = `${ownedCount(save.owned)}/${CARDS.length}`;
  $('#collection-hint').textContent = custom
    ? '– antippen zum Hinzufügen, oben antippen zum Entfernen'
    : '– antippen für die Großansicht';
  const filter = $('#collection-filter');
  filter.replaceChildren();
  for (const [key, label] of [['alle', 'Alle'], ...Object.entries(ELEMENTS).map(([id, el]) => [id, el.icon]), ['gold', '🌟 Gold'], ['fehlt', '🔒']]) {
    const button = h('button', `filter-btn${ui.filter === key ? ' active' : ''}`, label);
    button.type = 'button';
    button.title = key === 'fehlt' ? 'Fehlende Karten' : key === 'gold' ? 'Goldene Karten' : key === 'alle' ? 'Alle Karten' : ELEMENTS[key].name;
    button.addEventListener('click', () => { ui.filter = key; renderDecks(); });
    filter.append(button);
  }
  const collection = $('#collection');
  collection.replaceChildren();
  const shown = ALL_CARD_IDS.filter((id) => ui.filter === 'alle' || (ui.filter === 'fehlt'
    ? (save.owned[id] ?? 0) === 0 : ui.filter === 'gold' ? save.golden[id] : CARD_BY_ID[id].element === ui.filter));
  for (const id of shown) {
    const have = save.owned[id] ?? 0;
    const card = miniCard(id, 0, () => {
      if (!custom || !have) { showCardBig(id); return; }
      const list = save.custom[deckId];
      if (!canAdd(list, id, save.owned)) {
        toast(list.length >= DECK_SIZE ? `Das Deck ist voll (${DECK_SIZE} Karten).` : `Du hast nur ${have} davon.`);
        return;
      }
      list.push(id);
      store();
      renderDecks();
    });
    if (!have) {
      card.classList.add('locked');
      card.append(h('span', 'lock', '🔒'));
    } else {
      card.append(h('span', 'owned', `${have}/${MAX_COPIES}`));
      if (custom && !canAdd(cards, id, save.owned)) card.classList.add('maxed');
    }
    collection.append(card);
  }
  if (!shown.length) collection.append(h('p', 'empty-note', ui.filter === 'gold' ? 'Noch keine goldene Karte – mit etwas Glück steckt eine im nächsten Paket! ✨' : 'Du hast schon alle Karten dieser Art. 🎉'));
}

function rulesBody() {
  const box = h('div', 'rules');
  const lines = [
    ['🎯 Ziel', `Wer zuerst ${E.GOAL} Banner 🚩 hat, gewinnt (in der Kampagne steht das Ziel beim Kapitel).`],
    ['⚔️ Runde', 'Jede Runde gibt es 3 neue Fronten. Wer an 2 von 3 Fronten stärker ist, bekommt ein Banner.'],
    ['🃏 Drei Züge', '1. Aufmarsch: Beide legen gleichzeitig verdeckt Karten, dann wird aufgedeckt. 2. Verstärkung: Du siehst den Gegner und reagierst. 3. Finale: Der letzte Schlag – danach wird gewertet.'],
    ['⚡ Energie', 'Jede Karte kostet Energie (blaue Zahl). Pro Zug hast du so viel Energie, wie oben angezeigt – jede Runde etwas mehr.'],
    ['🐉 Wesen', 'Bleiben bis zum Ende der Runde an der Front. Rote Zahl = Stärke. Pro Front passen 3 Wesen auf deine Seite.'],
    ['✨ Aktionen', 'Wirken einmal beim Aufdecken an der Front, auf die du sie legst – erst Schilde, dann alle anderen.'],
    ['🌋 Fronten', 'Jede Front hat ein eigenes Ereignis: Vulkan stärkt Feuer, im Nebel bleibt alles verdeckt, am Spiegelsee gewinnt die schwächere Seite …'],
    ['🥁 Kriegstrommel', 'Einmal pro Runde darfst du trommeln: Die Runde zählt dann ein Banner mehr. Der Gegner kann mitgehen oder aufgeben – dann bekommst du sofort die Banner.'],
  ];
  for (const [title, text] of lines) {
    const row = h('div', 'rule');
    row.append(h('b', '', title), h('span', '', text));
    box.append(row);
  }
  return box;
}

async function showRules() {
  await dialog("So geht's", rulesBody(), [{ label: 'Alles klar!', value: true, primary: true }]);
  save.rulesSeen = true;
  store();
}

// ---------- Online-Duelle (Räume der Webseite, lokal zum Testen simuliert) ----------

const net = platform.hosted
  ? createApiTransport({ getCsrf: async () => (await platform.prepareAccount())?.csrf ?? null })
  : createLocalTransport();
const ROOM_SESSION = 'drei-fronten:raum';
// Auf bens-games.de erst einschalten, wenn die Räume-Schnittstelle der Webseite live ist (AUFTRAG-MULTIPLAYER.md, Abschnitt C).
const ONLINE_ON_PLATFORM = true;
const onlineAvailable = () => net.kind === 'lokal' || ONLINE_ON_PLATFORM;
const ROOM_ERRORS = {
  room_not_found: 'Diesen Raum gibt es nicht (mehr). Stimmt der Code?',
  room_full: 'Der Raum ist schon voll.',
  already_started: 'Dort läuft schon eine Partie.',
  too_many_attempts: 'Zu viele Versuche – bitte kurz warten.',
};

const activePlayers = (online) => online.room.players.filter((player) => !player.left);
const roomLink = (code) => `${location.origin}${location.pathname}?raum=${encodeURIComponent(code)}`;

async function onlineEnter(kind, code) {
  if (ui.online) await onlineLeave();
  try {
    const options = { max_players: 2, mode: 'duell' };
    const result = kind === 'create' ? await net.create({ ...options, visibility: 'private' })
      : kind === 'join' ? await net.join(code) : await net.quick(options);
    ui.online = {
      seat: result.you.seat, room: result.room, after: 0, decks: {}, plans: {}, answers: {}, asked: {},
      canon: null, deckSent: false, resolving: false, finished: false,
    };
    try { sessionStorage.setItem(ROOM_SESSION, JSON.stringify(net.session())); } catch { /* egal */ }
    play('click');
    renderLobby();
    scheduleOnline(0);
  } catch (error) {
    toast(ROOM_ERRORS[error?.code] ?? 'Die Verbindung klappt gerade nicht. Bitte später nochmal.');
  }
}

async function onlineLeave() {
  clearTimeout(ui.onlineTimer);
  const online = ui.online;
  ui.online = null;
  if (ui.match?.online) ui.match = null;
  try { sessionStorage.removeItem(ROOM_SESSION); } catch { /* egal */ }
  if (online) { try { await net.leave(); } catch { /* Raum schon weg */ } }
  if (ui.page === 'multi') renderLobby();
}

function scheduleOnline(ms) {
  clearTimeout(ui.onlineTimer);
  ui.onlineTimer = setTimeout(() => void onlineTick(), ms);
}

const cleanPlan = (plan) => (Array.isArray(plan) ? plan.slice(0, 12)
  .filter((step) => Number.isInteger(step?.uid) && Number.isInteger(step?.front))
  .map((step) => ({ uid: step.uid, front: step.front })) : []);

function ingest(online, action) {
  const data = action.data ?? {};
  const key = `${data.round}-${data.zug}`;
  if (data.type === 'deck' && !online.decks[action.seat]) {
    const cards = cleanDeck(data.cards);
    online.decks[action.seat] = deckReady(cards) ? cards : [...DECKS.flammen.cards];
  } else if (data.type === 'plan') {
    online.plans[key] ??= {};
    online.plans[key][action.seat] ??= { plan: cleanPlan(data.plan), drum: data.drum === true };
  } else if (data.type === 'answer' && online.answers[key] === undefined) {
    online.answers[key] = data.accept === true;
  }
}

async function onlineTick() {
  const online = ui.online;
  if (!online) return;
  try {
    const result = await net.poll(online.after);
    if (ui.online !== online) return;
    online.room = result.room;
    for (const action of result.actions ?? []) {
      online.after = Math.max(online.after, action.seq);
      ingest(online, action);
    }
    if (online.room.status === 'waiting') {
      if (online.room.host_seat === online.seat && activePlayers(online).length >= 2) await net.start();
    } else if (!online.deckSent) {
      online.deckSent = true;
      await net.action({ type: 'deck', cards: deckCards(save.deck) });
    }
    if (ui.page === 'multi' && !online.canon) renderLobby();
    if (online.canon && !online.finished) checkOpponent(online);
    if (!online.finished) await onlineAdvance(online);
  } catch (error) {
    if (ui.online === online && (error?.status === 404 || error?.status === 403)) {
      await onlineGone('Der Raum wurde geschlossen.');
      return;
    }
  }
  if (ui.online === online && !online.finished) scheduleOnline(online.canon ? 1000 : 1500);
}

function startOnlineGame(online) {
  const players = [...online.room.players].sort((a, b) => a.seat - b.seat);
  const other = players.find((player) => player.seat !== online.seat);
  online.opponent = {
    id: 'online', online: true, name: other?.name ?? 'Gegner', title: '', avatarUrl: safeLink(other?.avatar_url),
    portrait: 'funkenkobold', stars: 2, intro: '', win: 'Gut gespielt!', lose: 'Gut gespielt!',
  };
  const names = players.slice(0, 2).map((player) => (player.seat === online.seat ? 'Du' : player.name));
  online.canon = E.createGame({ seed: online.room.seed, decks: [online.decks[0], online.decks[1]], names });
  ui.match = { online: true, opponent: 'online', chapter: null };
  ui.gameId = (ui.gameId ?? 0) + 1;
  refreshView();
  platform.beginLevel('online');
  ui.seen.clear();
  $('#enemy-name').textContent = online.opponent.name;
  $('#enemy-avatar').replaceChildren(avatarElement(online.opponent, 'top-avatar'));
  $('#hub').hidden = true;
  $('#game').hidden = false;
  beginZug();
  toast(`⚔️ Duell gegen ${online.opponent.name}!`);
}

async function onlineAdvance(online) {
  if (!online.canon) {
    if (online.decks[0] && online.decks[1] && Number.isInteger(online.room.seed)) startOnlineGame(online);
    return;
  }
  const game = online.canon;
  if (online.resolving || game.phase !== 'plan') return;
  const key = `${game.round}-${game.zug}`;
  const entry = online.plans[key];
  if (!entry?.[0] || !entry?.[1]) return;
  const plans = [0, 1].map((seat) => (E.checkPlan(game, seat, entry[seat].plan).ok ? entry[seat].plan : []));
  const drums = [0, 1].map((seat) => entry[seat].drum && !game.drumUsed[seat]);
  const accept = [true, true];
  if (drums[0] !== drums[1]) {
    const answerer = drums[0] ? 1 : 0;
    if (online.answers[key] === undefined) {
      if (answerer === online.seat && !online.asked[key]) {
        online.asked[key] = true;
        void askOnlineDrum(game);
      } else if (answerer !== online.seat) $('#log').textContent = '🥁 Du trommelst! Der Gegner überlegt …';
      return;
    }
    accept[answerer] = online.answers[key];
    if (answerer !== online.seat) toast(accept[answerer] ? 'Der Gegner geht mit!' : 'Der Gegner gibt die Runde auf!');
  } else if (drums[0]) toast('Beide trommeln! Der Einsatz steigt doppelt.');
  if (drums.some(Boolean)) play('drum');
  online.resolving = true;
  const gameId = ui.gameId;
  try {
    await resolveTurn(plans, drums, accept, () => gameId !== ui.gameId || $('#game').hidden);
  } finally {
    online.resolving = false;
  }
}

async function askOnlineDrum(game) {
  play('drum');
  const accept = await dialog('🥁 Kriegstrommel!',
    `Dein Gegner schlägt die Kriegstrommel. Wenn du mitgehst, zählt diese Runde ${game.stakes + 1} Banner.\nGibst du auf, bekommt er sofort ${game.stakes} Banner.`,
    [{ label: 'Aufgeben', value: false }, { label: 'Mitgehen!', value: true, primary: true }]);
  try {
    await net.action({ type: 'answer', round: game.round, zug: game.zug, accept });
  } catch {
    toast('Senden hat nicht geklappt.');
  }
  scheduleOnline(200);
}

async function onlineSubmit() {
  const game = ui.online.canon;
  $('#log').textContent = 'Warte auf deinen Gegner …';
  try {
    await net.action({ type: 'plan', round: game.round, zug: game.zug, plan: ui.plan, drum: ui.drum && !state.drumUsed[0] });
  } catch {
    toast('Senden hat nicht geklappt – bitte nochmal.');
    ui.busy = false;
    render();
    return;
  }
  scheduleOnline(150);
}

function checkOpponent(online) {
  const other = online.room.players.find((player) => player.seat !== online.seat);
  if (other?.left) {
    void onlineGone(`${other.name} hat das Duell verlassen – du gewinnst!`, true);
    return;
  }
  if (other && !other.online && ui.busy && !online.resolving) $('#log').textContent = `${other.name} ist gerade offline – warte …`;
}

async function onlineGone(text, win = false) {
  const online = ui.online;
  if (!online || online.finished) return;
  online.finished = true;
  if (win) {
    save.wins++;
    save.coins += 30;
    store();
  }
  const body = h('div', 'result');
  if (win) body.append(symbol('sieg', 'result-symbol'));
  body.append(h('p', '', text));
  if (win) body.append(coinText('+30', 'reward-value'));
  await dialog(win ? '🏆 Sieg!' : 'Duell beendet', body, [{ label: 'Weiter', value: true, primary: true }]);
  await onlineLeave();
  showHub('multi');
}

async function onlineMatchEnd(body) {
  const online = ui.online;
  online.finished = true;
  const won = state.winner === 0;
  const coins = won ? 60 : state.winner === null ? 30 : 20;
  if (won) {
    save.wins++;
    bump('wins');
    bump('onlineWins');
  } else if (state.winner === 1) save.losses++;
  save.coins += coins;
  store();
  platform.endLevel({ result: won ? 'win' : 'lose', score: state.banners[0], data: { deck: save.deck, runden: state.round } });
  if (online.room.host_seat === online.seat) {
    const canon = online.canon;
    const results = [0, 1].map((seat) => ({ seat, place: canon.winner === null ? 1 : canon.winner === seat ? 1 : 2, score: canon.banners[seat] }));
    net.finish(results).catch(() => {});
  }
  if (state.winner !== null) body.prepend(symbol(won ? 'sieg' : 'niederlage', 'result-symbol'));
  const reward = h('div', 'reward');
  const row = h('div', 'reward-row');
  row.append(h('span', '', won ? 'Online-Sieg' : 'Online-Duell'), coinText(`+${coins}`, 'reward-value'));
  reward.append(row);
  body.append(reward);
  if (won) { play('win'); confetti(); } else if (state.winner === 1) play('lose');
  await dialog(won ? '🏆 Sieg!' : state.winner === 1 ? '💀 Niederlage' : 'Unentschieden', body, [{ label: 'Zurück', value: true, primary: true }]);
  announceAchievements();
  await onlineLeave();
  showHub('multi');
}

function renderLobby() {
  const box = $('#online-lobby');
  if (!box) return;
  box.replaceChildren();
  const online = ui.online;
  if (!online && !onlineAvailable()) {
    const soon = h('div', 'lobby-card');
    soon.append(h('b', '', '🤝 Online-Duelle'), h('span', '', 'Freundes-Duelle per Code und schnelle Duelle gegen andere Spieler kommen sehr bald!'));
    box.append(soon);
    return;
  }
  if (!online) {
    const friend = h('div', 'lobby-card');
    friend.append(h('b', '', '🤝 Freundes-Duell'), h('span', '', 'Erstelle einen Raum und schick den Code an einen Freund.'));
    const create = h('button', 'big-btn small-btn', 'Raum erstellen');
    create.type = 'button';
    create.addEventListener('click', () => onlineEnter('create'));
    const joinRow = h('form', 'join-row');
    const input = h('input', 'code-input');
    input.placeholder = 'CODE';
    input.maxLength = 6;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Raum-Code');
    const join = h('button', 'plain-btn small-btn', 'Beitreten');
    join.type = 'submit';
    joinRow.append(input, join);
    joinRow.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = input.value.trim().toUpperCase();
      if (/^[A-Z0-9]{6}$/.test(code)) onlineEnter('join', code); else toast('Der Code hat 6 Zeichen.');
    });
    friend.append(create, joinRow);
    const quick = h('div', 'lobby-card');
    quick.append(h('b', '', '⚡ Schnelles Duell'), h('span', '', 'Gegen jemanden, der gerade auch ein Duell sucht.'));
    const search = h('button', 'big-btn small-btn', 'Gegner suchen');
    search.type = 'button';
    search.addEventListener('click', () => onlineEnter('quick'));
    quick.append(search);
    box.append(friend, quick);
    if (net.kind === 'lokal') box.append(h('p', 'lobby-note', '🧪 Testmodus: Ohne Webseite laufen Duelle nur zwischen zwei Fenstern dieses Browsers. Öffne das Spiel einfach ein zweites Mal.'));
    return;
  }
  const room = online.room;
  const card = h('div', 'lobby-card waiting');
  const others = activePlayers(online).length;
  const host = room.host_seat === online.seat;
  card.append(h('b', '', room.visibility === 'public' ? '⚡ Suche Gegner …' : host ? '🤝 Dein Raum' : `🤝 Raum ${room.code}`));
  if (room.visibility !== 'public' && host) {
    card.append(h('span', '', 'Gib deinem Freund diesen Code:'), h('div', 'room-code', room.code));
    const share = h('button', 'plain-btn small-btn', '🔗 Einladung teilen');
    share.type = 'button';
    share.addEventListener('click', async () => {
      const url = roomLink(room.code);
      try {
        if (navigator.share) await navigator.share({ title: 'Drei Fronten', text: `Duell mich in Drei Fronten! Code: ${room.code}`, url });
        else { await navigator.clipboard.writeText(url); toast('Link kopiert!'); }
      } catch { /* abgebrochen */ }
    });
    card.append(share);
  }
  const list = h('ul', 'lobby-players');
  for (const player of room.players.filter((entry) => !entry.left)) {
    const item = h('li', player.online ? 'on' : 'off', `${player.seat === online.seat ? '🟢 Du' : `🟢 ${player.name}`}`);
    list.append(item);
  }
  card.append(list, h('p', 'lobby-status', room.status === 'waiting' ? (others < 2 ? 'Warte auf Mitspieler …' : 'Gleich geht’s los …') : 'Die Partie startet …'));
  const cancel = h('button', 'plain-btn small-btn', 'Abbrechen');
  cancel.type = 'button';
  cancel.addEventListener('click', () => onlineLeave());
  card.append(cancel);
  box.append(card);
}

// ---------- Übungspartie mit Trainer ----------

async function offerTutorial() {
  const choice = await dialog('Zum ersten Mal hier?', 'Lern Drei Fronten in einer kurzen Übungspartie (2 Minuten) – Schritt für Schritt. Dafür gibt es 100 Münzen.', [
    { label: 'Regeln lesen', value: 'rules' }, { label: 'Direkt spielen', value: 'skip' }, { label: '🎓 Übungspartie', value: 'tutorial', primary: true },
  ]);
  if (choice === 'tutorial') { startTutorial(); return true; }
  if (choice === 'rules') await showRules();
  save.rulesSeen = true;
  store();
  return false;
}

function startTutorial() {
  ui.match = { opponent: 'lio', chapter: null, tutorial: true };
  const opponent = currentOpponent();
  state = E.createGame({ seed: 7, decks: [[], []], names: ['Du', opponent.name], goal: 1 });
  state.fronts = TUTORIAL.fronts.map((id) => ({ id, sides: [[], []], shield: [false, false] }));
  state.lastFronts = [...TUTORIAL.fronts];
  state.initiative = 0;
  const hand = (ids) => ids.map((id) => ({ uid: state.nextUid++, id }));
  state.players[0].hand = hand(TUTORIAL.hand);
  state.players[1].hand = hand(TUTORIAL.enemyHand);
  ui.gameId = (ui.gameId ?? 0) + 1;
  ui.seen.clear();
  $('#enemy-name').textContent = opponent.name;
  $('#enemy-avatar').replaceChildren(avatarElement(opponent, 'top-avatar'));
  $('#hub').hidden = true;
  $('#game').hidden = false;
  beginZug();
}

function tutorialBotPlan() {
  const hand = state.players[1].hand;
  const plan = (TUTORIAL.enemyPlan[state.zug] ?? []).map(([id, front]) => ({ uid: hand.find((card) => card.id === id)?.uid, front }))
    .filter((step) => step.uid);
  return { plan, drum: false, chance: 0.5 };
}

function startCoach(zug) {
  ui.coach = { steps: TUTORIAL.steps[zug] ?? [], index: 0 };
  renderCoach();
  render();
}

function currentStep() {
  return ui.coach?.steps[ui.coach.index] ?? null;
}

function renderCoach() {
  const step = currentStep();
  const info = $('#info');
  info.replaceChildren();
  info.classList.toggle('coach', Boolean(step));
  if (!step) return;
  const text = h('div', 'coach-text');
  text.append(h('span', 'coach-icon', '🎓'), h('span', '', step.text));
  info.append(text);
  if (step.type === 'info') {
    const next = h('button', 'big-btn small-btn coach-next', 'Weiter');
    next.type = 'button';
    next.addEventListener('click', () => coachAdvance('info'));
    info.append(next);
  }
}

function highlightCoach() {
  for (const element of document.querySelectorAll('.coach-target')) element.classList.remove('coach-target');
  const step = currentStep();
  if (!step) return;
  if (step.front !== undefined) document.querySelector(`.front[data-front="${step.front}"]`)?.classList.add('coach-target');
  if (step.type === 'place' && ui.selected === null) {
    const card = state.players[0].hand.find((entry) => entry.id === step.card);
    const index = [...state.players[0].hand].filter((entry) => !ui.plan.some((p) => p.uid === entry.uid)).indexOf(card);
    document.querySelectorAll('#hand .card')[index]?.classList.add('coach-target');
  }
  if (step.type === 'ready') $('#ready').classList.add('coach-target');
}

function coachAdvance(kind) {
  const step = currentStep();
  if (!step || step.type !== kind) return;
  ui.coach.index++;
  renderCoach();
  highlightCoach();
}

function coachAllowsCard(cardId) {
  const step = currentStep();
  if (!ui.coach || !step) return true;
  if (step.type === 'place' && step.card === cardId) return true;
  toast(step.type === 'place' ? 'Nimm die leuchtende Karte.' : step.type === 'ready' ? 'Drück jetzt „Aufdecken!“.' : 'Lies den Hinweis und tippe auf „Weiter“.');
  return false;
}

function coachAllowsPlace(cardId, front) {
  const step = currentStep();
  if (!ui.coach || !step) return true;
  if (step.type === 'place' && step.card === cardId && step.front === front) return true;
  toast('Leg die Karte auf die leuchtende Front.');
  return false;
}

function coachAllowsReady() {
  const step = currentStep();
  if (!ui.coach || !step) return true;
  if (step.type === 'ready') return true;
  toast(step.type === 'place' ? 'Leg zuerst die leuchtende Karte.' : 'Lies den Hinweis und tippe auf „Weiter“.');
  return false;
}

async function tutorialEnd(body) {
  ui.coach = null;
  $('#info').classList.remove('coach');
  const first = !save.tutorialDone;
  save.tutorialDone = true;
  save.rulesSeen = true;
  if (first) save.coins += TUTORIAL.reward;
  store();
  play('win');
  confetti();
  const box = h('div', 'tutorial-end');
  box.append(body);
  const tips = h('ul', 'tutorial-tips');
  for (const tip of [
    'Du hast Urwald und Gezeitensee gewonnen – 2 von 3 Fronten reichen für das Banner.',
    'Mit der 🥁 Kriegstrommel zählt eine Runde ein Banner mehr – der Gegner kann mitgehen oder aufgeben.',
    'Neue Karten gibt es im Shop, Gegner mit eigener Persönlichkeit in der Kampagne.',
  ]) tips.append(h('li', '', tip));
  box.append(tips);
  if (first) box.append(coinText(`+${TUTORIAL.reward}`, 'reward-value'));
  const choice = await dialog('🎓 Übung geschafft!', box, [
    { label: 'Zum Start', value: 'home' }, { label: '📜 Zur Kampagne', value: 'campaign', primary: true },
  ]);
  ui.match = null;
  state = null;
  showHub(choice === 'campaign' ? 'campaign' : 'home');
}

function init() {
  $('#version').textContent = version;
  for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => { play('click'); showPage(tab.dataset.page); });
  $('#home-deck').addEventListener('click', () => { viewedDeck = save.deck; showPage('decks'); });
  if (platformHosted(version)) $('#back-link').hidden = false;
  $('#play').addEventListener('click', async () => {
    if (!save.rulesSeen && await offerTutorial()) return;
    startGame();
  });
  $('#play-info').addEventListener('click', () => $('#opponents-choice').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  $('#settings-btn').addEventListener('click', showSettings);
  $('#campaign-btn').addEventListener('click', () => { play('click'); showPage('campaign'); });
  $('#campaign-back').addEventListener('click', () => showPage('home'));
  $('#achievements-btn').addEventListener('click', showAchievements);
  setSound(save.sound);
  setMusic(save.music);
  const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
  $('#ready').addEventListener('click', ready);
  $('#drum').addEventListener('click', () => {
    if (ui.busy || state.drumUsed[0]) return;
    ui.drum = !ui.drum;
    if (ui.drum) play('drum');
    toast(ui.drum ? '🥁 Du trommelst! Die Runde zählt ein Banner mehr.' : 'Trommel zurückgenommen.');
    render();
  });
  $('#board').addEventListener('dblclick', () => { ui.fast = true; });
  $('#log').addEventListener('click', () => { if (ui.busy) ui.fast = true; });
  $('#menu-btn').addEventListener('click', async () => {
    const choice = await dialog('Menü', null, [
      { label: "So geht's", value: 'rules' },
      { label: 'Partie aufgeben', value: 'quit' },
      { label: 'Weiterspielen', value: 'back', primary: true },
    ]);
    if (choice === 'rules') await showRules();
    if (choice === 'quit') {
      const sure = await dialog('Wirklich aufgeben?', 'Die Partie zählt dann als Niederlage.', [
        { label: 'Nein', value: false }, { label: 'Ja, aufgeben', value: true, primary: true },
      ]);
      if (sure) {
        if (ui.online) {
          save.losses++;
          store();
          await onlineLeave();
          showHub('multi');
          return;
        }
        save.losses++;
        save.streak = 0;
        save.ruhm = 0;
        platform.endLevel({ result: 'abort', score: state.banners[0], data: { deck: save.deck, runden: state.round } });
        store();
        showHub('home');
      }
    }
  });
  showHub('home');
  if ('serviceWorker' in navigator && version !== 'dev') {
    navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(() => {});
  }
  platform.start();
  platform.watchErrors();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && cloudTimer) void pushCloud({ keepalive: true });
  });
  const invite = new URLSearchParams(location.search).get('raum');
  if (invite && /^[A-Za-z0-9]{6}$/.test(invite) && onlineAvailable()) {
    history.replaceState(null, '', location.pathname);
    showHub('multi');
    void onlineEnter('join', invite.toUpperCase());
  }
  void loadHub();
  void connectAccount();
  void showPatchNotes();
}

init();
