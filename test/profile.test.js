import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BANNERS, rarityOf } from '../lib/profile.js';

test('Seltenheit der Abzeichen in vier Stufen', () => {
  assert.equal(rarityOf(0.03).id, 'legendary');
  assert.equal(rarityOf(0.03).text, 'nur 3 % der Spieler');
  assert.equal(rarityOf(0.1).id, 'epic');
  assert.equal(rarityOf(0.3).id, 'rare');
  assert.equal(rarityOf(0.8).id, 'common');
  assert.equal(rarityOf(0.8).text, '80 % der Spieler');
  assert.equal(rarityOf(undefined).id, 'common', 'unbekannt gilt als gewöhnlich');
  assert.equal(rarityOf(0.001).text, 'nur 1 % der Spieler', 'nie „0 %“');
});

test('jedes Banner aus dem Server hat ein Aussehen in der Webseite', () => {
  const php = readFileSync(new URL('../api/src/Profiles.php', import.meta.url), 'utf8');
  const server = [...php.matchAll(/^\s+'([a-z]+)' => \['[^']+', '[^']+'\],/gm)].map((m) => m[1]);
  const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
  for (const id of BANNERS) {
    assert.ok(server.includes(id), `Banner ${id} fehlt in Profiles.php`);
    assert.match(css, new RegExp(`\\.banner--${id} \\{`), `Banner ${id} hat kein Aussehen`);
  }
});
