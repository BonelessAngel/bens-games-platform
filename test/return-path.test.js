import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeReturnPath } from '../lib/return-path.js';

test('nach der Anmeldung zurück ins Spiel', () => {
  assert.equal(safeReturnPath('?zurueck=/games/nova-bastion/'), '/games/nova-bastion/');
  assert.equal(safeReturnPath('?zurueck=%2Fgames%2Fnova-bastion%2F'), '/games/nova-bastion/');
});

test('fremde oder seltsame Ziele führen zu „Mein Konto“', () => {
  for (const bad of ['', '?zurueck=', '?zurueck=https://boese.example', '?zurueck=//boese.example', '?zurueck=/\\boese.example',
    '?zurueck=javascript:alert(1)', '?zurueck=/../etc', '?zurueck=games/x', '?zurueck=/a?b=c']) {
    assert.equal(safeReturnPath(bad), '/konto/', bad);
  }
});
