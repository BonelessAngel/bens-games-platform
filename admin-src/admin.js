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

const can = (permission) => me?.permissions.includes('*') || me?.permissions.includes(permission);

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
  ({ uebersicht: loadOverview, konten: () => loadUsers(1), protokoll: () => loadAudit(1) })[tab]?.();
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
  $('[data-email-col]').hidden = !showEmail;
  $('[data-form="search"] input').placeholder = showEmail ? 'Name oder E-Mail suchen …' : 'Name suchen …';

  $('[data-users]').replaceChildren(...data.users.map((user) => {
    const row = document.createElement('tr');
    const status = cell(user.status === 'locked' ? 'gesperrt' : user.email_verified ? 'aktiv' : 'unbestätigt');
    if (user.status === 'locked') status.className = 'status--locked';
    row.append(cell(user.display_name));
    if (showEmail) row.append(cell(user.email ?? ''));
    row.append(status, cell(formatDate(user.created_at)), cell(formatDate(user.last_login_at)), cell(user.two_factor ? 'an' : '–'), cell(user.roles.join(', ') || '–'));

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
    row.append(actions);
    return row;
  }));
  pager('users', data.page, data.page * data.page_size < data.total, loadUsers);
}

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
