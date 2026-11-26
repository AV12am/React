// SITUATION's dashboards from the open days move into the account on the first sign-in (src/site/boards-move.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bringLocal, MOVED } from '../../src/site/boards-move.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('boards: local ones move once, owned by the person', async () => {
  const store = mem(); const sent = [];
  const putRow = async (uid, key, doc) => { sent.push({ uid, key, doc }); };
  const rows = { 'b:1': { id: '1', name: 'Польща', owner: 'local', widgets: [] }, 'd:2': { id: '2', name: 'Таблиця' }, bad: null };
  assert.equal(await bringLocal('u-9', putRow, rows, store), 2);
  assert.deepEqual(sent.map((x) => [x.uid, x.key, x.doc.owner]), [['u-9', 'b:1', 'u-9'], ['u-9', 'd:2', 'u-9']]);
  assert.equal(store.getItem(MOVED), 'u-9');
  assert.equal(await bringLocal('u-9', putRow, rows, store), 0); // not twice
  assert.equal(sent.length, 2);
});

test('boards: a failed move leaves no mark and is tried again', async () => {
  const store = mem();
  const fail = async () => { throw new Error('offline'); };
  await assert.rejects(bringLocal('u-1', fail, { 'b:1': { id: '1', owner: 'local' } }, store));
  assert.equal(store.getItem(MOVED), null);
  assert.equal(await bringLocal('u-1', async () => {}, {}, store), 0); // nothing to move
});
