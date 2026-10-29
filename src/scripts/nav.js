// Kopfzeile: Nach der Anmeldung steht statt „Anmelden“ das Profilbild mit Namen. Ein Klick führt zum eigenen Profil
// (so, wie andere es sehen), der Pfeil daneben öffnet ein Menü mit Bearbeiten, Einstellungen und Abmelden – wie bei Steam.
import { avatarSvg } from '../../lib/avatars.js';
import './theme.js';
import './announcements.js';

export async function currentUser() {
  if (!document.querySelector('meta[name="bg-accounts"]')) return null;
  try {
    // account/status antwortet auch Gästen mit 200 – keine roten Fehler in der Konsole.
    const response = await fetch('/api/account/status', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    return response.ok ? (await response.json()).user : null;
  } catch {
    return null;
  }
}

export const profileUrl = (name) => `/spieler/?name=${encodeURIComponent(name)}`;

const MENU = [
  ['👤', 'Mein Profil', null],
  ['✏️', 'Profil bearbeiten', '/konto/#profil'],
  ['🎮', 'Spiele & Ranglisten', '/konto/#spiele'],
  ['🔒', 'Sicherheit', '/konto/#sicherheit'],
  ['⚙️', 'Konto', '/konto/#konto'],
];

async function logout() {
  try {
    const me = await fetch('/api/account/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const { csrf } = me.ok ? await me.json() : {};
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: '{}',
    });
  } finally {
    window.location.href = '/';
  }
}

export function renderNavUser(user) {
  const link = document.querySelector('[data-account-link]');
  if (!link || !user) return;
  link.href = profileUrl(user.display_name);
  link.title = 'Mein Profil';
  link.classList.add('nav-user');
  link.innerHTML = `${avatarSvg({ avatar: user.avatar, color: user.avatar_color, name: user.display_name }, 28)}<span></span>`;
  link.querySelector('span').textContent = user.display_name;
  // Schon mit Menü (z. B. nach neuem Profilbild auf „Mein Konto“): nur den Link zum Profil auffrischen.
  const existing = link.closest('.nav-menu');
  if (existing) {
    existing.querySelector('[data-menu-profile]').href = link.href;
    return;
  }

  const wrap = document.createElement('span');
  wrap.className = 'nav-menu';
  link.replaceWith(wrap);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-menu__toggle';
  toggle.setAttribute('aria-label', 'Konto-Menü');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.textContent = '▾';
  const menu = document.createElement('div');
  menu.className = 'nav-menu__list';
  menu.hidden = true;
  for (const [icon, label, href] of MENU) {
    const item = document.createElement('a');
    item.href = href ?? profileUrl(user.display_name);
    if (!href) item.dataset.menuProfile = '';
    item.textContent = `${icon} ${label}`;
    menu.append(item);
  }
  const out = document.createElement('button');
  out.type = 'button';
  out.className = 'nav-menu__logout';
  out.textContent = '↩ Abmelden';
  out.addEventListener('click', () => { out.disabled = true; logout(); });
  menu.append(out);
  wrap.append(link, toggle, menu);

  const open = (yes) => {
    menu.hidden = !yes;
    toggle.setAttribute('aria-expanded', String(yes));
  };
  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    open(menu.hidden);
  });
  document.addEventListener('click', (event) => { if (!wrap.contains(event.target)) open(false); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') open(false); });
  // Auf derselben Seite (/konto/#…) springt ein Menüpunkt nur im Anker – Menü trotzdem schließen.
  menu.addEventListener('click', (event) => { if (event.target.closest('a')) open(false); });
}

export const userReady = currentUser().then((user) => {
  renderNavUser(user);
  return user;
});
