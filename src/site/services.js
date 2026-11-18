// A service page (/osint, /risk, /due-diligence): what the service is, and its products — the chosen product's
// example takes most of the page on the left, with numbered call-outs explaining each part; the list of products
// is on the right. Until a product's real example is ready (`sample` in services-data.js) its structure is shown.
import './site.css';
import './area.css';
import './chrome.js';
import { lang as siteLang } from './i18n.js';
import { SERVICES, STANDARDS, SAMPLES, WORDS } from './services-data.js';

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

// A ready sample: its pages one under another, each part's number placed where that part begins on the page.
function samplePages(sm) {
  const pl = sm.pages[lang] ? lang : 'en';
  const marks = sm.marks[pl];
  return Array.from({ length: sm.pages[pl] }, (_, i) => `<div class="pg"><img src="${sm.dir}/${pl}-${i + 1}.png" alt="${esc(`${sm.code} · ${i + 1}/${sm.pages[pl]}`)}" width="1190" height="1684"${i ? ' loading="lazy"' : ''}>${marks.map((m, k) => (m[0] === i ? `<span class="pg-m sp-n" data-part="${k}" style="left:${Math.max(0.5, m[1] * 100 - 4.6).toFixed(1)}%;top:${(m[2] * 100 - 0.4).toFixed(1)}%">${k + 1}</span>` : '')).join('')}</div>`).join('');
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
<div class="svc-spec-h"><span class="meta">${sm ? `${esc(W.sample)} · ${esc(sm.code)}` : esc(W.example)}${p.level ? ` · ${esc(L(p.level))}` : ''}</span><h2>${esc(p.name)}</h2><p>${esc(L(p.question))}</p></div>
${sm ? `<div class="svc-dl"><span class="meta">${esc(W.fromSample)}</span><span class="svc-dl-b">${Object.entries(sm.pdf).map(([k, u]) => `<a class="btn btn-line" href="${u}" download>${esc(W.pdf)} · ${esc(k === 'uk' ? W.pdfUk : W.pdfEn)}</a>`).join('')}</span></div>` : `<p class="svc-soon">${esc(W.soon)}</p>`}
<div class="spec${sm ? ' spec--real' : ''}">
${sm ? `<div class="pages">${samplePages(sm)}</div>` : `<div class="sheet" aria-hidden="true"><div class="sh-top"><span class="sh-mark"></span><span class="sh-title">${esc(p.name)}</span></div>${parts.map(block).join('')}</div>`}
<ol class="notes">${parts.map((x, i) => `<li data-part="${i}"><span class="sp-n">${i + 1}</span><div><b>${esc(L(x[0]))}</b><span>${esc(L(x[1]))}</span></div></li>`).join('')}</ol>
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

if (svc) {
  const pick = () => draw(decodeURIComponent(location.hash.slice(1)));
  pick();
  window.addEventListener('hashchange', () => {
    pick();
    if (window.matchMedia('(max-width: 900px)').matches) document.querySelector('.svc-spec')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // A call-out and its part of the sheet light up together.
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-part]');
    const k = el?.dataset.part;
    root.querySelectorAll('[data-part]').forEach((x) => x.classList.toggle('hi', k != null && x.dataset.part === k));
  });
  root.addEventListener('click', (e) => {
    const li = e.target.closest('.notes li[data-part]');
    const m = li && root.querySelector(`.pg-m[data-part="${li.dataset.part}"]`);
    if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  root.addEventListener('mouseleave', () => root.querySelectorAll('[data-part].hi').forEach((x) => x.classList.remove('hi')));
}
