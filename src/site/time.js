// TIME on the public site: forecasts — what will happen, and when (public/data/time.json, one entry per brief).
// The first page is interactive: a timeline from today to each check date; per forecast the probability, the
// scenarios (pick one — its flows, paths and «what changes the estimate» light up), the scenario flows H → N,
// signs to watch, the position, and the method (coefficients, research, sources, every path). The brief's own PDF
// is offered for download. The forecast's text stays in the language it was written in; its labels follow it.
import './site.css';
import './area.css';
import './chrome.js';
import { gaugeSvg } from './petals.js';
import { lang as siteLang } from './i18n.js';
import { visibleForecasts, trackRecord, brier } from '../lib/forecasts.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400000;
const t = (d) => Date.parse(`${d}T12:00:00Z`);

const L = {
  uk: { loc: 'uk-UA', today: 'Сьогодні', check: 'Перевірка', conf: 'рівень довіри', conclusion: 'Висновок', scen: 'Сценарії · рівень 1', p: 'P', chance: 'Шанс події', signs: 'Ознаки перегляду',
    flows: 'Сценарні течії', variants: 'варіанти', paths: 'шляхи', position: 'Позиція аналізу', method: 'Метод: коефіцієнти, дослідження, джерела', coef: 'Коефіцієнтна частка', level: 'Рів.', variable: 'Змінна',
    values: 'Коефіцієнти', why: 'Чому такі · дослідження', research: 'Дослідження', sources: 'Джерела', all: 'Усі варіанти', changes: 'Що змінить оцінку', pdf: 'Завантажити PDF', status: { open: 'відкритий', happened: 'сталося', not: 'не сталося' },
    left: (n) => `${n} дн. до перевірки`, done: 'перевірено', pick: 'Оберіть сценарій — підсвітяться його течії та шляхи.', excl: 'викл.', reset: 'Усі сценарії' },
  en: { loc: 'en-GB', today: 'Today', check: 'Check', conf: 'confidence', conclusion: 'Conclusion', scen: 'Scenarios · level 1', p: 'P', chance: 'Chance of the event', signs: 'Revision signals',
    flows: 'Scenario flows', variants: 'variants', paths: 'paths', position: 'Analytical position', method: 'Method: coefficients, research, sources', coef: 'Coefficients', level: 'Lvl', variable: 'Variable',
    values: 'Coefficients', why: 'Why · research', research: 'Research', sources: 'Sources', all: 'All variants', changes: 'What changes the estimate', pdf: 'Download PDF', status: { open: 'open', happened: 'happened', not: 'did not happen' },
    left: (n) => `${n} days to the check`, done: 'checked', pick: 'Pick a scenario — its flows and paths light up.', excl: 'excl.', reset: 'All scenarios' },
};
const lab = (f) => L[f.lang] || L.en;
// The brief's PDF: a small icon that downloads it.
const PDF_SVG = '<svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true"><path d="M3 1h7l4 4v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10 1v4h4" fill="none" stroke="currentColor" stroke-width="1.2"/><text x="8" y="13.5" text-anchor="middle" font-size="4.6" font-weight="700" fill="currentColor" font-family="Inter, sans-serif">PDF</text></svg>';
const pdfIcon = (f) => (f.pdf ? `<a class="tm-pdf" href="${esc(f.pdf)}" download="${esc(f.pdf.split('/').pop())}" title="${esc(lab(f).pdf)}" aria-label="${esc(lab(f).pdf)}">${PDF_SVG}</a>` : '');
const pc = (x, f, d = 2) => `${(x * 100).toLocaleString(lab(f).loc, { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const num = (x, f) => x.toLocaleString(lab(f).loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Dates as the briefs write them: 14.11.2026 in Ukrainian, 14 Nov 2026 in English.
const dmy = (d, f) => new Date(t(d)).toLocaleDateString(lab(f).loc, lab(f).loc === 'uk-UA' ? { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// ── the timeline: a ruler of days and weeks, the months named in the site's language; the time gone solid, the
// time ahead dashed; today a glowing point; each forecast a ring filled to its probability at its check date,
// with the days left. Drawn at the box's real width (text stays sharp) and again when the width changes.
const UI = {
  en: { loc: 'en-GB', today: 'Today', open: 'open', checked: 'checked', days: (n) => `${n} ${n === 1 ? 'day' : 'days'}`, brier: 'mean Brier' },
  de: { loc: 'de-DE', today: 'Heute', open: 'offen', checked: 'geprüft', days: (n) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`, brier: 'mittlerer Brier-Wert' },
  fr: { loc: 'fr-FR', today: 'Aujourd’hui', open: 'ouvertes', checked: 'vérifiées', days: (n) => `${n} ${n === 1 ? 'jour' : 'jours'}`, brier: 'Brier moyen' },
  uk: { loc: 'uk-UA', today: 'Сьогодні', open: 'відкритих', checked: 'перевірених', days: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дні' : 'днів'}`, brier: 'середній Брайєр' },
};
const ui = UI[siteLang] || UI.en;
function timeline(list) {
  const box = document.getElementById('timeline');
  const draw = () => {
    const W = Math.max(320, box.clientWidth);
    const now = Date.now();
    const from = Math.min(now, ...list.map((f) => t(f.published))) - 5 * DAY;
    const to = Math.max(now + 21 * DAY, ...list.map((f) => t(f.check))) + 10 * DAY;
    const padL = 8; const padR = 84; // room on the right for the last ring's percentage
    const x = (ms) => padL + ((ms - from) / (to - from)) * (W - padL - padR);
    const rulerY = 34; const rowH = 92; const top = 70;
    const H = top + list.length * rowH;
    // the ruler: a tick a day, a longer one a week (Monday), the month named at its first day
    const ticks = [];
    const start = new Date(from); start.setUTCHours(0, 0, 0, 0);
    for (let d = start.getTime(); d <= to; d += DAY) {
      const dt = new Date(d);
      const first = dt.getUTCDate() === 1;
      const mon = dt.getUTCDay() === 1;
      ticks.push(`<line class="${first ? 'tk-m' : mon ? 'tk-w' : 'tk-d'}" x1="${x(d).toFixed(1)}" x2="${x(d).toFixed(1)}" y1="${rulerY - (first ? 14 : mon ? 8 : 4)}" y2="${rulerY}"/>`);
      if (first) ticks.push(`<text class="mo" x="${(x(d) + 6).toFixed(1)}" y="${rulerY - 6}">${dt.toLocaleDateString(ui.loc, { month: 'long', timeZone: 'UTC' }).toUpperCase()}${dt.getUTCMonth() === 0 ? ` ${dt.getUTCFullYear()}` : ''}</text>`);
    }
    const nx = x(now);
    const rows = list.map((f, i) => {
      const y = top + i * rowH + 40;
      const x0 = x(t(f.published)); const x1 = x(t(f.check)); const xn = Math.min(Math.max(nx, x0), x1);
      const left = Math.max(0, Math.ceil((t(f.check) - now) / DAY));
      const r = 15; const c = 2 * Math.PI * r;
      const ms = (f.milestones || []).map((m) => { const at = m.date ? t(m.date) : t(`${m.month}-15`); const mx = x(at);
        return `<g class="ms"><path d="M${mx} ${y - 5} L${mx + 5} ${y} L${mx} ${y + 5} L${mx - 5} ${y} Z"/><text x="${mx}" y="${y + 22}" text-anchor="middle">${esc(m.label)}</text></g>`; }).join('');
      return `<g class="row" data-go="${esc(f.id)}" tabindex="0" role="link" aria-label="${esc(f.question)}" style="--d:${i * 120}ms">
<line class="gone" x1="${x0}" x2="${xn}" y1="${y}" y2="${y}" pathLength="1"/>
<line class="ahead" x1="${xn}" x2="${x1 - r - 4}" y1="${y}" y2="${y}"/>
<circle class="start" cx="${x0}" cy="${y}" r="2.5"/>${ms}
${left > 0 ? (xn > 90 ? `<text class="left" x="${xn - 8}" y="${y + 20}" text-anchor="end">${ui.days(left)}</text>` : `<text class="left" x="${xn + 8}" y="${y + 20}">${ui.days(left)}</text>`) : ''}
<g class="ring" transform="translate(${x1} ${y})"><circle class="track" r="${r}"/><circle class="fill" r="${r}" stroke-dasharray="${(f.p * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90)"/></g>
<text class="lbl" x="${x1 - r - 10}" y="${y - 26}" text-anchor="end">${esc(f.short || f.topic)}</text>
<text class="pct" x="${x1 + r + 10}" y="${y + 5}">${pc(f.p, f)}</text>
<text class="dt" x="${x1 + r + 10}" y="${y + 22}">${new Date(t(f.check)).toLocaleDateString(ui.loc, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</text></g>`;
    }).join('');
    box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Timeline">
<defs><radialGradient id="tl-glow"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<line class="axis" x1="${padL}" x2="${W - padR}" y1="${rulerY}" y2="${rulerY}"/>${ticks.join('')}
<g class="now"><line x1="${nx}" x2="${nx}" y1="${rulerY}" y2="${H}"/><circle class="halo" cx="${nx}" cy="${rulerY}" r="14" fill="url(#tl-glow)"/><circle cx="${nx}" cy="${rulerY}" r="3.5"/>
<text x="${nx + 9}" y="${rulerY + 16}">${ui.today.toUpperCase()} · ${new Date(now).toLocaleDateString(ui.loc, { day: 'numeric', month: 'short' })}</text></g>${rows}</svg>`;
    // A label that would run past the picture's edge (a narrow screen, a check date close to today) is moved in.
    const fit = () => box.querySelectorAll('svg text').forEach((el) => {
      let bb; try { bb = el.getBBox(); } catch { return; }
      if (!bb.width) return;
      if (bb.x < 4) { el.setAttribute('text-anchor', 'start'); el.setAttribute('x', '4'); }
      else if (bb.x + bb.width > W - 4) { el.setAttribute('text-anchor', 'end'); el.setAttribute('x', String(W - 4)); }
    });
    fit(); document.fonts?.ready.then(fit);
    box.querySelectorAll('[data-go]').forEach((g) => {
      const go = () => { location.href = `/time?f=${encodeURIComponent(g.dataset.go)}`; };
      g.addEventListener('click', go); g.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
  };
  draw();
  let w = box.clientWidth;
  new ResizeObserver(() => { if (Math.abs(box.clientWidth - w) > 4) { w = box.clientWidth; draw(); } }).observe(box);
  const r = trackRecord(list);
  document.getElementById('tl-meta').textContent = `${r.open} ${ui.open} · ${r.resolved} ${ui.checked}${r.brier === null ? '' : ` · ${ui.brier} ${r.brier.toFixed(3)}`}`;
}

// ── scenario flows: H (left) → N (right), band width = probability ──
function flows(f) {
  const W = 760; const H = 300; const nodeW = 262; const gap = 12;
  const scale = (H - gap * (Math.max(f.scenarios.length, f.outcomes.length) - 1)) / 1;
  const stack = (items) => { let y = 0; return Object.fromEntries(items.map((it) => { const h = Math.max(26, it.p * scale); const out = [it.id, { y, h, used: 0, usedIn: 0 }]; y += h + gap; return out; })); };
  const left = stack(f.scenarios); const right = stack(f.outcomes);
  const totalH = Math.max(...Object.values(left).map((n) => n.y + n.h), ...Object.values(right).map((n) => n.y + n.h));
  // (H, N) links: the sum of the paths between them.
  const links = {};
  for (const p of f.paths) { const k = `${p.h}>${p.n}`; links[k] = (links[k] || 0) + p.p; }
  const bands = Object.entries(links).map(([k, p]) => {
    const [h, n] = k.split('>'); const a = left[h]; const b = right[n];
    const ha = (p / f.scenarios.find((s) => s.id === h).p) * a.h; const hb = (p / f.outcomes.find((o) => o.id === n).p) * b.h;
    const y0 = a.y + a.used; a.used += ha; const y1 = b.y + b.usedIn; b.usedIn += hb;
    const x0 = nodeW; const x1 = W - nodeW; const cx = (x0 + x1) / 2;
    // A thin line through the middle of the link's share of each node; its weight follows the probability.
    const ya = y0 + ha / 2; const yb = y1 + hb / 2;
    const d = `M${x0},${ya} C${cx},${ya} ${cx},${yb} ${x1},${yb}`;
    return `<path class="band" data-h="${h}" data-n="${n}" d="${d}" style="stroke-width:${(1 + p * 8).toFixed(2)}"><title>${h} → ${n}: ${pc(p, f)}</title></path>`;
  }).join('');
  const node = (it, n, side) => `<g class="node ${side} ${it.base ? 'base' : ''}" ${side === 'l' ? `data-h="${it.id}"` : `data-n="${it.id}"`}>
<rect x="${side === 'l' ? 0 : W - nodeW}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="6"/>
<text x="${(side === 'l' ? 0 : W - nodeW) + 12}" y="${n.y + 17}" class="t1">${esc(it.id)} · ${esc(side === 'l' ? it.short || it.name : `${pc(it.p, f)} · ${it.paths} ${lab(f).paths}`)}</text>
${n.h > 34 ? `<text x="${(side === 'l' ? 0 : W - nodeW) + 12}" y="${n.y + 33}" class="t2">${esc(side === 'l' ? it.note || `${num(it.p, f)} · ${it.variants} ${lab(f).variants}` : it.name)}</text>` : ''}</g>`;
  return `<svg class="flows" viewBox="0 0 ${W} ${totalH}" role="img" aria-label="${esc(lab(f).flows)}">${bands}${f.scenarios.map((s) => node(s, left[s.id], 'l')).join('')}${f.outcomes.map((o) => node(o, right[o.id], 'r')).join('')}</svg>`;
}

function card(f) {
  const l = lab(f);
  const now = Date.now();
  const span = Math.max(1, t(f.check) - t(f.published));
  const done = Math.min(1, Math.max(0, (now - t(f.published)) / span));
  const left = Math.ceil((t(f.check) - now) / DAY);
  const b = brier(f);
  const ms = (f.milestones || []).map((m) => { const at = m.date ? t(m.date) : t(`${m.month}-15`); return `<span class="tm-m" style="left:${(Math.min(1, Math.max(0, (at - t(f.published)) / span)) * 100).toFixed(1)}%">${esc(m.label)}</span>`; }).join('');
  return `<article class="tm" id="${esc(f.id)}" lang="${esc(f.lang || 'en')}" data-no-i18n>
<div class="tm-top"><span>${esc(f.topic)}</span><span>${l.conf}: ${esc(f.confidence)}</span><span class="chip ${f.status === 'happened' ? 'ok' : f.status === 'not' ? 'no' : ''}">${l.status[f.status] || l.status.open}</span>${b !== null ? `<span class="chip">Brier ${b.toFixed(3)}</span>` : ''}
${pdfIcon(f)}</div>
<h2>${esc(f.question)}</h2>
${f.resolves ? `<p class="tm-res">${esc(f.resolves)}</p>` : ''}
<div class="tm-when"><div class="tm-bar"><b style="width:${(done * 100).toFixed(1)}%"></b>${ms}</div>
<div class="tm-ends"><span>${l.today} · ${dmy(new Date(now).toISOString().slice(0, 10), f)}</span><span>${left > 0 ? l.left(left) : l.done}</span><span>${l.check} · ${dmy(f.check, f)}</span></div></div>
<div class="tm-head"><div class="tm-g">${gaugeSvg(f.p, 132)}<div class="tm-pct">${pc(f.p, f)}</div></div>
<div><span class="tm-k">${l.conclusion}</span><p class="tm-con">${esc(f.conclusion)}</p></div></div>
<div class="tm-two">
<div class="tm-box"><span class="tm-k">${esc(f.scenTitle || l.scen)}</span>
<table class="tm-scn"><thead><tr><th></th><th>${l.p}</th><th>${esc(f.chanceLabel || l.chance)}</th></tr></thead><tbody>
${f.tree ? f.tree.map((g) => `<tr class="tm-grp"><td colspan="3"><b>${esc(g.id)}</b> · ${esc(g.name)}${g.sub ? ` <span>${esc(g.sub)}</span>` : ''}</td></tr>${g.rows.map((s) => `<tr data-h="${s.id}" tabindex="0"><td class="tm-sub"><b>${esc(s.id)}</b> · ${esc(s.name)}</td><td>${num(s.p, f)}</td><td>${s.chance === null ? l.excl : pc(s.chance, f)}</td></tr>`).join('')}`).join('')
    : f.scenarios.map((s) => `<tr data-h="${s.id}" tabindex="0"><td><b>${esc(s.id)}</b> · ${esc(s.name)}</td><td>${num(s.p, f)}</td><td>${pc(s.chance, f)}</td></tr>`).join('')}
</tbody></table><p class="tm-hint">${l.pick} <button type="button" class="tm-reset" hidden>${l.reset}</button></p></div>
<div class="tm-box"><span class="tm-k">${l.signs}</span><ul class="tm-sig">${(f.signals?.up || []).map((s) => `<li class="up">▲ ${esc(s)}</li>`).join('')}${(f.signals?.down || []).map((s) => `<li class="dn">▼ ${esc(s)}</li>`).join('')}</ul></div>
</div>
<div class="tm-box"><span class="tm-k">${l.flows}</span>${flows(f)}</div>
<div class="tm-box"><span class="tm-k">${l.position}</span><p>${esc(f.position)}</p></div>
</article>`;
}

// Picking a scenario: its rows, flows, paths and «what changes» light up; the rest fade.
function interact(el) {
  const reset = el.querySelector('.tm-reset');
  if (!reset) return;
  const pick = (h) => {
    el.classList.toggle('picked', Boolean(h));
    el.querySelectorAll('[data-h]').forEach((x) => x.classList.toggle('on', Boolean(h) && x.dataset.h === h));
    if (h) { const ns = new Set([...el.querySelectorAll(`.band[data-h="${h}"]`)].map((b) => b.dataset.n)); el.querySelectorAll('.node.r').forEach((x) => x.classList.toggle('on', ns.has(x.dataset.n))); }
    reset.hidden = !h;
  };
  let cur = null;
  const toggle = (h) => { cur = cur === h ? null : h; pick(cur); };
  el.querySelectorAll('.tm-scn tr[data-h], .node.l').forEach((x) => {
    x.addEventListener('click', () => toggle(x.dataset.h));
    x.addEventListener('keydown', (e) => { if (e.key === 'Enter') toggle(x.dataset.h); });
  });
  reset.addEventListener('click', () => { cur = null; pick(null); });
}

// One row per forecast: what, the probability, the check date, the PDF; the row opens the forecast.
function row(f) {
  const l = lab(f);
  return `<div class="tm-row" lang="${esc(f.lang || 'en')}" data-no-i18n><a class="tm-open" href="/time?f=${encodeURIComponent(f.id)}">
<span class="tm-rk">${esc(f.topic)}</span>
<span class="tm-rt">${esc(f.short || f.question)}</span>
<span class="tm-rq">${esc(f.question)}</span></a>
<span class="tm-rp">${pc(f.p, f)}</span><div class="tm-foot"><span class="tm-rd">${l.check} · ${dmy(f.check, f)}</span>${pdfIcon(f)}</div></div>`;
}

(async () => {
  let all = [];
  try { all = (await (await fetch('/data/time.json', { cache: 'no-cache' })).json()).forecasts || []; } catch { /* none yet */ }
  // Each brief in the site's language: Ukrainian as written, every other language its English version.
  const inLang = (f) => (siteLang === 'uk' || !f.en ? f : { ...f, ...f.en, lang: 'en', en: undefined });
  const list = visibleForecasts(all.map(inLang), new URLSearchParams(location.search).has('drafts')).sort((a, b) => t(a.check) - t(b.check));
  const box = document.getElementById('tm-list');
  const id = new URLSearchParams(location.search).get('f');
  const one = id && list.find((f) => f.id === id || (f.aliases || []).includes(id));
  if (one) {
    // The forecast's own page: its first page, edge to edge.
    document.body.classList.add('tm-single');
    document.title = `${one.short || one.question} · TIME · Reaction Core`;
    box.innerHTML = `<a class="tm-back" href="/time">← TIME</a>${card(one)}`;
    box.querySelectorAll('.tm').forEach(interact);
    return;
  }
  if (!list.length) { document.getElementById('timeline').innerHTML = '<p class="meta">No forecasts published yet.</p>'; return; }
  timeline(list);
  box.innerHTML = list.map(row).join('');
})();
