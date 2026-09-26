#!/usr/bin/env node
// Downloads the detailed vector map for the Map module onto this server:
//   <out>/basemap.pmtiles   — OpenStreetMap vector tiles (Protomaps basemap), cut to --bbox
//   <out>/fonts/…, <out>/sprites/… — label fonts and map icons used by the style
//   <out>/manifest.json     — what is installed, from which build and when
// The app serves these as static files (nginx range requests); no tile server is needed.
// Needs the `pmtiles` CLI (github.com/protomaps/go-pmtiles); it is fetched automatically on Linux/macOS.
//
//   node scripts/maps/fetch-basemap.mjs [--bbox 19.5,43.2,41.5,53.8] [--maxzoom 15] [--out public/tiles] [--build 20260920]
//
// Map data © OpenStreetMap contributors (ODbL); basemap schema and assets © Protomaps (BSD-3 / OFL fonts).
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const bbox = arg('bbox', '19.5,43.2,41.5,53.8');
const maxzoom = arg('maxzoom', '15');
const out = path.resolve(arg('out', 'public/tiles'));
const binDir = path.resolve('.cache/bin');
const ASSETS = 'https://raw.githubusercontent.com/protomaps/basemaps-assets/main';
const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
// Glyph ranges covering Latin, Latin Extended, Greek, Cyrillic and general punctuation.
const RANGES = ['0-255', '256-511', '512-767', '768-1023', '1024-1279', '1280-1535', '8192-8447', '8448-8703'];

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
}

async function pmtilesBin() {
  if (spawnSync('pmtiles', ['version']).status === 0) return 'pmtiles';
  const local = path.join(binDir, 'pmtiles');
  try { await fs.access(local); return local; } catch { /* fetch it */ }
  const rel = await (await fetch('https://api.github.com/repos/protomaps/go-pmtiles/releases/latest')).json();
  const osName = { linux: 'Linux', darwin: 'Darwin' }[os.platform()];
  const arch = { x64: 'x86_64', arm64: 'arm64' }[os.arch()];
  const asset = rel.assets?.find((a) => a.name.includes(osName) && a.name.includes(arch) && /\.(tar\.gz|zip)$/.test(a.name));
  if (!asset) throw new Error(`No go-pmtiles build for ${os.platform()}/${os.arch()}: install it from https://github.com/protomaps/go-pmtiles/releases`);
  const archive = path.join(binDir, asset.name);
  console.log(`Downloading ${asset.name}…`);
  await download(asset.browser_download_url, archive);
  if (archive.endsWith('.zip')) execFileSync('unzip', ['-o', archive, '-d', binDir]);
  else execFileSync('tar', ['-xzf', archive, '-C', binDir]);
  return local;
}

// The newest daily planet build published by Protomaps.
async function latestBuild() {
  if (arg('build')) return arg('build');
  try {
    const list = await (await fetch('https://build-metadata.protomaps.dev/builds.json')).json();
    const keys = (Array.isArray(list) ? list.map((b) => b.key || b) : Object.keys(list)).filter((k) => /^\d{8}\.pmtiles$/.test(k)).sort();
    if (keys.length) return keys[keys.length - 1].replace('.pmtiles', '');
  } catch { /* fall back to probing recent dates */ }
  for (let d = 0; d < 45; d++) {
    const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
    const res = await fetch(`https://build.protomaps.com/${day}.pmtiles`, { method: 'HEAD' });
    if (res.ok) return day;
  }
  throw new Error('No Protomaps build found in the last 45 days; pass --build YYYYMMDD');
}

const bin = await pmtilesBin();
const build = await latestBuild();
const source = `https://build.protomaps.com/${build}.pmtiles`;
const target = path.join(out, 'basemap.pmtiles');
const tmp = `${target}.part`;
await fs.mkdir(out, { recursive: true });
console.log(`Extracting ${bbox} up to z${maxzoom} from ${source}…`);
const r = spawnSync(bin, ['extract', source, tmp, `--bbox=${bbox}`, `--maxzoom=${maxzoom}`], { stdio: 'inherit' });
if (r.status !== 0) throw new Error('pmtiles extract failed');
await fs.rename(tmp, target);

console.log('Fetching fonts and icons…');
for (const font of FONTS) {
  for (const range of RANGES) await download(`${ASSETS}/fonts/${encodeURIComponent(font)}/${range}.pbf`, path.join(out, 'fonts', font, `${range}.pbf`));
}
for (const f of ['dark.json', 'dark.png', 'dark@2x.json', 'dark@2x.png']) await download(`${ASSETS}/sprites/v4/${f}`, path.join(out, 'sprites', f));

const { size } = await fs.stat(target);
const manifestPath = path.join(out, 'manifest.json');
let manifest = {};
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { /* new */ }
manifest.basemap = {
  file: 'basemap.pmtiles', build, bbox: bbox.split(',').map(Number), maxzoom: Number(maxzoom), bytes: size,
  fonts: 'fonts/{fontstack}/{range}.pbf', sprite: 'sprites/dark', updatedAt: new Date().toISOString(),
  attribution: '© OpenStreetMap contributors, Protomaps',
};
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Done: ${(size / 1e9).toFixed(2)} GB → ${target}`);
