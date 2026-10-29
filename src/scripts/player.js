// Öffentliches Spielerprofil (/spieler/?name=…): Banner mit Rang und Titel, Kennzahlen, Lieblings-Abzeichen,
// Rekord-Karten, Abzeichen-Vitrine mit Seltenheit, Aktivitäts-Kalender (nur mit Zustimmung) und eigene Level.
import { achievementInfo, loadAchievementNames } from '../../lib/achievements.js';
import { avatarSvg } from '../../lib/avatars.js';
import { boardLabel } from '../../lib/boards.js';
import { rarityOf } from '../../lib/profile.js';
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

function icon(src, size) {
  const image = document.createElement('img');
  Object.assign(image, { src, alt: '', width: size, height: size, loading: 'lazy' });
  return image;
}

const points = (value) => Number(value).toLocaleString('de-DE');
const memberSince = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const show = (selector, visible) => { $(selector).hidden = !visible; };

function renderRank(rank) {
  const box = $('[data-player-rank]');
  const emblem = el('div', `rank-emblem rank-emblem--${rank.level}`);
  emblem.append(el('span', 'rank-emblem__level', String(rank.level)));
  const text = el('div', 'player-rank__text');
  text.append(el('span', 'player-rank__label', 'Spieler-Rang'), el('strong', 'player-rank__name', rank.name));
  const bar = el('div', 'player-rank__bar');
  const fill = el('span');
  fill.style.width = `${Math.round(rank.progress * 100)}%`;
  bar.append(fill);
  text.append(bar, el('span', 'player-rank__next', rank.next
    ? `${points(rank.points)} Punkte · noch ${points(rank.next_points - rank.points)} bis ${rank.next}`
    : `${points(rank.points)} Punkte · höchster Rang`));
  box.replaceChildren(emblem, text);
}

function renderStats(stats) {
  const items = [
    [stats.achievements, 'Erfolge'],
    [stats.first_places, 'Mal Platz 1'],
    [stats.podiums, 'Mal auf dem Treppchen'],
    [stats.levels, 'eigene Level'],
    [stats.nova_stars, 'Sterne in Nova Bastion'],
    [stats.week_wins ?? 0, 'Wochensiege'],
    [stats.task_days ?? 0, 'Tage alle Aufgaben'],
  ].filter(([value], i) => value > 0 || i === 0);
  $('[data-player-stats]').replaceChildren(...items.map(([value, label]) => {
    const tile = el('div', 'player-stat');
    tile.append(el('strong', null, points(value)), el('span', null, label));
    return tile;
  }));
}

function badge(info, rarity, big = false) {
  const tier = rarityOf(rarity);
  const item = el(big ? 'div' : 'li', `achievement achievement--${tier.id}${big ? ' achievement--big' : ''}`);
  item.title = `${info.name} – ${tier.text}`;
  item.append(el('span', 'achievement__icon', info.icon), el('span', 'achievement__name', info.name));
  if (big || tier.id !== 'common') item.append(el('span', 'achievement__rarity', big ? `${tier.label} · ${tier.text}` : tier.label));
  return item;
}

async function renderPins(profile) {
  const pins = await Promise.all(profile.pins.map(async (pin) => {
    const [app, id] = pin.split(':');
    const game = profile.games.find((g) => g.id === app);
    if (!game) return null;
    return badge(achievementInfo(id, await loadAchievementNames(app)), profile.rarity[pin], true);
  }));
  const shown = pins.filter(Boolean);
  $('[data-player-pins]').replaceChildren(...shown);
  show('[data-player-pins-box]', shown.length > 0);
}

function renderRecords(profile) {
  const cards = profile.games.flatMap((game) => game.boards.map((board) => {
    const medal = board.rank && board.rank <= 3 ? ['🥇', '🥈', '🥉'][board.rank - 1] : null;
    const card = el('a', `record-card${medal ? ` record-card--${board.rank}` : ''}`);
    card.href = `/ranglisten/?spiel=${encodeURIComponent(game.id)}&liste=${encodeURIComponent(board.board)}`;
    const head = el('div', 'record-card__head');
    head.append(icon(game.icon, 28), el('span', null, `${game.name} · ${boardLabel(board.board)}`));
    card.append(head, el('strong', 'record-card__score', points(board.score)), el('span', 'record-card__place', medal ? `${medal} Platz ${board.rank}` : board.rank ? `Platz ${board.rank}` : '–'));
    return { card, rank: board.rank ?? 999 };
  }));
  cards.sort((a, b) => a.rank - b.rank);
  $('[data-player-records]').replaceChildren(...cards.slice(0, 12).map((c) => c.card));
  show('[data-player-records-box]', cards.length > 0);
}

// Pokale aus der Ruhmeshalle: jeder Wochensieg ein Pokal
function renderTrophies(profile) {
  const trophies = profile.trophies ?? [];
  $('[data-player-trophies]').replaceChildren(...trophies.slice(0, 24).map((t) => {
    const cup = el('a', 'trophy');
    cup.href = '/ruhmeshalle/';
    cup.title = `Wochensieg ${t.week.replace('-W', ' · KW ')} – ${t.app_name} · ${boardLabel(t.board)} mit ${points(t.score)} Punkten`;
    cup.append(el('span', 'trophy__cup', '🏆'), el('span', 'trophy__week', `KW ${t.week.split('-W')[1]}`), el('span', 'trophy__game', `${t.app_name} · ${boardLabel(t.board)}`));
    return cup;
  }));
  show('[data-player-trophies-box]', trophies.length > 0);
}

async function renderBadges(profile) {
  const sections = await Promise.all(profile.games.filter((g) => g.achievements.length).map(async (game) => {
    const names = await loadAchievementNames(game.id);
    const box = el('div', 'badge-shelf');
    const head = el('h3', 'badge-shelf__title');
    head.append(icon(game.icon, 26), el('span', null, `${game.name} · ${game.achievements.length} ${game.achievements.length === 1 ? 'Erfolg' : 'Erfolge'}`));
    const list = el('ul', 'badges');
    const sorted = [...game.achievements].sort((a, b) => (profile.rarity[`${game.id}:${a}`] ?? 1) - (profile.rarity[`${game.id}:${b}`] ?? 1));
    list.append(...sorted.map((id) => badge(achievementInfo(id, names), profile.rarity[`${game.id}:${id}`])));
    box.append(head, list);
    return box;
  }));
  $('[data-player-badges]').replaceChildren(...sections);
  show('[data-player-badges-box]', sections.length > 0);
}

function renderActivity(activity) {
  if (!activity) return show('[data-player-activity-box]', false);
  const box = $('[data-player-activity]');
  const grid = el('div', 'activity__grid');
  const start = new Date(`${activity.from}T00:00:00Z`);
  // Montag als erste Zeile: leere Felder bis zum Wochentag des ersten Tages.
  const offset = (start.getUTCDay() + 6) % 7;
  for (let i = 0; i < offset; i++) grid.append(el('span', 'activity__day activity__day--empty'));
  const end = new Date(`${activity.to}T00:00:00Z`);
  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const key = day.toISOString().slice(0, 10);
    const minutes = activity.minutes[key] ?? 0;
    const level = minutes === 0 ? 0 : minutes < 15 ? 1 : minutes < 45 ? 2 : minutes < 90 ? 3 : 4;
    const cell = el('span', `activity__day activity__day--${level}`);
    cell.title = `${day.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}: ${minutes ? `${minutes} Min.` : 'nicht gespielt'}`;
    grid.append(cell);
  }
  const facts = el('div', 'activity__facts');
  const hours = Math.round(activity.total_minutes / 60);
  facts.append(el('span', null, `${activity.active_days} Spieltage in 3 Monaten`), el('span', null, hours >= 1 ? `${points(hours)} Std. gespielt` : `${activity.total_minutes} Min. gespielt`));
  if (activity.favorite) {
    const fav = el('span', 'activity__favorite');
    fav.append('Lieblingsspiel: ', icon(activity.favorite.icon, 20), ` ${activity.favorite.name}`);
    facts.append(fav);
  }
  const legend = el('div', 'activity__legend');
  legend.append('weniger', ...[0, 1, 2, 3, 4].map((l) => el('span', `activity__day activity__day--${l}`)), 'mehr');
  box.replaceChildren(facts, grid, legend);
  show('[data-player-activity-box]', true);
}

function renderLevels(levels) {
  $('[data-player-levels]').replaceChildren(...levels.map((level) => {
    const card = el('div', 'level-card');
    card.append(el('span', 'level-card__game', level.app), el('strong', 'level-card__name', level.name),
      el('span', 'level-card__stats', `▶ ${points(level.plays)} gespielt · ✓ ${points(level.wins)} geschafft · ♥ ${points(level.likes)}`));
    const play = el('a', 'level-card__play', 'Im Creator spielen →');
    play.href = `/games/${encodeURIComponent(level.app_id)}/`;
    card.append(play);
    return card;
  }));
  show('[data-player-levels-box]', levels.length > 0);
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
  $('[data-player-hero]').className = `player-hero banner--${profile.banner ?? 'nacht'}`;
  $('[data-player-avatar]').innerHTML = avatarSvg({ avatar: profile.avatar, color: profile.avatar_color, name: profile.display_name }, 96);
  $('[data-player-name]').textContent = profile.display_name;
  $('[data-player-title]').textContent = profile.title?.name ?? '';
  show('[data-player-title]', !!profile.title);
  $('[data-player-since]').textContent = `Dabei seit ${memberSince(profile.member_since)}`;
  // Eigenes Profil (wie bei Steam): Knopf zum Bearbeiten, Hinweis, falls es andere gerade nicht sehen.
  show('[data-player-ownbar]', profile.me);
  show('[data-player-private]', profile.me && profile.listed === false);
  $('[data-player-share]').replaceChildren(shareButton(() => ({
    title: `${profile.display_name} bei Bens Games`,
    text: profile.me ? 'Schau dir mein Profil bei Bens Games an:' : `Schau dir das Profil von ${profile.display_name} an:`,
    url: `${window.location.origin}/spieler/?name=${encodeURIComponent(profile.display_name)}`,
  })));

  if (profile.rank) renderRank(profile.rank);
  if (profile.stats) renderStats(profile.stats);
  profile.pins ??= [];
  profile.rarity ??= {};
  await Promise.all([renderPins(profile), renderBadges(profile)]);
  renderRecords(profile);
  renderTrophies(profile);
  renderActivity(profile.activity ?? null);
  renderLevels(profile.levels ?? []);
  show('[data-player-empty]', !profile.games.length && !(profile.levels ?? []).length);
  $('[data-player-details]').hidden = false;
}

load();
