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
