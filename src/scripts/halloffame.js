// Ruhmeshalle: Platz 1–3 jeder abgeschlossenen Wochenrangliste, neueste Woche zuerst.
import { avatarSvg } from '../../lib/avatars.js';
import { boardLabel } from '../../lib/boards.js';
import './nav.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// „2026-W43“ → „KW 43 · 19.–25. Okt.“
function weekLabel(week) {
  const [year, number] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (number - 1) * 7 * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  const fmt = (d, month) => d.toLocaleDateString('de-DE', { day: 'numeric', ...(month ? { month: 'short' } : {}), timeZone: 'UTC' });
  return `KW ${number} · ${fmt(monday, monday.getUTCMonth() !== sunday.getUTCMonth())}–${fmt(sunday, true)}`;
}

function winner(entry) {
  const item = el('li', `hall__place hall__place--${entry.place}`);
  const avatar = el('span', 'ranks__avatar');
  avatar.innerHTML = avatarSvg({ avatar: entry.avatar, color: entry.avatar_color, name: entry.display_name }, entry.place === 1 ? 44 : 32);
  const name = el('a', 'hall__name', entry.display_name);
  name.href = `/spieler/?name=${encodeURIComponent(entry.display_name)}`;
  item.append(el('span', 'hall__medal', ['', '🥇', '🥈', '🥉'][entry.place]), avatar, name, el('span', 'hall__score', entry.score.toLocaleString('de-DE')));
  return item;
}

async function load() {
  let data = null;
  try {
    const response = await fetch('/api/halloffame', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    data = response.ok ? await response.json() : null;
  } catch {
    data = null;
  }
  const weeks = (data?.weeks ?? []).filter((w) => w.entries.length);
  document.querySelector('[data-hall-empty]').hidden = weeks.length > 0;
  document.querySelector('[data-hall-weeks]').replaceChildren(...weeks.map((week, k) => {
    const card = el('section', `hall__week${k === 0 ? ' hall__week--latest' : ''}`);
    card.append(el('h2', 'hall__title', k === 0 ? `Letzte Woche · ${weekLabel(week.week)}` : weekLabel(week.week)));
    // nach Spiel und Rangliste gruppieren
    const groups = new Map();
    for (const entry of week.entries) {
      const key = `${entry.app}|${entry.board}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    const grid = el('div', 'hall__grid');
    for (const entries of groups.values()) {
      const box = el('div', 'hall__board');
      const link = el('a', 'hall__board-title', `${entries[0].app_name} · ${boardLabel(entries[0].board)}`);
      link.href = `/ranglisten/?spiel=${encodeURIComponent(entries[0].app)}&liste=${encodeURIComponent(entries[0].board)}`;
      const list = el('ol', 'hall__list');
      list.append(...entries.map(winner));
      box.append(link, list);
      grid.append(box);
    }
    card.append(grid);
    return card;
  }));
}

load();
