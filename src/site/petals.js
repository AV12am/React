// The REACTIONcore mark as path data: eight petals (top first, clockwise), then the core.
// Shared by the area pages: the logo, and the forecast gauge — each petal is 12.5% of probability.
export const PETALS = ["M0 -96L13.44 -57.6L2.4 -23.04L0 -26.88L-2.4 -23.04L-13.44 -57.6Z", "M62.45 -62.45L46.21 -28.73L16.55 -13.43L17.49 -17.49L13.43 -16.55L28.73 -46.21Z", "M96 0L57.6 13.44L23.04 2.4L26.88 0L23.04 -2.4L57.6 -13.44Z", "M62.45 62.45L28.73 46.21L13.43 16.55L17.49 17.49L16.55 13.43L46.21 28.73Z", "M0 96L-13.44 57.6L-2.4 23.04L0 26.88L2.4 23.04L13.44 57.6Z", "M-62.45 62.45L-46.21 28.73L-16.55 13.43L-17.49 17.49L-13.43 16.55L-28.73 46.21Z", "M-96 0L-57.6 -13.44L-23.04 -2.4L-26.88 0L-23.04 2.4L-57.6 13.44Z", "M-62.45 -62.45L-28.73 -46.21L-13.43 -16.55L-17.49 -17.49L-16.55 -13.43L-46.21 -28.73Z"];
export const CORE = ["M0 -8.64L8.64 0L0 8.64L-8.64 0Z"];

const NS = 'http://www.w3.org/2000/svg';
/** The mark as an SVG element in the current text colour. */
export function markSvg(size = 26) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-100 -100 200 200'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<g fill="currentColor">${[...PETALS, ...CORE].map((d) => `<path d="${d}"/>`).join('')}</g>`;
  return svg;
}
/** The probability gauge: petals light up clockwise from the top, the last one partly. */
export function gaugeSvg(p, size = 96) {
  const n = Math.max(0, Math.min(1, p)) * 8;
  const parts = PETALS.map((d, i) => {
    const lit = i + 1 <= n ? 1 : n > i ? n - i : 0;
    return `<path d="${d}" class="g-off"/>${lit > 0 ? `<path d="${d}" class="g-on" opacity="${lit.toFixed(2)}"/>` : ''}`;
  }).join('') + CORE.map((d) => `<path d="${d}" class="g-on"/>`).join('');
  return `<svg class="gauge" viewBox="-100 -100 200 200" width="${size}" height="${size}" role="img" aria-label="Probability ${Math.round(p * 100)}%" fill-rule="evenodd">${parts}</svg>`;
}
