import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillImpressum, impressumErrors } from '../lib/impressum.js';
import { assertNoPlaceholders } from '../lib/environment.js';

const template = '<p>{{IMPRESSUM_NAME}}<br>{{IMPRESSUM_ADDRESS}}</p><p>{{IMPRESSUM_EMAIL}}</p>';
const complete = {
  IMPRESSUM_NAME: 'Erika Muster',
  IMPRESSUM_ADDRESS: 'c/o Adressdienst\nBeispielweg 1\n12345 Beispielstadt\nDeutschland',
  IMPRESSUM_EMAIL: 'kontakt@example.org',
};

test('vollständige Angaben werden eingesetzt', () => {
  const html = fillImpressum(template, complete);
  assert.match(html, /Erika Muster/);
  assert.match(html, /c\/o Adressdienst<br>\s*Beispielweg 1<br>\s*12345 Beispielstadt<br>\s*Deutschland/);
  assert.match(html, /<a href="mailto:kontakt@example.org">kontakt@example.org<\/a>/);
  assert.doesNotMatch(html, /\{\{|AUSFÜLLEN/);
  assert.doesNotThrow(() => assertNoPlaceholders(html, 'impressum', 'production'));
});

test('fehlende Angaben werden zu Platzhaltern und stoppen die Produktion', () => {
  const html = fillImpressum(template, { IMPRESSUM_NAME: 'Erika Muster' });
  assert.match(html, /\[AUSFÜLLEN: Anschrift/);
  assert.match(html, /\[AUSFÜLLEN: E-Mail/);
  assert.throws(() => assertNoPlaceholders(html, 'impressum', 'production'));
  assert.doesNotThrow(() => assertNoPlaceholders(html, 'impressum', 'staging'));
});

test('leere oder ungültige Werte zählen als fehlend', () => {
  assert.equal(impressumErrors(complete).length, 0);
  assert.match(impressumErrors({ ...complete, IMPRESSUM_NAME: '   ' }).join(), /IMPRESSUM_NAME fehlt/);
  assert.match(impressumErrors({ ...complete, IMPRESSUM_EMAIL: 'keine-mail' }).join(), /keine gültige/);
  assert.match(fillImpressum(template, { ...complete, IMPRESSUM_EMAIL: 'keine-mail' }), /\[AUSFÜLLEN: E-Mail/);
});

test('Angaben werden maskiert', () => {
  const html = fillImpressum(template, { ...complete, IMPRESSUM_NAME: '<script>x</script>' });
  assert.doesNotMatch(html, /<script>/);
});
