// Zentrale (admin.bens-games.de): Anmeldung mit Zwei-Faktor, Übersicht, Konten, Rechte, Protokoll.
// Alle Prüfungen passieren auf dem Server – hier wird nur angezeigt, was die API erlaubt.
import { boardLabel } from '../lib/boards.js';

const MESSAGES = {
  invalid_credentials: 'E-Mail oder Passwort ist falsch.',
  no_panel_access: 'Dieses Konto hat keinen Zugang zur Zentrale.',
  two_factor_setup_required: 'Schalte zuerst auf bens-games.de unter „Mein Konto“ die Zwei-Faktor-Anmeldung ein.',
  wrong_code: 'Der Code ist nicht richtig.',
  invalid_challenge: 'Die Anmeldung hat zu lange gedauert. Bitte noch einmal.',
  too_many_attempts: 'Zu viele Versuche. Bitte warte ein paar Minuten.',
  account_locked: 'Dieses Konto ist gesperrt.',
  missing_permission: 'Dafür fehlt dir ein Recht.',
  not_on_self: 'Das geht nicht für dein eigenes Konto.',
  owner_protected: 'Das Konto des Besitzers kann hier nicht geändert werden.',
  unavailable: 'Die Zentrale ist gerade nicht verfügbar.',
  confirmation_required: 'Bitte bestätige das Wiederherstellen.',
  not_found: 'Nicht gefunden – vielleicht schon gelöscht.',
};
const FALLBACK = 'Etwas ist schiefgelaufen.';

const ACTIONS = {
  'user.registered': 'Registriert',
  'user.email_verified': 'E-Mail bestätigt',
  'user.login': 'Angemeldet',
  'user.login_failed': 'Anmeldung fehlgeschlagen',
  'user.login_blocked': 'Anmeldung gebremst',
  'user.logout': 'Abgemeldet',
  'user.password_reset_requested': 'Passwort-Link angefordert',
  'user.password_reset': 'Passwort zurückgesetzt',
  'user.password_changed': 'Passwort geändert',
  'user.session_revoked': 'Gerät abgemeldet',
  'user.sessions_revoked': 'Andere Geräte abgemeldet',
  'user.deleted': 'Konto gelöscht',
  'user.2fa_setup_started': '2FA-Einrichtung begonnen',
  'user.2fa_enabled': '2FA eingeschaltet',
  'user.2fa_disabled': '2FA ausgeschaltet',
  'user.2fa_failed': '2FA-Code falsch',
  'user.2fa_recovery_regenerated': 'Neue Wiederherstellungscodes',
  'game.save_deleted': 'Spielstand gelöscht',
  'admin.login_denied': 'Zentrale: Zugang verweigert',
  'admin.user_locked': 'Zentrale: Konto gesperrt',
  'admin.user_unlocked': 'Zentrale: Konto entsperrt',
  'admin.sessions_revoked': 'Zentrale: Sitzungen beendet',
  'admin.rights_changed': 'Zentrale: Rechte geändert',
  'admin.score_hidden': 'Zentrale: Ranglisten-Eintrag ausgeblendet',
  'admin.score_shown': 'Zentrale: Ranglisten-Eintrag eingeblendet',
  'admin.app_updated': 'Zentrale: App geändert',
  'admin.app_access_granted': 'Zentrale: App freigeschaltet',
  'admin.app_access_revoked': 'Zentrale: App-Freigabe entfernt',
  'admin.level_hidden': 'Zentrale: Community-Level ausgeblendet',
  'admin.level_shown': 'Zentrale: Community-Level eingeblendet',
  'admin.level_deleted': 'Zentrale: Community-Level gelöscht',
  'admin.content_published': 'Zentrale: Kampagne veröffentlicht',
  'user.level_uploaded': 'Community-Level hochgeladen',
  'user.level_deleted': 'Eigenes Community-Level gelöscht',
  'admin.announcement_saved': 'Zentrale: Ankündigung gespeichert',
  'admin.announcement_deleted': 'Zentrale: Ankündigung gelöscht',
  'user.leaderboard_opt_out':'Aus Ranglisten herausgenommen',
  'user.leaderboard_opt_in': 'In Ranglisten aufgenommen',
  'user.stats_opt_out': 'Statistik-Zuordnung abgeschaltet',
  'user.stats_opt_in': 'Statistik-Zuordnung eingeschaltet',
  'admin.save_restored': 'Zentrale: Spielstand wiederhergestellt',
  'admin.error_resolved': 'Zentrale: Fehler erledigt',
  'admin.error_reopened': 'Zentrale: Fehler wieder geöffnet',
};

const $ = (selector) => document.querySelector(selector);
let csrf = '';
let me = null;

async function api(path, { method = 'GET', body, query } = {}) {
  const url = new URL(`/api/${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) if (value !== '' && value != null) url.searchParams.set(key, value);
  const headers = { Accept: 'application/json' };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  try {
    const response = await fetch(url, { method, headers, credentials: 'same-origin', body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== 'auth/login' && path !== 'admin/me') showLogin('Deine Sitzung ist abgelaufen. Bitte melde dich neu an.');
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

function notify(text, kind = 'error') {
  const notice = $('[data-notice]');
  notice.textContent = text;
  notice.className = `notice notice--${kind}`;
  notice.hidden = !text;
}

const can = (permission) => {
  if (permission === 'panel') return !!me; // für alle, die die Zentrale betreten dürfen
  if (me?.permissions.includes('*')) return true;
  if (permission === 'app.*.manage') return me?.permissions.some((p) => /^app\..+\.manage$/.test(p)) ?? false;
  return me?.permissions.includes(permission) ?? false;
};

function formatDate(utc) {
  if (!utc) return '–';
  return new Date(`${utc.replace(' ', 'T')}Z`).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function button(label, onClick, kind = 'secondary') {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className: `button button--${kind} button--small` });
  b.addEventListener('click', async () => {
    b.disabled = true;
    await onClick();
    b.disabled = false;
  });
  return b;
}

// --- Export als Tabelle ----------------------------------------------------
// Semikolon und BOM, damit Excel die Datei auf deutschen Rechnern direkt richtig öffnet.
const csvData = {};

function downloadCsv(name, header, rows) {
  const escape = (value) => {
    const text = value == null ? '' : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const text = [header, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' })),
    download: `${name}-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

for (const element of document.querySelectorAll('[data-csv]')) {
  element.addEventListener('click', () => {
    const data = csvData[element.dataset.csv];
    if (!data || !data.rows.length) return notify('Keine Daten zum Exportieren.');
    downloadCsv(data.name, data.header, data.rows);
  });
}

function pager(name, page, hasMore, load) {
  const element = $(`[data-pager="${name}"]`);
  element.replaceChildren();
  if (page > 1) element.append(button('← Zurück', () => load(page - 1)));
  element.append(Object.assign(document.createElement('span'), { textContent: `Seite ${page}` }));
  if (hasMore) element.append(button('Weiter →', () => load(page + 1)));
}

// --- Anmeldung -------------------------------------------------------------

let challenge = '';

function showLogin(message = '') {
  me = null;
  csrf = '';
  for (const view of document.querySelectorAll('[data-view]')) view.hidden = view.dataset.view !== 'login';
  $('[data-nav]').hidden = true;
  $('[data-form="login"]').hidden = false;
  $('[data-form="code"]').hidden = true;
  notify(message, 'error');
}

$('[data-form="login"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const { ok, data } = await api('auth/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } });
  if (ok && data.status === 'two_factor_required') {
    challenge = data.challenge;
    form.hidden = true;
    $('[data-form="code"]').hidden = false;
    $('#code').focus();
    notify('');
    return;
  }
  notify(MESSAGES[data.error] ?? FALLBACK);
});

$('[data-form="code"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const { ok, data } = await api('auth/login/two-factor', { method: 'POST', body: { challenge, code: form.code.value } });
  form.reset();
  if (ok) {
    $('[data-form="login"]').reset();
    start();
    return;
  }
  if (data.error === 'invalid_challenge' || data.error === 'too_many_attempts') showLogin();
  notify(MESSAGES[data.error] ?? FALLBACK);
});

$('[data-logout]').addEventListener('click', async () => {
  await api('auth/logout', { method: 'POST' });
  showLogin('Du bist abgemeldet.');
});

// --- Bereiche --------------------------------------------------------------

function showTab(name) {
  const allowed = [...document.querySelectorAll('[data-tab]')].filter((link) => !link.hidden).map((link) => link.dataset.tab);
  const tab = allowed.includes(name) ? name : allowed[0];
  for (const view of document.querySelectorAll('[data-view]')) view.hidden = view.dataset.view !== tab;
  for (const tabLink of document.querySelectorAll('[data-tab]')) {
    if (tabLink.dataset.tab === tab) tabLink.setAttribute('aria-current', 'page');
    else tabLink.removeAttribute('aria-current');
  }
  notify('');
  ({
    uebersicht: loadOverview,
    spiele: loadGames,
    konten: () => loadUsers(1),
    moderation: loadModeration,
    apps: loadApps,
    ankuendigungen: loadAnnouncements,
    protokoll: () => loadAudit(1),
    fehler: loadErrors,
    technik: loadSystem,
    anmeldungen: loadMySessions,
  })[tab]?.();
}

window.addEventListener('hashchange', () => me && showTab(window.location.hash.slice(1)));

async function start() {
  const { ok, data } = await api('admin/me');
  if (!ok) {
    showLogin(data.error && data.error !== 'not_logged_in' ? MESSAGES[data.error] ?? FALLBACK : '');
    return;
  }
  me = data;
  csrf = data.csrf;
  for (const tab of document.querySelectorAll('[data-tab]')) tab.hidden = !can(tab.dataset.needs);
  $('[data-nav]').hidden = false;
  $('[data-view="login"]').hidden = true;
  showTab(window.location.hash.slice(1));
}

// --- Übersicht -------------------------------------------------------------

async function loadOverview() {
  const { ok, data } = await api('admin/overview');
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  const t = data.trends;
  $('[data-trends]').replaceChildren(...[
    [t.players, 'Spieler', number],
    [t.visits, 'Besuche', number],
    [t.seconds, 'Spielzeit', (s) => (s >= 3600 ? `${number(Math.round(s / 3600))} Std.` : formatDuration(s))],
    [t.wins, 'geschaffte Level', number],
    [t.new_users, 'neue Konten', number],
  ].map(([pair, label, format]) => trendTile(format(pair.now), label, pair.now, pair.before)));
  const tiles = [
    [data.users.total, 'Konten insgesamt'],
    [data.users.new_today, 'neu heute'],
    [data.users.new_7_days, 'neu in 7 Tagen'],
    [data.active_users_24h, 'aktiv in 24 Stunden'],
    [data.open_sessions, 'offene Anmeldungen'],
    [data.users.two_factor, 'mit Zwei-Faktor'],
    [data.users.locked, 'gesperrt'],
    [data.failed_logins_24h, 'Fehlanmeldungen 24 h'],
    [data.errors_24h, 'Spielfehler 24 h'],
  ];
  $('[data-stats]').replaceChildren(...tiles.map(([value, label]) => {
    const tile = Object.assign(document.createElement('div'), { className: 'stat' });
    tile.append(Object.assign(document.createElement('strong'), { textContent: String(value) }), Object.assign(document.createElement('span'), { textContent: label }));
    return tile;
  }));
  $('[data-saves]').replaceChildren(...data.saves_by_game.map((game) => {
    const row = document.createElement('tr');
    row.append(cell(game.name), cell(String(game.saves)));
    return row;
  }));
}

/** Kachel mit Wert und Vergleich zur Vorwoche (▲ grün, ▼ rot, – gleich). */
function trendTile(value, label, now, before) {
  const tile = Object.assign(document.createElement('div'), { className: 'stat' });
  const trend = Object.assign(document.createElement('em'), { className: 'trend' });
  if (before === 0 && now === 0) trend.textContent = '–';
  else if (before === 0) Object.assign(trend, { textContent: '▲ neu', className: 'trend trend--up' });
  else {
    const change = Math.round(((now - before) / before) * 100);
    trend.textContent = change === 0 ? '± 0 %' : `${change > 0 ? '▲' : '▼'} ${Math.abs(change)} %`;
    if (change !== 0) trend.className = `trend trend--${change > 0 ? 'up' : 'down'}`;
  }
  trend.title = `Vorwoche: ${before.toLocaleString('de-DE')}`;
  tile.append(Object.assign(document.createElement('strong'), { textContent: value }), Object.assign(document.createElement('span'), { textContent: label }), trend);
  return tile;
}

// --- Spiele ----------------------------------------------------------------

function formatDuration(seconds) {
  if (seconds == null) return '–';
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} Min.` : `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}

const percent = (value) => (value == null ? '–' : `${Math.round(value * 100)} %`);
const number = (value) => (value == null ? '–' : Number(value).toLocaleString('de-DE'));

$('[data-game-select]').addEventListener('change', () => loadGames());
$('[data-game-days]').addEventListener('change', () => loadGames());

async function loadGames() {
  const select = $('[data-game-select]');
  const { ok, data } = await api('admin/games', { query: { app: select.value, days: $('[data-game-days]').value } });
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);

  if (select.options.length !== data.apps.length) {
    select.replaceChildren(...data.apps.map((app) => new Option(app.name, app.id)));
  }
  select.value = data.app;

  const t = data.totals;
  const tiles = [
    [formatDuration(t.seconds), 'Spielzeit gesamt'],
    [number(t.visits), 'Besuche'],
    [formatDuration(t.avg_seconds_per_visit), 'Ø Spielzeit pro Besuch'],
    [number(t.players), 'Spieler mit Konto'],
    [number(t.level_starts), 'Level gestartet'],
    [number(t.wins), 'Level gewonnen'],
  ];
  $('[data-game-tiles]').replaceChildren(...tiles.map(([value, label]) => {
    const tile = Object.assign(document.createElement('div'), { className: 'stat' });
    tile.append(Object.assign(document.createElement('strong'), { textContent: value }), Object.assign(document.createElement('span'), { textContent: label }));
    return tile;
  }));

  // Balken pro Tag: Höhe = Spielzeit, Beschriftung beim Darüberfahren.
  const max = Math.max(1, ...data.daily.map((d) => d.seconds));
  const chart = $('[data-game-chart]');
  chart.replaceChildren(...data.daily.map((day) => {
    const bar = Object.assign(document.createElement('div'), { className: 'chart__bar' });
    bar.style.height = `${Math.max(2, Math.round((day.seconds / max) * 100))}%`;
    bar.title = `${new Date(day.day).toLocaleDateString('de-DE')}: ${day.visits} Besuche, ${formatDuration(day.seconds)}`;
    return bar;
  }));
  if (!data.daily.length) chart.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Noch keine Daten in diesem Zeitraum.' }));

  const hardest = new Set(data.hardest.slice(0, 1));
  const abandoned = new Set(data.most_abandoned.slice(0, 1));
  const hints = [];
  if (data.hardest.length) hints.push(`Schwerstes Level: ${data.hardest[0]}`);
  if (data.most_abandoned.length) hints.push(`am häufigsten aufgegeben: ${data.most_abandoned[0]}`);
  $('[data-game-hints]').textContent = hints.length
    ? `${hints.join(' · ')} (berücksichtigt ab ${data.min_tries_for_ranking} Versuchen)`
    : `Hinweise auf schwere Level erscheinen ab ${data.min_tries_for_ranking} Versuchen pro Level.`;

  $('[data-game-levels]').replaceChildren(...data.levels.map((level) => {
    const row = document.createElement('tr');
    if (hardest.has(level.level)) row.className = 'row--hard';
    if (abandoned.has(level.level)) row.className = 'row--abandoned';
    row.append(
      cell(level.level), cell(number(level.tries)), cell(number(level.wins)), cell(number(level.losses)), cell(number(level.aborts)),
      cell(percent(level.win_rate)), cell(formatDuration(level.avg_seconds)), cell(number(level.avg_score)), cell(number(level.max_score)),
      cell(level.avg_stars == null ? '–' : String(level.avg_stars).replace('.', ',')),
    );
    return row;
  }));

  $('[data-game-details]').replaceChildren(...data.details.map((detail) => {
    const row = document.createElement('tr');
    row.append(cell(detail.key), cell(number(detail.total)));
    return row;
  }));

  csvData.levels = {
    name: `level-${data.app}`,
    header: ['Level', 'Versuche', 'Gewonnen', 'Verloren', 'Aufgegeben', 'Gewinnquote', 'Ø Sekunden', 'Ø Punkte', 'Bestwert', 'Ø Sterne'],
    rows: data.levels.map((l) => [l.level, l.tries, l.wins, l.losses, l.aborts, l.win_rate, l.avg_seconds, l.avg_score, l.max_score, l.avg_stars]),
  };
  loadFunnel(data.app, data.days);
}

/** Spieler-Trichter: wie viele erreichen Level 1, 2, 3 … – der größte Einbruch ist markiert. */
async function loadFunnel(app, days) {
  const { ok, data } = await api('admin/funnel', { query: { app, days } });
  const box = $('[data-funnel]');
  if (!ok) return box.replaceChildren();
  const steps = data.steps;
  csvData.funnel = {
    name: `trichter-${data.app}`,
    header: ['Level', 'Spieler', 'Geschafft', 'Gewinnquote', 'Anteil vom ersten Level', 'Abbruch seit vorigem Level'],
    rows: steps.map((s) => [s.level, s.players, s.winners, s.win_rate, s.of_first, s.drop]),
  };
  if (!steps.length) {
    $('[data-funnel-hint]').textContent = 'Keine nummerierten Level in diesem Zeitraum (der Trichter passt zu Spielen mit Kampagne, z. B. Nova Bastion).';
    return box.replaceChildren();
  }
  const worst = steps.slice(1).reduce((a, s) => (s.drop != null && s.drop > (a?.drop ?? -1) ? s : a), null);
  $('[data-funnel-hint]').textContent = `Wie viele Spieler erreichen welches Level? Spieler mit Konto zählen einmal, Gäste einmal pro Besuch.${
    worst && worst.drop > 0 ? ` Größter Einbruch vor Level ${worst.level}: ${percent(worst.drop)} der Spieler kommen dort nicht mehr an.` : ''}`;
  const first = steps[0].players || 1;
  box.replaceChildren(...steps.map((step) => {
    const row = Object.assign(document.createElement('div'), { className: `funnel__row${step === worst ? ' funnel__row--worst' : ''}` });
    const bar = Object.assign(document.createElement('div'), { className: 'funnel__bar' });
    bar.style.width = `${Math.max(2, Math.round((step.players / first) * 100))}%`;
    const won = Object.assign(document.createElement('div'), { className: 'funnel__won' });
    won.style.width = `${step.players ? Math.round((step.winners / step.players) * 100) : 0}%`;
    bar.append(won);
    row.append(
      Object.assign(document.createElement('span'), { className: 'funnel__label', textContent: `Level ${step.level}` }),
      Object.assign(document.createElement('div'), { className: 'funnel__track' }),
      Object.assign(document.createElement('span'), { className: 'funnel__value', textContent: `${number(step.players)} · ${percent(step.win_rate)} geschafft` }),
    );
    row.children[1].append(bar);
    row.title = `Level ${step.level}: ${step.players} Spieler, ${step.winners} geschafft${step.drop != null ? `, ${percent(step.drop)} weniger als im Level davor` : ''}`;
    return row;
  }));
}

// --- Konten ----------------------------------------------------------------

let userQuery = '';

$('[data-form="search"]').addEventListener('submit', (event) => {
  event.preventDefault();
  userQuery = event.currentTarget.q.value.trim();
  loadUsers(1);
});

async function loadUsers(page) {
  const { ok, data } = await api('admin/users', { query: { q: userQuery, page } });
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  const showEmail = can('users.view_email');
  const showPlaytime = can('stats.view');
  $('[data-email-col]').hidden = !showEmail;
  $('[data-playtime-col]').hidden = !showPlaytime;
  $('[data-form="search"] input').placeholder = showEmail ? 'Name oder E-Mail suchen …' : 'Name suchen …';

  $('[data-users]').replaceChildren(...data.users.map((user) => {
    const row = document.createElement('tr');
    const status = cell(user.status === 'locked' ? 'gesperrt' : user.email_verified ? 'aktiv' : 'unbestätigt');
    if (user.status === 'locked') status.className = 'status--locked';
    row.append(cell(user.display_name));
    if (showEmail) row.append(cell(user.email ?? ''));
    row.append(status, cell(formatDate(user.created_at)), cell(formatDate(user.last_login_at)), cell(user.two_factor ? 'an' : '–'));
    if (showPlaytime) row.append(cell(formatDuration(user.playtime_seconds)));
    row.append(cell(user.roles.join(', ') || '–'));

    const actions = Object.assign(document.createElement('td'), { className: 'actions' });
    const isSelf = user.id === me.user.id;
    if (can('users.manage') && !isSelf && !user.roles.includes('owner')) {
      const locked = user.status === 'locked';
      actions.append(button(locked ? 'Entsperren' : 'Sperren', async () => {
        if (!locked && !window.confirm(`${user.display_name} sperren? Das Konto wird sofort überall abgemeldet.`)) return;
        const result = await api('admin/users/lock', { method: 'POST', body: { id: user.id, locked: !locked } });
        if (!result.ok) return notify(MESSAGES[result.data.error] ?? FALLBACK);
        loadUsers(page);
      }, locked ? 'secondary' : 'danger'));
      actions.append(button('Abmelden', async () => {
        const result = await api('admin/users/revoke-sessions', { method: 'POST', body: { id: user.id } });
        notify(result.ok ? `${user.display_name}: ${result.data.count} Sitzung(en) beendet.` : MESSAGES[result.data.error] ?? FALLBACK, result.ok ? 'success' : 'error');
      }));
    }
    if (can('roles.manage') && !isSelf && !user.roles.includes('owner')) {
      actions.append(button('Rechte', () => openRights(user)));
    }
    if (can('stats.view') && can('users.view')) {
      actions.append(button('Statistik', () => openUserStats(user)));
    }
    if (can('users.manage') && !isSelf && !user.roles.includes('owner')) {
      actions.append(button('Spielstände', () => openSaves(user)));
    }
    row.append(actions);
    return row;
  }));
  pager('users', data.page, data.page * data.page_size < data.total, loadUsers);
  csvData.users = {
    name: 'konten',
    header: ['Name', 'Status', 'Registriert', 'Zuletzt angemeldet', 'Zwei-Faktor', 'Spielzeit (Sekunden, 90 Tage)', 'Rollen'],
    rows: data.users.map((u) => [u.display_name, u.status === 'locked' ? 'gesperrt' : u.email_verified ? 'aktiv' : 'unbestätigt', u.created_at, u.last_login_at, u.two_factor ? 'an' : 'aus', u.playtime_seconds ?? '', u.roles.join(', ')]),
  };
}

// --- Spielstand-Hilfe ------------------------------------------------------

async function openSaves(user) {
  const { ok, data } = await api('admin/saves', { query: { id: user.id } });
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  $('[data-saves-name]').textContent = user.display_name;
  const list = $('[data-saves-list]');
  if (!data.games.length) {
    list.replaceChildren(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Keine Spielstände im Konto gesichert.' }));
  } else {
    list.replaceChildren(...data.games.map((game) => {
      const box = document.createElement('div');
      box.append(
        Object.assign(document.createElement('h3'), { textContent: game.name }),
        Object.assign(document.createElement('p'), {
          className: 'hint',
          textContent: `Aktuell: ${formatDate(game.current.updated_at)} · ${number(Math.round(game.current.size / 1024))} KB${game.current.summary ? ` · ${game.current.summary}` : ''}`,
        }),
      );
      const items = Object.assign(document.createElement('ul'), { className: 'sessions' });
      items.append(...game.history.map((entry) => {
        const item = Object.assign(document.createElement('li'), { className: 'sessions__item' });
        const text = document.createElement('div');
        text.append(
          Object.assign(document.createElement('strong'), { textContent: `${formatDate(entry.saved_at)}${entry.reason === 'before_restore' ? ' (vor einer Wiederherstellung)' : ''}` }),
          Object.assign(document.createElement('span'), { textContent: entry.summary ?? `${number(Math.round(entry.size / 1024))} KB` }),
        );
        item.append(text, button('Wiederherstellen', async () => {
          const typed = window.prompt(`Spielstand vom ${formatDate(entry.saved_at)} für ${user.display_name} in ${game.name} wiederherstellen?\n\nDer aktuelle Stand bleibt im Verlauf erhalten. Zum Bestätigen WIEDERHERSTELLEN eintippen:`, '');
          if (typed === null) return;
          if (typed.trim().toUpperCase() !== 'WIEDERHERSTELLEN') return notify('Nicht bestätigt – nichts geändert.');
          const result = await api('admin/saves/restore', { method: 'POST', body: { id: user.id, history_id: entry.id, confirm: 'WIEDERHERSTELLEN' } });
          if (!result.ok) return notify(MESSAGES[result.data.error] ?? FALLBACK);
          notify(`${game.name}: Spielstand von ${user.display_name} wiederhergestellt. Er gilt beim nächsten Start auf allen Geräten.`, 'success');
          openSaves(user);
        }, 'danger'));
        return item;
      }));
      if (!game.history.length) items.append(Object.assign(document.createElement('li'), { className: 'hint', textContent: 'Noch kein älterer Stand im Verlauf.' }));
      box.append(items);
      return box;
    }));
  }
  $('[data-saves-panel]').hidden = false;
  $('[data-saves-panel]').scrollIntoView({ behavior: 'smooth' });
}

$('[data-saves-close]').addEventListener('click', () => {
  $('[data-saves-panel]').hidden = true;
});

async function openUserStats(user) {
  const { ok, data } = await api('admin/users/stats', { query: { id: user.id } });
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  $('[data-user-stats-name]').textContent = user.display_name;
  const items = data.games.map((game) => {
    const item = Object.assign(document.createElement('li'), { className: 'sessions__item' });
    const text = document.createElement('div');
    text.append(
      Object.assign(document.createElement('strong'), { textContent: game.name }),
      Object.assign(document.createElement('span'), {
        textContent: `${formatDuration(game.seconds)} gespielt · ${game.wins} von ${game.finished} Leveln geschafft · Bestwert ${number(game.best_score)} · zuletzt ${formatDate(game.last_played)}`,
      }),
    );
    item.append(text);
    return item;
  });
  $('[data-user-stats-list]').replaceChildren(...(items.length ? items : [Object.assign(document.createElement('li'), { textContent: 'Keine Statistik (noch nicht gespielt oder Zuordnung abgeschaltet).' })]));
  $('[data-user-stats]').hidden = false;
  $('[data-user-stats]').scrollIntoView({ behavior: 'smooth' });
}

$('[data-user-stats-close]').addEventListener('click', () => {
  $('[data-user-stats]').hidden = true;
});

// --- Rechte ----------------------------------------------------------------

let rightsUser = null;

function checkbox(name, value, label, checked) {
  const wrapper = Object.assign(document.createElement('label'), { className: 'checkbox' });
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', name, value, checked });
  wrapper.append(input, Object.assign(document.createElement('span'), { textContent: label }));
  return wrapper;
}

async function openRights(user) {
  const { ok, data } = await api('admin/rights', { query: { id: user.id } });
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  rightsUser = user;
  $('[data-rights-name]').textContent = user.display_name;
  $('[data-rights-roles]').replaceChildren(...data.available.roles.map((role) =>
    checkbox('role', role.id, `${role.name}${role.permissions.length ? ` (${role.permissions.join(', ')})` : ''}`, data.roles.includes(role.id))));
  $('[data-rights-permissions]').replaceChildren(...data.available.permissions.map((perm) =>
    checkbox('permission', perm.id, perm.label, data.permissions.includes(perm.id))));
  $('[data-rights-apps]').replaceChildren(...data.available.apps.flatMap((app) => [
    checkbox('permission', `app.${app.id}.beta`, `${app.name}: Beta-Zugang`, data.permissions.includes(`app.${app.id}.beta`)),
    checkbox('permission', `app.${app.id}.manage`, `${app.name}: verwalten`, data.permissions.includes(`app.${app.id}.manage`)),
  ]));
  $('[data-rights]').hidden = false;
  $('[data-rights]').scrollIntoView({ behavior: 'smooth' });
}

$('[data-rights-close]').addEventListener('click', () => {
  $('[data-rights]').hidden = true;
});

$('[data-form="rights"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  const { ok, data } = await api('admin/rights/set', { method: 'POST', body: { id: rightsUser.id, roles: checked('role'), permissions: checked('permission') } });
  if (!ok) return notify(MESSAGES[data.error] ?? data.fields?.roles ?? data.fields?.permissions ?? FALLBACK);
  $('[data-rights]').hidden = true;
  notify(`Rechte für ${rightsUser.display_name} gespeichert.`, 'success');
  loadUsers(1);
});

// --- Moderation ------------------------------------------------------------

for (const selector of ['[data-mod-game]', '[data-mod-board]', '[data-mod-period]']) {
  $(selector).addEventListener('change', (event) => {
    if (selector === '[data-mod-game]') $('[data-mod-board]').replaceChildren();
    loadModeration();
  });
}

async function loadModeration() {
  const { ok, data } = await api('admin/leaderboard', {
    query: { app: $('[data-mod-game]').value, board: $('[data-mod-board]').value, period: $('[data-mod-period]').value },
  });
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  $('[data-mod-game]').replaceChildren(...data.apps.map((app) => new Option(app.name, app.id)));
  $('[data-mod-game]').value = data.app;
  $('[data-mod-board]').replaceChildren(...data.boards.map((board) => new Option(boardLabel(board), board)));
  $('[data-mod-board]').value = data.board;

  let rank = 0;
  $('[data-mod-entries]').replaceChildren(...data.entries.map((entry) => {
    const hidden = entry.hidden_at !== null;
    if (!hidden && entry.status === 'active') rank += 1;
    const row = document.createElement('tr');
    const status = hidden ? `ausgeblendet${entry.hidden_reason ? ` (${entry.hidden_reason})` : ''}` : entry.status === 'locked' ? 'Konto gesperrt' : 'sichtbar';
    row.append(cell(hidden || entry.status !== 'active' ? '–' : String(rank)), cell(entry.display_name), cell(number(entry.score)), cell(formatDate(entry.achieved_at)), cell(status));
    const actions = Object.assign(document.createElement('td'), { className: 'actions' });
    actions.append(button(hidden ? 'Einblenden' : 'Ausblenden', async () => {
      const reason = hidden ? '' : window.prompt('Grund (optional, z. B. „unmögliche Punktzahl“):', '') ?? null;
      if (reason === null) return;
      const result = await api('admin/leaderboard/hide', { method: 'POST', body: { id: Number(entry.id), hidden: !hidden, reason } });
      if (!result.ok) return notify(MESSAGES[result.data.error] ?? FALLBACK);
      loadModeration();
    }, hidden ? 'secondary' : 'danger'));
    row.append(actions);
    return row;
  }));
  if (!data.entries.length) {
    const row = document.createElement('tr');
    const empty = cell('Noch keine Einträge.');
    empty.colSpan = 6;
    row.append(empty);
    $('[data-mod-entries]').replaceChildren(row);
  }
  csvData.leaderboard = {
    name: `rangliste-${data.app}-${data.board}-${$('[data-mod-period]').value}`,
    header: ['Name', 'Punkte', 'Erreicht', 'Status'],
    rows: data.entries.map((e) => [e.display_name, e.score, e.achieved_at, e.hidden_at !== null ? 'ausgeblendet' : e.status === 'active' ? 'sichtbar' : 'Konto gesperrt']),
  };
  loadLevels();
}

// Community-Level: ausblenden, wieder einblenden oder endgültig löschen.
$('[data-levels-game]').addEventListener('change', () => loadLevels());

async function loadLevels() {
  const { ok, data } = await api('admin/levels', { query: { app: $('[data-levels-game]').value } });
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  $('[data-levels-game]').replaceChildren(...data.apps.map((app) => new Option(app.name, app.id)));
  $('[data-levels-game]').value = data.app;
  const rows = data.levels.map((level) => {
    const hidden = level.hidden_at !== null;
    const row = document.createElement('tr');
    const status = hidden ? `ausgeblendet${level.hidden_reason ? ` (${level.hidden_reason})` : ''}` : level.status === 'locked' ? 'Konto gesperrt' : 'sichtbar';
    row.append(cell(level.name), cell(level.display_name), cell(formatDate(level.created_at)), cell(`${number(Number(level.plays))} / ${number(Number(level.wins))} / ♥ ${number(Number(level.likes))}`), cell(status));
    const actions = Object.assign(document.createElement('td'), { className: 'actions' });
    actions.append(
      button(hidden ? 'Einblenden' : 'Ausblenden', async () => {
        const reason = hidden ? '' : window.prompt('Grund (optional, z. B. „beleidigender Name“):', '') ?? null;
        if (reason === null) return;
        const result = await api('admin/levels/hide', { method: 'POST', body: { id: Number(level.id), hidden: !hidden, reason } });
        if (!result.ok) return notify(MESSAGES[result.data.error] ?? FALLBACK);
        loadLevels();
      }, hidden ? 'secondary' : 'danger'),
      button('Löschen', async () => {
        if (!window.confirm(`Level „${level.name}“ von ${level.display_name} endgültig löschen?`)) return;
        const result = await api('admin/levels/delete', { method: 'POST', body: { id: Number(level.id) } });
        if (!result.ok) return notify(MESSAGES[result.data.error] ?? FALLBACK);
        loadLevels();
      }, 'danger'),
    );
    row.append(actions);
    return row;
  });
  if (!rows.length) {
    const row = document.createElement('tr');
    const empty = cell('Noch keine Community-Level.');
    empty.colSpan = 6;
    row.append(empty);
    rows.push(row);
  }
  $('[data-levels]').replaceChildren(...rows);
}

// --- Apps ------------------------------------------------------------------

const STATUS_LABELS = { public: 'öffentlich', beta: 'Beta', private: 'privat', maintenance: 'Wartung' };
const VISIBILITY_LABELS = { all: 'alle', signed_in: 'nur angemeldete Nutzer', selected: 'ausgewählte Nutzer' };

async function loadApps() {
  const { ok, data } = await api('admin/apps');
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  $('[data-apps]').replaceChildren(...data.apps.map((app) => {
    const panel = Object.assign(document.createElement('div'), { className: 'panel' });
    panel.append(Object.assign(document.createElement('h2'), { textContent: `${app.name} · Version ${app.version}` }));

    const form = Object.assign(document.createElement('form'), { className: 'admin-search' });
    const status = document.createElement('select');
    status.append(...data.statuses.map((value) => new Option(STATUS_LABELS[value], value, false, value === app.status)));
    status.setAttribute('aria-label', 'Status');
    const visibility = document.createElement('select');
    visibility.append(...data.visibilities.map((value) => new Option(VISIBILITY_LABELS[value], value, false, value === app.visibility)));
    visibility.setAttribute('aria-label', 'Sichtbarkeit');
    const save = Object.assign(document.createElement('button'), { type: 'submit', className: 'button', textContent: 'Speichern' });
    form.append(status, visibility, save);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const result = await api('admin/apps/update', { method: 'POST', body: { id: app.id, status: status.value, visibility: visibility.value } });
      notify(result.ok ? `${app.name}: gespeichert.` : MESSAGES[result.data.error] ?? FALLBACK, result.ok ? 'success' : 'error');
    });

    const access = Object.assign(document.createElement('ul'), { className: 'sessions' });
    access.append(...app.access.map((user) => {
      const item = Object.assign(document.createElement('li'), { className: 'sessions__item' });
      item.append(Object.assign(document.createElement('span'), { textContent: user.display_name }), button('Entfernen', async () => {
        await api('admin/apps/access', { method: 'POST', body: { app_id: app.id, display_name: user.display_name, grant: false } });
        loadApps();
      }));
      return item;
    }));

    const grant = Object.assign(document.createElement('form'), { className: 'admin-search' });
    const name = Object.assign(document.createElement('input'), { type: 'text', placeholder: 'Name des Kontos freischalten …' });
    name.setAttribute('aria-label', 'Name des Kontos');
    grant.append(name, Object.assign(document.createElement('button'), { type: 'submit', className: 'button button--secondary', textContent: 'Freischalten' }));
    grant.addEventListener('submit', async (event) => {
      event.preventDefault();
      const result = await api('admin/apps/access', { method: 'POST', body: { app_id: app.id, display_name: name.value, grant: true } });
      if (!result.ok) return notify(result.data.error === 'unknown_user' ? 'Kein Konto mit diesem Namen.' : MESSAGES[result.data.error] ?? FALLBACK);
      loadApps();
    });

    panel.append(form, Object.assign(document.createElement('h3'), { textContent: 'Freigaben' }), access, grant);
    campaignBox(app).then((box) => box && panel.append(box));
    return panel;
  }));
}

// Kampagne (z. B. Nova Bastion): Datei aus dem Level-Editor des Spiels hochladen; gilt sofort für alle Spieler.
async function campaignBox(app) {
  const { ok, data } = await api('admin/content', { query: { app: app.id, key: 'campaign' } });
  if (!ok) return null; // Spiel hat keine veröffentlichbare Kampagne
  const box = document.createElement('div');
  const info = Object.assign(document.createElement('p'), { className: 'hint' });
  info.textContent = data.content
    ? `Online-Kampagne vom ${formatDate(data.content.updated_at)} (${number(Math.round(data.content.size / 1024))} KB${data.content.updated_by ? `, von ${data.content.updated_by}` : ''}).`
    : 'Noch keine Online-Kampagne – alle spielen die Kampagne aus der eingebauten Spielversion.';
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.setAttribute('aria-label', 'Kampagnen-Datei');
  const upload = button('Kampagne veröffentlichen', async () => {
    const file = input.files?.[0];
    if (!file) return notify('Bitte zuerst die Kampagnen-Datei (.json) auswählen.');
    if (!window.confirm(`„${file.name}“ sofort für alle Spieler von ${app.name} veröffentlichen?`)) return;
    const result = await api('admin/content/publish', { method: 'POST', body: { app_id: app.id, key: 'campaign', json: await file.text() } });
    if (!result.ok) return notify(Object.values(result.data.fields ?? {}).join(' ') || (MESSAGES[result.data.error] ?? FALLBACK));
    notify(`${app.name}: Kampagne veröffentlicht. Spieler bekommen sie beim nächsten Start.`, 'success');
    loadApps();
  }, 'primary');
  const row = Object.assign(document.createElement('div'), { className: 'admin-search' });
  row.append(input, upload);
  box.append(Object.assign(document.createElement('h3'), { textContent: 'Kampagne' }), info, row);
  return box;
}

// --- Ankündigungen ---------------------------------------------------------

const AUDIENCE_LABELS = { all: 'Alle', signed_in: 'Angemeldete' };
const STATE_LABELS = { active: 'Sichtbar', planned: 'Geplant', ended: 'Beendet' };
const announcementForm = $('[data-form="announcement"]');

// datetime-local (Ortszeit) ↔ UTC der API
const toUtc = (local) => (local ? new Date(local).toISOString().slice(0, 19) + 'Z' : '');
function toLocal(utc) {
  if (!utc) return '';
  const date = new Date(`${utc.replace(' ', 'T')}Z`);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function resetAnnouncement(item = null) {
  announcementForm.reset();
  const f = announcementForm.elements;
  f.id.value = item?.id ?? '';
  if (item) {
    f.title.value = item.title;
    f.body.value = item.body;
    f.link.value = item.link ?? '';
    f.level.value = item.level;
    f.audience.value = item.audience;
    f.app_id.value = item.app_id ?? '';
    f.starts_at.value = toLocal(item.starts_at);
    f.ends_at.value = toLocal(item.ends_at);
  }
  f.app_id.hidden = f.audience.value !== 'app';
  $('[data-announcement-heading]').textContent = item ? 'Ankündigung bearbeiten' : 'Neue Ankündigung';
}

announcementForm.elements.audience.addEventListener('change', () => {
  announcementForm.elements.app_id.hidden = announcementForm.elements.audience.value !== 'app';
});
$('[data-announcement-reset]').addEventListener('click', () => resetAnnouncement());

announcementForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const f = announcementForm.elements;
  const body = {
    title: f.title.value, body: f.body.value, link: f.link.value, level: f.level.value, audience: f.audience.value,
    app_id: f.app_id.value, starts_at: toUtc(f.starts_at.value), ends_at: toUtc(f.ends_at.value),
  };
  if (f.id.value) body.id = Number(f.id.value);
  const result = await api('admin/announcements/save', { method: 'POST', body });
  if (!result.ok) {
    const fields = Object.values(result.data.fields ?? {});
    return notify(fields.length ? fields.join(' ') : MESSAGES[result.data.error] ?? FALLBACK);
  }
  notify('Ankündigung gespeichert.', 'success');
  resetAnnouncement();
  loadAnnouncements();
});

async function loadAnnouncements() {
  const { ok, data } = await api('admin/announcements');
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  const select = announcementForm.elements.app_id;
  const chosen = select.value;
  select.replaceChildren(...data.apps.map((app) => new Option(app.name, app.id, false, app.id === chosen)));
  const appName = (id) => data.apps.find((app) => app.id === id)?.name ?? id;
  $('[data-announcements]').replaceChildren(...data.announcements.map((item) => {
    const row = document.createElement('tr');
    const actions = document.createElement('td');
    actions.append(
      button('Bearbeiten', () => { resetAnnouncement(item); announcementForm.scrollIntoView({ behavior: 'smooth' }); }),
      button('Löschen', async () => {
        if (!window.confirm(`„${item.title}“ löschen?`)) return;
        const result = await api('admin/announcements/delete', { method: 'POST', body: { id: item.id } });
        if (!result.ok) return notify(MESSAGES[result.data.error] ?? FALLBACK);
        loadAnnouncements();
      }, 'danger'),
    );
    row.append(
      cell(item.title),
      cell(item.audience === 'app' ? `Spiel: ${appName(item.app_id)}` : AUDIENCE_LABELS[item.audience] ?? item.audience),
      cell(`${formatDate(item.starts_at)} – ${item.ends_at ? formatDate(item.ends_at) : 'offen'}`),
      cell(STATE_LABELS[item.state] ?? item.state),
      cell(item.author ?? '–'),
      actions,
    );
    return row;
  }));
}

// --- Protokoll -------------------------------------------------------------

$('[data-audit-filter]').addEventListener('change', () => loadAudit(1));

async function loadAudit(page) {
  const { ok, data } = await api('admin/audit', { query: { page, action: $('[data-audit-filter]').value } });
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  $('[data-audit]').replaceChildren(...data.entries.map((entry) => {
    const row = document.createElement('tr');
    const details = document.createElement('td');
    if (entry.details) details.append(Object.assign(document.createElement('code'), { textContent: entry.details }));
    row.append(
      cell(formatDate(entry.created_at)),
      cell(ACTIONS[entry.action] ?? entry.action),
      cell(entry.actor_name ?? (entry.actor_user_id ? `Konto ${entry.actor_user_id}` : '–')),
      cell(entry.target_type ? `${entry.target_type} ${entry.target_id}` : '–'),
      cell(entry.ip_prefix ?? '–'),
      details,
    );
    return row;
  }));
  pager('audit', data.page, data.entries.length === data.page_size, loadAudit);
}

// --- Fehler aus den Spielen ------------------------------------------------

for (const selector of ['[data-errors-game]', '[data-errors-days]', '[data-errors-open]']) {
  $(selector).addEventListener('change', () => loadErrors());
}

async function loadErrors() {
  const { ok, data } = await api('admin/errors', { query: { app: $('[data-errors-game]').value, days: $('[data-errors-days]').value } });
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  const select = $('[data-errors-game]');
  if (select.options.length !== data.apps.length + 1) {
    select.replaceChildren(new Option('Alle Spiele', ''), ...data.apps.map((app) => new Option(app.name, app.id)));
    select.value = data.app;
  }
  const appName = (id) => data.apps.find((app) => app.id === id)?.name ?? id;
  const onlyOpen = $('[data-errors-open]').checked;
  const groups = data.groups.filter((g) => !onlyOpen || !g.resolved);
  csvData.errors = {
    name: 'fehler',
    header: ['Meldung', 'Ort', 'Spiel', 'Anzahl', 'Zuerst', 'Zuletzt', 'Versionen', 'Browser', 'Erledigt'],
    rows: groups.map((g) => [g.message, g.source, appName(g.app_id), g.count, g.first_seen, g.last_seen, g.versions, g.browsers, g.resolved ? 'ja' : 'nein']),
  };
  const rows = groups.flatMap((group) => {
    const row = document.createElement('tr');
    const what = document.createElement('td');
    what.append(Object.assign(document.createElement('strong'), { textContent: group.message }));
    if (group.source) what.append(document.createElement('br'), Object.assign(document.createElement('code'), { textContent: group.source }));
    const details = Object.assign(document.createElement('tr'), { className: 'error-stack', hidden: true });
    const stackCell = Object.assign(document.createElement('td'), { colSpan: 7 });
    stackCell.append(Object.assign(document.createElement('pre'), { textContent: group.stack || 'Kein Aufrufpfad gemeldet.' }),
      Object.assign(document.createElement('p'), { className: 'hint', textContent: `Zuerst am ${formatDate(group.first_seen)} aufgetreten.` }));
    details.append(stackCell);
    const actions = Object.assign(document.createElement('td'), { className: 'actions' });
    actions.append(
      button('Details', () => { details.hidden = !details.hidden; }),
      button(group.resolved ? 'Wieder öffnen' : 'Erledigt', async () => {
        const result = await api('admin/errors/resolve', { method: 'POST', body: { app_id: group.app_id, fingerprint: group.fingerprint, resolved: !group.resolved } });
        if (!result.ok) return notify(MESSAGES[result.data.error] ?? FALLBACK);
        loadErrors();
      }, group.resolved ? 'secondary' : 'primary'),
    );
    row.append(what, cell(appName(group.app_id)), cell(number(group.count)), cell(formatDate(group.last_seen)), cell(group.versions || '–'), cell(group.browsers || '–'), actions);
    if (group.resolved) row.className = 'row--resolved';
    return [row, details];
  });
  if (!rows.length) {
    const row = document.createElement('tr');
    const empty = cell(onlyOpen ? 'Keine offenen Fehler in diesem Zeitraum. 🎉' : 'Keine Fehler in diesem Zeitraum.');
    empty.colSpan = 7;
    row.append(empty);
    rows.push(row);
  }
  $('[data-errors]').replaceChildren(...rows);
}

// --- Technik ---------------------------------------------------------------

const ENV_LABELS = { production: 'Live', staging: 'Test (Staging)', development: 'Entwicklung', test: 'Test' };

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

async function loadSystem() {
  const { ok, data } = await api('admin/system');
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  const pending = data.pending_migrations.length;
  const tiles = [
    [ENV_LABELS[data.environment] ?? data.environment, 'Umgebung'],
    [data.schema ?? '–', 'Datenbank-Stand'],
    [pending ? `${pending} offen` : 'keine', 'ausstehende Migrationen'],
    [number(data.last_24h.events), 'Spiel-Ereignisse 24 h'],
    [number(data.last_24h.errors), 'Spielfehler 24 h'],
    [number(data.last_24h.saves), 'gesicherte Spielstände 24 h'],
    [number(data.last_24h.logins), 'Anmeldungen 24 h'],
  ];
  $('[data-system-tiles]').replaceChildren(...tiles.map(([value, label]) => {
    const tile = Object.assign(document.createElement('div'), { className: 'stat stat--text' });
    tile.append(Object.assign(document.createElement('strong'), { textContent: String(value) }), Object.assign(document.createElement('span'), { textContent: label }));
    if (label === 'ausstehende Migrationen' && pending) tile.classList.add('stat--warn');
    return tile;
  }));
  $('[data-system-apps]').replaceChildren(...data.apps.map((app) => {
    const row = document.createElement('tr');
    row.append(cell(app.name), cell(app.version || '–'), cell(STATUS_LABELS[app.status] ?? app.status), cell(VISIBILITY_LABELS[app.visibility] ?? app.visibility));
    return row;
  }));
  const total = data.tables.reduce((sum, t) => sum + t.bytes, 0);
  $('[data-system-db]').textContent = `${data.database} · PHP ${data.php} · zusammen ${formatBytes(total)} · Serverzeit ${formatDate(data.server_time)}`;
  $('[data-system-tables]').replaceChildren(...data.tables.map((table) => {
    const row = document.createElement('tr');
    row.append(cell(table.name), cell(number(table.rows)), cell(formatBytes(table.bytes)));
    return row;
  }));
  const build = typeof __ZENTRALE_BUILD__ === 'object' ? __ZENTRALE_BUILD__ : null;
  $('[data-system-build]').textContent = build
    ? `Gebaut am ${new Date(build.time).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} aus dem Code-Stand ${build.commit}.`
    : 'Keine Angaben zum Build.';
}

// --- Eigene Anmeldungen ----------------------------------------------------

function describeAgent(agent) {
  if (!agent) return 'Unbekanntes Gerät';
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /SamsungBrowser/.test(agent) ? 'Samsung Internet' : /Chrome\/|CriOS\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  const system = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iPhone/iPad' : /Windows/.test(agent) ? 'Windows' : /Mac OS/.test(agent) ? 'Mac' : /Linux/.test(agent) ? 'Linux' : 'unbekanntes System';
  return `${browser} auf ${system}`;
}

async function loadMySessions() {
  const { ok, data } = await api('admin/sessions');
  if (!ok) return notify(MESSAGES[data.error] ?? FALLBACK);
  $('[data-my-sessions]').replaceChildren(...data.sessions.map((session) => {
    const item = Object.assign(document.createElement('li'), { className: 'sessions__item' });
    const text = document.createElement('div');
    text.append(
      Object.assign(document.createElement('strong'), {
        textContent: `${session.admin ? 'Zentrale' : 'Webseite'} · ${describeAgent(session.user_agent)}${session.current ? ' (dieses Gerät)' : ''}`,
      }),
      Object.assign(document.createElement('span'), {
        textContent: `angemeldet ${formatDate(session.created_at)} · zuletzt aktiv ${formatDate(session.last_seen_at)}${session.ip_prefix ? ` · Netz ${session.ip_prefix}` : ''}`,
      }),
    );
    item.append(text);
    if (!session.current) {
      item.append(button('Beenden', async () => {
        const result = await api('admin/sessions/revoke', { method: 'POST', body: { id: session.id } });
        if (!result.ok) return notify(MESSAGES[result.data.error] ?? FALLBACK);
        loadMySessions();
      }, 'danger'));
    }
    return item;
  }));
}

$('[data-sessions-others]').addEventListener('click', async () => {
  if (!window.confirm('Alle anderen Anmeldungen beenden – auf der Webseite und in der Zentrale?')) return;
  const result = await api('admin/sessions/revoke-others', { method: 'POST' });
  notify(result.ok ? 'Alle anderen Anmeldungen sind beendet.' : MESSAGES[result.data.error] ?? FALLBACK, result.ok ? 'success' : 'error');
  loadMySessions();
});

start();
