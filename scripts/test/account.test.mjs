// The account mark on the public site (src/site/account.js): the name and initial from the provider's profile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whoOf } from '../../src/site/account.js';

test('account: name and initial from the profile', () => {
  assert.deepEqual(whoOf({ user: { email: 'anna@x.ua', user_metadata: { full_name: 'Анна Коваль' } } }), { name: 'Анна Коваль', email: 'anna@x.ua', letter: 'А' });
  assert.deepEqual(whoOf({ user: { email: 'bob@x.io', user_metadata: {} } }), { name: '', email: 'bob@x.io', letter: 'B' });
  assert.deepEqual(whoOf(null), { name: '', email: '', letter: '' });
});
