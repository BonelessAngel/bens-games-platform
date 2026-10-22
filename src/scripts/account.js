// Kontoseiten: Registrieren, Anmelden, E-Mail bestätigen, Mein Konto.
// Spricht mit der API unter /api/ auf derselben Adresse; das Sitzungs-Cookie setzt und liest nur der Server.
import { safeReturnPath } from '../../lib/return-path.js';
import { avatarSvg, AVATARS, AVATAR_COLORS } from '../../lib/avatars.js';
import { badgeList } from './badges.js';
import { renderNavUser } from './nav.js';

const MESSAGES = {
  invalid_credentials: 'E-Mail oder Passwort ist falsch.',
  email_not_verified: 'Bitte bestätige zuerst deine E-Mail-Adresse. Den Link haben wir dir per E-Mail geschickt.',
  account_locked: 'Dieses Konto ist gesperrt.',
  too_many_attempts: 'Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann erneut.',
  invalid_token: 'Dieser Link ist ungültig oder abgelaufen. Fordere bei der Anmeldung einfach einen neuen an.',
  unavailable: 'Konten sind gerade nicht verfügbar. Bitte versuche es später erneut.',
  validation: 'Bitte prüfe deine Eingaben.',
  wrong_password: 'Das Passwort ist nicht richtig.',
  wrong_code: 'Der Code ist nicht richtig. Nimm den aktuellen Code aus der App – jeder Code gilt nur einmal.',
  invalid_challenge: 'Die Anmeldung hat zu lange gedauert. Bitte gib E-Mail und Passwort noch einmal ein.',
  already_enabled: 'Die Zwei-Faktor-Anmeldung ist bereits eingeschaltet.',
  not_enabled: 'Die Zwei-Faktor-Anmeldung ist nicht eingeschaltet.',
  setup_required: 'Bitte starte die Einrichtung noch einmal.',
};
const FALLBACK = 'Etwas ist schiefgelaufen. Bitte versuche es später erneut.';

async function api(path, { method = 'GET', body, csrf } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers['X-CSRF-Token'] = csrf;
  try {
    const response = await fetch(`/api/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

function show(element, text, kind = 'error') {
  element.textContent = text;
  element.className = `notice notice--${kind}`;
  element.hidden = !text;
}

function fieldErrors(form, fields = {}) {
  for (const input of form.querySelectorAll('input[name]')) {
    const hint = form.querySelector(`[data-error-for="${input.name}"]`);
    const message = fields[input.name] ?? '';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (hint) {
      hint.textContent = message;
      hint.hidden = !message;
    }
  }
}

// Formularwerte als Objekt; Häkchen werden zu true/false.
function formData(form) {
  const data = {};
  for (const input of form.querySelectorAll('input[name]')) {
    data[input.name] = input.type === 'checkbox' ? input.checked : input.value;
  }
  return data;
}

// Grobe, verständliche Gerätebeschreibung aus der Browser-Kennung.
function describeDevice(userAgent = '') {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\//.test(ua) ? 'Chrome'
          : /Safari\//.test(ua) ? 'Safari'
            : 'Browser';
  const system = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
        : /Windows/.test(ua) ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
            : /Linux/.test(ua) ? 'Linux'
              : 'unbekanntem Gerät';
  return `${browser} auf ${system}`;
}

function formatDate(utc) {
  const date = new Date(`${utc.replace(' ', 'T')}Z`);
  return date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

// Verhindert Doppelklicks und zeigt, dass gerade etwas passiert.
async function busy(form, task) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await task();
  } finally {
    button.disabled = false;
  }
}

const pages = {
  registrieren(root) {
    const form = root.querySelector('form');
    const notice = root.querySelector('[data-notice]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      busy(form, async () => {
        const { ok, data } = await api('auth/register', { method: 'POST', body: formData(form) });
        fieldErrors(form, data.fields);
        if (ok) {
          form.hidden = true;
          show(notice, 'Fast geschafft! Wir haben dir eine E-Mail mit einem Bestätigungslink geschickt. Schau auch im Spam-Ordner nach.', 'success');
        } else {
          show(notice, MESSAGES[data.error] ?? FALLBACK);
        }
      });
    });
  },

  anmelden(root) {
    const form = root.querySelector('form');
    const twoFactorForm = root.querySelector('[data-form="two-factor"]');
    const notice = root.querySelector('[data-notice]');
    const resend = root.querySelector('[data-resend]');
    let challenge = '';

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      busy(form, async () => {
        const { ok, data } = await api('auth/login', { method: 'POST', body: formData(form) });
        if (ok && data.status === 'two_factor_required') {
          challenge = data.challenge;
          form.hidden = true;
          twoFactorForm.hidden = false;
          notice.hidden = true;
          twoFactorForm.elements.code.focus();
          return;
        }
        if (ok) {
          window.location.href = safeReturnPath(window.location.search);
          return;
        }
        show(notice, MESSAGES[data.error] ?? FALLBACK);
        resend.hidden = data.error !== 'email_not_verified';
      });
    });

    twoFactorForm.addEventListener('submit', (event) => {
      event.preventDefault();
      busy(twoFactorForm, async () => {
        const { ok, data } = await api('auth/login/two-factor', { method: 'POST', body: { challenge, code: twoFactorForm.elements.code.value } });
        if (ok) {
          window.location.href = safeReturnPath(window.location.search);
          return;
        }
        if (data.error === 'invalid_challenge' || data.error === 'too_many_attempts') {
          // Neu anfangen: zurück zu E-Mail und Passwort.
          twoFactorForm.hidden = true;
          twoFactorForm.reset();
          form.hidden = false;
        }
        show(notice, MESSAGES[data.error] ?? FALLBACK);
      });
    });
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      await api('auth/resend-verification', { method: 'POST', body: { email: form.elements.email.value } });
      show(notice, 'Falls ein unbestätigtes Konto zu dieser Adresse gehört, ist ein neuer Link unterwegs.', 'success');
      resend.hidden = true;
      resend.disabled = false;
    });
  },

  async bestaetigen(root) {
    const notice = root.querySelector('[data-notice]');
    const next = root.querySelector('[data-next]');
    // Der Link steht hinter dem #, damit er nicht in Server-Logs landet.
    const token = window.location.hash.slice(1);
    history.replaceState(null, '', window.location.pathname);
    const { ok, data } = await api('auth/verify', { method: 'POST', body: { token } });
    if (ok) {
      show(notice, 'Deine E-Mail-Adresse ist bestätigt. Du kannst dich jetzt anmelden.', 'success');
      next.hidden = false;
    } else {
      show(notice, MESSAGES[data.error] ?? FALLBACK);
    }
  },

  passwortVergessen(root) {
    const form = root.querySelector('form');
    const notice = root.querySelector('[data-notice]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      busy(form, async () => {
        const { ok, data } = await api('auth/forgot-password', { method: 'POST', body: formData(form) });
        if (ok) {
          form.hidden = true;
          show(notice, 'Falls ein Konto zu dieser Adresse gehört, ist ein Link unterwegs. Er ist eine Stunde gültig. Schau auch im Spam-Ordner nach.', 'success');
        } else {
          show(notice, MESSAGES[data.error] ?? FALLBACK);
        }
      });
    });
  },

  passwortNeu(root) {
    const form = root.querySelector('form');
    const notice = root.querySelector('[data-notice]');
    const next = root.querySelector('[data-next]');
    // Der Link steht hinter dem #, damit er nicht in Server-Logs landet.
    const token = window.location.hash.slice(1);
    history.replaceState(null, '', window.location.pathname);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      busy(form, async () => {
        const { ok, data } = await api('auth/reset-password', { method: 'POST', body: { token, ...formData(form) } });
        fieldErrors(form, data.fields);
        if (ok) {
          form.hidden = true;
          next.hidden = false;
          show(notice, 'Dein neues Passwort ist gespeichert. Du kannst dich jetzt anmelden.', 'success');
        } else if (data.error !== 'validation') {
          show(notice, MESSAGES[data.error] ?? FALLBACK);
        }
      });
    });
  },

  async konto(root) {
    const { ok, data } = await api('account/me');
    if (!ok) {
      window.location.href = '/konto/anmelden/';
      return;
    }
    const { csrf } = data;
    root.querySelector('[data-name]').textContent = data.user.display_name;
    root.querySelector('[data-email]').textContent = data.user.email;
    root.querySelector('[data-details]').hidden = false;

    const logout = root.querySelector('[data-logout]');
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      await api('auth/logout', { method: 'POST', body: {}, csrf });
      window.location.href = '/';
    });

    // Passwort ändern
    const passwordForm = root.querySelector('[data-form="password"]');
    const passwordNotice = root.querySelector('[data-notice="password"]');
    passwordForm.addEventListener('submit', (event) => {
      event.preventDefault();
      busy(passwordForm, async () => {
        const result = await api('account/password', { method: 'POST', body: formData(passwordForm), csrf });
        fieldErrors(passwordForm, result.data.fields);
        if (result.ok) {
          passwordForm.reset();
          show(passwordNotice, 'Dein Passwort wurde geändert. Andere Geräte sind abgemeldet.', 'success');
          loadSessions();
        } else if (result.data.error !== 'validation') {
          show(passwordNotice, MESSAGES[result.data.error] ?? FALLBACK);
        } else {
          passwordNotice.hidden = true;
        }
      });
    });

    setupProfile(root, data.user, csrf);
    setupTabs(root);
    setupTwoFactor(root, data.user, csrf, () => loadSessions());
    loadGames(root, csrf);
    loadStats(root, csrf);

    // Geräte
    const list = root.querySelector('[data-sessions]');
    async function loadSessions() {
      const result = await api('account/sessions');
      list.replaceChildren();
      for (const session of result.data.sessions ?? []) {
        const item = document.createElement('li');
        item.className = 'sessions__item';
        const text = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = describeDevice(session.user_agent) + (session.current ? ' – dieses Gerät' : '');
        const meta = document.createElement('span');
        meta.textContent = `Zuletzt aktiv: ${formatDate(session.last_seen_at)}${session.persistent ? ' · angemeldet bleiben' : ''}`;
        text.append(title, meta);
        item.append(text);
        if (!session.current) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'button button--secondary button--small';
          button.textContent = 'Abmelden';
          button.addEventListener('click', async () => {
            button.disabled = true;
            await api('account/sessions/revoke', { method: 'POST', body: { id: session.id }, csrf });
            loadSessions();
          });
          item.append(button);
        }
        list.append(item);
      }
    }
    loadSessions();

    const revokeOthers = root.querySelector('[data-revoke-others]');
    revokeOthers.addEventListener('click', async () => {
      revokeOthers.disabled = true;
      await api('account/sessions/revoke-others', { method: 'POST', body: {}, csrf });
      revokeOthers.disabled = false;
      loadSessions();
    });

    // Konto löschen
    const deleteForm = root.querySelector('[data-form="delete"]');
    const deleteNotice = root.querySelector('[data-notice="delete"]');
    deleteForm.addEventListener('submit', (event) => {
      event.preventDefault();
      busy(deleteForm, async () => {
        const result = await api('account/delete', { method: 'POST', body: formData(deleteForm), csrf });
        fieldErrors(deleteForm, result.data.fields);
        if (result.ok) {
          window.location.href = '/?konto=geloescht';
        } else if (result.data.error !== 'validation') {
          show(deleteNotice, MESSAGES[result.data.error] ?? FALLBACK);
        } else {
          deleteNotice.hidden = true;
        }
      });
    });
  },
};

// Bereich „Spielstände“ auf „Mein Konto“: gesicherte Spiele mit Erfolgen, einzeln löschbar.
async function loadGames(root, csrf) {
  const list = root.querySelector('[data-games]');
  const empty = root.querySelector('[data-games-empty]');
  const { ok, data } = await api('account/games');
  const games = ok ? data.games ?? [] : [];
  list.replaceChildren();
  empty.hidden = games.length > 0;

  for (const game of games) {
    const item = document.createElement('li');
    item.className = 'sessions__item';
    const text = document.createElement('div');
    const title = document.createElement('strong');
    const link = Object.assign(document.createElement('a'), { href: game.path, textContent: game.name });
    title.append(link);
    const meta = document.createElement('span');
    const achievements = game.achievements === 1 ? '1 Erfolg' : `${game.achievements} Erfolge`;
    meta.textContent = `Gesichert: ${formatDate(game.updated_at)} · ${achievements}`;
    text.append(title, meta);
    if (game.achievement_ids?.length) text.append(await badgeList(game.id, game.achievement_ids));

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--secondary button--small';
    button.textContent = 'Löschen';
    button.addEventListener('click', async () => {
      if (!window.confirm(`Spielstand und Erfolge von ${game.name} im Konto löschen? Der Stand auf deinen Geräten bleibt erhalten.`)) return;
      button.disabled = true;
      await api(`games/${encodeURIComponent(game.id)}/save/delete`, { method: 'POST', body: {}, csrf });
      loadGames(root, csrf);
    });

    item.append(text, button);
    list.append(item);
  }
}

// Reiter auf „Mein Konto“; der gewählte Reiter steht in der Adresse (#sicherheit usw.).
function setupTabs(root) {
  const tabs = [...root.querySelectorAll('[data-tab-target]')];
  const show = (name) => {
    const target = tabs.some((t) => t.dataset.tabTarget === name) ? name : 'profil';
    for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.tabTarget === target));
    for (const group of root.querySelectorAll('[data-group]')) group.hidden = group.dataset.group !== target;
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      history.replaceState(null, '', `#${tab.dataset.tabTarget}`);
      show(tab.dataset.tabTarget);
    });
  }
  show(window.location.hash.slice(1));
}

// Profilkarte, Avatar-Auswahl und Anzeigename.
function setupProfile(root, user, csrf) {
  let current = { ...user };
  let choice = { avatar: user.avatar ?? AVATARS[0].id, color: user.avatar_color ?? AVATAR_COLORS[0].id };

  const renderCard = () => {
    root.querySelector('[data-profile-avatar]').innerHTML = avatarSvg({ avatar: current.avatar, color: current.avatar_color, name: current.display_name }, 88);
    root.querySelector('[data-name]').textContent = current.display_name;
    const badges = [current.email_verified ? 'E-Mail bestätigt' : 'E-Mail unbestätigt', current.two_factor ? 'Zwei-Faktor an' : 'Zwei-Faktor aus'];
    root.querySelector('[data-badges]').replaceChildren(...badges.map((text) => Object.assign(document.createElement('span'), { className: 'pill', textContent: text })));
    // Sichtbar nur, solange das Konto in Ranglisten erscheint (setzt loadStats).
    root.querySelector('[data-profile-link]').href = `/spieler/?name=${encodeURIComponent(current.display_name)}`;
    renderNavUser(current);
  };

  const avatarGrid = root.querySelector('[data-avatar-grid]');
  const colorGrid = root.querySelector('[data-color-grid]');
  const renderPicker = () => {
    avatarGrid.replaceChildren(...AVATARS.map((avatar) => {
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'avatar-option', title: avatar.name });
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(choice.avatar === avatar.id));
      button.setAttribute('aria-label', avatar.name);
      button.innerHTML = avatarSvg({ avatar: avatar.id, color: choice.color }, 52);
      button.onclick = () => { choice.avatar = avatar.id; renderPicker(); };
      return button;
    }));
    colorGrid.replaceChildren(...AVATAR_COLORS.map((color) => {
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'color-option', title: color.name });
      button.style.background = color.value;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(choice.color === color.id));
      button.setAttribute('aria-label', color.name);
      button.onclick = () => { choice.color = color.id; renderPicker(); };
      return button;
    }));
  };

  const notice = (name) => root.querySelector(`[data-notice="${name}"]`);
  const saveProfile = async (body, noticeName, success) => {
    const { ok, data } = await api('account/profile', { method: 'POST', body, csrf });
    if (ok) {
      current = data.user;
      renderCard();
      show(notice(noticeName), success, 'success');
    } else if (data.error !== 'validation') {
      show(notice(noticeName), MESSAGES[data.error] ?? FALLBACK);
    }
    return { ok, data };
  };

  root.querySelector('[data-save-avatar]').addEventListener('click', () =>
    saveProfile({ avatar: choice.avatar, avatar_color: choice.color }, 'avatar', 'Dein Profilbild ist gespeichert.'));
  root.querySelector('[data-clear-avatar]').addEventListener('click', () =>
    saveProfile({ avatar: null }, 'avatar', 'Es wird wieder dein Anfangsbuchstabe angezeigt.'));

  const nameForm = root.querySelector('[data-form="name"]');
  nameForm.elements.display_name.value = user.display_name;
  nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    busy(nameForm, async () => {
      const { data } = await saveProfile({ display_name: nameForm.elements.display_name.value }, 'name', 'Dein neuer Name ist gespeichert.');
      fieldErrors(nameForm, data.fields);
    });
  });

  renderCard();
  renderPicker();
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} Min.`;
  return `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}

// Bereich „Spielstatistik“ auf „Mein Konto“: eigene Werte und Widerspruch gegen die Zuordnung.
async function loadStats(root, csrf) {
  const list = root.querySelector('[data-stats-list]');
  const toggle = root.querySelector('[data-stats-optin]');
  const { ok, data } = await api('account/stats');
  if (!ok) return;
  toggle.checked = !data.opt_out;
  list.replaceChildren(...(data.games.length ? data.games : []).map((game) => {
    const item = Object.assign(document.createElement('li'), { className: 'sessions__item' });
    const text = document.createElement('div');
    const finished = game.finished ? ` · ${game.wins} von ${game.finished} Leveln geschafft` : '';
    const best = game.best_score != null ? ` · Bestwert ${game.best_score.toLocaleString('de-DE')}` : '';
    text.append(
      Object.assign(document.createElement('strong'), { textContent: game.name }),
      Object.assign(document.createElement('span'), { textContent: `${formatDuration(game.seconds)} gespielt${finished}${best}` }),
    );
    item.append(text);
    return item;
  }));
  const ranks = root.querySelector('[data-leaderboard-optin]');
  const profileLink = root.querySelector('[data-profile-link]');
  ranks.checked = !data.leaderboard_opt_out;
  profileLink.hidden = !ranks.checked;
  ranks.onchange = async () => {
    ranks.disabled = true;
    await api('account/leaderboard/settings', { method: 'POST', body: { opt_out: !ranks.checked }, csrf });
    ranks.disabled = false;
    profileLink.hidden = !ranks.checked;
  };
  toggle.onchange = async () => {
    if (!toggle.checked && !window.confirm('Statistik nicht mehr deinem Konto zuordnen? Auch die bisherige wird vom Konto getrennt und zählt nur noch anonym.')) {
      toggle.checked = true;
      return;
    }
    toggle.disabled = true;
    await api('account/stats/settings', { method: 'POST', body: { opt_out: !toggle.checked }, csrf });
    toggle.disabled = false;
    loadStats(root, csrf);
  };
}

// Bereich „Zwei-Faktor-Anmeldung“ auf „Mein Konto“: aus → einrichten → Codes zeigen → an.
function setupTwoFactor(root, user, csrf, onDevicesChanged) {
  const notice = root.querySelector('[data-notice="2fa"]');
  const states = Object.fromEntries([...root.querySelectorAll('[data-2fa]')].map((el) => [el.dataset['2fa'], el]));
  const showState = (name) => {
    for (const [key, element] of Object.entries(states)) element.hidden = key !== name;
  };
  showState(user.two_factor ? 'on' : 'off');
  root.querySelector('[data-codes-left]').textContent = String(user.recovery_codes_left ?? 0);

  const showCodes = (codes) => {
    const list = root.querySelector('[data-codes]');
    list.replaceChildren(...codes.map((code) => Object.assign(document.createElement('li'), { textContent: code })));
    root.querySelector('[data-codes-left]').textContent = String(codes.length);
    showState('codes');
    root.querySelector('[data-copy-codes]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(codes.join('\n'));
        show(notice, 'Codes in die Zwischenablage kopiert.', 'success');
      } catch {
        show(notice, 'Kopieren hat nicht geklappt – bitte die Codes abschreiben oder markieren und kopieren.');
      }
    };
  };
  root.querySelector('[data-codes-done]').addEventListener('click', () => {
    notice.hidden = true;
    showState('on');
  });

  const setupForm = root.querySelector('[data-form="2fa-setup"]');
  setupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    busy(setupForm, async () => {
      const { ok, data } = await api('account/2fa/setup', { method: 'POST', body: formData(setupForm), csrf });
      if (!ok) {
        show(notice, MESSAGES[data.error] ?? FALLBACK);
        return;
      }
      setupForm.reset();
      notice.hidden = true;
      const { default: QRCode } = await import('qrcode');
      root.querySelector('[data-qr]').innerHTML = await QRCode.toString(data.uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      root.querySelector('[data-secret]').textContent = data.secret.match(/.{1,4}/g).join(' ');
      showState('setup');
    });
  });

  const enableForm = root.querySelector('[data-form="2fa-enable"]');
  enableForm.addEventListener('submit', (event) => {
    event.preventDefault();
    busy(enableForm, async () => {
      const { ok, data } = await api('account/2fa/enable', { method: 'POST', body: formData(enableForm), csrf });
      if (!ok) {
        show(notice, MESSAGES[data.error] ?? FALLBACK);
        return;
      }
      enableForm.reset();
      show(notice, 'Die Zwei-Faktor-Anmeldung ist eingeschaltet. Andere Geräte wurden abgemeldet.', 'success');
      showCodes(data.recovery_codes);
      onDevicesChanged();
    });
  });

  const manageForm = root.querySelector('[data-form="2fa-manage"]');
  manageForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const action = event.submitter?.dataset.action ?? 'recovery-codes';
    busy(manageForm, async () => {
      const path = action === 'disable' ? 'account/2fa/disable' : 'account/2fa/recovery-codes';
      const { ok, data } = await api(path, { method: 'POST', body: formData(manageForm), csrf });
      if (!ok) {
        show(notice, MESSAGES[data.error] ?? FALLBACK);
        return;
      }
      manageForm.reset();
      if (action === 'disable') {
        show(notice, 'Die Zwei-Faktor-Anmeldung ist ausgeschaltet.', 'success');
        showState('off');
      } else {
        show(notice, 'Neue Wiederherstellungscodes erstellt. Die alten gelten nicht mehr.', 'success');
        showCodes(data.recovery_codes);
      }
    });
  });
}

// „Anzeigen“-Knopf neben jedem Passwortfeld.
function addPasswordToggles() {
  for (const input of document.querySelectorAll('input[type="password"]')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field__password';
    input.replaceWith(wrapper);
    wrapper.append(input);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'field__toggle';
    toggle.textContent = 'Anzeigen';
    toggle.setAttribute('aria-controls', input.id);
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.textContent = visible ? 'Verbergen' : 'Anzeigen';
      toggle.setAttribute('aria-pressed', String(visible));
      input.focus();
    });
    wrapper.append(toggle);

    // Vor dem Absenden wieder verbergen, damit der Browser es als Passwort speichert.
    input.form?.addEventListener('submit', () => {
      input.type = 'password';
      toggle.textContent = 'Anzeigen';
      toggle.setAttribute('aria-pressed', 'false');
    });
  }
}

addPasswordToggles();

const root = document.querySelector('[data-page]');
pages[root?.dataset.page]?.(root);
