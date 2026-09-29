import { useEffect, useState } from 'react';
import { tilesUrl } from './style.js';

// Public fallbacks when nothing is installed next to the app (e.g. on Vercel):
//   basemap — OpenFreeMap: OpenStreetMap vector tiles, free, no key (https://openfreemap.org);
//   terrain — Terrain Tiles on AWS Open Data (Mapzen terrarium encoding).
// Requests go to those hosts and reveal which areas are being viewed. A self-hosted install
// turns them off with "online": false in public/tiles/manifest.json.
export const ONLINE_BASEMAP = {
  kind: 'openfreemap',
  build: 'OpenFreeMap',
  url: 'https://tiles.openfreemap.org/planet',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
};
export const ONLINE_TERRAIN = {
  kind: 'aws',
  dataset: 'Terrain Tiles (AWS Open Data)',
  tiles: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  tileSize: 256, minzoom: 0, maxzoom: 15, readZoom: 11, bounds: [-180, -85.05, 180, 85.05],
  attribution: 'Terrain Tiles: Mapzen, AWS Open Data',
};

// Which map data is installed next to the app (see scripts/maps/). Missing files are normal.
export function useInstalledTiles() {
  const [tiles, setTiles] = useState({ loaded: false });
  useEffect(() => {
    let alive = true;
    const get = (p) => fetch(tilesUrl(p), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    get('manifest.json').then((m) => {
      const online = m?.online !== false;
      if (alive) {
        setTiles({
          loaded: true,
          basemap: m?.basemap || (online ? ONLINE_BASEMAP : null),
          terrain: m?.terrain || (online ? ONLINE_TERRAIN : null),
        });
      }
    });
    return () => { alive = false; };
  }, []);
  return tiles;
}

/** Tile URL template for a terrain manifest: installed next to the app, or a public source. */
export const terrainTiles = (t) => t.tiles || tilesUrl('terrain/{z}/{x}/{y}.webp');

/* ---------- elevation under the cursor, read from the terrain tiles ---------- */

const cache = new Map(); // "url" → Promise<{size, data}|null>
function tilePixels(template, z, x, y) {
  const key = template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  if (!cache.has(key)) {
    cache.set(key, fetch(key)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? createImageBitmap(b) : null))
      .then((img) => {
        if (!img) return null;
        const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.width, img.height) : Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        return { size: img.width, data: g.getImageData(0, 0, img.width, img.height).data };
      })
      .catch(() => null));
    if (cache.size > 64) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

/** Metres above sea level at lat/lon, or null outside the installed terrain. */
export async function elevationAt(terrain, lat, lon) {
  if (!terrain) return null;
  const [w, s, e, n] = terrain.bounds;
  if (lon < w || lon > e || lat < s || lat > n) return null;
  const z = terrain.readZoom ?? terrain.maxzoom;
  const fx = ((lon + 180) / 360) * 2 ** z;
  const r = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
  const tile = await tilePixels(terrainTiles(terrain), z, Math.floor(fx), Math.floor(fy));
  if (!tile) return null;
  const px = Math.min(tile.size - 1, Math.floor((fx % 1) * tile.size));
  const py = Math.min(tile.size - 1, Math.floor((fy % 1) * tile.size));
  const i = (py * tile.size + px) * 4;
  return Math.round(tile.data[i] * 256 + tile.data[i + 1] + tile.data[i + 2] / 256 - 32768);
}
