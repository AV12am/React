// A service page (/osint, /risk, /due-diligence): what the service is, and its products — the chosen product's
// example takes most of the page on the left, with numbered call-outs explaining each part; the list of products
// is on the right. Until a product's real example is ready (`sample` in services-data.js) its structure is shown.
import './site.css';
import './area.css';
import './chrome.js';
import { lang as siteLang } from './i18n.js';
import { SERVICES, WORDS } from './services-data.js';

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
  if (/map\b/.test(t) && !/links/.test(t)) viz = '<div class="sp-map"><span></span><span></span><span></span><b></b></div>';
  else if (/\blinks\b|\bactors\b|structure/.test(t)) viz = '<svg class="sp-net" viewBox="0 0 200 70" aria-hidden="true"><g><line x1="100" y1="35" x2="30" y2="15"/><line x1="100" y1="35" x2="40" y2="58"/><line x1="100" y1="35" x2="165" y2="14"/><line x1="100" y1="35" x2="170" y2="56"/><line x1="165" y1="14" x2="170" y2="56"/></g><circle cx="100" cy="35" r="6"/><circle cx="30" cy="15" r="4"/><circle cx="40" cy="58" r="4"/><circle cx="165" cy="14" r="4"/><circle cx="170" cy="56" r="4"/></svg>';
  else if (/matrix/.test(t)) viz = `<div class="sp-mx">${Array.from({ length: 9 }, (_, j) => `<span style="opacity:${[0.15, 0.3, 0.6, 0.3, 0.5, 0.8, 0.5, 0.8, 1][j]}"></span>`).join('')}</div>`;
  else if (/timeline|developments|week/.test(t)) viz = '<div class="sp-tl"><span></span><span></span><span></span><span></span><span></span></div>';
  else if (/rating|scenarios|verdict|level|watched/.test(t)) viz = '<div class="sp-bars"><span style="width:82%"></span><span style="width:56%"></span><span style="width:34%"></span></div>';
  return `<div class="sp-b" data-part="${i}">${n}<div class="sp-h"></div>${viz}<div class="sp-l">${lines(viz ? 2 : 3)}</div></div>`;
}

function draw(id) {
  const p = svc.products.find((x) => x.id === id) || svc.products[0];
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
<div class="svc-spec-h"><span class="meta">${esc(W.example)}</span><h2>${esc(p.name)}</h2><p>${esc(L(p.line))}</p></div>
${p.sample ? '' : `<p class="svc-soon">${esc(W.soon)}</p>`}
<div class="spec">
<div class="sheet" aria-hidden="true"><div class="sh-top"><span class="sh-mark"></span><span class="sh-title">${esc(p.name)}</span></div>${p.parts.map(block).join('')}</div>
<ol class="notes">${p.parts.map((x, i) => `<li data-part="${i}"><span class="sp-n">${i + 1}</span><div><b>${esc(L(x[0]))}</b><span>${esc(L(x[1]))}</span></div></li>`).join('')}</ol>
</div>
<dl class="svc-meta"><div><dt>${esc(W.when)}</dt><dd>${esc(L(p.when))}</dd></div><div><dt>${esc(W.format)}</dt><dd>${esc(L(p.format))}</dd></div></dl>
</div>
<aside class="svc-list">
<span class="meta">${esc(W.products)}</span>
${svc.products.map((x) => `<a class="svc-p${x.id === p.id ? ' on' : ''}" href="#${x.id}" data-id="${x.id}"${x.id === p.id ? ' aria-current="true"' : ''}><b>${esc(x.name)}</b><span>${esc(L(x.line))}</span></a>`).join('')}
<span class="meta svc-other">${esc(W.other)}</span>
${others.map(([, s]) => `<a class="lnk" href="${s.path}">${esc(L(s.k).charAt(0) + L(s.k).slice(1).toLowerCase())} <span class="ar">→</span></a>`).join('')}
</aside>
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
  root.addEventListener('mouseleave', () => root.querySelectorAll('[data-part].hi').forEach((x) => x.classList.remove('hi')));
}
