// CONTEXT on the public site: the latest daily issue (from the same source as /news, in English) and the
// forecasts with their record (public/data/forecasts.json). No framework, like the rest of the site.
import './site.css';
import './area.css';
import { gaugeSvg } from './petals.js';
import { visibleForecasts, trackRecord, elapsed, brier } from '../lib/forecasts.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' });
const safeUrl = (u) => (/^https:\/\//i.test(u || '') || /^\/[^/]/.test(u || '') ? u : '');

// The section switcher follows the scroll.
const tabs = [...document.querySelectorAll('.seg a[data-s]')];
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) tabs.forEach((t) => t.classList.toggle('on', t.dataset.s === e.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
['digest', 'forecasts'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });

// ── the digest ──
// The headline is the first sentence of the English summary; the rest of it is the text.
function split(s) {
  const t = String(s || '').trim();
  const m = t.match(/^(.{20,220}?[.!?])\s+(.+)$/s);
  return m ? [m[1], m[2]] : [t, ''];
}
function itemHtml(x) {
  const [head, rest] = split(x.summary_en || x.summary || x.title);
  const img = safeUrl(x.image);
  const url = safeUrl(x.url);
  return `<article class="item">${img ? `<div class="ph" style="background-image:url('${esc(img).replace(/'/g, '%27')}')" role="img" aria-label=""></div>` : ''}
<div class="bd"><h3>${esc(head)}</h3>${rest ? `<p>${esc(rest)}</p>` : ''}
<div class="src"><span>${esc(x.domain || '')}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}</div></div></article>`;
}
async function digest() {
  const meta = document.getElementById('issue-meta');
  const body = document.getElementById('digest-body');
  try {
    const res = await fetch('/api/pulse?news=1');
    const j = await res.json().catch(() => ({}));
    if (res.ok && !j.sections?.length && j.making) { meta.textContent = 'Today\'s issue is being put together…'; setTimeout(digest, 20000); return; }
    if (!res.ok || !j.sections?.length) throw new Error(j.message || 'empty');
    meta.textContent = `Issue of ${day(j.for || j.at)} · 17:00 Kyiv`;
    body.innerHTML = j.sections.filter((s) => s.items?.length).map((s) => {
      const title = (s.en?.part || s.part || '').replace(/^SECTION\s*\d+\s*\|\s*/i, '');
      return `<div class="sec"><div class="sec-t">${esc(title)}${s.en?.title ? ` · ${esc(s.en.title)}` : ''}</div>
<div class="items${s.id === 'key' ? ' key' : ''}">${s.items.map(itemHtml).join('')}</div></div>`;
    }).join('') + '<p><a class="lnk" href="/news">Open the full issue, with Ukrainian and English <span class="ar">→</span></a></p>';
  } catch {
    meta.textContent = '';
    body.innerHTML = '<div class="empty">The issue is not available right now. It is published every day at 17:00 Kyiv time — <a class="lnk" href="/news">open CONTEXT News <span class="ar">→</span></a></div>';
  }
}

// ── forecasts ──
const STATUS = { open: ['Open', ''], happened: ['Happened', 'yes'], not: ['Did not happen', 'no'] };
function forecastHtml(f) {
  const [label, cls] = STATUS[f.status] || STATUS.open;
  const pct = Math.round(f.p * 100);
  const b = brier(f);
  const done = Math.round(elapsed(f) * 100);
  const scn = (f.scenarios || []).map((s) => `<div><span>${esc(s.name)}</span><i><b style="width:${Math.round(s.p * 100)}%"></b></i><em>${Math.round(s.p * 100)}%</em></div>`).join('');
  const src = (f.sources || []).map((s) => `<a class="lnk" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}${s.grade ? ` · ${esc(s.grade)}` : ''} ↗</a>`).join('');
  return `<article class="fc" id="${esc(f.id)}">
<div class="g">${gaugeSvg(f.p, 112)}<div class="pct">${pct}%</div></div>
<div>
<div class="top"><span>${esc(f.kind || 'Forecast')} № ${String(f.no || '').padStart(2, '0')}</span><span>·</span><span>${esc(f.topic || '')}</span><span class="chip ${cls}">${label}</span>${f.draft ? '<span class="chip draft">Draft</span>' : ''}${b !== null ? `<span class="chip">Brier ${b.toFixed(3)}</span>` : ''}</div>
<h3>${esc(f.question)}</h3>
<p>${esc(f.conclusion || '')}</p>
${scn ? `<div class="scn">${scn}</div>` : ''}
${f.position ? `<p class="note">${esc(f.position)}</p>` : ''}
<div class="hzn"><b style="width:${done}%"></b></div>
<div class="hzl"><span>Published ${day(f.published)}</span><span>Checked on ${day(f.check)}</span></div>
${f.resolves ? `<p class="note" style="margin-top:10px">${esc(f.resolves)}</p>` : ''}
${src ? `<div class="acts">${src}</div>` : ''}
</div></article>`;
}
async function forecasts() {
  const stats = document.getElementById('fc-stats');
  const list = document.getElementById('fc-list');
  let all = [];
  try { all = (await (await fetch('/data/forecasts.json', { cache: 'no-cache' })).json()).forecasts || []; } catch { /* none yet */ }
  const shown = visibleForecasts(all, new URLSearchParams(location.search).has('drafts'));
  const r = trackRecord(shown.filter((f) => !f.draft));
  stats.innerHTML = [[r.published, 'published'], [r.open, 'open'], [r.resolved, 'checked'], [r.brier === null ? '—' : r.brier.toFixed(3), 'mean Brier score (0 is perfect)']]
    .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  list.innerHTML = shown.length ? shown.map(forecastHtml).join('')
    : '<div class="empty">The first forecasts are being prepared. Each will carry a probability, the scenarios behind it and the date it will be checked.</div>';
}

digest();
forecasts();
