// CONTEXT on the public site — what is happening, and why: the latest daily issue (the same source as /news) and the
// analytical articles (public/data/articles.json). Forecasts live in TIME (/time). No framework, like the rest of the site.
import './site.css';
import './area.css';
import './chrome.js';
import { lang as siteLang } from './i18n.js';
import { guard } from './auth.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' });
const safeUrl = (u) => (/^https:\/\//i.test(u || '') || /^\/[^/]/.test(u || '') ? u : '');

// The section switcher follows the scroll.
const tabs = [...document.querySelectorAll('.seg a[data-s]')];
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) tabs.forEach((t) => t.classList.toggle('on', t.dataset.s === e.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
['digest', 'articles'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });

// ── the digest ──
// The issue follows the site's language (src/site/i18n.js): Ukrainian in Ukrainian, English otherwise — the issue
// itself is written in those two; the words around it are in the site's language.
const W = {
  uk: { day: 'uk-UA', issue: 'Випуск за', at: '17:00 за Києвом', source: 'Джерело', making: 'Збираю сьогоднішній випуск…', full: 'Відкрити повний випуск', down: 'Випуск зараз недоступний. Він виходить щодня о 17:00 за Києвом —', open: 'відкрити CONTEXT News' },
  en: { day: 'en-GB', issue: 'Issue of', at: '17:00 Kyiv', source: 'Source', making: 'Today’s issue is being put together…', full: 'Open the full issue', down: 'The issue is not available right now. It is published every day at 17:00 Kyiv time —', open: 'open CONTEXT News' },
  de: { day: 'de-DE', issue: 'Ausgabe vom', at: '17:00 Uhr Kyjiw', source: 'Quelle', making: 'Die heutige Ausgabe wird zusammengestellt…', full: 'Vollständige Ausgabe öffnen', down: 'Die Ausgabe ist gerade nicht verfügbar. Sie erscheint täglich um 17:00 Uhr Kyjiwer Zeit —', open: 'CONTEXT News öffnen' },
  fr: { day: 'fr-FR', issue: 'Édition du', at: '17 h, heure de Kyiv', source: 'Source', making: 'L’édition du jour est en préparation…', full: 'Ouvrir l’édition complète', down: 'L’édition n’est pas disponible pour le moment. Elle paraît chaque jour à 17 h, heure de Kyiv —', open: 'ouvrir CONTEXT News' },
};
const lang = siteLang === 'uk' ? 'uk' : 'en'; // the issue's own language
const say = W[siteLang] || W.en; // the words around it
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
<div class="src"><span>${esc(x.domain || '')}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${say.source} ↗</a>` : ''}</div></div></article>`;
}
function drawIssue() {
  const t = say;
  document.getElementById('digest-body').lang = lang;
  document.getElementById('issue-meta').textContent = `${t.issue} ${new Date(issue.for || issue.at).toLocaleDateString(t.day, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' })} · ${t.at}`;
  document.getElementById('digest-body').innerHTML = issue.sections.filter((s) => s.items?.length).map((s) => {
    const part = (lang === 'en' ? s.en?.part || s.part : s.part) || '';
    const title = lang === 'en' ? s.en?.title : s.title;
    return `<div class="sec"><div class="sec-t">${esc(part.replace(/^(SECTION|РОЗДІЛ)\s*\d+\s*\|\s*/i, ''))}${title ? ` · ${esc(title)}` : ''}</div>
<div class="items${s.id === 'key' ? ' key' : ''}">${s.items.map(itemHtml).join('')}</div></div>`;
  }).join('') + `<p><a class="lnk" href="/news">${t.full} <span class="ar">→</span></a></p>`;
}
async function digest() {
  const meta = document.getElementById('issue-meta');
  const body = document.getElementById('digest-body');
  try {
    const res = await fetch('/api/pulse?news=1');
    const j = await res.json().catch(() => ({}));
    if (res.ok && !j.sections?.length && j.making) { meta.textContent = say.making; setTimeout(digest, 20000); return; }
    if (!res.ok || !j.sections?.length) throw new Error(j.message || 'empty');
    issue = j;
    drawIssue();
  } catch {
    meta.textContent = '';
    body.innerHTML = `<div class="empty">${say.down} <a class="lnk" href="/news">${say.open} <span class="ar">→</span></a></div>`;
  }
}


// Articles: analytical texts grounded in research (public/data/articles.json) — newest first.
async function articles() {
  const box = document.getElementById('ar-list');
  let list = [];
  try { list = (await (await fetch('/data/articles.json', { cache: 'no-cache' })).json()).articles || []; } catch { /* none yet */ }
  list = list.filter((a) => a && a.title && !a.draft).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  box.innerHTML = list.length ? list.map((a) => `<a class="art" href="${esc(safeUrl(a.url) || '#')}" lang="${esc(a.lang || 'en')}"><span class="meta">${esc(a.topic || '')}${a.date ? ` · ${day(a.date)}` : ''}</span><h3>${esc(a.title)}</h3>${a.summary ? `<p>${esc(a.summary)}</p>` : ''}</a>`).join('')
    : '<p class="meta">No articles published yet.</p>';
}

// CONTEXT opens to approved users only (src/site/auth.js).
guard(document.getElementById('gate'), 'CONTEXT', () => {
  document.getElementById('area').hidden = false;
  digest();
  articles();
});
