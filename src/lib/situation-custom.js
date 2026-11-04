// SITUATION's widget editor, as in Power BI: a widget is a source (the platform's records, a register, tasks, the
// audit log, or a table of one's own), a visual, a field to group by, a value (a count, a sum or a mean of a number
// field) and, for time charts, a date field. This file turns that choice into the numbers the charts draw.
import { VISIBLE_DIVISIONS } from '../data/seed.js';
import { registerOf, registersOf } from '../data/workspaces.js';
import { parseCoords } from '../map/coords.js';
import { ORGS_UA, factsOf } from '../data/orgs-ua.js';

// ── Outside sources: processes and companies beyond the platform's own records ─────────────────────────────────────
// World Bank indicators (open API, no key): a few that describe a country's economy and security.
export const WB_INDICATORS = [
  ['NY.GDP.MKTP.CD', 'ВВП, поточні дол. США'], ['NY.GDP.MKTP.KD.ZG', 'Зростання ВВП, %'], ['FP.CPI.TOTL.ZG', 'Інфляція, %'],
  ['SL.UEM.TOTL.ZS', 'Безробіття, %'], ['MS.MIL.XPND.GD.ZS', 'Військові видатки, % ВВП'], ['MS.MIL.XPND.CD', 'Військові видатки, дол. США'],
  ['BX.KLT.DINV.CD.WD', 'Прямі іноземні інвестиції, дол. США'], ['NE.EXP.GNFS.CD', 'Експорт, дол. США'], ['GC.DOD.TOTL.GD.ZS', 'Держборг, % ВВП'], ['SP.POP.TOTL', 'Населення'],
];
// [ISO3, the name in Ukrainian, the name in English (for the world's media)]
export const WB_COUNTRIES = [['UKR', 'Україна', 'Ukraine'], ['POL', 'Польща', 'Poland'], ['DEU', 'Німеччина', 'Germany'], ['FRA', 'Франція', 'France'], ['GBR', 'Велика Британія', 'United Kingdom'],
  ['USA', 'США', 'United States'], ['RUS', 'росія', 'Russia'], ['BLR', 'Білорусь', 'Belarus'], ['ROU', 'Румунія', 'Romania'], ['MDA', 'Молдова', 'Moldova'], ['TUR', 'Туреччина', 'Turkey'],
  ['CHN', 'Китай', 'China'], ['LTU', 'Литва', 'Lithuania'], ['LVA', 'Латвія', 'Latvia'], ['EST', 'Естонія', 'Estonia'], ['CZE', 'Чехія', 'Czech Republic'], ['SVK', 'Словаччина', 'Slovakia'],
  ['HUN', 'Угорщина', 'Hungary'], ['GEO', 'Грузія', 'Georgia'], ['KAZ', 'Казахстан', 'Kazakhstan'], ['IRN', 'Іран', 'Iran'], ['ISR', 'Ізраїль', 'Israel'], ['IND', 'Індія', 'India'], ['JPN', 'Японія', 'Japan'], ['EUU', 'Європейський Союз', 'European Union']];
export const EXTERNAL = {
  'ext:orgs': { label: 'Компанії України · 200 провідних', fields: [{ id: 'name', label: 'Компанія', type: 'text' }, { id: 'legal', label: 'Юридична назва', type: 'text' }, { id: 'code', label: 'ЄДРПОУ', type: 'text' }, { id: 'sector', label: 'Галузь', type: 'select' }, { id: 'city', label: 'Місто', type: 'select' }, { id: 'founded', label: 'Рік заснування', type: 'number' }, { id: 'owners', label: 'Власники', type: 'text' }, { id: 'website', label: 'Сайт', type: 'text' }] },
  'ext:news': { label: 'CONTEXT News · сьогоднішній випуск', fields: [{ id: 'section', label: 'Розділ', type: 'select' }, { id: 'domain', label: 'Видання', type: 'select' }, { id: 'title', label: 'Заголовок', type: 'text' }, { id: 'at', label: 'Опубліковано', type: 'date' }] },
  'ext:gpr': { label: 'Індекс геополітичного ризику (GPR)', fields: [{ id: 'date', label: 'Дата', type: 'date' }, { id: 'value', label: 'Значення', type: 'number' }] },
  'ext:gdelt-vol': { label: 'Світові медіа · обсяг згадок (GDELT)', fields: [{ id: 'date', label: 'Дата', type: 'date' }, { id: 'value', label: 'Частка згадок, %', type: 'number' }] },
  'ext:gdelt-tone': { label: 'Світові медіа · тон публікацій (GDELT)', fields: [{ id: 'date', label: 'Дата', type: 'date' }, { id: 'value', label: 'Тон', type: 'number' }] },
  'ext:gdelt-arts': { label: 'Світові медіа · статті тижня (GDELT)', fields: [{ id: 'title', label: 'Заголовок', type: 'text' }, { id: 'domain', label: 'Видання', type: 'select' }, { id: 'country', label: 'Країна видання', type: 'select' }, { id: 'language', label: 'Мова', type: 'select' }, { id: 'date', label: 'Дата', type: 'date' }] },
  'ext:prozorro': { label: 'Prozorro · закупівлі компанії як замовника', fields: [{ id: 'title', label: 'Предмет закупівлі', type: 'text' }, { id: 'status', label: 'Стан', type: 'select' }, { id: 'amount', label: 'Очікувана вартість, грн', type: 'number' }, { id: 'date', label: 'Дата', type: 'date' }, { id: 'method', label: 'Процедура', type: 'select' }, { id: 'id', label: 'Номер', type: 'text' }] },
  'ext:wb': { label: 'Світовий банк · показники країн', fields: [{ id: 'country', label: 'Країна', type: 'select' }, { id: 'date', label: 'Рік', type: 'date' }, { id: 'value', label: 'Значення', type: 'number' }] },
};
/** Where an outside source's rows are kept (`state.ext`): one key per source and its settings. */
export const extKey = (cfg) => (cfg.source === 'ext:wb' ? `wb:${cfg.ind || WB_INDICATORS[0][0]}:${(cfg.countries || ['UKR']).join(';')}`
  : cfg.source.startsWith('ext:gdelt-') ? `gd:${cfg.source.slice(10)}:${cfg.q || ''}`
    : cfg.source === 'ext:prozorro' ? `pz:${cfg.code || ''}` : cfg.source);

// ── The subject of a dashboard: what is being analysed ─────────────────────────────────────────────────────────────
// { kind: country|company|sector|topic, label, iso3?, code?, sector?, q } — `q` is the query for the world's media.
// A widget's settings may name the subject: '$iso3', '$q', '$name', '$code', '$sector' are put in when it is counted.
export function resolveCfg(cfg, subject) {
  if (!subject) return cfg;
  const map = { $iso3: subject.iso3 || '', $q: subject.q || subject.label || '', $name: subject.label || '', $code: subject.code || '', $sector: subject.sector || '' };
  const put = (v) => (typeof v === 'string' && map[v] != null ? map[v] : v);
  const out = { ...cfg };
  for (const k of Object.keys(out)) {
    if (Array.isArray(out[k])) out[k] = [...new Set(out[k].map(put).filter(Boolean))];
    else if (out[k] && typeof out[k] === 'object') out[k] = Object.fromEntries(Object.entries(out[k]).map(([a, b]) => [a, put(b)]));
    else out[k] = put(out[k]);
  }
  return out;
}
const ORG_ROWS = () => ORGS_UA.map((o) => { const f = factsOf(o.code); return { id: o.code, name: o.name, legal: o.legal, code: o.code, sector: o.sector, city: o.city, founded: +f.founded || '', owners: f.owners, website: f.website, source: o.source }; });

const DAY = 86400000;
const WEEK = 7 * DAY;
const t = (v) => { if (v == null || v === '') return 0; const s = String(v); const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s); const x = m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : Date.parse(s.length === 10 ? `${s}T12:00:00Z` : s); return Number.isFinite(x) ? x : 0; };
const num = (v) => { const x = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };

export const VISUALS = [
  ['kpi', 'Показник'], ['card', 'Картка'], ['slicer', 'Фільтр'], ['columns', 'Стовпчики'], ['lines', 'Лінії'], ['bars', 'Смуги'], ['donut', 'Кільце'], ['table', 'Таблиця'], ['map', 'Карта'], ['graph', 'Граф зв\'язків'],
];
export const MEASURES = [['count', 'Кількість'], ['sum', 'Сума'], ['avg', 'Середнє']];

/** Every source a widget can read: [{ id, label }]. A register is `reg:<div>/<col>`, a table of one's own `ds:<id>`. */
export function sourcesOf(state, me) {
  const regs = VISIBLE_DIVISIONS.flatMap((d) => registersOf(d.id).map((r) => ({ id: `reg:${d.id}/${r.id}`, label: `${d.name} · ${r.name}` })));
  const ds = (state.datasets || []).filter((x) => (x.clearance ?? 0) <= me.clearance && (x.owner === me.id || x.shared)).map((x) => ({ id: `ds:${x.id}`, label: `Мої дані · ${x.name}` }));
  const ext = Object.entries(EXTERNAL).map(([id, x]) => ({ id, label: `Зовнішні · ${x.label}` }));
  return [{ id: 'records', label: 'Усі записи платформи' }, ...regs, { id: 'tasks', label: 'Завдання' }, { id: 'audit', label: 'Журнал аудиту' }, ...ext, ...ds];
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
  if (EXTERNAL[source]) return EXTERNAL[source].fields;
  return [];
}

/** A sensible first choice for a new widget of a source. */
export function defaultCfg(source, state) {
  const f = fieldsOf(source, state);
  const group = f.find((x) => x.type === 'select' || x.type === 'user') || f.find((x) => x.type === 'text');
  const time = f.find((x) => x.type === 'date');
  if (source === 'ext:wb') return { source, visual: 'lines', group: 'country', measure: 'avg', field: 'value', time: 'date', grain: 'year', span: 'all', ind: WB_INDICATORS[0][0], countries: ['UKR', 'POL', 'DEU'] };
  if (source === 'ext:gpr') return { source, visual: 'lines', group: '', measure: 'avg', field: 'value', time: 'date', grain: 'week', span: 'board' };
  if (source === 'ext:orgs') return { source, visual: 'bars', group: 'sector', measure: 'count', field: '', time: '', span: 'all' };
  if (source === 'ext:news') return { source, visual: 'donut', group: 'section', measure: 'count', field: '', time: '', span: 'all' };
  return { source, visual: 'columns', group: group?.id || '', measure: 'count', field: '', time: time?.id || '', color: 0 };
}

/** The rows of a source a person may see, within the dashboard's filters. */
export function rowsOf(source, state, me, filters = {}, cfg = { source }) {
  let rows = baseRows(source, state, me, filters, cfg);
  // A widget bound to its subject: only the rows whose field has the subject's value (a sector, a code, a name).
  if (cfg.match?.field && !cfg.match.value) return []; // the subject lacks that field: no rows rather than all of them
  if (cfg.match?.field && cfg.match.value) {
    const v = String(cfg.match.value).toLowerCase();
    rows = rows.filter((r) => { const x = String(r[cfg.match.field] ?? '').toLowerCase(); return cfg.match.exact ? x === v : x.includes(v); });
  }
  // The dashboard's cross-filter: a value picked on any chart narrows every widget whose source has that field.
  const sel = (filters.sel || []).filter((x) => fieldsOf(source, state).some((f) => f.id === x.field));
  return sel.length ? rows.filter((r) => sel.every((x) => String(r[x.field] ?? '') === String(x.value))) : rows;
}
function baseRows(source, state, me, filters, cfg) {
  const see = (x) => (x.clearance ?? 0) <= me.clearance;
  if (source === 'ext:orgs') return ORG_ROWS();
  if (EXTERNAL[source]) return state.ext?.[extKey(cfg)] || [];
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
  // A slicer is not narrowed by its own field, so the other values stay to pick from (as in Power BI).
  const own = cfg.visual === 'slicer' ? { ...filters, sel: (filters.sel || []).filter((x) => x.field !== cfg.group) } : filters;
  const rows = rowsOf(cfg.source, state, me, own, cfg);
  const at = (r) => t(r[cfg.time]);
  const group = F(cfg.group);
  // Time buckets: 12 weeks or 12 months to now; years — every year the source has (the last 20).
  const grain = cfg.grain || 'week';
  const years = grain === 'year' ? [...new Set(rows.map((r) => new Date(at(r)).getUTCFullYear()).filter((y) => y > 1900))].sort().slice(-20) : [];
  const n = grain === 'year' ? years.length : 12;
  const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
  const span = (i) => {
    if (grain === 'year') return [Date.UTC(years[i], 0, 1), Date.UTC(years[i] + 1, 0, 1)];
    if (grain === 'month') { const d = new Date(now); const m = d.getUTCMonth() - (11 - i); return [Date.UTC(d.getUTCFullYear(), m, 1), Date.UTC(d.getUTCFullYear(), m + 1, 1)]; }
    const hi = now - (11 - i) * WEEK; return [hi - WEEK, hi];
  };
  const labels = Array.from({ length: n }, (_, i) => (grain === 'year' ? String(years[i]) : grain === 'month' ? MONTHS[new Date(span(i)[0]).getUTCMonth()] : i === 11 ? 'Цей' : `Т-${11 - i}`));
  const byWeek = (rs) => Array.from({ length: n }, (_, i) => { const [lo, hi] = span(i); return measureOf(rs.filter((r) => { const v = at(r); return v >= lo && v < hi; }), cfg); });
  const inPeriod = (r) => !time || cfg.span === 'all' || (at(r) > from && at(r) <= now);

  // Bound to a field the subject does not have (a company outside the register: no sector): nothing, and why.
  if (cfg.match?.field && !cfg.match.value && cfg.visual !== 'card') return { empty: true, note: cfg.match.field === 'sector' ? 'Вкажіть галузь об’єкта («Змінити об’єкт»), щоб побачити компанії галузі.' : 'Об’єкту бракує даних для цього віджета («Змінити об’єкт»).' };
  if (!rows.length && EXTERNAL[cfg.source] && cfg.visual !== 'card') return { empty: true, note: 'Даних від джерела ще немає (воно відповідає за кілька секунд або не знайшло нічого за запитом).' };
  switch (cfg.visual) {
    case 'kpi': {
      // A yearly series: its latest year against the year before.
      if (grain === 'year' && time) {
        const ys = [...new Set(rows.map((r) => new Date(at(r)).getUTCFullYear()))].sort();
        const of = (y) => measureOf(rows.filter((r) => new Date(at(r)).getUTCFullYear() === y), cfg);
        const [y, y0] = [ys.at(-1), ys.at(-2)];
        if (y == null) return { value: '—', note: 'даних немає' };
        const value = of(y);
        return { value: Math.round(value * 10) / 10, ...(y0 != null ? { delta: Math.round((value - of(y0)) * 10) / 10 } : {}), note: `${y} рік${y0 != null ? ` · ${y0}: ${Math.round(of(y0) * 10) / 10}` : ''}`, spark: ys.slice(-12).map(of) };
      }
      const cur = rows.filter(inPeriod);
      const prev = time && cfg.span !== 'all' ? rows.filter((r) => at(r) > from - days * DAY && at(r) <= from) : null;
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
      // A yearly series (the World Bank) compares the latest year each one has, not the mean of all years.
      const last = grain === 'year' && time ? Math.max(0, ...rows.map((r) => new Date(at(r)).getUTCFullYear())) : 0;
      const gs = groups(rows.filter(inPeriod).filter((r) => !last || new Date(at(r)).getUTCFullYear() === last), group, state, cfg.visual === 'donut' ? 5 : 10);
      const out = gs.map((g) => ({ id: g.id, label: g.label, value: measureOf(g.rows, cfg) }));
      // The largest first («Інші» last); a division keeps its own place, as its colour does.
      if (group.id !== 'div') out.sort((a, b) => (a.id === '__other') - (b.id === '__other') || b.value - a.value);
      return { rows: out };
    }
    case 'table': {
      const shown = rows.filter(inPeriod);
      if (group) {
        const gs = groups(shown, group, state, 20);
        const out = gs.map((g) => ({ id: g.id, cells: [g.label, measureOf(g.rows, cfg)] })).sort((a, b) => b.cells[1] - a.cells[1]);
        return { cols: [group.label, MEASURES.find((m) => m[0] === cfg.measure)?.[1] || 'Кількість'], rows: out, bars: 1 };
      }
      const cols = fields.filter((f) => f.type !== 'links' && f.type !== 'coords').slice(0, 5);
      return { cols: cols.map((f) => f.label), rows: shown.slice(0, 20).map((r, i) => ({ id: r.id || String(i), cells: cols.map((f) => labelOf(f, r[f.id], state)), to: r.div && r.col ? { div: r.div, id: `${r.col}:${r.id}` } : null, href: /^https:\/\//.test(r.url || '') ? r.url : '' })) };
    }
    case 'card': {
      const r = rows[0];
      // Not in the register of leading companies: what is known of it (the name, the code, the sector) and where to read the rest.
      if (!r) {
        const items = Object.entries(cfg.fallback || {}).filter(([, v]) => v).map(([label, value]) => ({ label, value }));
        const code = cfg.fallback?.['ЄДРПОУ'];
        return { items, url: code ? `https://opendatabot.ua/c/${code}` : '', note: 'Компанії немає в довіднику 200 провідних. Повні дані — в реєстрі за кодом ЄДРПОУ.', outside: true };
      }
      return { items: fields.filter((f) => r[f.id] != null && r[f.id] !== '').map((f) => ({ label: f.label, value: labelOf(f, r[f.id], state) })), url: r.url || r.source || '' };
    }
    case 'slicer': {
      if (!group) return { rows: [] };
      return { field: group.id, fieldLabel: group.label, rows: groups(rows.filter(inPeriod), group, state, 30).filter((g) => g.id !== '__other').map((g) => ({ id: g.id, label: g.label, value: g.rows.length })) };
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

/** The rows behind a widget, for «Показати дані» and the CSV download: [{ label → value }] with readable values. */
export function drillRows(cfg, state, me, filters = {}, now = Date.now()) {
  const fields = fieldsOf(cfg.source, state).filter((f) => f.type !== 'links');
  const time = fields.find((f) => f.id === cfg.time);
  const from = now - (filters.days || 30) * DAY;
  const rows = rowsOf(cfg.source, state, me, filters, cfg).filter((r) => !time || cfg.span === 'all' || (t(r[cfg.time]) > from && t(r[cfg.time]) <= now));
  return { cols: fields.map((f) => f.label), rows: rows.slice(0, 2000).map((r) => fields.map((f) => (f.type === 'coords' && r[f.id] && typeof r[f.id] === 'object' ? `${r[f.id].lat}, ${r[f.id].lon}` : labelOf(f, r[f.id], state)))), total: rows.length };
}
export const toCsv = ({ cols, rows }) => [cols, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
