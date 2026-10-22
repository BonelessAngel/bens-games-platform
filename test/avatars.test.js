import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AVATAR_COLORS, AVATARS, avatarSvg, defaultColor } from '../lib/avatars.js';

const php = readFileSync(new URL('../api/src/Avatars.php', import.meta.url), 'utf8');
const phpList = (name) => [...php.match(new RegExp(`const ${name} = \\[([^\\]]+)\\]`))[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

test('Avatar-Listen in PHP und JavaScript stimmen überein', () => {
  assert.deepEqual(phpList('AVATARS'), AVATARS.map((a) => a.id));
  assert.deepEqual(phpList('COLORS'), AVATAR_COLORS.map((c) => c.id));
});

test('Avatare sind eindeutig und enthalten nur Zeichenbefehle', () => {
  assert.equal(new Set(AVATARS.map((a) => a.id)).size, AVATARS.length);
  for (const avatar of AVATARS) {
    assert.doesNotMatch(avatar.svg, /<script|on\w+=|href/i, avatar.id);
  }
});

test('ohne Avatar: Anfangsbuchstabe, Namen werden maskiert', () => {
  assert.match(avatarSvg({ name: 'anna' }), />A<\/text>/);
  assert.doesNotMatch(avatarSvg({ name: '<b>x' }), /<b>/);
  assert.equal(defaultColor('Ben'), defaultColor('Ben'));
  assert.match(avatarSvg({ avatar: 'crown', color: 'amber' }), /#f59e0b/);
  assert.match(avatarSvg({ avatar: 'gibt-es-nicht', name: 'Max' }), />M<\/text>/);
});

test('Profilbilder als eigene SVG-Dateien für Spiele', async () => {
  const { avatarFiles } = await import('../lib/avatars.js');
  const files = avatarFiles();
  assert.equal(files.length, AVATARS.length * AVATAR_COLORS.length);
  assert.ok(files.some((f) => f.fileName === 'avatars/fox-amber.svg'));
  for (const file of files) assert.match(file.source, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
});
