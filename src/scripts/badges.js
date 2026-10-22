// Erfolge als Abzeichen (Spielerprofil und „Mein Konto“).
import { achievementInfo, loadAchievementNames } from '../../lib/achievements.js';

/** Abzeichen-Liste für ein Spiel (mit Namen aus achievements.json, falls das Spiel eine mitliefert). */
export async function badgeList(gameId, ids) {
  const names = await loadAchievementNames(gameId);
  const list = document.createElement('ul');
  list.className = 'badges';
  for (const id of ids) {
    const info = achievementInfo(id, names);
    const badge = document.createElement('li');
    badge.className = 'achievement';
    badge.title = info.name;
    const icon = document.createElement('span');
    icon.className = 'achievement__icon';
    icon.textContent = info.icon;
    const label = document.createElement('span');
    label.className = 'achievement__name';
    label.textContent = info.name;
    badge.append(icon, label);
    list.append(badge);
  }
  return list;
}
