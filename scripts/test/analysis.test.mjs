// «Звідки ми це знаємо» flags and forecast scoring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasonsFor, needsReview, usedBy, reviewQueue } from '../../src/lib/provenance.js';
import { brier, skill, calibration, overconfidence, wordFor, byAnalyst, summary } from '../../src/lib/forecast.js';

const me = { id: 'u1', clearance: 1 };
const T = (h) => `2026-09-01T${String(h).padStart(2, '0')}:00:00.000Z`;
const src = { id: 's1', div: 'int', col: 'sources', name: 'Джерело-7', reliability: 'B — зазвичай надійне', clearance: 1, updated: T(1) };
const nox = { id: 's2', div: 'int', col: 'sources', name: 'Таємне', reliability: 'A — повністю надійне', clearance: 2, updated: T(1) };
const intake = { id: 'i1', div: 'int', col: 'intake', title: 'Звіт про порт', source: 's1', credibility: '2 — імовірно правдиве', clearance: 1, updated: T(1) };
const j = { id: 'j1', div: 'ana', col: 'judgments', statement: 'Порт закриють', kind: 'Оцінка', probability: 70, basis: ['i1', 's2'], clearance: 1, updated: T(5) };

test('fresh chain: nothing to review', () => {
  assert.deepEqual(reasonsFor(j, [src, nox, intake, j], me), []);
});

test('regraded source flags the judgment; a review clears it; the weak grade stays as a warning', () => {
  const regraded = { ...src, reliability: 'E — ненадійне', updated: T(7) };
  const all = [regraded, nox, intake, j];
  const r = reasonsFor(j, all, me);
  assert.ok(r.some((x) => x.kind === 'review' && /Переоцінено джерело «Джерело-7»/.test(x.text)));
  assert.ok(r.some((x) => x.kind === 'warn' && /Ненадійне джерело/.test(x.text)));
  const reviewed = { ...j, updated: T(9) };
  assert.equal(needsReview(reviewed, [regraded, nox, intake, reviewed], me), false);
  assert.ok(reasonsFor(reviewed, [regraded, nox, intake, reviewed], me).some((x) => x.kind === 'warn'));
});

test('a change above the reader\'s clearance is flagged without naming it', () => {
  const changed = { ...nox, name: 'Таємне ім’я', updated: T(8) };
  const r = reasonsFor(j, [src, changed, intake, j], me);
  assert.ok(r.some((x) => x.kind === 'review' && x.text === 'Змінено підставу вищого грифа'));
  assert.ok(!JSON.stringify(r).includes('Таємне'));
});

test('deleted basis and observed indicator', () => {
  const ind = { id: 'n1', div: 'ana', col: 'indicators', name: 'Оголошено тендер', judgment: 'j1', effect: 'Підтримує судження', state: 'Спостерігається', clearance: 1, updated: T(10) };
  const r = reasonsFor(j, [src, nox, j, ind], me);
  assert.ok(r.some((x) => x.text === 'Підставу видалено'));
  assert.ok(r.some((x) => /Спрацював індикатор «Оголошено тендер» — підтримує судження/.test(x.text)));
});

test('product inherits its judgments\' review reasons; usedBy follows sources through intake', () => {
  const p = { id: 'p1', div: 'ana', col: 'products', title: 'Оцінка порту', clearance: 1, updated: T(5) };
  const jj = { ...j, product: 'p1' };
  const regraded = { ...src, updated: T(7) };
  const all = [regraded, nox, intake, jj, p];
  assert.ok(needsReview(p, all, me));
  assert.deepEqual(usedBy('s1', all).map((r) => r.id), ['j1']);
  assert.equal(reviewQueue(all, me).length, 2);
});

test('forecast due date asks for an outcome', () => {
  const f = { ...j, kind: 'Прогноз', due: '2020-01-01', outcome: 'Відкрито', basis: [] };
  assert.ok(reasonsFor(f, [f], me).some((x) => /Настала дата перевірки/.test(x.text)));
});

test('Brier, skill, calibration', () => {
  const F = (p, o, a = 'u1') => ({ col: 'judgments', kind: 'Прогноз', probability: p, outcome: o, analyst: a });
  const list = [F(90, 'Сталося'), F(80, 'Сталося'), F(70, 'Не сталося'), F(20, 'Не сталося'), F(50, 'Скасовано')];
  const b = (0.01 + 0.04 + 0.49 + 0.04) / 4;
  assert.ok(Math.abs(brier(list) - b) < 1e-9);
  assert.ok(Math.abs(skill(brier(list)) - (1 - b / 0.25)) < 1e-9);
  const cal = calibration(list);
  assert.equal(cal[9].n, 1); assert.equal(cal[9].freq, 1);
  assert.equal(cal[7].n, 1); assert.equal(cal[7].freq, 0);
  assert.equal(brier([F(50, 'Відкрито')]), null);
  assert.equal(byAnalyst(list)[0].resolved, 4);
  assert.equal(summary(list).resolved, 4);
});

test('over-confidence sign', () => {
  const F = (p, o) => ({ col: 'judgments', kind: 'Прогноз', probability: p, outcome: o });
  const tooSure = Array.from({ length: 10 }, (_, i) => F(95, i < 6 ? 'Сталося' : 'Не сталося'));
  const tooShy = Array.from({ length: 10 }, () => F(60, 'Сталося'));
  assert.ok(overconfidence(tooSure) > 0.2);
  assert.ok(overconfidence(tooShy) < -0.2);
});

test('estimative words', () => {
  assert.equal(wordFor(3), 'майже неможливо');
  assert.equal(wordFor(50), 'приблизно рівні шанси');
  assert.equal(wordFor(70), 'ймовірно');
  assert.equal(wordFor(99), 'майже напевно');
});
