// Run: node scripts/plates.mjs > plates.json — the SVG of each plate, set into src/site/partials/header.html and site.html.
// Engraved «plates» for the public site: hand-built line drawings in one stroke weight, hatching for tone, the
// REACTION mark where it belongs. Prints the SVG of each so it can be set into the HTML as it is (no script to run).
const f = (n) => Number(n.toFixed(1));
// the mark: 8 petals and the core diamond (the same geometry as the logo), scaled and placed
const PETAL = 'M0 -96L13.44 -57.6L2.4 -23.04L0 -26.88L-2.4 -23.04L-13.44 -57.6Z';
const mark = (cx, cy, s, cls = 'pm') => `<g class="${cls}" transform="translate(${cx} ${cy}) scale(${s})">${Array.from({ length: 8 }, (_, i) => `<path d="${PETAL}" transform="rotate(${i * 45})"/>`).join('')}<path d="M0 -8.64L8.64 0L0 8.64L-8.64 0Z"/></g>`;
const hatch = (id, gap = 3, ang = 45) => `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})"><line x1="0" y1="0" x2="0" y2="${gap}" class="ht"/></pattern>`;
const ln = (x1, y1, x2, y2, cls = '') => `<line${cls ? ` class="${cls}"` : ''} x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
const tx = (x, y, s, cls = 'pl-t', anchor = 'start') => `<text class="${cls}" x="${f(x)}" y="${f(y)}" text-anchor="${anchor}">${s}</text>`;

// ── Plate I · Triangulation (Services): three kinds of source meet in one verified point ──
function triangulation() {
  const W = 220; const H = 92; const cx = 150; const cy = 46;
  let s = `<defs>${hatch('h1', 2.6)}</defs>`;
  const src = [['MEDIA', 16], ['REGISTRIES', 46], ['SOCIAL', 76]];
  for (const [name, y] of src) {
    s += `<rect class="pl-s" x="8" y="${y - 3}" width="6" height="6"/>` + tx(20, y + 2.5, name, 'pl-m');
    // each source's line: drawn in on hover (pathLength 1), with a small arrowhead into the ring
    s += `<path class="pl-d" pathLength="1" d="M${f(72)} ${y} C ${f(100)} ${y} ${f(112)} ${f(cy + (y - cy) * 0.35)} ${f(cx - 19)} ${f(cy + (y - cy) * 0.12)}"/>`;
  }
  // the bezel: two rings, a tick every 15°, longer every 45°
  s += `<circle class="pl-r" cx="${cx}" cy="${cy}" r="19"/><circle class="pl-r pl-fine" cx="${cx}" cy="${cy}" r="15.5"/>`;
  for (let a = 0; a < 360; a += 15) {
    const r = (a * Math.PI) / 180; const l = a % 45 ? 2 : 4;
    s += ln(cx + Math.cos(r) * 19, cy + Math.sin(r) * 19, cx + Math.cos(r) * (19 + l), cy + Math.sin(r) * (19 + l), 'pl-tick');
  }
  s += `<circle cx="${cx}" cy="${cy}" r="12" fill="url(#h1)" class="pl-fill"/>` + mark(cx, cy, 0.105);
  s += `<path class="pl-d pl-out" pathLength="1" d="M${cx + 24} ${cy} H ${W - 8}"/>` + ln(W - 8, cy - 4, W - 8, cy + 4, 'pl-tick');
  s += tx(W - 8, cy + 14, 'ONE', 'pl-m', 'end') + tx(W - 8, cy + 22, 'PICTURE', 'pl-m', 'end');
  return `<svg class="plate" viewBox="0 0 ${W} ${H}" aria-hidden="true">${s}</svg>`;
}

// ── Plate II · The record (Products): a ruler of days, today, and forecasts standing at their odds ──
function record() {
  const W = 220; const H = 92; const base = 74; const x0 = 10; const x1 = 210;
  let s = `<defs>${hatch('h2', 2.4)}</defs>`;
  s += ln(x0, base, x1, base, 'pl-r');
  for (let i = 0; i <= 40; i++) { const x = x0 + (i * (x1 - x0)) / 40; s += ln(x, base, x, base + (i % 10 ? 3 : 6), 'pl-tick'); }
  [['NOV', 0], ['DEC', 10], ['JAN', 20], ['FEB', 30]].forEach(([m, i]) => { s += tx(x0 + (i * (x1 - x0)) / 40 + 2, base + 14, m, 'pl-m'); });
  const today = x0 + (5 * (x1 - x0)) / 40;
  s += `<line class="pl-today" x1="${f(today)}" y1="10" x2="${f(today)}" y2="${base}"/>` + tx(today + 3, 14, 'TODAY', 'pl-m');
  // forecasts: a stem whose height is its probability, hatched; the dot at the top is the date to check
  [[12, 0.72], [19, 0.41], [27, 0.86], [34, 0.23]].forEach(([i, p], k) => {
    const x = x0 + (i * (x1 - x0)) / 40; const top = base - p * 56;
    s += `<rect class="pl-bar" style="--k:${k}" x="${f(x - 3)}" y="${f(top)}" width="6" height="${f(base - top)}" fill="url(#h2)"/>`;
    s += `<path class="pl-dia" d="M${f(x)} ${f(top - 4)} l3 3 l-3 3 l-3 -3 Z"/>` + tx(x + 6, top - 1, `${Math.round(p * 100)}`, 'pl-m');
  });
  return `<svg class="plate" viewBox="0 0 ${W} ${H}" aria-hidden="true">${s}</svg>`;
}

// ── Plate III · The seal (Company): the mark in a double ring, the words around it ──
function seal() {
  const W = 220; const H = 92; const cx = 110; const cy = 46; const R = 40;
  let s = `<defs><path id="sealp" d="M ${cx} ${cy} m -31 0 a 31 31 0 1 1 62 0 a 31 31 0 1 1 -62 0"/>${hatch('h3', 2.6, -45)}</defs>`;
  s += `<circle class="pl-r" cx="${cx}" cy="${cy}" r="${R}"/><circle class="pl-r pl-fine" cx="${cx}" cy="${cy}" r="${R - 3}"/><circle class="pl-r pl-fine" cx="${cx}" cy="${cy}" r="24"/>`;
  s += `<g class="pl-turn"><text class="pl-m pl-ring"><textPath href="#sealp" startOffset="0">REACTIONcore · OPEN SOURCES ONLY · PUBLIC RECORD · </textPath></text></g>`;
  s += `<circle cx="${cx}" cy="${cy}" r="22" fill="url(#h3)" class="pl-fill"/>` + mark(cx, cy, 0.2);
  // the margins of the plate: a registration mark at either side
  for (const x of [28, 192]) s += `<circle class="pl-r pl-fine" cx="${x}" cy="${cy}" r="5"/>` + ln(x - 9, cy, x + 9, cy, 'pl-tick') + ln(x, cy - 9, x, cy + 9, 'pl-tick');
  return `<svg class="plate" viewBox="0 0 ${W} ${H}" aria-hidden="true">${s}</svg>`;
}

// ── Product plates, larger (the home page's cards) ──
// CONTEXT · the broadsheet: masthead, three columns of ruled text, a hatched picture, the fold, the issue's stamp
function broadsheet() {
  const W = 240; const H = 170;
  let s = `<defs>${hatch('hb', 2.6)}</defs>`;
  s += `<rect class="pl-r" x="20" y="10" width="200" height="150"/>`;
  s += ln(30, 26, 210, 26, 'pl-r') + ln(30, 29, 210, 29, 'pl-fine-l') + tx(120, 22, 'CONTEXT · DAILY ISSUE', 'pl-m', 'middle');
  const cols = [[30, 84], [118, 52], [174, 36]];
  // headline bars, the picture in the first column, ruled lines below
  s += `<rect x="30" y="36" width="84" height="40" fill="url(#hb)" class="pl-fill"/><rect class="pl-r pl-fine" x="30" y="36" width="84" height="40"/>`;
  let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (const [x, w] of cols) {
    const startY = x === 30 ? 84 : 38;
    if (x !== 30) s += `<rect class="pl-head" x="${x}" y="${startY - 2}" width="${f(w * 0.8)}" height="4"/>`;
    for (let y = startY + (x === 30 ? 0 : 8), i = 0; y < 150; y += 5.2, i++) s += ln(x, y, x + w * (i % 6 === 5 ? 0.55 : 0.82 + rnd() * 0.18), y, 'pl-line');
  }
  s += ln(116, 34, 116, 152, 'pl-fine-l') + ln(172, 34, 172, 152, 'pl-fine-l');
  s += `<circle class="pl-r pl-stamp" cx="196" cy="134" r="16"/><circle class="pl-r pl-fine" cx="196" cy="134" r="13"/>` + tx(196, 132, 'No.', 'pl-m', 'middle') + tx(196, 140, '341', 'pl-m', 'middle');
  return `<svg class="plate plate--card" viewBox="0 0 ${W} ${H}" aria-hidden="true">${s}</svg>`;
}
// SITUATION · the survey: contour lines of a field, a grid with coordinates, three marked places joined
function survey() {
  const W = 240; const H = 170;
  let s = `<defs>${hatch('hs', 2.6)}<clipPath id="cs"><rect x="20" y="10" width="200" height="150"/></clipPath></defs><g clip-path="url(#cs)">`;
  for (let x = 20; x <= 220; x += 25) s += ln(x, 10, x, 160, 'pl-grid');
  for (let y = 10; y <= 160; y += 25) s += ln(20, y, 220, y, 'pl-grid');
  [['47°N', 12], ['48°N', 37], ['49°N', 62]].forEach(([t, y]) => { s += tx(16, y + 3, t, 'pl-m', 'end'); });
  // nested closed contours around two peaks (smooth wobbly rings)
  const ring = (cx, cy, r, k, ph) => {
    const pts = Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; const rr = r * (1 + 0.12 * Math.sin(3 * a + ph) + 0.06 * Math.sin(5 * a + k)); return [cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr]; });
    return `<path class="pl-contour" d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z"/>`;
  };
  for (let i = 1; i <= 6; i++) s += ring(88, 84, 10 * i, i, 0.4);
  for (let i = 1; i <= 4; i++) s += ring(172, 60, 8 * i, i + 2, 1.7);
  s += `<path class="pl-contour" d="${ring(88, 84, 10, 1, 0.4).match(/d="([^"]+)"/)[1]}" fill="url(#hs)"/></g>`;
  const pl = [[88, 84], [172, 60], [196, 136]];
  s += `<path class="pl-d" pathLength="1" d="M${pl.map(([x, y]) => `${x} ${y}`).join(' L')}"/>`;
  pl.forEach(([x, y], i) => { s += `<rect class="pl-pin" x="${x - 3.5}" y="${y - 3.5}" width="7" height="7"/>` + tx(x + 7, y - 6, ['A', 'B', 'C'][i], 'pl-m'); });
  s += `<rect class="pl-r" x="20" y="10" width="200" height="150"/>`;
  return `<svg class="plate plate--card" viewBox="0 0 ${W} ${H}" aria-hidden="true">${s}</svg>`;
}
// TIME · the ledger of forecasts: the same ruler as the menu plate, larger, with the record of checked ones
function ledger() {
  const W = 240; const H = 170; const base = 128; const x0 = 20; const x1 = 220;
  let s = `<defs>${hatch('ht2', 2.6)}</defs>`;
  for (const p of [0.25, 0.5, 0.75, 1]) { const y = base - p * 100; s += ln(x0, y, x1, y, p === 0.5 ? 'pl-fine-l' : 'pl-grid') + tx(x0 - 4, y + 3, `${p * 100}`, 'pl-m', 'end'); }
  s += ln(x0, base, x1, base, 'pl-r');
  for (let i = 0; i <= 50; i++) { const x = x0 + (i * (x1 - x0)) / 50; s += ln(x, base, x, base + (i % 10 ? 3 : 7), 'pl-tick'); }
  ['NOV', 'DEC', 'JAN', 'FEB', 'MAR'].forEach((m, i) => { s += tx(x0 + i * 40 + 2, base + 18, m, 'pl-m'); });
  const today = x0 + 40;
  s += `<line class="pl-today" x1="${today}" y1="16" x2="${today}" y2="${base}"/>` + tx(today + 3, 20, 'TODAY', 'pl-m');
  // checked forecasts (left of today): an open ring at the odds given, a cross if it missed, a dot if it held
  [[30, 0.8, 1], [44, 0.35, 0], [52, 0.62, 1]].forEach(([x, p, ok]) => { const y = base - p * 100; s += `<circle class="pl-r" cx="${x}" cy="${y}" r="3.5"/>` + (ok ? `<circle class="pl-hit" cx="${x}" cy="${y}" r="1.4"/>` : ln(x - 2.5, y - 2.5, x + 2.5, y + 2.5, 'pl-tick') + ln(x - 2.5, y + 2.5, x + 2.5, y - 2.5, 'pl-tick')); });
  // open forecasts (right of today): hatched stems
  [[84, 0.72], [118, 0.41], [150, 0.86], [190, 0.23]].forEach(([x, p], k) => {
    const top = base - p * 100;
    s += `<rect class="pl-bar" style="--k:${k}" x="${x - 4}" y="${f(top)}" width="8" height="${f(base - top)}" fill="url(#ht2)"/><rect class="pl-r pl-fine" x="${x - 4}" y="${f(top)}" width="8" height="${f(base - top)}"/>`;
    s += `<path class="pl-dia" d="M${x} ${f(top - 5)} l4 4 l-4 4 l-4 -4 Z"/>`;
  });
  return `<svg class="plate plate--card" viewBox="0 0 ${W} ${H}" aria-hidden="true">${s}</svg>`;
}

const out = { triangulation: triangulation(), record: record(), seal: seal(), broadsheet: broadsheet(), survey: survey(), ledger: ledger() };
process.stdout.write(JSON.stringify(out));
