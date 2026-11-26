// The account mark on the public site (src/site/account.js): the name and initial from the provider's profile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whoOf } from '../../src/site/account.js';

test('account: name and initial from the profile', () => {
  assert.deepEqual(whoOf({ user: { email: 'anna@x.ua', user_metadata: { full_name: 'Анна Коваль', avatar_url: 'https://lh3.googleusercontent.com/a/x' } } }), { name: 'Анна Коваль', email: 'anna@x.ua', letter: 'А', first: 'Анна', picture: 'https://lh3.googleusercontent.com/a/x' });
  assert.deepEqual(whoOf({ user: { email: 'bob@x.io', user_metadata: { picture: 'javascript:alert(1)' } } }), { name: '', email: 'bob@x.io', letter: 'B', first: 'bob', picture: '' });
  assert.deepEqual(whoOf(null), { name: '', email: '', letter: '', first: '', picture: '' });
});
