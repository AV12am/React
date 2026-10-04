// The reference list of organisations: 100 entries, unique 8-digit codes, known sectors, a source for each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGS_UA, ORG_SECTORS } from '../../src/data/orgs-ua.js';

test('100 organisations with unique codes and sources', () => {
  assert.equal(ORGS_UA.length, 100);
  assert.equal(new Set(ORGS_UA.map((o) => o.code)).size, 100);
  for (const o of ORGS_UA) {
    assert.match(o.code, /^\d{8}$/, o.name);
    assert.ok(ORG_SECTORS.includes(o.sector), `${o.name}: ${o.sector}`);
    assert.match(o.source, /^https:\/\//, o.name);
    assert.ok(o.legal && o.name, o.code);
  }
});
