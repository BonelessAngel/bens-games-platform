// Ankündigungen aus der Zentrale als Leiste unter der Kopfzeile. Weggeklickte merkt sich nur dieser Browser
// (localStorage „bg-dismissed“, nur die Nummern der Ankündigungen).
import { safeLink } from '../../lib/announcements.js';

const KEY = 'bg-dismissed';

function dismissed() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

function dismiss(id) {
  try {
    // Nur die letzten 50 behalten, damit die Liste nicht endlos wächst.
    localStorage.setItem(KEY, JSON.stringify([...dismissed().filter((x) => x !== id), id].slice(-50)));
  } catch {
    // ohne Speicher erscheint die Ankündigung beim nächsten Besuch wieder
  }
}

function render(items) {
  const header = document.querySelector('.site-header');
  if (!header || items.length === 0) return;
  const box = document.createElement('div');
  box.className = 'announcements container';
  for (const item of items) {
    const bar = document.createElement('section');
    bar.className = `announcement announcement--${item.level}`;
    bar.setAttribute('aria-label', 'Ankündigung');
    const text = document.createElement('div');
    text.className = 'announcement__text';
    const title = document.createElement('strong');
    title.textContent = item.title;
    text.append(title);
    if (item.body) {
      const body = document.createElement('span');
      body.textContent = item.body;
      text.append(body);
    }
    const href = safeLink(item.link);
    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = 'Mehr erfahren';
      if (href.startsWith('https://')) link.rel = 'noopener';
      text.append(link);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'announcement__close';
    close.setAttribute('aria-label', 'Ankündigung ausblenden');
    close.textContent = '×';
    close.addEventListener('click', () => {
      dismiss(item.id);
      bar.remove();
      if (!box.children.length) box.remove();
    });
    bar.append(text, close);
    box.append(bar);
  }
  header.after(box);
}

if (document.querySelector('meta[name="bg-accounts"]')) {
  fetch('/api/announcements', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const hidden = new Set(dismissed());
      render((data?.announcements ?? []).filter((a) => !hidden.has(a.id)));
    })
    .catch(() => {
      // Ohne API einfach keine Ankündigungen.
    });
}
