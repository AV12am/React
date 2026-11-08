// Careers form: the checks shared by the browser and the server, and the letter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkApplication, applicationMail, isBot } from '../../src/lib/apply.js';

const GOOD = { kind: 'expert', name: 'Olena K.', email: 'Olena@Example.com', area: 'Forecasting', expertise: 'Energy markets', link: 'https://example.com/cv', message: 'Ten years of energy-market analysis, open to project work.', consent: true };

test('a complete request passes and is cleaned', () => {
  const r = checkApplication(GOOD);
  assert.equal(r.ok, true);
  assert.equal(r.value.email, 'olena@example.com');
});

test('missing or wrong fields are named', () => {
  const r = checkApplication({ ...GOOD, kind: 'intern', email: 'nope', area: 'Spying', link: 'ftp://x', message: 'short', consent: false });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['area', 'consent', 'email', 'kind', 'link', 'message']);
});

test('the link is optional; control characters and overlong text are cut', () => {
  const r = checkApplication({ ...GOOD, link: '', name: `A\u0007${'b'.repeat(500)}` });
  assert.equal(r.ok, true);
  assert.equal(r.value.name.length, 120);
  assert.ok(!r.value.name.includes('\u0007'));
});

test('the hidden field catches robots', () => {
  assert.equal(isBot({ website: 'http://spam' }), true);
  assert.equal(isBot({}), false);
});

test('the letter escapes what the person typed', () => {
  const m = applicationMail(checkApplication({ ...GOOD, message: 'I know <script>alert(1)</script> well enough.' }).value);
  assert.match(m.subject, /Expert collaboration · Olena K\./);
  assert.ok(!m.html.includes('<script>'));
  assert.match(m.text, /Area: Forecasting/);
});
