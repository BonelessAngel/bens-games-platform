import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ACCOUNT_PAGES, accountNav, accountsEnabled } from '../lib/environment.js';

test('Konten gibt es vorerst nur auf Staging', () => {
  assert.equal(accountsEnabled('staging'), true);
  assert.equal(accountsEnabled('production'), false);
  assert.equal(accountNav('production'), '');
  assert.match(accountNav('staging'), /href="\/konto\/anmelden\/"/);
});

test('alle Kontoseiten existieren', () => {
  for (const path of Object.values(ACCOUNT_PAGES)) {
    assert.ok(existsSync(new URL(`../src/${path}`, import.meta.url)), path);
  }
});
