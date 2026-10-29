// Kopfzeile: Nach der Anmeldung steht statt „Anmelden“ das Profilbild mit Namen. Ein Klick zeigt das eigene Profil
// so, wie andere es sehen (wie bei Steam); von dort geht es mit „Einstellungen“ weiter zum Bearbeiten.
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

export function renderNavUser(user) {
  const link = document.querySelector('[data-account-link]');
  if (!link || !user) return;
  link.href = profileUrl(user.display_name);
  link.title = 'Mein Profil';
  link.classList.add('nav-user');
  link.innerHTML = `${avatarSvg({ avatar: user.avatar, color: user.avatar_color, name: user.display_name }, 28)}<span></span>`;
  link.querySelector('span').textContent = user.display_name;
}

export const userReady = currentUser().then((user) => {
  renderNavUser(user);
  return user;
});
