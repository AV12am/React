// CONTEXT on the public site — what is happening, and why: the latest daily issue (the same source as /news) and the
// analytical articles (public/data/articles.json). Forecasts live in TIME (/time). No framework, like the rest of the site.
import './site.css';
import './area.css';
import './chrome.js';
import { lang as siteLang } from './i18n.js';
import { guard } from './auth.js';
import { newsPdf, thumb, localize, issueFileName } from '../lib/newsExport.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' });
const safeUrl = (u) => (/^https:\/\//i.test(u || '') || /^\/[^/]/.test(u || '') ? u : '');

// The tabs switch the page between the digest and the articles (#articles opens the articles).
const tabs = [...document.querySelectorAll('.seg a[data-s]')];
function showTab(id) {
  tabs.forEach((t) => t.classList.toggle('on', t.dataset.s === id));
  document.querySelectorAll('[data-go]').forEach((g) => g.classList.toggle('on', g.dataset.go === id));
  ['digest', 'articles', 'archive'].forEach((k) => { const el = document.getElementById(k); if (el) el.hidden = k !== id; });
  const meta = document.getElementById('issue-meta');
  if (meta) meta.style.visibility = id === 'digest' ? '' : 'hidden';
}
const open = (id) => { showTab(id); history.replaceState(null, '', id === 'digest' ? location.pathname + location.search : `#${id}`); if (id === 'archive') archive(); };
tabs.forEach((t) => t.addEventListener('click', (e) => { e.preventDefault(); open(t.dataset.s); }));
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (!g) return; e.preventDefault(); open(g.dataset.go); window.scrollTo({ top: 0, behavior: 'smooth' }); });
const firstTab = ['articles', 'archive'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'digest';
showTab(firstTab);

// ── the digest ──
// The issue follows the site's language (src/site/i18n.js): Ukrainian in Ukrainian, English otherwise — the issue
// itself is written in those two; the words around it are in the site's language.
const W = {
  uk: { arch: 'Архів', archHint: 'Випуск кожного дня — у PDF. Оберіть день у календарі.', none: 'Цього дня випуску немає', making2: 'Готую PDF…', saveFail: 'Не вдалося зробити PDF', empty2: 'Архів ще порожній: випуски потрапляють сюди щодня з 17:00.', prev: 'Попередній місяць', next: 'Наступний місяць', issuesIn: 'випусків', wk: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'], loading: 'Завантажую останній випуск…', day: 'uk-UA', issue: 'Випуск за', at: '17:00 за Києвом', source: 'Джерело', making: 'Збираю сьогоднішній випуск…', full: 'Відкрити повний випуск', down: 'Випуск зараз недоступний. Він виходить щодня о 17:00 за Києвом —', open: 'відкрити CONTEXT News' },
  en: { arch: 'Archive', archHint: 'Every day’s issue as a PDF. Pick a day in the calendar.', none: 'No issue that day', making2: 'Making the PDF…', saveFail: 'Could not make the PDF', empty2: 'The archive is still empty: issues are added every day from 17:00.', prev: 'Previous month', next: 'Next month', issuesIn: 'issues', wk: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], loading: 'Loading the latest issue…', day: 'en-GB', issue: 'Issue of', at: '17:00 Kyiv', source: 'Source', making: 'Today’s issue is being put together…', full: 'Open the full issue', down: 'The issue is not available right now. It is published every day at 17:00 Kyiv time —', open: 'open CONTEXT News' },
  de: { arch: 'Archiv', archHint: 'Die Ausgabe jedes Tages als PDF. Wählen Sie einen Tag im Kalender.', none: 'An diesem Tag keine Ausgabe', making2: 'PDF wird erstellt…', saveFail: 'PDF konnte nicht erstellt werden', empty2: 'Das Archiv ist noch leer: Ausgaben kommen täglich ab 17:00 hinzu.', prev: 'Vorheriger Monat', next: 'Nächster Monat', issuesIn: 'Ausgaben', wk: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], loading: 'Die neueste Ausgabe wird geladen…', day: 'de-DE', issue: 'Ausgabe vom', at: '17:00 Uhr Kyjiw', source: 'Quelle', making: 'Die heutige Ausgabe wird zusammengestellt…', full: 'Vollständige Ausgabe öffnen', down: 'Die Ausgabe ist gerade nicht verfügbar. Sie erscheint täglich um 17:00 Uhr Kyjiwer Zeit —', open: 'CONTEXT News öffnen' },
  fr: { arch: 'Archives', archHint: 'L’édition de chaque jour en PDF. Choisissez un jour dans le calendrier.', none: 'Pas d’édition ce jour-là', making2: 'Préparation du PDF…', saveFail: 'Impossible de créer le PDF', empty2: 'Les archives sont encore vides : une édition s’ajoute chaque jour à 17 h.', prev: 'Mois précédent', next: 'Mois suivant', issuesIn: 'éditions', wk: ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'], loading: 'Chargement de la dernière édition…', day: 'fr-FR', issue: 'Édition du', at: '17 h, heure de Kyiv', source: 'Source', making: 'L’édition du jour est en préparation…', full: 'Ouvrir l’édition complète', down: 'L’édition n’est pas disponible pour le moment. Elle paraît chaque jour à 17 h, heure de Kyiv —', open: 'ouvrir CONTEXT News' },
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
  }).join('') + `<p class="dg-links"><a class="lnk" href="/news">${t.full} <span class="ar">→</span></a><a class="lnk" href="#archive" data-go="archive">${t.arch} <span class="ar">→</span></a></p>`;
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
  // «Loading» only when it takes a while (a quick answer shows the issue straight away, nothing flickers).
  const slow = setTimeout(() => wait(say.loading), 800);
  try {
    // A slow network or a stuck request ends in the «not available» message after 30 s, not in an empty page.
    const ctl = new AbortController();
    const stop = setTimeout(() => ctl.abort(), 30000);
    const res = await fetch('/api/pulse?news=1', { signal: ctl.signal }).finally(() => { clearTimeout(stop); clearTimeout(slow); });
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


// ── the archive: a calendar of the days there are issues for; a day gives its issue as a PDF ──
const ARCH = { days: null, month: null, busy: '' };
const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function drawArchive() {
  const box = document.getElementById('arch-body');
  const t = say;
  if (!ARCH.days.length) { box.innerHTML = `<p class="meta">${esc(t.empty2)}</p>`; return; }
  const have = new Set(ARCH.days);
  const [y, m] = ARCH.month;
  const first = new Date(Date.UTC(y, m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const title0 = first.toLocaleDateString(t.day, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const title = title0.charAt(0).toUpperCase() + title0.slice(1);
  const inMonth = ARCH.days.filter((d) => d.startsWith(ymd(y, m, 1).slice(0, 8))).length;
  const oldest = ARCH.days[ARCH.days.length - 1]; const newest = ARCH.days[0];
  const canPrev = ymd(y, m, 1) > oldest.slice(0, 8) + '01' || oldest.slice(0, 7) < ymd(y, m, 1).slice(0, 7);
  const canNext = newest.slice(0, 7) > ymd(y, m, 1).slice(0, 7);
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span class="cal-d cal-d--pad"></span>';
  for (let d = 1; d <= count; d++) {
    const key = ymd(y, m, d);
    cells += have.has(key)
      ? `<button type="button" class="cal-d cal-d--on${ARCH.busy === key ? ' is-busy' : ''}" data-day="${key}" title="${esc(issueFileName({ for: `${key}T14:00:00Z` }, 'pdf', lang))}">${d}<span class="cal-pdf">PDF</span></button>`
      : `<span class="cal-d" title="${esc(t.none)}">${d}</span>`;
  }
  box.innerHTML = `<div class="cal">
<div class="cal-h"><button type="button" class="cal-nav" data-nav="-1" aria-label="${esc(t.prev)}" ${canPrev ? '' : 'disabled'}>←</button><span class="cal-t">${esc(title)}</span><span class="meta">${inMonth} ${esc(t.issuesIn)}</span><button type="button" class="cal-nav" data-nav="1" aria-label="${esc(t.next)}" ${canNext ? '' : 'disabled'}>→</button></div>
<div class="cal-g">${t.wk.map((w) => `<span class="cal-w">${w}</span>`).join('')}${cells}</div>
<p class="meta cal-msg" id="arch-msg" aria-live="polite">${ARCH.busy ? esc(t.making2) : ''}</p></div>`;
}
async function dayPdf(key) {
  if (ARCH.busy) return;
  ARCH.busy = key; drawArchive();
  try {
    const res = await fetch(`/api/pulse?news=1&archive=${key}`);
    const issue = await res.json();
    if (!res.ok || !issue.sections) throw new Error(issue.message || `HTTP ${res.status}`);
    // The pictures through the server, as the full issue does (sources do not let a browser read them).
    const urls = [...new Set(issue.sections.flatMap((s) => s.items.map((x) => x.image)).filter(Boolean))];
    const pics = new Map();
    await Promise.all(urls.map(async (u) => {
      try {
        const r = await fetch(u.startsWith('/') ? u : `/api/pulse?news=1&day=${key}&img=${encodeURIComponent(u)}`);
        if (r.ok) { const p = await thumb(await r.blob()); if (p) pics.set(u, p); }
      } catch { /* that row goes without its picture */ }
    }));
    const blob = await newsPdf(localize(issue, lang), pics, lang);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = issueFileName(issue, 'pdf', lang);
    document.body.appendChild(a); a.click(); a.remove();
    window.open(a.href, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    ARCH.busy = ''; drawArchive();
  } catch (e) {
    ARCH.busy = ''; drawArchive();
    const msg = document.getElementById('arch-msg'); if (msg) msg.textContent = `${say.saveFail}: ${e.message}`;
  }
}
document.getElementById('arch-body')?.addEventListener('click', (e) => {
  const day = e.target.closest('[data-day]');
  if (day) { dayPdf(day.dataset.day); return; }
  const nav = e.target.closest('[data-nav]');
  if (nav && !nav.disabled) { const [y, m] = ARCH.month; const d = new Date(Date.UTC(y, m + +nav.dataset.nav, 1)); ARCH.month = [d.getUTCFullYear(), d.getUTCMonth()]; drawArchive(); }
});
async function archive() {
  if (ARCH.days) return drawArchive();
  const box = document.getElementById('arch-body');
  box.innerHTML = `<p class="meta">${esc(say.loading)}</p>`;
  try {
    const j = await (await fetch('/api/pulse?news=1&archive=list')).json();
    ARCH.days = Array.isArray(j.days) ? j.days : [];
  } catch { ARCH.days = []; }
  const last = ARCH.days[0] || new Date().toISOString().slice(0, 10);
  ARCH.month = [+last.slice(0, 4), +last.slice(5, 7) - 1];
  drawArchive();
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
  if (firstTab === 'archive') archive();
});
