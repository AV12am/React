#!/usr/bin/env node
// Fetches live conflict data and writes it where the Map module reads it (public/data/conflicts/):
//   deepstate.geojson — occupied territory of Ukraine from DeepStateMap
//   isw.geojson       — Russian-controlled territory from the ISW / CTP ArcGIS layer
//   acled.json        — recent armed-conflict events worldwide from ACLED
//   manifest.json     — per-source status, when each was last refreshed and from what date
// A source that fails or returns implausible data keeps its previous file; the manifest says so.
//
// Usage: node scripts/update-conflicts.mjs [--out <dir>] [--only deepstate,isw,acled]
// ACLED credentials (environment): ACLED_USERNAME + ACLED_PASSWORD (OAuth), or ACLED_EMAIL + ACLED_KEY (legacy API).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePolygons, withinBounds, clipToBounds, totalArea } from './lib/geo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UA = 'ReactionCore-conflict-updater/1.0';
const EARTH_KM2 = 6371.0088 ** 2;
// Occupied territory of Ukraine has been ~100–130 thousand km² since 2022. Anything far outside
// this range means the source changed its format or we classified features wrongly.
const UA_AREA_KM2 = [40_000, 250_000];

export class NotConfigured extends Error {}

async function getJson(fetchImpl, url, init = {}) {
  const res = await fetchImpl(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`Not JSON from ${url.split('?')[0]}`); }
}

function checkUkraineTerritory(features, cfg) {
  if (!features.length) throw new Error('No occupied-territory polygons found');
  const [w, s, e, n] = cfg.ukraineBounds;
  if (!withinBounds(features, [w - 3, s - 1, e + 3, n + 1])) throw new Error('Polygons fall outside Ukraine');
  const km2 = totalArea(features) * EARTH_KM2;
  if (km2 < UA_AREA_KM2[0] || km2 > UA_AREA_KM2[1]) throw new Error(`Implausible occupied area: ${Math.round(km2).toLocaleString('en')} km²`);
  return Math.round(km2);
}

/* ---------- DeepState ---------- */

const pickDate = (o) => o?.datetime ?? o?.createdAt ?? o?.created_at ?? o?.date ?? o?.updatedAt ?? null;

export async function fetchDeepState({ fetchImpl, cfg, config }) {
  const list = await getJson(fetchImpl, cfg.listUrl);
  const items = Array.isArray(list) ? list : list?.data || list?.items || [];
  if (!items.length) throw new Error('Empty history list');
  const latest = items.slice().sort((a, b) => {
    const da = Date.parse(pickDate(a)) || 0, db = Date.parse(pickDate(b)) || 0;
    return db - da || (Number(b.id) || 0) - (Number(a.id) || 0);
  })[0];
  const raw = await getJson(fetchImpl, cfg.geojsonUrl.replace('{id}', encodeURIComponent(latest.id)));
  const fc = raw?.type === 'FeatureCollection' ? raw : raw?.map || raw?.geojson || raw?.data;
  if (fc?.type !== 'FeatureCollection') throw new Error('Unexpected GeoJSON shape');

  const names = cfg.occupiedNamePatterns.map((p) => p.toLowerCase());
  const fills = cfg.occupiedFillColors.map((c) => c.toLowerCase());
  const occupied = fc.features.filter((f) => {
    const p = f.properties || {};
    const label = `${p.name ?? ''} ${p.description ?? ''}`.toLowerCase();
    const fill = String(p.fill ?? p['fill-color'] ?? '').toLowerCase();
    return names.some((x) => label.includes(x)) || fills.includes(fill);
  });
  // DeepState's map also carries polygons beyond Ukraine (e.g. Russia itself); keep only what lies in Ukraine.
  const [w, s, e, n] = config.ukraineBounds;
  const features = clipToBounds(normalizePolygons(occupied, config.coordinatePrecision), [w - 3, s - 1, e + 3, n + 1])
    .map((f) => ({ ...f, properties: { name: f.properties.name ?? null } }));
  const areaKm2 = checkUkraineTerritory(features, config);
  return {
    file: 'deepstate.geojson',
    data: { type: 'FeatureCollection', features },
    meta: { sourceDate: pickDate(latest), sourceId: latest.id, features: features.length, areaKm2 },
  };
}

/* ---------- ISW (ArcGIS FeatureServer layer) ---------- */

export async function fetchIsw({ fetchImpl, cfg, config }) {
  if (!cfg.layerUrl) throw new NotConfigured('layerUrl is empty in scripts/conflict-sources.json');
  const base = cfg.layerUrl.replace(/\/+$/, '');
  const all = [];
  for (let page = 0, offset = 0; page < 25; page++) {
    const q = new URLSearchParams({ where: cfg.where || '1=1', outFields: '*', outSR: '4326', f: 'geojson', resultOffset: String(offset) });
    const fc = await getJson(fetchImpl, `${base}/query?${q}`);
    if (fc?.error) throw new Error(`ArcGIS: ${fc.error.message || 'error'}`);
    if (fc?.type !== 'FeatureCollection') throw new Error('Unexpected ArcGIS response');
    all.push(...fc.features);
    if (!(fc.exceededTransferLimit || fc.properties?.exceededTransferLimit) || !fc.features.length) break;
    offset += fc.features.length;
  }
  const features = normalizePolygons(all, config.coordinatePrecision).map((f) => ({ ...f, properties: {} }));
  const areaKm2 = checkUkraineTerritory(features, config);
  // The layer's own edit/date fields tell how fresh the assessment is.
  let sourceDate = null;
  for (const f of all) for (const [k, v] of Object.entries(f.properties || {})) {
    if (!/date/i.test(k) || v == null) continue;
    const t = typeof v === 'number' ? v : Date.parse(v);
    if (t && (!sourceDate || t > sourceDate)) sourceDate = t;
  }
  return {
    file: 'isw.geojson',
    data: { type: 'FeatureCollection', features },
    meta: { sourceDate: sourceDate ? new Date(sourceDate).toISOString() : null, features: features.length, areaKm2 },
  };
}

/* ---------- ACLED ---------- */

const ACLED_FIELDS = ['event_id_cnty', 'event_date', 'event_type', 'sub_event_type', 'country', 'admin1', 'location', 'latitude', 'longitude', 'fatalities', 'notes'];

export async function fetchAcled({ fetchImpl, cfg, env, now }) {
  const to = new Date(now);
  const from = new Date(now.getTime() - cfg.days * 86400000);
  const d = (x) => x.toISOString().slice(0, 10);
  const params = new URLSearchParams({
    _format: 'json',
    event_date: `${d(from)}|${d(to)}`,
    event_date_where: 'BETWEEN',
    event_type: cfg.eventTypes.join(':OR:event_type='),
    fields: ACLED_FIELDS.join('|'),
    limit: String(cfg.limit),
  });

  let body;
  if (env.ACLED_USERNAME && env.ACLED_PASSWORD) {
    const tok = await getJson(fetchImpl, cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: env.ACLED_USERNAME, password: env.ACLED_PASSWORD, grant_type: 'password', client_id: 'acled' }).toString(),
    });
    if (!tok?.access_token) throw new Error('ACLED sign-in returned no access token');
    body = await getJson(fetchImpl, `${cfg.readUrl}?${params}`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  } else if (env.ACLED_EMAIL && env.ACLED_KEY) {
    params.set('email', env.ACLED_EMAIL);
    params.set('key', env.ACLED_KEY);
    body = await getJson(fetchImpl, `${cfg.legacyReadUrl}?${params}`);
  } else {
    throw new NotConfigured('Set ACLED_USERNAME and ACLED_PASSWORD (or ACLED_EMAIL and ACLED_KEY) as secrets');
  }
  if (body?.success === false || (body?.status && Number(body.status) >= 400)) {
    throw new Error(`ACLED: ${body?.error?.message || body?.message || 'request failed'}`);
  }
  const rows = Array.isArray(body?.data) ? body.data : null;
  if (!rows) throw new Error('Unexpected ACLED response');
  const events = rows.map((r) => ({
    id: r.event_id_cnty,
    date: r.event_date,
    type: r.event_type,
    subType: r.sub_event_type,
    country: r.country,
    admin1: r.admin1,
    location: r.location,
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    fatalities: Number(r.fatalities) || 0,
    notes: String(r.notes || '').slice(0, 280),
  })).filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon) && Math.abs(e.lat) <= 90 && Math.abs(e.lon) <= 180);
  const latest = events.reduce((m, e) => (e.date > m ? e.date : m), '');
  return {
    file: 'acled.json',
    data: { from: d(from), to: d(to), events },
    meta: { sourceDate: latest || null, events: events.length, truncated: rows.length >= cfg.limit },
  };
}

/* ---------- runner ---------- */

const ADAPTERS = { deepstate: fetchDeepState, isw: fetchIsw, acled: fetchAcled };

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, typeof data === 'string' ? data : JSON.stringify(data));
  await fs.rename(tmp, file);
}

export async function run({ fetchImpl = fetch, outDir, config, env = process.env, now = new Date(), only, log = console.log } = {}) {
  await fs.mkdir(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');
  let prev = {};
  try { prev = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { /* first run */ }
  const manifest = { updatedAt: prev.updatedAt ?? null, checkedAt: now.toISOString(), sources: { ...(prev.sources || {}) } };

  for (const [id, adapter] of Object.entries(ADAPTERS)) {
    if (only && !only.includes(id)) continue;
    const cfg = config[id];
    const before = manifest.sources[id] || {};
    const base = { attribution: cfg.attribution, file: before.file ?? null, updatedAt: before.updatedAt ?? null, sourceDate: before.sourceDate ?? null };
    if (!cfg.enabled) { manifest.sources[id] = { ...base, status: 'disabled' }; continue; }
    try {
      const { file, data, meta } = await adapter({ fetchImpl, cfg, config, env, now });
      await writeAtomic(path.join(outDir, file), data);
      manifest.sources[id] = { ...base, ...meta, file, status: 'ok', updatedAt: now.toISOString(), error: null };
      manifest.updatedAt = now.toISOString();
      log(`✓ ${id}: ${JSON.stringify(meta)}`);
    } catch (e) {
      const status = e instanceof NotConfigured ? 'not_configured' : 'error';
      manifest.sources[id] = { ...base, status, error: e.message };
      log(`${status === 'error' ? '✗' : '–'} ${id}: ${e.message}${base.file ? ' (keeping previous data)' : ''}`);
      if (status === 'error' && process.env.GITHUB_ACTIONS) log(`::warning title=${id} update failed::${e.message}`);
    }
  }
  await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const config = JSON.parse(await fs.readFile(path.join(HERE, 'conflict-sources.json'), 'utf8'));
  const outDir = path.resolve(arg('--out') || path.join(HERE, '..', 'public', 'data', 'conflicts'));
  const only = arg('--only')?.split(',');
  const manifest = await run({ outDir, config, only });
  const states = Object.values(manifest.sources).map((s) => s.status);
  if (!states.includes('ok') && states.includes('error')) process.exitCode = 1;
}
