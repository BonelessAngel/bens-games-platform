import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoPlaceholders, environmentBanner, headTags, robotsTxt } from '../lib/environment.js';

test('Staging wird nicht von Suchmaschinen erfasst', () => {
  assert.match(robotsTxt('staging'), /Disallow: \//);
  assert.match(headTags('staging'), /noindex/);
  assert.match(headTags('staging'), /bg-accounts/);
  assert.match(environmentBanner('staging'), /Testumgebung/);
});

test('Produktion ist für Suchmaschinen offen und ohne Test-Hinweis', () => {
  assert.doesNotMatch(robotsTxt('production'), /Disallow/);
  assert.doesNotMatch(headTags('production'), /noindex/);
  assert.match(headTags('production'), /bg-accounts/);
  assert.equal(environmentBanner('production'), '');
});

test('Produktions-Build bricht bei Platzhaltern ab, Staging nicht', () => {
  const html = '<p>[AUSFÜLLEN: Name]</p>';
  assert.throws(() => assertNoPlaceholders(html, 'impressum', 'production'), /Platzhalter/);
  assert.doesNotThrow(() => assertNoPlaceholders(html, 'impressum', 'staging'));
  assert.doesNotThrow(() => assertNoPlaceholders('<p>Ben</p>', 'impressum', 'production'));
});
