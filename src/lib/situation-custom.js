// SITUATION's widget editor, as in Power BI: a widget is a source (the platform's records, a register, tasks, the
// audit log, or a table of one's own), a visual, a field to group by, a value (a count, a sum or a mean of a number
// field) and, for time charts, a date field. This file turns that choice into the numbers the charts draw.
import { VISIBLE_DIVISIONS } from '../data/seed.js';
import { registerOf, registersOf } from '../data/workspaces.js';
import { parseCoords } from '../map/coords.js';

const DAY = 86400000;
const WEEK = 7 * DAY;
const t = (v) => { if (v == null || v === '') return 0; const s = String(v); const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s); const x = m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : Date.parse(s.length === 10 ? `${s}T12:00:00Z` : s); return Number.isFinite(x) ? x : 0; };
const num = (v) => { const x = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };

export const VISUALS = [
  ['kpi', 'Показник'], ['columns', 'Стовпчики'], ['lines', 'Лінії'], ['bars', 'Смуги'], ['donut', 'Кільце'], ['table', 'Таблиця'], ['map', 'Карта'], ['graph', 'Граф зв\'язків'],
];
export const MEASURES = [['count', 'Кількість'], ['sum', 'Сума'], ['avg', 'Середнє']];

/** Every source a widget can read: [{ id, label }]. A register is `reg:<div>/<col>`, a table of one's own `ds:<id>`. */
export function sourcesOf(state, me) {
  const regs = VISIBLE_DIVISIONS.flatMap((d) => registersOf(d.id).map((r) => ({ id: `reg:${d.id}/${r.id}`, label: `${d.name} · ${r.name}` })));
  const ds = (state.datasets || []).filter((x) => (x.clearance ?? 0) <= me.clearance && (x.owner === me.id || x.shared)).map((x) => ({ id: `ds:${x.id}`, label: `Мої дані · ${x.name}` }));
  return [{ id: 'records', label: 'Усі записи платформи' }, ...regs, { id: 'tasks', label: 'Завдання' }, { id: 'audit', label: 'Журнал аудиту' }, ...ds];
}

/** The fields of a source: [{ id, label, type: text|select|user|date|number|coords|links|ref }]. */
export function fieldsOf(source, state) {
  if (source === 'records') return [{ id: 'div', label: 'Напрям', type: 'select' }, { id: 'col', label: 'Реєстр', type: 'select' }, { id: 'stage', label: 'Етап', type: 'select' }, { id: 'owner', label: 'Автор', type: 'user' }, { id: 'at', label: 'Створено', type: 'date' }, { id: 'updated', label: 'Змінено', type: 'date' }];
  if (source === 'tasks') return [{ id: 'status', label: 'Стан', type: 'select' }, { id: 'assignee', label: 'Виконавець', type: 'user' }, { id: 'author', label: 'Хто доручив', type: 'user' }, { id: 'at', label: 'Поставлено', type: 'date' }, { id: 'due', label: 'Термін', type: 'date' }, { id: 'updated', label: 'Змінено', type: 'date' }];
  if (source === 'audit') return [{ id: 'type', label: 'Вид дії', type: 'select' }, { id: 'actor', label: 'Хто', type: 'user' }, { id: 'at', label: 'Коли', type: 'date' }];
  if (source.startsWith('reg:')) {
    const [div, col] = source.slice(4).split('/');
    const reg = registerOf(div, col);
    const own = (reg?.fields || []).filter((f) => ['text', 'select', 'user', 'date', 'number', 'percent', 'coords', 'links', 'ref'].includes(f.type))
      .map((f) => ({ id: f.id, label: f.label, type: f.type === 'percent' ? 'number' : f.type }));
    return [...(reg?.stages ? [{ id: 'stage', label: 'Етап', type: 'select' }] : []), ...own, { id: 'owner', label: 'Автор', type: 'user' }, { id: 'at', label: 'Створено', type: 'date' }, { id: 'updated', label: 'Змінено', type: 'date' }];
  }
  if (source.startsWith('ds:')) return (state.datasets || []).find((x) => `ds:${x.id}` === source)?.columns || [];
  return [];
}

/** A sensible first choice for a new widget of a source. */
export function defaultCfg(source, state) {
  const f = fieldsOf(source, state);
  const group = f.find((x) => x.type === 'select' || x.type === 'user') || f.find((x) => x.type === 'text');
  const time = f.find((x) => x.type === 'date');
  return { source, visual: 'columns', group: group?.id || '', measure: 'count', field: '', time: time?.id || '', color: 0 };
}

/** The rows of a source a person may see, within the dashboard's filters. */
export function rowsOf(source, state, me, filters = {}) {
  const see = (x) => (x.clearance ?? 0) <= me.clearance;
  if (source === 'records') return (state.records || []).filter((r) => see(r) && (!filters.div || r.div === filters.div) && VISIBLE_DIVISIONS.some((d) => d.id === r.div));
  if (source.startsWith('reg:')) { const [div, col] = source.slice(4).split('/'); return (state.records || []).filter((r) => see(r) && r.div === div && r.col === col); }
  if (source === 'tasks') return (state.tasks || []).filter(see);
  if (source === 'audit') return (state.audit || []).filter(see);
  if (source.startsWith('ds:')) { const d = (state.datasets || []).find((x) => `ds:${x.id}` === source); return d && see(d) ? d.rows || [] : []; }
  return [];
}

/** How a value of a field reads: a person's name, a division's name, a date, as it is. */
export function labelOf(field, v, state) {
  if (v == null || v === '') return '—';
  if (field?.type === 'user') return (state.users || []).find((u) => u.id === v)?.name || String(v);
  if (field?.id === 'div') return VISIBLE_DIVISIONS.find((d) => d.id === v)?.name || v;
  if (field?.id === 'status') return v === 'done' ? 'Виконано' : v === 'open' ? 'Відкрито' : v;
  if (Array.isArray(v)) return `${v.length}`;
  return String(v);
}

const measureOf = (rows, cfg) => {
  if (cfg.measure === 'count' || !cfg.field) return rows.length;
  const vals = rows.map((r) => num(r[cfg.field])).filter((x) => x != null);
  if (!vals.length) return 0;
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.round((cfg.measure === 'avg' ? sum / vals.length : sum) * 100) / 100;
};

/** Groups by a field: [{ id, label, rows }], the largest first; past `top` the rest fold into «Інші». */
function groups(rows, field, state, top = 5) {
  const by = new Map();
  for (const r of rows) { const k = String(r[field.id] ?? ''); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  // A division keeps its own place (and so its colour) whatever its size; anything else, the largest first.
  const order = (id) => VISIBLE_DIVISIONS.findIndex((d) => d.id === id);
  const list = [...by].map(([k, rs]) => ({ id: k || '—', label: labelOf(field, k, state), rows: rs }))
    .sort((a, b) => (field.id === 'div' ? order(a.id) - order(b.id) : b.rows.length - a.rows.length));
  if (list.length <= top) return list;
  const rest = list.slice(top - 1);
  return [...list.slice(0, top - 1), { id: '__other', label: 'Інші', rows: rest.flatMap((x) => x.rows) }];
}

/** A widget's numbers from its choice. The same shapes as the built-in widgets (src/lib/situation.js). */
export function computeCustom(cfg, state, me, filters = {}, now = Date.now()) {
  const fields = fieldsOf(cfg.source, state);
  const F = (id) => fields.find((f) => f.id === id);
  const days = filters.days || 30;
  const from = now - days * DAY;
  const time = F(cfg.time);
  let rows = rowsOf(cfg.source, state, me, filters);
  const at = (r) => t(r[cfg.time]);
  const group = F(cfg.group);
  const weeks = 12;
  const labels = Array.from({ length: weeks }, (_, i) => (i === weeks - 1 ? 'Цей' : `Т-${weeks - 1 - i}`));
  const byWeek = (rs) => Array.from({ length: weeks }, (_, i) => { const hi = now - (weeks - 1 - i) * WEEK; return measureOf(rs.filter((r) => { const v = at(r); return v <= hi && v > hi - WEEK; }), cfg); });
  const inPeriod = (r) => !time || (at(r) > from && at(r) <= now);

  switch (cfg.visual) {
    case 'kpi': {
      const cur = rows.filter(inPeriod);
      const prev = time ? rows.filter((r) => at(r) > from - days * DAY && at(r) <= from) : null;
      const value = measureOf(cur, cfg);
      return { value, ...(prev ? { delta: Math.round((value - measureOf(prev, cfg)) * 100) / 100, note: `попередній період: ${measureOf(prev, cfg)}`, spark: byWeek(rows) } : { note: 'усього' }) };
    }
    case 'columns':
    case 'lines': {
      if (!time) return { labels, series: [], note: 'Оберіть поле дати' };
      const gs = group ? groups(rows, group, state) : [{ label: 'Усі', rows }];
      return { labels, series: gs.map((g) => ({ label: g.label, data: byWeek(g.rows) })) };
    }
    case 'bars':
    case 'donut': {
      if (!group) return { rows: [] };
      const gs = groups(rows.filter(inPeriod), group, state, cfg.visual === 'donut' ? 5 : 10);
      return { rows: gs.map((g) => ({ id: g.id, label: g.label, value: measureOf(g.rows, cfg) })).sort((a, b) => b.value - a.value) };
    }
    case 'table': {
      const shown = rows.filter(inPeriod);
      if (group) {
        const gs = groups(shown, group, state, 20);
        const out = gs.map((g) => ({ id: g.id, cells: [g.label, measureOf(g.rows, cfg)] })).sort((a, b) => b.cells[1] - a.cells[1]);
        return { cols: [group.label, MEASURES.find((m) => m[0] === cfg.measure)?.[1] || 'Кількість'], rows: out, bars: 1 };
      }
      const cols = fields.filter((f) => f.type !== 'links' && f.type !== 'coords').slice(0, 5);
      return { cols: cols.map((f) => f.label), rows: shown.slice(0, 20).map((r, i) => ({ id: r.id || String(i), cells: cols.map((f) => labelOf(f, r[f.id], state)), to: r.div && r.col ? { div: r.div, id: `${r.col}:${r.id}` } : null })) };
    }
    case 'map': {
      // Points: a coords field of a register, or lat / lon columns of a table of one's own.
      const coords = fields.find((f) => f.type === 'coords');
      const lat = fields.find((f) => /^(lat|latitude|широта)$/i.test(f.label) || /^(lat|latitude)$/i.test(f.id));
      const lon = fields.find((f) => /^(lon|lng|long|longitude|довгота)$/i.test(f.label) || /^(lon|lng|longitude)$/i.test(f.id));
      const name = fields.find((f) => f.type === 'text') || fields[0];
      // A record of any register: its own coordinates field, whichever it is.
      const recCoords = (r) => { const f = (registerOf(r.div, r.col)?.fields || []).find((x) => x.type === 'coords' && r[x.id]); return f ? r[f.id] : null; };
      const pick = (v) => (typeof v === 'string' ? parseCoords(v) : v);
      const points = rows.filter(inPeriod).map((r) => {
        const p = coords ? pick(r[coords.id]) : lat && lon ? { lat: num(r[lat.id]), lon: num(r[lon.id]) } : r.div && r.col ? pick(recCoords(r)) : null;
        if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
        return { lat: p.lat, lon: p.lon, name: name ? labelOf(name, r[name.id], state) : '', group: group ? labelOf(group, r[group.id], state) : '', to: r.div && r.col ? { div: r.div, id: `${r.col}:${r.id}` } : null };
      }).filter(Boolean);
      return { points, note: points.length ? '' : 'Точок немає: потрібне поле координат у записах або стовпці lat / lon у ваших даних.' };
    }
    case 'graph': return graphOf(rows.filter(inPeriod), fields, state, me);
    default: return null;
  }
}

/** Records and the records their link fields point to: nodes and edges for the link chart. */
export function graphOf(rows, fields, state, me) {
  const all = new Map((state.records || []).filter((r) => (r.clearance ?? 0) <= me.clearance).map((r) => [r.id, r]));
  const title = (r) => { const reg = registerOf(r.div, r.col); return String((reg && r[reg.title]) || r.title || r.name || r.statement || 'Без назви'); };
  const nodes = new Map();
  const edges = [];
  const add = (r) => { if (!nodes.has(r.id)) nodes.set(r.id, { id: r.id, label: title(r), div: r.div, to: { div: r.div, id: `${r.col}:${r.id}` } }); };
  for (const r of rows.slice(0, 200)) {
    const reg = registerOf(r.div, r.col);
    for (const f of reg?.fields || []) {
      if (f.type !== 'links' && f.type !== 'ref') continue;
      const ids = Array.isArray(r[f.id]) ? r[f.id] : r[f.id] ? [r[f.id]] : [];
      for (const raw of ids) {
        const id = typeof raw === 'string' ? raw.split(':').pop() : raw?.id;
        const o = all.get(id);
        if (!o) continue;
        add(r); add(o);
        edges.push({ a: r.id, b: o.id, label: f.label });
      }
    }
  }
  return { nodes: [...nodes.values()], edges, note: edges.length ? '' : 'Зв\'язків між записами джерела немає (поля «Підстави», посилання на інші записи).' };
}

/** A table of one's own from a CSV / Excel head and rows: columns with their types guessed from the values. */
export function datasetFrom(name, head, rows, me) {
  const ids = head.map((h, i) => `c${i}`);
  const sample = (i) => rows.slice(0, 200).map((r) => String(r[i] ?? '').trim()).filter(Boolean);
  const type = (i) => {
    const v = sample(i);
    if (!v.length) return 'text';
    if (v.every((x) => /^(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})/.test(x) && t(x))) return 'date';
    if (v.every((x) => num(x) != null && /^[-+\d\s.,]+$/.test(x))) return 'number';
    return new Set(v).size <= Math.max(12, v.length / 4) ? 'select' : 'text';
  };
  const columns = head.map((h, i) => ({ id: ids[i], label: h || `Стовпець ${i + 1}`, type: type(i) }));
  const now = new Date().toISOString();
  return {
    id: `ds-${Date.now().toString(36)}`, name, owner: me.id, shared: false, clearance: 0, at: now, updated: now, columns,
    rows: rows.slice(0, 2000).map((r, k) => Object.fromEntries([['id', `r${k}`], ...ids.map((id, i) => [id, r[i] ?? ''])])),
  };
}
