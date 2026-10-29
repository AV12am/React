// Дозволені IP: relay addresses (iCloud Private Relay) change all the time and must not be bound to a card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relayIp, ipAllowed } from '../../src/lib/ip.js';

test('iCloud Private Relay addresses are recognised', () => {
  assert.equal(relayIp('172.225.105.14'), true);
  assert.equal(relayIp('104.28.40.2'), true);
  assert.equal(relayIp('93.170.44.5'), false);
  assert.equal(relayIp('2001:db8::1'), false);
});

test('a bound relay address does not let in the next relay address', () => {
  const card = { ips: [{ ip: '172.226.3.9', note: 'iPhone' }] };
  assert.equal(ipAllowed(card, '172.225.105.14'), false);
  assert.equal(ipAllowed({ ips: [] }, '172.225.105.14'), true);
});
