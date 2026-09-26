#!/usr/bin/env node
// Builds elevation tiles for the map from the Copernicus DEM (public AWS open-data bucket).
// Output: <out>/{z}/{x}/{y}.webp — Terrarium-encoded (lossless WebP), read by MapLibre as a
// raster-dem source for hillshading and the elevation readout; plus <out>/manifest.json.
// No GDAL needed. Downloaded source rasters are cached, so re-runs are cheap.
//
//   node scripts/maps/build-terrain.mjs [--bbox 19.5,43.2,41.5,53.8] [--minzoom 5] [--maxzoom 10]
//                                       [--dataset 90|30] [--out public/tiles/terrain] [--cache .cache/dem]
//
// Copernicus DEM © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018,
// provided under COPERNICUS by the European Union and ESA; all rights reserved.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import sharp from 'sharp';

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const bbox = arg('bbox', '19.5,43.2,41.5,53.8').split(',').map(Number);
const minZ = Number(arg('minzoom', 5));
const maxZ = Number(arg('maxzoom', 10));
const dataset = arg('dataset', '90');
const out = path.resolve(arg('out', 'public/tiles/terrain'));
const cacheDir = path.resolve(arg('cache', '.cache/dem'));
const TILE = 256;
const [W, S, E, N] = bbox;

const RES = dataset === '30' ? '10' : '30'; // file code: 10 = 1 arc-second (30 m), 30 = 3 arc-seconds (90 m)
const BUCKET = `https://copernicus-dem-${dataset}m.s3.amazonaws.com`;
const cellName = (lat, lon) => {
  const ns = lat >= 0 ? `N${String(lat).padStart(2, '0')}` : `S${String(-lat).padStart(2, '0')}`;
  const ew = lon >= 0 ? `E${String(lon).padStart(3, '0')}` : `W${String(-lon).padStart(3, '0')}`;
  return `Copernicus_DSM_COG_${RES}_${ns}_00_${ew}_00_DEM`;
};

/* ---------- source rasters: 1°×1° cells, downloaded once, a few kept in memory ---------- */

const cells = new Map(); // key → Promise<{width,height,data}|null>
const order = [];
const MAX_CELLS = 16;

async function download(name) {
  const file = path.join(cacheDir, `${name}.tif`);
  try { return await fs.readFile(file); } catch { /* not cached */ }
  const missing = path.join(cacheDir, `${name}.none`);
  try { await fs.access(missing); return null; } catch { /* not known missing */ }
  const res = await fetch(`${BUCKET}/${name}/${name}.tif`);
  if (res.status === 404 || res.status === 403) { await fs.writeFile(missing, ''); return null; } // open sea: no file
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(file, buf);
  return buf;
}

function cell(lat, lon) {
  const key = `${lat},${lon}`;
  if (!cells.has(key)) {
    cells.set(key, (async () => {
      const buf = await download(cellName(lat, lon));
      if (!buf) return null;
      const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const img = await tiff.getImage();
      const [data] = await img.readRasters({ samples: [0] });
      return { width: img.getWidth(), height: img.getHeight(), data };
    })());
    order.push(key);
    while (order.length > MAX_CELLS) cells.delete(order.shift());
  }
  return cells.get(key);
}

// Bilinear elevation (metres) at lon/lat inside an already-loaded cell.
function sample(c, lat0, lon0, lat, lon) {
  if (!c) return 0;
  const fx = (lon - lon0) * (c.width - 1);
  const fy = (lat0 + 1 - lat) * (c.height - 1);
  const x0 = Math.max(0, Math.min(c.width - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(c.height - 2, Math.floor(fy)));
  const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
  const i = y0 * c.width + x0;
  const d = c.data;
  const v = (d[i] * (1 - tx) + d[i + 1] * tx) * (1 - ty) + (d[i + c.width] * (1 - tx) + d[i + c.width + 1] * tx) * ty;
  return Number.isFinite(v) && v > -500 ? v : 0;
}

/* ---------- web mercator tiles ---------- */

const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
const y2lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

async function renderTile(z, x, y) {
  const px = Buffer.alloc(TILE * TILE * 3);
  // Supersample 2×2 per pixel at low zooms so a pixel averages the terrain it covers.
  const ss = z < 9 ? 2 : 1;
  const lats = new Float64Array(TILE * ss), lons = new Float64Array(TILE * ss);
  for (let i = 0; i < TILE * ss; i++) {
    lats[i] = y2lat(y + (i + 0.5) / (TILE * ss), z);
    lons[i] = x2lon(x + (i + 0.5) / (TILE * ss), z);
  }
  // Load every source cell this tile touches.
  const need = new Set();
  // Only cells inside the requested area are fetched; a low-zoom tile spans several degrees beyond it.
  const inArea = (la, lo) => la >= Math.floor(S) && la < Math.ceil(N) && lo >= Math.floor(W) && lo < Math.ceil(E);
  for (let la = Math.floor(lats[lats.length - 1]); la <= Math.floor(lats[0]); la++) {
    for (let lo = Math.floor(lons[0]); lo <= Math.floor(lons[lons.length - 1]); lo++) if (inArea(la, lo)) need.add(`${la},${lo}`);
  }
  const loaded = new Map();
  await Promise.all([...need].map(async (k) => { const [la, lo] = k.split(',').map(Number); loaded.set(k, await cell(la, lo)); }));

  let any = false;
  for (let py = 0; py < TILE; py++) {
    for (let pxl = 0; pxl < TILE; pxl++) {
      let sum = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const lat = lats[py * ss + sy], lon = lons[pxl * ss + sx];
        const la = Math.floor(lat), lo = Math.floor(lon);
        sum += sample(loaded.get(`${la},${lo}`), la, lo, lat, lon);
      }
      const h = sum / (ss * ss);
      if (h !== 0) any = true;
      // Terrarium: height = R·256 + G + B/256 − 32768
      const v = Math.max(0, Math.min(65535.99, h + 32768));
      const o = (py * TILE + pxl) * 3;
      px[o] = Math.floor(v / 256);
      px[o + 1] = Math.floor(v) % 256;
      px[o + 2] = Math.floor((v - Math.floor(v)) * 256);
    }
  }
  const file = path.join(out, String(z), String(x), `${y}.webp`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await sharp(px, { raw: { width: TILE, height: TILE, channels: 3 } }).webp({ lossless: true, effort: 4 }).toFile(file);
  return any;
}

await fs.mkdir(cacheDir, { recursive: true });
await fs.mkdir(out, { recursive: true });
let count = 0;
const t0 = Date.now();
for (let z = minZ; z <= maxZ; z++) {
  const x0 = Math.floor(lon2x(W, z)), x1 = Math.floor(lon2x(E, z) - 1e-9);
  const y0 = Math.floor(lat2y(N, z)), y1 = Math.floor(lat2y(S, z) - 1e-9);
  const total = (x1 - x0 + 1) * (y1 - y0 + 1);
  let done = 0;
  // Row by row, so neighbouring tiles reuse the same cached source cells.
  for (let y = y0; y <= y1; y++) {
    const row = [];
    for (let x = x0; x <= x1; x++) row.push(x);
    for (let i = 0; i < row.length; i += 4) {
      await Promise.all(row.slice(i, i + 4).map((x) => renderTile(z, x, y)));
      done += Math.min(4, row.length - i);
    }
    process.stdout.write(`\rz${z}: ${done}/${total} tiles`);
  }
  count += total;
  process.stdout.write('\n');
}
const manifest = {
  format: 'webp', encoding: 'terrarium', tileSize: TILE, minzoom: minZ, maxzoom: maxZ, bounds: bbox,
  dataset: `Copernicus DEM GLO-${dataset}`, tiles: count, builtAt: new Date().toISOString(),
  attribution: 'Рельєф: Copernicus DEM © DLR e.V., © Airbus Defence and Space GmbH, ESA',
};
await fs.writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
// Register in the shared tiles/manifest.json the app reads (one request, no 404 when nothing is installed).
const shared = path.join(path.dirname(out), 'manifest.json');
let all = {};
try { all = JSON.parse(await fs.readFile(shared, 'utf8')); } catch { /* new */ }
all.terrain = { ...manifest, path: path.basename(out) };
await fs.writeFile(shared, `${JSON.stringify(all, null, 2)}\n`);
console.log(`Done: ${count} tiles in ${Math.round((Date.now() - t0) / 1000)} s → ${out}`);
