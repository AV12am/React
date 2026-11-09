// The public site's icons for search engines, phones and tabs: the white mark on a dark tile (a transparent white
// SVG is invisible on Google's white results page). Run: node scripts/site-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync('public/site-icon.svg', 'utf8');
const inner = svg.slice(svg.indexOf('<g'), svg.lastIndexOf('</svg>')).replace(/<style>.*?<\/style>/s, '');
const tile = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
  <rect width="200" height="200" rx="${pad ? 44 : 0}" fill="#0a0a0a"/><g transform="translate(100 100) scale(0.78)" fill="#ffffff">${inner.replace(/fill="[^"]*"/g, '')}</g></svg>`;
const png = (size, rounded = true) => sharp(Buffer.from(tile(size, rounded))).png().toBuffer();
writeFileSync('public/site-icon-48.png', await png(48));
writeFileSync('public/site-icon-96.png', await png(96));
writeFileSync('public/site-icon-192.png', await png(192));
writeFileSync('public/site-icon-512.png', await png(512));
writeFileSync('public/apple-touch-icon.png', await png(180, false)); // iOS rounds the corners itself
// favicon.ico: one 48×48 PNG inside an ICO container (browsers and Google read it)
const p48 = await png(48);
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(48, 6); head.writeUInt8(48, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(p48.length, 14); head.writeUInt32LE(22, 18);
writeFileSync('public/favicon.ico', Buffer.concat([head, p48]));
console.log('site icons written');
