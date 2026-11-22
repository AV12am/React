// A service page (/osint, /risk, /due-diligence): what the service is, and its products — the chosen product's
// example takes most of the page on the left, with numbered call-outs explaining each part; the list of products
// is on the right. Until a product's real example is ready (`sample` in services-data.js) its structure is shown.
import './site.css';
import './area.css';
import './chrome.js';
import { lang as siteLang } from './i18n.js';
import { SERVICES, STANDARDS, SAMPLES, WORDS } from './services-data.js';
import { sectionBoxes } from './sample-sections.js';

const lang = siteLang === 'uk' ? 'uk' : 'en';
const L = (v) => (v && typeof v === 'object' ? v[lang] || v.en : v || '');
const W = WORDS[lang];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const root = document.getElementById('svc');
const key = root?.dataset.service;
const svc = SERVICES[key];

// A part of the document drawn as what it is: a map, a matrix, a timeline, a link map, a rating — or lines of text.
function block(part, i) {
  const t = part[0].en.toLowerCase();
  const n = `<span class="sp-n">${i + 1}</span>`;
  const lines = (k) => Array.from({ length: k }, (_, j) => `<i style="width:${[96, 88, 92, 70, 84][(i + j) % 5]}%"></i>`).join('');
  let viz = '';
  const net = '<svg class="sp-net" viewBox="0 0 200 70" aria-hidden="true"><g><line x1="100" y1="35" x2="30" y2="15"/><line x1="100" y1="35" x2="40" y2="58"/><line x1="100" y1="35" x2="165" y2="14"/><line x1="100" y1="35" x2="170" y2="56"/><line x1="165" y1="14" x2="170" y2="56"/></g><circle cx="100" cy="35" r="6"/><circle cx="30" cy="15" r="4"/><circle cx="40" cy="58" r="4"/><circle cx="165" cy="14" r="4"/><circle cx="170" cy="56" r="4"/></svg>';
  const grid = (k, cols) => `<div class="sp-mx" style="grid-template-columns:repeat(${cols},1fr)">${Array.from({ length: k }, (_, j) => `<span style="opacity:${[0.2, 0.9, 0.45, 0.2, 0.7, 0.2, 1, 0.45, 0.2][j % 9]}"></span>`).join('')}</div>`;
  if (/\bactors\b|links & networks|ownership/.test(t)) viz = net;
  else if (/red-flag|watchlist table/.test(t)) viz = grid(t.includes('red') ? 7 : 9, t.includes('red') ? 7 : 3);
  else if (/timeline|developments/.test(t)) viz = '<div class="sp-tl"><span></span><span></span><span></span><span></span><span></span></div>';
  else if (/known \/ unknown/.test(t)) viz = '<div class="sp-two"><span></span><span></span></div>';
  else if (/scorecard|scenarios|verdict|assessment|signal panel|bottom line/.test(t)) viz = '<div class="sp-bars"><span style="width:82%"></span><span style="width:56%"></span><span style="width:34%"></span></div>';
  else if (/full picture/.test(t)) viz = '<div class="sp-map"><span></span><span></span><span></span><b></b></div>';
  return `<div class="sp-b" data-part="${i}">${n}<div class="sp-h"></div>${viz}<div class="sp-l">${lines(viz ? 2 : 3)}</div></div>`;
}

// A ready sample: its pages one under another. Each part of the document is a section — a box over the page, from
// where the part begins (its mark) to where the next one begins or the page's text ends; two parts side by side
// share the width. Its number sits at the section's start; the call-out in the list is tied to it.
const pct = (v) => `${(v * 100).toFixed(2)}%`;
function samplePages(sm, pid, parts) {
  const pl = sm.pages[lang] ? lang : 'en';
  const marks = sm.marks[pl];
  const boxes = sectionBoxes(sm, pl);
  return Array.from({ length: sm.pages[pl] }, (_, i) => `<div class="pg" data-page="${i}"><img src="${sm.dir}/${pl}-${i + 1}.png" alt="${esc(`${sm.code} · ${i + 1}/${sm.pages[pl]}`)}" width="1190" height="1684"${i ? ' loading="lazy"' : ''}>
${boxes.map((b, k) => (b[0] === i ? `<div class="sec" id="sec-${pid}-${k + 1}" data-section="${k + 1}" role="region" aria-label="${esc(`${k + 1}. ${L(parts[k][0])}`)}" style="left:${pct(b[1])};top:${pct(b[2])};width:${pct(b[3] - b[1])};height:${pct(b[4] - b[2])}"></div>` : '')).join('')}
<span class="spot" aria-hidden="true"></span>
${marks.map((m, k) => (m[0] === i ? `<button type="button" class="pg-m sp-n" data-section="${k + 1}" aria-controls="sec-${pid}-${k + 1}" aria-label="${esc(`${k + 1}. ${L(parts[k][0])}`)}" style="left:${Math.max(0.5, m[1] * 100 - 4.6).toFixed(1)}%;top:${(m[2] * 100 - 0.4).toFixed(1)}%">${k + 1}</button>` : '')).join('')}</div>`).join('');
}

function draw(id) {
  const p = svc.products.find((x) => x.id === id) || svc.products[0];
  const sm = SAMPLES[p.id];
  const parts = sm ? sm.parts : p.parts;
  const others = Object.entries(SERVICES).filter(([k]) => k !== key);
  root.innerHTML = `
<section class="wrap area-hero svc-hero">
<span class="k">${esc(L(svc.k))}</span>
<h1>${esc(L(svc.title))}</h1>
<p>${esc(L(svc.lead))}</p>
<div class="acts"><a class="btn btn-solid" href="/contact">${esc(W.discuss)} <span class="ar">→</span></a></div>
</section>
<section class="wrap svc-show" aria-label="${esc(W.products)}">
<div class="svc-spec">
<div class="svc-spec-h">${sm ? (p.level ? `<span class="meta">${esc(L(p.level))}</span>` : '') : `<span class="meta">${esc(W.example)}${p.level ? ` · ${esc(L(p.level))}` : ''}</span>`}<h2>${esc(p.name)}</h2><p>${esc(L(p.question))}</p></div>
${sm ? `<div class="svc-dl"><span class="meta">${esc(W.fromSample)}</span></div>` : `<p class="svc-soon">${esc(W.soon)}</p>`}
<div class="spec${sm ? ' spec--real' : ''}">
${sm ? `<div class="pages">${samplePages(sm, p.id, parts)}</div>` : `<div class="sheet" aria-hidden="true"><div class="sh-top"><span class="sh-mark"></span><span class="sh-title">${esc(p.name)}</span></div>${parts.map(block).join('')}</div>`}
${sm
    ? `<ol class="notes notes--live">${parts.map((x, i) => `<li data-note="${i + 1}" tabindex="0" role="button" aria-controls="sec-${p.id}-${i + 1}"><span class="sp-n">${i + 1}</span><div><b>${esc(L(x[0]))}</b><span>${esc(L(x[1]))}</span></div></li>`).join('')}</ol>`
    : `<ol class="notes">${parts.map((x, i) => `<li data-part="${i}"><span class="sp-n">${i + 1}</span><div><b>${esc(L(x[0]))}</b><span>${esc(L(x[1]))}</span></div></li>`).join('')}</ol>`}
</div>
<dl class="svc-meta">${['who', 'gets', 'size', 'sources', 'limits'].map((f) => `<div class="m-${f}"><dt>${esc(W[f])}</dt><dd>${esc(L(p[f]))}</dd></div>`).join('')}</dl>
</div>
<aside class="svc-list">
<span class="meta">${esc(W.products)}</span>
${svc.products.map((x) => `<a class="svc-p${x.id === p.id ? ' on' : ''}" href="#${x.id}" data-id="${x.id}"${x.id === p.id ? ' aria-current="true"' : ''}><b>${esc(x.name)}${x.level ? ` <em>${esc(L(x.level))}</em>` : ''}${SAMPLES[x.id] ? ` <em class="has-sample">${esc(W.sample)}</em>` : ''}</b><span>${esc(L(x.question))}</span></a>`).join('')}
<span class="meta svc-other">${esc(W.other)}</span>
${others.map(([, s]) => `<a class="lnk" href="${s.path}">${esc(L(s.k).charAt(0) + L(s.k).slice(1).toLowerCase())} <span class="ar">→</span></a>`).join('')}
</aside>
</section>
<section class="wrap svc-std" aria-labelledby="std-h">
<div class="blk-h"><h2 id="std-h">${esc(W.standards)}</h2><span class="meta">${esc(W.standardsLead)}</span></div>
<div class="std-g">${STANDARDS.map(([h, d], i) => `<div class="std"><span class="n">${String(i + 1).padStart(2, '0')}</span><b>${esc(L(h))}</b><p>${esc(L(d))}</p></div>`).join('')}</div>
</section>`;
}

// ── A sample's sections and its call-outs, highlighted together — three strengths, the clearer the action the stronger:
//   scrolling (passive): the section in the middle of the window gets a thin frame, its call-out is current; nothing dims;
//   hover / focus on a call-out or a number: the frame, and the rest of the document dimmed;
//   a click / Enter: scrolled to, framed and the rest dimmed until a click outside, Esc, or the reader scrolls by hand.
// On a phone (no hover) a tap scrolls to the section and lights it for 1.5 s.
const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// The page's own CSS scrolls smoothly (html { scroll-behavior: smooth }), so «auto» would glide too: reduced motion jumps.
const HOW = () => (REDUCED() ? 'instant' : 'smooth');
const TOUCH = () => window.matchMedia('(hover: none), (max-width: 768px)').matches;
function liveSample() {
  const spec = root.querySelector('.spec--real');
  if (!spec) return () => {};
  const notes = spec.querySelector('.notes');
  const secs = [...spec.querySelectorAll('.sec')];
  const pages = [...spec.querySelectorAll('.pg')];
  const st = { act: 0, hov: 0, pin: 0 };
  let leave = 0; let fade = 0;
  // follow: keep the current call-out in view inside the list — not when the pointer is in the list (it would slide
  // another call-out under the cursor).
  const draw = (follow = true) => {
    const shown = st.pin || st.hov || st.act;
    const dim = Boolean(st.pin || st.hov);
    spec.classList.toggle('is-dim', dim);
    secs.forEach((el) => el.classList.toggle('on', +el.dataset.section === shown));
    spec.querySelectorAll('[data-note]').forEach((li) => {
      const on = +li.dataset.note === shown;
      li.classList.toggle('on', on);
      if (on) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current');
    });
    spec.querySelectorAll('.pg-m').forEach((m) => m.classList.toggle('on', +m.dataset.section === shown));
    // The spotlight: one per page, gliding from section to section (no blink between neighbours); pages without
    // the shown section are dimmed whole.
    const box = secs.find((el) => +el.dataset.section === shown);
    pages.forEach((pg) => {
      const spot = pg.querySelector('.spot');
      const here = dim && box && box.parentElement === pg;
      pg.classList.toggle('pg-dim', dim && !here);
      spot.classList.toggle('on', Boolean(here));
      if (here) Object.assign(spot.style, { left: box.style.left, top: box.style.top, width: box.style.width, height: box.style.height });
    });
    // The current call-out kept in view inside the (sticky, scrolling) list.
    const li = notes.querySelector(`[data-note="${shown}"]`);
    if (follow && li && notes.scrollHeight > notes.clientHeight + 4) {
      const top = li.getBoundingClientRect().top - notes.getBoundingClientRect().top + notes.scrollTop;
      const bot = top + li.offsetHeight;
      if (top < notes.scrollTop || bot > notes.scrollTop + notes.clientHeight) notes.scrollTo({ top: Math.max(0, top - notes.clientHeight / 3), behavior: HOW() });
    }
  };
  const inList = (el) => Boolean(el?.closest?.('.notes'));
  const hover = (n, from) => { clearTimeout(leave); if (st.hov !== n) { st.hov = n; draw(!inList(from)); } };
  // Leaving a call-out waits a moment: moving to the next one hands the light over instead of switching it off.
  const unhover = () => { clearTimeout(leave); leave = setTimeout(() => { if (st.hov) { st.hov = 0; draw(false); } }, 140); };
  const unpin = () => { if (!st.pin) return; clearTimeout(fade); st.pin = 0; draw(); };
  const pin = (n, from) => {
    clearTimeout(fade);
    st.pin = n; st.hov = 0; draw(!inList(from));
    secs.find((el) => +el.dataset.section === n)?.scrollIntoView({ behavior: HOW(), block: 'center' });
    if (TOUCH()) fade = setTimeout(unpin, 1500); // a tap lights it for a moment
  };
  const num = (e) => { const el = e.target.closest('[data-note], .pg-m'); return el ? +(el.dataset.note || el.dataset.section) : 0; };
  // Hover is a mouse's; a finger's «hover» is a tap.
  // Over anything else in the block (a gap between call-outs, the page itself) the light goes after a moment — unless
  // the pointer reaches the next call-out first; leaving the block, the same.
  spec.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const n = num(e); if (n) hover(n, e.target); else if (st.hov) unhover(); });
  spec.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') unhover(); });
  spec.addEventListener('focusin', (e) => { if (num(e)) hover(num(e), e.target); });
  spec.addEventListener('focusout', (e) => { if (num(e)) unhover(); });
  spec.addEventListener('click', (e) => { const n = num(e); if (n) { e.preventDefault(); pin(n, e.target); } });
  spec.addEventListener('keydown', (e) => {
    const n = num(e);
    if (n && (e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-note]')) { e.preventDefault(); pin(n, e.target); }
  });
  const onKey = (e) => { if (e.key === 'Escape') { st.hov = 0; clearTimeout(leave); unpin(); draw(); } };
  const onDown = (e) => { if (st.pin && !e.target.closest('.spec--real')) unpin(); };
  const onManual = () => unpin(); // the reader scrolls by hand (the wheel, a finger) — a click's own scrolling does not count
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onDown);
  window.addEventListener('wheel', onManual, { passive: true });
  window.addEventListener('touchmove', onManual, { passive: true });
  // Passive: the section crossing the middle of the window is the current one.
  const seen = new Map();
  const io = new IntersectionObserver((list) => {
    list.forEach((en) => { if (en.isIntersecting) seen.set(en.target, en.intersectionRect.height); else seen.delete(en.target); });
    let best = null; let h = 0;
    seen.forEach((v, el) => { if (v > h) { h = v; best = el; } });
    const n = best ? +best.dataset.section : st.act;
    if (n !== st.act) { st.act = n; draw(); }
  }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
  secs.forEach((el) => io.observe(el));
  draw();
  return () => {
    io.disconnect(); clearTimeout(leave); clearTimeout(fade);
    document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown);
    window.removeEventListener('wheel', onManual); window.removeEventListener('touchmove', onManual);
  };
}

if (svc) {
  let stop = () => {};
  const pick = () => { stop(); draw(decodeURIComponent(location.hash.slice(1))); stop = liveSample(); };
  pick();
  window.addEventListener('hashchange', () => {
    pick();
    if (window.matchMedia('(max-width: 900px)').matches) document.querySelector('.svc-spec')?.scrollIntoView({ behavior: HOW(), block: 'start' });
  });
  // The structure sketch (a product without a sample yet): a call-out and its block light up together.
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-part]');
    const k = el?.dataset.part;
    root.querySelectorAll('[data-part]').forEach((x) => x.classList.toggle('hi', k != null && x.dataset.part === k));
  });
  root.addEventListener('mouseleave', () => root.querySelectorAll('[data-part].hi').forEach((x) => x.classList.remove('hi')));
}
