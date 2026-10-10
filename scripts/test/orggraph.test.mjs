// Граф зв'язків: owners recognised from the text, company-to-company links, no false links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGS_UA, factsOf } from '../../src/data/orgs-ua.js';
import { buildGraph, ownersOf, relatedThroughOwners } from '../../src/lib/orggraph.js';

const ORGS = ORGS_UA.map((o) => ({ id: `org-${o.code}`, name: o.name, owners: factsOf(o.code).owners }));
const by = (name) => ORGS.find((o) => o.name === name);

test('company owners: Нафтогаз subsidiaries, Метінвест plants, no person-name false link', () => {
  const g = buildGraph(ORGS);
  const parent = g.links.filter((l) => l.kind === 'parent').map((l) => `${l.source}>${l.target}`);
  assert.ok(parent.includes(`${by('Нафтогаз України').id}>${by('Укргазвидобування').id}`));
  assert.ok(parent.includes(`${by('Метінвест').id}>${by('Запоріжсталь').id}`));
  assert.ok(!parent.includes(`${by('Антонов').id}>${by('ОККО (Концерн Галнафтогаз)').id}`));
  assert.ok(!parent.some((p) => p.startsWith(`${by('Укренерго').id}>`)));
});

test('state bodies hang off the state; groups are shared across companies', () => {
  assert.deepEqual(ownersOf(by('Сенс Банк'), ORGS).entities.map((e) => e.id), ['state', 'minfin']);
  const rel = relatedThroughOwners(by('ПУМБ'), ORGS);
  const scm = rel.find((r) => r.id === 'scm');
  assert.ok(scm.peers.some((p) => p.name === 'Укртелеком') && scm.peers.some((p) => p.name === 'ДТЕК Західенерго'));
});

test('without the state, state-only companies drop out', () => {
  const all = buildGraph(ORGS).nodes.length;
  const noState = buildGraph(ORGS, { hideState: true }).nodes.length;
  assert.ok(noState < all);
  assert.ok(!buildGraph(ORGS, { hideState: true }).nodes.some((n) => n.name === 'Укрзалізниця'));
});
