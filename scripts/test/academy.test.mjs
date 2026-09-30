// Every catalogue course has a text and a well-formed test; required courses exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, TRACKS, REQUIRED, courseById } from '../../src/data/academy/meta.js';

const load = async (track) => (await import(`../../src/data/academy/${track}.js`)).default;

test('each course has a body and a quiz', async () => {
  for (const t of TRACKS) {
    const content = await load(t.id);
    const ids = COURSES.filter((c) => c.track === t.id).map((c) => c.id);
    assert.deepEqual(Object.keys(content).sort(), ids.slice().sort(), `track ${t.id}: content ↔ catalogue`);
    for (const id of ids) {
      const c = content[id];
      assert.ok(c.summary && c.body.length >= 3, `${id}: body`);
      assert.ok(c.quiz.length >= 4, `${id}: at least 4 questions`);
      for (const [q, opts, why] of c.quiz) {
        assert.ok(q && why, `${id}: question and explanation`);
        assert.ok(opts.length >= 3 && new Set(opts).size === opts.length, `${id}: distinct options for «${q}»`);
      }
      for (const b of c.body) assert.ok(typeof b === 'string' || ['h', 'ul', 'ol', 'note', 'tbl'].includes(b[0]), `${id}: block ${JSON.stringify(b).slice(0, 40)}`);
    }
  }
});

test('required courses exist', () => {
  for (const ids of Object.values(REQUIRED)) for (const id of ids) assert.ok(courseById(id), id);
});
