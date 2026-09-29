// Builds the MapLibre style for the Map module from the app theme and whatever map data is installed.
//   Detailed mode: OpenStreetMap vector tiles (tiles/basemap.pmtiles), or OpenFreeMap when nothing is installed,
//   + terrain (tiles/terrain/…, or Terrain Tiles on AWS).
//   Fallback mode: Natural Earth countries bundled with the app, so the map always works.
// Country borders always come from our Natural Earth build (Crimea returned to Ukraine), never from the basemap.
import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps';
import { geoGraticule } from 'd3-geo';
import polygonClipping from 'polygon-clipping';

// Plain concatenation: URL() would percent-encode the {z}/{x}/{y} placeholders of tile templates.
export const tilesUrl = (p) => new URL('tiles/', document.baseURI).href + p;

/** Theme colours from CSS custom properties on `el`. */
export function palette(el) {
  const css = getComputedStyle(el);
  const c = (n) => css.getPropertyValue(`--${n}`).trim();
  return {
    sea: c('surface'), land: c('surface-3'), ua: c('line-strong'), border: c('line-control'), coast: c('ink-faint'),
    grid: c('line'), conflict: c('conflict'), ink: c('ink'), ink2: c('ink-2'), ink3: c('ink-3'), brass: c('brass'), bg: c('bg'),
  };
}

// OpenMapTiles schema (OpenFreeMap), drawn in the matte palette. Place names in Ukrainian where
// OpenStreetMap has them. Country boundaries are left out — ours are drawn on top (see header).
const UK_NAME = ['coalesce', ['get', 'name:uk'], ['get', 'name:latin'], ['get', 'name']];
function omtLayers(col, theme) {
  const src = 'omt';
  const paper = theme === 'paper';
  const road = { major: paper ? col.ink3 : col.border, minor: col.ua };
  const w = (a, b) => ['interpolate', ['exponential', 1.6], ['zoom'], 5, a, 16, b];
  const cls = (...c) => ['match', ['get', 'class'], c, true, false];
  const halo = { 'text-halo-color': col.sea, 'text-halo-width': 1.4, 'text-halo-blur': 0.3 };
  return [
    { id: 'landcover-wood', type: 'fill', source: src, 'source-layer': 'landcover', filter: cls('wood', 'forest'), paint: { 'fill-color': col.grid, 'fill-opacity': 0.55 } },
    { id: 'landuse-urban', type: 'fill', source: src, 'source-layer': 'landuse', minzoom: 8, filter: cls('residential', 'suburb', 'neighbourhood', 'commercial', 'industrial', 'retail'), paint: { 'fill-color': col.ua, 'fill-opacity': 0.35 } },
    { id: 'park', type: 'fill', source: src, 'source-layer': 'park', paint: { 'fill-color': col.grid, 'fill-opacity': 0.5 } },
    { id: 'water', type: 'fill', source: src, 'source-layer': 'water', filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': col.sea } },
    { id: 'waterway', type: 'line', source: src, 'source-layer': 'waterway', minzoom: 6, filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'line-color': col.sea, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 14, 2.5] } },
    { id: 'building', type: 'fill', source: src, 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': col.ua, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 0.8] } },
    { id: 'road-minor', type: 'line', source: src, 'source-layer': 'transportation', minzoom: 11, filter: cls('minor', 'service', 'track'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': road.minor, 'line-width': w(0.3, 5) } },
    { id: 'road-mid', type: 'line', source: src, 'source-layer': 'transportation', minzoom: 7, filter: cls('secondary', 'tertiary'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': road.minor, 'line-width': w(0.4, 8) } },
    { id: 'road-major', type: 'line', source: src, 'source-layer': 'transportation', minzoom: 5, filter: cls('primary', 'trunk', 'motorway'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': road.major, 'line-opacity': 0.8, 'line-width': w(0.5, 11) } },
    { id: 'rail', type: 'line', source: src, 'source-layer': 'transportation', minzoom: 9, filter: cls('rail'), paint: { 'line-color': road.major, 'line-opacity': 0.6, 'line-width': 0.8, 'line-dasharray': [3, 3] } },
    { id: 'boundary-region', type: 'line', source: src, 'source-layer': 'boundary', minzoom: 4, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': col.border, 'line-opacity': 0.6, 'line-width': 0.7, 'line-dasharray': [3, 2] } },
    // labels
    { id: 'water-name', type: 'symbol', source: src, 'source-layer': 'water_name', layout: { 'text-field': UK_NAME, 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'text-max-width': 6 }, paint: { 'text-color': col.ink3, ...halo } },
    { id: 'road-name', type: 'symbol', source: src, 'source-layer': 'transportation_name', minzoom: 13, layout: { 'symbol-placement': 'line', 'text-field': UK_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11 }, paint: { 'text-color': col.ink3, ...halo } },
    { id: 'place-minor', type: 'symbol', source: src, 'source-layer': 'place', minzoom: 11, filter: cls('suburb', 'quarter', 'neighbourhood', 'hamlet', 'isolated_dwelling'), layout: { 'text-field': UK_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-max-width': 7 }, paint: { 'text-color': col.ink3, ...halo } },
    { id: 'place-village', type: 'symbol', source: src, 'source-layer': 'place', minzoom: 9, filter: cls('village'), layout: { 'text-field': UK_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 13], 'text-max-width': 7 }, paint: { 'text-color': col.ink2, ...halo } },
    { id: 'place-town', type: 'symbol', source: src, 'source-layer': 'place', minzoom: 7, filter: cls('town'), layout: { 'text-field': UK_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 14, 15], 'text-max-width': 8 }, paint: { 'text-color': col.ink2, ...halo } },
    { id: 'place-city', type: 'symbol', source: src, 'source-layer': 'place', minzoom: 3, filter: cls('city'), layout: { 'text-field': UK_NAME, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 12, 18], 'text-max-width': 8, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] }, paint: { 'text-color': col.ink, ...halo } },
    { id: 'place-state', type: 'symbol', source: src, 'source-layer': 'place', minzoom: 5, maxzoom: 9, filter: cls('state', 'province'), layout: { 'text-field': UK_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-transform': 'uppercase', 'text-letter-spacing': 0.1, 'text-max-width': 8 }, paint: { 'text-color': col.ink3, ...halo } },
    { id: 'place-country', type: 'symbol', source: src, 'source-layer': 'place', maxzoom: 7, filter: cls('country'), layout: { 'text-field': UK_NAME, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 14], 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 7 }, paint: { 'text-color': col.ink2, ...halo } },
  ];
}

/** Background and Natural Earth land under the OpenFreeMap layers; see buildStyle. */
export function omtBase(col, baseOk) {
  const hide = { visibility: baseOk ? 'none' : 'visible' };
  return [
    { id: 'background', type: 'background', paint: { 'background-color': baseOk ? col.land : col.sea } },
    { id: 'land', type: 'fill', source: 'countries', layout: hide, paint: { 'fill-color': col.land } },
    { id: 'coast', type: 'line', source: 'coast', layout: hide, paint: { 'line-color': col.coast, 'line-width': 0.8 } },
  ];
}

// Protomaps' dark/light flavours, recoloured to the matte palette: land and water from our surfaces,
// labels in our inks; roads and landuse keep the flavour's own greys.
function flavor(col, theme) {
  const f = { ...namedFlavor(theme === 'paper' ? 'light' : 'dark') };
  Object.assign(f, {
    background: col.land, earth: col.land, water: col.sea, boundaries: col.border,
    city_label: col.ink, city_label_halo: col.sea, subplace_label: col.ink2, subplace_label_halo: col.sea,
    state_label: col.ink3, state_label_halo: col.sea, country_label: col.ink2, ocean_label: col.ink3,
    roads_label_major: col.ink2, roads_label_major_halo: col.sea, roads_label_minor: col.ink3, roads_label_minor_halo: col.sea,
    address_label: col.ink3, address_label_halo: col.sea,
  });
  return f;
}

export function graticule(zoom) {
  const step = zoom >= 8 ? 0.5 : zoom >= 6 ? 1 : zoom >= 4 ? 5 : 15;
  return { type: 'Feature', properties: { step }, geometry: geoGraticule().step([step, step]).extentMinor([[-180, -85], [180, 85]])() };
}

const toPolys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

/**
 * Conflict zones as ready-to-draw GeoJSON: country-wide zones take the country shape; drawn outlines are cut
 * to land (to Ukraine for the occupied territories), so a loose outline never paints the sea or a neighbour.
 */
export function zonesGeoJSON(zones, countries) {
  const features = [];
  for (const z of zones) {
    let polys;
    if (z.country) {
      const f = countries.features.find((c) => c.id === z.country);
      polys = f ? toPolys(f.geometry) : [];
    } else if (z.live) {
      polys = z.feature.features.flatMap((f) => toPolys(f.geometry)); // live data already follows the borders
    } else {
      const [[w, s], [e, n]] = z.bbox;
      const land = z.clip === 'ukraine'
        ? countries.features.filter((c) => c.id === '804')
        : countries.features.filter((c) => {
          const [[cw, cs], [ce, cn]] = c.properties.bbox;
          return cw <= e && ce >= w && cs <= n && cn >= s;
        });
      try {
        polys = polygonClipping.intersection(toPolys(z.feature.geometry), polygonClipping.union(...land.map((c) => toPolys(c.geometry))));
      } catch { polys = toPolys(z.feature.geometry); }
    }
    if (polys.length) features.push({ type: 'Feature', properties: { id: z.id, name: z.name }, geometry: { type: 'MultiPolygon', coordinates: polys } });
  }
  return { type: 'FeatureCollection', features };
}

export function eventsGeoJSON(events) {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      properties: { id: e.id, r: 3 + Math.min(6, Math.sqrt(e.fatalities || 0)) },
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
    })),
  };
}

/**
 * @param col     palette()
 * @param theme   'matte' | 'paper'
 * @param tiles   installed map data: { basemap?, terrain? } (manifests), or {}
 * @param data    { countries, borders, coast, ua, zones, events, graticule, selectedEvent }
 * @param layers  visibility toggles from the UI
 */
export function buildStyle({ col, theme, tiles, data, layers, baseOk = false }) {
  const vis = (on) => (on ? 'visible' : 'none');
  const detailed = !!tiles.basemap;
  const sources = {
    borders: { type: 'geojson', data: data.borders },
    ua: { type: 'geojson', data: data.ua },
    zones: { type: 'geojson', data: data.zones },
    events: { type: 'geojson', data: data.events },
    graticule: { type: 'geojson', data: data.graticule },
  };
  const style = { version: 8, sources, layers: [] };
  let baseLayers = [];
  let labelLayers = [];

  if (detailed && tiles.basemap.kind === 'openfreemap') {
    sources.omt = {
      type: 'vector', url: tiles.basemap.url,
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://openfreemap.org">OpenFreeMap</a>, OpenMapTiles',
    };
    style.glyphs = tiles.basemap.glyphs;
    sources.countries = { type: 'geojson', data: data.countries };
    sources.coast = { type: 'geojson', data: data.coast };
    const all = omtLayers(col, theme);
    // Our Natural Earth land sits underneath so the map still reads if OpenFreeMap is unreachable;
    // once its tiles arrive (baseOk) the background turns to land and OSM water draws the coasts.
    baseLayers = [
      ...omtBase(col, baseOk),
      ...all.filter((l) => l.type !== 'symbol'),
    ];
    labelLayers = all.filter((l) => l.type === 'symbol');
  } else if (detailed) {
    sources.protomaps = {
      type: 'vector', url: `pmtiles://${tilesUrl(tiles.basemap.file)}`,
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>, Protomaps',
    };
    style.glyphs = tilesUrl('fonts/{fontstack}/{range}.pbf');
    style.sprite = tilesUrl('sprites/dark');
    const all = protomapsLayers('protomaps', flavor(col, theme), { lang: 'uk' })
      .filter((l) => l.id !== 'boundaries_country'); // ours instead: see header
    baseLayers = all.filter((l) => l.type !== 'symbol');
    labelLayers = all.filter((l) => l.type === 'symbol');
  } else {
    sources.countries = { type: 'geojson', data: data.countries };
    sources.coast = { type: 'geojson', data: data.coast };
    baseLayers = [
      { id: 'background', type: 'background', paint: { 'background-color': col.sea } },
      { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': col.land } },
      { id: 'ua-fill', type: 'fill', source: 'ua', paint: { 'fill-color': col.ua } },
      { id: 'coast', type: 'line', source: 'coast', paint: { 'line-color': col.coast, 'line-width': 0.8 } },
    ];
  }

  if (tiles.terrain) {
    const t = tiles.terrain;
    sources.dem = {
      type: 'raster-dem', tiles: [t.tiles || tilesUrl('terrain/{z}/{x}/{y}.webp')], tileSize: t.tileSize || 256, encoding: 'terrarium',
      minzoom: t.minzoom, maxzoom: t.maxzoom, bounds: t.bounds,
      attribution: t.attribution || 'Copernicus DEM © DLR, Airbus DS, ESA',
    };
    const hill = {
      id: 'hillshade', type: 'hillshade', source: 'dem', layout: { visibility: vis(layers.relief) },
      paint: {
        'hillshade-exaggeration': theme === 'paper' ? 0.35 : 0.5,
        'hillshade-shadow-color': theme === 'paper' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.55)',
        'hillshade-highlight-color': theme === 'paper' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)',
        'hillshade-accent-color': 'rgba(0,0,0,0)',
      },
    };
    // Relief sits under water and roads so it reads as ground, not as a veil.
    const at = baseLayers.findIndex((l) => l.id === 'water' || l.id === 'coast');
    baseLayers.splice(at < 0 ? baseLayers.length : at, 0, hill);
  }

  style.layers = [
    ...baseLayers,
    { id: 'graticule', type: 'line', source: 'graticule', layout: { visibility: vis(layers.graticule) }, paint: { 'line-color': col.grid, 'line-width': 1 } },
    { id: 'zones-fill', type: 'fill', source: 'zones', layout: { visibility: vis(layers.conflicts) }, paint: { 'fill-color': col.conflict, 'fill-opacity': 0.34 } },
    { id: 'zones-line', type: 'line', source: 'zones', layout: { visibility: vis(layers.conflicts) }, paint: { 'line-color': col.conflict, 'line-width': 1.2, 'line-opacity': 0.9 } },
    { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': detailed ? col.ink3 : col.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 10, 1.6] } },
    { id: 'ua-outline', type: 'line', source: 'ua', paint: { 'line-color': col.ink3, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.1, 10, 2.2] } },
    {
      id: 'events', type: 'circle', source: 'events', layout: { visibility: vis(layers.events) },
      paint: {
        'circle-radius': ['get', 'r'],
        'circle-color': ['case', ['==', ['get', 'id'], data.selectedEvent || ''], col.brass, col.conflict],
        'circle-opacity': 0.85, 'circle-stroke-color': col.sea, 'circle-stroke-width': 1,
      },
    },
    ...labelLayers,
  ];
  return style;
}
