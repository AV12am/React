// Tests for scripts/update-conflicts.mjs with a mocked network. The fixtures are synthetic: they follow
// the documented / observed shapes of each source, not real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { geoArea } from 'd3-geo';
import { run } from '../update-conflicts.mjs';

const config = JSON.parse(await fs.readFile(new URL('../conflict-sources.json', import.meta.url), 'utf8'));
config.isw.layerUrl = 'https://example.test/arcgis/rest/services/RU_Controlled/FeatureServer/0';
const NOW = new Date('2026-09-26T06:00:00Z');

// Counter-clockwise boxes, as RFC 7946 GeoJSON writes them.
const box = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const poly = (props, rings) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: rings } });
const DONBAS = box(37.2, 47.1, 40.0, 49.6);  // ~62k km²
const CRIMEA = box(33.0, 44.5, 36.0, 46.0);  // ~39k km²
const ALL_UA = box(22.2, 44.4, 40.2, 52.3);  // the whole country

function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error(`network: no route for ${url}`);
    const r = typeof routes[key] === 'function' ? routes[key](url, init) : routes[key];
    if (r instanceof Error) throw r;
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, text: async () => JSON.stringify(r.body ?? r) };
  };
  fn.calls = calls;
  return fn;
}

const deepstateRoutes = (features) => ({
  'https://deepstatemap.live/api/history/public': [
    { id: 1758000000, datetime: '2026-09-24T20:00:00Z' },
    { id: 1758100000, datetime: '2026-09-25T20:00:00Z' },
  ],
  'https://deepstatemap.live/api/history/1758100000/geojson': { type: 'FeatureCollection', features },
});
const goodDeepState = [
  poly({ name: 'Окупована територія', fill: '#a52714' }, DONBAS),
  poly({ name: 'Окупований Крим' }, CRIMEA),
  poly({ name: 'Звільнено', fill: '#0f9d58' }, box(36.0, 49.0, 37.0, 50.0)),
  { type: 'Feature', properties: { name: 'Позиція' }, geometry: { type: 'Point', coordinates: [37.5, 48.5] } },
];
const iswRoute = { 'https://example.test/arcgis': { type: 'FeatureCollection', features: [poly({ EditDate: 1790300000000 }, DONBAS), poly({}, CRIMEA)] } };
const acledRoutes = {
  'https://acleddata.com/oauth/token': { access_token: 'tkn', expires_in: 86400 },
  'https://acleddata.com/api/acled/read': {
    status: 200, success: true, count: 2,
    data: [
      { event_id_cnty: 'UKR1', event_date: '2026-09-25', event_type: 'Explosions/Remote violence', sub_event_type: 'Shelling/artillery/missile attack', country: 'Ukraine', admin1: 'Kharkiv', location: 'Kharkiv', latitude: '49.9935', longitude: '36.2304', fatalities: '2', notes: 'On 25 September…' },
      { event_id_cnty: 'SDN9', event_date: '2026-09-24', event_type: 'Battles', sub_event_type: 'Armed clash', country: 'Sudan', admin1: 'North Darfur', location: 'El Fasher', latitude: '13.6279', longitude: '25.3494', fatalities: '0', notes: '' },
    ],
  },
};

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'conflicts-')); }
const quiet = () => {};
const env = { ACLED_USERNAME: 'analyst@example.test', ACLED_PASSWORD: 'secret' };

test('all three sources refresh and the manifest records them', async () => {
  const outDir = await tmp();
  const fetchImpl = mockFetch({ ...deepstateRoutes(goodDeepState), ...iswRoute, ...acledRoutes });
  const m = await run({ fetchImpl, outDir, config, env, now: NOW, log: quiet });

  assert.equal(m.sources.deepstate.status, 'ok');
  assert.equal(m.sources.deepstate.sourceDate, '2026-09-25T20:00:00Z', 'uses the newest snapshot');
  assert.equal(m.sources.deepstate.features, 2, 'keeps only occupied polygons, drops liberated areas and points');
  assert.ok(m.sources.deepstate.areaKm2 > 90_000 && m.sources.deepstate.areaKm2 < 110_000);
  const ds = JSON.parse(await fs.readFile(path.join(outDir, 'deepstate.geojson'), 'utf8'));
  for (const f of ds.features) assert.ok(geoArea(f) < 2 * Math.PI, 'rings are wound for d3 (not the whole globe)');

  assert.equal(m.sources.isw.status, 'ok');
  assert.equal(m.sources.isw.sourceDate, new Date(1790300000000).toISOString());

  assert.equal(m.sources.acled.status, 'ok');
  const ac = JSON.parse(await fs.readFile(path.join(outDir, 'acled.json'), 'utf8'));
  assert.deepEqual(ac.events.map((e) => [e.id, e.lat, e.fatalities]), [['UKR1', 49.9935, 2], ['SDN9', 13.6279, 0]]);
  assert.equal(ac.from, '2026-09-12');
  const read = fetchImpl.calls.find((c) => c.url.startsWith('https://acleddata.com/api/acled/read'));
  assert.equal(read.init.headers.Authorization, 'Bearer tkn');
  assert.match(decodeURIComponent(read.url.replace(/\+/g, ' ')), /event_type=Battles:OR:event_type=Explosions\/Remote violence/);
  assert.equal(m.updatedAt, NOW.toISOString());
});

test('implausible data is rejected and the previous file is kept', async () => {
  const outDir = await tmp();
  await run({ fetchImpl: mockFetch(deepstateRoutes(goodDeepState)), outDir, config, env: {}, now: NOW, only: ['deepstate'], log: quiet });
  const before = await fs.readFile(path.join(outDir, 'deepstate.geojson'), 'utf8');

  const later = new Date(NOW.getTime() + 3 * 3600000);
  const bad = [poly({ name: 'Окупована територія' }, ALL_UA)];
  const m = await run({ fetchImpl: mockFetch(deepstateRoutes(bad)), outDir, config, env: {}, now: later, only: ['deepstate'], log: quiet });

  assert.equal(m.sources.deepstate.status, 'error');
  assert.match(m.sources.deepstate.error, /Implausible occupied area/);
  assert.equal(m.sources.deepstate.updatedAt, NOW.toISOString(), 'keeps the time of the last good update');
  assert.equal(await fs.readFile(path.join(outDir, 'deepstate.geojson'), 'utf8'), before, 'previous data untouched');
});

test('a network failure in one source does not stop the others', async () => {
  const outDir = await tmp();
  const routes = { ...deepstateRoutes(goodDeepState), ...acledRoutes, 'https://example.test/arcgis': new Error('ECONNRESET') };
  const m = await run({ fetchImpl: mockFetch(routes), outDir, config, env, now: NOW, log: quiet });
  assert.equal(m.sources.deepstate.status, 'ok');
  assert.equal(m.sources.isw.status, 'error');
  assert.equal(m.sources.acled.status, 'ok');
});

test('missing configuration is reported, not treated as a failure', async () => {
  const outDir = await tmp();
  const cfg = structuredClone(config);
  cfg.isw.layerUrl = '';
  const m = await run({ fetchImpl: mockFetch(deepstateRoutes(goodDeepState)), outDir, config: cfg, env: {}, now: NOW, log: quiet });
  assert.equal(m.sources.isw.status, 'not_configured');
  assert.equal(m.sources.acled.status, 'not_configured');
  assert.match(m.sources.acled.error, /ACLED_USERNAME/);
});

test('legacy ACLED key + email is supported', async () => {
  const outDir = await tmp();
  const fetchImpl = mockFetch({ 'https://api.acleddata.com/acled/read': acledRoutes['https://acleddata.com/api/acled/read'] });
  const m = await run({ fetchImpl, outDir, config, env: { ACLED_EMAIL: 'a@example.test', ACLED_KEY: 'k' }, now: NOW, only: ['acled'], log: quiet });
  assert.equal(m.sources.acled.status, 'ok');
  assert.match(fetchImpl.calls[0].url, /key=k/);
});

test('ACLED error responses surface their message', async () => {
  const outDir = await tmp();
  const fetchImpl = mockFetch({ ...acledRoutes, 'https://acleddata.com/api/acled/read': { status: 403, success: false, error: { message: 'Access denied' } } });
  const m = await run({ fetchImpl, outDir, config, env, now: NOW, only: ['acled'], log: quiet });
  assert.equal(m.sources.acled.status, 'error');
  assert.match(m.sources.acled.error, /HTTP 403/);
});

test('DeepState polygons beyond Ukraine (e.g. Russia itself) are dropped, not fatal', async () => {
  const outDir = await tmp();
  const withRussia = [...goodDeepState, poly({ name: 'Росія', fill: '#bcaaa4' }, box(30.0, 41.0, 180.0, 78.0))];
  const m = await run({ fetchImpl: mockFetch(deepstateRoutes(withRussia)), outDir, config, env: {}, now: NOW, only: ['deepstate'], log: quiet });
  assert.equal(m.sources.deepstate.status, 'ok', m.sources.deepstate.error);
  const fc = JSON.parse(await fs.readFile(path.join(outDir, 'deepstate.geojson'), 'utf8'));
  assert.equal(fc.features.length, 2);
});
