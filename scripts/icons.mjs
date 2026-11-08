// Every icon of the platform and CONTEXT News drawn from the two vector marks, in one place:
// white on the near-black tile (home screens, installed apps) — run `node scripts/icons.mjs` after a change.
// The tab icons (public/favicon.svg, public/site-icon.svg, public/context-icon.svg) follow the browser theme by themselves.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const INK = '#ededed';
const mark = readFileSync('public/favicon.svg', 'utf8').match(/<g[^>]*>([\s\S]*?)<\/g>/)[1]; // the eight petals and the core
const pen = readFileSync('public/context-icon.svg', 'utf8').match(/<path d="([^"]+)"[^>]*transform="([^"]+)"/);

const tile = (inner, size, scale) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f1f1f"/><stop offset="1" stop-color="#0f0f0f"/></linearGradient></defs>
<rect width="${size}" height="${size}" fill="url(#g)"/>
<g transform="translate(${size / 2} ${size / 2}) scale(${(size * scale) / 200})">${inner}</g></svg>`;

const reaction = `<g fill="${INK}" fill-rule="evenodd">${mark}</g>`;
// The pen sits in its own 82-unit box around (0, -60): moved to the centre and drawn at the mark's size.
const context = `<g transform="scale(2.2) translate(0 60)"><path d="${pen[1]}" fill="${INK}" fill-rule="evenodd" transform="${pen[2]}"/></g>`;

const out = [
  ['public/icons/icon-192.png', reaction, 192, 0.61],
  ['public/icons/icon-512.png', reaction, 512, 0.61],
  ['public/icons/maskable-512.png', reaction, 512, 0.48],
  ['public/icons/apple-touch-icon.png', reaction, 180, 0.61],
  ['public/news-img/context-192.png', context, 192, 0.61],
  ['public/news-img/context-512.png', context, 512, 0.61],
  ['public/news-img/context-maskable-512.png', context, 512, 0.48],
  ['public/news-img/context-touch.png', context, 180, 0.61],
];
for (const [file, inner, size, scale] of out) {
  await sharp(Buffer.from(tile(inner, size, scale))).png().toFile(file);
  console.log(file);
}
