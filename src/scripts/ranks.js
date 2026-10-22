// Öffentliche Ranglisten: Spiel und Rangliste wählen, „diese Woche“ oder „gesamt“.
// Ohne Konto sichtbar; mit Anmeldung wird der eigene Platz hervorgehoben.

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

function formatDate(utc) {
  return new Date(`${utc.replace(' ', 'T')}Z`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function boardLabel(board) {
  return /^\d+$/.test(board) ? `Level ${board}` : board.charAt(0).toUpperCase() + board.slice(1);
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
  const data = await getJson(`/api/games/${encodeURIComponent(state.game)}/leaderboard?${params}`);
  const list = $('[data-rank-list]');
  if (!data) {
    list.replaceChildren();
    $('[data-rank-empty]').hidden = false;
    return;
  }

  state.board = data.board;
  const boardSelect = $('[data-rank-board]');
  boardSelect.replaceChildren(...data.boards.map((board) => new Option(boardLabel(board), board)));
  boardSelect.value = data.board;
  boardSelect.disabled = data.boards.length === 0;

  list.replaceChildren(...data.entries.map((entry) => {
    const item = document.createElement('li');
    item.className = `ranks__item${entry.me ? ' ranks__item--me' : ''}${entry.rank <= 3 ? ` ranks__item--top${entry.rank}` : ''}`;
    item.append(
      Object.assign(document.createElement('span'), { className: 'ranks__rank', textContent: String(entry.rank) }),
      Object.assign(document.createElement('span'), { className: 'ranks__name', textContent: entry.display_name + (entry.me ? ' (du)' : '') }),
      Object.assign(document.createElement('span'), { className: 'ranks__score', textContent: entry.score.toLocaleString('de-DE') }),
      Object.assign(document.createElement('span'), { className: 'ranks__date', textContent: formatDate(entry.achieved_at) }),
    );
    return item;
  }));
  $('[data-rank-empty]').hidden = data.entries.length > 0;

  const me = $('[data-rank-me]');
  me.hidden = !data.me?.rank;
  if (data.me?.rank) me.textContent = `Dein Platz: ${data.me.rank} mit ${data.me.score.toLocaleString('de-DE')} Punkten.`;
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
