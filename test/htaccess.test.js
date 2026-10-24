import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEGIN, END, mergeHtaccess } from '../scripts/merge-htaccess.mjs';

const kas = 'AuthType Basic\nAuthName "Geschuetzt"\nAuthUserFile /www/htdocs/w0000/.htpasswd\nrequire valid-user\n';

test('Block wird angehängt, der Verzeichnisschutz bleibt unverändert', () => {
  const out = mergeHtaccess(kas, 'Header always set X-Frame-Options "DENY"');
  assert.ok(out.startsWith(kas.trimEnd()));
  assert.ok(out.includes(`${BEGIN}\nHeader always set X-Frame-Options "DENY"\n${END}`));
});

test('Erneutes Deploy ersetzt nur den eigenen Block, ohne ihn zu verdoppeln', () => {
  const once = mergeHtaccess(kas, 'Header A');
  const twice = mergeHtaccess(once, 'Header B');
  assert.equal(twice.split(BEGIN).length - 1, 1);
  assert.ok(twice.includes('Header B') && !twice.includes('Header A'));
  assert.ok(twice.startsWith(kas.trimEnd()));
});

test('Ohne bestehende Datei entsteht nur der Block', () => {
  assert.equal(mergeHtaccess('', 'X'), `${BEGIN}\nX\n${END}\n`);
});

test('Webseite und Zentrale haben die wichtigsten Sicherheits-Kopfzeilen', () => {
  const site = readFileSync(new URL('../deploy/htaccess-site.conf', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../deploy/htaccess-admin.conf', import.meta.url), 'utf8');
  for (const h of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'frame-ancestors']) {
    assert.ok(site.includes(h), `Webseite: ${h}`);
    assert.ok(admin.includes(h), `Zentrale: ${h}`);
  }
  assert.match(site, /ErrorDocument 404 \/404\.html/);
  assert.match(admin, /X-Frame-Options "DENY"/);
});
