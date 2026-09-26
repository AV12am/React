import * as mgrsModule from 'mgrs';
import { geoDistance, geoInterpolate } from 'd3-geo';

// The package ships ESM (named exports) for bundlers and CommonJS (default export) for Node.
const mgrs = mgrsModule.forward ? mgrsModule : mgrsModule.default;

export const EARTH_KM = 6371.0088;

export const fmtDD = (lat, lon) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

function dms(v, pos, neg) {
  const h = v >= 0 ? pos : neg;
  const a = Math.abs(v);
  let d = Math.floor(a);
  let m = Math.floor((a - d) * 60);
  let s = ((a - d) * 60 - m) * 60;
  if (s >= 59.95) { s = 0; m += 1; }
  if (m >= 60) { m = 0; d += 1; }
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″${h}`;
}
export const fmtDMS = (lat, lon) => `${dms(lat, 'N', 'S')} ${dms(lon, 'E', 'W')}`;

export function fmtMGRS(lat, lon) {
  if (lat > 84 || lat < -80) return '—';
  try {
    const m = mgrs.forward([lon, lat], 5);
    // 36UUA2418291607 → 36U UA 24182 91607
    const r = /^(\d{1,2}[A-Z])([A-Z]{2})(\d+)$/.exec(m);
    if (!r) return m;
    const half = r[3].length / 2;
    return `${r[1]} ${r[2]} ${r[3].slice(0, half)} ${r[3].slice(half)}`;
  } catch { return '—'; }
}

const inRange = (lat, lon) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/**
 * Parses what a person types into the coordinate box:
 *  "50.4501, 30.5234" · "50.45N 30.52E" · "50°27'00"N 30°31'24"E" · MGRS "36U UA 24182 91607".
 * Returns {lat, lon} or null.
 */
export function parseCoords(input) {
  const s = input.trim().toUpperCase().replace(/,(?=\d)/g, '.');
  if (!s) return null;

  const compact = s.replace(/\s+/g, '');
  if (/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}(\d{2}|\d{4}|\d{6}|\d{8}|\d{10})$/.test(compact)) {
    try {
      const [lon, lat] = mgrs.toPoint(compact);
      return inRange(lat, lon) ? { lat, lon } : null;
    } catch { return null; }
  }

  // Degrees with optional minutes/seconds and hemisphere letters.
  const part = String.raw`([NSEW])?\s*(-?\d+(?:\.\d+)?)\s*(?:°|\s)?\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|″|''|′′)\s*)?([NSEW])?`;
  const re = new RegExp(`^${part}\\s*[,;\\s]\\s*${part}$`);
  const m = re.exec(s.replace(/\s*([°'′"″])\s*/g, '$1 ').trim());
  if (!m) return null;
  const val = (h1, d, mi, se, h2) => {
    let v = Math.abs(parseFloat(d)) + (mi ? parseFloat(mi) / 60 : 0) + (se ? parseFloat(se) / 3600 : 0);
    if (d.startsWith('-')) v = -v;
    const h = h1 || h2;
    if (h === 'S' || h === 'W') v = -Math.abs(v);
    return { v, h };
  };
  let a = val(m[1], m[2], m[3], m[4], m[5]);
  let b = val(m[6], m[7], m[8], m[9], m[10]);
  if (a.h === 'E' || a.h === 'W' || b.h === 'N' || b.h === 'S') [a, b] = [b, a];
  return inRange(a.v, b.v) ? { lat: a.v, lon: b.v } : null;
}

export const distanceKm = (a, b) => geoDistance([a.lon, a.lat], [b.lon, b.lat]) * EARTH_KM;

export function bearing(a, b) {
  const φ1 = (a.lat * Math.PI) / 180, φ2 = (b.lat * Math.PI) / 180, Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} м` : `${km.toLocaleString('uk-UA', { maximumFractionDigits: km < 100 ? 1 : 0 })} км`);

/* ---------- Track simulation ---------- */

// Precompute segment lengths once per track.
const cache = new WeakMap();
function geometry(track) {
  if (cache.has(track)) return cache.get(track);
  const pts = track.route.map(([lat, lon]) => ({ lat, lon }));
  const seg = pts.slice(1).map((p, i) => distanceKm(pts[i], p));
  const g = { pts, seg, total: seg.reduce((a, b) => a + b, 0) };
  cache.set(track, g);
  return g;
}

function pointAt(g, d) {
  let i = 0;
  while (i < g.seg.length - 1 && d > g.seg[i]) { d -= g.seg[i]; i++; }
  const t = g.seg[i] ? Math.min(1, Math.max(0, d / g.seg[i])) : 0;
  const [lon, lat] = geoInterpolate([g.pts[i].lon, g.pts[i].lat], [g.pts[i + 1].lon, g.pts[i + 1].lat])(t);
  return { lat, lon };
}

/** Position of a tracked asset at time `now` (ms): travels the route and back at `speed` km/h. */
export function trackState(track, now = Date.now(), trailKm) {
  const g = geometry(track);
  const travelled = ((now / 3600000) * track.speed) % (2 * g.total);
  const forward = travelled <= g.total;
  const d = forward ? travelled : 2 * g.total - travelled;
  const pos = pointAt(g, d);
  const ahead = pointAt(g, Math.min(g.total, Math.max(0, d + (forward ? 0.5 : -0.5))));
  const heading = bearing(pos, ahead);
  const tail = trailKm ?? Math.min(g.total, track.speed * 0.75);
  const trail = [];
  for (let k = 0; k <= 24; k++) {
    const dd = d + (forward ? -1 : 1) * (tail * k) / 24;
    if (dd < 0 || dd > g.total) break;
    trail.push(pointAt(g, dd));
  }
  const remaining = forward ? g.total - d : d;
  return { ...pos, heading, trail, remainingKm: remaining, etaMin: (remaining / track.speed) * 60, destination: forward ? g.pts[g.pts.length - 1] : g.pts[0], totalKm: g.total };
}
