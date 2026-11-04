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
  for (const t of TEMPLATES) for (const w of t.widgets()) assert.ok(METRICS[w.metric] || (w.metric === 'custom' && w.cfg?.visual), `${t.id}: ${w.metric}`);
  const b = newBoard('exec', me);
  assert.equal(b.name, 'Огляд керівника');
  assert.equal(b.owner, 'u1');
  assert.ok(b.widgets.length >= 6);
});

test('numbers come only from what the person may see, within the period', () => {
  const s = scope(state, me, { days: 30 }, NOW);
  assert.equal(compute('records.total', s).value, 3); // r4 is above the clearance
  assert.deepEqual({ ...compute('records.new', s), spark: undefined }, { value: 2, delta: 1, note: 'попередній період: 1', spark: undefined });
  assert.equal(compute('records.new', s).spark.length, 12); // r2 is 40 days old: the period before
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

test('the BI charts get their shapes: stacked columns by division, three lines, task states, on-time share, a weekday × hour map', () => {
  const s = scope(state, me, { days: 30 }, NOW);
  const cols = compute('records.byWeekDiv', s);
  assert.equal(cols.labels.length, 12);
  assert.ok(cols.series.find((x) => x.label === 'Проєкти'));
  assert.equal(compute('work.lines', s).series.length, 3);
  assert.deepEqual(compute('tasks.status', s).rows.map((r) => r.value), [1, 1, 0, 1]);
  const rate = compute('tasks.rate', s);
  assert.equal(rate.value, 0); // t1 was due on Nov 1 and is still open
  const heat = compute('audit.heat', s).cells;
  assert.equal(heat.length, 7);
  assert.equal(heat.flat().reduce((a, b) => a + b, 0), 1);
});

test('the widget editor: any source, grouped, summed, by week; a table of one’s own with its types guessed', async () => {
  const { computeCustom, datasetFrom, sourcesOf, fieldsOf, defaultCfg } = await import('../../src/lib/situation-custom.js');
  const ds = datasetFrom('Витрати', ['Дата', 'Стаття', 'Сума', 'lat', 'lon'], [
    ['01.11.2026', 'Оренда', '1200', '50.45', '30.52'], ['02.11.2026', 'Зв’язок', '300,5', '49.84', '24.03'], ['15.10.2026', 'Оренда', '1200', '', ''],
  ], me);
  assert.deepEqual(ds.columns.map((c) => c.type), ['date', 'select', 'number', 'number', 'number']);
  const st = { ...state, datasets: [ds] };
  assert.ok(sourcesOf(st, me).some((x) => x.id === `ds:${ds.id}`));
  assert.equal(fieldsOf(`ds:${ds.id}`, st).length, 5);
  const base = { source: `ds:${ds.id}`, group: 'c1', measure: 'sum', field: 'c2', time: 'c0' };
  assert.deepEqual(computeCustom({ ...base, visual: 'bars' }, st, me, { days: 30 }, NOW).rows, [{ id: 'Оренда', label: 'Оренда', value: 2400 }, { id: 'Зв’язок', label: 'Зв’язок', value: 300.5 }]);
  const kpi = computeCustom({ ...base, visual: 'kpi' }, st, me, { days: 7 }, NOW);
  assert.equal(kpi.value, 1500.5);
  assert.equal(computeCustom({ ...base, visual: 'columns' }, st, me, { days: 30 }, NOW).series.length, 2);
  assert.equal(computeCustom({ ...base, visual: 'map' }, st, me, { days: 30 }, NOW).points.length, 2);
  const tasks = computeCustom({ ...defaultCfg('tasks', st), visual: 'donut', group: 'status', time: '' }, st, me, { days: 90 }, NOW);
  assert.deepEqual(tasks.rows.map((r) => r.label).sort(), ['Виконано', 'Відкрито']);
});

test('the link chart: records and the records their «basis» points to', async () => {
  const { computeCustom } = await import('../../src/lib/situation-custom.js');
  const st = { ...state, records: [
    { id: 'p1', div: 'ana', col: 'products', title: 'Оцінка', basis: ['int:intake:i1', 'int:sources:s1'], at: day(2), clearance: 0 },
    { id: 'i1', div: 'int', col: 'intake', title: 'Надходження', at: day(3), clearance: 0 },
    { id: 's1', div: 'int', col: 'sources', title: 'Джерело', at: day(3), clearance: 2 },
  ] };
  const g = computeCustom({ source: 'records', visual: 'graph' }, st, me, { days: 30 }, NOW);
  assert.deepEqual(g.nodes.map((n) => n.id).sort(), ['i1', 'p1']); // s1 is above the clearance
  assert.equal(g.edges.length, 1);
});

test('outside sources and the cross-filter: companies by sector, a picked value narrows every widget that has the field', async () => {
  const { computeCustom, defaultCfg, drillRows, toCsv, extKey } = await import('../../src/lib/situation-custom.js');
  const st = { ...state, ext: { 'wb:NY.GDP.MKTP.KD.ZG:UKR;POL': [
    { country: 'Україна', date: '2022-07-01', value: -28.8 }, { country: 'Україна', date: '2023-07-01', value: 5.3 }, { country: 'Польща', date: '2023-07-01', value: 0.2 },
  ] } };
  const orgs = computeCustom({ ...defaultCfg('ext:orgs', st), visual: 'bars' }, st, me, { days: 30 }, NOW);
  assert.ok(orgs.rows.length > 3 && orgs.rows.at(-1).id === '__other');
  const energy = computeCustom({ ...defaultCfg('ext:orgs', st), visual: 'kpi' }, st, me, { days: 30, sel: [{ field: 'sector', value: 'Енергетика' }] }, NOW);
  assert.ok(energy.value > 0 && energy.value < 200);
  // A source without that field is not narrowed.
  assert.equal(computeCustom({ source: 'tasks', visual: 'kpi', measure: 'count' }, st, me, { days: 30, sel: [{ field: 'sector', value: 'Енергетика' }] }, NOW).value, 3);
  const wb = { source: 'ext:wb', ind: 'NY.GDP.MKTP.KD.ZG', countries: ['UKR', 'POL'], group: 'country', measure: 'avg', field: 'value', time: 'date', grain: 'year', span: 'all' };
  assert.equal(extKey(wb), 'wb:NY.GDP.MKTP.KD.ZG:UKR;POL');
  const lines = computeCustom({ ...wb, visual: 'lines' }, st, me, { days: 30 }, NOW);
  assert.deepEqual(lines.labels, ['2022', '2023']);
  assert.deepEqual(computeCustom({ ...wb, visual: 'bars' }, st, me, { days: 30 }, NOW).rows.map((r) => r.value), [5.3, 0.2]); // the latest year
  const d = drillRows({ ...defaultCfg('ext:orgs', st) }, st, me, { days: 30 });
  assert.equal(d.total, 200);
  assert.ok(toCsv({ cols: ['a'], rows: [['x"y']] }).includes('"x""y"'));
});

test('a slicer keeps every value of its own field while the rest of the dashboard is narrowed', async () => {
  const { computeCustom } = await import('../../src/lib/situation-custom.js');
  const sel = [{ field: 'sector', value: 'Енергетика' }];
  const all = computeCustom({ source: 'ext:orgs', visual: 'slicer', group: 'sector' }, state, me, { days: 30 }, NOW).rows.length;
  assert.equal(computeCustom({ source: 'ext:orgs', visual: 'slicer', group: 'sector' }, state, me, { days: 30, sel }, NOW).rows.length, all);
  assert.equal(computeCustom({ source: 'ext:orgs', visual: 'slicer', group: 'city' }, state, me, { days: 30, sel }, NOW).rows.length < all + 50, true);
});

test('a dashboard about a subject: every template names it, and its widgets count for that country or company', async () => {
  const { SUBJECTS, subjectBoard } = await import('../../src/lib/situation.js');
  const { resolveCfg, computeCustom, extKey } = await import('../../src/lib/situation-custom.js');
  for (const t of SUBJECTS) assert.ok(t.widgets().length >= 6, t.kind);
  const pl = subjectBoard({ kind: 'country', label: 'Польща', iso3: 'POL', q: '"Poland"' }, me);
  assert.equal(pl.name, 'Ризик країни: Польща');
  const peers = resolveCfg(pl.widgets.find((x) => x.title?.startsWith('Зростання ВВП порівняно')).cfg, pl.subject);
  assert.deepEqual(peers.countries, ['POL', 'DEU', 'USA']); // the subject once, its peers after
  assert.equal(extKey(resolveCfg(pl.widgets.find((x) => x.title === 'Увага світових медіа').cfg, pl.subject)), 'gd:vol:"Poland"');
  // A yearly KPI: the latest year against the one before.
  const st = { ...state, ext: { 'wb:NY.GDP.MKTP.KD.ZG:POL': [{ country: 'Польща', date: '2022-07-01', value: 5.3 }, { country: 'Польща', date: '2023-07-01', value: 0.2 }] } };
  const kpi = computeCustom(resolveCfg(pl.widgets[0].cfg, pl.subject), st, me, { days: 30 }, NOW);
  assert.equal(kpi.value, 0.2);
  assert.equal(kpi.delta, -5.1);
  // A company: its card from the register of leading companies, peers of its sector.
  const uz = subjectBoard({ kind: 'company', label: 'Укрзалізниця', code: '40075815', sector: 'Транспорт і логістика', q: '"Ukrzaliznytsia"' }, me);
  const card = computeCustom(resolveCfg(uz.widgets[0].cfg, uz.subject), state, me, { days: 30 }, NOW);
  assert.ok(card.items.some((x) => x.label === 'ЄДРПОУ' && x.value === '40075815'));
  const rivals = computeCustom(resolveCfg(uz.widgets.find((x) => x.title === 'Конкуренти в галузі').cfg, uz.subject), state, me, { days: 30 }, NOW);
  assert.ok(rivals.rows.length > 5 && rivals.rows.every((r) => r.cells.includes('Транспорт і логістика')));
});

test('the world’s media about a subject: GDELT asked once, kept six hours; a «wait» is passed on', async () => {
  process.env.SUPABASE_URL ||= '';
  const { subjectMedia } = await import('../../api/pulse.js');
  let asked = 0;
  const ok = async () => { asked++; return new Response(JSON.stringify({ articles: [{ title: 'Poland boosts defence', url: 'https://x/1', domain: 'x.com', sourcecountry: 'Poland', language: 'English', seendate: '20261103T120000Z' }] }), { status: 200 }); };
  const r = await subjectMedia('arts', '"Poland"', Date.now(), ok);
  assert.equal(asked, 1);
  assert.deepEqual(r.rows[0], { title: 'Poland boosts defence', url: 'https://x/1', domain: 'x.com', country: 'Poland', language: 'English', date: '2026-11-03' });
  const busy = async () => new Response('Please limit requests to one every 5 seconds', { status: 429 });
  await assert.rejects(() => subjectMedia('vol', '"Poland"', Date.now(), busy), (e) => e.status === 429);
});

test('a company outside the register: its own card from what was entered, no other company’s data, peers once a sector is given', async () => {
  const { subjectBoard } = await import('../../src/lib/situation.js');
  const { resolveCfg, computeCustom } = await import('../../src/lib/situation-custom.js');
  const b = subjectBoard({ kind: 'company', label: 'ТОВ «Ромашка»', code: '12345678', sector: '', q: '"Romashka"' }, me);
  const at = (title) => computeCustom(resolveCfg(b.widgets.find((x) => x.title === title).cfg, b.subject), state, me, { days: 30 }, NOW);
  const card = at('Картка компанії');
  assert.equal(card.outside, true);
  assert.deepEqual(card.items.map((x) => x.value), ['ТОВ «Ромашка»', '12345678']);
  assert.equal(card.url, 'https://opendatabot.ua/c/12345678');
  assert.equal(at('Конкуренти в галузі').empty, true); // not all 200 companies
  assert.equal(at('Компанії тієї ж галузі за містами').empty, true);
  const withSector = subjectBoard({ ...b.subject, sector: 'Банки' }, me);
  const rivals = computeCustom(resolveCfg(withSector.widgets.find((x) => x.title === 'Конкуренти в галузі').cfg, withSector.subject), state, me, { days: 30 }, NOW);
  assert.ok(rivals.rows.length > 5 && rivals.rows.every((r) => r.cells.includes('Банки')));
});
