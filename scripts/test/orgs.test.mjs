// The reference list of organisations: 200 verified entries (unique 8-digit codes, known sectors, a source for each)
// and 20 IT companies of Kyiv added without a code (to be filled from the registry), with their own site and description.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGS_UA, ORG_SECTORS } from '../../src/data/orgs-ua.js';

test('200 organisations with unique codes and sources; every sector used; 20 IT companies of Kyiv without codes', () => {
  const coded = ORGS_UA.filter((o) => o.code);
  const itKyiv = ORGS_UA.filter((o) => !o.code);
  assert.equal(coded.length, 200);
  assert.equal(itKyiv.length, 20);
  assert.equal(new Set(coded.map((o) => o.code)).size, 200);
  assert.equal(new Set(ORGS_UA.map((o) => o.id || `org-${o.code}`)).size, 220);
  for (const s of ORG_SECTORS) assert.ok(ORGS_UA.some((o) => o.sector === s), s);
  for (const o of itKyiv) {
    assert.ok(o.id.startsWith('org-it-') && o.sector === 'IT' && o.city === 'Київ', o.name);
    assert.match(o.website, /^https:\/\/[\w.-]+\.[a-z]{2,}/, o.name);
    assert.ok(o.about, o.name);
    if (o.founded) assert.ok(Number.isInteger(o.founded) && o.founded >= 1980 && o.founded <= 2026, o.name);
  }
  for (const o of coded) {
    assert.match(o.code, /^\d{8}$/, o.name);
    assert.ok(ORG_SECTORS.includes(o.sector), `${o.name}: ${o.sector}`);
    assert.match(o.source, /^https:\/\//, o.name);
    assert.ok(o.legal && o.name, o.code);
  }
});

test('reference facts: every company has facts or a description; sites are https, years plausible', async () => {
  const { factsOf, aboutOf } = await import('../../src/data/orgs-ua.js');
  for (const o of ORGS_UA.filter((x) => x.code)) {
    const f = factsOf(o.code);
    assert.ok(f.website || f.founded || f.owners || aboutOf(o.code), `${o.name}: no facts`);
    if (f.website) assert.match(f.website, /^https:\/\/[\w.-]+\.[a-z]{2,}/, o.name);
    if (f.founded) assert.ok(Number.isInteger(f.founded) && f.founded >= 1700 && f.founded <= 2026, `${o.name}: ${f.founded}`);
  }
});
