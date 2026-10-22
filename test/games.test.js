import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { FORBIDDEN_HOSTS, GAMES, normalizeServiceWorker, unlistedFiles } from '../lib/games.js';

const apps = JSON.parse(readFileSync(new URL('../src/data/apps.json', import.meta.url), 'utf8'));
const gameDir = (id) => new URL(`../public/games/${id}/`, import.meta.url);

test('Cache-Zeitstempel wird beim Vergleich ignoriert', () => {
  const a = "var CACHE='nova-bastion-202610201935';\nself.x=1;";
  const b = "var CACHE='nova-bastion-202611011200';\r\nself.x=1;";
  assert.equal(normalizeServiceWorker(a), normalizeServiceWorker(b));
  assert.notEqual(normalizeServiceWorker(a), normalizeServiceWorker(`${b}\nself.y=2;`));
});

test('Royal Blocks wird für den Import reproduzierbar neu gebaut', () => {
  assert.deepEqual(GAMES['royal-blocks'].buildCommand.slice(1), ['run', 'build']);
  assert.equal(GAMES['royal-blocks'].libraryIcon, 'src/icon-512.png');
  assert.equal(GAMES['royal-blocks'].serviceWorker, undefined);
});

test('neue Dateien im Build werden erkannt', () => {
  const game = { files: ['index.html', 'main.js'], ignore: ['_headers'] };
  assert.deepEqual(unlistedFiles(game, ['index.html', 'main.js', '_headers']), []);
  assert.deepEqual(unlistedFiles(game, ['index.html', 'main.js', 'platform.js', 'neu.css']), ['neu.css', 'platform.js']);
});

for (const id of Object.keys(GAMES)) {
  test(`${id}: alle importierten JS-Module des Spiels sind übernommen`, { skip: !existsSync(new URL('VERSION.json', gameDir(id))) && 'noch nicht übernommen' }, () => {
    for (const file of GAMES[id].files.filter((f) => f.endsWith('.js'))) {
      const code = readFileSync(new URL(file, gameDir(id)), 'utf8');
      for (const [, imported] of code.matchAll(/(?:from|import\()\s*['"]\.\/([\w.-]+\.js)['"]/g)) {
        assert.ok(GAMES[id].files.includes(imported), `${file} lädt ${imported}, das nicht übernommen wird`);
      }
    }
  });
}

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
