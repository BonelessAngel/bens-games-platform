// App-Verzeichnis: Prüfung und Darstellung der Bibliothek.
// Wird beim Build (vite.config.js) und in den Tests verwendet.

export const TYPES = ['game', 'tool', 'workspace'];
export const STATUSES = ['public', 'beta', 'private', 'maintenance'];
export const VISIBILITIES = ['all', 'signed_in', 'selected'];

const TYPE_LABELS = { game: 'Spiel', tool: 'Werkzeug', workspace: 'Workspace' };
const STATUS_LABELS = { beta: 'Beta', maintenance: 'Wartung' };
const REQUIRED = ['id', 'name', 'type', 'description', 'icon', 'status', 'visibility', 'version', 'path'];

export function validateApps(apps) {
  const errors = [];
  if (!Array.isArray(apps)) return ['apps.json muss eine Liste sein'];

  const seen = new Set();
  apps.forEach((app, i) => {
    const at = `Eintrag ${i + 1}${app && app.id ? ` (${app.id})` : ''}`;
    if (!app || typeof app !== 'object') {
      errors.push(`${at}: kein Objekt`);
      return;
    }
    for (const key of REQUIRED) {
      if (typeof app[key] !== 'string' || app[key].trim() === '') errors.push(`${at}: Feld "${key}" fehlt`);
    }
    if (typeof app.id === 'string') {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(app.id)) errors.push(`${at}: ID nur aus a-z, 0-9 und Bindestrichen`);
      if (seen.has(app.id)) errors.push(`${at}: ID doppelt vergeben`);
      seen.add(app.id);
    }
    if (app.type && !TYPES.includes(app.type)) errors.push(`${at}: unbekannter Typ "${app.type}"`);
    if (app.status && !STATUSES.includes(app.status)) errors.push(`${at}: unbekannter Status "${app.status}"`);
    if (app.visibility && !VISIBILITIES.includes(app.visibility)) errors.push(`${at}: unbekannte Sichtbarkeit "${app.visibility}"`);
    if (typeof app.path === 'string' && typeof app.id === 'string') {
      const expected = `${app.type === 'game' ? '/games/' : '/apps/'}${app.id}/`;
      if (app.path !== expected) errors.push(`${at}: Pfad muss "${expected}" sein`);
    }
    // Nicht /icons/: Diesen Pfad leitet Apache bei ALL-INKL serverweit auf eigene Standardsymbole um.
    if (typeof app.icon === 'string' && !/^\/app-icons\/[a-z0-9_.-]+$/i.test(app.icon)) errors.push(`${at}: Symbol muss ein Pfad wie /app-icons/name.svg sein`);
  });
  return errors;
}

// Ohne Konten (bis Phase 3) zeigt die Bibliothek nur, was für alle sichtbar ist.
export function visibleApps(apps) {
  return apps.filter((app) => app.visibility === 'all' && app.status !== 'private');
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCard(app, pages) {
  const badge = STATUS_LABELS[app.status]
    ? `<span class="badge badge--${app.status}">${STATUS_LABELS[app.status]}</span>`
    : '';
  const body = `
      <img class="card__icon" src="${escapeHtml(app.icon)}" alt="" width="64" height="64" loading="lazy">
      <div class="card__body">
        <div class="card__meta">${TYPE_LABELS[app.type]}${badge}</div>
        <h3 class="card__title">${escapeHtml(app.name)}</h3>
        <p class="card__text">${escapeHtml(app.description)}</p>
      </div>`;

  // Im Wartungsmodus ist die Karte sichtbar, aber nicht anklickbar.
  if (app.status === 'maintenance') {
    return `<li><div class="card card--disabled" aria-disabled="true">${body}
    </div></li>`;
  }
  // Spiele mit eigener Seite (/spiele/<id>/): Die Karte führt immer zuerst dorthin,
  // der kleine Knopf „Spielen“ startet direkt.
  if (app.type === 'game' && pages.has(app.id)) {
    return `<li class="card-item"><a class="card" href="/spiele/${escapeHtml(app.id)}/">${body}
      <span class="card__cta" aria-hidden="true">Infos &amp; Spielen →</span>
    </a><a class="card__play" href="${escapeHtml(app.path)}" aria-label="${escapeHtml(app.name)} direkt spielen">▶ Spielen</a></li>`;
  }
  return `<li class="card-item"><a class="card" href="${escapeHtml(app.path)}">${body}
      <span class="card__cta" aria-hidden="true">Öffnen →</span>
    </a></li>`;
}

function renderSection(id, title, apps, emptyText, pages) {
  const content = apps.length
    ? `<ul class="grid">${apps.map((app) => renderCard(app, pages)).join('')}</ul>`
    : `<p class="empty">${emptyText}</p>`;
  return `<section class="library__section" aria-labelledby="${id}">
  <h2 id="${id}" class="section-title">${title}</h2>
  ${content}
</section>`;
}

// filter: false für Listen, die der Server schon passend zum Nutzer gefiltert hat (/api/apps).
// pages: IDs der Spiele mit eigener Info-Seite (src/data/spiele.json).
export function renderLibrary(apps, { filter = true, pages = [] } = {}) {
  const shown = filter ? visibleApps(apps) : apps;
  const games = shown.filter((app) => app.type === 'game');
  const others = shown.filter((app) => app.type !== 'game');
  const withPage = new Set(pages);
  return [
    renderSection('spiele', 'Spiele', games, 'Bald gibt es hier Spiele.', withPage),
    renderSection('apps', 'Apps', others, 'Hier erscheinen bald Apps.', withPage),
  ].join('\n');
}
