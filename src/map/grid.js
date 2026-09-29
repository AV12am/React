// Coordinate grids for the Map overlay: geographic (degrees) and MGRS / UTM.
// Pure geometry — returns lines as [lon, lat] polylines plus label anchors; Map.jsx draws them.
import * as mgrsModule from 'mgrs';

const mgrs = mgrsModule.forward ? mgrsModule : mgrsModule.default;

/* ---------- UTM on WGS 84 ---------- */

const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const RAD = Math.PI / 180;
const M1 = 1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256;
const M2 = (3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024;
const M3 = (15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024;
const M4 = (35 * E2 ** 3) / 3072;
const E1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));

export const zoneCentre = (zone) => (zone - 1) * 6 - 180 + 3;
export const zoneOf = (lon) => Math.min(60, Math.floor((lon + 180) / 6) + 1);

/** lat/lon → easting and signed northing (negative south of the equator) in the given zone. */
export function utmForward(lat, lon, zone) {
  const phi = lat * RAD;
  const s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
  const n = A / Math.sqrt(1 - E2 * s * s);
  const T = t * t, C = EP2 * c * c;
  const a = c * (lon - zoneCentre(zone)) * RAD;
  const m = A * (M1 * phi - M2 * Math.sin(2 * phi) + M3 * Math.sin(4 * phi) - M4 * Math.sin(6 * phi));
  const e = K0 * n * (a + ((1 - T + C) * a ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * a ** 5) / 120) + 500000;
  const y = K0 * (m + n * t * (a * a / 2 + ((5 - T + 9 * C + 4 * C * C) * a ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * a ** 6) / 720));
  return [e, y];
}

/** Easting and signed northing in a zone → [lon, lat]. */
export function utmInverse(e, y, zone) {
  const x = e - 500000;
  const mu = y / K0 / (A * M1);
  const p1 = mu + (1.5 * E1 - (27 * E1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * E1 ** 2) / 16 - (55 * E1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * E1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * E1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
  const n1 = A / Math.sqrt(1 - E2 * s * s);
  const r1 = (A * (1 - E2)) / (1 - E2 * s * s) ** 1.5;
  const T = t * t, C = EP2 * c * c;
  const d = x / (n1 * K0);
  const lat = p1 - ((n1 * t) / r1) * (d * d / 2 - ((5 + 3 * T + 10 * C - 4 * C * C - 9 * EP2) * d ** 4) / 24
    + ((61 + 90 * T + 298 * C + 45 * T * T - 252 * EP2 - 3 * C * C) * d ** 6) / 720);
  const lon = (d - ((1 + 2 * T + C) * d ** 3) / 6 + ((5 - 2 * C + 28 * T - 3 * C * C + 8 * EP2 + 24 * T * T) * d ** 5) / 120) / c;
  return [zoneCentre(zone) + lon / RAD, lat / RAD];
}

const mod = (v, m) => ((v % m) + m) % m;

/* ---------- geographic grid ---------- */

// Steps in degrees, from 30° down to 10″.
const DEG_STEPS = [30, 20, 10, 5, 2, 1, 0.5, 1 / 4, 1 / 6, 1 / 12, 1 / 30, 1 / 60, 1 / 120, 1 / 360];

/** Label for a line of latitude or longitude at the given step: 50°N · 50°30′N · 50°30′30″N. */
export function fmtGridDeg(v, axis, step) {
  const h = axis === 'lat' ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
  const total = Math.round(Math.abs(v) * 3600);
  const d = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (step >= 1) return `${d}°${h}`;
  if (step >= 1 / 60) return `${d}°${String(m).padStart(2, '0')}′${h}`;
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″${h}`;
}

/** Lines of the geographic grid for a view {w,s,e,n}: about 4–8 lines across the width. */
export function degreeGrid({ w, s, e, n }) {
  const span = Math.max(e - w, 1e-6);
  const step = DEG_STEPS.find((x) => span / x >= 4) ?? DEG_STEPS[DEG_STEPS.length - 1];
  const lines = [];
  const s2 = Math.max(s, -85), n2 = Math.min(n, 85);
  for (let lon = Math.ceil(w / step) * step; lon <= e + 1e-9; lon += step) {
    lines.push({ axis: 'lon', value: lon, coords: [[lon, s2], [lon, n2]], label: fmtGridDeg(lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon, 'lon', step) });
  }
  for (let lat = Math.ceil(s2 / step) * step; lat <= n2 + 1e-9; lat += step) {
    lines.push({ axis: 'lat', value: lat, coords: [[w, lat], [e, lat]], label: fmtGridDeg(lat, 'lat', step) });
  }
  return { step, lines };
}

/* ---------- MGRS / UTM grid ---------- */

const BANDS = 'CDEFGHJKLMNPQRSTUVWX';

/** Step in metres for a zoom level: 0 = zones only, then 100 km, 10 km, 1 km. */
export const mgrsStep = (zoom) => (zoom < 5.5 ? 0 : zoom < 8.5 ? 100000 : zoom < 11.5 ? 10000 : 1000);

/**
 * MGRS grid for a view {w,s,e,n} at a zoom level.
 * Returns zone/band boundaries, grid lines (major every 10 steps) and labels:
 *   zone labels (36U), 100 km square letters (UU), and edge numbers in km within the square.
 */
export function mgrsGrid({ w, s, e, n }, zoom) {
  const s2 = Math.max(s, -80), n2 = Math.min(n, 84);
  const out = { zones: [], lines: [], labels: [] };
  if (s2 >= n2) return out;
  const w2 = Math.max(w, -180), e2 = Math.min(e, 180);

  // Zone meridians and latitude bands.
  for (let lon = Math.ceil((w2 + 180) / 6) * 6 - 180; lon <= e2; lon += 6) out.zones.push([[lon, s2], [lon, n2]]);
  for (let lat = Math.ceil((s2 + 80) / 8) * 8 - 80; lat <= n2 && lat <= 72; lat += 8) out.zones.push([[w2, lat], [e2, lat]]);

  const step = mgrsStep(zoom);
  const z0 = zoneOf(w2), z1 = zoneOf(Math.min(e2, 179.9999));
  for (let zone = z0; zone <= z1; zone++) {
    const lo = Math.max(w2, zoneCentre(zone) - 3), hi = Math.min(e2, zoneCentre(zone) + 3);
    if (hi <= lo) continue;
    // Zone labels: one per band cell in view, while the view is wide.
    if (zoom < 9) {
      for (let lat = Math.floor((s2 + 80) / 8) * 8 - 80; lat < n2; lat += 8) {
        const cLat = Math.min(Math.max(lat + 4, s2 + 0.5), n2 - 0.5);
        const band = BANDS[Math.min(19, Math.floor((cLat + 80) / 8))];
        out.labels.push({ kind: 'zone', lon: (lo + hi) / 2, lat: cLat, text: `${zone}${band}` });
      }
    }
    if (!step) continue;

    // UTM extent of the visible part of the zone.
    const probe = [];
    for (const lat of [s2, (s2 + n2) / 2, n2]) for (const lon of [lo, (lo + hi) / 2, hi]) probe.push(utmForward(lat, lon, zone));
    const minE = Math.min(...probe.map((p) => p[0])), maxE = Math.max(...probe.map((p) => p[0]));
    const minN = Math.min(...probe.map((p) => p[1])), maxN = Math.max(...probe.map((p) => p[1]));
    let st = step;
    while (((maxE - minE) / st + (maxN - minN) / st) > 160) st *= 10; // keep it readable
    const inZone = ([lon, lat]) => lon >= lo - 1e-9 && lon <= hi + 1e-9 && lat >= s2 - 0.5 && lat <= n2 + 0.5;
    const SAMPLES = 24;
    const trace = (fn) => {
      const segs = []; let cur = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const p = fn(i / SAMPLES);
        if (inZone(p)) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; }
      }
      if (cur.length > 1) segs.push(cur);
      return segs.filter((x) => x.length > 1);
    };
    const kmLabel = (v) => (st >= 100000 ? null : String(Math.round(mod(v, 100000) / 1000)).padStart(2, '0'));

    for (let E = Math.ceil(minE / st) * st; E <= maxE; E += st) {
      const major = mod(E, st * 10) === 0 || st === 100000;
      for (const coords of trace((f) => utmInverse(E, minN + (maxN - minN) * f, zone))) {
        out.lines.push({ axis: 'e', coords, major, label: kmLabel(E) });
      }
    }
    for (let N = Math.ceil(minN / st) * st; N <= maxN; N += st) {
      const major = mod(N, st * 10) === 0 || st === 100000;
      for (const coords of trace((f) => utmInverse(minE + (maxE - minE) * f, N, zone))) {
        out.lines.push({ axis: 'n', coords, major, label: kmLabel(N) });
      }
    }

    // 100 km square letters at square centres.
    if (zoom >= 5.5 && zoom < 12) {
      for (let E = Math.floor(minE / 1e5) * 1e5; E <= maxE; E += 1e5) {
        for (let N = Math.floor(minN / 1e5) * 1e5; N <= maxN; N += 1e5) {
          const [lon, lat] = utmInverse(E + 5e4, N + 5e4, zone);
          if (!inZone([lon, lat]) || lat < -80 || lat > 84) continue;
          try {
            const id = mgrs.forward([lon, lat], 0); // "36UUA"
            out.labels.push({ kind: 'square', lon, lat, text: zoom < 8.5 ? id.slice(-2) : `${id.slice(0, -2)} ${id.slice(-2)}` });
          } catch { /* outside MGRS */ }
        }
      }
    }
  }
  return out;
}
