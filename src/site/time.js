// TIME on the public site: forecasts — what will happen, and when (public/data/time.json, one entry per brief).
// The first page is interactive: a timeline from today to each check date; per forecast the probability, the
// scenarios (pick one — its flows, paths and «what changes the estimate» light up), the scenario flows H → N,
// signs to watch, the position, and the method (coefficients, research, sources, every path). The brief's own PDF
// is offered for download. The forecast's text stays in the language it was written in; its labels follow it.
import './site.css';
import './area.css';
import './chrome.js';
import { gaugeSvg } from './petals.js';
import { visibleForecasts, trackRecord, brier } from '../lib/forecasts.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400000;
const t = (d) => Date.parse(`${d}T12:00:00Z`);

const L = {
  uk: { loc: 'uk-UA', today: 'Сьогодні', check: 'Перевірка', conf: 'рівень довіри', conclusion: 'Висновок', scen: 'Сценарії · рівень 1', p: 'P', chance: 'Шанс події', signs: 'Ознаки перегляду',
    flows: 'Сценарні течії', variants: 'варіанти', paths: 'шляхи', position: 'Позиція аналізу', method: 'Метод: коефіцієнти, дослідження, джерела', coef: 'Коефіцієнтна частка', level: 'Рів.', variable: 'Змінна',
    values: 'Коефіцієнти', why: 'Чому такі · дослідження', research: 'Дослідження', sources: 'Джерела', all: 'Усі варіанти', changes: 'Що змінить оцінку', pdf: 'Завантажити PDF', status: { open: 'відкритий', happened: 'сталося', not: 'не сталося' },
    left: (n) => `${n} дн. до перевірки`, done: 'перевірено', pick: 'Оберіть сценарій — підсвітяться його течії та шляхи.', reset: 'Усі сценарії' },
  en: { loc: 'en-GB', today: 'Today', check: 'Check', conf: 'confidence', conclusion: 'Conclusion', scen: 'Scenarios · level 1', p: 'P', chance: 'Chance of the event', signs: 'Signs to watch',
    flows: 'Scenario flows', variants: 'variants', paths: 'paths', position: 'Position of the analysis', method: 'Method: coefficients, research, sources', coef: 'Coefficients', level: 'Lvl', variable: 'Variable',
    values: 'Coefficients', why: 'Why · research', research: 'Research', sources: 'Sources', all: 'All variants', changes: 'What changes the estimate', pdf: 'Download PDF', status: { open: 'open', happened: 'happened', not: 'did not happen' },
    left: (n) => `${n} days to the check`, done: 'checked', pick: 'Pick a scenario — its flows and paths light up.', reset: 'All scenarios' },
};
const lab = (f) => L[f.lang] || L.en;
// The brief's PDF: a small icon that downloads it.
const PDF_SVG = '<svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true"><path d="M3 1h7l4 4v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10 1v4h4" fill="none" stroke="currentColor" stroke-width="1.2"/><text x="8" y="13.5" text-anchor="middle" font-size="4.6" font-weight="700" fill="currentColor" font-family="Inter, sans-serif">PDF</text></svg>';
const pdfIcon = (f) => (f.pdf ? `<a class="tm-pdf" href="${esc(f.pdf)}" download="${esc(f.pdf.split('/').pop())}" title="${esc(lab(f).pdf)}" aria-label="${esc(lab(f).pdf)}">${PDF_SVG}</a>` : '');
const pc = (x, f, d = 2) => `${(x * 100).toLocaleString(lab(f).loc, { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const num = (x, f) => x.toLocaleString(lab(f).loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d, f) => new Date(t(d)).toLocaleDateString(lab(f).loc, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

// ── the timeline: today, each forecast's check date, its milestones ──
function timeline(list) {
  const box = document.getElementById('timeline');
  const now = Date.now();
  const from = Math.min(now, ...list.map((f) => t(f.published))) - 7 * DAY;
  const to = Math.max(now + 30 * DAY, ...list.map((f) => t(f.check))) + 14 * DAY;
  const W = 1000;
  const x = (ms) => ((ms - from) / (to - from)) * W;
  const months = [];
  for (let d = new Date(from); d.getTime() < to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getTime());
  const rows = list.map((f, i) => {
    const y = 64 + i * 46;
    const ms = (f.milestones || []).map((m) => { const at = m.date ? t(m.date) : t(`${m.month}-15`); return `<g class="ms"><line x1="${x(at)}" x2="${x(at)}" y1="${y - 9}" y2="${y + 9}"/><title>${esc(m.label)}</title></g>`; }).join('');
    return `<g class="row" data-go="${esc(f.id)}" tabindex="0" role="link" aria-label="${esc(f.question)}">
<line class="span" x1="${x(t(f.published))}" x2="${x(t(f.check))}" y1="${y}" y2="${y}"/>
<line class="past" x1="${x(t(f.published))}" x2="${x(Math.min(now, t(f.check)))}" y1="${y}" y2="${y}"/>${ms}
<circle class="end" cx="${x(t(f.check))}" cy="${y}" r="${5 + f.p * 9}"/>
<text class="lbl" x="${x(t(f.check)) - 16 - f.p * 9}" y="${y - 12}" text-anchor="end">${esc(f.short || f.topic)} · ${pc(f.p, f)}</text></g>`;
  }).join('');
  const h = 64 + list.length * 46 + 6;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="height:${h}px" role="img" aria-label="Timeline">
${months.map((m) => `<g class="mo"><line x1="${x(m)}" x2="${x(m)}" y1="22" y2="${h}"/><text x="${x(m) + 6}" y="16">${new Date(m).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</text></g>`).join('')}
<g class="now"><line x1="${x(now)}" x2="${x(now)}" y1="22" y2="${h}"/><text x="${x(now) + 6}" y="36">today</text></g>${rows}</svg>`;
  box.querySelectorAll('[data-go]').forEach((g) => {
    const go = () => { location.href = `/time?f=${encodeURIComponent(g.dataset.go)}`; };
    g.addEventListener('click', go); g.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
  const r = trackRecord(list);
  document.getElementById('tl-meta').textContent = `${r.open} open · ${r.resolved} checked${r.brier === null ? '' : ` · mean Brier ${r.brier.toFixed(3)}`}`;
}

// ── scenario flows: H (left) → N (right), band width = probability ──
function flows(f) {
  const W = 760; const H = 300; const nodeW = 210; const gap = 12;
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
    const d = `M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1} L${x1},${y1 + hb} C${cx},${y1 + hb} ${cx},${y0 + ha} ${x0},${y0 + ha} Z`;
    return `<path class="band" data-h="${h}" data-n="${n}" d="${d}"><title>${h} → ${n}: ${pc(p, f)}</title></path>`;
  }).join('');
  const node = (it, n, side) => `<g class="node ${side} ${it.base ? 'base' : ''}" ${side === 'l' ? `data-h="${it.id}"` : `data-n="${it.id}"`}>
<rect x="${side === 'l' ? 0 : W - nodeW}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="6"/>
<text x="${(side === 'l' ? 0 : W - nodeW) + 12}" y="${n.y + 17}" class="t1">${esc(it.id)} · ${esc(side === 'l' ? it.short || it.name : `${pc(it.p, f)} · ${it.paths} ${lab(f).paths}`)}</text>
${n.h > 34 ? `<text x="${(side === 'l' ? 0 : W - nodeW) + 12}" y="${n.y + 33}" class="t2">${esc(side === 'l' ? `${num(it.p, f)} · ${it.variants} ${lab(f).variants}` : it.name)}</text>` : ''}</g>`;
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
<div class="tm-top"><span>№ ${String(f.no || '').padStart(2, '0')}</span><span>${esc(f.topic)}</span><span>${l.conf}: ${esc(f.confidence)}</span><span class="chip ${f.status === 'happened' ? 'ok' : f.status === 'not' ? 'no' : ''}">${l.status[f.status] || l.status.open}</span>${b !== null ? `<span class="chip">Brier ${b.toFixed(3)}</span>` : ''}
${pdfIcon(f)}</div>
<h2>${esc(f.question)}</h2>
${f.resolves ? `<p class="tm-res">${esc(f.resolves)}</p>` : ''}
<div class="tm-when"><div class="tm-bar"><b style="width:${(done * 100).toFixed(1)}%"></b>${ms}</div>
<div class="tm-ends"><span>${l.today} · ${dmy(new Date(now).toISOString().slice(0, 10), f)}</span><span>${left > 0 ? l.left(left) : l.done}</span><span>${l.check} · ${dmy(f.check, f)}</span></div></div>
<div class="tm-head"><div class="tm-g">${gaugeSvg(f.p, 132)}<div class="tm-pct">${pc(f.p, f)}</div></div>
<div><span class="tm-k">${l.conclusion}</span><p class="tm-con">${esc(f.conclusion)}</p></div></div>
<div class="tm-two">
<div class="tm-box"><span class="tm-k">${l.scen}</span>
<table class="tm-scn"><thead><tr><th></th><th>${l.p}</th><th>${l.chance}</th></tr></thead><tbody>
${f.scenarios.map((s) => `<tr data-h="${s.id}" tabindex="0"><td><b>${esc(s.id)}</b> · ${esc(s.name)}</td><td>${num(s.p, f)}</td><td>${pc(s.chance, f)}</td></tr>`).join('')}
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
<span class="tm-rk">№ ${String(f.no || '').padStart(2, '0')} · ${esc(f.topic)}</span>
<span class="tm-rt">${esc(f.short || f.question)}</span>
<span class="tm-rq">${esc(f.question)}</span></a>
<span class="tm-rp">${pc(f.p, f)}</span><span class="tm-rd">${l.check} · ${dmy(f.check, f)}</span>${pdfIcon(f)}</div>`;
}

(async () => {
  let all = [];
  try { all = (await (await fetch('/data/time.json', { cache: 'no-cache' })).json()).forecasts || []; } catch { /* none yet */ }
  const list = visibleForecasts(all, new URLSearchParams(location.search).has('drafts')).sort((a, b) => t(a.check) - t(b.check));
  const box = document.getElementById('tm-list');
  const id = new URLSearchParams(location.search).get('f');
  const one = id && list.find((f) => f.id === id);
  if (one) {
    // The forecast's own page: its first page, edge to edge.
    document.body.classList.add('tm-single');
    document.title = `${one.short || one.question} · TIME · Reaction`;
    box.innerHTML = `<a class="tm-back" href="/time">← TIME</a>${card(one)}`;
    box.querySelectorAll('.tm').forEach(interact);
    return;
  }
  if (!list.length) { document.getElementById('timeline').innerHTML = '<p class="meta">No forecasts published yet.</p>'; return; }
  timeline(list);
  box.innerHTML = list.map(row).join('');
})();
