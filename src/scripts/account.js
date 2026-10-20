// Kontoseiten: Registrieren, Anmelden, E-Mail bestätigen, Mein Konto.
// Spricht mit der API unter /api/ auf derselben Adresse; das Sitzungs-Cookie setzt und liest nur der Server.

const MESSAGES = {
  invalid_credentials: 'E-Mail oder Passwort ist falsch.',
  email_not_verified: 'Bitte bestätige zuerst deine E-Mail-Adresse. Den Link haben wir dir per E-Mail geschickt.',
  account_locked: 'Dieses Konto ist gesperrt.',
  too_many_attempts: 'Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann erneut.',
  invalid_token: 'Dieser Link ist ungültig oder abgelaufen. Fordere bei der Anmeldung einfach einen neuen an.',
  unavailable: 'Konten sind gerade nicht verfügbar. Bitte versuche es später erneut.',
  validation: 'Bitte prüfe deine Eingaben.',
  wrong_password: 'Das Passwort ist nicht richtig.',
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
    const notice = root.querySelector('[data-notice]');
    const resend = root.querySelector('[data-resend]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      busy(form, async () => {
        const { ok, data } = await api('auth/login', { method: 'POST', body: formData(form) });
        if (ok) {
          window.location.href = '/konto/';
          return;
        }
        show(notice, MESSAGES[data.error] ?? FALLBACK);
        resend.hidden = data.error !== 'email_not_verified';
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
