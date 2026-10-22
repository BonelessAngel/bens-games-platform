// Zentrale (admin.bens-games.de): Anmeldung mit Zwei-Faktor, Übersicht, Konten, Rechte, Protokoll.
// Alle Prüfungen passieren auf dem Server – hier wird nur angezeigt, was die API erlaubt.

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
  'user.leaderboard_opt_out': 'Aus Ranglisten herausgenommen',
  'user.leaderboard_opt_in': 'In Ranglisten aufgenommen',
  'user.stats_opt_out': 'Statistik-Zuordnung abgeschaltet',
  'user.stats_opt_in': 'Statistik-Zuordnung eingeschaltet',
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
    protokoll: () => loadAudit(1),
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
  const tiles = [
    [data.users.total, 'Konten insgesamt'],
    [data.users.new_today, 'neu heute'],
    [data.users.new_7_days, 'neu in 7 Tagen'],
    [data.active_users_24h, 'aktiv in 24 Stunden'],
    [data.open_sessions, 'offene Anmeldungen'],
    [data.users.two_factor, 'mit Zwei-Faktor'],
    [data.users.locked, 'gesperrt'],
    [data.failed_logins_24h, 'Fehlanmeldungen 24 h'],
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
    row.append(actions);
    return row;
  }));
  pager('users', data.page, data.page * data.page_size < data.total, loadUsers);
}

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
  $('[data-mod-board]').replaceChildren(...data.boards.map((board) => new Option(/^\d+$/.test(board) ? `Level ${board}` : board, board)));
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
    return panel;
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

start();
