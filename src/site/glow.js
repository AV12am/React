// Soft light without steps. A CSS gradient this faint (a few percent of white over near-black) spans only a dozen
// 8-bit levels, and the browser draws it without dither: the eye sees rings where one level gives way to the next.
// Here each glow is painted pixel by pixel instead, with stochastic dither — the fraction of a level is the chance of
// the next level up — so the light thins out evenly down to nothing: no rings, no rim, no edge. The picture goes into
// the element's --glow and its CSS (site.css) lays it over the box of the pseudo-element; the CSS gradient stays as a
// fallback until it is painted.

// Where each glow sits, as the CSS pseudo-element is drawn: its box (from the element's size), the ellipse inside it
// (centre and radii, in that box) and the light at the centre (0..1 of white).
const GLOWS = [
  { sel: '.foot', box: (w) => [w * 0.8, 140], shape: (bw, bh) => [bw / 2, 0, bw * 0.6 * 0.7, bh * 0.7], peak: 0.06 },
];

// The light fades as (1 − q)^2.2, q the squared distance in radii: flat at the centre, no kink at the rim.
export function glowPixels(W, H, cx, cy, rx, ry, peak, rnd = Math.random) {
  const px = new Uint8ClampedArray(W * H * 4);
  const top = peak * 255;
  for (let y = 0; y < H; y++) {
    const dy = ((y + 0.5 - cy) / ry) ** 2;
    for (let x = 0; x < W; x++) {
      const q = ((x + 0.5 - cx) / rx) ** 2 + dy;
      if (q >= 1) continue; // outside: fully clear
      const a = Math.floor(top * (1 - q) ** 2.2 + rnd());
      if (!a) continue;
      const i = (y * W + x) * 4;
      px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = a;
    }
  }
  return px;
}

const urls = new WeakMap();
function paint(el, g) {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const [bw, bh] = g.box(r.width, r.height);
  const W = Math.round(bw * dpr); const H = Math.round(bh * dpr);
  const key = `${W}x${H}`;
  if (el.dataset.glow === key) return;
  el.dataset.glow = key;
  const [cx, cy, rx, ry] = g.shape(W, H);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(new ImageData(glowPixels(W, H, cx, cy, rx, ry, g.peak), W, H), 0, 0);
  cv.toBlob((b) => {
    if (!b || el.dataset.glow !== key) return;
    const old = urls.get(el); if (old) URL.revokeObjectURL(old);
    const u = URL.createObjectURL(b); urls.set(el, u);
    el.style.setProperty('--glow', `url(${u})`);
  });
}

export function startGlows() {
  if (typeof ResizeObserver === 'undefined' || typeof ImageData === 'undefined') return;
  const ro = new ResizeObserver((entries) => entries.forEach((e) => { const g = GLOWS.find((x) => e.target.matches(x.sel)); if (g) paint(e.target, g); }));
  for (const g of GLOWS) document.querySelectorAll(g.sel).forEach((el) => ro.observe(el));
}
