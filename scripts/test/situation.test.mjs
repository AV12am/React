// SITUATION: dashboards from templates, the widgets' numbers from what a person may see, rearranging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, METRICS, newBoard, boardsFor, scope, compute, moveWidget, placeWidget, resizeWidget, removeWidget, addWidget } from '../../src/lib/situation.js';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const me = { id: 'u1', clearance: 1 };
const state = {
  users: [{ id: 'u1', name: 'Артем', status: 'active' }, { id: 'u2', name: 'Оля', status: 'active' }],
  records: [
    { id: 'r1', div: 'prj', col: 'projects', name: 'Карта', state: 'Триває', lead: 'u1', at: day(3), clearance: 0 },
    { id: 'r2', div: 'prj', col: 'projects', name: 'Звіт', state: 'Завершено', at: day(40), clearance: 0 },
    { id: 'r3', div: 'int', col: 'sources', title: 'Джерело', at: day(5), clearance: 1, outcome: 'Відкрито' },
    { id: 'r4', div: 'int', col: 'sources', title: 'Закрите', at: day(2), clearance: 2 },
  ],
  tasks: [
    { id: 't1', title: 'Перевірити', assignee: 'u2', due: '2026-11-01', status: 'open', target: 'r1' },
    { id: 't2', title: 'Написати', assignee: 'u2', due: '2026-11-10', status: 'open' },
    { id: 't3', title: 'Зроблено', assignee: 'u1', status: 'done', updated: day(1) },
  ],
  audit: [{ id: 'a1', at: day(1), text: 'x' }, { id: 'a2', at: day(60), text: 'y' }],
};

test('every template builds widgets the catalog knows', () => {
  for (const t of TEMPLATES) for (const w of t.widgets()) assert.ok(METRICS[w.metric], `${t.id}: ${w.metric}`);
  const b = newBoard('exec', me);
  assert.equal(b.name, 'Огляд керівника');
  assert.equal(b.owner, 'u1');
  assert.ok(b.widgets.length >= 6);
});

test('numbers come only from what the person may see, within the period', () => {
  const s = scope(state, me, { days: 30 }, NOW);
  assert.equal(compute('records.total', s).value, 3); // r4 is above the clearance
  assert.deepEqual(compute('records.new', s), { value: 2, delta: 1, note: 'попередній період: 1' }); // r2 is 40 days old: the period before
  assert.equal(compute('tasks.open', s).value, 2);
  assert.equal(compute('tasks.overdue', s).value, 1);
  assert.equal(compute('tasks.done', s).value, 1);
  assert.equal(compute('projects.active', s).value, 1);
  assert.equal(compute('forecasts.open', s).value, 1);
  assert.equal(compute('audit.events', s).value, 1);
  assert.equal(compute('tasks.byAssignee', s).rows[0].label, 'Оля');
  const up = compute('tasks.upcoming', s);
  assert.equal(up.rows[0].late, true);
  assert.deepEqual(up.rows[0].to, { div: 'prj', id: 'projects:r1' });
  assert.equal(compute('records.byWeek', s).data.length, 12);
});

test('a division filter narrows every widget', () => {
  const s = scope(state, me, { days: 30, div: 'prj' }, NOW);
  assert.equal(compute('records.total', s).value, 2);
  assert.deepEqual(compute('records.byDivision', s).rows.map((r) => r.id), ['prj']);
});

test('widgets are moved, placed, resized and removed', () => {
  let b = newBoard('blank', me);
  b = addWidget(addWidget(addWidget(b, 'tasks.open'), 'records.byWeek'), 'audit.recent');
  const [a, c, d] = b.widgets.map((x) => x.id);
  assert.equal(b.widgets[0].w, 3);
  assert.deepEqual(moveWidget(b, c, -1).widgets.map((x) => x.id), [c, a, d]);
  assert.deepEqual(placeWidget(b, d, a).widgets.map((x) => x.id), [d, a, c]);
  assert.equal(resizeWidget(b, a).widgets[0].w, 4);
  assert.equal(removeWidget(b, a).widgets.length, 2);
});

test('a person sees their own dashboards and the shared ones within their clearance', () => {
  const boards = [{ id: 'b1', owner: 'u1', at: '1' }, { id: 'b2', owner: 'u2', shared: true, at: '2' }, { id: 'b3', owner: 'u2', at: '3' }, { id: 'b4', owner: 'u2', shared: true, clearance: 2, at: '4' }];
  assert.deepEqual(boardsFor(boards, me).map((b) => b.id), ['b1', 'b2']);
});
