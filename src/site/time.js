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

// ── the timeline. On a wide screen a field: across — when each forecast is checked, up — how probable the event
// is, so «what comes soon» and «what is likely» read at one glance. On a phone an agenda: the forecasts by check
// date, each with the days left and its probability on a 0–100% bar. Drawn at the box's real width, again on resize.
const UI = {
  en: { loc: 'en-GB', today: 'Today', open: 'open', checked: 'checked', days: (n) => `${n} ${n === 1 ? 'day' : 'days'}`, brier: 'mean Brier', likely: 'Likely', unlikely: 'Unlikely', prob: 'Probability', inDays: (d) => `in ${d}`, due: 'check' },
  de: { loc: 'de-DE', today: 'Heute', open: 'offen', checked: 'geprüft', days: (n) => `${n} ${n === 1 ? 'Tag' : 'Tagen'}`, brier: 'mittlerer Brier-Wert', likely: 'Wahrscheinlich', unlikely: 'Unwahrscheinlich', prob: 'Wahrscheinlichkeit', inDays: (d) => `in ${d}`, due: 'Prüfung' },
  fr: { loc: 'fr-FR', today: 'Aujourd’hui', open: 'ouvertes', checked: 'vérifiées', days: (n) => `${n} ${n === 1 ? 'jour' : 'jours'}`, brier: 'Brier moyen', likely: 'Probable', unlikely: 'Peu probable', prob: 'Probabilité', inDays: (d) => `dans ${d}`, due: 'vérification' },
  uk: { loc: 'uk-UA', today: 'Сьогодні', open: 'відкритих', checked: 'перевірених', days: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дні' : 'днів'}`, brier: 'середній Брайєр', likely: 'Імовірно', unlikely: 'Малоймовірно', prob: 'Імовірність', inDays: (d) => `через ${d}`, due: 'перевірка' },
};
const ui = UI[siteLang] || UI.en;
function timeline(list) {
  const box = document.getElementById('timeline');
  const short = (ms) => new Date(ms).toLocaleDateString(ui.loc, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const leftOf = (f, now) => Math.max(0, Math.ceil((t(f.check) - now) / DAY));
  const href = (f) => `/time?f=${encodeURIComponent(f.id)}`;

  // The agenda (a phone): a list by check date.
  const agenda = (now) => `<div class="ag">${list.map((f) => {
    const d = new Date(t(f.check)); const n = leftOf(f, now);
    return `<a class="ag-row" href="${href(f)}" lang="${esc(f.lang || 'en')}">
<span class="ag-date"><b>${d.getUTCDate()}</b><i>${esc(d.toLocaleDateString(ui.loc, { month: 'short', timeZone: 'UTC' }))}</i></span>
<span class="ag-what"><b>${esc(f.short || f.topic)}</b><i>${n > 0 ? esc(ui.inDays(ui.days(n))) : esc(ui.checked)}</i></span>
<span class="ag-p"><i>${esc(ui.prob)}</i><b>${pc(f.p, f)}</b></span>
<span class="ag-bar" role="img" aria-label="${esc(ui.prob)} ${pc(f.p, f)}"><u style="width:${(f.p * 100).toFixed(1)}%"></u><s></s></span>
<span class="ag-scale"><i>0%</i><i>50%</i><i>100%</i></span></a>`;
  }).join('')}</div>`;

  // The field (a wide screen).
  const field = (W, now) => {
    const from = now - 6 * DAY;
    const to = Math.max(now + 21 * DAY, ...list.map((f) => t(f.check))) + 8 * DAY;
    const padL = 48; const padR = 16; const top = 26; const bot = 300; const H = bot + 34;
    const x = (ms) => padL + ((ms - from) / (to - from)) * (W - padL - padR);
    const y = (p) => bot - p * (bot - top);
    let g = '';
    for (const v of [0, 0.25, 0.5, 0.75, 1]) g += `<line class="${v === 0.5 ? 'half' : 'grid'}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${padL - 10}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`;
    g += `<text class="mo" x="${W - padR - 8}" y="${y(1) + 15}" text-anchor="end">${esc(ui.likely.toUpperCase())}</text><text class="mo" x="${W - padR - 8}" y="${y(0) - 8}" text-anchor="end">${esc(ui.unlikely.toUpperCase())}</text>`;
    const start = new Date(from); start.setUTCHours(0, 0, 0, 0);
    for (let d = start.getTime(); d <= to; d += DAY) {
      const dt = new Date(d);
      if (dt.getUTCDate() !== 1) continue;
      g += `<line class="grid" x1="${x(d).toFixed(1)}" x2="${x(d).toFixed(1)}" y1="${top}" y2="${bot}"/><text class="mo" x="${(x(d) + 6).toFixed(1)}" y="${bot + 18}">${esc(dt.toLocaleDateString(ui.loc, { month: 'long', timeZone: 'UTC' }).toUpperCase())}${dt.getUTCMonth() === 0 ? ` ${dt.getUTCFullYear()}` : ''}</text>`;
    }
    const nx = x(now);
    g += `<g class="now"><line x1="${nx}" x2="${nx}" y1="${top}" y2="${bot}"/><circle class="halo" cx="${nx}" cy="${bot}" r="14" fill="url(#tl-glow)"/><circle cx="${nx}" cy="${bot}" r="3.5"/><text x="${nx + 9}" y="${bot + 18}">${esc(ui.today.toUpperCase())} · ${esc(short(now))}</text></g>`;
    const rows = list.map((f, i) => {
      const px = x(t(f.check)); const py = y(f.p); const n = leftOf(f, now);
      return `<a class="row" href="${href(f)}" aria-label="${esc(f.question)}" style="--d:${i * 90}ms"><line class="drop" x1="${px}" x2="${px}" y1="${py}" y2="${bot}"/><circle class="dot" cx="${px}" cy="${py}" r="8"/>
<g class="tag" data-x="${px}" data-y="${py}"><text class="lbl" x="${px + 18}" y="${py - 2}">${esc(f.short || f.topic)}</text><text class="dt" x="${px + 18}" y="${py + 15}">${pc(f.p, f)} · ${esc(short(t(f.check)))}${n > 0 ? ` · ${esc(ui.days(n))}` : ''}</text></g></a>`;
    }).join('');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Timeline">
<defs><radialGradient id="tl-glow"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>${g}${rows}</svg>`;
  };
  // Each label beside its point where it fits: to the right, else to the left, else above or below — never over
  // another label, a point or the edge.
  const place = (W) => {
    const taken = [...box.querySelectorAll('.dot')].map((c) => { const b = c.getBBox(); return { x: b.x - 4, y: b.y - 4, w: b.width + 8, h: b.height + 8 }; });
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    box.querySelectorAll('svg > .mo, .now text').forEach((el) => { const b = el.getBBox(); taken.push({ x: b.x, y: b.y, w: b.width, h: b.height }); });
    // from the latest date back: the one nearest the right edge has the fewest places to go
    [...box.querySelectorAll('.tag')].reverse().forEach((tag) => {
      const px = +tag.dataset.x; const py = +tag.dataset.y; const texts = [...tag.querySelectorAll('text')];
      const tries = [['start', 18, 0], ['end', -18, 0], ['start', 14, -30], ['end', -14, -30], ['start', 14, 30], ['end', -14, 30], ['middle', 0, -40], ['middle', 0, 44]];
      for (const [anchor, dx, dy] of tries) {
        texts.forEach((el, k) => { el.setAttribute('text-anchor', anchor); el.setAttribute('x', px + dx); el.setAttribute('y', py + dy + (k ? 15 : -2)); });
        const b = tag.getBBox(); const r = { x: b.x - 4, y: b.y - 2, w: b.width + 8, h: b.height + 4 };
        if (r.x >= 50 && r.x + r.w <= W - 2 && r.y >= 0 && r.y + r.h <= 300 && !taken.some((o) => hit(r, o))) { taken.push(r); return; }
      }
      const b = tag.getBBox(); taken.push({ x: b.x, y: b.y, w: b.width, h: b.height });
    });
  };
  const draw = () => {
    const W = Math.max(300, box.clientWidth);
    const now = Date.now();
    // On a phone the agenda's tiles are the way in: the list of tiles below would only repeat them.
    document.body.classList.toggle('tm-phone', W < 700);
    if (W < 700) { box.innerHTML = agenda(now); return; }
    box.innerHTML = field(W, now);
    place(W); document.fonts?.ready.then(() => place(W));
  };
  draw();
  let w = box.clientWidth;
  new ResizeObserver(() => { if (Math.abs(box.clientWidth - w) > 4) { w = box.clientWidth; draw(); } }).observe(box);
  const r = trackRecord(list);
  document.getElementById('tl-meta').textContent = `${r.open} ${ui.open} · ${r.resolved} ${ui.checked}${r.brier === null ? '' : ` · ${ui.brier} ${r.brier.toFixed(3)}`}`;
}

// ── scenario flows: H (left) → N (right), band width = probability ──
function flows(f) {
  // A phone gets its own drawing: narrow nodes with the words wrapped, the whole picture in the screen's width —
  // nothing to scroll sideways, the text at its real size.
  const phone = typeof window !== 'undefined' && window.innerWidth < 700;
  const W = phone ? 380 : 760; const H = 300; const nodeW = phone ? 150 : 262; const gap = phone ? 10 : 12;
  const fs = phone ? 12 : 12; const lh = 15; const pad = phone ? 10 : 12;
  const maxCh = Math.floor((nodeW - 2 * pad) / (fs * 0.5));
  const wrap = (text) => {
    if (!phone) return [text];
    const out = []; let line = '';
    for (const w of String(text).split(' ')) { const next = line ? `${line} ${w}` : w; if (next.length > maxCh && line) { out.push(line); line = w; } else line = next; }
    if (line) out.push(line);
    return out;
  };
  const words = (it, side) => ({
    t1: wrap(`${it.id} · ${side === 'l' ? it.short || it.name : `${pc(it.p, f)} · ${it.paths} ${lab(f).paths}`}`),
    t2: wrap(side === 'l' ? it.note || `${num(it.p, f)} · ${it.variants} ${lab(f).variants}` : it.name),
  });
  const scale = (H - gap * (Math.max(f.scenarios.length, f.outcomes.length) - 1)) / 1;
  const stack = (items, side) => { let y = 0; return Object.fromEntries(items.map((it) => { const w = words(it, side); const need = phone ? 10 + (w.t1.length + w.t2.length) * lh + 8 : 26; const h = Math.max(need, it.p * scale); const out = [it.id, { y, h, used: 0, usedIn: 0, w }]; y += h + gap; return out; })); };
  const left = stack(f.scenarios, 'l'); const right = stack(f.outcomes, 'r');
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
    return `<path class="band" data-h="${h}" data-n="${n}" d="${d}" style="stroke-width:${(1 + p * (phone ? 5 : 8)).toFixed(2)}"><title>${h} → ${n}: ${pc(p, f)}</title></path>`;
  }).join('');
  const node = (it, n, side) => {
    const x = (side === 'l' ? 0 : W - nodeW) + pad;
    const lines = (list, cls, from) => list.map((t, k) => `<text x="${x}" y="${n.y + from + k * lh}" class="${cls}">${esc(t)}</text>`).join('');
    const second = phone || n.h > 34;
    return `<g class="node ${side} ${it.base ? 'base' : ''}" ${side === 'l' ? `data-h="${it.id}"` : `data-n="${it.id}"`}>
<rect x="${side === 'l' ? 0 : W - nodeW}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="6"/>
${lines(n.w.t1, 't1', 17)}${second ? lines(n.w.t2, 't2', 17 + n.w.t1.length * lh + (phone ? 0 : 1)) : ''}</g>`;
  };
  return `<svg class="flows${phone ? ' is-phone' : ''}" viewBox="0 0 ${W} ${totalH}" role="img" aria-label="${esc(lab(f).flows)}">${bands}${f.scenarios.map((s) => node(s, left[s.id], 'l')).join('')}${f.outcomes.map((o) => node(o, right[o.id], 'r')).join('')}</svg>`;
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
