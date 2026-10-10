// Звіти: number, redaction above the product's grif, NOX never exported, Word file builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canReport, reportNumber, reportModel, reportHtml, reportDocx } from '../../src/lib/report.js';

const P = { id: 'p1', div: 'ana', col: 'products', title: 'Оцінка ринку', kind: 'Оцінка', clearance: 0, basis: ['i1', 'i2', 'gone'], questions: 'Що далі?' };
const RECS = [
  P,
  { id: 's1', col: 'sources', name: 'Відкритий реєстр', reliability: 'B — зазвичай надійне', clearance: 0 },
  { id: 'i1', col: 'intake', title: 'Витяг з реєстру', source: 's1', credibility: '2 — ймовірно правдиве', clearance: 0, url: 'https://example.test' },
  { id: 'i2', col: 'intake', title: 'Таємне повідомлення', clearance: 1 },
  { id: 'j1', col: 'judgments', product: 'p1', statement: 'Ринок зросте', kind: 'Прогноз', probability: 75, clearance: 0 },
  { id: 'j2', col: 'judgments', product: 'p1', statement: 'Таємне судження', kind: 'Оцінка', probability: 60, clearance: 1 },
];

test('number: new serial, then kept', () => {
  const n = reportNumber(P, { records: RECS, files: [{ number: 'RC-LUM-2026-0007' }], now: new Date('2026-10-10') });
  assert.equal(n, 'RC-LUM-2026-0008');
  assert.equal(reportNumber({ ...P, number: 'RC-LUM-2026-0002' }), 'RC-LUM-2026-0002');
});

test('nothing above the product grif is disclosed', () => {
  const m = reportModel(P, { records: RECS, number: 'RC-LUM-2026-0008' });
  const html = reportHtml(m);
  assert.ok(html.includes('Витяг з реєстру') && html.includes('Ринок зросте') && html.includes('B2'));
  assert.ok(!html.includes('Таємне'));
  assert.equal(m.basis.filter((b) => b.hidden).length, 1);
  assert.equal(m.basis.filter((b) => b.gone).length, 1);
  assert.match(html, /LUMEN · RC-LUM-2026-0008/);
});

test('NOX products are not exported', () => {
  assert.equal(canReport({ clearance: 2 }), false);
  assert.equal(canReport({ clearance: 1 }), true);
});

test('Word document builds', async () => {
  const blob = await reportDocx(reportModel(P, { records: RECS, number: 'RC-LUM-2026-0008' }));
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  assert.ok(buf.length > 3000);
});
