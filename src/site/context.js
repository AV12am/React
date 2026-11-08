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
// The issue in Ukrainian or English, as on /news — the same choice, remembered under the same key.
const LANG_KEY = 'context-news-lang';
const W = {
  uk: { day: 'uk-UA', issue: 'Випуск за', at: '17:00 за Києвом', source: 'Джерело', making: 'Збираю сьогоднішній випуск…', full: 'Відкрити повний випуск', down: 'Випуск зараз недоступний. Він виходить щодня о 17:00 за Києвом —', open: 'відкрити CONTEXT News' },
  en: { day: 'en-GB', issue: 'Issue of', at: '17:00 Kyiv', source: 'Source', making: 'Today’s issue is being put together…', full: 'Open the full issue', down: 'The issue is not available right now. It is published every day at 17:00 Kyiv time —', open: 'open CONTEXT News' },
};
let lang = (() => { try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'uk'; } catch { return 'uk'; } })();
let issue = null;

// In English the headline is the first sentence of the English summary (the titles stay as the outlets wrote them).
function split(s) {
  const t = String(s || '').trim();
  const m = t.match(/^(.{20,220}?[.!?])\s+(.+)$/s);
  return m ? [m[1], m[2]] : [t, ''];
}
function itemHtml(x) {
  const [head, rest] = lang === 'en' ? split(x.summary_en || x.summary || x.title) : [x.title || '', x.summary || ''];
  const img = safeUrl(x.image);
  const url = safeUrl(x.url);
  return `<article class="item">${img ? `<div class="ph" style="background-image:url('${esc(img).replace(/'/g, '%27')}')" role="img" aria-label=""></div>` : ''}
<div class="bd"><h3>${esc(head)}</h3>${rest ? `<p>${esc(rest)}</p>` : ''}
<div class="src"><span>${esc(x.domain || '')}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${W[lang].source} ↗</a>` : ''}</div></div></article>`;
}
function drawIssue() {
  const t = W[lang];
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.getElementById('digest-body').lang = lang;
  document.getElementById('issue-meta').textContent = `${t.issue} ${new Date(issue.for || issue.at).toLocaleDateString(t.day, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' })} · ${t.at}`;
  document.getElementById('digest-body').innerHTML = issue.sections.filter((s) => s.items?.length).map((s) => {
    const part = (lang === 'en' ? s.en?.part || s.part : s.part) || '';
    const title = lang === 'en' ? s.en?.title : s.title;
    return `<div class="sec"><div class="sec-t">${esc(part.replace(/^(SECTION|РОЗДІЛ)\s*\d+\s*\|\s*/i, ''))}${title ? ` · ${esc(title)}` : ''}</div>
<div class="items${s.id === 'key' ? ' key' : ''}">${s.items.map(itemHtml).join('')}</div></div>`;
  }).join('') + `<p><a class="lnk" href="/news">${t.full} <span class="ar">→</span></a></p>`;
}
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* not remembered */ }
  if (issue) drawIssue(); else document.querySelectorAll('[data-lang]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.lang === lang)));
}));
document.querySelectorAll('[data-lang]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.lang === lang)));
async function digest() {
  const meta = document.getElementById('issue-meta');
  const body = document.getElementById('digest-body');
  try {
    const res = await fetch('/api/pulse?news=1');
    const j = await res.json().catch(() => ({}));
    if (res.ok && !j.sections?.length && j.making) { meta.textContent = W[lang].making; setTimeout(digest, 20000); return; }
    if (!res.ok || !j.sections?.length) throw new Error(j.message || 'empty');
    issue = j;
    drawIssue();
  } catch {
    meta.textContent = '';
    body.innerHTML = `<div class="empty">${W[lang].down} <a class="lnk" href="/news">${W[lang].open} <span class="ar">→</span></a></div>`;
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
