import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escapeHtml, renderLibrary, validateApps, visibleApps } from '../lib/library.js';

const app = (overrides = {}) => ({
  id: 'demo',
  name: 'Demo',
  type: 'game',
  description: 'Ein Testspiel',
  icon: '/app-icons/demo.svg',
  status: 'public',
  visibility: 'all',
  version: '1.0.0',
  path: '/games/demo/',
  ...overrides,
});

test('das echte App-Verzeichnis ist gültig', () => {
  const apps = JSON.parse(readFileSync(new URL('../src/data/apps.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateApps(apps), []);
});

test('jedes Symbol im App-Verzeichnis existiert', () => {
  const apps = JSON.parse(readFileSync(new URL('../src/data/apps.json', import.meta.url), 'utf8'));
  for (const { icon } of apps) {
    assert.doesNotThrow(() => readFileSync(new URL(`../public${icon}`, import.meta.url)), `fehlt: ${icon}`);
  }
});

test('ungültige Einträge werden erkannt', () => {
  assert.equal(validateApps([app()]).length, 0);
  assert.match(validateApps([app({ id: 'Mit Leerzeichen' })]).join(), /ID nur/);
  assert.match(validateApps([app(), app()]).join(), /doppelt/);
  assert.match(validateApps([app({ type: 'film' })]).join(), /unbekannter Typ/);
  assert.match(validateApps([app({ status: 'geheim' })]).join(), /unbekannter Status/);
  assert.match(validateApps([app({ path: '/apps/demo/' })]).join(), /Pfad muss "\/games\/demo\/"/);
  assert.match(validateApps([app({ type: 'tool', path: '/games/demo/' })]).join(), /Pfad muss "\/apps\/demo\/"/);
  assert.match(validateApps([app({ icon: 'javascript:alert(1)' })]).join(), /Symbol/);
  assert.match(validateApps([app({ icon: '/icons/demo.svg' })]).join(), /Symbol/);
  assert.match(validateApps([{ id: 'x' }]).join(), /Feld "name" fehlt/);
  assert.match(validateApps({}).join(), /Liste/);
});

test('ohne Konten zeigt die Bibliothek nur öffentlich sichtbare Apps', () => {
  const apps = [
    app({ id: 'a', path: '/games/a/' }),
    app({ id: 'b', path: '/games/b/', status: 'private' }),
    app({ id: 'c', path: '/games/c/', visibility: 'signed_in' }),
    app({ id: 'd', path: '/games/d/', visibility: 'selected' }),
    app({ id: 'e', path: '/games/e/', status: 'beta' }),
  ];
  assert.deepEqual(visibleApps(apps).map((a) => a.id), ['a', 'e']);
});

test('Bibliothek trennt Spiele und Apps und zeigt Hinweise', () => {
  const html = renderLibrary([
    app(),
    app({ id: 'notizen', name: 'Notizen', type: 'tool', path: '/apps/notizen/', status: 'beta' }),
  ]);
  assert.match(html, /<h2 id="spiele"[^>]*>Spiele<\/h2>\s*<ul class="grid"><li><a class="card" href="\/games\/demo\/"/);
  assert.match(html, /<h2 id="apps"[^>]*>Apps<\/h2>\s*<ul class="grid"><li><a class="card" href="\/apps\/notizen\/"/);
  assert.match(html, /badge--beta/);
});

test('leere Bereiche zeigen einen Hinweistext', () => {
  const html = renderLibrary([app()]);
  assert.match(html, /Hier erscheinen bald Apps\./);
});

test('Apps im Wartungsmodus sind sichtbar, aber nicht verlinkt', () => {
  const html = renderLibrary([app({ status: 'maintenance' })]);
  assert.match(html, /Wartung/);
  assert.doesNotMatch(html, /href="\/games\/demo\/"/);
});

test('Texte aus dem Verzeichnis werden maskiert', () => {
  assert.equal(escapeHtml(`<script>"&'`), '&lt;script&gt;&quot;&amp;&#39;');
  const html = renderLibrary([app({ name: '<img src=x onerror=alert(1)>' })]);
  assert.doesNotMatch(html, /<img src=x/);
});
