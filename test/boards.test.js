import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardLabel } from '../lib/boards.js';

test('Ranglisten-Namen werden lesbar angezeigt', () => {
  assert.equal(boardLabel('3'), 'Level 3');
  assert.equal(boardLabel('taeglich'), 'Täglich');
  assert.equal(boardLabel('klassisch'), 'Klassisch (Archiv)');
  assert.equal(boardLabel('standard'), 'Standard');
  assert.equal(boardLabel('profi'), 'Profi');
  assert.equal(boardLabel('endlos'), 'Endlos');
  assert.equal(boardLabel('tower-endless-3'), 'Tower Endless 3');
  assert.equal(boardLabel('heroic_5'), 'Heroic 5');
});
