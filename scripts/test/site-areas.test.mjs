// The public product areas: SITUATION's widget data and saved state, CONTEXT's forecast record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeries, parseTable, parsePlaces, parseLinks, readState, TEMPLATES } from '../../src/lib/dash.js';
import { visibleForecasts, trackRecord, brier, elapsed } from '../../src/lib/forecasts.js';

test('series: label, value; non-numbers and comments skipped', () => {
  assert.deepEqual(parseSeries('# months\n2026-01, 4.2\nJan 2026, 5\nbroken line\nPoland; 3,1'), [
    { label: '2026-01', value: 4.2 }, { label: 'Jan 2026', value: 5 }, { label: 'Poland', value: 3.1 },
  ]);
});

test('table: header first, short rows padded', () => {
  assert.deepEqual(parseTable('A, B, C\n1, 2\n3, 4, 5'), { head: ['A', 'B', 'C'], rows: [['1', '2', ''], ['3', '4', '5']] });
});

test('places: only real coordinates', () => {
  const p = parsePlaces('Kyiv, 50.45, 30.52, 12\nNowhere, 120, 30\nLviv, 49.84, 24.03');
  assert.equal(p.length, 2);
  assert.equal(p[1].value, null);
});

test('links: arrows or commas, degree per node', () => {
  const g = parseLinks('A -> B\nA → C\nB, C');
  assert.equal(g.edges.length, 3);
  assert.deepEqual(g.nodes.find((n) => n.id === 'A'), { id: 'A', n: 2 });
});

test('saved state: malformed input gives an empty state; unknown widgets dropped', () => {
  assert.deepEqual(readState('{not json'), { v: 1, boards: [], current: null });
  const s = readState({ boards: [{ id: 'x', name: 'N', widgets: [{ type: 'kpi', size: 9, data: { value: 5 } }, { type: 'evil' }] }], current: 'x' });
  assert.equal(s.boards[0].widgets.length, 1);
  assert.equal(s.boards[0].widgets[0].size, 1);
  assert.equal(s.boards[0].widgets[0].data.value, '5');
});

test('templates are marked as examples and survive a save', () => {
  for (const make of Object.values(TEMPLATES)) {
    const b = make();
    assert.equal(b.sample, true);
    assert.equal(readState({ boards: [b] }).boards[0].widgets.length, b.widgets.length);
  }
});

test('forecasts: drafts hidden unless asked; record and Brier', () => {
  const list = [
    { id: 'a', p: 0.8, published: '2026-01-01', check: '2026-06-01', status: 'happened' },
    { id: 'b', p: 0.3, published: '2026-02-01', check: '2026-07-01', status: 'not' },
    { id: 'c', p: 0.5, published: '2026-03-01', check: '2026-12-01', status: 'open', draft: true },
  ];
  assert.deepEqual(visibleForecasts(list).map((f) => f.id), ['b', 'a']);
  assert.equal(visibleForecasts(list, true).length, 3);
  assert.ok(Math.abs(brier(list[0]) - 0.04) < 1e-9);
  const r = trackRecord(visibleForecasts(list));
  assert.equal(r.resolved, 2);
  assert.ok(Math.abs(r.brier - (0.04 + 0.09) / 2) < 1e-9);
  assert.equal(elapsed(list[0], Date.parse('2027-01-01')), 1);
});
