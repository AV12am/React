// Tests for the Vercel Function api/conflicts.js with a mocked network (synthetic fixtures).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../api/conflicts.js';

const box = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const poly = (props, rings) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: rings } });
const routes = {
  'https://deepstatemap.live/api/history/public': [{ id: 1758100000, datetime: '2026-09-25T20:00:00Z' }],
  'https://deepstatemap.live/api/history/1758100000/geojson': {
    type: 'FeatureCollection',
    features: [poly({ name: 'Окупована територія', fill: '#a52714' }, box(37.2, 47.1, 40.0, 49.6)), poly({ name: 'Окупований Крим' }, box(33.0, 44.5, 36.0, 46.0))],
  },
};

async function withFetch(fn, body) {
  const real = globalThis.fetch;
  globalThis.fetch = fn;
  try { return await body(); } finally { globalThis.fetch = real; }
}
const mock = async (url) => {
  const key = Object.keys(routes).find((k) => String(url).startsWith(k));
  if (!key) throw new Error(`network: no route for ${url}`);
  return { ok: true, status: 200, text: async () => JSON.stringify(routes[key]) };
};

test('serves DeepState territory with a long edge cache', async () => {
  const saved = { ...process.env };
  for (const k of ['ACLED_USERNAME', 'ACLED_PASSWORD', 'ACLED_EMAIL', 'ACLED_KEY']) delete process.env[k];
  const res = await withFetch(mock, () => GET());
  process.env = saved;
  const body = await res.json();
  assert.equal(body.manifest.sources.deepstate.status, 'ok');
  assert.equal(body.manifest.sources.deepstate.sourceDate, '2026-09-25T20:00:00Z');
  assert.equal(body.deepstate.features.length, 2);
  assert.equal(body.manifest.sources.isw.status, 'not_configured');
  assert.equal(body.manifest.sources.acled.status, 'not_configured');
  assert.match(res.headers.get('cache-control'), /s-maxage=10800/);
});

test('a failing source is reported, not thrown, and is cached only briefly', async () => {
  const res = await withFetch(async () => { throw new Error('offline'); }, () => GET());
  const body = await res.json();
  assert.equal(body.manifest.sources.deepstate.status, 'error');
  assert.equal(body.deepstate, null);
  assert.match(res.headers.get('cache-control'), /s-maxage=300/);
});
