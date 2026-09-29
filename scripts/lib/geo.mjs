// Geometry helpers shared by the conflict-data updater and its tests.
import { geoArea, geoBounds } from 'd3-geo';

const round = (n, p) => Math.round(n * 10 ** p) / 10 ** p;

function roundCoords(c, p) {
  return typeof c[0] === 'number' ? [round(c[0], p), round(c[1], p)] : c.map((x) => roundCoords(x, p));
}

// d3 wants exterior rings clockwise; RFC 7946 GeoJSON is counter-clockwise. A polygon whose
// area comes out larger than a hemisphere is wound the other way: reverse its rings.
function rewindPolygon(rings) {
  const area = geoArea({ type: 'Polygon', coordinates: rings });
  return area > 2 * Math.PI ? rings.map((r) => r.slice().reverse()) : rings;
}

/** Keeps only polygonal features, winds them for d3, rounds coordinates. */
export function normalizePolygons(features, precision = 4) {
  const out = [];
  for (const f of features || []) {
    const g = f?.geometry;
    if (!g) continue;
    let coordinates;
    if (g.type === 'Polygon') coordinates = [rewindPolygon(roundCoords(g.coordinates, precision))];
    else if (g.type === 'MultiPolygon') coordinates = g.coordinates.map((p) => rewindPolygon(roundCoords(p, precision)));
    else continue;
    out.push({ type: 'Feature', properties: f.properties || {}, geometry: { type: 'MultiPolygon', coordinates } });
  }
  return out;
}

/** True when every feature's bounding box lies inside [west, south, east, north]. */
export function withinBounds(features, [w, s, e, n]) {
  return features.every((f) => {
    const [[x0, y0], [x1, y1]] = geoBounds(f);
    return x0 >= w && x1 <= e && y0 >= s && y1 <= n;
  });
}

/** Keeps only the polygons (parts of each MultiPolygon) whose bounding box lies inside the box; drops empty features. */
export function clipToBounds(features, box) {
  const out = [];
  for (const f of features) {
    const parts = f.geometry.coordinates.filter((rings) => withinBounds([{ type: 'Feature', geometry: { type: 'Polygon', coordinates: rings } }], box));
    if (parts.length) out.push({ ...f, geometry: { type: 'MultiPolygon', coordinates: parts } });
  }
  return out;
}

export const totalArea = (features) => features.reduce((a, f) => a + geoArea(f), 0);
