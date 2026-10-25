// Spiel-Seiten (/spiele/<id>/) und „Was ist neu?“. Inhalte: src/data/spiele.json und src/data/neuigkeiten.json.
import { escapeHtml } from './library.js';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function formatDay(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day}. ${MONTHS[month - 1]} ${year}`;
}

/** Prüft die Inhalte; liefert eine Liste von Fehlern (leer = alles gut). */
export function validateGameContent(apps, info, news) {
  const errors = [];
  const games = apps.filter((app) => app.type === 'game');
  for (const game of games) {
    const entry = info[game.id];
    if (!entry) {
      errors.push(`spiele.json: Eintrag für „${game.id}“ fehlt`);
      continue;
    }
    if (!entry.tagline || !Array.isArray(entry.intro) || !entry.intro.length) errors.push(`${game.id}: tagline und intro nötig`);
    if (!Array.isArray(entry.features) || entry.features.length < 3) errors.push(`${game.id}: mindestens 3 Merkmale`);
    if (!Array.isArray(entry.images) || !entry.images.length) errors.push(`${game.id}: mindestens ein Bild`);
    for (const image of entry.images ?? []) {
      if (!/^\/bilder\/spiele\/[a-z0-9-]+\.(jpg|png|webp)$/.test(image.src ?? '')) errors.push(`${game.id}: Bildpfad „${image.src}“ ungültig`);
      if (!image.alt) errors.push(`${game.id}: Bild ohne Beschreibung (alt)`);
    }
  }
  for (const id of Object.keys(info)) {
    if (!games.some((game) => game.id === id)) errors.push(`spiele.json: „${id}“ ist kein Spiel in apps.json`);
  }
  news.forEach((item, i) => {
    if (!games.some((game) => game.id === item.app)) errors.push(`neuigkeiten.json Eintrag ${i + 1}: unbekanntes Spiel „${item.app}“`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date ?? '')) errors.push(`neuigkeiten.json Eintrag ${i + 1}: Datum als JJJJ-MM-TT`);
    if (!item.title || !Array.isArray(item.points) || !item.points.length) errors.push(`neuigkeiten.json Eintrag ${i + 1}: Titel und Punkte nötig`);
    if (i > 0 && item.date > news[i - 1].date) errors.push('neuigkeiten.json: neueste Einträge zuerst');
  });
  return errors;
}

function newsItem(item, app, { withGame }) {
  const head = withGame
    ? `<a class="news__game" href="/spiele/${escapeHtml(app.id)}/"><img src="${escapeHtml(app.icon)}" alt="" width="40" height="40" loading="lazy"><span>${escapeHtml(app.name)} ${escapeHtml(item.version)}</span></a>`
    : `<span class="news__game"><span>Version ${escapeHtml(item.version)}</span></span>`;
  return `<li class="news__item">
      <div class="news__head">${head}<time datetime="${escapeHtml(item.date)}">${formatDay(item.date)}</time></div>
      <h3 class="news__title">${escapeHtml(item.title)}</h3>
      <ul class="news__points">${item.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
    </li>`;
}

/** „Was ist neu?“ – auf der Startseite die neuesten Einträge aller Spiele, auf einer Spiel-Seite nur die eigenen. */
export function renderNews(news, apps, { appId = null, limit = 4 } = {}) {
  const byId = Object.fromEntries(apps.map((app) => [app.id, app]));
  const items = news.filter((item) => byId[item.app] && (!appId || item.app === appId)).slice(0, limit);
  if (!items.length) return '';
  return `<ul class="news">${items.map((item) => newsItem(item, byId[item.app], { withGame: !appId })).join('')}</ul>`;
}

/** Inhalt einer Spiel-Seite (ohne Kopf und Fuß, die stehen in der HTML-Datei). */
export function renderGamePage(app, info, news, apps) {
  const wide = info.images.filter((image) => image.width >= image.height);
  const tall = info.images.filter((image) => image.width < image.height);
  const img = (image, i) => `<a class="gallery__item${image.width < image.height ? ' gallery__item--tall' : ''}" href="${escapeHtml(image.src)}" target="_blank" rel="noopener">
        <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" width="${image.width}" height="${image.height}"${i ? ' loading="lazy"' : ''}>
      </a>`;
  const list = (items) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  const updates = renderNews(news, apps, { appId: app.id, limit: 3 });
  return `<section class="game-hero">
    <div class="game-hero__text">
      <img class="game-hero__icon" src="${escapeHtml(app.icon)}" alt="" width="88" height="88">
      <p class="hero__eyebrow">${escapeHtml(info.tagline)}</p>
      <h1 class="game-hero__title">${escapeHtml(app.name)}</h1>
      ${info.intro.map((text) => `<p class="game-hero__intro">${escapeHtml(text)}</p>`).join('\n      ')}
      <div class="button-row">
        <a class="button" href="${escapeHtml(app.path)}">Jetzt spielen</a>
        <a class="button button--secondary" href="/ranglisten/?spiel=${escapeHtml(app.id)}">Ranglisten</a>
      </div>
      <p class="game-hero__meta">Kostenlos · im Browser · am Handy und am PC · Version ${escapeHtml(app.version)}</p>
    </div>
    <div class="gallery">
      ${[...wide, ...tall].map(img).join('\n      ')}
    </div>
  </section>

  <section class="game-section game-columns">
    <div>
      <h2 class="section-title">Das erwartet dich</h2>
      <div class="game-list">${list(info.features)}</div>
    </div>
    <div>
      <h2 class="section-title">So spielst du</h2>
      <h3 class="game-sub">Am PC</h3>
      <div class="game-list">${list(info.controls.pc)}</div>
      <h3 class="game-sub">Am Handy</h3>
      <div class="game-list">${list(info.controls.handy)}</div>
    </div>
  </section>

  <section class="game-section" data-game-top data-game="${escapeHtml(app.id)}" data-board="${escapeHtml(info.leaderboard.board)}" hidden>
    <h2 class="section-title">${escapeHtml(info.leaderboard.title)}</h2>
    <ol class="ranks__list" data-game-top-list></ol>
    <p><a href="/ranglisten/?spiel=${escapeHtml(app.id)}">Alle Ranglisten ansehen →</a></p>
  </section>

  ${updates ? `<section class="game-section">
    <h2 class="section-title">Was ist neu?</h2>
    ${updates}
  </section>` : ''}

  <section class="game-section game-cta">
    <h2>Bereit?</h2>
    <p>Kein Download, keine Anmeldung nötig. Mit Konto wird dein Spielstand gesichert und du erscheinst in den Ranglisten.</p>
    <a class="button" href="${escapeHtml(app.path)}">${escapeHtml(app.name)} spielen</a>
  </section>`;
}
