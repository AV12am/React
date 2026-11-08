// CONTEXT's forecast record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleForecasts, trackRecord, brier, elapsed } from '../../src/lib/forecasts.js';

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

test('public SITUATION: no widget on the platform data survives', async () => {
  const { SUBJECTS, subjectBoard, newBoard, publicSafe, publicWidget } = await import('../../src/lib/situation.js');
  const me = { id: 'u1', clearance: 0, public: true };
  for (const x of SUBJECTS) {
    const b = publicSafe(subjectBoard({ kind: x.kind, label: 'Test', q: 'test', iso3: 'UKR', code: '00000000', sector: 'x' }, me));
    assert.ok(b.widgets.every(publicWidget));
    assert.ok(b.widgets.every((w) => !/^(records|tasks|audit|reg:)/.test(w.cfg?.source || '')));
  }
  assert.equal(publicSafe(newBoard('exec', me)).widgets.some((w) => /^(records|tasks|projects|audit|users)/.test(w.metric)), false);
});
