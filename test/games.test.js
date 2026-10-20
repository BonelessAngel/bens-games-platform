import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { FORBIDDEN_HOSTS, GAMES, normalizeServiceWorker } from '../lib/games.js';

const apps = JSON.parse(readFileSync(new URL('../src/data/apps.json', import.meta.url), 'utf8'));
const gameDir = (id) => new URL(`../public/games/${id}/`, import.meta.url);

test('Cache-Zeitstempel wird beim Vergleich ignoriert', () => {
  const a = "var CACHE='nova-bastion-202610201935';\nself.x=1;";
  const b = "var CACHE='nova-bastion-202611011200';\r\nself.x=1;";
  assert.equal(normalizeServiceWorker(a), normalizeServiceWorker(b));
  assert.notEqual(normalizeServiceWorker(a), normalizeServiceWorker(`${b}\nself.y=2;`));
});

for (const id of Object.keys(GAMES)) {
  const versionFile = new URL('VERSION.json', gameDir(id));

  test(`${id}: übernommene Dateien sind vollständig und unverändert`, { skip: !existsSync(versionFile) && 'noch nicht übernommen' }, () => {
    const info = JSON.parse(readFileSync(versionFile, 'utf8'));
    assert.equal(info.id, id);
    assert.match(info.tag, /^v\d+\.\d+\.\d+$/);
    assert.match(info.commit, /^[0-9a-f]{40}$/);
    assert.deepEqual(Object.keys(info.files).sort(), [...GAMES[id].files].sort());
    for (const [file, hash] of Object.entries(info.files)) {
      const actual = createHash('sha256').update(readFileSync(new URL(file, gameDir(id)))).digest('hex');
      assert.equal(actual, hash, `${file} wurde nach der Übernahme verändert`);
    }
    assert.equal(apps.find((app) => app.id === id)?.version, info.version, 'Version in apps.json passt nicht');
  });

  test(`${id}: lädt keine Inhalte von Google oder Trackern`, { skip: !existsSync(versionFile) && 'noch nicht übernommen' }, () => {
    const html = readFileSync(new URL('index.html', gameDir(id)), 'utf8');
    assert.doesNotMatch(html, FORBIDDEN_HOSTS);
  });

  test(`${id}: Manifest zeigt auf den Plattformpfad`, { skip: !existsSync(versionFile) && 'noch nicht übernommen' }, () => {
    const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', gameDir(id)), 'utf8'));
    assert.equal(manifest.scope, `/games/${id}/`);
    assert.equal(manifest.start_url, `/games/${id}/`);
  });
}
