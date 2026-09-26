// Generates the VOLOSHYNSKY cornflower mark (8 nib petals + centre diamond) as SVG.
const R = 96;
const petal = [[0,-1],[0.14,-0.6],[0.025,-0.24],[0,-0.28],[-0.025,-0.24],[-0.14,-0.6]];
const slit = [[0,-0.9],[0.008,-0.68],[0.032,-0.58],[0.008,-0.48],[0,-0.34],[-0.008,-0.48],[-0.032,-0.58],[-0.008,-0.68]];
const scales = [1, 0.92, 1, 0.92, 1, 0.92, 1, 0.92];
const f = n => +n.toFixed(2);
function poly(pts, a, s) {
  const c = Math.cos(a), si = Math.sin(a);
  return 'M' + pts.map(([x, y]) => { x *= R * s; y *= R * s; return `${f(x*c - y*si)} ${f(x*si + y*c)}`; }).join('L') + 'Z';
}
export function petals() {
  return scales.map((s, i) => { const a = i * Math.PI / 4; return poly(petal, a, s) + poly(slit, a, s); });
}
export const core = `M0 ${-0.09*R}L${0.09*R} 0L0 ${0.09*R}L${-0.09*R} 0Z`;
export function svg(ink = '#0A0A0A', bg = null, size = 200) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" width="${size}" height="${size}">` +
    (bg ? `<rect x="-100" y="-100" width="200" height="200" fill="${bg}"/>` : '') +
    `<g fill="${ink}" fill-rule="evenodd">${petals().map(d => `<path d="${d}"/>`).join('')}<path d="${core}"/></g></svg>`;
}
if (process.argv[2]) {
  const fs = await import('node:fs');
  const out = process.argv[2];
  fs.writeFileSync(`${out}/voloshka-black.svg`, svg('#0A0A0A'));
  fs.writeFileSync(`${out}/voloshka-white.svg`, svg('#FFFFFF'));
  fs.writeFileSync(`${out}/voloshka-graphite.svg`, svg('#5A5A5A'));
  fs.writeFileSync(`${out}/voloshka-brass.svg`, svg('#B8975E'));
  fs.writeFileSync(`${out}/mark-paths.json`, JSON.stringify({ petals: petals(), core }, null, 1));
}
