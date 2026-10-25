// Spiel-Seite: die besten 5 der hervorgehobenen Rangliste (nur mit Konten-Funktionen; ohne Einträge bleibt der Bereich versteckt).
import { avatarSvg } from '../../lib/avatars.js';
import './nav.js';

const section = document.querySelector('[data-game-top]');

async function loadTop() {
  if (!section || !document.querySelector('meta[name="bg-accounts"]')) return;
  const params = new URLSearchParams({ period: 'all', board: section.dataset.board });
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(section.dataset.game)}/leaderboard?${params}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const data = await response.json();
    const entries = (data.entries ?? []).slice(0, 5);
    if (!entries.length) return;
    section.querySelector('[data-game-top-list]').replaceChildren(...entries.map((entry) => {
      const item = document.createElement('li');
      item.className = 'ranks__item';
      const rank = Object.assign(document.createElement('span'), { className: 'ranks__rank', textContent: String(entry.rank) });
      const avatar = Object.assign(document.createElement('span'), { className: 'ranks__avatar' });
      avatar.innerHTML = avatarSvg({ avatar: entry.avatar, color: entry.avatar_color, name: entry.display_name }, 32);
      const name = Object.assign(document.createElement('a'), { className: 'ranks__name', textContent: entry.display_name });
      name.href = `/spieler/?name=${encodeURIComponent(entry.display_name)}`;
      const score = Object.assign(document.createElement('span'), { className: 'ranks__score', textContent: Number(entry.score).toLocaleString('de-DE') });
      item.append(rank, avatar, name, score);
      return item;
    }));
    section.hidden = false;
  } catch {
    // Ohne Netz oder API bleibt der Bereich einfach versteckt.
  }
}

loadTop();
