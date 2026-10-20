import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Prüft die Quellen, die scripts/build-api.mjs nach dist/api/ kopiert.
const api = (path) => new URL(`../api/${path}`, import.meta.url);

test('API sperrt alles außer index.php', () => {
  const htaccess = readFileSync(api('.htaccess'), 'utf8');
  assert.match(htaccess, /RewriteRule \^ index\.php/);
  assert.match(htaccess, /<IfModule !mod_rewrite\.c>\s*Require all denied/);
});

test('keine echte Konfiguration im Repo', () => {
  assert.equal(existsSync(api('config.php')), false);
  assert.match(readFileSync(api('config.example.php'), 'utf8'), /HIER_DATENBANKPASSWORT/);
});

test('alle API-Klassen sind im Repo (nicht versehentlich ignoriert)', async () => {
  const { execFileSync } = await import('node:child_process');
  const tracked = execFileSync('git', ['ls-files', 'api/src'], { encoding: 'utf8' });
  for (const file of ['Api.php', 'Config.php', 'Database.php', 'Migrator.php', 'Response.php', 'bootstrap.php']) {
    assert.match(tracked, new RegExp(`api/src/${file.replace('.', '\\.')}`), `${file} fehlt in Git`);
  }
});

test('Build-Skript lässt Tests und Vorlage weg', () => {
  const script = readFileSync(new URL('../scripts/build-api.mjs', import.meta.url), 'utf8');
  for (const name of ['tests', 'config.example.php', 'config.php']) assert.match(script, new RegExp(`'${name.replace('.', '\\.')}'`));
});
