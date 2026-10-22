// Öffentliche Ranglisten: Rekord aller Zeiten, Siegertreppchen für Platz 1–3, Liste ab Platz 4,
// eigener Platz unten angeheftet. Ohne Konto sichtbar; mit Anmeldung wird der eigene Eintrag hervorgehoben.
import { avatarSvg } from '../../lib/avatars.js';
import { userReady } from './nav.js';

const $ = (selector) => document.querySelector(selector);
const state = { game: '', board: '', period: 'week' };

async function getJson(path) {
  try {
    const response = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const formatDate = (utc) => new Date(`${utc.replace(' ', 'T')}Z`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const points = (value) => value.toLocaleString('de-DE');
export const boardLabel = (board) => (/^\d+$/.test(board) ? `Level ${board}` : board.charAt(0).toUpperCase() + board.slice(1));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function avatarNode(entry, size) {
  const span = el('span', 'ranks__avatar');
  span.innerHTML = avatarSvg({ avatar: entry.avatar, color: entry.avatar_color, name: entry.display_name }, size);
  return span;
}

function renderRecord(record) {
  const box = $('[data-rank-record]');
  box.replaceChildren();
  box.hidden = !record;
  if (!record) return;
  const text = el('div', 'record__text');
  text.append(
    el('span', 'record__label', 'Rekord aller Zeiten'),
    el('strong', 'record__score', `${points(record.score)} Punkte`),
    el('span', 'record__by', `von ${record.display_name} · ${formatDate(record.achieved_at)}`),
  );
  box.append(el('span', 'record__trophy', '🏆'), avatarNode(record, 48), text);
}

function renderPodium(top) {
  const podium = $('[data-rank-podium]');
  podium.replaceChildren();
  podium.hidden = top.length === 0;
  // Reihenfolge auf dem Treppchen: 2 – 1 – 3
  for (const rank of [2, 1, 3]) {
    const entry = top.find((e) => e.rank === rank);
    const place = el('div', `podium__place podium__place--${rank}${entry?.me ? ' podium__place--me' : ''}`);
    if (entry) {
      place.append(
        avatarNode(entry, rank === 1 ? 72 : 56),
        el('span', 'podium__name', entry.display_name + (entry.me ? ' (du)' : '')),
        el('span', 'podium__score', points(entry.score)),
      );
    }
    place.append(el('div', 'podium__step', String(rank)));
    podium.append(place);
  }
}

function row(entry) {
  const item = el('li', `ranks__item${entry.me ? ' ranks__item--me' : ''}`);
  item.append(
    el('span', 'ranks__rank', String(entry.rank)),
    avatarNode(entry, 32),
    el('span', 'ranks__name', entry.display_name + (entry.me ? ' (du)' : '')),
    el('span', 'ranks__score', points(entry.score)),
  );
  return item;
}

async function loadGames() {
  const data = await getJson('/api/apps');
  const games = (data?.apps ?? []).filter((app) => app.type === 'game');
  const select = $('[data-rank-game]');
  select.replaceChildren(...games.map((game) => new Option(game.name, game.id)));
  const fromUrl = new URLSearchParams(window.location.search).get('spiel');
  state.game = games.some((g) => g.id === fromUrl) ? fromUrl : games[0]?.id ?? '';
  select.value = state.game;
}

async function load() {
  if (!state.game) return;
  const params = new URLSearchParams({ period: state.period });
  if (state.board) params.set('board', state.board);
  const [data, user] = await Promise.all([
    getJson(`/api/games/${encodeURIComponent(state.game)}/leaderboard?${params}`),
    userReady,
  ]);

  const boardSelect = $('[data-rank-board]');
  if (!data) {
    renderRecord(null);
    renderPodium([]);
    $('[data-rank-list]').replaceChildren();
    $('[data-rank-empty]').hidden = false;
    $('[data-rank-me]').hidden = true;
    return;
  }

  state.board = data.board;
  boardSelect.replaceChildren(...data.boards.map((board) => new Option(boardLabel(board), board)));
  boardSelect.value = data.board;
  boardSelect.disabled = data.boards.length === 0;

  renderRecord(data.record);
  renderPodium(data.entries.filter((e) => e.rank <= 3));
  $('[data-rank-list]').replaceChildren(...data.entries.filter((e) => e.rank > 3).map(row));
  $('[data-rank-empty]').hidden = data.entries.length > 0;
  $('[data-rank-empty]').textContent = state.period === 'week'
    ? 'Diese Woche hat noch niemand gespielt – sei die oder der Erste!'
    : 'Noch keine Einträge. Spiel eine Runde und sei die oder der Erste!';

  // Eigener Platz unten angeheftet, wenn er nicht ohnehin auf dieser Seite steht.
  const pinned = $('[data-rank-me]');
  const visible = data.entries.some((e) => e.me);
  pinned.replaceChildren();
  pinned.hidden = !data.me?.rank || visible || !user;
  if (!pinned.hidden) {
    pinned.append(row({ rank: data.me.rank, score: data.me.score, me: true, display_name: user.display_name, avatar: user.avatar, avatar_color: user.avatar_color }));
  }
  $('[data-rank-hint]').hidden = Boolean(user);
}

$('[data-rank-game]').addEventListener('change', (event) => {
  state.game = event.target.value;
  state.board = '';
  load();
});
$('[data-rank-board]').addEventListener('change', (event) => {
  state.board = event.target.value;
  load();
});
for (const button of document.querySelectorAll('[data-rank-period]')) {
  button.addEventListener('click', () => {
    state.period = button.dataset.rankPeriod;
    for (const other of document.querySelectorAll('[data-rank-period]')) other.setAttribute('aria-pressed', String(other === button));
    load();
  });
}

loadGames().then(load);
