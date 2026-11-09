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

// The tabs switch the page between the digest and the articles (#articles opens the articles).
const tabs = [...document.querySelectorAll('.seg a[data-s]')];
function showTab(id) {
  tabs.forEach((t) => t.classList.toggle('on', t.dataset.s === id));
  ['digest', 'articles'].forEach((k) => { const el = document.getElementById(k); if (el) el.hidden = k !== id; });
  const meta = document.getElementById('issue-meta');
  if (meta) meta.style.visibility = id === 'digest' ? '' : 'hidden';
}
tabs.forEach((t) => t.addEventListener('click', (e) => { e.preventDefault(); showTab(t.dataset.s); history.replaceState(null, '', t.dataset.s === 'digest' ? location.pathname + location.search : `#${t.dataset.s}`); }));
showTab(location.hash === '#articles' ? 'articles' : 'digest');

// ── the digest ──
// The issue follows the site's language (src/site/i18n.js): Ukrainian in Ukrainian, English otherwise — the issue
// itself is written in those two; the words around it are in the site's language.
const W = {
  uk: { loading: 'Завантажую останній випуск…', day: 'uk-UA', issue: 'Випуск за', at: '17:00 за Києвом', source: 'Джерело', making: 'Збираю сьогоднішній випуск…', full: 'Відкрити повний випуск', down: 'Випуск зараз недоступний. Він виходить щодня о 17:00 за Києвом —', open: 'відкрити CONTEXT News' },
  en: { loading: 'Loading the latest issue…', day: 'en-GB', issue: 'Issue of', at: '17:00 Kyiv', source: 'Source', making: 'Today’s issue is being put together…', full: 'Open the full issue', down: 'The issue is not available right now. It is published every day at 17:00 Kyiv time —', open: 'open CONTEXT News' },
  de: { loading: 'Die neueste Ausgabe wird geladen…', day: 'de-DE', issue: 'Ausgabe vom', at: '17:00 Uhr Kyjiw', source: 'Quelle', making: 'Die heutige Ausgabe wird zusammengestellt…', full: 'Vollständige Ausgabe öffnen', down: 'Die Ausgabe ist gerade nicht verfügbar. Sie erscheint täglich um 17:00 Uhr Kyjiwer Zeit —', open: 'CONTEXT News öffnen' },
  fr: { loading: 'Chargement de la dernière édition…', day: 'fr-FR', issue: 'Édition du', at: '17 h, heure de Kyiv', source: 'Source', making: 'L’édition du jour est en préparation…', full: 'Ouvrir l’édition complète', down: 'L’édition n’est pas disponible pour le moment. Elle paraît chaque jour à 17 h, heure de Kyiv —', open: 'ouvrir CONTEXT News' },
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
const ruPicture = (u) => { try { return /(^|\.)(ru|рф|su)$/i.test(new URL(u).hostname); } catch { return false; } }; // as src/lib/news.js
const viaServer = (u) => `/api/pulse?news=1&img=${encodeURIComponent(u)}`;
function itemHtml(x) {
  const [head, rest] = lang === 'en' ? split(x.summary_en || x.summary || x.title) : [x.title || '', x.summary || ''];
  const img = safeUrl(x.image);
  const url = safeUrl(x.url);
  // A Russian site's picture comes through the site's server (they refuse other sites); any picture that does not
  // load is tried through the server, then the plain picture — never an empty dark box (as on /news).
  const src = img && ruPicture(img) ? viaServer(img) : img;
  return `<article class="item">${img ? `<div class="ph"><img src="${esc(src)}" data-orig="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : ''}
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
    // Each section folded: its name and how many items; a click opens it.
    return `<details class="sec"><summary class="sec-t"><span>${esc(part.replace(/^(SECTION|РОЗДІЛ)\s*\d+\s*\|\s*/i, ''))}${title ? ` · ${esc(title)}` : ''}</span><span class="sec-n">${s.items.length}</span></summary>
<div class="items${s.id === 'key' ? ' key' : ''}">${s.items.map(itemHtml).join('')}</div></details>`;
  }).join('') + `<p><a class="lnk" href="/news">${t.full} <span class="ar">→</span></a></p>`;
}
document.getElementById('digest-body')?.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  const orig = img.dataset.orig || '';
  if (!img.dataset.step && orig.startsWith('http') && !img.src.includes('&img=')) { img.dataset.step = 'proxy'; img.src = viaServer(orig); } else if (img.dataset.step !== 'plain') { img.dataset.step = 'plain'; img.src = '/news-img/plain.jpg'; }
}, true);
async function digest() {
  const meta = document.getElementById('issue-meta');
  const body = document.getElementById('digest-body');
  // The state is told in the digest itself too: on a phone the bar's date line is hidden, and an empty page
  // looked broken while the issue was loading or being made.
  const wait = (text) => { meta.textContent = text; if (!body.querySelector('details')) body.innerHTML = `<p class="dg-wait">${esc(text)}</p>`; };
  wait(say.loading);
  try {
    // A slow network or a stuck request ends in the «not available» message after 30 s, not in an empty page.
    const ctl = new AbortController();
    const stop = setTimeout(() => ctl.abort(), 30000);
    const res = await fetch('/api/pulse?news=1', { signal: ctl.signal }).finally(() => clearTimeout(stop));
    const j = await res.json().catch(() => ({}));
    if (res.ok && !j.sections?.length && j.making) { wait(say.making); setTimeout(digest, 20000); return; }
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
