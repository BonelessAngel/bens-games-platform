// Öffentliches Spielerprofil (/spieler/?name=…): Bestwerte mit Platz je Rangliste und Erfolge als Abzeichen.
import { avatarSvg } from '../../lib/avatars.js';
import { boardLabel } from '../../lib/boards.js';
import { badgeList } from './badges.js';
import './nav.js';
import { shareButton } from './share.js';

const $ = (selector) => document.querySelector(selector);
const name = new URLSearchParams(window.location.search).get('name') ?? '';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const points = (value) => value.toLocaleString('de-DE');
const memberSince = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

async function renderGame(game) {
  const card = el('section', 'panel player__game');
  const head = el('h2', 'player__game-title');
  const icon = document.createElement('img');
  icon.src = game.icon;
  icon.alt = '';
  icon.width = 32;
  icon.height = 32;
  head.append(icon, el('span', null, game.name));
  card.append(head);

  if (game.boards.length) {
    const list = el('ul', 'player__boards');
    for (const board of game.boards) {
      const item = el('li', 'player__board');
      const link = el('a', 'player__board-name', boardLabel(board.board));
      link.href = `/ranglisten/?spiel=${encodeURIComponent(game.id)}&liste=${encodeURIComponent(board.board)}`;
      const rank = el('span', `player__rank${board.rank && board.rank <= 3 ? ` player__rank--${board.rank}` : ''}`, board.rank ? `Platz ${board.rank}` : '–');
      item.append(link, el('span', 'player__score', `${points(board.score)} Punkte`), rank);
      list.append(item);
    }
    card.append(list);
  }

  if (game.achievements.length) {
    const title = el('h3', 'picker-title', game.achievements.length === 1 ? '1 Erfolg' : `${game.achievements.length} Erfolge`);
    card.append(title, await badgeList(game.id, game.achievements));
  }
  return card;
}

async function load() {
  let data = null;
  if (name && document.querySelector('meta[name="bg-accounts"]')) {
    try {
      const response = await fetch(`/api/players/profile?name=${encodeURIComponent(name)}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      data = response.ok ? await response.json() : null;
    } catch {
      data = null;
    }
  }
  $('[data-player-loading]').hidden = true;
  const profile = data?.profile;
  if (!profile) {
    $('[data-player-missing]').hidden = false;
    return;
  }

  document.title = `${profile.display_name} – Bens Games`;
  $('[data-player-avatar]').innerHTML = avatarSvg({ avatar: profile.avatar, color: profile.avatar_color, name: profile.display_name }, 72);
  $('[data-player-name]').textContent = profile.display_name;
  $('[data-player-since]').textContent = `Dabei seit ${memberSince(profile.member_since)}`;
  $('[data-player-own]').hidden = !profile.me;
  $('[data-player-share]').replaceChildren(shareButton(() => ({
    title: `${profile.display_name} bei Bens Games`,
    text: profile.me ? 'Schau dir meine Bestwerte bei Bens Games an:' : `Schau dir die Bestwerte von ${profile.display_name} an:`,
    url: `${window.location.origin}/spieler/?name=${encodeURIComponent(profile.display_name)}`,
  })));

  const games = await Promise.all(profile.games.map(renderGame));
  $('[data-player-games]').replaceChildren(...games);
  $('[data-player-empty]').hidden = games.length > 0;
  $('[data-player-details]').hidden = false;
}

load();
