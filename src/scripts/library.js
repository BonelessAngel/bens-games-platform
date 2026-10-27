// Bibliothek: Die Seite enthält schon die öffentlichen Apps (beim Build erzeugt).
// Wo Konten aktiv sind, wird die Liste durch die passende Liste für den angemeldeten Nutzer ersetzt –
// inklusive Beta- und freigegebener Apps.
import { renderLibrary } from '../../lib/library.js';
import { boardLabel } from '../../lib/boards.js';
import { userReady } from './nav.js';
import './intro.js';

const container = document.querySelector('[data-library]');

if (container && document.querySelector('meta[name="bg-accounts"]')) {
  fetch('/api/apps', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (Array.isArray(data?.apps)) container.innerHTML = renderLibrary(data.apps, { filter: false, pages: (container.dataset.pages ?? '').split(',').filter(Boolean) });
    })
    .catch(() => {
      // Ohne API bleibt die beim Build erzeugte Liste stehen.
    });
}

// „Weiterspielen“: Für Angemeldete die zuletzt gespielten Spiele ganz oben, mit Bestwert.
function since(utc) {
  const days = Math.floor((Date.now() - new Date(`${utc.replace(' ', 'T')}Z`).getTime()) / 86_400_000);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  return days < 30 ? `vor ${days} Tagen` : new Date(`${utc.replace(' ', 'T')}Z`).toLocaleDateString('de-DE');
}

async function showRecent() {
  const section = document.querySelector('[data-continue]');
  if (!section || !(await userReady)) return;
  let games = [];
  try {
    const response = await fetch('/api/account/recent', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    games = response.ok ? (await response.json()).games ?? [] : [];
  } catch {
    return;
  }
  if (!games.length) return;
  section.querySelector('[data-continue-list]').replaceChildren(...games.map((game) => {
    const card = document.createElement('a');
    card.className = 'continue__card';
    card.href = game.path;
    const icon = document.createElement('img');
    icon.src = game.icon;
    icon.alt = '';
    icon.width = 48;
    icon.height = 48;
    const text = document.createElement('span');
    text.className = 'continue__text';
    const name = document.createElement('strong');
    name.textContent = game.name;
    const meta = document.createElement('span');
    meta.textContent = game.best
      ? `Bestwert ${game.best.score.toLocaleString('de-DE')} (${boardLabel(game.best.board)}) · ${since(game.last_played)}`
      : `Zuletzt gespielt ${since(game.last_played)}`;
    text.append(name, meta);
    const play = document.createElement('span');
    play.className = 'continue__play';
    play.setAttribute('aria-hidden', 'true');
    play.textContent = '▶';
    card.append(icon, text, play);
    return card;
  }));
  section.hidden = false;
}

showRecent();
