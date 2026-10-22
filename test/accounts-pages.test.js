import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ACCOUNT_PAGES, accountNav, accountsEnabled } from '../lib/environment.js';

test('Konten sind in allen Umgebungen eingeschaltet', () => {
  assert.equal(accountsEnabled('staging'), true);
  assert.equal(accountsEnabled('production'), true);
  assert.match(accountNav('production'), /href="\/konto\/anmelden\/"/);
});

test('alle Kontoseiten existieren', () => {
  for (const path of Object.values(ACCOUNT_PAGES)) {
    assert.ok(existsSync(new URL(`../src/${path}`, import.meta.url)), path);
  }
});

test('Datenschutzerklärung beschreibt Konten, Cookie und Fristen', () => {
  const html = readFileSync(new URL('../src/datenschutz/index.html', import.meta.url), 'utf8');
  for (const needle of ['__Host-bg_session', '90 Tage', '7 Tage', 'Zwei-Faktor', 'Konto löschen', 'Art. 6 Abs. 1 lit. b', 'Spielstände', 'Spielstatistik', 'Ranglisten', '8 Wochen']) {
    assert.ok(html.includes(needle), `fehlt: ${needle}`);
  }
});

test('Produktions-Deploy bricht ohne Datenbank-Schlüssel ab', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');
  assert.match(workflow, /PRODUCTION_MIGRATION_TOKEN fehlt[^\n]*\n\s*exit 1/);
});
