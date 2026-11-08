// The public site: the mark in 3D (wire petals, a core, rings, dust), the mobile menu. No framework.
import './site.css';
import './chrome.js';

// The workspace moved to its own subdomain. The home-screen app installed from the main domain, and an old
// link into the platform (it carries a query), go on to the workspace; the site itself has none.
const WORKSPACE = 'https://workspace.reactioncore.uk';
const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
// (Ad and share tags — utm_…, gclid, fbclid — are the site's own visitors, not old platform links.)
const oldLink = location.search && ![...new URLSearchParams(location.search).keys()].some((k) => /^(utm_|gclid|fbclid|ref$)/.test(k));
if (location.hostname === 'reactioncore.uk' && (standalone || oldLink)) {
  location.replace(`${WORKSPACE}/${location.search}${location.hash}`);
}

function build() {
    // The mark as wire: eight petals (the outline of each, front and back face, cupped toward the viewer),
    // the diamond core, two faint construction rings and a slow field of dust.
    const petal = [[0, -96], [13.44, -57.6], [2.4, -23.04], [0, -26.88], [-2.4, -23.04], [-13.44, -57.6]];
    const spine = [[0, -86.4], [0, -32.64]];
    const segs = []; const core = [];
    const cup = (x, y) => Math.pow(Math.hypot(x, y) / 96, 2) * 22;
    const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      const pts = petal.map((p) => rot(p, a));
      for (const face of [5, -5]) {
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]; const q = pts[(i + 1) % pts.length];
          segs.push([p[0], p[1], cup(p[0], p[1]) + face, q[0], q[1], cup(q[0], q[1]) + face, k]);
        }
      }
      pts.forEach((p) => segs.push([p[0], p[1], cup(p[0], p[1]) + 5, p[0], p[1], cup(p[0], p[1]) - 5, k]));
      const s0 = rot(spine[0], a); const s1 = rot(spine[1], a);
      segs.push([s0[0], s0[1], cup(s0[0], s0[1]), s1[0], s1[1], cup(s1[0], s1[1]), k]);
    }
    const d = [[0, -8.64], [8.64, 0], [0, 8.64], [-8.64, 0]];
    for (const face of [7, -7]) for (let i = 0; i < 4; i++) core.push([d[i][0], d[i][1], face, d[(i + 1) % 4][0], d[(i + 1) % 4][1], face]);
    d.forEach((p) => core.push([p[0], p[1], 7, p[0], p[1], -7]));
    const rings = [];
    for (const [r, tilt] of [[128, 0.0], [156, 1.1]]) {
      const n = 96;
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2; const a1 = (i + 1) / n * Math.PI * 2;
        const p = (a) => { const x = Math.cos(a) * r; const y = Math.sin(a) * r; return [x, y * Math.cos(tilt), y * Math.sin(tilt)]; };
        const A = p(a0); const B = p(a1);
        if (i % 2 === 0) rings.push([A[0], A[1], A[2], B[0], B[1], B[2]]);
      }
    }
    const dens = 1;
    const dust = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < Math.round(260 * dens); i++) {
      const u = rnd() * 2 - 1; const th = rnd() * Math.PI * 2; const rr = 120 + rnd() * 200;
      const s = Math.sqrt(1 - u * u);
      dust.push([Math.cos(th) * s * rr, Math.sin(th) * s * rr, u * rr, rnd()]);
    }
    return { segs, core, rings: [], dust: [] }; // no rings, no dust: the mark alone
}

function start(canvas) {
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let raf = 0;
  const cv = canvas;
    const ctx = cv.getContext('2d');
    const geo = build();
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0; let h = 0; let dpr = 1;
    // The soft light behind the mark lives on its own still canvas under the drawing: painted once per size, never
    // faded or redrawn per frame (an 8-bit fade of it showed blinking rings). Pixel by pixel: the page's own black
    // (#0a0a0a) rising a dozen levels at the centre, with a half-level of random dither so no rings line up.
    const glow = document.createElement('canvas');
    glow.className = 'glow'; glow.setAttribute('aria-hidden', 'true');
    cv.parentNode.insertBefore(glow, cv);
    function paintGlow() {
      const W = cv.width; const H = cv.height;
      glow.width = W; glow.height = H;
      const gx = glow.getContext('2d'); const img = gx.createImageData(W, H);
      const px = new Uint32Array(img.data.buffer);
      const cx = W / 2; const cy = H / 2; const R2 = (Math.min(W, H) * 0.46) ** 2; // fades to the page black inside: no edge
      for (let y = 0; y < H; y++) {
        const dy = (y - cy) ** 2; let i = y * W;
        for (let x = 0; x < W; x++, i++) {
          const q = ((x - cx) ** 2 + dy) / R2;
          const f = q < 1 ? (1 - q) ** 2.2 : 0;
          // Dither only where there is light, and less of it towards the rim: outside the circle the pixel is exactly the
          // page's black, so the canvas's own edges never show as lines.
          const v = f > 0 ? Math.round(10 + 13 * f + (Math.random() - 0.5) * 1.1 * Math.min(1, f * 8)) : 10;
          px[i] = 0xff000000 | (v << 16) | (v << 8) | v;
        }
      }
      gx.putImageData(img, 0, 0);
    }
    const size = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(Math.max(1, r.width) * dpr); const H = Math.round(Math.max(1, r.height) * dpr);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      if (W === cv.width && H === cv.height) return; // the same size: nothing to redo (no blank frame, no repaint)
      cv.width = W; cv.height = H;
      paintGlow();
    };
    size();
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => { size(); if (still) draw(9); }); ro.observe(cv); }
    cv.onpointermove = (e) => {
      const r = cv.getBoundingClientRect();
      mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      mouse.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    cv.onpointerleave = () => { mouse.tx = 0; mouse.ty = 0; };
    // Held and dragged, the mark turns with the hand: across — it spins, up and down — it tips; let go — it runs on and slows.
    const spin = { z: 0, x: 0, vz: 0, vx: 0, held: false, px: 0, py: 0 };
    cv.onpointerdown = (e) => {
      spin.held = true; spin.px = e.clientX; spin.py = e.clientY; spin.vz = 0; spin.vx = 0;
      cv.setPointerCapture?.(e.pointerId); cv.classList.add('is-grabbing');
    };
    cv.addEventListener('pointermove', (e) => {
      if (!spin.held) return;
      const dz = (e.clientX - spin.px) * 0.008; const dx = (e.clientY - spin.py) * 0.006;
      spin.px = e.clientX; spin.py = e.clientY;
      spin.z += dz; spin.x = Math.max(-0.9, Math.min(0.9, spin.x + dx));
      spin.vz = dz; spin.vx = dx;
    });
    const release = () => { spin.held = false; cv.classList.remove('is-grabbing'); };
    cv.onpointerup = release; cv.onpointercancel = release;
    const D = 520;
    const t0 = performance.now();
    const draw = (t) => {
      const m = mouse;
      m.x += (m.tx - m.x) * 0.04; m.y += (m.ty - m.y) * 0.04;
      const sp = 1;
      if (!spin.held) { spin.z += spin.vz; spin.vz *= 0.95; spin.vx *= 0.9; spin.x *= 0.985; } // the tip eases back
      const ry = -0.35 + Math.sin(t * 0.21 * sp) * 0.12 + m.x * 0.35; // a steady three-quarter view
      const rx = 0.55 + Math.sin(t * 0.13 * sp) * 0.06 + m.y * 0.25 + spin.x;
      const rz = t * 0.32 * sp + spin.z; // it turns round, like a wheel
      const cy = Math.cos(ry); const sy = Math.sin(ry); const cx = Math.cos(rx); const sx = Math.sin(rx); const cz = Math.cos(rz); const sz = Math.sin(rz);
      const s = Math.min(w, h) / 250;
      const ox = w / 2; const oy = h / 2;
      const P = (x, y, z) => {
        let X = x * cz - y * sz; let Y = x * sz + y * cz; let Z = z;
        const X2 = X * cy + Z * sy; const Z2 = -X * sy + Z * cy; X = X2; Z = Z2;
        const Y2 = Y * cx - Z * sx; const Z3 = Y * sx + Z * cx; Y = Y2; Z = Z3;
        const p = D / (D - Z);
        return [ox + X * p * s, oy + Y * p * s, Z, p];
      };
      // It comes out of the dark: the whole fades up while each edge draws itself in turn, the far side dimmer.
      const build = Math.min(1, t / 4.5);
      const dawn = Math.min(1, t / 3.2); const fade = dawn * dawn * (3 - 2 * dawn);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      const line = (sg, base, span, f) => {
        if (f <= 0) return;
        const A = P(sg[0], sg[1], sg[2]); const B = P(sg[3], sg[4], sg[5]);
        const z = (A[2] + B[2]) / 2;
        const depth = Math.max(0, Math.min(1, (z + 140) / 280));
        const a = Math.max(0.02, Math.min(1, base + span * Math.pow(depth, 1.6))) * fade;
        ctx.strokeStyle = `rgba(237,237,237,${a})`;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f); ctx.stroke();
      };
      const N = geo.segs.length;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < N; i++) line(geo.segs[i], 0.05, 0.8, Math.min(1, (build - (i / N) * 0.75) / 0.25));
      const cb = Math.min(1, Math.max(0, (build - 0.8) / 0.2));
      ctx.lineWidth = 1.4;
      for (const c of geo.core) line(c, 0.3 * cb, 0.7 * cb, cb);
    };
    if (still) { draw(9); return; }
    const loop = (now) => { draw((now - t0) / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  // Off screen, the drawing rests.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf && !still) raf = requestAnimationFrame(loop);
  });
}

const cv = document.getElementById('mark3d');
if (cv && cv.getContext) start(cv);
