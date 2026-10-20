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

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
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

  async konto(root) {
    const { ok, data } = await api('account/me');
    if (!ok) {
      window.location.href = '/konto/anmelden/';
      return;
    }
    root.querySelector('[data-name]').textContent = data.user.display_name;
    root.querySelector('[data-email]').textContent = data.user.email;
    root.querySelector('[data-details]').hidden = false;

    const logout = root.querySelector('[data-logout]');
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      await api('auth/logout', { method: 'POST', body: {}, csrf: data.csrf });
      window.location.href = '/';
    });
  },
};

const root = document.querySelector('[data-page]');
pages[root?.dataset.page]?.(root);
