// Startseite: Tägliche Aufgaben (mit Konto) und der Ticker „Gerade bei Bens Games“ (für alle).
import { avatarSvg } from '../../lib/avatars.js';
import { boardLabel } from '../../lib/boards.js';
import { userReady } from './nav.js';

async function getJson(path) {
  try {
    const response = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const points = (n) => n.toLocaleString('de-DE');

// ---------- Tägliche Aufgaben ----------
const TASK_ICONS = {
  rounds3: '🎮', rounds10: '🔥', twogames: '🔀', achievement: '🏅', royal3: '🃏', royal5000: '💯', royaldaily: '📅', novalevel: '🛡️', novaendless: '♾️',
};

function taskItem(task) {
  const item = el('li', `daily__task${task.done ? ' daily__task--done' : ''}`);
  const bar = el('span', 'daily__bar');
  const fill = el('i');
  fill.style.width = `${Math.round((100 * task.progress) / task.goal)}%`;
  bar.append(fill);
  const text = el('span', 'daily__text');
  text.append(el('strong', null, task.text), bar);
  const state = task.done ? '✓' : task.goal > 10 ? `${points(task.progress)} / ${points(task.goal)}` : `${task.progress}/${task.goal}`;
  item.append(el('span', 'daily__icon', task.done ? '✅' : TASK_ICONS[task.id] ?? '⭐'), text, el('span', 'daily__state', state));
  return item;
}

async function showDaily() {
  const section = document.querySelector('[data-daily]');
  const user = await userReady;
  if (!section || !user) return;
  const data = await getJson('/api/account/daily');
  if (!data?.tasks?.length) return;
  section.querySelector('[data-daily-list]').replaceChildren(...data.tasks.map(taskItem));
  const done = data.tasks.filter((t) => t.done).length;
  section.querySelector('[data-daily-streak]').textContent = data.streak ? `🔥 ${data.streak} ${data.streak === 1 ? 'Tag' : 'Tage'} in Folge` : '';
  section.querySelector('[data-daily-note]').textContent = done === data.tasks.length
    ? `Alles geschafft! +${data.points * data.tasks.length + data.day_bonus} Punkte für deinen Spieler-Rang. Morgen gibt es neue Aufgaben.`
    : `Jede Aufgabe bringt ${data.points} Punkte für deinen Spieler-Rang, alle drei zusammen ${data.day_bonus} extra. Neue Aufgaben um Mitternacht.`;
  section.classList.toggle('daily--complete', done === data.tasks.length);
  section.hidden = false;
}

// ---------- Ticker ----------
function since(utc) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(`${utc.replace(' ', 'T')}Z`).getTime()) / 60000));
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'gestern' : `vor ${days} Tagen`;
}

function eventText(event) {
  const list = event.board ? ` · ${boardLabel(event.board)}` : '';
  switch (event.kind) {
    case 'record': return [`🏆 neuer Rekord in ${event.app_name}${list}`, `${points(event.score ?? 0)} Punkte`];
    case 'achievements': return [`🏅 ${event.amount === 1 ? 'einen neuen Erfolg' : `${event.amount} neue Erfolge`} in ${event.app_name}`, ''];
    case 'level': return [`🧩 neues Level „${event.title ?? ''}“ in ${event.app_name}`, ''];
    case 'weekwin': return [`👑 Wochensieg in ${event.app_name}${list}`, `${points(event.score ?? 0)} Punkte`];
    default: return [event.app_name, ''];
  }
}

function tickerItem(event) {
  const item = el('li', `ticker__item ticker__item--${event.kind}`);
  const avatar = el('span', 'ticker__avatar');
  avatar.innerHTML = avatarSvg({ avatar: event.avatar, color: event.avatar_color, name: event.display_name }, 36);
  const [what, extra] = eventText(event);
  const text = el('span', 'ticker__text');
  const name = el('a', 'ticker__name', event.display_name);
  name.href = `/spieler/?name=${encodeURIComponent(event.display_name)}`;
  const line = el('span', null);
  line.append(name, document.createTextNode(` – ${what}`));
  text.append(line, el('small', null, [extra, since(event.at)].filter(Boolean).join(' · ')));
  item.append(avatar, text);
  return item;
}

async function showTicker() {
  const section = document.querySelector('[data-ticker]');
  if (!section) return;
  const data = await getJson('/api/feed');
  if (!data?.events?.length) return;
  section.querySelector('[data-ticker-list]').replaceChildren(...data.events.slice(0, 8).map(tickerItem));
  section.hidden = false;
}

if (document.querySelector('meta[name="bg-accounts"]')) {
  showDaily();
  showTicker();
}
