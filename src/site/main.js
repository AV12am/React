// The public site: the mark in 3D (wire petals, a core, rings, dust), the mobile menu. No framework.
import './site.css';

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
    const size = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    };
    size();
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => { size(); if (still) draw(9); }); ro.observe(cv); }
    cv.onpointermove = (e) => {
      const r = cv.getBoundingClientRect();
      mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      mouse.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    cv.onpointerleave = () => { mouse.tx = 0; mouse.ty = 0; };
    const D = 520;
    const t0 = performance.now();
    const draw = (t) => {
      const m = mouse;
      m.x += (m.tx - m.x) * 0.04; m.y += (m.ty - m.y) * 0.04;
      const sp = 1;
      const ry = t * 0.2 * sp + m.x * 0.55;
      const rx = 0.42 + Math.sin(t * 0.09 * sp) * 0.16 + m.y * 0.35;
      const rz = t * 0.03 * sp;
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
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 150 * s);
      g.addColorStop(0, `rgba(237,237,237,${0.035 * fade})`);
      g.addColorStop(1, 'rgba(237,237,237,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
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

const burger = document.getElementById('burger');
const mob = document.getElementById('mob');
burger?.addEventListener('click', () => {
  const open = mob.hidden;
  mob.hidden = !open;
  burger.setAttribute('aria-expanded', String(open));
  burger.textContent = open ? 'Close' : 'Menu';
});
mob?.addEventListener('click', (e) => { if (e.target.closest('a')) { mob.hidden = true; burger.setAttribute('aria-expanded', 'false'); burger.textContent = 'Menu'; } });
