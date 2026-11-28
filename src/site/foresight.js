// The open Foresight page (/foresight): studies that look years ahead — the drivers, several plausible futures and
// the signposts that show which one is arriving (public/data/foresight.json). Free and in full, no sign-in.
// A study's text stays in the language it was written in (data-no-i18n); the page around it is translated.
import './site.css';
import './area.css';
import './chrome.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const L = {
  uk: { loc: 'uk-UA', horizon: 'Горизонт', published: 'Опубліковано', revised: 'Переглянуто', drivers: 'Рушії', certain: 'визначений', open: 'невизначений', scenarios: 'Сценарії', signs: 'Ознаки', impl: 'Що це означає' },
  en: { loc: 'en-GB', horizon: 'Horizon', published: 'Published', revised: 'Revised', drivers: 'Drivers', certain: 'certain', open: 'uncertain', scenarios: 'Scenarios', signs: 'Signposts', impl: 'What it means' },
};
const lab = (s) => L[s.lang] || L.en;
const day = (d, s) => { const t = Date.parse(`${d}T12:00:00Z`); return Number.isNaN(t) ? esc(d) : new Date(t).toLocaleDateString(lab(s).loc, { day: 'numeric', month: 'long', year: 'numeric' }); };
const LETTERS = 'ABCDEFGH';

/** One study as an article: the question, the drivers, the scenarios with their signposts, what it means. */
export function studyHtml(s) {
  const l = lab(s);
  const drivers = (s.drivers || []).map((d) => `<li><b>${esc(d.name)}</b><span class="fs-dk">${d.certain ? l.certain : l.open}</span>${d.note ? `<p>${esc(d.note)}</p>` : ''}</li>`).join('');
  const scen = (s.scenarios || []).map((c, i) => `<div class="fs-sc"><span class="fs-sl">${LETTERS[i] || i + 1}</span><b>${esc(c.name)}</b><p>${esc(c.summary)}</p>${
    (c.signposts || []).length ? `<span class="fs-sk">${l.signs}</span><ul>${c.signposts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`).join('');
  return `<article class="fs-study" id="${esc(s.id)}" lang="${esc(s.lang || 'en')}" data-no-i18n>
<div class="fs-sh"><span>${l.horizon} · ${esc(s.horizon)}</span><span>${l.published} ${day(s.published, s)}${s.revised ? ` · ${l.revised} ${day(s.revised, s)}` : ''}</span></div>
<h3>${esc(s.title)}</h3>${s.question ? `<p class="fs-q">${esc(s.question)}</p>` : ''}
${drivers ? `<span class="fs-sk">${l.drivers}</span><ul class="fs-drv">${drivers}</ul>` : ''}
${scen ? `<span class="fs-sk">${l.scenarios}</span><div class="fs-scs">${scen}</div>` : ''}
${s.implications ? `<span class="fs-sk">${l.impl}</span><p>${esc(s.implications)}</p>` : ''}
</article>`;
}

/** The honest state before the first study: what will be here, and where to go meanwhile. */
const EMPTY = `<div class="fs-empty"><b>The first studies are in preparation.</b><p>They will be published here, each with its drivers, scenarios and signposts.</p><div class="fs-empty-a"><a class="lnk" href="/forecasts">Meanwhile — the forecasts <span class="ar">→</span></a><a class="lnk" href="/contact">Suggest a topic <span class="ar">→</span></a></div></div>`;

async function main() {
  const box = document.getElementById('fs-list');
  if (!box) return;
  let studies = [];
  try { studies = (await (await fetch('/data/foresight.json', { cache: 'no-cache' })).json()).studies || []; } catch { /* none yet */ }
  studies = studies.filter((s) => s && s.id && s.title).sort((a, b) => String(b.revised || b.published).localeCompare(String(a.revised || a.published)));
  box.innerHTML = studies.length ? studies.map(studyHtml).join('') : EMPTY;
  const meta = document.getElementById('fs-meta');
  if (meta) meta.textContent = studies.length ? String(studies.length) : '';
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
main();
