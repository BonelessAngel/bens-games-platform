// Kopfzeile: Nach der Anmeldung steht statt „Anmelden“ das Profilbild mit Namen (Link zu „Mein Konto“).
import { avatarSvg } from '../../lib/avatars.js';

export async function currentUser() {
  if (!document.querySelector('meta[name="bg-accounts"]')) return null;
  try {
    const response = await fetch('/api/account/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    return response.ok ? (await response.json()).user : null;
  } catch {
    return null;
  }
}

export function renderNavUser(user) {
  const link = document.querySelector('[data-account-link]');
  if (!link || !user) return;
  link.href = '/konto/';
  link.classList.add('nav-user');
  link.innerHTML = `${avatarSvg({ avatar: user.avatar, color: user.avatar_color, name: user.display_name }, 28)}<span></span>`;
  link.querySelector('span').textContent = user.display_name;
}

export const userReady = currentUser().then((user) => {
  renderNavUser(user);
  return user;
});
