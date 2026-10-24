import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { achievementInfo, prettyAchievement } from '../lib/achievements.js';
import { safeLink } from '../lib/announcements.js';
import { THEME_BOOT, headTags } from '../lib/environment.js';

test('Ankündigungen: nur Links auf diese Seite oder https', () => {
  assert.equal(safeLink('/ranglisten/?spiel=royal-blocks'), '/ranglisten/?spiel=royal-blocks');
  assert.equal(safeLink('https://example.org/neu'), 'https://example.org/neu');
  for (const bad of ['javascript:alert(1)', '//fremd.example', 'http://example.org', 'https://a.b/"onmouseover=x', '', null, 42]) {
    assert.equal(safeLink(bad), null, String(bad));
  }
});

test('Erfolge: lesbare Namen und Angaben aus achievements.json', () => {
  assert.equal(prettyAchievement('stars30'), 'Stars 30');
  assert.equal(prettyAchievement('first_win'), 'First Win');
  assert.equal(prettyAchievement('laserK'), 'Laser K');
  assert.deepEqual(achievementInfo('boss', { boss: { name: 'Bossbezwinger', icon: '👑' } }), { id: 'boss', name: 'Bossbezwinger', icon: '👑' });
  assert.equal(achievementInfo('boss', { boss: { icon: '<img src=x>' } }).icon, '🏅', 'nur kurze Symbole');
  assert.equal(achievementInfo('x1', null).name, 'X 1');
});

test('Farbschema wird vor dem ersten Zeichnen gesetzt', () => {
  assert.ok(headTags('production').startsWith(THEME_BOOT));
  assert.match(THEME_BOOT, /bg-theme/);
  const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
  assert.match(css, /:root\[data-theme="light"\]/);
  assert.match(css, /:root:not\(\[data-theme="dark"\]\)/);
});

test('Spielerprofil-Seite existiert und wird gebaut', () => {
  assert.ok(existsSync(new URL('../src/spieler/index.html', import.meta.url)));
  assert.match(readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8'), /spieler\/index\.html/);
});

test('Datenschutzerklärung nennt Profile, Farbschema und Ankündigungen', () => {
  const html = readFileSync(new URL('../src/datenschutz/index.html', import.meta.url), 'utf8');
  for (const needle of ['Spielerprofil', 'bg-theme', 'bg-dismissed', 'bg-return', 'Erfolge', 'Community-Level']) {
    assert.ok(html.includes(needle), `fehlt: ${needle}`);
  }
});

test('Link zur Zentrale passt zur Webseite', async () => {
  const { adminUrl } = await import('../lib/admin-url.js');
  assert.equal(adminUrl('bens-games.de'), 'https://admin.bens-games.de/');
  assert.equal(adminUrl('www.bens-games.de'), 'https://admin.bens-games.de/');
  assert.equal(adminUrl('staging.bens-games.de'), 'https://admin-staging.bens-games.de/');
});
