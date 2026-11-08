// SITUATION on the public site: a dashboard workspace in the browser. Boards of widgets — indicator, trend,
// comparison, table, map, link graph, note — typed in or pasted, saved in this browser (localStorage), exported
// and imported as JSON. The data model and parsing are src/lib/dash.js.
import './site.css';
import './area.css';
import { TYPES, TEMPLATES, blankWidget, board, readState, cleanBoard, parseSeries, parseTable, parsePlaces, parseLinks, uid } from '../lib/dash.js';

const KEY = 'rc.situation.v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = (() => { try { return readState(localStorage.getItem(KEY)); } catch { return readState(null); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private window: works for this visit */ } };
const cur = () => state.boards.find((b) => b.id === state.current) || null;

// ── charts (SVG, no library) ──
const W = 400; const H = 190; const P = { l: 34, r: 10, t: 10, b: 24 };
const fmt = (v) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${+v.toPrecision(3)}`);
// Bars start at zero; a trend is drawn around its own range, so a slow index does not look flat.
function scale(vals, zero = true) {
  let lo = zero ? Math.min(0, ...vals) : Math.min(...vals); let hi = Math.max(...vals);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.08; if (lo < 0 || !zero) lo -= pad; hi += pad;
  return { lo, hi, y: (v) => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo)) };
}
const grid = (s) => [0, 0.5, 1].map((k) => { const v = s.lo + (s.hi - s.lo) * k; const y = s.y(v); return `<line class="gr" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/><text x="${P.l - 6}" y="${y + 3}" text-anchor="end">${fmt(v)}</text>`; }).join('');
const every = (n) => Math.max(1, Math.ceil(n / 6));
function lineChart(rows) {
  if (rows.length < 2) return empty('Add at least two points.');
  const s = scale(rows.map((r) => r.value), false);
  const x = (i) => P.l + (W - P.l - P.r) * (i / (rows.length - 1));
  const pts = rows.map((r, i) => `${x(i)},${s.y(r.value)}`);
  const k = every(rows.length);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend">${grid(s)}<line class="ax" x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}"/>
<path class="ar" d="M${pts.join('L')}L${x(rows.length - 1)},${s.y(s.lo)}L${x(0)},${s.y(s.lo)}Z"/><path class="ln" d="M${pts.join('L')}"/>
${rows.map((r, i) => `<circle class="pt" cx="${x(i)}" cy="${s.y(r.value)}" r="2.6"><title>${esc(r.label)}: ${r.value}</title></circle>`).join('')}
${rows.map((r, i) => ((i % k === 0 && rows.length - 1 - i >= k / 2) || i === rows.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}">${esc(r.label.slice(0, 10))}</text>` : '')).join('')}</svg>`;
}
function barChart(rows) {
  if (!rows.length) return empty('Add some values.');
  const max = Math.max(...rows.map((r) => Math.abs(r.value))) || 1;
  const rowH = 26; const h = rows.length * rowH + 8; const lw = 110;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Comparison">${rows.map((r, i) => {
    const w = (W - lw - 50) * Math.abs(r.value) / max; const y = 4 + i * rowH;
    return `<text x="${lw - 8}" y="${y + 15}" text-anchor="end">${esc(r.label.slice(0, 18))}</text><rect class="br" x="${lw}" y="${y + 5}" width="${Math.max(1, w)}" height="13" rx="2"/><text x="${lw + w + 6}" y="${y + 15}" style="fill:#ededed">${fmt(r.value)}</text>`;
  }).join('')}</svg>`;
}
function linkGraph({ nodes, edges }) {
  if (!edges.length) return empty('Add links like: A -> B');
  const n = nodes.length; const cx = W / 2; const cy = 120; const R = Math.min(95, 30 + n * 9);
  const pos = new Map(nodes.map((d, i) => [d.id, [cx + R * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), cy + R * Math.sin((2 * Math.PI * i) / n - Math.PI / 2)]]));
  const maxN = Math.max(...nodes.map((d) => d.n));
  return `<svg class="chart" viewBox="0 0 ${W} 240" role="img" aria-label="Link graph">${edges.map(([a, b]) => { const p = pos.get(a); const q = pos.get(b); return `<line class="ed" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>`; }).join('')}
${nodes.map((d) => { const [x, y] = pos.get(d.id); const r = 3 + 4 * (d.n / maxN); const right = x >= cx; return `<circle class="nd" cx="${x}" cy="${y}" r="${r}"><title>${esc(d.id)} · ${d.n} link${d.n > 1 ? 's' : ''}</title></circle><text class="lbl" x="${x + (right ? r + 5 : -r - 5)}" y="${y + 3.5}" text-anchor="${right ? 'start' : 'end'}">${esc(d.id.slice(0, 22))}</text>`; }).join('')}</svg>`;
}
const empty = (t) => `<p class="note">${esc(t)} Use ✎ to edit.</p>`;

function bodyHtml(w) {
  const d = w.data;
  if (w.type === 'kpi') {
    if (!d.value) return empty('No value yet.');
    const ch = Number(String(d.change).replace(',', '.'));
    const dir = Number.isFinite(ch) && ch !== 0 ? (ch > 0 ? 'up' : 'down') : '';
    return `<div class="kpi"><b>${esc(d.value)}<span class="u">${esc(d.unit)}</span></b>${d.change !== '' && d.change !== undefined ? `<div class="d ${dir}">${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'} ${esc(String(d.change).replace(/^\+/, ''))}</div>` : ''}${d.note ? `<p>${esc(d.note)}</p>` : ''}</div>`;
  }
  if (w.type === 'line') return lineChart(parseSeries(d.rows));
  if (w.type === 'bars') return barChart(parseSeries(d.rows));
  if (w.type === 'links') return linkGraph(parseLinks(d.rows));
  if (w.type === 'note') return d.text ? `<div class="notew">${esc(d.text)}</div>` : empty('Empty note.');
  if (w.type === 'table') {
    const t = parseTable(d.rows);
    if (!t.head.length) return empty('No table yet.');
    const isNum = (v) => /^[-+]?[\d\s.,]+[%kmbn]*$/i.test(v);
    return `<table class="tbl"><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td${isNum(c) ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  if (w.type === 'map') return `<div class="mapw" data-map="${esc(w.id)}"></div>`;
  return '';
}

// ── the map widget: MapLibre with the world borders bundled with the app, loaded only when a map is shown ──
let mapLib = null;
const maps = new Map();
async function drawMaps(b) {
  for (const [id, m] of maps) { if (!b.widgets.some((w) => w.id === id)) { m.remove(); maps.delete(id); } }
  const els = [...document.querySelectorAll('[data-map]')];
  if (!els.length) return;
  if (!mapLib) {
    const [ml, worker, topo, world] = await Promise.all([
      import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'), import('topojson-client'), import('../data/world-50m.json'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ]);
    ml.setWorkerUrl(worker.default);
    const w = world.default;
    mapLib = { ml, land: topo.feature(w, w.objects.countries), borders: topo.mesh(w, w.objects.countries, (a, c) => a !== c) };
  }
  const { ml, land, borders } = mapLib;
  for (const el of els) {
    const w = b.widgets.find((x) => x.id === el.dataset.map);
    if (!w) continue;
    maps.get(w.id)?.remove();
    const places = parsePlaces(w.data.rows);
    const map = new ml.Map({
      container: el, attributionControl: false, dragRotate: false, pitchWithRotate: false,
      style: { version: 8, sources: { land: { type: 'geojson', data: land }, borders: { type: 'geojson', data: borders } }, layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0b0b0b' } },
        { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#161616' } },
        { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': '#2e2e2e', 'line-width': 0.7 } },
      ] },
      center: [31, 49], zoom: 3.4,
    });
    maps.set(w.id, map);
    const vals = places.map((p) => p.value).filter(Number.isFinite);
    const max = Math.max(1, ...vals);
    for (const p of places) {
      const m = document.createElement('div'); m.className = 'mk';
      const r = Number.isFinite(p.value) ? 6 + 10 * (p.value / max) : 7;
      m.innerHTML = `<i style="width:${r}px;height:${r}px"></i><span>${esc(p.name)}${Number.isFinite(p.value) ? ` · ${p.value}` : ''}</span>`;
      new ml.Marker({ element: m, anchor: 'left', offset: [-r / 2, 0] }).setLngLat([p.lon, p.lat]).addTo(map);
    }
    if (places.length > 1) map.fitBounds(places.reduce((bb, p) => bb.extend([p.lon, p.lat]), new ml.LngLatBounds([places[0].lon, places[0].lat], [places[0].lon, places[0].lat])), { padding: 50, maxZoom: 7, duration: 0 });
    else if (places.length === 1) map.jumpTo({ center: [places[0].lon, places[0].lat], zoom: 6 });
  }
}

// ── the page ──
function render() {
  const pick = $('ws-pick');
  pick.innerHTML = state.boards.length ? state.boards.map((b) => `<option value="${esc(b.id)}"${b.id === state.current ? ' selected' : ''}>${esc(b.name)}</option>`).join('') : '<option>No dashboards yet</option>';
  pick.disabled = !state.boards.length;
  $('ws-rename').disabled = $('ws-del').disabled = $('ws-export').disabled = !cur();
  const b = cur();
  const el = $('ws-board');
  if (!b) {
    el.innerHTML = `<div class="ws-empty empty"><p>Start from a template, or create an empty dashboard and add widgets.</p><div class="tpl">
<button class="sbtn solid" type="button" data-tpl="country">Country</button><button class="sbtn" type="button" data-tpl="company">Company</button><button class="sbtn" type="button" data-tpl="sector">Sector</button><button class="sbtn" type="button" data-tpl="blank">Empty</button></div></div>`;
    return;
  }
  el.innerHTML = (b.sample ? '<div class="sample">Example values — replace them with your own data. This notice goes once every widget has been edited.</div>' : '')
    + (b.widgets.length ? '' : '<div class="ws-empty empty"><p>This dashboard is empty. Add a widget above.</p></div>')
    + b.widgets.map((w, i) => `<article class="w s-${w.size}" draggable="true" data-id="${esc(w.id)}">
<div class="w-h"><h3 title="Drag to move">${esc(w.title)}</h3><span class="kind">${esc(TYPES[w.type].name.toUpperCase())}</span>
<button type="button" data-act="edit" aria-label="Edit ${esc(w.title)}" title="Edit">✎</button>
<button type="button" data-act="size" aria-label="Change width" title="Width">⤢</button>
<button type="button" data-act="left" aria-label="Move earlier" title="Move earlier"${i === 0 ? ' disabled' : ''}>←</button>
<button type="button" data-act="right" aria-label="Move later" title="Move later"${i === b.widgets.length - 1 ? ' disabled' : ''}>→</button>
<button type="button" data-act="del" aria-label="Remove ${esc(w.title)}" title="Remove">✕</button></div>
<div class="w-b">${bodyHtml(w)}</div></article>`).join('');
  drawMaps(b).catch(() => { for (const m of document.querySelectorAll('[data-map]')) m.innerHTML = '<p class="note" style="padding:16px">The map could not load.</p>'; });
}
const commit = () => { save(); render(); };

// toolbar
$('ws-pick').addEventListener('change', (e) => { state.current = e.target.value; commit(); });
$('ws-new').addEventListener('click', () => {
  const name = prompt('Dashboard name', 'New dashboard'); if (!name) return;
  const b = board(name.slice(0, 80)); state.boards.push(b); state.current = b.id; commit();
});
$('ws-rename').addEventListener('click', () => { const b = cur(); const name = b && prompt('Dashboard name', b.name); if (name) { b.name = name.slice(0, 80); commit(); } });
$('ws-del').addEventListener('click', () => {
  const b = cur(); if (!b || !confirm(`Delete «${b.name}»? This cannot be undone.`)) return;
  state.boards = state.boards.filter((x) => x.id !== b.id); state.current = state.boards[0]?.id || null; commit();
});
$('ws-export').addEventListener('click', () => {
  const b = cur(); if (!b) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, boards: [b] }, null, 2)], { type: 'application/json' }));
  a.download = `situation-${b.name.replace(/[^\p{L}\d]+/gu, '-').toLowerCase()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('ws-import').addEventListener('change', async (e) => {
  const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
  if (f.size > 2e6) { alert('The file is too large.'); return; }
  const got = readState(await f.text().catch(() => ''));
  if (!got.boards.length) { alert('No dashboard found in this file.'); return; }
  for (const b of got.boards) { const nb = cleanBoard({ ...b, id: uid() }); state.boards.push(nb); state.current = nb.id; }
  commit();
});
$('ws-print').addEventListener('click', () => print());

// add widgets
$('ws-add').insertAdjacentHTML('beforeend', Object.entries(TYPES).map(([k, t]) => `<button class="sbtn" type="button" data-add="${k}">+ ${esc(t.name)}</button>`).join(''));
$('ws-add').addEventListener('click', (e) => {
  const k = e.target.closest('[data-add]')?.dataset.add; if (!k) return;
  let b = cur();
  if (!b) { b = board('My dashboard'); state.boards.push(b); state.current = b.id; }
  const w = blankWidget(k); b.widgets.push(w); commit(); edit(w);
});

// templates and widget actions
$('ws-board').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tpl]')?.dataset.tpl;
  if (t) { const b = t === 'blank' ? board('My dashboard') : TEMPLATES[t](); state.boards.push(b); state.current = b.id; commit(); return; }
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const b = cur(); const id = btn.closest('.w').dataset.id; const i = b.widgets.findIndex((w) => w.id === id); const w = b.widgets[i];
  const act = btn.dataset.act;
  if (act === 'edit') return edit(w);
  if (act === 'size') w.size = (w.size % 3) + 1;
  if (act === 'left' && i > 0) [b.widgets[i - 1], b.widgets[i]] = [b.widgets[i], b.widgets[i - 1]];
  if (act === 'right' && i < b.widgets.length - 1) [b.widgets[i + 1], b.widgets[i]] = [b.widgets[i], b.widgets[i + 1]];
  if (act === 'del') { if (!confirm(`Remove «${w.title}»?`)) return; b.widgets.splice(i, 1); }
  commit();
});

// drag to reorder
let dragId = null;
$('ws-board').addEventListener('dragstart', (e) => { const w = e.target.closest('.w'); if (!w) return; dragId = w.dataset.id; w.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; });
$('ws-board').addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.w.drag,.w.over').forEach((x) => x.classList.remove('drag', 'over')); });
$('ws-board').addEventListener('dragover', (e) => { const w = e.target.closest('.w'); if (!dragId || !w) return; e.preventDefault(); document.querySelectorAll('.w.over').forEach((x) => x.classList.remove('over')); if (w.dataset.id !== dragId) w.classList.add('over'); });
$('ws-board').addEventListener('drop', (e) => {
  const w = e.target.closest('.w'); if (!dragId || !w || w.dataset.id === dragId) return; e.preventDefault();
  const b = cur(); const from = b.widgets.findIndex((x) => x.id === dragId); const to = b.widgets.findIndex((x) => x.id === w.dataset.id);
  const [m] = b.widgets.splice(from, 1); b.widgets.splice(to, 0, m); commit();
});

// the editor
function edit(w) {
  const t = TYPES[w.type]; const d = w.data;
  const form = $('ws-form');
  form.innerHTML = `<h3>${esc(t.name)}</h3>
<label>Title<input name="title" maxlength="120" value="${esc(w.title)}"></label>
${w.type === 'kpi' ? `<div class="row"><label>Value<input name="value" value="${esc(d.value)}"></label><label>Unit<input name="unit" value="${esc(d.unit)}"></label><label>Change<input name="change" value="${esc(d.change)}" placeholder="+0.3"></label></div><label>Note<input name="note" value="${esc(d.note)}"></label>`
    : w.type === 'note' ? `<label>Text<textarea name="text">${esc(d.text)}</textarea></label>`
      : `<label>Data<textarea name="rows" spellcheck="false">${esc(d.rows)}</textarea></label><span class="hint">${esc(t.hint)} Lines starting with # are ignored.</span>`}
<div class="acts"><button class="sbtn" value="cancel" type="submit">Cancel</button><button class="sbtn solid" value="ok" type="submit">Save</button></div>`;
  const dlg = $('ws-ed');
  dlg.onclose = () => {
    if (dlg.returnValue !== 'ok') return;
    const fd = new FormData(form);
    w.title = String(fd.get('title') || t.name).slice(0, 120);
    for (const k of Object.keys(w.data)) if (fd.has(k)) w.data[k] = String(fd.get(k)).slice(0, 20000);
    w.edited = true;
    const b = cur(); if (b?.sample && b.widgets.every((x) => x.edited)) b.sample = false;
    commit();
  };
  dlg.returnValue = ''; dlg.showModal();
  form.querySelector('textarea,input:not([name="title"])')?.focus();
}

render();
