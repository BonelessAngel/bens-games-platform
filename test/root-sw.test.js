import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Führt public/sw.js mit nachgebildeter Service-Worker-Umgebung aus.
async function runActivate(cacheNames) {
  const remaining = new Set(cacheNames);
  const listeners = {};
  let unregistered = false;
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    registration: { unregister: async () => { unregistered = true; return true; } },
  };
  const caches = {
    keys: async () => [...remaining],
    delete: async (key) => remaining.delete(key),
  };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, caches });

  let pending;
  listeners.activate({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  return { remaining: [...remaining].sort(), unregistered };
}

test('alter Root-Service-Worker räumt nur alte Nova-Bastion-Caches ab und meldet sich ab', async () => {
  const { remaining, unregistered } = await runActivate([
    'nova-bastion-202610192021', // alte Live-Version an der Domain-Wurzel
    'nova-bastion-202609011200', // noch ältere Version
    'nova-bastion-202610201935', // neue Version unter /games/nova-bastion/
    'nova-bastion-202611011200', // spätere neue Version
    'andere-app-v1',             // fremder Cache
  ]);
  assert.deepEqual(remaining, ['andere-app-v1', 'nova-bastion-202610201935', 'nova-bastion-202611011200']);
  assert.equal(unregistered, true);
});

test('ohne alte Caches meldet er sich trotzdem ab', async () => {
  const { remaining, unregistered } = await runActivate([]);
  assert.deepEqual(remaining, []);
  assert.equal(unregistered, true);
});
