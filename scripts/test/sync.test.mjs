// Sync engine: a row-level-security refusal stops the batch and is reported once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSync, isRlsError } from '../../src/lib/sync.js';

test('RLS refusal: one onDenied, no flood of onError, rest of the batch not sent', async () => {
  let watcher;
  let puts = 0;
  const rls = Object.assign(new Error('new row violates row-level security policy for table "core_docs"'), { code: '42501' });
  const docs = {
    watch(fn) { watcher = fn; return () => {}; },
    async put() { puts++; throw rls; },
    async remove() {},
  };
  let state = { session: { userId: 'u1' }, users: [], records: [], requests: [], audit: [] };
  const errors = []; const denied = [];
  const sync = createSync({ docs, getState: () => state, dispatch: () => {}, onError: (e) => errors.push(e), onDenied: (e) => denied.push(e) });
  for (const k of ['users', 'records', 'requests', 'audit']) watcher(k, []);
  state = { ...state, records: Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, clearance: 0 })) };
  sync.changed();
  await new Promise((r) => setTimeout(r, 600));
  sync.stop();
  assert.equal(puts, 1);
  assert.equal(denied.length, 1);
  assert.equal(errors.length, 0);
  assert.ok(isRlsError(rls) && !isRlsError(new Error('timeout')));
});

// A poll that started before a write landed answers with the old copy: the change made here must survive it,
// and must not be sent again; once the server shows the new copy, it is simply agreed.
test('a stale answer does not undo a change already sent (files vanishing after upload)', async () => {
  let watcher;
  const puts = [];
  const removes = [];
  const docs = { watch(fn) { watcher = fn; return () => {}; }, async put(kind, d) { puts.push(JSON.parse(JSON.stringify(d))); }, async remove(kind, id) { removes.push(id); } };
  let state = { records: [], session: { userId: 'u1' } };
  const dispatch = (a) => { if (a.type === 'shared/sync') state = { ...state, [a.kind]: a.items }; };
  const sync = createSync({ docs, getState: () => state, dispatch });
  const v1 = { id: 'p1', title: 'Проєкт', files: [] };
  const other = { id: 'p2', title: 'Інший' };
  watcher('records', [v1, other]);
  for (const k of ['users', 'requests', 'audit', 'comments', 'tasks']) watcher(k, []);
  // a file is added here and sent
  const v2 = { ...v1, files: [{ id: 'x-1', name: 'photo.png' }] };
  state = { ...state, records: [v2, other] };
  sync.changed();
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(puts.map((d) => d.files.length), [1]);
  // the stale answer (without the file) arrives: the file stays, nothing is re-sent
  watcher('records', [v1, other]);
  assert.equal(state.records.find((r) => r.id === 'p1').files.length, 1);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(puts.length, 1);
  // a second file added on top keeps the first
  const v3 = { ...v2, files: [...v2.files, { id: 'x-2', name: 'b.pdf' }] };
  state = { ...state, records: [v3, other] };
  sync.changed();
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(puts.at(-1).files.length, 2);
  // the server catches up: agreed, the local copy is the server's
  watcher('records', [v3, other]);
  assert.equal(state.records.find((r) => r.id === 'p1').files.length, 2);
  // a removal is not undone by a stale answer either
  state = { ...state, records: [v3] };
  sync.changed();
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(removes, ['p2']);
  watcher('records', [v3, other]);
  assert.ok(!state.records.some((r) => r.id === 'p2'));
  // a change made elsewhere still comes in
  watcher('records', [{ ...v3, title: 'Перейменовано' }]);
  assert.equal(state.records[0].title, 'Перейменовано');
  sync.stop();
});
