// The site's soft glows (src/site/glow.js): clear outside the ellipse, brightest at the centre, and the dither keeps
// the average light true to the curve, so it fades without steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glowPixels } from '../../src/site/glow.js';

test('glow: clear outside, peak at the centre, unbiased dither', () => {
  const W = 200; const H = 100; const peak = 0.07;
  const px = glowPixels(W, H, 100, 50, 100, 50, peak);
  const a = (x, y) => px[(y * W + x) * 4 + 3];
  assert.equal(a(0, 0), 0); assert.equal(a(199, 99), 0); assert.equal(a(0, 50), 0);
  assert.ok(a(100, 50) >= Math.floor(peak * 255) && a(100, 50) <= Math.ceil(peak * 255));
  // along a ring a fraction of the way out, the mean alpha matches the curve within a small margin
  for (const t of [0.3, 0.6, 0.85]) {
    let sum = 0; let n = 0;
    for (let k = 0; k < 2000; k++) {
      const ang = (k / 2000) * Math.PI * 2;
      const x = Math.floor(100 + Math.cos(ang) * 100 * t); const y = Math.floor(50 + Math.sin(ang) * 50 * t);
      sum += a(x, y); n++;
    }
    const want = peak * 255 * (1 - t * t) ** 2.2;
    assert.ok(Math.abs(sum / n - want) < 0.35 + want * 0.06, `ring ${t}: ${sum / n} vs ${want}`);
  }
  // no step: deterministic noise of 0 gives the floor, of 0.999 the next level — the fraction decides
  const lo = glowPixels(3, 3, 1.5, 1.5, 1.5, 1.5, 0.5, () => 0); const hi = glowPixels(3, 3, 1.5, 1.5, 1.5, 1.5, 0.5, () => 0.999);
  assert.ok(hi[4 * 4 + 3] - lo[4 * 4 + 3] <= 1);
});
