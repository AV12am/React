import { useEffect, useState } from 'react';
import { tilesUrl } from './style.js';

// Which map data is installed next to the app (see scripts/maps/). Missing files are normal.
export function useInstalledTiles() {
  const [tiles, setTiles] = useState({ loaded: false });
  useEffect(() => {
    let alive = true;
    const get = (p) => fetch(tilesUrl(p), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    get('manifest.json').then((m) => {
      if (alive) setTiles({ loaded: true, basemap: m?.basemap || null, terrain: m?.terrain || null });
    });
    return () => { alive = false; };
  }, []);
  return tiles;
}

/* ---------- elevation under the cursor, read from the terrain tiles ---------- */

const cache = new Map(); // "z/x/y" → Promise<Uint8ClampedArray|null>
function tilePixels(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(tilesUrl(`terrain/${key}.webp`))
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
  const z = terrain.maxzoom;
  const fx = ((lon + 180) / 360) * 2 ** z;
  const r = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
  const tile = await tilePixels(z, Math.floor(fx), Math.floor(fy));
  if (!tile) return null;
  const px = Math.min(tile.size - 1, Math.floor((fx % 1) * tile.size));
  const py = Math.min(tile.size - 1, Math.floor((fy % 1) * tile.size));
  const i = (py * tile.size + px) * 4;
  return Math.round(tile.data[i] * 256 + tile.data[i + 1] + tile.data[i + 2] / 256 - 32768);
}
