// Öffentliche Ranglisten: erst Spiel wählen, dann Modus (Hauptmodus zuerst, Level als Auswahl), dann Zeitraum.
// Siegertreppchen für Platz 1–3, Liste ab Platz 4, eigene Position immer unten sichtbar. Namen führen zum Profil.
import { avatarSvg } from '../../lib/avatars.js';
import { boardLabel } from '../../lib/boards.js';
import { userReady } from './nav.js';
import { shareButton } from './share.js';

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(window.location.search);
const state = { game: '', board: params.get('liste') ?? '', period: params.get('zeit') === 'allzeit' ? 'all' : 'week' };

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
const isLevel = (board) => /^\d+$/.test(board);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Namen führen zum öffentlichen Spielerprofil.
function nameLink(entry, className) {
  const link = el('a', className, entry.display_name + (entry.me ? ' (du)' : ''));
  link.href = `/spieler/?name=${encodeURIComponent(entry.display_name)}`;
  link.title = `Profil von ${entry.display_name}`;
  return link;
}

function avatarNode(entry, size) {
  const span = el('span', 'ranks__avatar');
  span.innerHTML = avatarSvg({ avatar: entry.avatar, color: entry.avatar_color, name: entry.display_name }, size);
  return span;
}

function setUrl() {
  const url = new URL(window.location.href);
  const values = { spiel: state.game, liste: state.board, zeit: state.period === 'all' ? 'allzeit' : '' };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
}

// ---------- Auswahl ----------
let games = [];

function renderGames() {
  const box = $('[data-rank-games]');
  box.replaceChildren(...games.map((game) => {
    const button = el('button', 'game-tab');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(game.id === state.game));
    const img = document.createElement('img');
    img.src = game.icon;
    img.alt = '';
    img.width = 36;
    img.height = 36;
    button.append(img, el('span', null, game.name));
    button.addEventListener('click', () => {
      state.game = game.id;
      state.board = '';
      renderGames();
      load();
    });
    return button;
  }));
}

function renderBoards(boards, selected) {
  // Modi als Chips, Level (Zahlen) gesammelt in einer Auswahlliste – sonst wird es bei vielen Leveln unübersichtlich.
  const modes = boards.filter((b) => !isLevel(b));
  const levels = boards.filter(isLevel);
  const chips = $('[data-rank-boards]');
  const items = [...modes.map((b) => ({ id: b, label: boardLabel(b) })), ...(levels.length ? [{ id: 'level', label: 'Kampagne' }] : [])];
  chips.replaceChildren(...items.map((item) => {
    const button = el('button', 'chip', item.label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    const active = item.id === 'level' ? isLevel(selected) : item.id === selected;
    button.setAttribute('aria-selected', String(active));
    button.addEventListener('click', () => {
      state.board = item.id === 'level' ? (isLevel(state.board) ? state.board : levels[0]) : item.id;
      load();
    });
    return button;
  }));
  const levelBox = $('[data-rank-level-box]');
  levelBox.hidden = !isLevel(selected);
  const select = $('[data-rank-level]');
  select.replaceChildren(...levels.map((b) => {
    const option = el('option', null, boardLabel(b));
    option.value = b;
    option.selected = b === selected;
    return option;
  }));
}

$('[data-rank-level]').addEventListener('change', (event) => {
  state.board = event.target.value;
  load();
});

for (const button of document.querySelectorAll('[data-rank-period]')) {
  button.setAttribute('aria-pressed', String(button.dataset.rankPeriod === state.period));
  button.addEventListener('click', () => {
    state.period = button.dataset.rankPeriod;
    for (const other of document.querySelectorAll('[data-rank-period]')) other.setAttribute('aria-pressed', String(other === button));
    load();
  });
}

// ---------- Anzeige ----------
function renderHero(game, data) {
  const hero = $('[data-rank-hero]');
  hero.hidden = !game;
  if (!game) return;
  hero.style.setProperty('--game-accent', game.id === 'royal-blocks' ? '#ff3d8b' : game.id === 'nova-bastion' ? '#3de8ff' : 'var(--accent)');
  $('[data-rank-hero-icon]').src = game.icon;
  $('[data-rank-hero-title]').textContent = `${game.name} · ${boardLabel(data.board)}`;
  $('[data-rank-play]').href = game.path;
  const record = data.record;
  $('[data-rank-record]').textContent = record
    ? `🏆 Rekord aller Zeiten: ${points(record.score)} von ${record.display_name} (${formatDate(record.achieved_at)})`
    : 'Noch kein Rekord – hol ihn dir!';
}

let countdownTimer = null;
function renderCountdown(data) {
  const info = $('[data-rank-countdown]');
  clearInterval(countdownTimer);
  const players = data.total ? `${points(data.total)} ${data.total === 1 ? 'Spieler' : 'Spieler'}` : '';
  if (state.period === 'all' || !data.week_ends) {
    info.textContent = players ? `${players} insgesamt` : '';
    return;
  }
  const end = new Date(data.week_ends).getTime();
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    const days = Math.floor(left / 86_400_000);
    const hours = Math.floor((left % 86_400_000) / 3_600_000);
    const minutes = Math.floor((left % 3_600_000) / 60_000);
    const time = days ? `${days} T ${hours} Std.` : hours ? `${hours} Std. ${minutes} Min.` : `${minutes} Min.`;
    info.textContent = `⏳ Neue Woche in ${time}${players ? ` · ${players} diese Woche` : ''}`;
  };
  tick();
  countdownTimer = setInterval(tick, 30_000);
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
      if (rank === 1) place.append(el('span', 'podium__crown', '👑'));
      place.append(avatarNode(entry, rank === 1 ? 80 : 60), nameLink(entry, 'podium__name'), el('span', 'podium__score', points(entry.score)));
    } else {
      place.append(el('span', 'podium__free', 'frei'));
    }
    place.append(el('div', 'podium__step', ['', '🥇', '🥈', '🥉'][rank]));
    podium.append(place);
  }
}

function row(entry) {
  const item = el('li', `ranks__item${entry.me ? ' ranks__item--me' : ''}`);
  item.append(el('span', 'ranks__rank', String(entry.rank)), avatarNode(entry, 36), nameLink(entry, 'ranks__name'), el('span', 'ranks__score', points(entry.score)));
  return item;
}

function renderMe(data, user, game) {
  const box = $('[data-rank-me]');
  box.replaceChildren();
  box.hidden = false;
  const playLink = (text) => {
    const link = el('a', 'button button--small', text);
    link.href = game?.path ?? '/';
    return link;
  };
  if (!user) {
    const copy = el('div', 'rank-me__text');
    copy.append(el('strong', null, 'Du willst hier auch stehen?'), el('span', null, 'Mit Konto erscheinst du nach jeder Runde automatisch in der Rangliste.'));
    const register = el('a', 'button button--small', 'Konto erstellen');
    register.href = '/konto/registrieren/';
    box.append(el('span', 'rank-me__icon', '🎮'), copy, register);
    return;
  }
  const me = data.me;
  if (!me?.rank) {
    const copy = el('div', 'rank-me__text');
    copy.append(
      el('strong', null, state.period === 'week' ? 'Diese Woche noch kein Ergebnis' : 'Noch kein Ergebnis'),
      el('span', null, 'Spiel eine Runde – dann steht dein Name hier.'),
    );
    box.append(avatarNode(user, 44), copy, playLink('▶ Jetzt spielen'));
    return;
  }
  const copy = el('div', 'rank-me__text');
  copy.append(
    el('strong', null, `Platz ${points(me.rank)}${data.total ? ` von ${points(data.total)}` : ''} · ${points(me.score)} Punkte`),
    el('span', null, me.ahead ? `Noch ${points(me.ahead)} Punkte bis Platz ${points(me.rank - 1)}` : '👑 Niemand ist besser als du!'),
  );
  box.append(el('span', 'rank-me__rank', `#${me.rank}`), copy, playLink(me.ahead ? '▶ Aufholen' : '▶ Verteidigen'));
}

async function loadGames() {
  const data = await getJson('/api/apps');
  games = (data?.apps ?? []).filter((app) => app.type === 'game');
  const fromUrl = params.get('spiel');
  state.game = games.some((g) => g.id === fromUrl) ? fromUrl : games[0]?.id ?? '';
  renderGames();
}

async function load() {
  if (!state.game) return;
  const query = new URLSearchParams({ period: state.period });
  if (state.board) query.set('board', state.board);
  const [data, user] = await Promise.all([getJson(`/api/games/${encodeURIComponent(state.game)}/leaderboard?${query}`), userReady]);
  const game = games.find((g) => g.id === state.game);
  if (!data) {
    renderHero(null);
    renderPodium([]);
    $('[data-rank-list]').replaceChildren();
    $('[data-rank-empty]').hidden = false;
    $('[data-rank-empty]').textContent = 'Die Rangliste ist gerade nicht erreichbar.';
    $('[data-rank-me]').hidden = true;
    return;
  }
  state.board = data.board;
  setUrl();
  renderHero(game, data);
  renderBoards(data.boards, data.board);
  renderCountdown(data);
  renderPodium(data.entries.filter((e) => e.rank <= 3));
  $('[data-rank-list]').replaceChildren(...data.entries.filter((e) => e.rank > 3).map(row));
  $('[data-rank-empty]').hidden = data.entries.length > 0;
  $('[data-rank-empty]').textContent = state.period === 'week'
    ? 'Diese Woche hat noch niemand gespielt – sei die oder der Erste!'
    : 'Noch keine Einträge. Spiel eine Runde und sei die oder der Erste!';
  renderMe(data, user, game);
}

$('[data-rank-share]').append(shareButton(() => {
  const game = games.find((g) => g.id === state.game);
  const url = new URL('/ranglisten/', window.location.origin);
  if (state.game) url.searchParams.set('spiel', state.game);
  if (state.board) url.searchParams.set('liste', state.board);
  return {
    title: 'Ranglisten – Bens Games',
    text: game ? `Wer schafft mehr? Rangliste ${game.name} – ${boardLabel(state.board)}:` : 'Die Ranglisten von Bens Games:',
    url: url.toString(),
  };
}));

loadGames().then(load);
