// Builds the world map data used by the Map module from Natural Earth (world-atlas):
//  - Crimea is returned to Ukraine (Natural Earth draws it inside Russia);
//  - rings wound the wrong way (they would cover the whole sphere) are reversed;
//  - every country gets its Ukrainian name.
// Run: node scripts/build-map.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoContains, geoArea } from 'd3-geo';

const require = createRequire(import.meta.url);
const countries = require('i18n-iso-countries');
countries.registerLocale(require('i18n-iso-countries/langs/uk.json'));

const CRIMEA = [[34.10, 44.95], [33.52, 44.60], [36.47, 45.36], [33.37, 45.19], [35.38, 45.03], [32.95, 45.35]];
const UA = '804', RU = '643';

function build(res) {
  const topo = JSON.parse(fs.readFileSync(`node_modules/world-atlas/countries-${res}.json`, 'utf8'));
  const geoms = topo.objects.countries.geometries;
  const polys = (g) => (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []);
  const asFeature = (arcs) => feature(topo, { type: 'Polygon', arcs });

  // Reverse rings of any polygon whose area exceeds a hemisphere.
  let reversed = 0;
  for (const g of geoms) {
    const list = polys(g).map((p) => {
      if (geoArea(asFeature(p)) <= 2 * Math.PI) return p;
      reversed++;
      return p.map((ring) => ring.slice().reverse().map((i) => ~i));
    });
    if (g.type === 'Polygon') g.arcs = list[0];
    else if (g.type === 'MultiPolygon') g.arcs = list;
  }

  // Move Crimean polygons from Russia to Ukraine.
  const ru = geoms.find((g) => g.id === RU);
  const ua = geoms.find((g) => g.id === UA);
  const ruPolys = polys(ru);
  const crimea = ruPolys.filter((p) => CRIMEA.some((pt) => geoContains(asFeature(p), pt)));
  const rest = ruPolys.filter((p) => !crimea.includes(p));
  ru.type = 'MultiPolygon'; ru.arcs = rest;
  const uaPolys = polys(ua);
  ua.type = 'MultiPolygon'; ua.arcs = [...uaPolys, ...crimea];

  for (const g of geoms) {
    const a2 = g.id && countries.numericToAlpha2(g.id);
    g.properties = { name: g.properties.name, uk: (a2 && countries.getName(a2, 'uk')) || g.properties.name };
  }
  // Checks
  const fc = feature(topo, topo.objects.countries);
  const who = (pt) => fc.features.filter((f) => geoContains(f, pt)).map((f) => f.properties.uk).join('/');
  const check = CRIMEA.map(who);
  if (check.some((c) => c !== 'Україна')) throw new Error(`${res}: Crimea check failed: ${check}`);
  if (who([30.52, 50.45]) !== 'Україна') throw new Error(`${res}: Kyiv check failed`);
  fs.writeFileSync(`src/data/world-${res}.json`, JSON.stringify(topo));
  console.log(`${res}: moved ${crimea.length} Crimean polygon(s) to Ukraine, reversed ${reversed} ring(s), ${fc.features.length} countries; Kyiv/Crimea → ${who([30.52, 50.45])}/${check[0]}`);
}
build('110m');
build('50m');
build('10m');
