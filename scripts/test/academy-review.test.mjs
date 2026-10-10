// Повторення помилок: boxes 2 → 7 → 21 days, then learned; due list per person. Certificate number is stable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextReview, dueReviews } from '../../src/data/academy/meta.js';
import { certNumber, certificateHtml } from '../../src/lib/certificate.js';

const T0 = Date.parse('2026-10-10T08:00:00Z');
test('wrong → box 1 (+2 d); right moves it on; after box 3 it is learned', () => {
  let l = nextReview([], { wrong: ['Q1', 'Q2'], right: ['Q3'] }, T0);
  assert.deepEqual(l.map((x) => [x.q, x.box, x.due]), [['Q1', 1, '2026-10-12'], ['Q2', 1, '2026-10-12']]);
  l = nextReview(l, { right: ['Q1'], wrong: [] }, T0);
  assert.deepEqual(l.find((x) => x.q === 'Q1'), { q: 'Q1', box: 2, due: '2026-10-17' });
  l = nextReview(l, { right: ['Q1'] }, T0);
  l = nextReview(l, { right: ['Q1'] }, T0);
  assert.ok(!l.some((x) => x.q === 'Q1'));
  l = nextReview(l, { wrong: ['Q2'] }, T0); // wrong again → back to box 1
  assert.equal(l.find((x) => x.q === 'Q2').box, 1);
});

test('due today across courses', () => {
  const user = { training: { osint: { review: [{ q: 'A', box: 1, due: '2026-10-10' }, { q: 'B', box: 2, due: '2026-10-20' }] }, cycle: { review: [{ q: 'C', box: 1, due: '2026-10-01' }] } } };
  assert.deepEqual(dueReviews(user, T0).map((x) => [x.course, x.q]), [['osint', 'A'], ['cycle', 'C']]);
});

test('certificate: stable number, name and dates in it', () => {
  const u = { id: 'u1', name: 'Олена Коваль' };
  const n = certNumber(u, 'osint', '2026-10-10T08:00:00Z');
  assert.equal(n, certNumber(u, 'osint', '2026-10-10T08:00:00Z'));
  assert.match(n, /^RC-ACAD-2026-[0-9A-F]{8}$/);
  const html = certificateHtml({ user: u, course: { id: 'osint', title: 'OSINT: відкриті джерела' }, result: { at: '2026-10-10T08:00:00Z', best: 90 }, grade: 'Базовий', track: 'OSINT' });
  assert.ok(html.includes('Олена Коваль') && html.includes('10 жовтня 2026') && html.includes('10 жовтня 2027') && html.includes(n));
});
