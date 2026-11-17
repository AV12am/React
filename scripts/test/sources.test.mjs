// The starter set of open sources: unique ids, valid classes and grades, a link and a use for each, no human sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES_UA } from '../../src/data/sources-ua.js';
import { SOURCE_CLASSES, RELIABILITY } from '../../src/data/workspaces.js';

test('starter sources are well-formed open sources', () => {
  assert.ok(SOURCES_UA.length >= 70);
  assert.equal(new Set(SOURCES_UA.map((s) => s.id)).size, SOURCES_UA.length);
  for (const s of SOURCES_UA) {
    assert.ok(s.id.startsWith('src-') && s.name, s.id);
    assert.ok(SOURCE_CLASSES.includes(s.class) && s.class !== 'HUMINT', s.name);
    assert.ok(RELIABILITY.includes(s.reliability), s.name);
    assert.match(s.url, /^https:\/\/[\w.-]+\.[a-z]{2,}/, s.name);
    assert.match(s.notes, /Використовується: /, s.name);
    assert.equal(s.access, 'Відкриті дані');
  }
  // what the briefs themselves draw on is in the set
  for (const id of ['gdelt', 'alerts-in-ua', 'gpr', 'geoboundaries', 'prozorro', 'ukrinform', 'bbc-world']) assert.ok(SOURCES_UA.some((s) => s.id === `src-${id}`), id);
});
