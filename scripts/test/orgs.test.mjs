// The reference list of organisations: 200 entries, unique 8-digit codes, known sectors, a source for each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGS_UA, ORG_SECTORS } from '../../src/data/orgs-ua.js';

test('200 organisations with unique codes and sources; every sector used', () => {
  assert.equal(ORGS_UA.length, 200);
  assert.equal(new Set(ORGS_UA.map((o) => o.code)).size, 200);
  for (const s of ORG_SECTORS) assert.ok(ORGS_UA.some((o) => o.sector === s), s);
  for (const o of ORGS_UA) {
    assert.match(o.code, /^\d{8}$/, o.name);
    assert.ok(ORG_SECTORS.includes(o.sector), `${o.name}: ${o.sector}`);
    assert.match(o.source, /^https:\/\//, o.name);
    assert.ok(o.legal && o.name, o.code);
  }
});

test('reference facts: every company has facts or a description; sites are https, years plausible', async () => {
  const { factsOf, aboutOf } = await import('../../src/data/orgs-ua.js');
  for (const o of ORGS_UA) {
    const f = factsOf(o.code);
    assert.ok(f.website || f.founded || f.owners || aboutOf(o.code), `${o.name}: no facts`);
    if (f.website) assert.match(f.website, /^https:\/\/[\w.-]+\.[a-z]{2,}/, o.name);
    if (f.founded) assert.ok(Number.isInteger(f.founded) && f.founded >= 1700 && f.founded <= 2026, `${o.name}: ${f.founded}`);
  }
});
