// Official air-raid alerts by oblast, for the morning brief's map: how many hours each oblast spent under an
// alert in the last 24 hours and the last 7 days. A look back at public civil-defence data (the same the
// «Повітряна тривога» app shows) — no forecast, no targets, nothing about enterprises.
//
// Source: alerts.in.ua (its developer API, free on request) — ALERTS_IN_UA_TOKEN in Vercel. Its history is asked
// one oblast at a time and the API limits how often, so each run (the brief's and the morning crons') refreshes the
// oblasts read longest ago until it is told to wait or its time runs out; what it read is kept (pulse / alerts).
import { env, db } from './_core.js';
import { uaKeyOf } from '../src/lib/brief.js';

const TOKEN = () => env.ALERTS_IN_UA_TOKEN || '';
export const alertsOn = () => Boolean(TOKEN());
const API = 'https://api.alerts.in.ua/v1';
const HOUR = 3600 * 1000;

// alerts.in.ua's oblast ids. The name the API gives back with each alert is what files the hours (not this list).
export const OBLAST_UIDS = [3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 31];

const read = async () => (await db('core_docs?kind=eq.pulse&id=eq.alerts&select=doc').catch(() => []))[0]?.doc || null;
const keep = (doc) => db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { kind: 'pulse', id: 'alerts', doc: { ...doc, id: 'alerts', clearance: 0 } } }).catch(() => {});

/** Hours under an air-raid alert within [from, to], from the API's alerts of one oblast. */
export function hoursUnder(alerts, from, to) {
  let ms = 0;
  for (const a of alerts || []) {
    if (a.alert_type && a.alert_type !== 'air_raid') continue;
    const s = Date.parse(a.started_at); const e = a.finished_at ? Date.parse(a.finished_at) : to;
    if (!Number.isFinite(s)) continue;
    ms += Math.max(0, Math.min(e, to) - Math.max(s, from));
  }
  return Math.round((ms / HOUR) * 10) / 10;
}

/** Refreshes the oblasts read longest ago; returns the kept { byOblast: { name: { h24, h7, at } }, at }. */
export async function refreshAlerts(budgetMs = 25000, now = Date.now()) {
  const doc = (await read()) || { byOblast: {}, read: {} };
  if (!alertsOn()) return doc;
  const started = Date.now();
  const order = [...OBLAST_UIDS].sort((a, b) => (doc.read?.[a] || 0) - (doc.read?.[b] || 0));
  let changed = false;
  for (const uid of order) {
    if (Date.now() - started > budgetMs) break;
    if (now - (doc.read?.[uid] || 0) < 6 * HOUR) continue; // fresh enough
    try {
      const res = await fetch(`${API}/regions/${uid}/alerts/month_ago.json`, { headers: { Authorization: `Bearer ${TOKEN()}`, 'User-Agent': 'ReactionCore/1.0 (morning brief)' }, signal: AbortSignal.timeout(8000) });
      if (res.status === 429) break; // asked to wait: the next run goes on
      if (!res.ok) continue;
      const j = await res.json();
      const list = Array.isArray(j?.alerts) ? j.alerts : Array.isArray(j) ? j : [];
      const name = list.find((a) => a.location_oblast)?.location_oblast || list.find((a) => a.location_title)?.location_title;
      doc.read = { ...(doc.read || {}), [uid]: now };
      if (name) doc.byOblast = { ...(doc.byOblast || {}), [name]: { h24: hoursUnder(list, now - 24 * HOUR, now), h7: hoursUnder(list, now - 7 * 24 * HOUR, now), at: new Date(now).toISOString() } };
      changed = true;
    } catch { /* this oblast next time */ }
  }
  if (changed) { doc.at = new Date(now).toISOString(); await keep(doc); }
  return doc;
}
export const readAlerts = read;

// ── The oblasts' outlines for the brief's map ─────────────────────────────────────────────────────────────────
// geoBoundaries (open, CC BY 4.0): Ukraine's first-level divisions, simplified. Fetched once and kept (pulse /
// ua-adm1) in a light form: each oblast's key and its rings, the points rounded to 0.01°.
const GB_API = 'https://www.geoboundaries.org/api/current/gbOpen/UKR/ADM1/';
export async function uaShapes() {
  const row = (await db('core_docs?kind=eq.pulse&id=eq.ua-adm1&select=doc').catch(() => []))[0]?.doc;
  if (row?.shapes?.length >= 20) return row.shapes;
  try {
    const meta = await (await fetch(GB_API, { headers: { 'User-Agent': 'ReactionCore/1.0 (morning brief map)' }, signal: AbortSignal.timeout(10000) })).json();
    const url = meta?.simplifiedGeometryGeoJSON || meta?.gjDownloadURL;
    if (!url) return [];
    const gj = await (await fetch(url, { headers: { 'User-Agent': 'ReactionCore/1.0 (morning brief map)' }, signal: AbortSignal.timeout(20000) })).json();
    const round = (p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
    const ring = (r) => r.map(round).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    const shapes = (gj.features || []).map((f) => {
      const g = f.geometry || {};
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      return { key: uaKeyOf(f.properties?.shapeName || ''), rings: polys.map((poly) => poly.map(ring).filter((r) => r.length > 3)).filter((p) => p.length) };
    }).filter((s) => s.key && s.rings.length);
    if (shapes.length >= 20) await db('core_docs?on_conflict=kind,id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { kind: 'pulse', id: 'ua-adm1', doc: { id: 'ua-adm1', clearance: 0, shapes, source: 'geoBoundaries (CC BY 4.0)' } } }).catch(() => {});
    return shapes;
  } catch { return []; }
}
